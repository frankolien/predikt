/**
 * football-data.org provider (optional, richer/live).
 *
 * Enabled when `FOOTBALL_DATA_API_KEY` is set. Uses the v4 REST API with an
 * `X-Auth-Token` header. A single `GET /v4/competitions/{code}/matches` call
 * returns every match with true in-play `status`, live `minute`, full-time
 * `score`, `utcDate`, team names + crests — so one call builds a whole snapshot
 * (well within the free 10 req/min limit).
 *
 * NOTE: this path requires a real key and could not be exercised against the
 * live API during development (unauthenticated calls return HTTP 403). It is
 * implemented to the documented v4 contract; TheSportsDB is the verified default.
 */
import { footballConfig } from './config.js';
import { buildSnapshot, type FootballSnapshot, type RawMatch } from './snapshot.js';
import { intOrNull, normaliseStage, toIsoUtc } from './util.js';
import type { MatchStatus } from '../types.js';

interface FdTeam {
  id?: number;
  name?: string;
  shortName?: string;
  tla?: string;
  crest?: string;
}
interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  stage?: string;
  group?: string | null;
  minute?: number | null;
  venue?: string | null;
  competition?: { name?: string };
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score?: { fullTime?: { home?: number | null; away?: number | null } };
}
interface FdResponse {
  competition?: { name?: string; code?: string };
  matches?: FdMatch[];
}

/** Competition remembered after the first successful probe (avoids re-scanning WC→CL→PL). */
let resolvedCompetition: string | null = null;

function statusOf(s: string): MatchStatus {
  switch (s.toUpperCase()) {
    case 'IN_PLAY':
    case 'PAUSED':
      return 'live';
    case 'FINISHED':
    case 'AWARDED':
      return 'finished';
    default:
      // SCHEDULED, TIMED, POSTPONED, SUSPENDED, CANCELLED
      return 'scheduled';
  }
}

async function fetchMatches(code: string): Promise<FdMatch[]> {
  const url = `https://api.football-data.org/v4/competitions/${code}/matches`;
  const r = await fetch(url, {
    headers: { 'X-Auth-Token': footballConfig.footballData.apiKey },
    signal: AbortSignal.timeout(footballConfig.timeoutMs),
  });
  if (!r.ok) throw new Error(`football-data.org HTTP ${r.status} for ${code}`);
  const j = (await r.json()) as FdResponse;
  return j.matches ?? [];
}

/**
 * Derive an approximate live minute. The free tier returns `minute: null` even
 * while a match is IN_PLAY (the live clock is a paid feature), so when it's
 * missing we estimate elapsed minutes from kickoff — enough for a real,
 * advancing on-screen clock. Clamped to 1–90; a real feed minute always wins.
 */
function liveMinute(kickoffIso: string, feedMinute: number | null | undefined): number | null {
  if (feedMinute != null) return feedMinute; // a real feed clock always wins
  const ko = Date.parse(kickoffIso);
  if (Number.isNaN(ko)) return null;
  // Wall-clock minutes since kickoff. The match clock pauses ~15 min at half-time,
  // so raw wall-clock over-counts by that break once past 45' — hold at 45' through
  // the break and subtract it in the second half so the on-screen clock tracks the
  // real minute far more closely (still can't beat a paid live-clock feed, but this
  // removes the systematic +15 drift that made a 65' match read as ~80'+).
  const wall = Math.floor((Date.now() - ko) / 60_000);
  if (wall < 0) return null;
  if (wall <= 45) return Math.max(1, wall); // first half
  if (wall <= 60) return 45; // ~15-min half-time break
  return Math.min(90, wall - 15); // second half, minus the break
}

function toRawMatch(m: FdMatch, leagueName: string): RawMatch | null {
  const h = m.homeTeam;
  const a = m.awayTeam;
  // Knockout slots can be unfilled (TBD) — skip until both teams are known.
  if (!h?.id || !a?.id || !h.name || !a.name) return null;
  const matchStatus = statusOf(m.status);
  const ft = m.score?.fullTime ?? {};
  const kickoff = toIsoUtc(m.utcDate);
  return {
    id: `fd-${m.id}`,
    kickoff,
    venue: m.venue ?? 'TBD',
    league: m.competition?.name || leagueName,
    stage: normaliseStage(m.stage, m.group ?? ''),
    matchStatus,
    minute: matchStatus === 'live' ? liveMinute(kickoff, m.minute) : null,
    home: { id: String(h.id), name: h.name, code: h.tla, badge: h.crest },
    away: { id: String(a.id), name: a.name, code: a.tla, badge: a.crest },
    homeScore: intOrNull(ft.home),
    awayScore: intOrNull(ft.away),
  };
}

/** Resolve the first competition code that actually has matches, then fetch it. */
async function fetchResolved(): Promise<{ code: string; matches: FdMatch[] }> {
  const candidates = resolvedCompetition
    ? [resolvedCompetition, ...footballConfig.footballData.competitions]
    : footballConfig.footballData.competitions;
  let lastErr: unknown;
  for (const code of candidates) {
    try {
      const matches = await fetchMatches(code);
      if (matches.length > 0) {
        resolvedCompetition = code;
        return { code, matches };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('football-data.org: no configured competition returned matches');
}

export async function fetchFootballDataFull(): Promise<FootballSnapshot> {
  const { code, matches } = await fetchResolved();
  const raw = matches.map((m) => toRawMatch(m, code)).filter((x): x is RawMatch => x !== null);
  if (raw.length === 0) throw new Error('football-data.org returned no usable matches');
  return buildSnapshot(raw, 'football-data', code);
}

export async function fetchFootballDataLive(): Promise<RawMatch[]> {
  const { code, matches } = await fetchResolved();
  return matches.map((m) => toRawMatch(m, code)).filter((x): x is RawMatch => x !== null);
}
