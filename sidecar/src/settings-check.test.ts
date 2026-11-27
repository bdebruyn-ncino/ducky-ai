import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { describePreApproved, findPreApprovedRules, projectSettingsFiles, userSettingsFiles } from "./settings-check.ts";

let dir: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "ducky-settings-check-"));
});

after(() => rmSync(dir, { recursive: true, force: true }));

function write(name: string, content: string): string {
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

test("rules from every file are collected", () => {
  const a = write("a.json", JSON.stringify({ permissions: { allow: ["Bash(git status)", "Read"] } }));
  const b = write("b.json", JSON.stringify({ permissions: { allow: ["Edit"] } }));
  assert.deepEqual(findPreApprovedRules([a, b]), ["Bash(git status)", "Read", "Edit"]);
});

test("settings without allow rules, a missing file and broken JSON all mean none", () => {
  const empty = write("empty.json", JSON.stringify({ model: "opus" }));
  const broken = write("broken.json", "{ not json");
  assert.deepEqual(findPreApprovedRules([empty, broken, join(dir, "missing.json")]), []);
});

test("entries that are not text are ignored", () => {
  const odd = write("odd.json", JSON.stringify({ permissions: { allow: ["Read", 7, null, { rule: "x" }] } }));
  assert.deepEqual(findPreApprovedRules([odd]), ["Read"]);
});

test("nothing pre-approved means no note", () => {
  assert.equal(describePreApproved([], "your Claude settings"), undefined);
});

test("the note says how many rules and gives a few examples", () => {
  assert.equal(
    describePreApproved(["Bash(git status)"], "your Claude settings"),
    "Heads up: your Claude settings pre-approves 1 tool rule (Bash(git status)). Ducky does not ask before using those.",
  );
  assert.equal(
    describePreApproved(["A", "B", "C", "D", "E"], "the repo's Claude settings"),
    "Heads up: the repo's Claude settings pre-approves 5 tool rules (A, B, C and 2 more). Ducky does not ask before using those.",
  );
});

test("the files to look in are the user's and the repo's Claude settings", () => {
  assert.deepEqual(userSettingsFiles("/home/me"), ["/home/me/.claude/settings.json", "/home/me/.claude/settings.local.json"]);
  assert.deepEqual(projectSettingsFiles("/repos/app"), ["/repos/app/.claude/settings.json", "/repos/app/.claude/settings.local.json"]);
});
