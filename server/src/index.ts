/**
 * Gaffer server entry point.
 *
 * Boots the localhost API immediately, then (in the background) deploys the demo
 * chain contracts and warms up the on-device QVAC model, so the UI can show a
 * live loading state instead of blocking.
 */
import './env.js'; // MUST be first — populates process.env before config reads it
import { buildApp } from './api/server.js';
import { config } from './config.js';
import * as manager from './pool/manager.js';
import { ensureLoaded } from './qvac/engine.js';
import { initDb } from './db/client.js';
import { startAutoSettle } from './store/autosettle.js';
import { ensurePool } from './fantasy/squads.js';

// Free-to-play data layer (accounts, points, pools). Independent of the chain.
initDb();
startAutoSettle(); // points pools pay out from the live feed at full time
ensurePool().catch(() => {}); // warm the fantasy pool from real WC squads (falls back offline)

const app = buildApp();

await app.listen({ port: config.port, host: '127.0.0.1' });

console.log('');
console.log('  🏴  Gaffer — your keys, your model, your call');
console.log(`  ├─ API      http://127.0.0.1:${config.port}`);
console.log(`  ├─ mode     ${config.mode}`);
console.log(`  ├─ chain    ${config.rpcUrl} (chainId ${config.chainId})`);
console.log('  └─ booting  deploying contracts + loading on-device model…');
console.log('');

// Warm the on-device model in the background (first run downloads weights).
ensureLoaded().catch((err) => console.warn('[qvac] warmup error:', err?.message));

// Deploy contracts + seed the marquee pool in the background.
manager.init().catch((err) => {
  console.error('[pool] init failed — is the chain running?');
  console.error('       ', err?.message);
  if (config.mode === 'local') {
    console.error('       start a local chain first:  npm run chain   (or use  npm run demo)');
  }
});

const shutdown = async () => {
  try {
    const { unload } = await import('./qvac/engine.js');
    await unload();
  } catch {
    /* ignore */
  }
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
