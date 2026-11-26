import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig, parseConfig } from "./config.ts";

const validConfig = {
  modelArn: "arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc",
  awsProfile: "genai",
  awsRegion: "us-east-1",
  projects: { example: "/tmp/example" },
};

test("a valid config parses", () => {
  assert.deepEqual(parseConfig(validConfig), validConfig);
});

test("a missing modelArn names the field in the error", () => {
  const { modelArn, ...withoutArn } = validConfig;
  assert.throws(() => parseConfig(withoutArn), /"modelArn"/);
});

test("a missing file tells the user to copy the example", () => {
  assert.throws(() => loadConfig("/nonexistent/ducky.config.json"), /ducky\.config\.example\.json/);
});
