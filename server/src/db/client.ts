/**
 * Postgres database client (Drizzle + postgres-js). One process-wide pool.
 * `initDb()` applies migrations at boot so the schema is always current.
 *
 * DATABASE_URL is provided by the host (Railway). Its public URL needs SSL,
 * internal networking doesn't — honour ?sslmode=require / DATABASE_SSL. Locally
 * it defaults to the docker Postgres on :5433.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL || 'postgres://gaffer:gaffer@127.0.0.1:5433/gaffer';
const sslRequired = /sslmode=require/i.test(url) || process.env.DATABASE_SSL === 'require';

const client = postgres(url, { max: 10, ssl: sslRequired ? 'require' : undefined });

export const db = drizzle(client, { schema });

/** Apply migrations (idempotent). Call once at server boot. */
export async function initDb(): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
  await migrate(db, { migrationsFolder });
  console.log('[db] ready — postgres');
}

/** Close the pool (graceful shutdown). */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
