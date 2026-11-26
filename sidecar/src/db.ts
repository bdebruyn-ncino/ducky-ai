import Database from "better-sqlite3";
import type { HistoryEntry, HistoryKind } from "../../shared/messages.ts";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface DbSettings {
  modelArn: string;
  awsProfile: string;
  awsRegion: string;
  reposRoot: string;
}

export interface DbProject {
  name: string;
  path: string;
}

/** Returns the path to the SQLite database, overridable via DUCKY_DB for tests. */
export function dbPath(): string {
  if (process.env.DUCKY_DB) {
    return process.env.DUCKY_DB;
  }
  const home = homedir();
  const appDataDir =
    process.platform === "darwin"
      ? join(home, "Library", "Application Support", "ducky-ai")
      : join(home, ".config", "ducky-ai");
  return join(appDataDir, "ducky.db");
}

/** Opens (and initialises) the database at the given path. Creates the directory if needed. */
export function openDb(path = dbPath()): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      name TEXT PRIMARY KEY,
      path TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      at          TEXT NOT NULL,
      kind        TEXT NOT NULL,
      repo        TEXT,
      text        TEXT NOT NULL,
      duration_ms INTEGER
    );
  `);
  return db;
}

/** Returns the stored settings, or null if any required key is missing. */
export function readSettings(db: Database.Database): DbSettings | null {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!m.modelArn || !m.awsProfile || !m.awsRegion || !m.reposRoot) {
    return null;
  }
  return { modelArn: m.modelArn, awsProfile: m.awsProfile, awsRegion: m.awsRegion, reposRoot: m.reposRoot };
}

/** Writes (upserts) all four settings keys. */
export function writeSettings(db: Database.Database, settings: DbSettings): void {
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(settings) as [string, string][]) {
      stmt.run(k, v);
    }
  });
  tx();
}

/** Returns every project row ordered by name. */
export function readProjects(db: Database.Database): DbProject[] {
  return db.prepare("SELECT name, path FROM projects ORDER BY name").all() as DbProject[];
}

/** Replaces the entire projects table in one transaction. */
export function writeProjects(db: Database.Database, projects: DbProject[]): void {
  const tx = db.transaction(() => {
    db.exec("DELETE FROM projects");
    const stmt = db.prepare("INSERT INTO projects (name, path) VALUES (?, ?)");
    for (const p of projects) {
      stmt.run(p.name, p.path);
    }
  });
  tx();
}

// History is local, so it is capped: when it passes this, the oldest entries go.
export const MAX_HISTORY_ENTRIES = 500;

/** Records one thing that happened, and drops the oldest entries beyond the cap. */
export function addHistory(
  db: Database.Database,
  entry: { kind: HistoryKind; text: string; repo?: string; durationMs?: number },
  now = new Date(),
): void {
  db.prepare("INSERT INTO history (at, kind, repo, text, duration_ms) VALUES (?, ?, ?, ?, ?)").run(
    now.toISOString(),
    entry.kind,
    entry.repo ?? null,
    entry.text,
    entry.durationMs ?? null,
  );
  db.prepare("DELETE FROM history WHERE id <= (SELECT MAX(id) FROM history) - ?").run(MAX_HISTORY_ENTRIES);
}

/** Returns the most recent entries, newest first. */
export function readHistory(db: Database.Database, limit = 100): HistoryEntry[] {
  const rows = db
    .prepare("SELECT id, at, kind, repo, text, duration_ms FROM history ORDER BY id DESC LIMIT ?")
    .all(limit) as { id: number; at: string; kind: HistoryKind; repo: string | null; text: string; duration_ms: number | null }[];
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    kind: row.kind,
    ...(row.repo ? { repo: row.repo } : {}),
    text: row.text,
    ...(row.duration_ms !== null ? { durationMs: row.duration_ms } : {}),
  }));
}

/** Deletes all history. */
export function clearHistory(db: Database.Database): void {
  db.exec("DELETE FROM history");
}
