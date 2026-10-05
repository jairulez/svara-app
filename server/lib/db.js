import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

// Silence the one-time node:sqlite experimental warning only.
const origEmit = process.emitWarning;
process.emitWarning = (w, ...a) => (String(w).includes('SQLite') ? undefined : origEmit.call(process, w, ...a));
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const today = (d = new Date()) => d.toISOString().slice(0, 10);

// Parameterised helpers — all SQL goes through prepared statements (SQL-injection safe).
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
export const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};
const enc = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? +v : v === undefined ? null : v);

/** Insert a row, auto-filling id + timestamps. Column names must come from code, never from user input. */
export function insert(table, row) {
  const t = now();
  const r = { id: uuid(), created_at: t, updated_at: t, ...row };
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => enc(r[c])));
  return r;
}
export function update(table, id, patch) {
  const r = { ...patch, updated_at: now() };
  const cols = Object.keys(r);
  db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`).run(...cols.map((c) => enc(r[c])), id);
}
export const j = (s, fallback = {}) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

export function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');
  const applied = new Set(all('SELECT name FROM _migrations').map((r) => r.name));
  const ran = [];
  for (const f of fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()) {
    if (applied.has(f)) continue;
    tx(() => { db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); run('INSERT INTO _migrations VALUES (?,?)', f, now()); });
    ran.push(f);
  }
  return ran;
}

// ---- app settings (admin-editable feature flags / AI config) ----
export const DEFAULT_SETTINGS = {
  'ai.guide_enabled': true, 'ai.llm_enabled': false, 'ai.weekly_reports_enabled': true,
  'ai.question_selection_enabled': true, 'ai.max_questions_per_day': 3, 'ai.guide_context_messages': 6,
  'features.products_catalogue': true, 'features.clinician_pathway': true, 'features.content_hub': true,
};
export function setting(key) {
  const r = get('SELECT value FROM app_settings WHERE key=?', key);
  return r ? JSON.parse(r.value) : DEFAULT_SETTINGS[key];
}
export function setSetting(key, value) {
  run('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', key, JSON.stringify(value), now());
}
