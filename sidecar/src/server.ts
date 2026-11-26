import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { decodeClientMessage, encode, type ClientMessage, type ServerMessage } from "../../shared/messages.ts";
import { runAgent } from "./agent.ts";
import { loadConfig } from "./config.ts";
import { findRepoInText, listRepos, resolveProject } from "./projects.ts";

type AskMessage = Extract<ClientMessage, { type: "ask" }>;
type ConfirmationResponse = Extract<ClientMessage, { type: "confirmation-response" }>;

interface PendingConfirmation {
  questionId: string;
  resolve: (response: ConfirmationResponse | undefined) => void;
}

const config = loadConfig();
const runningQuestions = new Map<string, AbortController>();
const pendingConfirmations = new Map<string, PendingConfirmation>();

// Keeps the last successful session ID per project so follow-up questions
// continue the same conversation. Cleared by a "new-session" message.
// Lives only for this sidecar process — a restart starts fresh automatically.
const sessionByProject = new Map<string, string>();

// The repo that was last confirmed by the user. Used as the default when a
// follow-up question doesn't name a repo explicitly. Cleared with new-session.
let currentRepo: string | undefined;

// stdout carries protocol messages only. Log to stderr.
function send(message: ServerMessage) {
  process.stdout.write(encode(message));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function askUser(questionId: string, summary: string, options: string[]) {
  const confirmationId = randomUUID();
  send({ type: "confirmation-request", id: questionId, confirmationId, summary, options });
  return new Promise<ConfirmationResponse | undefined>((resolve) => {
    const timer = setTimeout(() => {
      pendingConfirmations.delete(confirmationId);
      logDecision(summary, "timed out, denied");
      send({ type: "confirmation-expired", id: questionId, confirmationId });
      resolve(undefined);
    }, CONFIRMATION_TIMEOUT_MS);

    pendingConfirmations.set(confirmationId, {
      questionId,
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
  const choice = pickRepo(question, project, listRepos(config.reposRoot));
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
    const result = await runAgent(config, repo, question, abortController, makeOnConfirm(id), sessionByProject.get(repo));
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

function handle(message: ClientMessage) {
  switch (message.type) {
    case "ask":
      // Not awaited, so several questions can run at once.
      void handleAsk(message);
      break;
    case "cancel":
      cancelQuestion(message.id);
      break;
    case "confirmation-response":
      answerConfirmation(message);
      break;
    case "new-session":
      currentRepo = undefined;
      sessionByProject.clear();
      send({ type: "session-cleared" });
      break;
  }
}

send({ type: "ready" });

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
