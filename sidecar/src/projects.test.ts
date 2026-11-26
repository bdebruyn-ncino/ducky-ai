import assert from "node:assert/strict";
import { test } from "node:test";
import { findRepoInText, resolveProject } from "./projects.ts";

const repos = ["aws-autospread", "aws-autospread-parallel", "aws-doc-extraction", "force-ncinoocr", "ducky-ai"];

test("an exact repo name is found", () => {
  assert.deepEqual(resolveProject("aws-autospread", repos), { status: "found", name: "aws-autospread" });
});

test("spoken variants are found", () => {
  const expected = { status: "found", name: "aws-autospread" };
  assert.deepEqual(resolveProject("the Auto Spread repo", repos), expected);
  assert.deepEqual(resolveProject("AutoSpread", repos), expected);
});

test("the closest repo wins over a longer name that also contains the words", () => {
  assert.deepEqual(resolveProject("autospread", repos), { status: "found", name: "aws-autospread" });
});

test("a word unique to one repo finds that repo", () => {
  assert.deepEqual(resolveProject("parallel", repos), { status: "found", name: "aws-autospread-parallel" });
});

test("a tie between equally close repos is ambiguous", () => {
  assert.deepEqual(resolveProject("foo", ["foo-api", "foo-web"]), {
    status: "ambiguous",
    matches: ["foo-api", "foo-web"],
  });
});

test("a short name that matches many repos lists them all", () => {
  assert.deepEqual(resolveProject("aws", repos), {
    status: "ambiguous",
    matches: ["aws-autospread", "aws-autospread-parallel", "aws-doc-extraction"],
  });
});

test("a short name that is only part of several repos is ambiguous", () => {
  assert.deepEqual(resolveProject("ai", ["ducky-ai", "aws-ai-platform-models"]), {
    status: "ambiguous",
    matches: ["ducky-ai", "aws-ai-platform-models"],
  });
});

test("an unknown name lists the known repos", () => {
  assert.deepEqual(resolveProject("banana", repos), { status: "unknown", known: repos });
});

test("only filler words is unknown", () => {
  assert.deepEqual(resolveProject("the repo", repos), { status: "unknown", known: repos });
});

test("a repo named in a sentence is found", () => {
  assert.deepEqual(findRepoInText("why is the autospread repo failing", repos), {
    status: "found",
    name: "aws-autospread",
  });
});

test("the longest phrase wins when one repo name contains another", () => {
  assert.deepEqual(findRepoInText("what does the auto spread parallel repo do", repos), {
    status: "found",
    name: "aws-autospread-parallel",
  });
});

test("a short name in a sentence lists the closest repos", () => {
  assert.deepEqual(findRepoInText("aws lambda timeout", repos), {
    status: "unclear",
    options: ["aws-autospread", "aws-autospread-parallel", "aws-doc-extraction"],
  });
});

test("a weak match in a sentence is offered, not assumed", () => {
  assert.deepEqual(findRepoInText("why does the model fail", [...repos, "aws-ai-platform-models"]), {
    status: "unclear",
    options: ["aws-ai-platform-models"],
  });
});

test("a sentence with no repo lists every repo", () => {
  assert.deepEqual(findRepoInText("hello there", repos), { status: "unclear", options: repos });
});

test("two repos named equally is unclear", () => {
  assert.deepEqual(findRepoInText("compare foo api and bar web", ["foo-api", "bar-web"]), {
    status: "unclear",
    options: ["foo-api", "bar-web"],
  });
});
