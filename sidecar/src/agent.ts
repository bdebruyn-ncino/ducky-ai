import { query } from "@anthropic-ai/claude-agent-sdk";
import type { DuckyConfig } from "./config.ts";

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];

export type AgentResult =
  | { ok: true; answer: string }
  | { ok: false; reason: string };

function bedrockEnv(config: DuckyConfig) {
  return {
    ...process.env,
    CLAUDE_CODE_USE_BEDROCK: "1",
    AWS_PROFILE: config.awsProfile,
    AWS_REGION: config.awsRegion,
  };
}

export async function runAgent(config: DuckyConfig, project: string, question: string): Promise<AgentResult> {
  const cwd = config.projects[project];
  if (!cwd) {
    const known = Object.keys(config.projects).join(", ");
    return { ok: false, reason: `Unknown project "${project}". Known projects: ${known}` };
  }

  const messages = query({
    prompt: question,
    options: {
      cwd,
      model: config.modelArn,
      // Read-only: these are the only tools that exist for the agent.
      tools: READ_ONLY_TOOLS,
      allowedTools: READ_ONLY_TOOLS,
      settingSources: ["project"],
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "You are Ducky, a rubber duck for developers. Answer concisely and say which files you looked at.",
      },
      env: bedrockEnv(config),
    },
  });

  for await (const message of messages) {
    if (message.type !== "result") continue;

    return message.subtype === "success"
      ? { ok: true, answer: message.result }
      : { ok: false, reason: message.subtype };
  }
  return { ok: false, reason: "The agent ended without a result." };
}
