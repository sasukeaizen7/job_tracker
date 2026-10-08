import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'tracker.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS offers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    company     TEXT,
    location    TEXT,
    type        TEXT NOT NULL DEFAULT 'emploi',
    contract    TEXT,
    url         TEXT,
    source      TEXT,
    external_id TEXT UNIQUE,
    description TEXT,
    salary      TEXT,
    remote      TEXT,
    status      TEXT NOT NULL DEFAULT 'a_postuler',
    priority    INTEGER NOT NULL DEFAULT 2,
    deadline    TEXT,
    applied_at  TEXT,
    posted_at   TEXT,
    contact     TEXT,
    notes       TEXT,
    tags        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    offer_id   INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_offer ON events(offer_id);

  CREATE TABLE IF NOT EXISTS searches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'linkedin',
    keywords   TEXT NOT NULL DEFAULT '',
    location   TEXT,
    time_range TEXT DEFAULT 'r604800',
    job_type   TEXT,
    work_type  TEXT,
    type       TEXT,
    max_pages  INTEGER NOT NULL DEFAULT 2,
    enabled    INTEGER NOT NULL DEFAULT 1,
    last_run   TEXT,
    last_found INTEGER,
    last_new   INTEGER,
    last_error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inbox (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL UNIQUE,
    search_id   INTEGER REFERENCES searches(id) ON DELETE SET NULL,
    title       TEXT,
    company     TEXT,
    location    TEXT,
    url         TEXT,
    posted_at   TEXT,
    state       TEXT NOT NULL DEFAULT 'new',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_inbox_state ON inbox(state);
`);

// Migrations des bases créées par une version précédente
const searchCols = db.prepare('PRAGMA table_info(searches)').all().map((c) => c.name);
if (!searchCols.includes('source')) db.exec("ALTER TABLE searches ADD COLUMN source TEXT NOT NULL DEFAULT 'linkedin'");

export const now = () => new Date().toISOString();

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
