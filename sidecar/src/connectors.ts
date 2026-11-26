// Read-only tools from MCP servers the user has configured globally.
// The agent inherits those servers via settingSources: ["user", "project"].
// Only the tools listed here can be called; write tools are not included.

// Read-only tools from the Atlassian MCP server.
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
