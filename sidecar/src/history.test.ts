import assert from "node:assert/strict";
import { test } from "node:test";
import { addHistory, clearHistory, MAX_HISTORY_ENTRIES, openDb, readHistory } from "./db.ts";

test("history comes back newest first", () => {
  const db = openDb(":memory:");
  addHistory(db, { kind: "question", text: "first" });
  addHistory(db, { kind: "answer", text: "second" });
  assert.deepEqual(readHistory(db).map((entry) => entry.text), ["second", "first"]);
});

test("an entry keeps its repo and how long an answer took, and leaves out what it does not have", () => {
  const db = openDb(":memory:");
  const now = new Date("2026-11-26T13:00:00.000Z");
  addHistory(db, { kind: "answer", text: "done", repo: "ducky-ai", durationMs: 4200 }, now);
  addHistory(db, { kind: "approval", text: "approved: write a file" }, now);

  const [approval, answer] = readHistory(db);
  assert.deepEqual(answer, { id: answer.id, at: "2026-11-26T13:00:00.000Z", kind: "answer", repo: "ducky-ai", text: "done", durationMs: 4200 });
  assert.equal("repo" in approval, false);
  assert.equal("durationMs" in approval, false);
});

test("the limit keeps only the most recent entries", () => {
  const db = openDb(":memory:");
  for (const text of ["a", "b", "c", "d"]) {
    addHistory(db, { kind: "question", text });
  }
  assert.deepEqual(readHistory(db, 2).map((entry) => entry.text), ["d", "c"]);
});

test("the oldest entries are dropped once history passes its cap", () => {
  const db = openDb(":memory:");
  for (let n = 1; n <= MAX_HISTORY_ENTRIES + 3; n++) {
    addHistory(db, { kind: "question", text: `question ${n}` });
  }
  const entries = readHistory(db, MAX_HISTORY_ENTRIES + 10);
  assert.equal(entries.length, MAX_HISTORY_ENTRIES);
  assert.equal(entries[0].text, `question ${MAX_HISTORY_ENTRIES + 3}`);
  assert.equal(entries.at(-1)?.text, "question 4");
});

test("clearing removes everything", () => {
  const db = openDb(":memory:");
  addHistory(db, { kind: "question", text: "gone soon" });
  clearHistory(db);
  assert.deepEqual(readHistory(db), []);
});
