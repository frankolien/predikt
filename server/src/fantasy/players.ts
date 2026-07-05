/**
 * Curated World Cup player pool for Fantasy — the salary-cap universe.
 *
 * Player-level stats are thin on the free data tier, so scoring is driven by
 * each player's TEAM outcomes (see scoring.ts). We keep the pool static and
 * balanced (12 nations × GK/DEF/MID/FWD) so any valid XI is always buildable
 * under budget. `code` matches the live-feed team TLA so scoring can join on it.
 */
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Player {
  id: string;
  name: string;
  teamCode: string; // FIFA TLA, matches the live fixture feed
  teamName: string;
  position: Position;
  price: number; // in credits (budget = 100)
  // Enrichment from the real squad feed (optional — absent on the offline fallback).
  dateOfBirth?: string | null; // ISO "YYYY-MM-DD"
  nationality?: string | null;
  crest?: string | null; // real team badge URL
}

interface Seed {
  team: string;
  code: string;
  gk: [string, number];
  def: [string, number];
  mid: [string, number];
  fwd: [string, number];
}

const SEEDS: Seed[] = [
  { team: 'France', code: 'FRA', gk: ['M. Maignan', 5.0], def: ['W. Saliba', 5.5], mid: ['A. Tchouaméni', 6.5], fwd: ['K. Mbappé', 12.0] },
  { team: 'Brazil', code: 'BRA', gk: ['Alisson', 5.5], def: ['Marquinhos', 5.5], mid: ['Bruno Guimarães', 6.5], fwd: ['Vinícius Jr', 11.0] },
  { team: 'Argentina', code: 'ARG', gk: ['E. Martínez', 5.5], def: ['C. Romero', 5.0], mid: ['A. Mac Allister', 7.0], fwd: ['L. Messi', 11.5] },
  { team: 'England', code: 'ENG', gk: ['J. Pickford', 5.0], def: ['J. Stones', 5.0], mid: ['J. Bellingham', 9.5], fwd: ['H. Kane', 10.5] },
  { team: 'Spain', code: 'ESP', gk: ['Unai Simón', 4.5], def: ['Le Normand', 4.5], mid: ['Pedri', 8.0], fwd: ['Lamine Yamal', 9.0] },
  { team: 'Portugal', code: 'POR', gk: ['D. Costa', 4.5], def: ['Rúben Dias', 5.5], mid: ['B. Fernandes', 8.5], fwd: ['R. Leão', 8.0] },
  { team: 'Netherlands', code: 'NED', gk: ['B. Verbruggen', 4.5], def: ['V. van Dijk', 5.5], mid: ['F. de Jong', 7.0], fwd: ['C. Gakpo', 7.0] },
  { team: 'Germany', code: 'GER', gk: ['M. ter Stegen', 5.0], def: ['A. Rüdiger', 5.0], mid: ['J. Musiala', 8.5], fwd: ['K. Havertz', 7.5] },
  { team: 'Belgium', code: 'BEL', gk: ['K. Casteels', 4.0], def: ['W. Faes', 4.0], mid: ['K. De Bruyne', 8.5], fwd: ['R. Lukaku', 7.0] },
  { team: 'Croatia', code: 'CRO', gk: ['D. Livaković', 4.5], def: ['J. Gvardiol', 5.5], mid: ['L. Modrić', 6.0], fwd: ['A. Kramarić', 5.5] },
  { team: 'Morocco', code: 'MAR', gk: ['Y. Bounou', 4.5], def: ['A. Hakimi', 6.5], mid: ['S. Amrabat', 4.5], fwd: ['Y. En-Nesyri', 5.5] },
  { team: 'Norway', code: 'NOR', gk: ['Ø. Nyland', 4.0], def: ['K. Ajer', 4.0], mid: ['M. Ødegaard', 7.5], fwd: ['E. Haaland', 11.5] },
];

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Offline fallback pool. The live pool is fetched from real WC squads (squads.ts). */
export const FALLBACK_PLAYERS: Player[] = SEEDS.flatMap((s) => {
  const mk = (pos: Position, [name, price]: [string, number]): Player => ({
    id: `${s.code.toLowerCase()}-${slug(name)}`,
    name,
    teamCode: s.code,
    teamName: s.team,
    position: pos,
    price,
  });
  return [mk('GK', s.gk), mk('DEF', s.def), mk('MID', s.mid), mk('FWD', s.fwd)];
});

/** FPL-style squad rules: a 15-man squad, an 11-man starting XI, and a 4-man bench. */
export const BUDGET = 100;
export const SQUAD_SIZE = 15; // full squad
export const XI_SIZE = 11; // starting eleven
export const MAX_PER_TEAM = 3;
/** Exact composition of the 15-man squad (2 GK, 5 DEF, 5 MID, 3 FWD). */
export const SQUAD_QUOTA: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
/** Starting-XI formation bounds — exactly 1 GK plus a valid outfield shape. */
export const XI_QUOTA: Record<Position, { min: number; max: number }> = {
  GK: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 2, max: 5 },
  FWD: { min: 1, max: 3 },
};
/** @deprecated legacy alias — the XI formation bounds. */
export const QUOTA = XI_QUOTA;
