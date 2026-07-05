/**
 * Free-to-play accounts + points balances (DB-backed).
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

export function createAccount(handle: string): { account: Account; token: string } {
  const id = randomUUID();
  const now = new Date();
  const name = (handle || 'Anon').toString().trim().slice(0, 40) || 'Anon';
  db.transaction((tx) => {
    tx.insert(users).values({ id, handle: name, points: SIGNUP_BONUS, createdAt: now }).run();
    tx.insert(pointsLedger)
      .values({ id: randomUUID(), userId: id, delta: SIGNUP_BONUS, reason: 'signup', createdAt: now })
      .run();
  });
  return { account: { id, handle: name, points: SIGNUP_BONUS }, token: issueSession(id) };
}

export function issueSession(userId: string): string {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const now = new Date();
  db.insert(sessions)
    .values({ token, userId, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
    .run();
  return token;
}

export function accountFromToken(token?: string | null): Account | null {
  if (!token) return null;
  const s = db.select().from(sessions).where(eq(sessions.token, token)).get();
  if (!s || s.expiresAt.getTime() < Date.now()) return null;
  return getAccount(s.userId);
}

export function getAccount(userId: string): Account | null {
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  return u ? { id: u.id, handle: u.handle, points: u.points } : null;
}

/**
 * Adjust a user's points atomically with a ledger entry. Pass the transaction
 * handle from a `db.transaction(tx => …)` so the debit/credit and its side
 * effects (member insert, settlement) commit together. Throws if it would go
 * negative. Returns the new balance.
 */
export function adjustPoints(
  tx: Tx,
  userId: string,
  delta: number,
  reason: 'signup' | 'stake' | 'payout' | 'refund' | 'bonus',
  poolId?: string,
): number {
  const u = tx.select().from(users).where(eq(users.id, userId)).get();
  if (!u) throw new Error('unknown user');
  const next = u.points + delta;
  if (next < 0) throw new Error('insufficient points');
  tx.update(users).set({ points: next }).where(eq(users.id, userId)).run();
  tx.insert(pointsLedger)
    .values({ id: randomUUID(), userId, delta, reason, poolId, createdAt: new Date() })
    .run();
  return next;
}

/** Global points leaderboard (top players by balance). */
export function leaderboard(limit = 20): Array<{ id: string; handle: string; points: number }> {
  return db
    .select({ id: users.id, handle: users.handle, points: users.points })
    .from(users)
    .orderBy(desc(users.points))
    .limit(limit)
    .all();
}
