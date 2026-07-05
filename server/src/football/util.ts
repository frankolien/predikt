/**
 * Shared helpers for the football data layer: turning raw provider payloads into
 * our domain `Team`/`Fixture` shapes, plus best-effort real-world context
 * (flags, FIFA-ish ranks, talismans) the on-device pundit reads.
 *
 * The football APIs give us fixtures, scores, statuses, team names and crest
 * URLs — but not emoji flags, FIFA ranks or "key player" strings. We fill those
 * from small static maps of real facts (with sane generic fallbacks) so the
 * pundit always has non-empty, plausible context to reason over.
 */
import type { MatchStatus, Stage } from '../types.js';

// ---------------------------------------------------------------------------
// Match status / stage normalisation
// ---------------------------------------------------------------------------

const FINISHED = new Set([
  'FT',
  'AET',
  'AP',
  'PEN',
  'FT_PEN',
  'AWD',
  'WO',
  'MATCH FINISHED',
  'FINISHED',
  'FULL TIME',
]);
const LIVE = new Set([
  '1H',
  '2H',
  'HT',
  'ET',
  'BT',
  'P',
  'PEN_LIVE',
  'LIVE',
  'IN_PLAY',
  'PAUSED',
  'INPLAY',
  'HALF TIME',
]);

/** Map a provider status token (TheSportsDB `strStatus`, football-data `status`) to our tri-state. */
export function normaliseStatus(raw: string | null | undefined): MatchStatus {
  const s = (raw ?? '').trim().toUpperCase();
  if (!s) return 'scheduled';
  if (FINISHED.has(s)) return 'finished';
  if (LIVE.has(s)) return 'live';
  // A bare number (e.g. "63") is a live minute clock.
  if (/^\d{1,3}('?\+?\d*)?$/.test(s)) return 'live';
  return 'scheduled';
}

/** Map a raw round marker (TheSportsDB `intRound` / football-data `stage`) to a Stage label. */
export function normaliseStage(round: string | null | undefined, eventName = ''): Stage {
  const r = (round ?? '').trim().toUpperCase();
  // football-data.org textual stages.
  if (r.includes('FINAL') && !r.includes('SEMI') && !r.includes('QUARTER')) return 'Final';
  if (r.includes('SEMI')) return 'Semi-final';
  if (r.includes('QUARTER')) return 'Quarter-final';
  if (r.includes('LAST_16') || r === '16') return 'Round of 16';
  if (r.includes('LAST_32') || r === '32') return 'Round of 32';
  if (r.includes('GROUP')) return 'Group';
  // TheSportsDB numeric knockout markers.
  switch (r) {
    case '32':
      return 'Round of 32';
    case '16':
      return 'Round of 16';
    case '8':
      return 'Quarter-final';
    case '4':
      return 'Semi-final';
    case '1':
    case '2':
    case '3':
      return 'Group';
    default:
      break;
  }
  // Fall back to reading the event/round name.
  const n = eventName.toUpperCase();
  if (n.includes('FINAL') && !n.includes('SEMI') && !n.includes('QUARTER')) return 'Final';
  if (n.includes('SEMI')) return 'Semi-final';
  if (n.includes('QUARTER')) return 'Quarter-final';
  return 'Group';
}

// ---------------------------------------------------------------------------
// Country → flag emoji + 3-letter code
// ---------------------------------------------------------------------------

/** name → [3-letter code, flag emoji, approx FIFA rank]. Covers the current WC field. */
const COUNTRY: Record<string, [string, string, number]> = {
  argentina: ['ARG', '🇦🇷', 1],
  france: ['FRA', '🇫🇷', 2],
  spain: ['ESP', '🇪🇸', 3],
  england: ['ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 4],
  brazil: ['BRA', '🇧🇷', 5],
  portugal: ['POR', '🇵🇹', 6],
  netherlands: ['NED', '🇳🇱', 7],
  belgium: ['BEL', '🇧🇪', 8],
  italy: ['ITA', '🇮🇹', 9],
  germany: ['GER', '🇩🇪', 10],
  croatia: ['CRO', '🇭🇷', 11],
  morocco: ['MAR', '🇲🇦', 12],
  colombia: ['COL', '🇨🇴', 13],
  uruguay: ['URU', '🇺🇾', 14],
  usa: ['USA', '🇺🇸', 15],
  'united states': ['USA', '🇺🇸', 15],
  mexico: ['MEX', '🇲🇽', 16],
  switzerland: ['SUI', '🇨🇭', 17],
  japan: ['JPN', '🇯🇵', 18],
  senegal: ['SEN', '🇸🇳', 19],
  denmark: ['DEN', '🇩🇰', 20],
  iran: ['IRN', '🇮🇷', 21],
  'south korea': ['KOR', '🇰🇷', 22],
  australia: ['AUS', '🇦🇺', 23],
  ecuador: ['ECU', '🇪🇨', 24],
  austria: ['AUT', '🇦🇹', 25],
  ukraine: ['UKR', '🇺🇦', 26],
  sweden: ['SWE', '🇸🇪', 27],
  turkey: ['TUR', '🇹🇷', 28],
  wales: ['WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 29],
  serbia: ['SRB', '🇷🇸', 30],
  poland: ['POL', '🇵🇱', 31],
  egypt: ['EGY', '🇪🇬', 32],
  nigeria: ['NGA', '🇳🇬', 33],
  algeria: ['ALG', '🇩🇿', 34],
  norway: ['NOR', '🇳🇴', 35],
  scotland: ['SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 36],
  panama: ['PAN', '🇵🇦', 37],
  canada: ['CAN', '🇨🇦', 38],
  'ivory coast': ['CIV', '🇨🇮', 39],
  qatar: ['QAT', '🇶🇦', 40],
  'saudi arabia': ['KSA', '🇸🇦', 41],
  paraguay: ['PAR', '🇵🇾', 42],
  tunisia: ['TUN', '🇹🇳', 43],
  'czech republic': ['CZE', '🇨🇿', 44],
  'south africa': ['RSA', '🇿🇦', 45],
  ghana: ['GHA', '🇬🇭', 46],
  'cape verde': ['CPV', '🇨🇻', 47],
  'bosnia-herzegovina': ['BIH', '🇧🇦', 48],
  'bosnia and herzegovina': ['BIH', '🇧🇦', 48],
  'dr congo': ['COD', '🇨🇩', 49],
  curaçao: ['CUW', '🇨🇼', 50],
  curacao: ['CUW', '🇨🇼', 50],
  haiti: ['HAI', '🇭🇹', 51],
  jordan: ['JOR', '🇯🇴', 52],
  uzbekistan: ['UZB', '🇺🇿', 53],
  'new zealand': ['NZL', '🇳🇿', 54],
  iraq: ['IRQ', '🇮🇶', 55],
};

/** Star player per nation (public-domain fact). Generic fallback keeps the field non-empty. */
const KEY_PLAYER: Record<string, string> = {
  argentina: 'Lionel Messi',
  france: 'Kylian Mbappé',
  spain: 'Lamine Yamal',
  england: 'Jude Bellingham',
  brazil: 'Vinícius Júnior',
  portugal: 'Cristiano Ronaldo',
  netherlands: 'Cody Gakpo',
  belgium: 'Kevin De Bruyne',
  germany: 'Jamal Musiala',
  croatia: 'Luka Modrić',
  morocco: 'Achraf Hakimi',
  colombia: 'Luis Díaz',
  uruguay: 'Federico Valverde',
  usa: 'Christian Pulisic',
  'united states': 'Christian Pulisic',
  mexico: 'Santiago Giménez',
  switzerland: 'Granit Xhaka',
  japan: 'Takefusa Kubo',
  norway: 'Erling Haaland',
  egypt: 'Mohamed Salah',
  senegal: 'Sadio Mané',
  'south korea': 'Son Heung-min',
  australia: 'Mathew Ryan',
  ecuador: 'Moisés Caicedo',
  austria: 'Marcel Sabitzer',
  sweden: 'Alexander Isak',
  paraguay: 'Miguel Almirón',
  'ivory coast': 'Sébastien Haller',
  canada: 'Alphonso Davies',
  ghana: 'Mohammed Kudus',
  'cape verde': 'Ryan Mendes',
  'south africa': 'Percy Tau',
  algeria: 'Riyad Mahrez',
  'dr congo': 'Yoane Wissa',
};

function key(name: string): string {
  return name.trim().toLowerCase();
}

export function flagFor(name: string, providerCode?: string): string {
  const hit = COUNTRY[key(name)];
  if (hit) return hit[1];
  return '🏳️';
}

export function codeFor(name: string, providerCode?: string): string {
  const hit = COUNTRY[key(name)];
  if (hit) return hit[0];
  if (providerCode && providerCode.length >= 2) return providerCode.slice(0, 3).toUpperCase();
  // Derive from name: initials of words, else first three letters.
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return name.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'TBD';
}

export function rankFor(name: string, providerRank?: number): number {
  if (providerRank && providerRank > 0) return providerRank;
  const hit = COUNTRY[key(name)];
  return hit ? hit[2] : 0;
}

export function keyPlayerFor(name: string): string {
  return KEY_PLAYER[key(name)] ?? 'the collective — a real team effort, no single star to key on';
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce a provider timestamp into a proper UTC ISO string. */
export function toIsoUtc(strTimestamp?: string, dateEvent?: string, strTime?: string): string {
  if (strTimestamp && strTimestamp.trim()) {
    const ts = strTimestamp.trim();
    // TheSportsDB `strTimestamp` is UTC without a zone suffix.
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)) return new Date(ts).toISOString();
    return new Date(`${ts.replace(' ', 'T')}Z`).toISOString();
  }
  if (dateEvent) {
    const t = (strTime && strTime.trim()) || '00:00:00';
    return new Date(`${dateEvent}T${t}Z`).toISOString();
  }
  return new Date().toISOString();
}
