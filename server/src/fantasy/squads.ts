/**
 * Real World Cup squads for Fantasy — pulled from football-data.org.
 *
 * A single `GET /v4/competitions/WC/teams` call returns all 48 nations with
 * their full squads (name + position), so the fantasy pool is the ACTUAL players
 * at the tournament — not a hardcoded shortlist. Prices are assigned here (the
 * feed has no fantasy valuation): position base + team tier + a deterministic
 * spread, with a marquee override so the superstars cost like superstars.
 * Cached in memory; falls back to the static pool if the API is unreachable.
 */
import { footballConfig } from '../football/config.js';
import { FALLBACK_PLAYERS, type Player, type Position } from './players.js';

// ---- position + price mapping ----

function mapPosition(pos?: string | null): Position {
  const p = (pos || '').toLowerCase();
  if (p.includes('keeper')) return 'GK';
  if (p.includes('back') || p.includes('defen')) return 'DEF';
  if (p.includes('midfield')) return 'MID';
  if (p.includes('forward') || p.includes('wing') || p.includes('offen') || p.includes('striker') || p.includes('attack'))
    return 'FWD';
  return 'MID';
}

const POS_BASE: Record<Position, number> = { GK: 4.0, DEF: 4.0, MID: 4.5, FWD: 5.0 };
const ELITE = new Set(['FRA', 'BRA', 'ARG', 'ENG', 'ESP', 'POR', 'NED', 'GER', 'BEL', 'CRO', 'URU']);
const STRONG = new Set(['COL', 'MAR', 'SEN', 'JPN', 'KOR', 'MEX', 'USA', 'SUI', 'SWE', 'ECU', 'TUR', 'AUT', 'IRN']);

/** Superstar overrides keyed by normalised name fragment → premium price. */
const MARQUEE: Array<[string, number]> = [
  ['mbappe', 12.5], ['haaland', 12.0], ['messi', 11.5], ['vinicius', 11.0], ['bellingham', 10.5],
  ['kane', 10.0], ['salah', 9.5], ['yamal', 9.5], ['de bruyne', 9.5], ['rodri', 9.0], ['musiala', 9.0],
  ['ronaldo', 9.0], ['lautaro', 9.0], ['saka', 8.5], ['foden', 8.5], ['pedri', 8.5], ['griezmann', 8.5],
  ['bruno fernandes', 8.5], ['wirtz', 8.5], ['julian alvarez', 8.5], ['son', 8.0], ['valverde', 8.0],
  ['leao', 8.0], ['odegaard', 7.5], ['olmo', 7.5], ['hakimi', 7.0], ['gakpo', 7.0], ['modric', 6.5],
  ['van dijk', 6.5], ['rudiger', 5.5],
];

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const round05 = (n: number) => Math.round(n * 2) / 2;

function marqueePrice(name: string): number | null {
  const n = norm(name);
  const words = n.split(/\s+/);
  for (const [key, price] of MARQUEE) {
    // Multi-word keys (e.g. "de bruyne") match as a phrase; single-word keys must
    // match a whole name token so "son" doesn't hit every "…son" surname.
    if (key.includes(' ') ? n.includes(key) : words.includes(key)) return price;
  }
  return null;
}

function priceFor(name: string, position: Position, teamCode: string, id: string): number {
  const marquee = marqueePrice(name);
  if (marquee != null) return marquee;
  const tier = ELITE.has(teamCode) ? 2.0 : STRONG.has(teamCode) ? 1.0 : 0;
  const jitter = (hash(id) % 7) * 0.5; // 0.0 … 3.0
  return Math.max(4.0, Math.min(12.5, round05(POS_BASE[position] + tier + jitter)));
}

// ---- fetch + cache ----

interface FdSquadPlayer { id?: number; name?: string; position?: string | null; dateOfBirth?: string | null; nationality?: string | null }
interface FdTeam { name?: string; shortName?: string; tla?: string; crest?: string | null; squad?: FdSquadPlayer[] }

const slug = (name: string) => norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function fetchTeams(): Promise<FdTeam[]> {
  const key = footballConfig.footballData.apiKey;
  if (!key) throw new Error('no football-data key');
  for (const code of footballConfig.footballData.competitions) {
    try {
      const r = await fetch(`https://api.football-data.org/v4/competitions/${code}/teams`, {
        headers: { 'X-Auth-Token': key },
        signal: AbortSignal.timeout(footballConfig.timeoutMs),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { teams?: FdTeam[] };
      const teams = j.teams ?? [];
      if (teams.some((t) => (t.squad?.length ?? 0) > 0)) return teams;
    } catch {
      /* try next competition */
    }
  }
  throw new Error('no competition returned squads');
}

function buildPool(teams: FdTeam[]): Player[] {
  const players: Player[] = [];
  for (const t of teams) {
    const teamName = t.name || t.shortName || 'Unknown';
    const teamCode = (t.tla || t.shortName || teamName).slice(0, 3).toUpperCase();
    for (const s of t.squad ?? []) {
      if (!s.name) continue;
      const position = mapPosition(s.position);
      const id = s.id ? `fd-${s.id}` : `${teamCode.toLowerCase()}-${slug(s.name)}`;
      players.push({
        id,
        name: s.name,
        teamCode,
        teamName,
        position,
        price: priceFor(s.name, position, teamCode, id),
        dateOfBirth: s.dateOfBirth ?? null,
        nationality: s.nationality ?? null,
        crest: t.crest ?? null,
      });
    }
  }
  return players;
}

let pool: Player[] = FALLBACK_PLAYERS;
let byId = new Map(pool.map((p) => [p.id, p]));
let loadedAt = 0;
let loading: Promise<void> | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

export function getPool(): Player[] {
  return pool;
}
export function getPlayer(id: string): Player | undefined {
  return byId.get(id);
}

/** Populate the pool from the live feed (idempotent; keeps fallback on failure). */
export function ensurePool(force = false): Promise<void> {
  if (loading) return loading;
  if (!force && loadedAt > 0 && Date.now() - loadedAt < TTL_MS) return Promise.resolve();
  loading = (async () => {
    try {
      const built = buildPool(await fetchTeams());
      if (built.length >= 100) {
        pool = built;
        byId = new Map(built.map((p) => [p.id, p]));
        loadedAt = Date.now();
        console.log(`[fantasy] loaded ${built.length} real WC players from football-data`);
      }
    } catch (err) {
      console.warn('[fantasy] squad fetch failed — using fallback pool:', (err as Error).message);
    } finally {
      loading = null;
    }
  })();
  return loading;
}
