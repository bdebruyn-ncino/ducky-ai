import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";
import type { DuckyConfig } from "./config.ts";
import { ATLASSIAN_READ_TOOLS, buildMcpServers, GITHUB_READ_TOOLS } from "./connectors.ts";
import { listRepos, resolveProject } from "./projects.ts";

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];

// Read-only tools are auto-approved in canUseTool; anything outside this set
// requires explicit user confirmation before it runs.
const READ_ONLY_TOOL_SET = new Set([...READ_ONLY_TOOLS, ...ATLASSIAN_READ_TOOLS, ...GITHUB_READ_TOOLS]);

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

// Called before each tool use. Read-only tools are auto-approved; anything
// else is routed through onConfirm (if provided) or denied immediately.
function makeCanUseTool(
  onConfirm?: (summary: string) => Promise<boolean>,
) {
  return async (
    toolName: string,
    _input: Record<string, unknown>,
    options: { title?: string; description?: string; signal: AbortSignal },
  ): Promise<PermissionResult> => {
    if (READ_ONLY_TOOL_SET.has(toolName)) {
      return { behavior: "allow" };
    }

    if (!onConfirm || options.signal.aborted) {
      return { behavior: "deny", message: `"${toolName}" is not a read-only tool and was denied.` };
    }

    const summary = options.title ?? options.description ?? `Use ${toolName}?`;
    const approved = await onConfirm(summary);
    return approved
      ? { behavior: "allow" }
      : { behavior: "deny", message: "Denied by user." };
  };
}

export async function runAgent(
  config: DuckyConfig,
  project: string,
  question: string,
  abortController?: AbortController,
  onConfirm?: (summary: string) => Promise<boolean>,
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

  const messages = query({
    prompt: question,
    options: {
      cwd,
      model: config.modelArn,
      // No tools/allowedTools filter: canUseTool is the sole gate.
      // Read-only tools are auto-approved; write tools require user confirmation.
      canUseTool: makeCanUseTool(onConfirm),
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
