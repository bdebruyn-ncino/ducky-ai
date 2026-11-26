import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveProject } from "./projects.ts";

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
