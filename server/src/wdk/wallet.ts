/**
 * Self-custodial fan wallets — Tether WDK (@tetherto/wdk-wallet-evm).
 *
 * Each fan holds their OWN keys. We generate a BIP-39 seed locally, derive an
 * EVM account with WDK, and the fan signs their own approve()/deposit() calls.
 * The escrow pool is driven with WDK's `sendTransaction({to, value, data})` —
 * arbitrary contract calls, exactly how WDK's own approve() is implemented.
 *
 * Real WDK is the default. If the package can't be imported (offline install
 * issues during a live demo), we transparently fall back to a viem signer that
 * derives the SAME address from the SAME seed (WDK uses m/44'/60'/0'/0/0, which
 * matches viem's default) — so the flow is identical and clearly logged.
 *
 * NOTE: seeds live in process memory for the demo only. In a real deployment the
 * fan's device holds the seed; the server never sees it.
 */
import {
  encodeFunctionData,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from 'viem';
import { generateMnemonic, english, mnemonicToAccount } from 'viem/accounts';
import { config } from '../config.js';
import { chain, publicClient } from '../chain/client.js';
import * as artifacts from '../chain/artifacts.js';

/**
 * The chain a wallet op runs on. Defaults to the boot chain (`bootCtx` below), so
 * every existing pool/escrow caller is unchanged; the money card passes a
 * different context when the user switches networks (balance/send on another
 * chain — the same self-custodial address, a different RPC + USD₮ token).
 */
export interface ChainCtx {
  rpcUrl: string;
  chain: Chain;
  publicClient: PublicClient;
}
const bootCtx: ChainCtx = { rpcUrl: config.rpcUrl, chain, publicClient };

export type WalletBackend = 'wdk' | 'viem';

interface FanRecord {
  address: Address;
  displayName: string;
  mnemonic: string;
}

const fans = new Map<string, FanRecord>(); // key: lowercased address

let WalletAccountEvm: any = null;
let backend: WalletBackend = 'viem';
let initialized = false;

async function ensureBackend(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const mod: any = await import('@tetherto/wdk-wallet-evm');
    WalletAccountEvm = mod.WalletAccountEvm ?? mod.default?.WalletAccountEvm ?? mod.default;
    if (typeof WalletAccountEvm !== 'function') throw new Error('WalletAccountEvm export not found');
    backend = 'wdk';
    console.log('[wdk] self-custodial wallets via @tetherto/wdk-wallet-evm ✅');
  } catch (err) {
    backend = 'viem';
    console.warn(`[wdk] @tetherto/wdk-wallet-evm unavailable (${(err as Error).message}) — viem signer fallback`);
  }
}

export function currentBackend(): WalletBackend {
  return backend;
}

/** Build a WDK account object for a stored fan (rebuilt on demand; cheap). The
 *  provider RPC picks the chain — the boot chain by default, or the switched-to
 *  network when the money card passes its context. */
function wdkAccount(mnemonic: string, rpcUrl: string = config.rpcUrl) {
  return new WalletAccountEvm(mnemonic, "0'/0/0", { provider: rpcUrl });
}

async function deriveAddress(mnemonic: string): Promise<Address> {
  await ensureBackend();
  if (backend === 'wdk') {
    return (await wdkAccount(mnemonic).getAddress()) as Address;
  }
  return mnemonicToAccount(mnemonic, { addressIndex: 0 }).address;
}

export interface NewFan {
  address: Address;
  displayName: string;
  mnemonic: string;
  backend: WalletBackend;
}

export async function createFan(displayName: string): Promise<NewFan> {
  await ensureBackend();
  const mnemonic = generateMnemonic(english);
  const address = await deriveAddress(mnemonic);
  fans.set(address.toLowerCase(), { address, displayName, mnemonic });
  return { address, displayName, mnemonic, backend };
}

/** A fresh BIP-39 recovery phrase (12 words). */
export function newMnemonic(): string {
  return generateMnemonic(english);
}

/** Normalize a pasted recovery phrase: trim, collapse whitespace, lowercase. */
export function normalizeMnemonic(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Structural validation of a recovery phrase (word count + wordlist membership). */
export function isValidMnemonic(input: string): boolean {
  const words = normalizeMnemonic(input).split(' ');
  if (words.length !== 12 && words.length !== 24) return false;
  return words.every((w) => english.includes(w));
}

export function getFan(address: string): FanRecord | undefined {
  return fans.get(address.toLowerCase());
}

export function listFans(): Array<{ address: Address; displayName: string }> {
  return [...fans.values()].map(({ address, displayName }) => ({ address, displayName }));
}

/** USDt balance of a fan (base units), on `ctx`'s chain (boot chain by default).
 *  Uses WDK's getTokenBalance when the fan's key is in session, else a public read
 *  (works for any address across restarts). */
export async function tokenBalance(address: Address, token: Address, ctx: ChainCtx = bootCtx): Promise<bigint> {
  await ensureBackend();
  const fan = getFan(address);
  if (backend === 'wdk' && fan) {
    return (await wdkAccount(fan.mnemonic, ctx.rpcUrl).getTokenBalance(token)) as bigint;
  }
  return ctx.publicClient.readContract({
    address: token,
    abi: artifacts.MockUSDT.abi,
    functionName: 'balanceOf',
    args: [address],
  }) as Promise<bigint>;
}

export interface JoinResult {
  approveTx: Hex;
  depositTx: Hex;
  backend: WalletBackend;
}

/**
 * Fan joins a pool: approve the escrow to pull `stake`, then call deposit() with
 * their predicted scoreline. Both signed by the fan's own key.
 */
export async function joinPool(params: {
  address: Address;
  pool: Address;
  token: Address;
  stake: bigint;
  homeGoals: number;
  awayGoals: number;
}): Promise<JoinResult> {
  await ensureBackend();
  const fan = getFan(params.address);
  if (!fan) throw new Error(`Unknown fan wallet: ${params.address}`);

  const depositData = encodeFunctionData({
    abi: artifacts.PredictionPool.abi,
    functionName: 'deposit',
    args: [params.homeGoals, params.awayGoals],
  });

  if (backend === 'wdk') {
    // Drive BOTH calls through sendTransaction with an explicit, chain-fetched
    // nonce. Mixing WDK's approve() helper with sendTransaction() diverges their
    // internal nonce bookkeeping and reuses nonce 0 ("nonce too low").
    const acc = wdkAccount(fan.mnemonic);
    const approveData = encodeFunctionData({
      abi: artifacts.MockUSDT.abi,
      functionName: 'approve',
      args: [params.pool, params.stake],
    });

    let nonce = await publicClient.getTransactionCount({ address: params.address, blockTag: 'pending' });
    const approveRes = await acc.sendTransaction({ to: params.token, value: 0n, data: approveData, nonce });
    const approveTx = (approveRes?.hash ?? approveRes) as Hex;
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    nonce = await publicClient.getTransactionCount({ address: params.address, blockTag: 'pending' });
    const depositRes = await acc.sendTransaction({ to: params.pool, value: 0n, data: depositData, nonce });
    const depositTx = (depositRes?.hash ?? depositRes) as Hex;
    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    return { approveTx, depositTx, backend };
    
  }

  // viem fallback — same seed, same address, same two calls.
  const account = mnemonicToAccount(fan.mnemonic, { addressIndex: 0 });
  const wallet = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const approveTx = await wallet.writeContract({
    address: params.token,
    abi: artifacts.MockUSDT.abi,
    functionName: 'approve',
    args: [params.pool, params.stake],
    account,
    chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  const depositTx = await wallet.sendTransaction({ account, chain, to: params.pool, value: 0n, data: depositData });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  return { approveTx, depositTx, backend };
}

