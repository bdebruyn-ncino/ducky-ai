import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { decodeServerMessage, encode, type ClientMessage, type ServerMessage } from "../../shared/messages.ts";
import { addHistory, openDb } from "./db.ts";

const sidecarDir = fileURLToPath(new URL("..", import.meta.url));
let workDir: string;
let configPath: string;

before(() => {
  workDir = mkdtempSync(join(tmpdir(), "ducky-server-test-"));
  const reposRoot = join(workDir, "repos");
  for (const repo of ["alpha-api", "beta-web"]) {
    mkdirSync(join(reposRoot, repo, ".git"), { recursive: true });
  }
  configPath = join(workDir, "ducky.config.json");
  writeFileSync(
    configPath,
    JSON.stringify({ modelArn: "arn:test", awsProfile: "test", awsRegion: "us-east-1", reposRoot }),
  );
});

after(() => rmSync(workDir, { recursive: true, force: true }));

// Runs the real server and talks to it using only the shared message types.
function startSidecar(extraEnv: Record<string, string> = {}) {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: sidecarDir,
    env: { ...process.env, DUCKY_CONFIG: configPath, ...extraEnv },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();

  return {
    send: (message: ClientMessage) => child.stdin.write(encode(message)),
    sendRaw: (line: string) => child.stdin.write(line + "\n"),
    async next(): Promise<ServerMessage> {
      const { value, done } = await lines.next();
      if (done) {
        throw new Error("The sidecar closed its output before sending the expected message.");
      }
      return decodeServerMessage(value);
    },
    stop: () => child.kill(),
  };
}

const timeout = { timeout: 30_000 };

test("the sidecar announces it is ready", timeout, async () => {
  const sidecar = startSidecar();
  try {
    assert.deepEqual(await sidecar.next(), { type: "ready" });
  } finally {
    sidecar.stop();
  }
});

test("a line that is not a valid message gets an error without an id", timeout, async () => {
  const sidecar = startSidecar();
  try {
    await sidecar.next();
    sidecar.sendRaw('{"type":"nonsense"}');
    const reply = await sidecar.next();
    assert.equal(reply.type, "error");
    assert.equal("id" in reply, false);
  } finally {
    sidecar.stop();
  }
});

test("a question that names no repo asks the user to pick one", timeout, async () => {
  const sidecar = startSidecar();
  try {
    await sidecar.next();
    sidecar.send({ type: "ask", id: "q1", question: "hello there" });

    // The first reply is the question to the user: Ducky is waiting, not working.
    const request = await sidecar.next();
    assert.equal(request.type, "confirmation-request");
    if (request.type === "confirmation-request") {
      assert.deepEqual(request.options, ["alpha-api", "beta-web"]);
    }
  } finally {
    sidecar.stop();
  }
});

test("denying the repo choice cancels the question", timeout, async () => {
  const sidecar = startSidecar();
  try {
    await sidecar.next();
    sidecar.send({ type: "ask", id: "q1", question: "hello there" });
    const request = await sidecar.next();
    if (request.type !== "confirmation-request") {
      assert.fail("expected a confirmation request");
    }

    sidecar.send({ type: "confirmation-response", id: "q1", confirmationId: request.confirmationId, approved: false });
    assert.deepEqual(await sidecar.next(), { type: "cancelled", id: "q1" });
  } finally {
    sidecar.stop();
  }
});

test("new-session clears the repo memory so the next question asks again", timeout, async () => {
  const sidecar = startSidecar();
  try {
    await sidecar.next(); // ready

    // Pick a repo so it is remembered.
    sidecar.send({ type: "ask", id: "q1", question: "hello there" });
    const req1 = await sidecar.next();
    assert.equal(req1.type, "confirmation-request");
    if (req1.type !== "confirmation-request") return;
    sidecar.send({ type: "confirmation-response", id: "q1", confirmationId: req1.confirmationId, approved: true, choice: "alpha-api" });
    // The question now runs (and will time-out / fail in the test env — that's fine,
    // we just need to cancel before waiting for a real agent answer).
    sidecar.send({ type: "cancel", id: "q1" });
    await sidecar.next(); // cancelled

    // Clear the session.
    sidecar.send({ type: "new-session" });
    assert.deepEqual(await sidecar.next(), { type: "session-cleared" });

    // After new-session, an ambiguous question should ask again.
    sidecar.send({ type: "ask", id: "q2", question: "hello again" });
    const req2 = await sidecar.next();
    assert.equal(req2.type, "confirmation-request");
  } finally {
    sidecar.stop();
  }
});

test("new-session clears the session and confirms", timeout, async () => {
  const sidecar = startSidecar();
  try {
    await sidecar.next(); // ready
    sidecar.send({ type: "new-session" });
    assert.deepEqual(await sidecar.next(), { type: "session-cleared" });
  } finally {
    sidecar.stop();
  }
});

test("cancel ends a question that is waiting for the user", timeout, async () => {
  const sidecar = startSidecar();
  try {
    await sidecar.next();
    sidecar.send({ type: "ask", id: "q1", project: "banana", question: "hello" });
    await sidecar.next();

    sidecar.send({ type: "cancel", id: "q1" });
    assert.deepEqual(await sidecar.next(), { type: "cancelled", id: "q1" });
  } finally {
    sidecar.stop();
  }
});

test("a choice that was not on offer cancels the question", timeout, async () => {
  const sidecar = startSidecar();
  try {
    await sidecar.next();
    sidecar.send({ type: "ask", id: "q1", question: "hello there" });
    const request = await sidecar.next();
    if (request.type !== "confirmation-request") {
      assert.fail("expected a confirmation request");
    }

    sidecar.send({
      type: "confirmation-response",
      id: "q1",
      confirmationId: request.confirmationId,
      approved: true,
      choice: "some-other-repo",
    });
    assert.deepEqual(await sidecar.next(), { type: "cancelled", id: "q1" });
  } finally {
    sidecar.stop();
  }
});

test("a request nobody answers is denied after the timeout", timeout, async () => {
  const sidecar = startSidecar({ DUCKY_CONFIRMATION_TIMEOUT_MS: "300" });
  try {
    await sidecar.next();
    sidecar.send({ type: "ask", id: "q1", question: "hello there" });
    const request = await sidecar.next();
    if (request.type !== "confirmation-request") {
      assert.fail("expected a confirmation request");
    }

    assert.deepEqual(await sidecar.next(), {
      type: "confirmation-expired",
      id: "q1",
      confirmationId: request.confirmationId,
    });
    assert.deepEqual(await sidecar.next(), { type: "cancelled", id: "q1" });
  } finally {
    sidecar.stop();
  }
});

test("a setup step nobody answers ends setup cleanly instead of leaving it open", timeout, async () => {
  // No JSON config and an empty database: the sidecar starts first-run setup by itself.
  const sidecar = startSidecar({
    DUCKY_CONFIG: "",
    DUCKY_DB: join(workDir, "setup-test.db"),
    DUCKY_SETUP_TIMEOUT_MS: "300",
  });
  try {
    await sidecar.next(); // ready
    sidecar.send({ type: "widget-ready" });

    const seen: ServerMessage[] = [];
    for (;;) {
      const message = await sidecar.next();
      seen.push(message);
      if (message.type === "setup-finished") {
        break;
      }
    }

    assert.deepEqual(seen.at(-1), { type: "setup-finished", completed: false });
    assert.ok(
      seen.some((message) => message.type === "note"),
      "the user is told setup was cancelled",
    );
  } finally {
    sidecar.stop();
  }
});

test("first-run setup waits until the widget says it is listening", timeout, async () => {
  const sidecar = startSidecar({ DUCKY_CONFIG: "", DUCKY_DB: join(workDir, "waits-test.db") });
  try {
    await sidecar.next(); // ready
    const readyAt = Date.now();
    setTimeout(() => sidecar.send({ type: "widget-ready" }), 500);

    const first = await sidecar.next();
    assert.ok(Date.now() - readyAt >= 450, "setup began before the widget was listening");
    assert.ok(first.type === "confirmation-request" || first.type === "setup-prompt", "the first thing is a setup question");
  } finally {
    sidecar.stop();
  }
});

test("a widget that asks again is told the current setup step again", timeout, async () => {
  const sidecar = startSidecar({ DUCKY_CONFIG: "", DUCKY_DB: join(workDir, "again-test.db") });
  try {
    await sidecar.next(); // ready
    sidecar.send({ type: "widget-ready" });
    const first = await sidecar.next();

    sidecar.send({ type: "widget-ready" });
    assert.deepEqual(await sidecar.next(), first);
  } finally {
    sidecar.stop();
  }
});

test("history from before a restart is still there, and can be cleared", timeout, async () => {
  // Written by an earlier run of the app.
  const dbFile = join(workDir, "history-test.db");
  const db = openDb(dbFile);
  addHistory(db, { kind: "question", text: "what does this do?", repo: "alpha-api" });
  addHistory(db, { kind: "answer", text: "It serves the API.", repo: "alpha-api", durationMs: 3100 });
  db.close();

  const sidecar = startSidecar({ DUCKY_CONFIG: "", DUCKY_DB: dbFile });
  try {
    await sidecar.next(); // ready

    sidecar.send({ type: "history-request" });
    const history = await sidecar.next();
    assert.equal(history.type, "history");
    if (history.type === "history") {
      assert.deepEqual(history.entries.map((entry) => entry.kind), ["answer", "question"]);
      assert.equal(history.entries[0].durationMs, 3100);
    }

    sidecar.send({ type: "history-clear" });
    assert.deepEqual(await sidecar.next(), { type: "history", entries: [] });

    sidecar.send({ type: "history-request" });
    assert.deepEqual(await sidecar.next(), { type: "history", entries: [] });
  } finally {
    sidecar.stop();
  }
});
