import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type ProjectMatch =
  | { status: "found"; name: string }
  | { status: "ambiguous"; matches: string[] }
  | { status: "unknown"; known: string[] };

const FILLER_WORDS = new Set(["the", "repo", "repository", "project"]);

// With several matches, the spoken name must make up this share of the closest repo's name.
const MIN_COVERAGE = 0.5;

function normalise(spoken: string): string {
  return spoken
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !FILLER_WORDS.has(word))
    .join("");
}

export function listRepos(reposRoot: string): string[] {
  return readdirSync(reposRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(reposRoot, entry.name, ".git")))
    .map((entry) => entry.name);
}

export function resolveProject(spoken: string, repos: string[]): ProjectMatch {
  const wanted = normalise(spoken);
  const candidates = repos.filter((repo) => wanted && normalise(repo).includes(wanted));
  if (candidates.length === 0) {
    return { status: "unknown", known: repos };
  }
  if (candidates.length === 1) {
    return { status: "found", name: candidates[0] };
  }

  // The repo with the least extra text is the closest to what was said.
  const extraText = (repo: string) => normalise(repo).length - wanted.length;
  const smallest = Math.min(...candidates.map(extraText));
  const closest = candidates.filter((repo) => extraText(repo) === smallest);

  const isClearWinner = closest.length === 1 && wanted.length / normalise(closest[0]).length >= MIN_COVERAGE;
  if (isClearWinner) {
    return { status: "found", name: closest[0] };
  }
  return { status: "ambiguous", matches: candidates };
}
