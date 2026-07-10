/**
 * Football data layer — REAL, LIVE fixtures with graceful offline fallback.
 *
 * This is the single source of football truth for the app. It replaces the old
 * hardcoded `data/tournament.ts` mock: at boot it pulls real fixtures from a live
 * API (TheSportsDB free by default, football-data.org if a key is set), caches
 * them in memory, and runs two refresh loops — a fast one for live score/status
 * and a slower one for the full fixture list. If the network is unreachable at
 * boot it falls back to the bundled `data/tournament.ts` dataset so the app still
 * boots (logging clearly which mode is active).
 *
 * Public surface mirrors the old module (`getFixture`, `getTeam`, `formString`)
 * plus `initFootball`, `getFixtures`, `getMarqueeFixtureId` — so importers swap
 * the path and keep working.
 */
import type { Fixture, Team, MatchResult, MatchStatus, Stage } from '../types.js';
import { footballConfig } from './config.js';
import {
  buildSnapshot,
  rawToFixture,
  resultOf,
  type FootballSnapshot,
  type RawMatch,
  type RawTeamSeed,
} from './snapshot.js';
import { codeFor, flagFor, keyPlayerFor, rankFor } from './util.js';
import { fetchTheSportsDbFull, fetchTheSportsDbLive } from './thesportsdb.js';
import { fetchFootballDataFull, fetchFootballDataLive } from './footballdata.js';
import * as offline from '../data/tournament.js';

type Mode = 'initialising' | 'live' | 'offline';

const teams = new Map<string, Team>();
const fixtures = new Map<string, Fixture>();

let mode: Mode = 'initialising';
let providerName: string = footballConfig.provider;
let competition = '';
let initialised = false;
let liveTimer: ReturnType<typeof setInterval> | undefined;
let fullTimer: ReturnType<typeof setInterval> | undefined;
let retryTimer: ReturnType<typeof setInterval> | undefined;
let liveInFlight = false;
let fullInFlight = false;

// ---------------------------------------------------------------------------
// Change emitter — lets the API push real-time score/status updates over SSE
// instead of clients polling. Fires with the ids whose live fields changed.
// ---------------------------------------------------------------------------

type ChangeListener = (ids: string[]) => void;
const changeListeners = new Set<ChangeListener>();

export function onFixturesChanged(cb: ChangeListener): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

function emitChanged(ids: string[]): void {
  if (ids.length === 0) return;
  for (const cb of changeListeners) {
    try {
      cb(ids);
    } catch {
      /* a bad listener must not break the refresh loop */
    }
  }
}

/** The live-relevant signature of a fixture — changes here are worth pushing. */
function liveSig(f: Fixture): string {
  const score = f.result ? `${f.result.homeGoals}-${f.result.awayGoals}` : '';
  return `${f.matchStatus ?? ''}|${f.minute ?? ''}|${score}`;
}

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------

function fetchFull(): Promise<FootballSnapshot> {
  return footballConfig.provider === 'football-data'
    ? fetchFootballDataFull()
    : fetchTheSportsDbFull();
}

function fetchLive(): Promise<RawMatch[]> {
  return footballConfig.provider === 'football-data'
    ? fetchFootballDataLive()
    : fetchTheSportsDbLive();
}

// ---------------------------------------------------------------------------
// Cache merge (preserves pool lifecycle status + settled result)
// ---------------------------------------------------------------------------

function upsertFixture(inc: Fixture): boolean {
  const cur = fixtures.get(inc.id);
  if (!cur) {
    fixtures.set(inc.id, inc);
    return true;
  }
  const before = liveSig(cur);
  cur.stage = inc.stage;
  cur.homeTeamId = inc.homeTeamId;
  cur.awayTeamId = inc.awayTeamId;
  cur.kickoff = inc.kickoff;
  cur.venue = inc.venue;
  cur.league = inc.league;
  cur.matchStatus = inc.matchStatus;
  cur.minute = inc.minute;
  // Never clobber a pool that has already settled on-chain.
  if (cur.status !== 'settled') {
    if (inc.result) cur.result = inc.result;
    else delete cur.result; // pre-kickoff → no score
  }
  return liveSig(cur) !== before;
}

function ensureTeam(seed: RawTeamSeed): void {
  if (teams.has(seed.id)) return;
  teams.set(seed.id, {
    id: seed.id,
    name: seed.name,
    code: codeFor(seed.name, seed.code),
    flag: flagFor(seed.name, seed.code),
    fifaRank: rankFor(seed.name, seed.rank),
    recentForm: [],
    keyPlayer: keyPlayerFor(seed.name),
    styleNote: `${seed.name} — live entrant; form still being read off the run of play.`,
    badge: seed.badge,
    country: seed.name,
  });
}

/** Full snapshot: refresh teams (with recomputed form) + upsert every fixture. */
function applyFull(snap: FootballSnapshot): void {
  for (const [id, t] of snap.teams) teams.set(id, t);
  const changed: string[] = [];
  for (const fx of snap.fixtures) if (upsertFixture(fx)) changed.push(fx.id);
  competition = snap.competition;
  providerName = snap.provider;
  emitChanged(changed);
}

/** Light live merge: update in-play fields only; add teams/fixtures only if new. */
function applyLive(raw: RawMatch[]): void {
  const changed: string[] = [];
  for (const m of raw) {
    ensureTeam(m.home);
    ensureTeam(m.away);
    const cur = fixtures.get(m.id);
    if (!cur) {
      fixtures.set(m.id, rawToFixture(m));
      changed.push(m.id);
      continue;
    }
    const before = liveSig(cur);
    cur.matchStatus = m.matchStatus;
    cur.minute = m.matchStatus === 'live' ? m.minute : null;
    cur.kickoff = m.kickoff;
    if (cur.status !== 'settled') {
      const r = resultOf(m);
      if (r) cur.result = r;
      else if (m.matchStatus === 'scheduled') delete cur.result;
    }
    if (liveSig(cur) !== before) changed.push(m.id);
  }
  emitChanged(changed);
}

// ---------------------------------------------------------------------------
// Offline fallback
// ---------------------------------------------------------------------------

function loadOffline(): void {
  teams.clear();
  fixtures.clear();
  for (const [id, t] of Object.entries(offline.TEAMS)) teams.set(id, { ...t });
  for (const f of offline.FIXTURES) {
    fixtures.set(f.id, {
      ...f,
      matchStatus: f.status === 'settled' ? 'finished' : 'scheduled',
      minute: null,
      league: 'Gaffer XI (offline)',
    });
  }
  competition = 'offline tournament (data/tournament.ts)';
  providerName = 'offline';
}

// ---------------------------------------------------------------------------
// Refresh loops
// ---------------------------------------------------------------------------

function startRefresh(): void {
  stopTimers();
  liveTimer = setInterval(() => {
    if (liveInFlight) return; // never let a slow feed stack up requests
    liveInFlight = true;
    fetchLive()
      .then((raw) => {
        applyLive(raw);
        const live = getFixtures().filter((f) => f.matchStatus === 'live');
        if (live.length) {
          console.log(
            `[football] live tick — ${live
              .map((f) => `${teamName(f.homeTeamId)} ${scoreStr(f)} ${teamName(f.awayTeamId)} (${f.minute ?? ''})`)
              .join(', ')}`,
          );
        }
      })
      .catch((err) => console.warn(`[football] live refresh failed: ${(err as Error).message}`))
      .finally(() => {
        liveInFlight = false;
      });
  }, footballConfig.liveRefreshMs);
  liveTimer.unref?.();

  fullTimer = setInterval(() => {
    if (fullInFlight) return;
    fullInFlight = true;
    fetchFull()
      .then((snap) => applyFull(snap))
      .catch((err) => console.warn(`[football] full refresh failed: ${(err as Error).message}`))
      .finally(() => {
        fullInFlight = false;
      });
  }, footballConfig.fixturesRefreshMs);
  fullTimer.unref?.();
}

/** Keep retrying the live provider while in offline mode; flip over on success. */
function startOfflineRetry(): void {
  stopTimers();
  retryTimer = setInterval(() => {
    fetchFull()
      .then((snap) => {
        applyFull(snap);
        mode = 'live';
        console.log(`[football] reconnected → LIVE via ${snap.provider} — ${snap.competition}`);
        startRefresh();
      })
      .catch(() => {
        /* still offline; keep the bundled dataset */
      });
  }, footballConfig.fixturesRefreshMs);
  retryTimer.unref?.();
}

function stopTimers(): void {
  if (liveTimer) clearInterval(liveTimer);
  if (fullTimer) clearInterval(fullTimer);
  if (retryTimer) clearInterval(retryTimer);
  liveTimer = fullTimer = retryTimer = undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch real fixtures at boot and start the refresh loops (idempotent). */
export async function initFootball(): Promise<void> {
  if (initialised) return;
  const label = footballConfig.provider === 'football-data' ? 'football-data.org' : 'TheSportsDB (keyless)';
  console.log(`[football] booting — provider: ${label}`);
  try {
    const snap = await fetchFull();
    applyFull(snap);
    mode = 'live';
    initialised = true;
    console.log(
      `[football] ✅ LIVE via ${snap.provider} — ${snap.competition}: ${fixtures.size} fixtures, ${teams.size} teams`,
    );
    logHeadline();
    startRefresh();
  } catch (err) {
    console.warn(`[football] ⚠️  live fetch failed at boot (${(err as Error).message})`);
    console.warn('[football] ⚠️  falling back to OFFLINE dataset (data/tournament.ts)');
    loadOffline();
    mode = 'offline';
    initialised = true;
    startOfflineRetry();
  }
}

export function getFixtures(): Fixture[] {
  return [...fixtures.values()].sort(orderFixtures);
}

export function getFixture(id: string): Fixture | undefined {
  return fixtures.get(id);
}

/**
 * A fixture summary as served by the hosted backend's `GET /api/fixtures`
 * (see `pool/manager.fixtureSummary`). The desktop AI sidecar hydrates from this
 * instead of hitting a live provider, so its fixture ids match the ones the user
 * is looking at exactly — no data-provider key shipped in the app.
 */
export interface FixtureSummaryInput {
  id: string;
  stage: Stage;
  kickoff: string;
  venue: string;
  status: Fixture['status'];
  result?: MatchResult | null;
  matchStatus?: MatchStatus;
  minute?: number | string | null;
  league?: string | null;
  home: TeamCardInput;
  away: TeamCardInput;
}
interface TeamCardInput {
  id: string;
  name: string;
  code: string;
  flag: string;
  fifaRank: number;
  form?: Array<'W' | 'D' | 'L'>;
  keyPlayer: string;
  crest?: string | null;
  country?: string | null;
}

/**
 * Populate the in-memory fixture/team maps from hosted-backend summaries. Used by
 * the desktop sidecar so on-device AI reads the same fixtures (same ids) the user
 * sees — the one field the summary omits is `styleNote`, which the pundit prompt
 * treats as optional context. Merges by id so a refresh updates live scores.
 */
export function hydrateFromSummaries(list: FixtureSummaryInput[]): number {
  for (const s of list) {
    for (const tc of [s.home, s.away]) {
      teams.set(tc.id, {
        id: tc.id,
        name: tc.name,
        code: tc.code,
        flag: tc.flag,
        fifaRank: tc.fifaRank ?? 0,
        recentForm: tc.form ?? [],
        keyPlayer: tc.keyPlayer,
        styleNote: '', // not exposed by /api/fixtures — the prompt reads it as optional
        badge: tc.crest ?? undefined,
        country: tc.country ?? undefined,
      });
    }
    fixtures.set(s.id, {
      id: s.id,
      stage: s.stage,
      homeTeamId: s.home.id,
      awayTeamId: s.away.id,
      kickoff: s.kickoff,
      venue: s.venue,
      status: s.status,
      result: s.result ?? undefined,
      matchStatus: s.matchStatus,
      minute: s.minute ?? null,
      league: s.league ?? undefined,
    });
  }
  mode = 'live';
  providerName = 'hosted-summaries';
  initialised = true;
  return fixtures.size;
}

export function getTeam(id: string): Team {
  const t = teams.get(id);
  if (t) return t;
  // Defensive synthesis so a missing team never crashes the pundit/pool paths.
  return {
    id,
    name: id,
    code: codeFor(id),
    flag: '🏳️',
    fifaRank: 0,
    recentForm: [],
    keyPlayer: keyPlayerFor(id),
    styleNote: 'Context unavailable — read this one on instinct.',
  };
}

export function formString(form: Array<'W' | 'D' | 'L'>): string {
  return form.join('-');
}

/** The default/marquee fixture: soonest match still open for predictions, else live, else first. */
export function getMarqueeFixtureId(): string | undefined {
  const list = getFixtures();
  const now = Date.now();
  const upcoming = list.find((f) => f.matchStatus === 'scheduled' && Date.parse(f.kickoff) > now);
  if (upcoming) return upcoming.id;
  const live = list.find((f) => f.matchStatus === 'live');
  if (live) return live.id;
  return list[0]?.id;
}

export function footballStatus() {
  return {
    mode,
    provider: providerName,
    competition,
    fixtures: fixtures.size,
    teams: teams.size,
    live: getFixtures().filter((f) => f.matchStatus === 'live').length,
  };
}

/** Stop all refresh timers (used by the smoke script so the process can exit). */
export function stopFootball(): void {
  stopTimers();
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function orderFixtures(a: Fixture, b: Fixture): number {
  const rank = (f: Fixture) => (f.matchStatus === 'live' ? 0 : f.matchStatus === 'finished' ? 2 : 1);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  const ta = Date.parse(a.kickoff);
  const tb = Date.parse(b.kickoff);
  return ra === 2 ? tb - ta : ta - tb; // finished newest-first; live/upcoming soonest-first
}

function teamName(id: string): string {
  return teams.get(id)?.name ?? id;
}

function scoreStr(f: Fixture): string {
  return f.result ? `${f.result.homeGoals}-${f.result.awayGoals}` : 'v';
}

function logHeadline(): void {
  const list = getFixtures();
  const upcoming = list.filter((f) => f.matchStatus !== 'finished').slice(0, 3);
  for (const f of upcoming) {
    console.log(
      `[football]   ${(f.matchStatus ?? 'scheduled').toUpperCase().padEnd(9)} ${f.kickoff}  ${teamName(
        f.homeTeamId,
      )} vs ${teamName(f.awayTeamId)}  (${f.stage})`,
    );
  }
}
