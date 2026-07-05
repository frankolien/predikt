/**
 * Tournament data for the demo — real national teams, public-domain facts,
 * plausible form/context. This is the football "world" the pundit reasons over
 * and the pools are built around. Not tied to any licensed competition.
 */
import type { Team, Fixture } from '../types.js';

export const TEAMS: Record<string, Team> = {
  ARG: {
    id: 'ARG', name: 'Argentina', code: 'ARG', flag: '🇦🇷', fifaRank: 1,
    recentForm: ['W', 'W', 'W', 'D', 'W'], keyPlayer: 'Lionel Messi',
    styleNote: 'Patient possession, deadly on transitions, sets the tempo through Messi in the half-spaces.',
  },
  FRA: {
    id: 'FRA', name: 'France', code: 'FRA', flag: '🇫🇷', fifaRank: 2,
    recentForm: ['W', 'W', 'L', 'W', 'W'], keyPlayer: 'Kylian Mbappé',
    styleNote: 'Sit deep, break at pace. Mbappé stretches the last line; lethal on the counter.',
  },
  BRA: {
    id: 'BRA', name: 'Brazil', code: 'BRA', flag: '🇧🇷', fifaRank: 3,
    recentForm: ['W', 'D', 'W', 'W', 'L'], keyPlayer: 'Vinícius Júnior',
    styleNote: 'High full-backs, individual flair out wide, overloads the left through Vinícius.',
  },
  ENG: {
    id: 'ENG', name: 'England', code: 'ENG', flag: '🏴', fifaRank: 4,
    recentForm: ['D', 'W', 'W', 'D', 'W'], keyPlayer: 'Jude Bellingham',
    styleNote: 'Controlled build-up, Bellingham arriving late in the box; can go conservative when ahead.',
  },
  ESP: {
    id: 'ESP', name: 'Spain', code: 'ESP', flag: '🇪🇸', fifaRank: 5,
    recentForm: ['W', 'W', 'W', 'W', 'D'], keyPlayer: 'Pedri',
    styleNote: 'Relentless positional play, suffocating midfield triangles, patient until the gap opens.',
  },
  POR: {
    id: 'POR', name: 'Portugal', code: 'POR', flag: '🇵🇹', fifaRank: 6,
    recentForm: ['W', 'L', 'W', 'W', 'W'], keyPlayer: 'Rafael Leão',
    styleNote: 'Direct wide play, dangerous from set-pieces, vulnerable in behind when full-backs push on.',
  },
  NED: {
    id: 'NED', name: 'Netherlands', code: 'NED', flag: '🇳🇱', fifaRank: 7,
    recentForm: ['D', 'W', 'D', 'W', 'L'], keyPlayer: 'Cody Gakpo',
    styleNote: 'Structured 4-3-3, clean build from the back, methodical rather than explosive.',
  },
  CRO: {
    id: 'CRO', name: 'Croatia', code: 'CRO', flag: '🇭🇷', fifaRank: 8,
    recentForm: ['D', 'D', 'W', 'D', 'W'], keyPlayer: 'Luka Modrić',
    styleNote: 'Midfield-controlled, tournament-savvy, thrives in tight low-scoring knockout games.',
  },
};

/**
 * Fixtures for the demo. The marquee one (QF: ARG v FRA) is the default pool.
 * `kickoff` times are fixed strings so the demo is deterministic.
 */
export const FIXTURES: Fixture[] = [
  {
    id: 'QF1', stage: 'Quarter-final', homeTeamId: 'ARG', awayTeamId: 'FRA',
    kickoff: '2026-07-10T19:00:00Z', venue: 'Estadio Monumental', status: 'scheduled',
  },
  {
    id: 'QF2', stage: 'Quarter-final', homeTeamId: 'ESP', awayTeamId: 'BRA',
    kickoff: '2026-07-10T22:00:00Z', venue: 'Camp Nou', status: 'scheduled',
  },
  {
    id: 'QF3', stage: 'Quarter-final', homeTeamId: 'ENG', awayTeamId: 'POR',
    kickoff: '2026-07-11T19:00:00Z', venue: 'Wembley Stadium', status: 'scheduled',
  },
  {
    id: 'QF4', stage: 'Quarter-final', homeTeamId: 'NED', awayTeamId: 'CRO',
    kickoff: '2026-07-11T22:00:00Z', venue: 'Johan Cruyff Arena', status: 'scheduled',
  },
];

export function getFixture(id: string): Fixture | undefined {
  return FIXTURES.find((f) => f.id === id);
}

export function getTeam(id: string): Team {
  const t = TEAMS[id];
  if (!t) throw new Error(`Unknown team: ${id}`);
  return t;
}

export function formString(form: Array<'W' | 'D' | 'L'>): string {
  return form.join('-');
}
