import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DuckyConfig } from "./config.ts";

// Resolved once: the .bin directory inside the sidecar's own node_modules.
const BIN_DIR = fileURLToPath(new URL("../../node_modules/.bin", import.meta.url));

// Read-only tools from the Atlassian MCP server.
// Inherited from the user's global Claude Code config via settingSources: ["user", "project"].
export const ATLASSIAN_READ_TOOLS = [
  "mcp__atlassian__atlassianUserInfo",
  "mcp__atlassian__discover",
  "mcp__atlassian__getAccessibleAtlassianResources",
  "mcp__atlassian__getCollaborators",
  "mcp__atlassian__getConfluenceContent",
  "mcp__atlassian__getGraphContext",
  "mcp__atlassian__getGraphObject",
  "mcp__atlassian__getJiraIssue",
  "mcp__atlassian__getLoomObjectsContent",
  "mcp__atlassian__getPeopleInfo",
  "mcp__atlassian__getWorkActivity",
  "mcp__atlassian__getWorkPortfolio",
  "mcp__atlassian__listJiraIssueComments",
  "mcp__atlassian__search",
  "mcp__atlassian__searchConfluence",
  "mcp__atlassian__searchJiraIssuesUsingJql",
];

// Read-only tools from @modelcontextprotocol/server-github.
export const GITHUB_READ_TOOLS = [
  "mcp__github__get_file_contents",
  "mcp__github__get_issue",
  "mcp__github__get_pull_request",
  "mcp__github__get_pull_request_comments",
  "mcp__github__get_pull_request_files",
  "mcp__github__get_pull_request_reviews",
  "mcp__github__get_pull_request_status",
  "mcp__github__list_commits",
  "mcp__github__list_issues",
  "mcp__github__list_pull_requests",
  "mcp__github__search_code",
  "mcp__github__search_issues",
  "mcp__github__search_repositories",
  "mcp__github__search_users",
];

export type StdioServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

// Returns the GitHub token from the gh CLI, or undefined if gh is not
// available or not authenticated.
function resolveGitHubToken(): string | undefined {
  try {
    return execSync("gh auth token", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

// Returns the MCP servers that should be started for this session.
export function buildMcpServers(_config: DuckyConfig): Record<string, StdioServerConfig> {
  const servers: Record<string, StdioServerConfig> = {};

  const githubToken = resolveGitHubToken();
  if (githubToken) {
    servers.github = {
      command: join(BIN_DIR, "mcp-server-github"),
      env: {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
      },
    };
  }

  return servers;
}
