import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanForRepos, type SetupDefaults } from "./setup.ts";

// Where developers usually keep their repos, most likely first.
const COMMON_REPO_FOLDERS = ["Development/Repos", "Development", "Repos", "repos", "Code", "code", "Projects", "projects", "dev", "src", "Apps"];

// The first usual folder that actually holds git repos, or undefined.
export function detectReposRoot(
  home = homedir(),
  repoCount = (folder: string) => scanForRepos(folder).length,
): string | undefined {
  return COMMON_REPO_FOLDERS.map((folder) => join(home, folder)).find((folder) => existsSync(folder) && repoCount(folder) > 0);
}

const LEGACY_CONFIG_PATH = fileURLToPath(new URL("../../ducky.config.json", import.meta.url));

// Older setups used a ducky.config.json in the repo. Its values make good suggestions; a missing or broken file is fine.
export function readLegacyConfig(path = LEGACY_CONFIG_PATH): SetupDefaults {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    const text = (field: string) => (typeof value[field] === "string" && value[field] !== "" ? value[field] : undefined);
    return { awsProfile: text("awsProfile"), modelArn: text("modelArn"), reposRoot: text("reposRoot") };
  } catch {
    return {};
  }
}

export interface DefaultSources {
  saved?: SetupDefaults | null; // what the user chose last time
  legacy?: SetupDefaults; // the old JSON config
  envModelArn?: string; // DUCKY_DEFAULT_MODEL_ARN, so a team can share a default without committing it
  detectedReposRoot?: string;
}

// What to pre-fill: the user's own earlier answers beat everything, then older config, then guesses.
export function chooseDefaults({ saved, legacy, envModelArn, detectedReposRoot }: DefaultSources): SetupDefaults {
  return {
    awsProfile: saved?.awsProfile ?? legacy?.awsProfile,
    modelArn: saved?.modelArn ?? legacy?.modelArn ?? (envModelArn || undefined),
    reposRoot: saved?.reposRoot ?? legacy?.reposRoot ?? detectedReposRoot,
  };
}
