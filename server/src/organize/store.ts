/**
 * Organize — knockout tournaments (DB-backed).
 *
 * Lifecycle: create (open) → entrants join and pay the entry (debited to the
 * points ledger, held as `staked`) → organizer starts → we seed the field and
 * generate a single-elimination bracket, resolving byes → scores are reported
 * and the winner advances → when the final is confirmed we compute placements
 * and pay the pot out by `splitBps`, crediting the ledger in the same
 * transaction. Points today; `currency='usdt'` runs the identical flow through
 * WDK escrow later. Money is only ever moved inside a `db.transaction`.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tournaments, tournamentParticipants, tournamentMatches, users } from '../db/schema.js';
import { adjustPoints } from '../store/accounts.js';
import { walletAddressOf } from '../store/wallets.js';
import * as escrow from '../wdk/escrow.js';
import { buildBracket, bracketSize, roundName } from './bracket.js';

const USDT_UNIT = 1_000_000; // µUSD₮ per USD₮

/** Convert a human amount to the currency's stored base unit. */
const toBaseUnit = (human: number, currency: string) =>
  currency === 'usdt' ? Math.round(human * USDT_UNIT) : Math.round(human);
/** Convert a stored base amount back to display units. */
const toDisplay = (base: number, currency: string) => (currency === 'usdt' ? base / USDT_UNIT : base);

const clampInt = (n: unknown, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

/** 3-letter monogram from a name — used as the crest fallback code. */
function deriveCode(name: string): string {
  const letters = (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (letters.slice(0, 3) || 'TBD').padEnd(3, 'X');
}

function inviteCode(): string {
  const s = randomUUID().replace(/-/g, '').toUpperCase();
  return `CUP-${s.slice(0, 4)}`;
}

function parseSplit(raw: string): number[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map((n) => Math.round(Number(n) || 0)) : [10000];
  } catch {
    return [10000];
  }
}

// ---- create / join / entrants ----

export function createTournament(opts: {
  organizerId: string;
  name?: string;
  maxPlayers?: number;
  entryFee?: number;
  splitBps?: number[];
  currency?: 'points' | 'usdt';
}) {
  // Bracket cap must be a power of two we support.
  const cap = [4, 8, 16, 32].includes(Number(opts.maxPlayers)) ? Number(opts.maxPlayers) : 8;
  const currency = opts.currency === 'usdt' ? 'usdt' : 'points';
  const entryHuman = Math.max(0, Math.min(100_000, Number(opts.entryFee) || 0));
  const entryFee = toBaseUnit(entryHuman, currency); // points, or µUSD₮
  const name = (opts.name || 'Knockout Cup').toString().trim().slice(0, 60) || 'Knockout Cup';

  let split = opts.splitBps && opts.splitBps.length ? opts.splitBps.map((n) => Math.round(n)) : [10000];
  split = split.filter((n) => n > 0);
  const sum = split.reduce((a, b) => a + b, 0);
  if (!split.length || sum !== 10000) throw new Error('prize split must total 100%');

  const id = randomUUID();
  const now = new Date();
  let code = inviteCode();
  for (let i = 0; i < 4; i++) {
    if (!db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.code, code)).get()) break;
    code = inviteCode();
  }

  db.insert(tournaments)
    .values({
      id,
      code,
      name,
      format: 'knockout',
      status: 'open',
      organizerId: opts.organizerId,
      entryFee,
      currency,
      maxPlayers: cap,
      splitBps: JSON.stringify(split),
      createdAt: now,
    })
    .run();
  return getTournament(id)!;
}

/** Organizer adds an offline/named entrant. Only for FREE cups (nobody pays). */
export function addEntrant(opts: { tournamentId: string; organizerId: string; name: string }) {
  const t = row(opts.tournamentId);
  if (!t) throw new Error('tournament not found');
  if (t.organizerId !== opts.organizerId) throw new Error('only the organizer can add entrants');
  if (t.status !== 'open') throw new Error('entries are closed');
  if (t.entryFee > 0) throw new Error('paid cups fill by invite code — share it so players can pay in');
  if (countParticipants(t.id) >= t.maxPlayers) throw new Error('the bracket is full');
  const name = (opts.name || 'Entrant').toString().trim().slice(0, 40) || 'Entrant';
  db.insert(tournamentParticipants)
    .values({ id: randomUUID(), tournamentId: t.id, name, staked: 0, joinedAt: new Date() })
    .run();
  return getTournament(t.id)!;
}

/** A user joins by code (or id) and pays the entry — points debit or real USD₮. */
export async function joinTournament(opts: { code?: string; tournamentId?: string; userId: string }) {
  const t = opts.tournamentId ? row(opts.tournamentId) : opts.code ? rowByCode(opts.code) : null;
  if (!t) throw new Error('tournament not found');
  if (t.status !== 'open') throw new Error('entries are closed');
  if (countParticipants(t.id) >= t.maxPlayers) throw new Error('the bracket is full');
  const dup = db
    .select({ id: tournamentParticipants.id })
    .from(tournamentParticipants)
    .where(and(eq(tournamentParticipants.tournamentId, t.id), eq(tournamentParticipants.userId, opts.userId)))
    .get();
  if (dup) throw new Error('you have already joined this cup');

  const user = db.select({ handle: users.handle }).from(users).where(eq(users.id, opts.userId)).get();
  if (!user) throw new Error('unknown user');

  const insert = (depositTx?: string) =>
    db
      .insert(tournamentParticipants)
      .values({
        id: randomUUID(),
        tournamentId: t.id,
        userId: opts.userId,
        name: user.handle,
        staked: t.entryFee,
        depositTx,
        joinedAt: new Date(),
      })
      .run();

  if (t.currency === 'usdt') {
    let depositTx: string | undefined;
    if (t.entryFee > 0) {
      const addr = walletAddressOf(opts.userId);
      if (!addr) throw new Error('connect a USD₮ wallet first');
      depositTx = await escrow.collect(addr, BigInt(t.entryFee)); // real USD₮ → treasury
    }
    insert(depositTx);
  } else {
    db.transaction((tx) => {
      if (t.entryFee > 0) adjustPoints(tx, opts.userId, -t.entryFee, 'stake', t.id); // throws if short
      insert();
    });
  }
  return getTournament(t.id)!;
}

// ---- start (seed + generate bracket) ----

export function startTournament(opts: { tournamentId: string; organizerId: string; seeding?: 'random' | 'join' }) {
  const t = row(opts.tournamentId);
  if (!t) throw new Error('tournament not found');
  if (t.organizerId !== opts.organizerId) throw new Error('only the organizer can start the cup');
  if (t.status !== 'open') throw new Error('cup already started');

  const parts = db
    .select()
    .from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, t.id))
    .orderBy(asc(tournamentParticipants.joinedAt))
    .all();
  if (parts.length < 2) throw new Error('need at least 2 entrants to kick off');

  // Seed the field: random draw by default, or by join order.
  const seeded = opts.seeding === 'join' ? parts.slice() : shuffle(parts.slice());
  const bySeed = new Map<number, string>(); // seed → participantId
  seeded.forEach((p, i) => bySeed.set(i + 1, p.id));
  const N = seeded.length;

  const specs = buildBracket(N);
  const idOf = new Map<string, string>();
  for (const s of specs) idOf.set(`${s.round}:${s.slot}`, randomUUID());

  type Row = {
    id: string;
    round: number;
    slot: number;
    home: string | null;
    away: string | null;
    winner: string | null;
    status: 'pending' | 'ready' | 'live' | 'confirmed';
    nextMatchId: string | null;
    nextSide: 'home' | 'away' | null;
  };
  const rows: Row[] = specs.map((s) => ({
    id: idOf.get(`${s.round}:${s.slot}`)!,
    round: s.round,
    slot: s.slot,
    home: s.homeSeed != null ? bySeed.get(s.homeSeed) ?? null : null,
    away: s.awaySeed != null ? bySeed.get(s.awaySeed) ?? null : null,
    winner: null,
    status: 'pending',
    nextMatchId: s.nextRound != null ? idOf.get(`${s.nextRound}:${s.nextSlot}`) ?? null : null,
    nextSide: s.nextSide,
  }));
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Resolve first-round byes: the lone entrant walks into the next round.
  for (const r of rows) {
    if (r.round !== 1) continue;
    const lone = r.home && !r.away ? r.home : !r.home && r.away ? r.away : null;
    if (lone && (!r.home || !r.away)) {
      r.winner = lone;
      r.status = 'confirmed';
      if (r.nextMatchId) {
        const nx = byId.get(r.nextMatchId)!;
        if (r.nextSide === 'home') nx.home = lone;
        else nx.away = lone;
      }
    }
  }
  // Any tie with both sides now known (and not a resolved bye) is playable.
  for (const r of rows) if (r.status !== 'confirmed' && r.home && r.away) r.status = 'ready';

  const now = new Date();
  db.transaction((tx) => {
    seeded.forEach((p, i) => {
      tx.update(tournamentParticipants).set({ seed: i + 1 }).where(eq(tournamentParticipants.id, p.id)).run();
    });
    for (const r of rows) {
      tx.insert(tournamentMatches)
        .values({
          id: r.id,
          tournamentId: t.id,
          round: r.round,
          slot: r.slot,
          homeParticipantId: r.home,
          awayParticipantId: r.away,
          winnerParticipantId: r.winner,
          decidedBy: r.winner ? 'normal' : null, // byes settle "normally"
          status: r.status,
          nextMatchId: r.nextMatchId,
          nextSlot: r.nextSide,
          createdAt: now,
        })
        .run();
    }
    tx.update(tournaments).set({ status: 'live', startedAt: now }).where(eq(tournaments.id, t.id)).run();
  });
  return getTournament(t.id)!;
}

// ---- report a result (advances the bracket, settles on the final) ----

export async function reportMatch(opts: {
  tournamentId: string;
  matchId: string;
  organizerId: string;
  homeScore: number;
  awayScore: number;
  penaltyWinner?: 'home' | 'away';
}) {
  const t = row(opts.tournamentId);
  if (!t) throw new Error('tournament not found');
  if (t.organizerId !== opts.organizerId) throw new Error('only the organizer can enter scores');
  if (t.status !== 'live') throw new Error('cup is not in play');

  const m = db.select().from(tournamentMatches).where(eq(tournamentMatches.id, opts.matchId)).get();
  if (!m || m.tournamentId !== t.id) throw new Error('match not found');
  if (m.status === 'confirmed') throw new Error('that tie is already decided');
  if (!m.homeParticipantId || !m.awayParticipantId) throw new Error('both sides must be set first');

  const hs = clampInt(opts.homeScore, 0, 99);
  const as = clampInt(opts.awayScore, 0, 99);
  let winner: string;
  let decidedBy: 'normal' | 'penalties' = 'normal';
  if (hs > as) winner = m.homeParticipantId;
  else if (as > hs) winner = m.awayParticipantId;
  else {
    if (opts.penaltyWinner !== 'home' && opts.penaltyWinner !== 'away')
      throw new Error('level after 90 — enter the penalty-shootout winner');
    winner = opts.penaltyWinner === 'home' ? m.homeParticipantId : m.awayParticipantId;
    decidedBy = 'penalties';
  }
  const loser = winner === m.homeParticipantId ? m.awayParticipantId : m.homeParticipantId;
  const isFinal = !m.nextMatchId;

  db.transaction((tx) => {
    tx.update(tournamentMatches)
      .set({ homeScore: hs, awayScore: as, winnerParticipantId: winner, decidedBy, status: 'confirmed' })
      .where(eq(tournamentMatches.id, m.id))
      .run();
    tx.update(tournamentParticipants).set({ status: 'eliminated' }).where(eq(tournamentParticipants.id, loser)).run();

    if (!isFinal && m.nextMatchId) {
      const nx = db.select().from(tournamentMatches).where(eq(tournamentMatches.id, m.nextMatchId)).get();
      if (nx) {
        const patch = m.nextSlot === 'home' ? { homeParticipantId: winner } : { awayParticipantId: winner };
        const bothSet =
          (m.nextSlot === 'home' ? winner : nx.homeParticipantId) &&
          (m.nextSlot === 'away' ? winner : nx.awayParticipantId);
        tx.update(tournamentMatches)
          .set({ ...patch, status: bothSet ? 'ready' : nx.status })
          .where(eq(tournamentMatches.id, nx.id))
          .run();
      }
    }
  });

  // Final decided → crown + pay out. Points settle synchronously; USD₮ pays out
  // over real on-chain transfers (async), so it runs outside the DB transaction.
  if (isFinal) {
    if (t.currency === 'usdt') await settleUsdt(t.id, winner, loser);
    else settlePoints(t.id, winner, loser);
  }
  return getTournament(t.id)!;
}

/** Placement groups + conserved integer split. Pure read of current state. */
function computeDistribution(tournamentId: string, championId: string, runnerUpId: string) {
  const t = row(tournamentId)!;
  const parts = db.select().from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, tournamentId)).all();
  const matches = db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId)).all();
  const totalRounds = Math.max(...matches.map((mm) => mm.round));

  const groups: string[][] = [[championId], [runnerUpId]];
  if (totalRounds >= 2) {
    const semiLosers = matches
      .filter((mm) => mm.round === totalRounds - 1 && mm.winnerParticipantId)
      .map((mm) => (mm.winnerParticipantId === mm.homeParticipantId ? mm.awayParticipantId : mm.homeParticipantId))
      .filter((x): x is string => !!x);
    if (semiLosers.length) groups.push(semiLosers);
  }

  const split = parseSplit(t.splitBps);
  const pot = parts.reduce((a, p) => a + (p.staked || 0), 0);

  const payout = new Map<string, number>();
  let distributed = 0;
  groups.forEach((group, i) => {
    const bps = split[i] ?? 0;
    if (bps <= 0 || !group.length) return;
    const groupAmount = Math.floor((pot * bps) / 10000);
    const each = Math.floor(groupAmount / group.length);
    group.forEach((pid, j) => {
      const amt = each + (j === 0 ? groupAmount - each * group.length : 0);
      payout.set(pid, (payout.get(pid) ?? 0) + amt);
      distributed += amt;
    });
  });
  const dust = pot - distributed;
  if (dust > 0) payout.set(championId, (payout.get(championId) ?? 0) + dust);

  const placementOf = (pid: string): number | null => {
    for (let i = 0; i < groups.length; i++) if (groups[i].includes(pid)) return i + 1;
    return null;
  };
  return { parts, payout, placementOf };
}

/** Points settlement — atomic ledger credits inside one transaction. */
function settlePoints(tournamentId: string, championId: string, runnerUpId: string) {
  const { parts, payout, placementOf } = computeDistribution(tournamentId, championId, runnerUpId);
  db.transaction((tx) => {
    for (const p of parts) {
      const won = payout.get(p.id) ?? 0;
      if (won > 0 && p.userId) adjustPoints(tx, p.userId, won, 'payout', tournamentId);
      tx.update(tournamentParticipants)
        .set({ placement: placementOf(p.id), payout: won > 0 ? won : null, status: p.id === championId ? 'champion' : p.status })
        .where(eq(tournamentParticipants.id, p.id))
        .run();
    }
    tx.update(tournaments).set({ status: 'completed', completedAt: new Date(), winnerId: championId }).where(eq(tournaments.id, tournamentId)).run();
  });
}

/** USD₮ settlement — real on-chain payouts from the treasury to each winner. */
async function settleUsdt(tournamentId: string, championId: string, runnerUpId: string) {
  const { parts, payout, placementOf } = computeDistribution(tournamentId, championId, runnerUpId);
  for (const p of parts) {
    const won = payout.get(p.id) ?? 0;
    let payoutTx: string | undefined;
    if (won > 0 && p.userId) {
      const addr = walletAddressOf(p.userId);
      if (addr) payoutTx = await escrow.pay(addr, BigInt(won)); // real USD₮ → winner
    }
    db.update(tournamentParticipants)
      .set({ placement: placementOf(p.id), payout: won > 0 ? won : null, payoutTx, status: p.id === championId ? 'champion' : p.status })
      .where(eq(tournamentParticipants.id, p.id))
      .run();
  }
  db.update(tournaments).set({ status: 'completed', completedAt: new Date(), winnerId: championId }).where(eq(tournaments.id, tournamentId)).run();
}

/** Cancel an un-started cup and refund every paid entrant. */
export async function cancelTournament(opts: { tournamentId: string; organizerId: string }) {
  const t = row(opts.tournamentId);
  if (!t) throw new Error('tournament not found');
  if (t.organizerId !== opts.organizerId) throw new Error('only the organizer can cancel');
  if (t.status !== 'open') throw new Error('a cup in play cannot be cancelled');
  const parts = db.select().from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, t.id)).all();
  if (t.currency === 'usdt') {
    for (const p of parts) {
      if (p.staked > 0 && p.userId) {
        const addr = walletAddressOf(p.userId);
        if (addr) await escrow.pay(addr, BigInt(p.staked)); // refund USD₮
      }
    }
    db.update(tournaments).set({ status: 'cancelled', completedAt: new Date() }).where(eq(tournaments.id, t.id)).run();
  } else {
    db.transaction((tx) => {
      for (const p of parts) {
        if (p.staked > 0 && p.userId) adjustPoints(tx, p.userId, p.staked, 'refund', t.id);
      }
      tx.update(tournaments).set({ status: 'cancelled', completedAt: new Date() }).where(eq(tournaments.id, t.id)).run();
    });
  }
  return getTournament(t.id)!;
}

// ---- views ----

export interface TournamentView {
  id: string;
  code: string;
  name: string;
  format: string;
  status: 'open' | 'live' | 'completed' | 'cancelled';
  currency: 'points' | 'usdt';
  entryFee: number;
  maxPlayers: number;
  splitBps: number[];
  organizerId: string;
  pot: number;
  participantCount: number;
  totalRounds: number;
  winnerId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  participants: Array<{
    id: string;
    userId: string | null;
    name: string;
    code: string;
    seed: number | null;
    status: string;
    staked: number;
    placement: number | null;
    payout: number | null;
    depositTx: string | null;
    payoutTx: string | null;
  }>;
  rounds: Array<{
    round: number;
    name: string;
    matches: Array<{
      id: string;
      round: number;
      slot: number;
      status: string;
      decidedBy: string | null;
      winnerParticipantId: string | null;
      home: { participantId: string | null; name: string | null; code: string | null; score: number | null };
      away: { participantId: string | null; name: string | null; code: string | null; score: number | null };
    }>;
  }>;
}

export function getTournament(id: string): TournamentView | null {
  const t = row(id);
  if (!t) return null;
  const parts = db
    .select()
    .from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, id))
    .orderBy(asc(tournamentParticipants.seed), asc(tournamentParticipants.joinedAt))
    .all();
  const matches = db
    .select()
    .from(tournamentMatches)
    .where(eq(tournamentMatches.tournamentId, id))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.slot))
    .all();

  const nameOf = new Map(parts.map((p) => [p.id, p.name]));
  const totalRounds = matches.length ? Math.max(...matches.map((m) => m.round)) : Math.log2(bracketSize(parts.length));
  const potBase = parts.reduce((a, p) => a + (p.staked || 0), 0);
  const disp = (n: number) => toDisplay(n, t.currency); // base → display units

  const roundNums = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const rounds = roundNums.map((rn) => ({
    round: rn,
    name: roundName(rn, totalRounds),
    matches: matches
      .filter((m) => m.round === rn)
      .map((m) => ({
        id: m.id,
        round: m.round,
        slot: m.slot,
        status: m.status,
        decidedBy: m.decidedBy,
        winnerParticipantId: m.winnerParticipantId,
        home: side(m.homeParticipantId, m.homeScore, nameOf),
        away: side(m.awayParticipantId, m.awayScore, nameOf),
      })),
  }));

  return {
    id: t.id,
    code: t.code,
    name: t.name,
    format: t.format,
    status: t.status,
    currency: t.currency,
    entryFee: disp(t.entryFee),
    maxPlayers: t.maxPlayers,
    splitBps: parseSplit(t.splitBps),
    organizerId: t.organizerId,
    pot: disp(potBase),
    participantCount: parts.length,
    totalRounds,
    winnerId: t.winnerId,
    createdAt: t.createdAt.toISOString(),
    startedAt: t.startedAt ? t.startedAt.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    participants: parts.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      code: deriveCode(p.name),
      seed: p.seed,
      status: p.status,
      staked: disp(p.staked),
      placement: p.placement,
      payout: p.payout != null ? disp(p.payout) : null,
      depositTx: p.depositTx ?? null,
      payoutTx: p.payoutTx ?? null,
    })),
    rounds,
  };
}

export function getTournamentByCode(code: string): TournamentView | null {
  const t = rowByCode(code);
  return t ? getTournament(t.id) : null;
}

/** Cups a user organizes or plays in (most recent first). */
export function tournamentsForUser(userId: string): TournamentView[] {
  const asPlayer = db
    .select({ id: tournamentParticipants.tournamentId })
    .from(tournamentParticipants)
    .where(eq(tournamentParticipants.userId, userId))
    .all()
    .map((r) => r.id);
  const rows = db
    .select()
    .from(tournaments)
    .where(or(eq(tournaments.organizerId, userId), asPlayer.length ? inArrayIds(asPlayer) : eq(tournaments.id, '')))
    .all();
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => getTournament(r.id)!)
    .filter(Boolean);
}

// ---- internals ----

function side(
  pid: string | null,
  score: number | null,
  nameOf: Map<string, string>,
): { participantId: string | null; name: string | null; code: string | null; score: number | null } {
  const name = pid ? nameOf.get(pid) ?? null : null;
  return { participantId: pid, name, code: name ? deriveCode(name) : null, score };
}

function row(id: string) {
  return db.select().from(tournaments).where(eq(tournaments.id, id)).get() ?? null;
}
function rowByCode(code: string) {
  return db.select().from(tournaments).where(eq(tournaments.code, code.trim().toUpperCase())).get() ?? null;
}
function countParticipants(tournamentId: string): number {
  return db.select({ id: tournamentParticipants.id }).from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, tournamentId)).all().length;
}
function inArrayIds(ids: string[]) {
  // Small OR chain (fields are few); avoids importing inArray for a tiny set.
  return or(...ids.map((id) => eq(tournaments.id, id)));
}
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
