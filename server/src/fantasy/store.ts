/**
 * Fantasy — salary-cap mini-leagues (DB-backed).
 *
 * Build a valid XI under budget, join a league (buy-in debited to the ledger),
 * points are scored live from the fixture feed, and the pot pays out by rank at
 * settlement. Squad validation + auto-draft are deterministic; the Gaffer only
 * narrates (see ai.ts). Money only moves inside a `db.transaction`.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { fantasyLeagues, fantasySquads, fantasySquadPlayers, users } from '../db/schema.js';
import { adjustPoints } from '../store/accounts.js';
import * as manager from '../pool/manager.js';
import { BUDGET, SQUAD_SIZE, XI_SIZE, MAX_PER_TEAM, SQUAD_QUOTA, XI_QUOTA, type Player, type Position } from './players.js';
import { getPool, getPlayer } from './squads.js';
import { scoreLineup, scoreTeam, type ScoreFixture, type Chip, type LineupPlayer } from './scoring.js';

// Budget/prices are kept as integers ×10 (one decimal place) internally.
const P10 = (n: number) => Math.round(n * 10);

export function listPlayers(): Player[] {
  return getPool();
}

function liveFixtures(): ScoreFixture[] {
  try {
    return (manager.allFixtures() as unknown as ScoreFixture[]) ?? [];
  } catch {
    return [];
  }
}

// ---- player scouting card ----

function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 10 && age < 60 ? age : null;
}

/**
 * A FotMob-style scouting card assembled entirely from data we already hold:
 * the player's real squad details + their TEAM's live World Cup run (form,
 * results, next fixture) + their base fantasy SCORE (the same team-outcome
 * engine, before any captain ×2). No fabricated stats — unknowns stay null.
 */
export function playerDetail(id: string) {
  const p = getPlayer(id);
  if (!p) return null;

  let all: any[] = [];
  try {
    all = (manager.allFixtures() ?? []).filter(Boolean) as any[];
  } catch {
    all = [];
  }
  const score = scoreTeam(p.position, p.teamCode, all as unknown as ScoreFixture[]);

  let teamCard: any = null;
  const games = all
    .filter((f) => f?.home?.code === p.teamCode || f?.away?.code === p.teamCode)
    .map((f) => {
      const isHome = f.home.code === p.teamCode;
      const meCard = isHome ? f.home : f.away;
      const opp = isHome ? f.away : f.home;
      if (!teamCard) teamCard = meCard;
      const res = f.result;
      let scoreStr: string | null = null;
      let outcome: 'W' | 'D' | 'L' | null = null;
      const shown = f.matchStatus === 'finished' || f.matchStatus === 'live';
      if (res && shown) {
        const tg = isHome ? res.homeGoals : res.awayGoals;
        const og = isHome ? res.awayGoals : res.homeGoals;
        scoreStr = `${tg}-${og}`;
        if (f.matchStatus === 'finished') outcome = tg > og ? 'W' : tg === og ? 'D' : 'L';
      }
      return {
        opponent: opp.name as string,
        opponentCode: opp.code as string,
        opponentCrest: (opp.crest ?? null) as string | null,
        opponentFlag: (opp.flag ?? null) as string | null,
        home: isHome,
        stage: (f.stage ?? null) as string | null,
        kickoff: (f.kickoff ?? null) as string | null,
        matchStatus: f.matchStatus as 'scheduled' | 'live' | 'finished',
        isLive: !!f.isLive,
        minute: (f.minute ?? null) as number | string | null,
        score: scoreStr,
        outcome,
      };
    })
    .sort((a, b) => Date.parse(a.kickoff ?? '') - Date.parse(b.kickoff ?? ''));

  const next = games.find((g) => g.matchStatus === 'scheduled') ?? null;

  return {
    id: p.id,
    name: p.name,
    teamCode: p.teamCode,
    teamName: p.teamName,
    position: p.position,
    price: p.price,
    age: ageFrom(p.dateOfBirth),
    dateOfBirth: p.dateOfBirth ?? null,
    nationality: p.nationality ?? null,
    country: (teamCard?.country ?? p.nationality ?? null) as string | null,
    crest: (p.crest ?? teamCard?.crest ?? null) as string | null,
    flag: (teamCard?.flag ?? null) as string | null,
    fifaRank: (teamCard?.fifaRank ?? null) as number | null,
    form: (teamCard?.form ?? []) as Array<'W' | 'D' | 'L'>,
    score, // base fantasy score; captain doubles it
    games,
    next,
    playedCount: games.filter((g) => g.matchStatus !== 'scheduled').length,
  };
}

// ---- squad validation + auto-draft ----

export interface EntryInput {
  squadIds: string[]; // the 15
  starterIds: string[]; // the 11 that start
  captainId: string; // must be a starter
  viceId: string; // must be a starter, ≠ captain
}

export function validateEntry(e: EntryInput): {
  players: Player[];
  starters: Player[];
  bench: Player[];
  budgetUsed10: number;
} {
  const ids = [...new Set(e.squadIds)];
  if (ids.length !== SQUAD_SIZE) throw new Error(`pick exactly ${SQUAD_SIZE} players`);
  const players = ids.map((id) => {
    const p = getPlayer(id);
    if (!p) throw new Error('unknown player in squad');
    return p;
  });
  // exact squad composition (2 GK / 5 DEF / 5 MID / 3 FWD)
  const sc: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) sc[p.position]++;
  for (const pos of Object.keys(SQUAD_QUOTA) as Position[]) {
    if (sc[pos] !== SQUAD_QUOTA[pos]) throw new Error(`squad needs ${SQUAD_QUOTA[pos]} ${pos} (have ${sc[pos]})`);
  }
  // max per nation
  const byTeam: Record<string, number> = {};
  for (const p of players) {
    byTeam[p.teamCode] = (byTeam[p.teamCode] || 0) + 1;
    if (byTeam[p.teamCode] > MAX_PER_TEAM) throw new Error(`max ${MAX_PER_TEAM} players from ${p.teamName}`);
  }
  // budget
  const budgetUsed10 = players.reduce((a, p) => a + P10(p.price), 0);
  if (budgetUsed10 > BUDGET * 10) throw new Error(`over budget — ${(budgetUsed10 / 10).toFixed(1)}/${BUDGET}`);
  // starting XI
  const starterIds = [...new Set(e.starterIds)];
  if (starterIds.length !== XI_SIZE) throw new Error(`pick exactly ${XI_SIZE} starters`);
  const idSet = new Set(ids);
  for (const sid of starterIds) if (!idSet.has(sid)) throw new Error('a starter is not in your squad');
  const starterSet = new Set(starterIds);
  const starters = players.filter((p) => starterSet.has(p.id));
  const xc: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of starters) xc[p.position]++;
  for (const pos of Object.keys(XI_QUOTA) as Position[]) {
    const q = XI_QUOTA[pos];
    if (xc[pos] < q.min || xc[pos] > q.max) throw new Error(`starting XI needs ${q.min}-${q.max} ${pos} (have ${xc[pos]})`);
  }
  // captain + vice
  if (!starterSet.has(e.captainId)) throw new Error('captain must be a starter');
  if (!starterSet.has(e.viceId)) throw new Error('vice-captain must be a starter');
  if (e.captainId === e.viceId) throw new Error('captain and vice-captain must be different players');
  const bench = players.filter((p) => !starterSet.has(p.id));
  return { players, starters, bench, budgetUsed10 };
}

/** Deterministic full squad: 15 under budget (attack-first), default 4-4-2 XI, priciest = captain. */
export function autoDraft(): { squadIds: string[]; starterIds: string[]; captainId: string; viceId: string } {
  const need = { ...SQUAD_QUOTA };
  const byPos: Record<Position, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of getPool()) byPos[p.position].push(p);
  for (const pos of Object.keys(byPos) as Position[]) byPos[pos].sort((a, b) => a.price - b.price);

  const used = new Set<string>();
  const teamCount: Record<string, number> = {};
  const chosen: Player[] = [];
  let budget10 = BUDGET * 10;
  const remaining: Record<Position, number> = { ...need };
  // Lower bound on the cost of every still-open slot: the sum of the cheapest
  // DISTINCT unused players per position (not count × single-cheapest, which
  // under-reserves when a position has few cheap options → over-budget).
  const reserveFor = () => {
    let r = 0;
    for (const q of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
      let n = remaining[q];
      for (const p of byPos[q]) {
        if (n <= 0) break;
        if (used.has(p.id) || (teamCount[p.teamCode] || 0) >= MAX_PER_TEAM) continue;
        r += P10(p.price);
        n--;
      }
    }
    return r;
  };

  for (const pos of ['FWD', 'MID', 'DEF', 'GK'] as Position[]) {
    for (let k = 0; k < need[pos]; k++) {
      remaining[pos]--;
      // reserve enough to fill every other open slot with its cheapest options
      const affordable = budget10 - reserveFor();
      const pick =
        [...byPos[pos]].reverse().find((p) => !used.has(p.id) && P10(p.price) <= affordable && (teamCount[p.teamCode] || 0) < MAX_PER_TEAM) ??
        byPos[pos].find((p) => !used.has(p.id) && (teamCount[p.teamCode] || 0) < MAX_PER_TEAM)!;
      used.add(pick.id);
      chosen.push(pick);
      teamCount[pick.teamCode] = (teamCount[pick.teamCode] || 0) + 1;
      budget10 -= P10(pick.price);
    }
  }

  // Starting XI: the best-value legal team — priciest GK, then the 10 priciest
  // outfield within formation bounds (so all your marquee forwards start).
  const bp: Record<Position, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of chosen) bp[p.position].push(p);
  for (const pos of Object.keys(bp) as Position[]) bp[pos].sort((a, b) => b.price - a.price);
  const OUT: Array<'DEF' | 'MID' | 'FWD'> = ['DEF', 'MID', 'FWD'];
  const XI_MIN = { DEF: 3, MID: 2, FWD: 1 } as const;
  const XI_MAX = { DEF: 5, MID: 5, FWD: 3 } as const;
  const started: Record<'DEF' | 'MID' | 'FWD', Player[]> = {
    DEF: bp.DEF.slice(0, XI_MIN.DEF),
    MID: bp.MID.slice(0, XI_MIN.MID),
    FWD: bp.FWD.slice(0, XI_MIN.FWD),
  };
  const rest = OUT.flatMap((pos) => bp[pos].slice(XI_MIN[pos]).map((p) => ({ pos, p })));
  rest.sort((a, b) => b.p.price - a.p.price);
  let slots = 10 - (XI_MIN.DEF + XI_MIN.MID + XI_MIN.FWD);
  for (const { pos, p } of rest) {
    if (slots <= 0) break;
    if (started[pos].length < XI_MAX[pos]) { started[pos].push(p); slots--; }
  }
  const starters: Player[] = [bp.GK[0], ...started.DEF, ...started.MID, ...started.FWD];
  const armband = starters.slice().sort((a, b) => b.price - a.price);
  return {
    squadIds: chosen.map((p) => p.id),
    starterIds: starters.map((p) => p.id),
    captainId: armband[0].id,
    viceId: armband[1].id,
  };
}

// ---- leagues ----

function inviteCode(): string {
  const s = randomUUID().replace(/-/g, '').toUpperCase();
  return `FL-${s.slice(0, 4)}`;
}
function parseSplit(raw: string): number[] {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.map((n) => Math.round(Number(n) || 0)) : [10000];
  } catch {
    return [10000];
  }
}

export function createLeague(opts: {
  creatorId: string;
  name?: string;
  buyIn?: number;
  splitBps?: number[];
  currency?: 'points' | 'usdt';
}) {
  const name = (opts.name || 'Fantasy League').toString().trim().slice(0, 60) || 'Fantasy League';
  const buyIn = Math.max(0, Math.floor(opts.buyIn ?? 0));
  let split = opts.splitBps && opts.splitBps.length ? opts.splitBps.map((n) => Math.round(n)) : [10000];
  split = split.filter((n) => n > 0);
  if (!split.length || split.reduce((a, b) => a + b, 0) !== 10000) throw new Error('prize split must total 100%');

  const id = randomUUID();
  let code = inviteCode();
  for (let i = 0; i < 4; i++) {
    if (!db.select({ id: fantasyLeagues.id }).from(fantasyLeagues).where(eq(fantasyLeagues.code, code)).get()) break;
    code = inviteCode();
  }
  db.insert(fantasyLeagues)
    .values({
      id,
      code,
      name,
      creatorId: opts.creatorId,
      buyIn,
      currency: opts.currency === 'usdt' ? 'usdt' : 'points',
      splitBps: JSON.stringify(split),
      status: 'open',
      createdAt: new Date(),
    })
    .run();
  return getLeague(id)!;
}

export function joinLeague(opts: {
  code?: string;
  leagueId?: string;
  userId: string;
  squadIds: string[];
  starterIds: string[];
  captainId: string;
  viceId: string;
  chip?: Chip;
}) {
  const lg = opts.leagueId ? row(opts.leagueId) : opts.code ? rowByCode(opts.code) : null;
  if (!lg) throw new Error('league not found');
  if (lg.status !== 'open') throw new Error('entries are closed for this league');
  const dup = db
    .select({ id: fantasySquads.id })
    .from(fantasySquads)
    .where(and(eq(fantasySquads.leagueId, lg.id), eq(fantasySquads.userId, opts.userId)))
    .get();
  if (dup) throw new Error('you already have a squad in this league');

  const { players, bench, budgetUsed10 } = validateEntry({
    squadIds: opts.squadIds,
    starterIds: opts.starterIds,
    captainId: opts.captainId,
    viceId: opts.viceId,
  });
  const chip: Chip = opts.chip === 'tc' || opts.chip === 'bb' ? opts.chip : null;
  const starterSet = new Set(opts.starterIds);
  // bench sub priority: outfield bench by price desc → 1,2,3 (bench GK stays 0)
  const benchOrder = new Map<string, number>();
  bench
    .filter((p) => p.position !== 'GK')
    .sort((a, b) => b.price - a.price)
    .forEach((p, i) => benchOrder.set(p.id, i + 1));

  db.transaction((tx) => {
    if (lg.buyIn > 0) adjustPoints(tx, opts.userId, -lg.buyIn, 'stake', lg.id);
    const squadId = randomUUID();
    tx.insert(fantasySquads)
      .values({
        id: squadId,
        leagueId: lg.id,
        userId: opts.userId,
        captainPlayerId: opts.captainId,
        viceCaptainPlayerId: opts.viceId,
        chip,
        budgetUsed: budgetUsed10,
        staked: lg.buyIn,
        createdAt: new Date(),
      })
      .run();
    for (const p of players) {
      const isStarter = starterSet.has(p.id);
      tx.insert(fantasySquadPlayers)
        .values({
          id: randomUUID(),
          squadId,
          playerId: p.id,
          starter: isStarter ? 1 : 0,
          benchOrder: isStarter ? 0 : benchOrder.get(p.id) ?? 0,
        })
        .run();
    }
  });
  return getLeague(lg.id)!;
}

export function startLeague(opts: { leagueId: string; creatorId: string }) {
  const lg = row(opts.leagueId);
  if (!lg) throw new Error('league not found');
  if (lg.creatorId !== opts.creatorId) throw new Error('only the creator can lock the league');
  if (lg.status !== 'open') throw new Error('league already started');
  db.update(fantasyLeagues).set({ status: 'live', lockedAt: new Date() }).where(eq(fantasyLeagues.id, lg.id)).run();
  return getLeague(lg.id)!;
}

export function settleLeague(opts: { leagueId: string; creatorId: string }) {
  const lg = row(opts.leagueId);
  if (!lg) throw new Error('league not found');
  if (lg.creatorId !== opts.creatorId) throw new Error('only the creator can settle');
  if (lg.status === 'settled') throw new Error('league already settled');

  const view = getLeague(lg.id)!;
  const ranked = view.standings; // already sorted, rank assigned
  const split = parseSplit(lg.splitBps);
  const pot = ranked.reduce((a, s) => a + s.staked, 0);

  // Conserved integer payout by placement; dust to the winner.
  const payout = new Map<string, number>();
  let distributed = 0;
  ranked.forEach((s, i) => {
    const bps = split[i] ?? 0;
    if (bps <= 0) return;
    const amt = Math.floor((pot * bps) / 10000);
    payout.set(s.squadId, amt);
    distributed += amt;
  });
  if (ranked.length) {
    const dust = pot - distributed;
    if (dust > 0) payout.set(ranked[0].squadId, (payout.get(ranked[0].squadId) ?? 0) + dust);
  }

  db.transaction((tx) => {
    ranked.forEach((s, i) => {
      const won = payout.get(s.squadId) ?? 0;
      if (won > 0) adjustPoints(tx, s.userId, won, 'payout', lg.id);
      tx.update(fantasySquads)
        .set({ placement: i + 1, payout: won > 0 ? won : null })
        .where(eq(fantasySquads.id, s.squadId))
        .run();
    });
    tx.update(fantasyLeagues).set({ status: 'settled', settledAt: new Date() }).where(eq(fantasyLeagues.id, lg.id)).run();
  });
  return getLeague(lg.id)!;
}

// ---- views ----

export interface StandingPlayer {
  id: string;
  name: string;
  teamCode: string;
  teamName: string;
  position: Position;
  price: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  starter: boolean;
  benchOrder: number;
  active: boolean; // counted toward the score (started, or subbed on, or Bench Boost)
  points: number; // counted points (captain multiplied)
  basePoints: number; // raw team score, for display
}
export interface Standing {
  squadId: string;
  userId: string;
  handle: string;
  rank: number;
  points: number;
  budgetUsed: number;
  captainId: string;
  viceCaptainId: string | null;
  captainedId: string | null; // who actually wore the armband on the day
  chip: Chip;
  formation: string; // e.g. "4-4-2"
  autoSubIn: string[];
  autoSubOut: string[];
  placement: number | null;
  payout: number | null;
  staked: number;
  players: StandingPlayer[];
}
export interface LeagueView {
  id: string;
  code: string;
  name: string;
  creatorId: string;
  buyIn: number;
  currency: 'points' | 'usdt';
  status: 'open' | 'live' | 'settled';
  splitBps: number[];
  pot: number;
  memberCount: number;
  createdAt: string;
  lockedAt: string | null;
  settledAt: string | null;
  standings: Standing[];
}

export function getLeague(id: string): LeagueView | null {
  const lg = row(id);
  if (!lg) return null;
  const squads = db.select().from(fantasySquads).where(eq(fantasySquads.leagueId, id)).all();
  const fixtures = liveFixtures();

  const rows = squads.map((sq) => {
    const handle = db.select({ handle: users.handle }).from(users).where(eq(users.id, sq.userId)).get()?.handle ?? '—';
    const sp = db
      .select({ playerId: fantasySquadPlayers.playerId, starter: fantasySquadPlayers.starter, benchOrder: fantasySquadPlayers.benchOrder })
      .from(fantasySquadPlayers)
      .where(eq(fantasySquadPlayers.squadId, sq.id))
      .all();
    const meta = new Map(sp.map((r) => [r.playerId, r]));
    const players = sp.map((r) => getPlayer(r.playerId)).filter((p): p is Player => !!p);
    const chip: Chip = sq.chip === 'tc' || sq.chip === 'bb' ? sq.chip : null;
    const viceId = sq.viceCaptainPlayerId ?? null;
    const lineup: LineupPlayer[] = players.map((p) => {
      const m = meta.get(p.id)!;
      return { id: p.id, position: p.position, teamCode: p.teamCode, starter: m.starter === 1, benchOrder: m.benchOrder };
    });
    const res = scoreLineup(lineup, sq.captainPlayerId, viceId, chip, fixtures);

    const standingPlayers: StandingPlayer[] = players.map((p) => {
      const m = meta.get(p.id)!;
      return {
        id: p.id,
        name: p.name,
        teamCode: p.teamCode,
        teamName: p.teamName,
        position: p.position,
        price: p.price,
        isCaptain: p.id === sq.captainPlayerId,
        isViceCaptain: p.id === viceId,
        starter: m.starter === 1,
        benchOrder: m.benchOrder,
        active: res.activeIds.includes(p.id),
        points: res.perPlayer[p.id] ?? 0,
        basePoints: res.basePerPlayer[p.id] ?? 0,
      };
    });
    // formation from the starting outfield
    const fc: Record<'DEF' | 'MID' | 'FWD', number> = { DEF: 0, MID: 0, FWD: 0 };
    for (const p of players) if (meta.get(p.id)!.starter === 1 && p.position !== 'GK') fc[p.position as 'DEF' | 'MID' | 'FWD']++;

    return {
      squadId: sq.id,
      userId: sq.userId,
      handle,
      points: res.total,
      budgetUsed: sq.budgetUsed / 10,
      captainId: sq.captainPlayerId,
      viceCaptainId: viceId,
      captainedId: res.captainedId,
      chip,
      formation: `${fc.DEF}-${fc.MID}-${fc.FWD}`,
      autoSubIn: res.autoSubIn,
      autoSubOut: res.autoSubOut,
      placement: sq.placement,
      payout: sq.payout,
      staked: sq.staked,
      players: standingPlayers,
    };
  });

  rows.sort((a, b) => b.points - a.points || a.budgetUsed - b.budgetUsed);
  const standings: Standing[] = rows.map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    id: lg.id,
    code: lg.code,
    name: lg.name,
    creatorId: lg.creatorId,
    buyIn: lg.buyIn,
    currency: lg.currency,
    status: lg.status,
    splitBps: parseSplit(lg.splitBps),
    pot: standings.reduce((a, s) => a + s.staked, 0),
    memberCount: standings.length,
    createdAt: lg.createdAt.toISOString(),
    lockedAt: lg.lockedAt ? lg.lockedAt.toISOString() : null,
    settledAt: lg.settledAt ? lg.settledAt.toISOString() : null,
    standings,
  };
}

export function getLeagueByCode(code: string): LeagueView | null {
  const lg = rowByCode(code);
  return lg ? getLeague(lg.id) : null;
}

export function leaguesForUser(userId: string): LeagueView[] {
  const asMember = db
    .select({ id: fantasySquads.leagueId })
    .from(fantasySquads)
    .where(eq(fantasySquads.userId, userId))
    .all()
    .map((r) => r.id);
  const rows = db
    .select()
    .from(fantasyLeagues)
    .where(or(eq(fantasyLeagues.creatorId, userId), asMember.length ? orIds(asMember) : eq(fantasyLeagues.id, '')))
    .all();
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => getLeague(r.id)!)
    .filter(Boolean);
}

// ---- internals ----
function row(id: string) {
  return db.select().from(fantasyLeagues).where(eq(fantasyLeagues.id, id)).get() ?? null;
}
function rowByCode(code: string) {
  return db.select().from(fantasyLeagues).where(eq(fantasyLeagues.code, code.trim().toUpperCase())).get() ?? null;
}
function orIds(ids: string[]) {
  return or(...ids.map((id) => eq(fantasyLeagues.id, id)));
}
