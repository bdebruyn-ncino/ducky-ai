import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DbProject, DbSettings } from "./db.ts";

// Suggestions to pre-fill, so the answer most people want is one Enter away.
export interface SetupDefaults {
  awsProfile?: string;
  modelArn?: string;
  reposRoot?: string;
}

export interface SetupResult {
  settings: DbSettings;
  projects: DbProject[];
}

/** Reads profile names from ~/.aws/config. Returns [] when the file is absent or malformed. */
export function readAwsProfiles(): string[] {
  const configPath = join(homedir(), ".aws", "config");
  try {
    const content = readFileSync(configPath, "utf8");
    const profiles: string[] = [];
    for (const line of content.split("\n")) {
      const m = line.match(/^\[(?:profile\s+)?(.+)\]$/);
      if (m) {
        profiles.push(m[1].trim());
      }
    }
    return profiles;
  } catch {
    return [];
  }
}

/** Reads the region from a named profile in ~/.aws/config. */
function readProfileRegion(profile: string): string | undefined {
  const configPath = join(homedir(), ".aws", "config");
  try {
    const content = readFileSync(configPath, "utf8");
    let inProfile = false;
    for (const line of content.split("\n")) {
      if (line.match(new RegExp(`^\\[(?:profile\\s+)?${profile}\\]$`))) {
        inProfile = true;
      } else if (line.match(/^\[/)) {
        inProfile = false;
      } else if (inProfile) {
        const m = line.match(/^region\s*=\s*(.+)$/);
        if (m) {
          return m[1].trim();
        }
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

/** Extracts the AWS region from a Bedrock model ARN, e.g. "arn:aws:bedrock:us-east-1:..." → "us-east-1". */
export function extractRegionFromArn(arn: string): string | undefined {
  const m = arn.match(/^arn:aws[^:]*:bedrock:([a-z0-9-]+):/);
  return m?.[1];
}

/** Calls STS to verify the given profile is properly authenticated. */
export function verifySts(profile: string, region: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("aws", ["sts", "get-caller-identity", "--profile", profile, "--region", region], {
      env: { ...process.env },
      stdio: "ignore",
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

/** Scans a directory for immediate subdirectories that contain a .git folder. */
export function scanForRepos(root: string): DbProject[] {
  const expanded = root.replace(/^~/, homedir());
  try {
    return readdirSync(expanded, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(expanded, e.name, ".git")))
      .map((e) => ({ name: e.name, path: join(expanded, e.name) }));
  } catch {
    return [];
  }
}

/**
 * Runs the interactive first-run (or re-run) setup wizard.
 *
 * askText   – sends a free-text prompt, resolves to the user's answer or null if cancelled
 * askChoice – sends a multiple-choice prompt, resolves to the chosen option or null if cancelled
 * report    – sends an informational note with no input required
 *
 * Returns the completed settings + discovered projects, or null if the user cancelled.
 */
export async function runSetup(
  askText: (id: string, prompt: string, placeholder?: string, defaultValue?: string) => Promise<string | null>,
  askChoice: (id: string, summary: string, options: string[]) => Promise<string | null>,
  report: (text: string) => void,
  defaults: SetupDefaults = {},
): Promise<SetupResult | null> {
  // ── 1. AWS profile ──────────────────────────────────────────────────────────
  const profiles = readAwsProfiles();
  let awsProfile: string | null;
  if (profiles.length > 0) {
    // The profile used last time goes first.
    const ordered = defaults.awsProfile && profiles.includes(defaults.awsProfile)
      ? [defaults.awsProfile, ...profiles.filter((profile) => profile !== defaults.awsProfile)]
      : profiles;
    awsProfile = await askChoice("setup-profile", "Which AWS profile should Ducky use?", ordered);
  } else {
    awsProfile = await askText("setup-profile", "Enter your AWS profile name:", "default", defaults.awsProfile ?? "default");
  }
  if (!awsProfile) return null;

  // ── 2. STS verification ─────────────────────────────────────────────────────
  const verifyRegion = readProfileRegion(awsProfile) ?? "us-east-1";
  report(`Verifying AWS credentials for profile "${awsProfile}"…`);
  const stsOk = await verifySts(awsProfile, verifyRegion);
  if (!stsOk) {
    report(`⚠️ Could not verify profile "${awsProfile}". Check your credentials and try setup again.`);
    return null;
  }
  report(`✓ AWS credentials verified.`);

  // ── 3. Model ARN ────────────────────────────────────────────────────────────
  const modelArn = await askText(
    "setup-model-arn",
    "Enter your Bedrock application inference profile ARN:",
    "arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/…",
    defaults.modelArn,
  );
  if (!modelArn) return null;

  // Derive region from ARN if possible, else use the profile region.
  const awsRegion = extractRegionFromArn(modelArn) ?? verifyRegion;

  // ── 4. Repos root ───────────────────────────────────────────────────────────
  const reposRoot = await askText("setup-repos-root", "Where are your git repos? (full path):", "~/Apps", defaults.reposRoot);
  if (!reposRoot) return null;

  // ── 5. Scan for git repos ───────────────────────────────────────────────────
  report(`Scanning "${reposRoot}" for git repos…`);
  const found = scanForRepos(reposRoot);
  if (found.length === 0) {
    report(`No git repos found in "${reposRoot}". You can re-run setup later.`);
    // Still let the user save their settings with an empty project list.
  }

  let projects: DbProject[] = [];
  if (found.length > 0) {
    const names = found.map((p) => p.name).join(", ");
    const confirmed = await askChoice(
      "setup-repos-confirm",
      `Found ${found.length} repo${found.length === 1 ? "" : "s"}: ${names}. Use these?`,
      ["Yes, use these repos", "Skip for now"],
    );
    if (!confirmed) return null;
    if (confirmed === "Yes, use these repos") {
      projects = found;
    }
  }

  return {
    settings: { modelArn, awsProfile, awsRegion, reposRoot },
    projects,
  };
}
