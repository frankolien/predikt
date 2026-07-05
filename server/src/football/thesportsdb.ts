/**
 * TheSportsDB provider (keyless default).
 *
 * The free test key (`123`/`3`) caps `eventsnextleague`/`eventspastleague`/
 * `eventslast` at a single event, but `eventsround.php?id=<league>&r=<round>&s=<season>`
 * returns a FULL round — so we drive fixtures + form off rounds:
 *   - group match-days (r=1,2,3) + Round-of-32 (r=32) → finished results → real form
 *   - Round-of-16/QF/SF (r=16,8,4) → upcoming/live knockout fixtures
 * plus `eventsnextleague`/`eventspastleague` as the freshest single next/last anchors.
 *
 * Verified live against the FIFA World Cup 2026 (leagueId 4429).
 */
import { footballConfig } from './config.js';
import { buildSnapshot, type FootballSnapshot, type RawMatch } from './snapshot.js';
import { intOrNull, normaliseStage, normaliseStatus, toIsoUtc } from './util.js';

interface TsdbEvent {
  idEvent: string;
  strEvent?: string;
  strLeague?: string;
  strSeason?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  intRound?: string;
  strStatus?: string;
  strProgress?: string;
  strTimestamp?: string;
  dateEvent?: string;
  strTime?: string;
  strVenue?: string;
}

/** Rounds whose finished results feed recent form. */
const FORM_ROUNDS = ['1', '2', '3', '32'];
/** Knockout rounds that hold upcoming/live fixtures (QF=8, SF=4 populate as the bracket fills). */
const LIVE_ROUNDS = ['16', '8', '4'];

function base(): string {
  return `https://www.thesportsdb.com/api/v1/json/${footballConfig.tsdb.key}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch JSON with a couple of retries — the free tier occasionally stalls a request. */
async function getJson(
  url: string,
  attempt = 0,
): Promise<{ events?: TsdbEvent[]; results?: TsdbEvent[] }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(footballConfig.timeoutMs) });
    if (!r.ok) throw new Error(`TheSportsDB HTTP ${r.status} for ${url}`);
    const text = await r.text();
    if (!text || text[0] !== '{') throw new Error(`TheSportsDB non-JSON response for ${url}`);
    return JSON.parse(text);
  } catch (err) {
    if (attempt < 2) {
      await sleep(500 * (attempt + 1));
      return getJson(url, attempt + 1);
    }
    throw err;
  }
}

/**
 * Fetch a list of URLs SEQUENTIALLY with a small gap. The free test key throttles
 * concurrent requests so aggressively that firing them in parallel makes them all
 * time out — pacing them one-by-one is both reliable and API-friendly.
 */
async function fetchSequential(urls: string[]): Promise<TsdbEvent[]> {
  const out: TsdbEvent[] = [];
  for (let i = 0; i < urls.length; i++) {
    const j = await getJson(urls[i]).catch(() => ({ events: [] as TsdbEvent[] }));
    if (j.events) out.push(...j.events);
    if (i < urls.length - 1) await sleep(footballConfig.requestGapMs);
  }
  return out;
}

function roundUrl(round: string): string {
  const { leagueId, season } = footballConfig.tsdb;
  return `${base()}/eventsround.php?id=${leagueId}&r=${round}&s=${season}`;
}
function nextUrl(): string {
  return `${base()}/eventsnextleague.php?id=${footballConfig.tsdb.leagueId}`;
}
function pastUrl(): string {
  return `${base()}/eventspastleague.php?id=${footballConfig.tsdb.leagueId}`;
}

function toRawMatch(e: TsdbEvent): RawMatch | null {
  if (!e.idEvent || !e.idHomeTeam || !e.idAwayTeam) return null;
  if (!e.strHomeTeam || !e.strAwayTeam) return null;
  const matchStatus = normaliseStatus(e.strStatus);
  const minuteRaw = (e.strProgress && e.strProgress.trim()) || e.strStatus || null;
  return {
    id: e.idEvent,
    kickoff: toIsoUtc(e.strTimestamp, e.dateEvent, e.strTime),
    venue: e.strVenue ?? 'TBD',
    league: e.strLeague ?? 'Football',
    stage: normaliseStage(e.intRound, e.strEvent),
    matchStatus,
    minute: matchStatus === 'live' ? minuteRaw : null,
    home: { id: e.idHomeTeam, name: e.strHomeTeam, badge: e.strHomeTeamBadge },
    away: { id: e.idAwayTeam, name: e.strAwayTeam, badge: e.strAwayTeamBadge },
    homeScore: intOrNull(e.intHomeScore),
    awayScore: intOrNull(e.intAwayScore),
  };
}

function dedupe(events: TsdbEvent[]): RawMatch[] {
  const byId = new Map<string, RawMatch>();
  for (const e of events) {
    const m = toRawMatch(e);
    if (m) byId.set(m.id, m); // later (fresher) wins
  }
  return [...byId.values()];
}

/** Full pull: all form + knockout rounds + freshest next/last anchors. */
export async function fetchTheSportsDbFull(): Promise<FootballSnapshot> {
  const rounds = [...FORM_ROUNDS, ...LIVE_ROUNDS];
  const urls = [...rounds.map(roundUrl), pastUrl(), nextUrl()];
  const events = await fetchSequential(urls);
  const matches = dedupe(events);
  if (matches.length === 0) throw new Error('TheSportsDB returned no events');
  return buildSnapshot(matches, 'thesportsdb', `TheSportsDB league ${footballConfig.tsdb.leagueId}`);
}

/** Light pull for the live loop: active knockout rounds + freshest next/last. */
export async function fetchTheSportsDbLive(): Promise<RawMatch[]> {
  const urls = [...LIVE_ROUNDS.map(roundUrl), pastUrl(), nextUrl()];
  const events = await fetchSequential(urls);
  return dedupe(events);
}
