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
