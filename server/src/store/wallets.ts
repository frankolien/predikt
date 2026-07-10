/**
 * Links a self-custodial USD₮ wallet (WDK) to a free-to-play account.
 *
 * Creating a wallet derives a fresh BIP-39 seed (WDK), funds it with gas, and
 * mints demo USD₮ so it can play immediately. We persist only the address on the
 * user — the seed lives in the wallet layer's process memory for the demo (a
 * real deployment keeps it on the user's device). Balance reads work by address
 * even across restarts; signing a buy-in needs the in-session key.
 */
import { eq } from 'drizzle-orm';
import type { Address } from 'viem';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import * as manager from '../pool/manager.js';
import { tokenBalance } from '../wdk/wallet.js';
import * as escrow from '../wdk/escrow.js';
import type { NetworkContext } from '../chain/context.js';

export interface LinkedWallet {
  address: string;
  usdtHuman: number;
  backend: string;
  mnemonic?: string; // returned once, on first creation
}

export async function walletAddressOf(userId: string): Promise<string | null> {
  const row = (await db.select({ a: users.walletAddress }).from(users).where(eq(users.id, userId)).limit(1))[0];
  return row?.a ?? null;
}

export async function balanceOf(address: string): Promise<number> {
  try {
    return escrow.toHuman(await tokenBalance(address as Address, escrow.token()));
  } catch {
    return 0;
  }
}

/**
 * Balance of an address on a SPECIFIC network (the wallet's network switch). The
 * same self-custodial address, read against another chain's USD₮ token. Returns 0
 * when that network has no known token (nothing to read).
 */
export async function balanceOfOn(address: string, ctx: NetworkContext): Promise<number> {
  if (!ctx.usdtAddress) return 0;
  try {
    return escrow.toHuman(await tokenBalance(address as Address, ctx.usdtAddress, ctx));
  } catch {
    return 0;
  }
}

/** Create + link a wallet (idempotent — returns the existing one if already linked). */
export async function linkWallet(userId: string): Promise<LinkedWallet> {
  const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!u) throw new Error('unknown user');
  if (u.walletAddress) {
    return { address: u.walletAddress, usdtHuman: await balanceOf(u.walletAddress), backend: manager.walletBackend() };
  }
  const w = await manager.createWallet(u.handle);
  await db.update(users).set({ walletAddress: w.address }).where(eq(users.id, userId));
  return { address: w.address, usdtHuman: w.usdtHuman, backend: w.backend, mnemonic: w.mnemonic };
}

export async function getWallet(userId: string): Promise<LinkedWallet | null> {
  const addr = await walletAddressOf(userId);
  if (!addr) return null;
  return { address: addr, usdtHuman: await balanceOf(addr), backend: manager.walletBackend() };
}
