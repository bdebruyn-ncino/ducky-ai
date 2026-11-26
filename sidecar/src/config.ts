import { readFileSync } from "node:fs";

export interface DuckyConfig {
  modelArn: string;
  awsProfile: string;
  awsRegion: string;
  reposRoot: string;
}

const DEFAULT_PATH = new URL("../../ducky.config.json", import.meta.url);

export function loadConfig(path: string | URL = process.env.DUCKY_CONFIG ?? DEFAULT_PATH): DuckyConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Config not found at ${path}. Copy ducky.config.example.json to ducky.config.json and fill it in.`);
  }
  return parseConfig(JSON.parse(raw));
}

export function parseConfig(value: any): DuckyConfig {
  for (const field of ["modelArn", "awsProfile", "awsRegion", "reposRoot"]) {
    if (typeof value?.[field] !== "string" || value[field] === "") {
      throw new Error(`Config field "${field}" is missing or not a non-empty string.`);
    }
  }
  return value;
}
