import assert from "node:assert/strict";
import { test } from "node:test";
import { isSafeReadOnlyCommand } from "./safe-commands.ts";

test("commands that only look are safe", () => {
  for (const command of [
    "ls",
    "ls -la src",
    "pwd",
    "head -n 20 README.md",
    "wc -l README.md",
    "git status",
    "git log --oneline -n 5",
    "git diff main",
    "gh issue list",
    "gh issue view 12",
    "gh pr view 38",
    "gh pr diff 38",
  ]) {
    assert.equal(isSafeReadOnlyCommand(command), true, command);
  }
});

test("commands that change something are not safe", () => {
  for (const command of [
    "rm -rf node_modules",
    "git push",
    "git commit -m x",
    "git checkout main",
    "git branch -D old",
    "git -c core.pager=sh log",
    "gh pr merge 38",
    "gh pr checkout 38",
    "gh issue create",
    "gh api -X POST /repos/a/b",
    "npm install",
    "find . -delete",
    "cat README.md",
    "",
  ]) {
    assert.equal(isSafeReadOnlyCommand(command), false, command);
  }
});

test("shell syntax makes a safe command unsafe", () => {
  for (const command of [
    "ls; rm -rf .",
    "ls && rm file",
    "ls | sh",
    "ls > out.txt",
    "ls `whoami`",
    "ls $(whoami)",
    "ls $HOME",
    "ls\nrm file",
    "git log \"x\"",
  ]) {
    assert.equal(isSafeReadOnlyCommand(command), false, command);
  }
});

test("options that write a file or open a browser are not safe", () => {
  for (const command of ["git diff --output=patch.txt", "git log --output patch.txt", "tree -o out.txt", "gh pr view 3 --web", "git diff --ext-diff"]) {
    assert.equal(isSafeReadOnlyCommand(command), false, command);
  }
});
