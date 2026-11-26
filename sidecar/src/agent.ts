import { query } from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";
import type { DuckyConfig } from "./config.ts";
import { ATLASSIAN_READ_TOOLS, buildMcpServers, GITHUB_READ_TOOLS } from "./connectors.ts";
import { listRepos, resolveProject } from "./projects.ts";

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

export async function runAgent(
  config: DuckyConfig,
  project: string,
  question: string,
  abortController?: AbortController,
): Promise<AgentResult> {
  const match = resolveProject(project, listRepos(config.reposRoot));
  if (match.status === "unknown") {
    return { ok: false, reason: `Unknown project "${project}". Known projects: ${match.known.join(", ")}` };
  }
  if (match.status === "ambiguous") {
    return { ok: false, reason: `"${project}" could mean: ${match.matches.join(", ")}. Which one?` };
  }
  const cwd = join(config.reposRoot, match.name);

  const mcpServers = buildMcpServers(config);
  const allAllowedTools = [...READ_ONLY_TOOLS, ...ATLASSIAN_READ_TOOLS, ...GITHUB_READ_TOOLS];

  const messages = query({
    prompt: question,
    options: {
      cwd,
      model: config.modelArn,
      // Read-only built-in tools, Atlassian from user settings, GitHub if configured.
      tools: allAllowedTools,
      allowedTools: allAllowedTools,
      mcpServers,
      // Keeps MCP server env (GitHub token) off the command line.
      mcpServersDelivery: "initialize",
      // "user" picks up MCP servers the user has configured globally in Claude Code.
      settingSources: ["user", "project"],
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "You are Ducky, a rubber duck for developers. Answer concisely and say which files you looked at.",
      },
      env: bedrockEnv(config),
      abortController,
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
