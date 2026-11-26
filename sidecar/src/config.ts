import { readFileSync } from "node:fs";
import type { DbSettings } from "./db.ts";

export interface DuckyConfig {
  modelArn: string;
  awsProfile: string;
  awsRegion: string;
  reposRoot: string;
}

/**
 * Parses and validates a config object (from JSON or DB settings).
 * Throws if any required field is absent.
 */
export function parseConfig(value: any): DuckyConfig {
  for (const field of ["modelArn", "awsProfile", "awsRegion", "reposRoot"]) {
    if (typeof value?.[field] !== "string" || value[field] === "") {
      throw new Error(`Config field "${field}" is missing or not a non-empty string.`);
    }
  }
  return value as DuckyConfig;
}

/**
 * Loads config from the JSON file pointed at by DUCKY_CONFIG (dev / testing only).
 * Returns null when the env var is not set.
 */
export function loadConfigFromJson(): DuckyConfig | null {
  if (!process.env.DUCKY_CONFIG) {
    return null;
  }
  try {
    return parseConfig(JSON.parse(readFileSync(process.env.DUCKY_CONFIG, "utf8")));
  } catch (err) {
    throw new Error(`Failed to load JSON config from ${process.env.DUCKY_CONFIG}: ${err}`);
  }
}

/** Converts DB settings to DuckyConfig (they share the same shape). */
export function configFromDb(settings: DbSettings): DuckyConfig {
  return settings;
}
