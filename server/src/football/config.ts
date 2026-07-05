/**
 * Football data-layer configuration.
 *
 * Keyless by default (TheSportsDB free test key) so it runs for judges with zero
 * setup. If `FOOTBALL_DATA_API_KEY` is present we prefer football-data.org, which
 * exposes true in-play status + live scores.
 */

const env = process.env;

/** Provider selection: football-data.org iff a key is present, else TheSportsDB. */
export const hasFootballDataKey = !!(env.FOOTBALL_DATA_API_KEY && env.FOOTBALL_DATA_API_KEY.trim());

export const footballConfig = {
  provider: (env.FOOTBALL_PROVIDER as 'thesportsdb' | 'football-data' | undefined) ??
    (hasFootballDataKey ? 'football-data' : 'thesportsdb'),

  // --- TheSportsDB (keyless default) ---
  tsdb: {
    key: env.FOOTBALL_TSDB_KEY || '123', // free test keys: 123 or 3
    leagueId: env.FOOTBALL_TSDB_LEAGUE || '4429', // FIFA World Cup
    season: env.FOOTBALL_TSDB_SEASON || '2026',
  },

  // --- football-data.org (optional richer/live provider) ---
  footballData: {
    apiKey: env.FOOTBALL_DATA_API_KEY || '',
    // Try these competition codes in order until one has matches.
    competitions: (env.FOOTBALL_DATA_COMP || 'WC,CL,PL')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  // --- refresh cadence ---
  /**
   * How often to poll live/soon matches for score + status changes. 15s keeps
   * the live clock/scores fresh while staying well inside football-data.org's
   * free 10 req/min limit (one request per tick → 4/min). Changes are pushed to
   * the UI over SSE the moment they're detected, so this is the discovery floor.
   */
  liveRefreshMs: Number(env.FOOTBALL_REFRESH_MS || 15_000),
  /** How often to re-pull the full fixture list. */
  fixturesRefreshMs: Number(env.FOOTBALL_FIXTURES_REFRESH_MS || 180_000),
  /** Per-request network timeout. */
  timeoutMs: Number(env.FOOTBALL_TIMEOUT_MS || 12_000),
  /**
   * Gap between sequential TheSportsDB calls. The free test key throttles
   * concurrency hard (parallel requests all hang), so we pace requests instead.
   */
  requestGapMs: Number(env.FOOTBALL_GAP_MS || 300),
} as const;
