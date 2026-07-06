/**
 * Prediction pools (Postgres-backed, free-to-play + real USD₮).
 *
 * Mirrors the on-chain pool semantics — fixed buy-in, join with a scoreline,
 * settle pro-rata to correct-outcome callers. Free-to-play pools run in POINTS
 * (zero wallet/gas friction); `currency='usdt'` runs the identical flow through
 * real on-chain USD₮ via the shared treasury escrow. Settlement reuses the same
 * pure math (`computeSettlement`) in the currency's base unit either way.
 *
 * NOTE: with postgres-js a transaction runs on its OWN connection (the `tx`
 * handle), so every write inside `db.transaction` MUST use `tx` — a `db.*` call
 * there would run on a different pooled connection, outside the transaction.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pools, poolMembers, users } from '../db/schema.js';
import { adjustPoints } from './accounts.js';
import { walletAddressOf } from './wallets.js';
import * as escrow from '../wdk/escrow.js';
import { getFixture, getTeam } from '../football/index.js';
import { settlePool as computeSettlement } from '../pool/settlement.js';
import type { MatchResult } from '../types.js';

const DEFAULT_BUYIN = Number(process.env.GAFFER_BUYIN || 50);

// Buy-in / pot / payouts are stored in the currency's base unit: whole points,
// or µUSD₮ (×1e6) for real USD₮. Convert only at the store boundary.
const USDT_UNIT = 1_000_000;
const toBaseUnit = (human: number, currency: string) =>
  currency === 'usdt' ? Math.round(human * USDT_UNIT) : Math.round(human);
const toDisplay = (base: number, currency: string) =>
  currency === 'usdt' ? base / USDT_UNIT : base;

const clampGoals = (n: unknown) => Math.max(0, Math.min(20, Math.round(Number(n) || 0)));

function inviteCode(): string {
  const s = randomUUID().replace(/-/g, '').toUpperCase();
  return `GAF-${s.slice(0, 4)}`;
}

function defaultName(fixtureId: string): string {
  const fx = getFixture(fixtureId);
  if (!fx) return 'Prediction pool';
  return `${getTeam(fx.homeTeamId).name} v ${getTeam(fx.awayTeamId).name}`;
}

export async function createPool(opts: {
  creatorId: string;
  fixtureId: string;
  name?: string;
  buyIn?: number;
  isPublic?: boolean;
  currency?: 'points' | 'usdt';
}) {
  const fixture = getFixture(opts.fixtureId);
  if (!fixture) throw new Error('unknown fixture');
  const id = randomUUID();
  const now = new Date();
  const lockTime = Number.isFinite(Date.parse(fixture.kickoff)) ? new Date(Date.parse(fixture.kickoff)) : null;
  const currency = opts.currency === 'usdt' ? 'usdt' : 'points';
  const buyIn = toBaseUnit(Math.max(0, opts.buyIn ?? DEFAULT_BUYIN), currency); // points, or µUSD₮
  const name = (opts.name || defaultName(opts.fixtureId)).toString().slice(0, 60);

  let code = inviteCode();
  for (let i = 0; i < 4; i++) {
    const clash = (await db.select({ id: pools.id }).from(pools).where(eq(pools.code, code)).limit(1))[0];
    if (!clash) break;
    code = inviteCode();
  }

  await db.insert(pools).values({
    id,
    code,
    name,
    fixtureId: opts.fixtureId,
    creatorId: opts.creatorId,
    buyIn,
    currency,
    isPublic: opts.isPublic ?? false,
    status: 'open',
    lockTime,
    createdAt: now,
  });
  return (await getPool(id))!;
}

export async function joinPool(opts: {
  poolId?: string;
  code?: string;
  userId: string;
  predHome: number;
  predAway: number;
}) {
  const pool = opts.poolId ? await poolRow(opts.poolId) : opts.code ? await poolByCode(opts.code) : null;
  if (!pool) throw new Error('pool not found');
  if (pool.status !== 'open') throw new Error('pool is closed');
  if (pool.lockTime && pool.lockTime.getTime() <= Date.now()) throw new Error('pool locked — the tie kicked off');
  const dup = (
    await db
      .select({ id: poolMembers.id })
      .from(poolMembers)
      .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.userId, opts.userId)))
      .limit(1)
  )[0];
  if (dup) throw new Error('you have already joined this pool');

  const predHome = clampGoals(opts.predHome);
  const predAway = clampGoals(opts.predAway);
  const entry = {
    id: randomUUID(),
    poolId: pool.id,
    userId: opts.userId,
    predHome,
    predAway,
    staked: pool.buyIn,
    joinedAt: new Date(),
  };

  if (pool.currency === 'usdt') {
    let depositTx: string | undefined;
    if (pool.buyIn > 0) {
      const addr = await walletAddressOf(opts.userId);
      if (!addr) throw new Error('connect a USD₮ wallet first');
      depositTx = await escrow.collect(addr, BigInt(pool.buyIn)); // real USD₮ → treasury (before we open a txn)
    }
    await db.transaction(async (tx) => {
      await tx.insert(poolMembers).values({ ...entry, depositTx });
    });
  } else {
    await db.transaction(async (tx) => {
      await adjustPoints(tx, opts.userId, -pool.buyIn, 'stake', pool.id); // throws if insufficient
      await tx.insert(poolMembers).values(entry);
    });
  }
  return (await getPool(pool.id))!;
}

/**
 * Change your call while the pool is still open (before kick-off). Everyone in a
 * pool keeps their OWN prediction, so this only touches the caller's entry.
 */
export async function updatePrediction(opts: {
  poolId: string;
  userId: string;
  predHome: number;
  predAway: number;
}) {
  const pool = await poolRow(opts.poolId);
  if (!pool) throw new Error('pool not found');
  if (pool.status !== 'open') throw new Error('pool is closed');
  if (pool.lockTime && pool.lockTime.getTime() <= Date.now()) throw new Error('pool locked — the tie kicked off');
  const member = (
    await db
      .select({ id: poolMembers.id })
      .from(poolMembers)
      .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.userId, opts.userId)))
      .limit(1)
  )[0];
  if (!member) throw new Error('you are not in this pool');
  await db
    .update(poolMembers)
    .set({ predHome: clampGoals(opts.predHome), predAway: clampGoals(opts.predAway) })
    .where(eq(poolMembers.id, member.id));
  return (await getPool(pool.id))!;
}

/**
 * Leave an open pool before kick-off — refunds the stake in full. Lets a player
 * back out of their own pool to go join a mate's instead. If the pool empties,
 * it's retired so it stops showing up in discovery. Returns the updated pool, or
 * `null` when the pool was removed.
 */
export async function leavePool(opts: { poolId: string; userId: string }) {
  const pool = await poolRow(opts.poolId);
  if (!pool) throw new Error('pool not found');
  if (pool.status !== 'open') throw new Error('pool is closed');
  if (pool.lockTime && pool.lockTime.getTime() <= Date.now()) throw new Error('pool locked — the tie kicked off');
  const member = (
    await db
      .select({ id: poolMembers.id, staked: poolMembers.staked })
      .from(poolMembers)
      .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.userId, opts.userId)))
      .limit(1)
  )[0];
  if (!member) throw new Error('you are not in this pool');

  if (pool.currency === 'usdt') {
    if (member.staked > 0) {
      const addr = await walletAddressOf(opts.userId);
      if (addr) await escrow.pay(addr, BigInt(member.staked)); // refund real USD₮ from treasury
    }
    await db.delete(poolMembers).where(eq(poolMembers.id, member.id));
  } else {
    await db.transaction(async (tx) => {
      if (member.staked > 0) await adjustPoints(tx, opts.userId, member.staked, 'refund', pool.id);
      await tx.delete(poolMembers).where(eq(poolMembers.id, member.id));
    });
  }

  // If nobody's left, retire the pool so it stops cluttering public discovery.
  const remaining = (
    await db.select({ id: poolMembers.id }).from(poolMembers).where(eq(poolMembers.poolId, pool.id))
  ).length;
  if (remaining === 0) {
    await db.delete(pools).where(eq(pools.id, pool.id));
    return null;
  }
  return (await getPool(pool.id))!;
}

/** Settle a pool on a final score: pay pro-rata to correct-outcome callers. */
export async function settlePool(poolId: string, result: MatchResult) {
  const pool = await poolRow(poolId);
  if (!pool) throw new Error('pool not found');
  if (pool.status === 'settled') throw new Error('pool already settled');

  const members = await db.select().from(poolMembers).where(eq(poolMembers.poolId, poolId));
  const entries = members.map((m) => ({
    address: m.userId,
    displayName: m.userId,
    prediction: { homeGoals: m.predHome, awayGoals: m.predAway },
    stake: m.staked, // base units — points, or µUSD₮
    joinedAt: '',
  }));
  // decimals 0 → the pure math runs directly in the stored base unit; payout
  // `baseUnits` are the exact points (or µUSD₮) to move.
  const settlement = computeSettlement(entries, result, 0);
  const byUser = new Map(settlement.payouts.map((p) => [p.address, p]));

  if (pool.currency === 'usdt') {
    // Real on-chain payouts from the treasury to each winner's wallet.
    for (const m of members) {
      const p = byUser.get(m.userId);
      const winnings = p ? Number(p.baseUnits) : 0; // µUSD₮
      const won = !!p?.won;
      let payoutTx: string | undefined;
      if (winnings > 0) {
        const addr = await walletAddressOf(m.userId);
        if (addr) payoutTx = await escrow.pay(addr, BigInt(winnings)); // real USD₮ → winner
      }
      await db
        .update(poolMembers)
        .set({ won, winnings, payoutTx, exact: !!p?.exactScore })
        .where(eq(poolMembers.id, m.id));
    }
    await db
      .update(pools)
      .set({ status: 'settled', resultHome: result.homeGoals, resultAway: result.awayGoals, settledAt: new Date() })
      .where(eq(pools.id, poolId));
  } else {
    await db.transaction(async (tx) => {
      for (const m of members) {
        const p = byUser.get(m.userId);
        const winnings = p ? Math.round(p.amount) : 0;
        const won = !!p?.won;
        if (winnings > 0) await adjustPoints(tx, m.userId, winnings, settlement.refunded ? 'refund' : 'payout', poolId);
        await tx
          .update(poolMembers)
          .set({ won, winnings, exact: !!p?.exactScore })
          .where(eq(poolMembers.id, m.id));
      }
      await tx
        .update(pools)
        .set({ status: 'settled', resultHome: result.homeGoals, resultAway: result.awayGoals, settledAt: new Date() })
        .where(eq(pools.id, poolId));
    });
  }
  return (await getPool(poolId))!;
}

// ---- views ----

export async function getPool(id: string) {
  const pool = await poolRow(id);
  if (!pool) return null;
  const rows = await db
    .select({
      userId: poolMembers.userId,
      handle: users.handle,
      predHome: poolMembers.predHome,
      predAway: poolMembers.predAway,
      staked: poolMembers.staked,
      won: poolMembers.won,
      winnings: poolMembers.winnings,
      exact: poolMembers.exact,
      depositTx: poolMembers.depositTx,
      payoutTx: poolMembers.payoutTx,
      joinedAt: poolMembers.joinedAt,
    })
    .from(poolMembers)
    .innerJoin(users, eq(poolMembers.userId, users.id))
    .where(eq(poolMembers.poolId, id))
    .orderBy(poolMembers.joinedAt);

  const potBase = rows.reduce((a, m) => a + m.staked, 0); // base units (µUSD₮ for usdt)
  const disp = (n: number) => toDisplay(n, pool.currency);
  return {
    id: pool.id,
    code: pool.code,
    name: pool.name,
    fixtureId: pool.fixtureId,
    buyIn: disp(pool.buyIn),
    currency: pool.currency,
    isPublic: pool.isPublic,
    status: pool.status,
    lockTime: pool.lockTime ? pool.lockTime.toISOString() : null,
    result: pool.resultHome != null && pool.resultAway != null ? { homeGoals: pool.resultHome, awayGoals: pool.resultAway } : null,
    potPoints: disp(potBase),
    memberCount: rows.length,
    createdAt: pool.createdAt.toISOString(),
    members: rows.map((m) => ({
      userId: m.userId,
      handle: m.handle,
      prediction: { homeGoals: m.predHome, awayGoals: m.predAway },
      staked: disp(m.staked),
      won: m.won ?? null,
      winnings: m.winnings == null ? null : disp(m.winnings),
      exact: m.exact ?? false,
      depositTx: m.depositTx ?? null,
      payoutTx: m.payoutTx ?? null,
    })),
  };
}

export async function getPoolByCode(code: string) {
  const p = await poolByCode(code);
  return p ? getPool(p.id) : null;
}

/** Pools a user belongs to (most recent first). */
export async function poolsForUser(userId: string) {
  const rows = await db
    .select({ poolId: poolMembers.poolId })
    .from(poolMembers)
    .where(eq(poolMembers.userId, userId));
  const views = await Promise.all(rows.map((r) => getPool(r.poolId)));
  return views.filter(Boolean);
}

/** Open public pools for a fixture (for discovery / "join a pool"). */
export async function publicPoolsForFixture(fixtureId: string) {
  const rows = await db
    .select({ id: pools.id })
    .from(pools)
    .where(and(eq(pools.fixtureId, fixtureId), eq(pools.isPublic, true)))
    .orderBy(desc(pools.createdAt));
  const views = await Promise.all(rows.map((r) => getPool(r.id)));
  return views.filter(Boolean);
}

/** Open pools for a fixture — used by the auto-settle watcher. */
export async function openPoolsForFixture(fixtureId: string) {
  return db
    .select({ id: pools.id, code: pools.code })
    .from(pools)
    .where(and(eq(pools.fixtureId, fixtureId), eq(pools.status, 'open')));
}

// ---- internals ----

async function poolRow(id: string) {
  return (await db.select().from(pools).where(eq(pools.id, id)).limit(1))[0] ?? null;
}
async function poolByCode(code: string) {
  return (await db.select().from(pools).where(eq(pools.code, code.toUpperCase())).limit(1))[0] ?? null;
}
