import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { decodeClientMessage, encode, type ClientMessage, type ServerMessage } from "../../shared/messages.ts";
import { runAgent } from "./agent.ts";
import { configFromDb, loadConfigFromJson, type DuckyConfig } from "./config.ts";
import { openDb, readProjects, readSettings, writeProjects, writeSettings } from "./db.ts";
import { findRepoInText, listRepos, resolveProject } from "./projects.ts";
import { runSetup } from "./setup.ts";
import { chooseDefaults, detectReposRoot, readLegacyConfig } from "./setup-defaults.ts";

type AskMessage = Extract<ClientMessage, { type: "ask" }>;
type ConfirmationResponse = Extract<ClientMessage, { type: "confirmation-response" }>;

interface PendingConfirmation {
  questionId: string;
  // Kept so setup can say the same thing again to a widget that was not listening the first time.
  request: ServerMessage;
  resolve: (response: ConfirmationResponse | undefined) => void;
}

// When DUCKY_CONFIG is set (dev/testing) we skip the database entirely.
const db = process.env.DUCKY_CONFIG ? null : openDb();

let config: DuckyConfig | null = process.env.DUCKY_CONFIG ? loadConfigFromJson() : (db ? configFromDb(readSettings(db)!) : null);
// If DB had no settings, config is null and we'll start the setup flow.
if (db && !readSettings(db)) {
  config = null;
}

const runningQuestions = new Map<string, AbortController>();
const pendingConfirmations = new Map<string, PendingConfirmation>();

// Keeps the last successful session ID per project so follow-up questions
// continue the same conversation. Cleared by a "new-session" message.
// Lives only for this sidecar process — a restart starts fresh automatically.
const sessionByProject = new Map<string, string>();

// The repo that was last confirmed by the user. Used as the default when a
// follow-up question doesn't name a repo explicitly. Cleared with new-session.
let currentRepo: string | undefined;

// A single pending free-text setup response. Only one setup prompt is in
// flight at a time, so a single slot is sufficient.
let pendingSetupResolve: ((value: string | null) => void) | undefined;
let pendingSetupPrompt: ServerMessage | undefined;
let setupInProgress = false;

// stdout carries protocol messages only. Log to stderr.
function send(message: ServerMessage) {
  process.stdout.write(encode(message));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Returns the list of known repo names, preferring the DB projects table. */
function getRepos(): string[] {
  if (db) {
    const projects = readProjects(db);
    if (projects.length > 0) {
      return projects.map((p) => p.name);
    }
  }
  if (config?.reposRoot) {
    return listRepos(config.reposRoot);
  }
  return [];
}

function pickRepo(question: string, project: string | undefined, repos: string[]): { repo: string } | { options: string[] } {
  if (project) {
    const match = resolveProject(project, repos);
    if (match.status === "found") {
      return { repo: match.name };
    }
    return { options: match.status === "ambiguous" ? match.matches : match.known };
  }

  const match = findRepoInText(question, repos);
  return match.status === "found" ? { repo: match.name } : { options: match.options };
}

// Anything unanswered for this long is denied. The environment variable lets tests use a short wait.
const CONFIRMATION_TIMEOUT_MS = Number(process.env.DUCKY_CONFIRMATION_TIMEOUT_MS) || 30_000;
// Setup asks for things that take a while to find (an inference profile ARN, a folder path), so it waits longer.
const SETUP_TIMEOUT_MS = Number(process.env.DUCKY_SETUP_TIMEOUT_MS) || 5 * 60_000;

function describeDecision(response: ConfirmationResponse | undefined): string {
  if (!response) {
    return "cancelled";
  }
  if (!response.approved) {
    return "denied";
  }
  return response.choice ? `chose ${response.choice}` : "approved";
}

// Every decision is logged. stderr, never stdout: stdout carries the protocol.
function logDecision(summary: string, decision: string) {
  console.error(`[confirmation] ${decision}: ${summary}`);
}

function askUser(questionId: string, summary: string, options: string[], timeoutMs = CONFIRMATION_TIMEOUT_MS) {
  const confirmationId = randomUUID();
  const request: ServerMessage = { type: "confirmation-request", id: questionId, confirmationId, summary, options };
  send(request);
  return new Promise<ConfirmationResponse | undefined>((resolve) => {
    const timer = setTimeout(() => {
      pendingConfirmations.delete(confirmationId);
      logDecision(summary, "timed out, denied");
      send({ type: "confirmation-expired", id: questionId, confirmationId });
      resolve(undefined);
    }, timeoutMs);

    pendingConfirmations.set(confirmationId, {
      questionId,
      request,
      resolve: (response) => {
        clearTimeout(timer);
        logDecision(summary, describeDecision(response));
        resolve(response);
      },
    });
  });
}

// onConfirm for runAgent: asks the user, returns true if approved, false on deny or timeout.
function makeOnConfirm(questionId: string) {
  return async (summary: string): Promise<boolean> => {
    const response = await askUser(questionId, summary, []);
    return response?.approved === true;
  };
}

// Returns the repo to run in, or undefined when the user cancelled.
async function chooseRepo(id: string, question: string, project: string | undefined): Promise<string | undefined> {
  const repos = getRepos();
  const choice = pickRepo(question, project, repos);
  if ("repo" in choice) {
    return choice.repo;
  }

  // Fall back to the last confirmed repo so follow-up questions don't re-ask.
  if (currentRepo && !project && choice.options.includes(currentRepo)) {
    return currentRepo;
  }

  const response = await askUser(id, "Which repo do you mean?", choice.options);
  const picked = response?.choice;
  return response?.approved && picked && choice.options.includes(picked) ? picked : undefined;
}

async function handleAsk({ id, question, project }: AskMessage) {
  const abortController = new AbortController();
  runningQuestions.set(id, abortController);

  try {
    const repo = await chooseRepo(id, question, project);
    if (!repo) {
      send({ type: "cancelled", id });
      return;
    }

    // Only now is Ducky actually working; until here it may have been waiting for the user.
    send({ type: "status", id, state: "working" });
    const result = await runAgent(config!, repo, question, abortController, makeOnConfirm(id), sessionByProject.get(repo));
    if (abortController.signal.aborted) {
      send({ type: "cancelled", id });
    } else if (result.ok) {
      currentRepo = repo;
      sessionByProject.set(repo, result.sessionId);
      send({ type: "answer", id, text: result.answer });
    } else {
      send({ type: "error", id, message: result.reason });
    }
  } catch (error) {
    send(abortController.signal.aborted ? { type: "cancelled", id } : { type: "error", id, message: errorMessage(error) });
  } finally {
    runningQuestions.delete(id);
  }
}

function cancelQuestion(id: string) {
  runningQuestions.get(id)?.abort();

  for (const [confirmationId, pending] of pendingConfirmations) {
    if (pending.questionId === id) {
      pendingConfirmations.delete(confirmationId);
      pending.resolve(undefined);
    }
  }
}

function answerConfirmation(response: ConfirmationResponse) {
  const pending = pendingConfirmations.get(response.confirmationId);
  if (pending) {
    pendingConfirmations.delete(response.confirmationId);
    pending.resolve(response);
  }
}

/** Sends a free-text prompt and returns a promise that resolves when the user answers. */
function askSetupText(id: string, prompt: string, placeholder?: string, defaultValue?: string): Promise<string | null> {
  const message: ServerMessage = { type: "setup-prompt", id, prompt, placeholder, defaultValue };
  pendingSetupPrompt = message;
  send(message);
  return new Promise<string | null>((resolve) => {
    const finish = (value: string | null) => {
      clearTimeout(timer);
      pendingSetupResolve = undefined;
      pendingSetupPrompt = undefined;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), SETUP_TIMEOUT_MS);
    pendingSetupResolve = finish;
  });
}

// If the widget was not listening when a setup step was sent, say it again.
function resendSetupStep() {
  if (pendingSetupPrompt) {
    send(pendingSetupPrompt);
  }
  for (const pending of pendingConfirmations.values()) {
    if (pending.questionId.startsWith("setup")) {
      send(pending.request);
    }
  }
}

/** Wraps askUser to return the chosen option string (or null on cancel). */
async function askSetupChoice(id: string, summary: string, options: string[]): Promise<string | null> {
  const response = await askUser(id, summary, options, SETUP_TIMEOUT_MS);
  return response?.approved && response.choice ? response.choice : null;
}

async function startSetup() {
  if (setupInProgress) {
    return;
  }
  setupInProgress = true;

  const result = await runSetup(
    askSetupText,
    askSetupChoice,
    (text) => send({ type: "note", text }),
    chooseDefaults({
      saved: db ? readSettings(db) : null,
      legacy: readLegacyConfig(),
      envModelArn: process.env.DUCKY_DEFAULT_MODEL_ARN,
      detectedReposRoot: detectReposRoot(),
    }),
  );

  if (result && db) {
    writeSettings(db, result.settings);
    writeProjects(db, result.projects);
    config = configFromDb(result.settings);
    send({ type: "answer", id: "setup", text: "✅ Setup complete! Ask me anything about your repos." });
  } else if (!result) {
    send({ type: "note", text: "Setup was cancelled. Click **Setup** to try again." });
  }

  setupInProgress = false;
  send({ type: "setup-finished", completed: Boolean(result && db) });
}

function handle(message: ClientMessage) {
  switch (message.type) {
    case "ask":
      if (!config) {
        send({ type: "error", id: message.id, message: "Setup required. Click Setup to configure Ducky." });
        return;
      }
      // Not awaited, so several questions can run at once.
      void handleAsk(message);
      break;
    case "cancel":
      cancelQuestion(message.id);
      // Also cancel any pending setup text prompt.
      if (pendingSetupResolve) {
        const resolve = pendingSetupResolve;
        pendingSetupResolve = undefined;
        resolve(null);
      }
      break;
    case "confirmation-response":
      answerConfirmation(message);
      break;
    case "setup-response":
      if (pendingSetupResolve) {
        const resolve = pendingSetupResolve;
        pendingSetupResolve = undefined;
        resolve(message.value);
      }
      break;
    case "run-setup":
      void startSetup();
      break;
    case "widget-ready":
      // The widget can only hear us from now on, so this is the moment first-run setup can begin.
      if (setupInProgress) {
        resendSetupStep();
      } else if (!config) {
        void startSetup();
      }
      break;
    case "new-session":
      currentRepo = undefined;
      sessionByProject.clear();
      send({ type: "session-cleared" });
      break;
  }
}

send({ type: "ready" });
// First-run setup starts when the widget says it is listening (see "widget-ready"), not now:
// the widget's page loads more slowly than this process starts, and anything sent before it listens is lost.

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) {
    continue;
  }
  try {
    handle(decodeClientMessage(line));
  } catch (error) {
    send({ type: "error", message: errorMessage(error) });
  }
}

// The widget closed the pipe: stop anything still running.
for (const abortController of runningQuestions.values()) {
  abortController.abort();
}
