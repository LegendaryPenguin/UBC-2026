import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = process.env.THESIS_DATA_DIR
  ? path.resolve(process.env.THESIS_DATA_DIR)
  : path.join(process.cwd(), ".data");

const DB_FILE = process.env.THESIS_DB_FILE
  ? path.resolve(process.env.THESIS_DB_FILE)
  : path.join(DATA_DIR, "thesis.db");

const LEGACY_JSON = process.env.THESIS_STORE_FILE
  ? path.resolve(process.env.THESIS_STORE_FILE)
  : path.join(DATA_DIR, "store.json");

type GlobalDb = typeof globalThis & { __thesisSqlite?: Database.Database };

function openDb(): Database.Database {
  const existing = (globalThis as GlobalDb).__thesisSqlite;
  if (existing) return existing;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  (globalThis as GlobalDb).__thesisSqlite = db;
  return db;
}

export function dbPath() {
  return DB_FILE;
}

export function readKv(key: string): string | null {
  const row = openDb().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function writeKv(key: string, value: string) {
  openDb().prepare(`
    INSERT INTO kv (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
}

export function legacyJsonPath() {
  return LEGACY_JSON;
}

export function readLegacyJsonFile(): string | null {
  try {
    return fs.readFileSync(LEGACY_JSON, "utf8");
  } catch {
    return null;
  }
}
