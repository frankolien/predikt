/**
 * Pure single-elimination bracket maths — no DB, no side effects, fully tested.
 *
 * Given N seeded entrants, we build the standard tournament bracket where the
 * top seed only ever meets the 2nd seed in the final. Non-power-of-two fields
 * get byes handed to the STRONGEST seeds (so the draw stays fair), exactly like
 * Challonge. The store turns these specs into DB rows and wires the winners
 * forward via `nextMatchId`/`nextSlot`.
 */

/** Smallest power of two ≥ n (min 2). */
export function bracketSize(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return Math.max(2, size);
}

/**
 * Standard bracket seed order for a power-of-two `size`.
 * size 2 → [1,2]; 4 → [1,4,2,3]; 8 → [1,8,4,5,2,7,3,6].
 * Consecutive pairs are the round-1 ties: (1v8)(4v5)(2v7)(3v6).
 */
export function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

export interface MatchSpec {
  round: number; // 1-based
  slot: number; // 0-based within the round
  /** Seed occupying each side in round 1, or null for later rounds / byes. */
  homeSeed: number | null;
  awaySeed: number | null;
  /** Where this match's winner goes (null for the final). */
  nextRound: number | null;
  nextSlot: number | null;
  nextSide: 'home' | 'away' | null;
}

/**
 * Build every match in the bracket for `size` slots. Round 1 is filled from the
 * seed order; a seed greater than `entrants` is a BYE (its opponent walks
 * through). Later-round matches start empty and are fed by `nextRound/Slot/Side`.
 */
export function buildBracket(entrants: number): MatchSpec[] {
  const size = bracketSize(entrants);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const matches: MatchSpec[] = [];

  for (let round = 1; round <= rounds; round++) {
    const matchesInRound = size / 2 ** round;
    for (let slot = 0; slot < matchesInRound; slot++) {
      const isFinal = round === rounds;
      const spec: MatchSpec = {
        round,
        slot,
        homeSeed: null,
        awaySeed: null,
        nextRound: isFinal ? null : round + 1,
        nextSlot: isFinal ? null : Math.floor(slot / 2),
        nextSide: isFinal ? null : slot % 2 === 0 ? 'home' : 'away',
      };
      if (round === 1) {
        const hs = order[slot * 2];
        const as = order[slot * 2 + 1];
        // Seeds beyond the real field are byes (null).
        spec.homeSeed = hs <= entrants ? hs : null;
        spec.awaySeed = as <= entrants ? as : null;
      }
      matches.push(spec);
    }
  }
  return matches;
}

/** Human label for a round given the total number of rounds. */
export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round; // 0 = final
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  const teams = 2 ** (fromEnd + 1);
  return `Round of ${teams}`;
}
