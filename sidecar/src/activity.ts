import { basename } from "node:path";

const MAX_LENGTH = 60;

function shorten(text: string): string {
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}

// Turns a tool call into a few friendly words, for the status line and the history.
export function describeToolUse(name: string, input: Record<string, unknown> = {}): string {
  const text = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : undefined);
  const file = () => {
    const path = text("file_path") ?? text("path");
    return path ? basename(path) : "a file";
  };

  switch (name) {
    case "Read":
      return `Reading ${file()}`;
    case "Edit":
      return `Editing ${file()}`;
    case "Write":
      return `Writing ${file()}`;
    case "Grep":
      return `Searching for "${shorten(text("pattern") ?? "")}"`;
    case "Glob":
      return `Looking for ${shorten(text("pattern") ?? "files")}`;
    case "Bash":
      return `Running ${shorten(text("command") ?? "a command")}`;
    default:
      if (name.startsWith("mcp__")) {
        const [, server, tool] = name.split("__");
        return `Asking ${server}${tool ? ` (${tool})` : ""}`;
      }
      return `Using ${name}`;
  }
}
