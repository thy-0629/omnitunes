import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { config } from '../config/env.js';
import * as schema from './schema.js';

/**
 * Resolve a `file:./relative/path` URL into an absolute path.
 * Other URL schemes are left untouched (Postgres in the future).
 */
function resolveSqliteUrl(url: string): string {
  const prefix = 'file:';
  if (!url.startsWith(prefix)) return url;
  const raw = url.slice(prefix.length);
  // split off query string (better-sqlite3 supports ?mode=ro etc.)
  const path = raw.split('?')[0] ?? '';
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

/**
 * Open the SQLite database, ensure its directory exists, apply pragmas,
 * and return a typed Drizzle client. Called once at startup.
 */
export function createDb() {
  const dbPath = resolveSqliteUrl(config.DATABASE_URL);
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  // Sensible defaults for a local single-user app
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');

  const db = drizzle(sqlite, { schema });
  return { db, sqlite, dbPath };
}

export type DbClient = ReturnType<typeof createDb>['db'];