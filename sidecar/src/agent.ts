import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";
import type { DuckyConfig } from "./config.ts";
import { ATLASSIAN_READ_TOOLS, buildMcpServers, GITHUB_READ_TOOLS } from "./connectors.ts";
import { describeToolUse } from "./activity.ts";
import { listRepos, resolveProject } from "./projects.ts";

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];

// Read-only tools are auto-approved in canUseTool; anything outside this set
// requires explicit user confirmation before it runs.
const READ_ONLY_TOOL_SET = new Set([...READ_ONLY_TOOLS, ...ATLASSIAN_READ_TOOLS, ...GITHUB_READ_TOOLS]);

// One question may not cost more than this (an estimate in US dollars). A runaway loop of tool calls stops here.
export const MAX_QUESTION_COST_USD = Number(process.env.DUCKY_MAX_COST_USD) || 1;

export type AgentResult =
  | { ok: true; answer: string; sessionId: string; costUsd: number; turns: number }
  | { ok: false; reason: string; costUsd?: number; turns?: number };

// What to tell the user when the agent stops without an answer.
export function explainFailure(subtype: string, maxCostUsd = MAX_QUESTION_COST_USD): string {
  switch (subtype) {
    case "error_max_budget_usd":
      return `That question reached its spending cap ($${maxCostUsd.toFixed(2)}), so Ducky stopped. Try a narrower question.`;
    case "error_max_turns":
      return "Ducky took too many steps on that question and stopped. Try a narrower question.";
    default:
      return subtype;
  }
}

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
export function makeCanUseTool(
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
  resumeSessionId?: string,
  // Called with a few friendly words each time the agent uses a tool, for example "Reading README.md".
  onActivity?: (text: string) => void,
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
      // Resume the previous session for this project if one exists.
      ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      // No tools/allowedTools filter: canUseTool is the sole gate.
      // Read-only tools are auto-approved; write tools require user confirmation.
      canUseTool: makeCanUseTool(onConfirm),
      mcpServers,
      // Keeps MCP server env (GitHub token) off the command line.
      mcpServersDelivery: "initialize",
      // "user" picks up MCP servers the user has configured globally in Claude Code.
      settingSources: ["user", "project"],
      // The user's personal hooks are shell commands that would run during Ducky's questions, outside its control.
      settings: { disableAllHooks: true },
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "You are Ducky, a rubber duck for developers. Answer concisely and say which files you looked at.",
      },
      env: bedrockEnv(config),
      abortController,
      maxBudgetUsd: MAX_QUESTION_COST_USD,
    },
  });

  for await (const message of messages) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          onActivity?.(describeToolUse(block.name, block.input as Record<string, unknown>));
        }
      }
      continue;
    }
    if (message.type !== "result") continue;

    return message.subtype === "success"
      ? { ok: true, answer: message.result, sessionId: message.session_id, costUsd: message.total_cost_usd, turns: message.num_turns }
      : { ok: false, reason: explainFailure(message.subtype), costUsd: message.total_cost_usd, turns: message.num_turns };
  }
  return { ok: false, reason: "The agent ended without a result." };
}
