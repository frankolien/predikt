/**
 * Shared domain types for Gaffer.
 * Football tournament + self-custodial prediction pools.
 */

export type Stage =
  | 'Group'
  | 'Round of 32'
  | 'Round of 16'
  | 'Quarter-final'
  | 'Semi-final'
  | 'Final';
export type Outcome = 'home' | 'draw' | 'away';

/** Live state of the real-world match (distinct from the pool lifecycle `status`). */
export type MatchStatus = 'scheduled' | 'live' | 'finished';

export interface Team {
  id: string;
  name: string;
  code: string; // 3-letter code, e.g. "ARG"
  flag: string; // emoji
  fifaRank: number;
  /** Most-recent-first, e.g. ['W','W','D','L','W'] */
  recentForm: Array<'W' | 'D' | 'L'>;
  keyPlayer: string;
  /** One-line tactical note used as context for the on-device AI pundit. */
  styleNote: string;
  /** Real crest/badge image URL from the data provider (additive; optional). */
  badge?: string;
  /** Country/association name from the data provider (additive; optional). */
  country?: string;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
}

export interface Fixture {
  id: string;
  stage: Stage;
  homeTeamId: string;
  awayTeamId: string;
  /** ISO 8601 kickoff time. */
  kickoff: string;
  venue: string;
  /**
   * Pool/prediction lifecycle status (unchanged semantics):
   * 'scheduled' = open for entries, 'locked' = kicked off, 'settled' = paid out on-chain.
   */
  status: 'scheduled' | 'locked' | 'settled';
  /** Current score — live or final. Undefined before kickoff. */
  result?: MatchResult;
  /** Live state of the actual match from the data provider (additive; optional). */
  matchStatus?: MatchStatus;
  /** Live clock (e.g. 63 or "HT") while in-play, else null (additive; optional). */
  minute?: number | string | null;
  /** Competition name from the provider, e.g. "FIFA World Cup" (additive; optional). */
  league?: string;
}

/** A user's prediction for a fixture. */
export interface Prediction {
  homeGoals: number;
  awayGoals: number;
}

export function outcomeOf(r: MatchResult | Prediction): Outcome {
  if (r.homeGoals > r.awayGoals) return 'home';
  if (r.homeGoals < r.awayGoals) return 'away';
  return 'draw';
}

/** One fan's entry in a pool. */
export interface PoolEntry {
  /** Self-custodial EVM address of the fan (their WDK account). */
  address: string;
  displayName: string;
  prediction: Prediction;
  /** Stake in USDt (human units, e.g. 5 = 5 USDt). */
  stake: number;
  stakeTxHash?: string;
  joinedAt: string;
  /** Filled at settlement. */
  settled?: boolean;
  winnings?: number; // USDt paid out (0 if lost)
  payoutTxHash?: string;
  exactScore?: boolean;
}

export interface Pool {
  id: string;
  fixtureId: string;
  /** On-chain escrow contract holding the pot. Nobody custodies it. */
  escrowAddress: string;
  /** Stake required to enter, in USDt. */
  stake: number;
  status: 'open' | 'locked' | 'settled';
  entries: PoolEntry[];
  createdAt: string;
}

/** Result of the on-device AI pundit ("the Gaffer"). */
export interface GafferRead {
  fixtureId: string;
  predictedScore: Prediction;
  /** 0..1 model-stated confidence in the called outcome. */
  confidence: number;
  /** Long-form analysis (streamed to the client token-by-token). */
  analysis: string;
  /** One punchy hot-take line. */
  hotTake: string;
  /** True while inference is running on-device. */
  onDevice: true;
}
