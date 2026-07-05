/**
 * Pure, deterministic pool settlement.
 *
 * Rule (fair sweepstake): the whole pot is split among fans who called the
 * correct OUTCOME (home / draw / away), pro-rata to their stake. If nobody
 * called it, everyone is refunded their stake. Exact-scoreline callers get a
 * "nailed it" badge (same payout tier in v1).
 *
 * All money math is done in integer base units (bigint) so the pot is conserved
 * exactly — no floating-point drift on real token transfers. Any indivisible
 * remainder (dust) goes to the largest-stake winner.
 */
import type { MatchResult, PoolEntry } from '../types.js';
import { outcomeOf } from '../types.js';

export interface Payout {
  address: string;
  /** Exact amount to transfer on-chain, in token base units. */
  baseUnits: bigint;
  /** Human-readable amount for display. */
  amount: number;
  won: boolean;
  exactScore: boolean;
}

export interface Settlement {
  outcome: ReturnType<typeof outcomeOf>;
  potBaseUnits: bigint;
  refunded: boolean;
  payouts: Payout[];
}

function toBaseUnits(human: number, decimals: number): bigint {
  // Avoid float error: build the integer string.
  const [whole, frac = ''] = human.toString().split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole + fracPadded);
}

function toHuman(base: bigint, decimals: number): number {
  return Number(base) / 10 ** decimals;
}

export function settlePool(
  entries: PoolEntry[],
  result: MatchResult,
  decimals = 6,
): Settlement {
  const actual = outcomeOf(result);
  const stakes = entries.map((e) => toBaseUnits(e.stake, decimals));
  const pot = stakes.reduce((a, b) => a + b, 0n);

  const winnerIdx = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => outcomeOf(e.prediction) === actual)
    .map(({ i }) => i);

  // No winners → refund each fan their own stake.
  if (winnerIdx.length === 0) {
    return {
      outcome: actual,
      potBaseUnits: pot,
      refunded: true,
      payouts: entries.map((e, i) => ({
        address: e.address,
        baseUnits: stakes[i],
        amount: toHuman(stakes[i], decimals),
        won: false,
        exactScore: false,
      })),
    };
  }

  const winnerStakeSum = winnerIdx.reduce((a, i) => a + stakes[i], 0n);

  // Pro-rata split in base units.
  const shares = new Map<number, bigint>();
  let distributed = 0n;
  for (const i of winnerIdx) {
    const share = (pot * stakes[i]) / winnerStakeSum;
    shares.set(i, share);
    distributed += share;
  }
  // Assign dust to the largest-stake winner so the pot is conserved exactly.
  const dust = pot - distributed;
  if (dust > 0n) {
    const biggest = winnerIdx.reduce((best, i) => (stakes[i] > stakes[best] ? i : best), winnerIdx[0]);
    shares.set(biggest, (shares.get(biggest) ?? 0n) + dust);
  }

  const payouts: Payout[] = entries.map((e, i) => {
    const base = shares.get(i) ?? 0n;
    return {
      address: e.address,
      baseUnits: base,
      amount: toHuman(base, decimals),
      won: base > 0n,
      exactScore:
        e.prediction.homeGoals === result.homeGoals &&
        e.prediction.awayGoals === result.awayGoals,
    };
  });

  return { outcome: actual, potBaseUnits: pot, refunded: false, payouts };
}

export const _internal = { toBaseUnits, toHuman };
