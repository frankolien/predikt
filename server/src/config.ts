/**
 * Runtime configuration.
 *
 * One value picks the chain — GAFFER_NETWORK (see ./chain/networks.ts):
 *  - local (default): bundled `anvil` + a MockUSDT we deploy. Offline,
 *    deterministic, zero real funds — ideal for a judge to run.
 *  - arbitrum-sepolia: real persistent testnet + our test-USD₮ (auto-faucet).
 *  - arbitrum: Arbitrum One mainnet + real USD₮0, no faucet (real money).
 *
 * The "operator" account is the tournament host: it deploys the token +
 * per-fixture PredictionPool contracts and acts as the result oracle. It never
 * custodies fan funds — the pool contract does. Locally it's anvil account #0,
 * derived from the standard test mnemonic (so it's pre-funded with ETH); on a
 * real network set GAFFER_OPERATOR_KEY to a funded key.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NETWORKS, DEFAULT_NETWORK, type NetworkPreset } from './chain/networks.js';

export type Mode = 'local' | 'testnet' | 'mainnet';

/**
 * Active network. Prefer GAFFER_NETWORK (local | arbitrum-sepolia | arbitrum);
 * fall back to the legacy GAFFER_MODE (testnet → arbitrum-sepolia) so old configs
 * still work. Flipping this one value moves the whole app between chains.
 */
const NETWORK_KEY =
  process.env.GAFFER_NETWORK || // `||` so an empty env var falls through, not just undefined
  (process.env.GAFFER_MODE === 'testnet' ? 'arbitrum-sepolia' : DEFAULT_NETWORK);

export const network: NetworkPreset = NETWORKS[NETWORK_KEY] ?? NETWORKS[DEFAULT_NETWORK];

// `mode` now mirrors the active network's kind (local | testnet | mainnet) so the UI
// and /api/health report the truth — on Arbitrum One this is 'mainnet', not 'testnet'.
// Only the `=== 'local'` branches are behavioral; nothing keys off 'testnet'.
export const MODE: Mode = network.kind;

/** Absolute path to the built SPA (Vite output). Served by Fastify in production. */
export const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

/**
 * Serve the web build from this server (single-service deploy). On by default
 * whenever `web/dist` exists; force with GAFFER_SERVE_WEB=1/0. In local dev the
 * build is absent, so we don't serve it — Vite's dev server + proxy is used.
 */
export const SERVE_WEB =
  process.env.GAFFER_SERVE_WEB === '1' ||
  (process.env.GAFFER_SERVE_WEB !== '0' && existsSync(`${WEB_DIST}/index.html`));

/** Standard anvil/hardhat deterministic mnemonic — accounts are pre-funded with ETH. */
export const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';

export const config = {
  mode: MODE,
  /** The full active-network preset (chain, explorer, faucet policy, …). */
  network,
  port: Number(process.env.PORT || 8787),
  /** Serve the built SPA from this process (true in the single-service container). */
  serveWeb: SERVE_WEB,
  webDist: WEB_DIST,
  rpcUrl: process.env.GAFFER_RPC_URL || network.defaultRpc,
  chainId: Number(process.env.GAFFER_CHAIN_ID || network.chain.id),
  usdtDecimals: 6,
  /**
   * On local the operator key comes from the test mnemonic (anvil #0). On a real
   * network set GAFFER_OPERATOR_KEY to a funded key.
   */
  operatorKey: process.env.GAFFER_OPERATOR_KEY as `0x${string}` | undefined,
  /** USD₮ token address. Local auto-deploys a MockUSDT; testnet/mainnet set this. */
  usdtAddress: process.env.GAFFER_USDT_ADDRESS as `0x${string}` | undefined,
} as const;

/** Where the local deploy step records freshly-deployed contract addresses. */
export const DEPLOYMENTS_PATH = new URL('../../deployments.local.json', import.meta.url).pathname;
