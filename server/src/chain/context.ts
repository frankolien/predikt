/**
 * Network-context registry — the runtime backbone of the wallet's network switch.
 *
 * The app BOOTS on one chain (config.network) and its pool engine / operator /
 * faucet stay pinned there. But a fan's self-custodial wallet is just a keypair:
 * the SAME address exists on every EVM chain. This registry lazily builds a read
 * context (chain + RPC + USD₮ token) for any network so the money card — balance,
 * send, receive — can operate on whichever network the user has selected, exactly
 * like Solflare's mainnet/testnet switch.
 *
 * The boot network reuses the singletons from ./client.ts (one client, honouring
 * GAFFER_RPC_URL / GAFFER_CHAIN_ID). Other networks get their own cached client.
 * No operator/faucet here on purpose: switched networks are real wallets — the
 * user funds their own address (no minting off the boot chain).
 */
import { createPublicClient, http, type Chain, type PublicClient, type Address } from 'viem';
import { NETWORKS, usdtAddressFor, rpcUrlFor, type NetworkPreset } from './networks.js';
import { config } from '../config.js';
import { chain as bootChain, publicClient as bootPublicClient } from './client.js';

export interface NetworkContext {
  key: string;
  network: NetworkPreset;
  chain: Chain;
  rpcUrl: string;
  publicClient: PublicClient;
  /** USD₮ token on this network, if known. undefined ⇒ balance/send unavailable. */
  usdtAddress?: Address;
  /** Auto-funds new wallets (gas + mint). Only ever true on the boot chain here. */
  faucet: boolean;
}

const cache = new Map<string, NetworkContext>();

/** The boot network's key — the chain the server actually runs its pools on. */
export const BOOT_NETWORK_KEY = config.network.key;

export function isKnownNetwork(key: string): key is string {
  return key in NETWORKS;
}

/**
 * Build (or reuse) the read context for a network. The boot network reuses the
 * app's existing client + configured token; every other network gets a fresh,
 * cached viem client pointed at its RPC and its configured/known USD₮ token.
 */
export function getContext(key: string): NetworkContext {
  const cached = cache.get(key);
  if (cached) return cached;

  const preset = NETWORKS[key];
  if (!preset) throw new Error(`unknown network: ${key}`);

  let ctx: NetworkContext;
  if (key === BOOT_NETWORK_KEY) {
    // Reuse the boot singletons so there's exactly one client on the live chain.
    ctx = {
      key,
      network: preset,
      chain: bootChain,
      rpcUrl: config.rpcUrl,
      publicClient: bootPublicClient,
      // Boot token may only be known at runtime (local deploys a MockUSDT); the
      // caller falls back to manager.usdtToken() for the boot net.
      usdtAddress: config.usdtAddress ?? usdtAddressFor(key),
      faucet: preset.faucet,
    };
  } else {
    const rpcUrl = rpcUrlFor(key);
    const chain: Chain = { ...preset.chain, rpcUrls: { default: { http: [rpcUrl] } } };
    ctx = {
      key,
      network: preset,
      chain,
      rpcUrl,
      publicClient: createPublicClient({ chain, transport: http(rpcUrl) }),
      usdtAddress: usdtAddressFor(key),
      // Never auto-faucet a switched-to network — the user funds their own address.
      faucet: false,
    };
  }
  cache.set(key, ctx);
  return ctx;
}

/**
 * Is a network reachable for the wallet switch? The boot network always is; other
 * networks need a known USD₮ token (mainnet has a canonical one; testnet needs an
 * env address). Local is only reachable when it IS the boot network (anvil up).
 */
export function isNetworkAvailable(key: string): boolean {
  if (key === BOOT_NETWORK_KEY) return true;
  if (key === 'local') return false;
  return !!usdtAddressFor(key);
}

/** Public network descriptor for the client's switcher (mirrors api NetworkInfo). */
export interface NetworkDescriptor {
  key: string;
  label: string;
  kind: NetworkPreset['kind'];
  chainId: number;
  explorer: string;
  faucet: boolean;
  available: boolean;
}

/** Every network the client can offer in the switcher, boot network first. */
export function listNetworks(): NetworkDescriptor[] {
  const keys = Object.keys(NETWORKS).sort((a, b) =>
    a === BOOT_NETWORK_KEY ? -1 : b === BOOT_NETWORK_KEY ? 1 : 0,
  );
  return keys.map((key) => {
    const p = NETWORKS[key];
    return {
      key,
      label: p.label,
      kind: p.kind,
      chainId: p.chain.id,
      explorer: p.explorer,
      faucet: p.faucet,
      available: isNetworkAvailable(key),
    };
  });
}
