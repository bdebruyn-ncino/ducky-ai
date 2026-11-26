import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type ProjectMatch =
  | { status: "found"; name: string }
  | { status: "ambiguous"; matches: string[] }
  | { status: "unknown"; known: string[] };

export type TextMatch =
  | { status: "found"; name: string }
  | { status: "unclear"; options: string[] };

const FILLER_WORDS = new Set(["the", "repo", "repository", "project"]);

// With several matches, the spoken name must make up this share of the closest repo's name.
const MIN_COVERAGE = 0.5;

// Longest run of words that might be a repo name when scanning a sentence.
const MAX_PHRASE_WORDS = 3;

function normalise(spoken: string): string {
  return spoken
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !FILLER_WORDS.has(word))
    .join("");
}

function coverage(spoken: string, repo: string): number {
  return normalise(spoken).length / normalise(repo).length;
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

  const isClearWinner = closest.length === 1 && coverage(spoken, closest[0]) >= MIN_COVERAGE;
  if (isClearWinner) {
    return { status: "found", name: closest[0] };
  }
  return { status: "ambiguous", matches: candidates };
}

function* phrasesOf(words: string[]): Generator<string> {
  for (let size = 1; size <= MAX_PHRASE_WORDS; size++) {
    for (let start = 0; start + size <= words.length; start++) {
      yield words.slice(start, start + size).join(" ");
    }
  }
}

// Finds the repo a sentence is about, for example "why is the auto spread repo failing".
// When it can't be sure, it returns the closest repos so the user can pick one.
export function findRepoInText(text: string, repos: string[]): TextMatch {
  const words = text.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const longestPhraseFor = new Map<string, number>();
  const nearMisses = new Set<string>();

  for (const phrase of phrasesOf(words)) {
    const match = resolveProject(phrase, repos);
    if (match.status === "found" && coverage(phrase, match.name) >= MIN_COVERAGE) {
      const length = normalise(phrase).length;
      longestPhraseFor.set(match.name, Math.max(longestPhraseFor.get(match.name) ?? 0, length));
    } else if (match.status === "found") {
      nearMisses.add(match.name);
    } else if (match.status === "ambiguous") {
      match.matches.forEach((repo) => nearMisses.add(repo));
    }
  }

  if (longestPhraseFor.size === 0) {
    return { status: "unclear", options: nearMisses.size > 0 ? [...nearMisses] : repos };
  }

  // The repo named with the longest phrase wins ("auto spread parallel" beats "auto spread").
  const longest = Math.max(...longestPhraseFor.values());
  const best = [...longestPhraseFor].filter(([, length]) => length === longest).map(([name]) => name);
  return best.length === 1 ? { status: "found", name: best[0] } : { status: "unclear", options: best };
}
