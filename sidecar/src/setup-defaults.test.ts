import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chooseDefaults, detectReposRoot, readLegacyConfig } from "./setup-defaults.ts";

let home: string;

before(() => {
  home = mkdtempSync(join(tmpdir(), "ducky-defaults-test-"));
});

after(() => rmSync(home, { recursive: true, force: true }));

test("what the user saved beats the old config, the environment and guesses", () => {
  const defaults = chooseDefaults({
    saved: { modelArn: "saved-arn", reposRoot: "/saved", awsProfile: "saved-profile" },
    legacy: { modelArn: "legacy-arn", reposRoot: "/legacy", awsProfile: "legacy-profile" },
    envModelArn: "env-arn",
    detectedReposRoot: "/detected",
  });
  assert.deepEqual(defaults, { modelArn: "saved-arn", reposRoot: "/saved", awsProfile: "saved-profile" });
});

test("the old config beats the environment and guesses", () => {
  const defaults = chooseDefaults({
    legacy: { modelArn: "legacy-arn", reposRoot: "/legacy" },
    envModelArn: "env-arn",
    detectedReposRoot: "/detected",
  });
  assert.equal(defaults.modelArn, "legacy-arn");
  assert.equal(defaults.reposRoot, "/legacy");
});

test("the environment fills the ARN when nothing else knows it, and a guess fills the folder", () => {
  const defaults = chooseDefaults({ envModelArn: "env-arn", detectedReposRoot: "/detected" });
  assert.equal(defaults.modelArn, "env-arn");
  assert.equal(defaults.reposRoot, "/detected");
});

test("with nothing to go on there are no suggestions", () => {
  assert.deepEqual(chooseDefaults({ envModelArn: "" }), { awsProfile: undefined, modelArn: undefined, reposRoot: undefined });
});

test("the repos folder is the first usual place that really holds git repos", () => {
  mkdirSync(join(home, "Development", "Repos", "my-app", ".git"), { recursive: true });
  mkdirSync(join(home, "Apps"), { recursive: true });
  assert.equal(detectReposRoot(home), join(home, "Development", "Repos"));
});

test("a usual folder with no git repos in it is skipped", () => {
  const emptyHome = mkdtempSync(join(tmpdir(), "ducky-defaults-empty-"));
  try {
    mkdirSync(join(emptyHome, "Development", "Repos", "just-a-folder"), { recursive: true });
    mkdirSync(join(emptyHome, "Code", "real-repo", ".git"), { recursive: true });
    assert.equal(detectReposRoot(emptyHome), join(emptyHome, "Code"));
  } finally {
    rmSync(emptyHome, { recursive: true, force: true });
  }
});

test("no usual folder means no suggestion", () => {
  const bareHome = mkdtempSync(join(tmpdir(), "ducky-defaults-bare-"));
  try {
    assert.equal(detectReposRoot(bareHome), undefined);
  } finally {
    rmSync(bareHome, { recursive: true, force: true });
  }
});

test("an old config file supplies its values, and a missing or broken one is ignored", () => {
  const file = join(home, "ducky.config.json");
  writeFileSync(file, JSON.stringify({ modelArn: "arn:old", awsProfile: "old", reposRoot: "/old", awsRegion: "us-east-1" }));
  assert.deepEqual(readLegacyConfig(file), { modelArn: "arn:old", awsProfile: "old", reposRoot: "/old" });

  writeFileSync(file, "{ not json");
  assert.deepEqual(readLegacyConfig(file), {});
  assert.deepEqual(readLegacyConfig(join(home, "missing.json")), {});
});
