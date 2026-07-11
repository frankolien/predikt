/**
 * Wallet-as-identity auth (client-side custody).
 *
 * A user's self-custodial wallet IS their account, keyed to its address. The
 * CLIENT holds the seed and proves ownership by signing a SIWE challenge — the
 * server only ever sees an address + a signature, never the phrase.
 *
 *   • registerByAddress()  → new account for a client-generated, SIWE-proved address
 *   • resumeByAddress()    → resume (or adopt) a SIWE-proved address
 *
 * Gas funding + demo-USD₮ mint run in the background (operator-driven, no user key).
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, pointsLedger } from '../db/schema.js';
import { issueSession, type Account } from './accounts.js';
import * as manager from '../pool/manager.js';

const SIGNUP_BONUS = Number(process.env.GAFFER_SIGNUP_POINTS || 1000);

export interface WalletAuthResult {
  account: Account;
  token: string;
  wallet: { address: string; backend: string; usdtHuman: number };
  mnemonic?: string; // returned ONCE, only when a brand-new phrase is generated
  isNew: boolean;
}

async function userByAddress(address: string) {
  return (await db.select().from(users).where(eq(users.walletAddress, address)).limit(1))[0];
}

/** A friendly default handle when the user doesn't pick one. */
function defaultHandle(handle: string | undefined, address: string): string {
  const h = (handle || '').trim();
  return h ? h.slice(0, 40) : `baller_${address.slice(2, 6).toLowerCase()}`;
}

/** Insert a new user row + signup-bonus ledger entry, keyed to a wallet address. */
async function insertUser(address: string, handle?: string): Promise<Account> {
  const id = randomUUID();
  const now = new Date();
  const name = defaultHandle(handle, address);
  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id, handle: name, points: SIGNUP_BONUS, walletAddress: address, createdAt: now });
    await tx
      .insert(pointsLedger)
      .values({ id: randomUUID(), userId: id, delta: SIGNUP_BONUS, reason: 'signup', createdAt: now });
  });
  return { id, handle: name, points: SIGNUP_BONUS };
}

/**
 * Client-side custody: register a brand-new account keyed to an address the CLIENT
 * generated + proved ownership of (SIWE). The server never sees the seed. Gas +
 * demo-USD₮ funding runs in the background (operator-driven, needs no user key).
 */
export async function registerByAddress(address: string, handle?: string): Promise<WalletAuthResult> {
  const existing = await userByAddress(address);
  if (existing) {
    void manager.topUpIfLow(address as `0x${string}`).catch(() => {});
    return {
      account: { id: existing.id, handle: existing.handle, points: existing.points },
      token: await issueSession(existing.id),
      wallet: { address, backend: manager.walletBackend(), usdtHuman: await manager.walletBalance(address as `0x${string}`) },
      isNew: false,
    };
  }
  const account = await insertUser(address, handle);
  void manager.fundWallet(address as `0x${string}`).catch((e) => console.warn(`[auth] fundWallet ${address} failed:`, (e as Error).message));
  return {
    account,
    token: await issueSession(account.id),
    wallet: { address, backend: manager.walletBackend(), usdtHuman: 0 },
    isNew: true,
  };
}

/**
 * Client-side custody: resume (or adopt) the account for an address the client
 * proved ownership of via SIWE. No seed is transmitted — the signature is proof.
 */
export async function resumeByAddress(address: string): Promise<WalletAuthResult> {
  const existing = await userByAddress(address);
  if (!existing) return registerByAddress(address); // unseen key → adopt as new account
  void manager.topUpIfLow(address as `0x${string}`).catch(() => {});
  return {
    account: { id: existing.id, handle: existing.handle, points: existing.points },
    token: await issueSession(existing.id),
    wallet: { address, backend: manager.walletBackend(), usdtHuman: await manager.walletBalance(address as `0x${string}`) },
    isNew: false,
  };
}

