/**
 * Provider-agnostic snapshot builder.
 *
 * Each provider (TheSportsDB / football-data.org) fetches its own payloads and
 * flattens them into a list of `RawMatch`. This module turns that list into the
 * `Team`/`Fixture` domain objects the rest of the app consumes — deduping teams,
 * computing real recent form (W/D/L) from finished matches, and deriving a
 * non-empty tactical `styleNote` + `keyPlayer` for the on-device pundit.
 */
import type { Fixture, MatchResult, MatchStatus, Stage, Team } from '../types.js';
import { codeFor, flagFor, keyPlayerFor, rankFor } from './util.js';

export interface RawTeamSeed {
  id: string;
  name: string;
  /** Provider short code / TLA, if any. */
  code?: string;
  /** Crest/badge URL. */
  badge?: string;
  /** Provider-supplied ranking, if any. */
  rank?: number;
}

export interface RawMatch {
  id: string;
  kickoff: string; // ISO UTC
  venue: string;
  league: string;
  stage: Stage;
  matchStatus: MatchStatus;
  minute: number | string | null;
  home: RawTeamSeed;
  away: RawTeamSeed;
  homeScore: number | null;
  awayScore: number | null;
}

export interface FootballSnapshot {
  provider: string;
  competition: string;
  teams: Map<string, Team>;
  fixtures: Fixture[];
}

interface FormEntry {
  kickoff: string;
  outcome: 'W' | 'D' | 'L';
  gf: number;
  ga: number;
}

export function resultOf(m: RawMatch): MatchResult | undefined {
  if (m.matchStatus === 'scheduled') return undefined; // no score before kickoff
  if (m.homeScore === null || m.awayScore === null) return undefined;
  return { homeGoals: m.homeScore, awayGoals: m.awayScore };
}

/** Map a raw match to a fresh Fixture (pool lifecycle defaults to 'scheduled'). */
export function rawToFixture(m: RawMatch): Fixture {
  const fx: Fixture = {
    id: m.id,
    stage: m.stage,
    homeTeamId: m.home.id,
    awayTeamId: m.away.id,
    kickoff: m.kickoff,
    venue: m.venue || 'TBD',
    status: 'scheduled',
    matchStatus: m.matchStatus,
    minute: m.matchStatus === 'live' ? m.minute : null,
    league: m.league,
  };
  const r = resultOf(m);
  if (r) fx.result = r;
  return fx;
}

function outcomeFor(gf: number, ga: number): 'W' | 'D' | 'L' {
  if (gf > ga) return 'W';
  if (gf < ga) return 'L';
  return 'D';
}

export function buildSnapshot(
  matches: RawMatch[],
  provider: string,
  competition: string,
): FootballSnapshot {
  // 1. Collect per-team finished results for form.
  const forms = new Map<string, FormEntry[]>();
  const seeds = new Map<string, RawTeamSeed>();

  const remember = (seed: RawTeamSeed) => {
    // Keep the richest seed (prefer one that carries a badge).
    const prev = seeds.get(seed.id);
    if (!prev || (!prev.badge && seed.badge)) seeds.set(seed.id, { ...prev, ...seed });
  };

  for (const m of matches) {
    remember(m.home);
    remember(m.away);
    if (m.matchStatus !== 'finished' || m.homeScore === null || m.awayScore === null) continue;
    const push = (id: string, gf: number, ga: number) => {
      const arr = forms.get(id) ?? [];
      arr.push({ kickoff: m.kickoff, outcome: outcomeFor(gf, ga), gf, ga });
      forms.set(id, arr);
    };
    push(m.home.id, m.homeScore, m.awayScore);
    push(m.away.id, m.awayScore, m.homeScore);
  }

  // 2. Build Team objects.
  const teams = new Map<string, Team>();
  for (const [id, seed] of seeds) {
    const recent = (forms.get(id) ?? [])
      .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
      .slice(0, 5);
    const recentForm = recent.map((r) => r.outcome);
    teams.set(id, {
      id,
      name: seed.name,
      code: codeFor(seed.name, seed.code),
      flag: flagFor(seed.name, seed.code),
      fifaRank: rankFor(seed.name, seed.rank),
      recentForm,
      keyPlayer: keyPlayerFor(seed.name),
      styleNote: styleNote(seed.name, recent),
      badge: seed.badge,
      country: seed.name,
    });
  }

  // 3. Build Fixture objects.
  const fixtures: Fixture[] = matches.map(rawToFixture);

  return { provider, competition, teams, fixtures };
}

/** A one-line tactical note derived from real recent results — non-empty by construction. */
function styleNote(name: string, recent: FormEntry[]): string {
  if (recent.length === 0) {
    return `${name} arrive without a settled recent record on file — a live wildcard the pundit reads on the eye test.`;
  }
  const gf = recent.reduce((s, r) => s + r.gf, 0);
  const ga = recent.reduce((s, r) => s + r.ga, 0);
  const wins = recent.filter((r) => r.outcome === 'W').length;
  const losses = recent.filter((r) => r.outcome === 'L').length;
  const n = recent.length;
  let tempo: string;
  if (gf / n >= 2.5) tempo = 'free-scoring and front-foot';
  else if (ga === 0) tempo = 'built on a mean, disciplined back line';
  else if (wins > losses) tempo = 'in confident, in-form rhythm';
  else if (losses > wins) tempo = 'wobbling and there to be got at';
  else tempo = 'streaky and hard to call';
  const formStr = recent.map((r) => r.outcome).join('-');
  return `${name} come in ${tempo}: ${formStr} across their last ${n}, ${gf} scored and ${ga} conceded.`;
}
