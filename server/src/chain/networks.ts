/**
 * Network presets — one place that defines every chain Predikt can run on.
 * The active one is chosen by GAFFER_NETWORK (see config.ts); flipping that one
 * value moves the whole app local → testnet → mainnet. Adding a chain is adding
 * an entry here.
 *
 *   local            — bundled anvil, MockUSDT we deploy, auto-faucet. The demo.
 *   arbitrum-sepolia — real persistent testnet, our test-USD₮, auto-faucet.
 *   arbitrum         — Arbitrum One mainnet, real USD₮0, NO faucet (real money).
 */
import { defineChain, type Chain } from 'viem';

export type NetworkKind = 'local' | 'testnet' | 'mainnet';

export interface NetworkPreset {
  key: string;
  label: string;
  kind: NetworkKind;
  chain: Chain;
  defaultRpc: string;
  /** Block-explorer base for tx links; '' when there's no explorer (local). */
  explorer: string;
  /** Auto-fund new wallets (gas + mint test-USD₮). Always false on mainnet. */
  faucet: boolean;
  /** Native ETH dripped to a fresh wallet so it can pay gas. */
  gasDrip: string;
}

const anvilLocal = defineChain({
  id: 31337,
  name: 'Predikt Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

const arbitrumSepolia = defineChain({
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] } },
  blockExplorers: { default: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' } },
  testnet: true,
});

const arbitrumOne = defineChain({
  id: 42161,
  name: 'Arbitrum One',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://arb1.arbitrum.io/rpc'] } },
  blockExplorers: { default: { name: 'Arbiscan', url: 'https://arbiscan.io' } },
});

/**
 * Canonical USD₮ on Arbitrum One (6 decimals) — the real token a mainnet balance
 * reads from. Overridable per network via GAFFER_USDT_ADDRESS_ARBITRUM (e.g. to
 * point at USD₮0). Only ever used on the mainnet money path; never minted.
 */
export const ARBITRUM_ONE_USDT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

export const NETWORKS: Record<string, NetworkPreset> = {
  local: {
    key: 'local',
    label: 'Local',
    kind: 'local',
    chain: anvilLocal,
    defaultRpc: 'http://127.0.0.1:8545',
    explorer: '',
    faucet: true,
    gasDrip: '1',
  },
  'arbitrum-sepolia': {
    key: 'arbitrum-sepolia',
    label: 'Arbitrum Sepolia',
    kind: 'testnet',
    chain: arbitrumSepolia,
    defaultRpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorer: 'https://sepolia.arbiscan.io',
    faucet: true,
    gasDrip: '0.002',
  },
  arbitrum: {
    key: 'arbitrum',
    label: 'Arbitrum One',
    kind: 'mainnet',
    chain: arbitrumOne,
    defaultRpc: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io',
    faucet: false,
    gasDrip: '0',
  },
};

export const DEFAULT_NETWORK = 'local';

/** Env-var suffix for a network key: `arbitrum-sepolia` → `ARBITRUM_SEPOLIA`. */
function envSuffix(key: string): string {
  return key.replace(/-/g, '_').toUpperCase();
}

/**
 * The USD₮ token for a network, for the runtime wallet-network switch. Each
 * network can be pointed at its own token with GAFFER_USDT_ADDRESS_<KEY>
 * (e.g. GAFFER_USDT_ADDRESS_ARBITRUM). Arbitrum One falls back to the canonical
 * USD₮. Local/testnet have no default (local deploys one at boot; testnet is set
 * per deploy) → undefined means "not switchable to from another network".
 */
export function usdtAddressFor(key: string): `0x${string}` | undefined {
  const env = process.env[`GAFFER_USDT_ADDRESS_${envSuffix(key)}`];
  if (env) return env as `0x${string}`;
  if (key === 'arbitrum') return ARBITRUM_ONE_USDT as `0x${string}`;
  return undefined;
}

/** RPC URL for a network: GAFFER_RPC_URL_<KEY> override, else the preset default. */
export function rpcUrlFor(key: string): string {
  return process.env[`GAFFER_RPC_URL_${envSuffix(key)}`] || (NETWORKS[key]?.defaultRpc ?? '');
}

/**
 * ERC-4337 bundler URL for a network (Layer C gasless): GAFFER_BUNDLER_URL_<KEY>.
 * undefined ⇒ no gasless on this network → the client falls back to the M1
 * EOA-sign→relay path. Public info (a bundler RPC), so it's safe in /api/health.
 */
export function bundlerUrlFor(key: string): string | undefined {
  return process.env[`GAFFER_BUNDLER_URL_${envSuffix(key)}`] || undefined;
}

/**
 * Candide (ERC-20/USD₮) paymaster URL for a network: GAFFER_PAYMASTER_URL_<KEY>.
 * undefined ⇒ no gasless. Present with a bundler ⇒ gas-in-USD₮ is available and
 * the fan never needs ETH. Public info (a paymaster RPC endpoint).
 */
export function paymasterUrlFor(key: string): string | undefined {
  return process.env[`GAFFER_PAYMASTER_URL_${envSuffix(key)}`] || undefined;
}
