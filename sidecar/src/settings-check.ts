import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Ducky asks before using any tool except the read-only ones. But a tool that Claude settings already
// allow is never asked about, and Ducky reads those settings. So we say so, instead of leaving it silent.

export function userSettingsFiles(home = homedir()): string[] {
  return [join(home, ".claude", "settings.json"), join(home, ".claude", "settings.local.json")];
}

export function projectSettingsFiles(repoPath: string): string[] {
  return [join(repoPath, ".claude", "settings.json"), join(repoPath, ".claude", "settings.local.json")];
}

// The `permissions.allow` rules in these files. A missing or unreadable file simply has none.
export function findPreApprovedRules(files: string[]): string[] {
  const rules: string[] = [];
  for (const file of files) {
    try {
      const allow = JSON.parse(readFileSync(file, "utf8"))?.permissions?.allow;
      if (Array.isArray(allow)) {
        rules.push(...allow.filter((rule): rule is string => typeof rule === "string"));
      }
    } catch {
      // Nothing there, or not valid JSON: nothing to report.
    }
  }
  return rules;
}

const EXAMPLES_SHOWN = 3;

// The note to show the user, or undefined when nothing is pre-approved.
export function describePreApproved(rules: string[], where: string): string | undefined {
  if (rules.length === 0) {
    return undefined;
  }
  const examples = rules.slice(0, EXAMPLES_SHOWN).join(", ");
  const more = rules.length > EXAMPLES_SHOWN ? ` and ${rules.length - EXAMPLES_SHOWN} more` : "";
  const noun = rules.length === 1 ? "tool rule" : "tool rules";
  return `Heads up: ${where} pre-approves ${rules.length} ${noun} (${examples}${more}). Ducky does not ask before using those.`;
}
