/**
 * Points-based prediction pools (DB-backed, free-to-play).
 *
 * Mirrors the on-chain pool semantics — fixed buy-in, join with a scoreline,
 * settle pro-rata to correct-outcome callers. Free-to-play pools run in POINTS
 * (zero wallet/gas friction); `currency='usdt'` runs the identical flow through
 * real on-chain USD₮ via the shared treasury escrow. Settlement reuses the same
 * pure math (`computeSettlement`) in the currency's base unit either way.
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

export function createPool(opts: {
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
    const clash = db.select({ id: pools.id }).from(pools).where(eq(pools.code, code)).get();
    if (!clash) break;
    code = inviteCode();
  }

  db.insert(pools)
    .values({
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
    })
    .run();
  return getPool(id)!;
}

export async function joinPool(opts: {
  poolId?: string;
  code?: string;
  userId: string;
  predHome: number;
  predAway: number;
}) {
  const pool = opts.poolId ? poolRow(opts.poolId) : opts.code ? poolByCode(opts.code) : null;
  if (!pool) throw new Error('pool not found');
  if (pool.status !== 'open') throw new Error('pool is closed');
  if (pool.lockTime && pool.lockTime.getTime() <= Date.now()) throw new Error('pool locked — the tie kicked off');
  const dup = db
    .select({ id: poolMembers.id })
    .from(poolMembers)
    .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.userId, opts.userId)))
    .get();
  if (dup) throw new Error('you have already joined this pool');

  const predHome = clampGoals(opts.predHome);
  const predAway = clampGoals(opts.predAway);

  // Insert the entry; joins the active BEGIN/COMMIT when called inside a
  // transaction (points), or runs standalone on the USD₮ path.
  const writeEntry = (depositTx?: string) =>
    db
      .insert(poolMembers)
      .values({
        id: randomUUID(),
        poolId: pool.id,
        userId: opts.userId,
        predHome,
        predAway,
        staked: pool.buyIn,
        depositTx,
        joinedAt: new Date(),
      })
      .run();

  if (pool.currency === 'usdt') {
    let depositTx: string | undefined;
    if (pool.buyIn > 0) {
      const addr = walletAddressOf(opts.userId);
      if (!addr) throw new Error('connect a USD₮ wallet first');
      depositTx = await escrow.collect(addr, BigInt(pool.buyIn)); // real USD₮ → treasury
    }
    writeEntry(depositTx);
  } else {
    db.transaction((tx) => {
      adjustPoints(tx, opts.userId, -pool.buyIn, 'stake', pool.id); // throws if insufficient
      writeEntry();
    });
  }
  return getPool(pool.id)!;
}

/** Settle a pool on a final score: pay pro-rata to correct-outcome callers. */
export async function settlePool(poolId: string, result: MatchResult) {
  const pool = poolRow(poolId);
  if (!pool) throw new Error('pool not found');
  if (pool.status === 'settled') throw new Error('pool already settled');

  const members = db.select().from(poolMembers).where(eq(poolMembers.poolId, poolId)).all();
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
        const addr = walletAddressOf(m.userId);
        if (addr) payoutTx = await escrow.pay(addr, BigInt(winnings)); // real USD₮ → winner
      }
      db.update(poolMembers)
        .set({ won, winnings, payoutTx, exact: !!p?.exactScore })
        .where(eq(poolMembers.id, m.id))
        .run();
    }
    db.update(pools)
      .set({ status: 'settled', resultHome: result.homeGoals, resultAway: result.awayGoals, settledAt: new Date() })
      .where(eq(pools.id, poolId))
      .run();
  } else {
    db.transaction((tx) => {
      for (const m of members) {
        const p = byUser.get(m.userId);
        const winnings = p ? Math.round(p.amount) : 0;
        const won = !!p?.won;
        if (winnings > 0) adjustPoints(tx, m.userId, winnings, settlement.refunded ? 'refund' : 'payout', poolId);
        tx.update(poolMembers)
          .set({ won, winnings, exact: !!p?.exactScore })
          .where(eq(poolMembers.id, m.id))
          .run();
      }
      tx.update(pools)
        .set({ status: 'settled', resultHome: result.homeGoals, resultAway: result.awayGoals, settledAt: new Date() })
        .where(eq(pools.id, poolId))
        .run();
    });
  }
  return getPool(poolId)!;
}

// ---- views ----

export function getPool(id: string) {
  const pool = poolRow(id);
  if (!pool) return null;
  const rows = db
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
    .orderBy(poolMembers.joinedAt)
    .all();

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

export function getPoolByCode(code: string) {
  const p = poolByCode(code);
  return p ? getPool(p.id) : null;
}

/** Pools a user belongs to (most recent first). */
export function poolsForUser(userId: string) {
  const rows = db
    .select({ poolId: poolMembers.poolId })
    .from(poolMembers)
    .where(eq(poolMembers.userId, userId))
    .all();
  return rows.map((r) => getPool(r.poolId)).filter(Boolean);
}

/** Open public pools for a fixture (for discovery / "join a pool"). */
export function publicPoolsForFixture(fixtureId: string) {
  const rows = db
    .select({ id: pools.id })
    .from(pools)
    .where(and(eq(pools.fixtureId, fixtureId), eq(pools.isPublic, true)))
    .orderBy(desc(pools.createdAt))
    .all();
  return rows.map((r) => getPool(r.id)).filter(Boolean);
}

/** Open pools for a fixture — used by the auto-settle watcher. */
export function openPoolsForFixture(fixtureId: string) {
  return db
    .select({ id: pools.id, code: pools.code })
    .from(pools)
    .where(and(eq(pools.fixtureId, fixtureId), eq(pools.status, 'open')))
    .all();
}

// ---- internals ----

function poolRow(id: string) {
  return db.select().from(pools).where(eq(pools.id, id)).get() ?? null;
}
function poolByCode(code: string) {
  return db.select().from(pools).where(eq(pools.code, code.toUpperCase())).get() ?? null;
}
