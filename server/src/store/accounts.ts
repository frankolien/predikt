/**
 * Free-to-play accounts + points balances (Postgres-backed).
 *
 * Every balance change goes through `adjustPoints`, which writes an immutable
 * ledger row in the same transaction — so a user's points are always the exact
 * sum of their ledger. Sessions are simple opaque tokens for now; the issuer is
 * the single place to swap in magic-link auth before launch.
 */
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, sessions, pointsLedger } from '../db/schema.js';

const SIGNUP_BONUS = Number(process.env.GAFFER_SIGNUP_POINTS || 1000);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface Account {
  id: string;
  handle: string;
  points: number;
}

/** The transaction handle passed into `db.transaction(tx => …)`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createAccount(handle: string): Promise<{ account: Account; token: string }> {
  const id = randomUUID();
  const now = new Date();
  const name = (handle || 'Anon').toString().trim().slice(0, 40) || 'Anon';
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id, handle: name, points: SIGNUP_BONUS, createdAt: now });
    await tx
      .insert(pointsLedger)
      .values({ id: randomUUID(), userId: id, delta: SIGNUP_BONUS, reason: 'signup', createdAt: now });
  });
  return { account: { id, handle: name, points: SIGNUP_BONUS }, token: await issueSession(id) };
}

export async function issueSession(userId: string): Promise<string> {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const now = new Date();
  await db
    .insert(sessions)
    .values({ token, userId, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) });
  return token;
}

export async function accountFromToken(token?: string | null): Promise<Account | null> {
  if (!token) return null;
  const s = (await db.select().from(sessions).where(eq(sessions.token, token)).limit(1))[0];
  if (!s || s.expiresAt.getTime() < Date.now()) return null;
  return getAccount(s.userId);
}

export async function getAccount(userId: string): Promise<Account | null> {
  const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  return u ? { id: u.id, handle: u.handle, points: u.points } : null;
}

/**
 * Adjust a user's points atomically with a ledger entry. Pass the transaction
 * handle from a `db.transaction(async tx => …)` so the debit/credit and its side
 * effects (member insert, settlement) commit together. Throws if it would go
 * negative. Returns the new balance.
 */
export async function adjustPoints(
  tx: Tx,
  userId: string,
  delta: number,
  reason: 'signup' | 'stake' | 'payout' | 'refund' | 'bonus',
  poolId?: string,
): Promise<number> {
  const u = (await tx.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!u) throw new Error('unknown user');
  const next = u.points + delta;
  if (next < 0) throw new Error('insufficient points');
  await tx.update(users).set({ points: next }).where(eq(users.id, userId));
  await tx
    .insert(pointsLedger)
    .values({ id: randomUUID(), userId, delta, reason, poolId, createdAt: new Date() });
  return next;
}

/** Global points leaderboard (top players by balance). */
export async function leaderboard(limit = 20): Promise<Array<{ id: string; handle: string; points: number }>> {
  return db
    .select({ id: users.id, handle: users.handle, points: users.points })
    .from(users)
    .orderBy(desc(users.points))
    .limit(limit);
}
