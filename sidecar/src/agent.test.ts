import assert from "node:assert/strict";
import { test } from "node:test";
import { explainFailure, makeCanUseTool } from "./agent.ts";

const signal = new AbortController().signal;
const neverAsk = async () => {
  throw new Error("should not have asked the user");
};

test("read-only tools run without asking", async () => {
  const canUseTool = makeCanUseTool(neverAsk);
  for (const tool of ["Read", "Glob", "Grep", "mcp__atlassian__getJiraIssue", "mcp__github__get_pull_request"]) {
    assert.deepEqual(await canUseTool(tool, {}, { signal }), { behavior: "allow" }, tool);
  }
});

test("any other tool is denied when there is nobody to ask", async () => {
  const canUseTool = makeCanUseTool();
  const result = await canUseTool("Write", {}, { signal });
  assert.equal(result.behavior, "deny");
});

test("a write tool runs only after the user approves", async () => {
  const asked: string[] = [];
  const canUseTool = makeCanUseTool(async (summary) => {
    asked.push(summary);
    return true;
  });
  const result = await canUseTool("mcp__atlassian__createJiraIssue", {}, { signal, title: "Create a ticket" });
  assert.deepEqual(result, { behavior: "allow" });
  assert.deepEqual(asked, ["Create a ticket"]);
});

test("a write tool is denied when the user says no", async () => {
  const canUseTool = makeCanUseTool(async () => false);
  const result = await canUseTool("Bash", {}, { signal });
  assert.equal(result.behavior, "deny");
});

test("a question that was cancelled is denied without asking", async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  const result = await makeCanUseTool(neverAsk)("Edit", {}, { signal: cancelled.signal });
  assert.equal(result.behavior, "deny");
});

test("a question that hits its spending cap says so, with the cap", () => {
  assert.match(explainFailure("error_max_budget_usd", 1), /spending cap \(\$1\.00\)/);
  assert.match(explainFailure("error_max_budget_usd", 0.5), /\$0\.50/);
});

test("a question that takes too many steps says so", () => {
  assert.match(explainFailure("error_max_turns"), /too many steps/);
});

test("any other way of failing keeps its own name", () => {
  assert.equal(explainFailure("error_during_execution"), "error_during_execution");
});

test("a shell command that only looks runs without asking, any other asks", async () => {
  const canUseTool = makeCanUseTool(async () => false);
  assert.deepEqual(await canUseTool("Bash", { command: "git status" }, { signal }), { behavior: "allow" });
  assert.equal((await canUseTool("Bash", { command: "git push" }, { signal })).behavior, "deny");
  assert.equal((await canUseTool("Bash", { command: "ls; rm -rf ." }, { signal })).behavior, "deny");
});
