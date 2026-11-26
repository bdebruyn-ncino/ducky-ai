import assert from "node:assert/strict";
import { test } from "node:test";
import { describeToolUse } from "./activity.ts";

test("reading a file names just the file", () => {
  assert.equal(describeToolUse("Read", { file_path: "/Users/me/Repos/ducky-ai/README.md" }), "Reading README.md");
  assert.equal(describeToolUse("Read", {}), "Reading a file");
});

test("searching and looking say what for", () => {
  assert.equal(describeToolUse("Grep", { pattern: "registerHotkey" }), 'Searching for "registerHotkey"');
  assert.equal(describeToolUse("Glob", { pattern: "**/*.ts" }), "Looking for **/*.ts");
});

test("a long command is shortened", () => {
  const text = describeToolUse("Bash", { command: "x".repeat(200) });
  assert.ok(text.length < 80, text);
  assert.ok(text.endsWith("…"));
});

test("connector tools say which service is being asked", () => {
  assert.equal(describeToolUse("mcp__atlassian__getJiraIssue"), "Asking atlassian (getJiraIssue)");
  assert.equal(describeToolUse("mcp__github__get_pull_request"), "Asking github (get_pull_request)");
});

test("an unknown tool still gets a sentence", () => {
  assert.equal(describeToolUse("WebFetch"), "Using WebFetch");
});
