/**
 * Gaffer v1 data model — free-to-play prediction game (points) + real USD₮.
 *
 * Postgres (Drizzle). Money amounts (buy-ins/pots/payouts) are stored as BIGINT
 * because USD₮ is tracked in µUSD₮ (×1e6) and would overflow a 32-bit int; plain
 * counters (points, scores, ranks) stay INTEGER. Timestamps are timestamptz.
 */
import { pgTable, text, integer, bigint, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Shared column builders — a timestamptz that maps to a JS Date, and a money
// column (BIGINT as number: whole points, or µUSD₮ ×1e6 for real USD₮).
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const money = (name: string) => bigint(name, { mode: 'number' });

/** Free-to-play accounts. Everyone starts with a points balance; no money. */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // uuid
    handle: text('handle').notNull(), // display name shown on leaderboards
    email: text('email'), // null until magic-link auth is added
    avatar: text('avatar'),
    walletAddress: text('wallet_address'), // linked self-custodial USD₮ wallet (WDK)
    points: integer('points').notNull().default(1000), // free starting balance
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email), // NULLs are distinct
  }),
);

/** A prediction pool for one fixture, joinable by short invite code. */
export const pools = pgTable(
  'pools',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(), // shareable invite code, e.g. "GAF-7QX2"
    name: text('name').notNull(),
    fixtureId: text('fixture_id').notNull(), // references a live-feed fixture id
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id),
    buyIn: money('buy_in').notNull().default(50), // points, or µUSD₮ when currency='usdt'
    currency: text('currency', { enum: ['points', 'usdt'] }).notNull().default('points'),
    isPublic: boolean('is_public').notNull().default(false),
    status: text('status', { enum: ['open', 'locked', 'settled'] })
      .notNull()
      .default('open'),
    lockTime: ts('lock_time'), // kickoff — no entries after
    resultHome: integer('result_home'),
    resultAway: integer('result_away'),
    createdAt: ts('created_at').notNull(),
    settledAt: ts('settled_at'),
  },
  (t) => ({
    codeIdx: uniqueIndex('pools_code_idx').on(t.code),
    fixtureIdx: index('pools_fixture_idx').on(t.fixtureId),
    creatorIdx: index('pools_creator_idx').on(t.creatorId),
  }),
);

/** A user's entry in a pool — their prediction + staked points. */
export const poolMembers = pgTable(
  'pool_members',
  {
    id: text('id').primaryKey(),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    predHome: integer('pred_home').notNull(),
    predAway: integer('pred_away').notNull(),
    staked: money('staked').notNull(), // points, or µUSD₮ when the pool is usdt
    depositTx: text('deposit_tx'), // USD₮ buy-in tx hash
    // Filled at settlement:
    won: boolean('won'),
    winnings: money('winnings'),
    payoutTx: text('payout_tx'), // USD₮ payout tx hash
    exact: boolean('exact'),
    joinedAt: ts('joined_at').notNull(),
  },
  (t) => ({
    uniqMember: uniqueIndex('pool_members_uniq').on(t.poolId, t.userId), // one entry per user per pool
    poolIdx: index('pool_members_pool_idx').on(t.poolId),
    userIdx: index('pool_members_user_idx').on(t.userId),
  }),
);

/**
 * Live group chat for ANY room — a pool, a cup, or a fantasy league. One table for all
 * three: `room` is a namespaced key `pool:<id>` | `cup:<id>` | `league:<id>` (the same
 * convention the escrow uses for deposit purposes), so chat generalises without a table
 * per product. Membership (who may read/post) is enforced per-kind in the store against
 * poolMembers / tournamentParticipants / fantasySquads. Text-only; sender identity
 * (handle/avatar) is joined from `users` at read time.
 */
export const roomMessages = pgTable(
  'room_messages',
  {
    id: text('id').primaryKey(),
    room: text('room').notNull(), // 'pool:<id>' | 'cup:<id>' | 'league:<id>'
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    // (room, time) — fetch a room's recent messages in order without a sort.
    roomIdx: index('room_messages_room_idx').on(t.room, t.createdAt),
  }),
);

/** Immutable audit trail of every points balance change. */
export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    delta: integer('delta').notNull(), // +credit / -debit (points only)
    reason: text('reason', { enum: ['signup', 'stake', 'payout', 'refund', 'bonus'] }).notNull(),
    poolId: text('pool_id'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    userIdx: index('points_ledger_user_idx').on(t.userId),
  }),
);

/** Lightweight session tokens now; swap the issuer for magic-link auth at launch. */
export const sessions = pgTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: ts('created_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
  }),
);

/* ============================================================================
   ORGANIZE — tournaments (single-elimination "Cup"). Anyone can run a knockout:
   set an entry fee, invite players by code, the Gaffer seeds + narrates the
   draw, scores advance the bracket live, and the pot auto-pays the winners.
   Same buy-in/settlement discipline as pools — entry debits, payout credits,
   every move on the points ledger. `currency` flips points → USD₮ (WDK).
   ============================================================================ */

/** A knockout tournament. Pot = sum of paid entries; split by `splitBps`. */
export const tournaments = pgTable(
  'tournaments',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(), // shareable invite code, e.g. "CUP-7QX2"
    name: text('name').notNull(),
    format: text('format', { enum: ['knockout'] }).notNull().default('knockout'),
    status: text('status', { enum: ['open', 'live', 'completed', 'cancelled'] })
      .notNull()
      .default('open'),
    organizerId: text('organizer_id')
      .notNull()
      .references(() => users.id),
    entryFee: money('entry_fee').notNull().default(0), // points (or µUSD₮ when currency='usdt')
    currency: text('currency', { enum: ['points', 'usdt'] }).notNull().default('points'),
    maxPlayers: integer('max_players').notNull().default(8), // bracket cap (4/8/16)
    splitBps: text('split_bps').notNull().default('[10000]'), // JSON basis-points per placement
    winnerId: text('winner_id'), // participant id of the champion
    createdAt: ts('created_at').notNull(),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
  },
  (t) => ({
    codeIdx: uniqueIndex('tournaments_code_idx').on(t.code),
    organizerIdx: index('tournaments_organizer_idx').on(t.organizerId),
  }),
);

/** An entrant. Either a real user (pays the entry) or an organizer-added name. */
export const tournamentParticipants = pgTable(
  'tournament_participants',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id),
    userId: text('user_id').references(() => users.id), // null for manual/offline entrants
    name: text('name').notNull(), // display name (handle, team, or country)
    seed: integer('seed'), // assigned at start; 1 = top seed
    status: text('status', { enum: ['active', 'eliminated', 'champion', 'withdrawn'] })
      .notNull()
      .default('active'),
    staked: money('staked').notNull().default(0), // points, or µUSD₮ when currency='usdt'
    depositTx: text('deposit_tx'), // USD₮ buy-in tx hash
    placement: integer('placement'), // 1 = champion, 2 = runner-up, …
    payout: money('payout'),
    payoutTx: text('payout_tx'), // USD₮ payout tx hash
    joinedAt: ts('joined_at').notNull(),
  },
  (t) => ({
    tourIdx: index('tp_tour_idx').on(t.tournamentId),
    userIdx: index('tp_user_idx').on(t.userId),
    uniqUser: uniqueIndex('tp_uniq_user').on(t.tournamentId, t.userId), // NULLs distinct
  }),
);

/** One tie in the bracket. `nextMatchId`/`nextSlot` wire the winner forward. */
export const tournamentMatches = pgTable(
  'tournament_matches',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id),
    round: integer('round').notNull(), // 1 = first round
    slot: integer('slot').notNull(), // 0-based position within the round
    homeParticipantId: text('home_participant_id'),
    awayParticipantId: text('away_participant_id'),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    winnerParticipantId: text('winner_participant_id'),
    decidedBy: text('decided_by', { enum: ['normal', 'penalties'] }),
    status: text('status', { enum: ['pending', 'ready', 'live', 'confirmed'] })
      .notNull()
      .default('pending'),
    nextMatchId: text('next_match_id'),
    nextSlot: text('next_slot', { enum: ['home', 'away'] }),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    tourIdx: index('tm_tour_idx').on(t.tournamentId),
  }),
);

/* ============================================================================
   FANTASY — salary-cap mini-leagues. Pick an XI of real WC players under a
   budget, captain one, join a league with a buy-in. Points are scored from each
   player's TEAM outcomes off the live feed (scoring.ts). Same buy-in/settlement
   discipline as pools + cups. Player pool is static (fantasy/players.ts).
   ============================================================================ */

export const fantasyLeagues = pgTable(
  'fantasy_leagues',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id),
    buyIn: money('buy_in').notNull().default(0),
    currency: text('currency', { enum: ['points', 'usdt'] }).notNull().default('points'),
    splitBps: text('split_bps').notNull().default('[10000]'),
    status: text('status', { enum: ['open', 'live', 'settled'] }).notNull().default('open'),
    createdAt: ts('created_at').notNull(),
    lockedAt: ts('locked_at'),
    settledAt: ts('settled_at'),
  },
  (t) => ({
    codeIdx: uniqueIndex('fantasy_leagues_code_idx').on(t.code),
    creatorIdx: index('fantasy_leagues_creator_idx').on(t.creatorId),
  }),
);

/** One manager's entry in a league — their XI + captain + staked buy-in. */
export const fantasySquads = pgTable(
  'fantasy_squads',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => fantasyLeagues.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    captainPlayerId: text('captain_player_id').notNull(),
    viceCaptainPlayerId: text('vice_captain_player_id'), // FPL vice — takes the armband if the captain's team doesn't feature
    chip: text('chip'), // null | 'tc' (Triple Captain) | 'bb' (Bench Boost)
    budgetUsed: integer('budget_used').notNull().default(0), // ×10 (one dp) to stay integer
    staked: money('staked').notNull().default(0), // points, or µUSD₮ when currency='usdt'
    depositTx: text('deposit_tx'),
    placement: integer('placement'),
    payout: money('payout'),
    payoutTx: text('payout_tx'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    leagueIdx: index('fantasy_squads_league_idx').on(t.leagueId),
    userIdx: index('fantasy_squads_user_idx').on(t.userId),
    uniqMember: uniqueIndex('fantasy_squads_uniq').on(t.leagueId, t.userId),
  }),
);

export const fantasySquadPlayers = pgTable(
  'fantasy_squad_players',
  {
    id: text('id').primaryKey(),
    squadId: text('squad_id')
      .notNull()
      .references(() => fantasySquads.id),
    playerId: text('player_id').notNull(), // references the static player pool
    starter: integer('starter').notNull().default(1), // 1 = starting XI, 0 = bench
    benchOrder: integer('bench_order').notNull().default(0), // outfield bench sub priority (1..3); 0 for starters / bench GK
  },
  (t) => ({
    squadIdx: index('fantasy_squad_players_squad_idx').on(t.squadId),
  }),
);

/**
 * Client-side-custody buy-ins: a USD₮ deposit the FAN signed + broadcast is
 * verified on-chain, then its tx hash is recorded here so it can never fund a
 * second join. The primary key IS the replay lock — a duplicate insert fails.
 * See docs/custody-plan.md §5.
 */
export const consumedDeposits = pgTable('consumed_deposits', {
  txHash: text('tx_hash').primaryKey(),
  userId: text('user_id').notNull(),
  purpose: text('purpose').notNull(), // 'pool:<id>' | 'cup:<id>' | 'league:<id>' — binds the tx to its target
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Pool = typeof pools.$inferSelect;
export type PoolMember = typeof poolMembers.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type TournamentParticipant = typeof tournamentParticipants.$inferSelect;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;
export type FantasyLeague = typeof fantasyLeagues.$inferSelect;
export type FantasySquad = typeof fantasySquads.$inferSelect;
