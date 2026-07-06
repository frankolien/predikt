/**
 * Wallet-as-identity auth.
 *
 * A user's self-custodial WDK wallet IS their account. The BIP-39 recovery
 * phrase deterministically derives a wallet address; the account is keyed to
 * that address. So the same phrase signs you in — and recovers your account —
 * on any device, with no password and no server-side secret.
 *
 *   • createWalletAccount()  → mint a fresh wallet + account (phrase shown ONCE)
 *   • signInWithMnemonic()   → derive the address, resume (or adopt) that account
 *
 * Sign-up is instant: we derive the address (fast) and return immediately, then
 * fund gas + mint demo USD₮ in the background. The phrase is never persisted
 * server-side — self-custody means the user holds it.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, pointsLedger } from '../db/schema.js';
import { issueSession, type Account } from './accounts.js';
import * as manager from '../pool/manager.js';
import * as wallet from '../wdk/wallet.js';

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
 * Create a brand-new wallet-backed account. Returns instantly with the recovery
 * phrase (shown once); gas funding + demo-USD₮ mint run in the background.
 */
export async function createWalletAccount(handle?: string): Promise<WalletAuthResult> {
  const name = defaultHandle(handle, '0x0000');
  const fan = await wallet.createFan(name); // fast: derive seed + address, hold key for this session
  const address = fan.address;

  // Astronomically unlikely, but if this address already has an account, resume it.
  const existing = await userByAddress(address);
  if (existing) {
    void manager.topUpIfLow(address).catch(() => {}); // refill if a faucet-chain reset drained them
    return {
      account: { id: existing.id, handle: existing.handle, points: existing.points },
      token: await issueSession(existing.id),
      wallet: { address, backend: fan.backend, usdtHuman: await manager.walletBalance(address) },
      isNew: false,
    };
  }

  const account = await insertUser(address, handle);
  // Slow chain work (gas + mint) off the request path — balance shows 0 → funds land shortly.
  void manager.fundWallet(address).catch((e) => console.warn(`[auth] fundWallet ${address} failed:`, (e as Error).message));

  return {
    account,
    token: await issueSession(account.id),
    wallet: { address, backend: fan.backend, usdtHuman: 0 },
    mnemonic: fan.mnemonic,
    isNew: true,
  };
}

/**
 * Sign in / recover from a recovery phrase. Derives the address, then resumes the
 * matching account — or adopts the wallet as a fresh account if it's unseen
 * (importing an external WDK wallet). Throws on an invalid phrase.
 */
export async function signInWithMnemonic(mnemonic: string, handle?: string): Promise<WalletAuthResult> {
  if (!wallet.isValidMnemonic(mnemonic)) {
    throw new Error('That doesn’t look like a valid 12-word recovery phrase.');
  }
  const imported = await manager.importWallet(mnemonic, defaultHandle(handle, '0x0000'));
  const address = imported.address;

  const existing = await userByAddress(address);
  if (existing) {
    void manager.topUpIfLow(address).catch(() => {}); // refill if a faucet-chain reset drained them
    return {
      account: { id: existing.id, handle: existing.handle, points: existing.points },
      token: await issueSession(existing.id),
      wallet: { address, backend: imported.backend, usdtHuman: imported.usdtHuman },
      isNew: false,
    };
  }

  // Valid phrase we've never seen → adopt it as a new account.
  const account = await insertUser(address, handle);
  void manager.fundWallet(address).catch(() => {});
  return {
    account,
    token: await issueSession(account.id),
    wallet: { address, backend: imported.backend, usdtHuman: imported.usdtHuman },
    isNew: true,
  };
}
