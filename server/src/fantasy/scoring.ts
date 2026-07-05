/**
 * Fantasy scoring — pure. Each player scores from their TEAM's outcomes across
 * the live fixtures (win/draw, goals weighted by position, clean sheets,
 * concessions), so the game keeps ticking off just scores + status even where
 * per-player event data is thin. Captain doubles. Same engine, live or final.
 */
import type { Position } from './players.js';

export interface ScoreFixture {
  home: { code: string };
  away: { code: string };
  result: { homeGoals: number; awayGoals: number } | null;
  matchStatus?: 'scheduled' | 'live' | 'finished';
}

const GOAL_MULT: Record<Position, number> = { GK: 1, DEF: 1, MID: 2, FWD: 3 };
const CLEAN_SHEET: Record<Position, number> = { GK: 5, DEF: 4, MID: 1, FWD: 0 };

/** Points a given position accrues from one team's live/finished fixtures. */
export function scoreTeam(pos: Position, teamCode: string, fixtures: ScoreFixture[]): number {
  let pts = 0;
  for (const f of fixtures) {
    const isHome = f.home.code === teamCode;
    const isAway = f.away.code === teamCode;
    if (!isHome && !isAway) continue;
    const finished = f.matchStatus === 'finished';
    const live = f.matchStatus === 'live';
    if (!finished && !live) continue;
    pts += 1; // appearance
    if (!f.result) continue;
    const tg = isHome ? f.result.homeGoals : f.result.awayGoals;
    const og = isHome ? f.result.awayGoals : f.result.homeGoals;
    pts += tg * GOAL_MULT[pos]; // team goals, weighted by position
    if (finished) {
      if (tg > og) pts += 3; // win
      else if (tg === og) pts += 1; // draw
      if (og === 0) pts += CLEAN_SHEET[pos]; // clean sheet
    }
    if (pos === 'GK' || pos === 'DEF') pts -= Math.min(og, 3); // concessions
  }
  return pts;
}

export interface SquadMember {
  id: string;
  position: Position;
  teamCode: string;
}

/** Score a full squad; the captain's points are doubled. */
export function scoreSquad(
  squad: SquadMember[],
  captainId: string,
  fixtures: ScoreFixture[],
): { total: number; perPlayer: Record<string, number> } {
  const perPlayer: Record<string, number> = {};
  let total = 0;
  for (const p of squad) {
    let pts = scoreTeam(p.position, p.teamCode, fixtures);
    if (p.id === captainId) pts *= 2;
    perPlayer[p.id] = pts;
    total += pts;
  }
  return { total, perPlayer };
}

// ---- FPL-style lineup scoring: starting XI + bench + captain/vice + chips ----

export type Chip = 'tc' | 'bb' | null;

export interface LineupPlayer {
  id: string;
  position: Position;
  teamCode: string;
  starter: boolean;
  benchOrder: number; // outfield bench sub priority (1..3); 0 for starters / bench GK
}

export interface LineupResult {
  total: number;
  perPlayer: Record<string, number>; // counted points (captain multiplied); 0 for players that don't count
  basePerPlayer: Record<string, number>; // each player's raw team score, for display
  activeIds: string[]; // the players that actually counted (11, or all 15 under Bench Boost)
  captainedId: string | null; // who wore the armband on the day
  autoSubIn: string[]; // bench ids brought on
  autoSubOut: string[]; // starter ids taken off
}

/** Did the player's TEAM feature (a live or finished fixture) in the scored window? */
function teamFeatured(teamCode: string, fixtures: ScoreFixture[]): boolean {
  return fixtures.some(
    (f) =>
      (f.home.code === teamCode || f.away.code === teamCode) &&
      (f.matchStatus === 'live' || f.matchStatus === 'finished'),
  );
}

const XI_MIN: Record<Position, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
const XI_MAX: Record<Position, number> = { GK: 1, DEF: 5, MID: 5, FWD: 3 };

function validXI(players: Array<{ position: Position }>): boolean {
  if (players.length !== 11) return false;
  const c: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) c[p.position]++;
  return (Object.keys(XI_MIN) as Position[]).every((k) => c[k] >= XI_MIN[k] && c[k] <= XI_MAX[k]);
}

/**
 * Score an FPL-style lineup: the starting XI counts, a player whose team didn't
 * feature is auto-substituted by the first eligible bench player (bench order,
 * formation kept valid); the captain is doubled (tripled under Triple Captain),
 * and the vice-captain inherits the armband if the captain's team blanked. Under
 * Bench Boost the whole 15 counts and there are no substitutions.
 */
export function scoreLineup(
  lineup: LineupPlayer[],
  captainId: string,
  viceId: string | null,
  chip: Chip,
  fixtures: ScoreFixture[],
): LineupResult {
  const feat = (tc: string) => teamFeatured(tc, fixtures);
  const base = (p: LineupPlayer) => scoreTeam(p.position, p.teamCode, fixtures);

  const basePerPlayer: Record<string, number> = {};
  for (const p of lineup) basePerPlayer[p.id] = base(p);

  const starters = lineup.filter((p) => p.starter);
  const bench = lineup.filter((p) => !p.starter).sort((a, b) => a.benchOrder - b.benchOrder);

  let active: LineupPlayer[];
  const autoSubIn: string[] = [];
  const autoSubOut: string[] = [];

  if (chip === 'bb') {
    active = [...lineup]; // Bench Boost — everyone counts, no subs
  } else {
    active = [...starters];
    // GK swap: bench GK only ever replaces the starting GK
    const sgk = active.find((p) => p.position === 'GK');
    const bgk = bench.find((p) => p.position === 'GK');
    if (sgk && !feat(sgk.teamCode) && bgk && feat(bgk.teamCode)) {
      active = active.map((p) => (p.id === sgk.id ? bgk : p));
      autoSubOut.push(sgk.id);
      autoSubIn.push(bgk.id);
    }
    // outfield subs in bench order — each fills the first non-featuring slot that keeps a valid XI
    for (const b of bench.filter((p) => p.position !== 'GK')) {
      if (!feat(b.teamCode)) continue;
      for (let i = 0; i < active.length; i++) {
        const s = active[i];
        if (s.position === 'GK' || feat(s.teamCode)) continue;
        const trial = active.map((p, j) => (j === i ? b : p));
        if (validXI(trial)) {
          active = trial;
          autoSubOut.push(s.id);
          autoSubIn.push(b.id);
          break;
        }
      }
    }
  }

  // Captaincy: captain if their team featured & they're active; else the vice; else armband stays (0).
  const inActive = (id: string) => active.some((p) => p.id === id);
  const capMult = chip === 'tc' ? 3 : 2;
  let captainedId: string | null = null;
  const capP = lineup.find((p) => p.id === captainId) ?? null;
  const viceP = viceId ? lineup.find((p) => p.id === viceId) ?? null : null;
  if (capP && inActive(capP.id) && feat(capP.teamCode)) captainedId = capP.id;
  else if (viceP && inActive(viceP.id) && feat(viceP.teamCode)) captainedId = viceP.id;
  else if (capP && inActive(capP.id)) captainedId = capP.id;

  const perPlayer: Record<string, number> = {};
  for (const p of lineup) perPlayer[p.id] = 0;
  let total = 0;
  for (const p of active) {
    let pts = basePerPlayer[p.id];
    if (p.id === captainedId) pts *= capMult;
    perPlayer[p.id] = pts;
    total += pts;
  }

  return { total, perPlayer, basePerPlayer, activeIds: active.map((p) => p.id), captainedId, autoSubIn, autoSubOut };
}
