import Database from "better-sqlite3";
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
