import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { decodeServerMessage, encode, type ClientMessage, type ServerMessage } from "../../shared/messages.ts";

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
function startSidecar() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: sidecarDir,
    env: { ...process.env, DUCKY_CONFIG: configPath },
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

    assert.deepEqual(await sidecar.next(), { type: "status", id: "q1", state: "working" });
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
    await sidecar.next();
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

test("cancel ends a question that is waiting for the user", timeout, async () => {
  const sidecar = startSidecar();
  try {
    await sidecar.next();
    sidecar.send({ type: "ask", id: "q1", project: "banana", question: "hello" });
    await sidecar.next();
    await sidecar.next();

    sidecar.send({ type: "cancel", id: "q1" });
    assert.deepEqual(await sidecar.next(), { type: "cancelled", id: "q1" });
  } finally {
    sidecar.stop();
  }
});
