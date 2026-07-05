/**
 * Load the repo-root `.env` into process.env BEFORE any config module reads it.
 *
 * Import this FIRST as a side-effect import from every entry point:
 *   import './env.js';
 * ES modules evaluate a module's dependencies depth-first in source order, so as
 * long as this is the first import, the vars are populated before config.ts and
 * football/config.ts (which read process.env at module top-level) evaluate.
 *
 * Real shell-exported vars still win — we only fill what a `.env` provides.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const rel of ['../../.env', '../.env']) {
  const path = fileURLToPath(new URL(rel, import.meta.url));
  if (!existsSync(path)) continue;
  try {
    process.loadEnvFile(path);
  } catch (err) {
    console.warn(`[env] could not load ${path}: ${(err as Error).message}`);
  }
  break;
}
