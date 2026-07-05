/**
 * SQLite (dev) database client. One process-wide connection, WAL mode, FKs on.
 * `initDb()` applies migrations at boot so the schema is always current.
 * Swap the driver for Postgres at deploy — the Drizzle schema is portable.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

const dbPath = process.env.GAFFER_DB || fileURLToPath(new URL('../../gaffer.db', import.meta.url));

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

/** Apply migrations (idempotent). Call once at server boot. */
export function initDb(): void {
  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
  migrate(db, { migrationsFolder });
  console.log(`[db] ready — ${dbPath}`);
}
