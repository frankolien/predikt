/**
 * Gaffer v1 data model — free-to-play prediction game (points, not money).
 *
 * The chain/WDK layer is parked as the future real-money tier; the live product
 * runs on this relational model so pools, leagues, points and history survive
 * restarts and support real accounts. SQLite for local dev → Postgres at deploy
 * (Drizzle keeps the schema portable).
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Free-to-play accounts. Everyone starts with a points balance; no money. */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(), // uuid
    handle: text('handle').notNull(), // display name shown on leaderboards
    email: text('email'), // null until magic-link auth is added
    avatar: text('avatar'),
    walletAddress: text('wallet_address'), // linked self-custodial USD₮ wallet (WDK)
    points: integer('points').notNull().default(1000), // free starting balance
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email), // NULLs are distinct in SQLite
  }),
);

/** A prediction pool for one fixture, joinable by short invite code. */
export const pools = sqliteTable(
  'pools',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(), // shareable invite code, e.g. "GAF-7QX2"
    name: text('name').notNull(),
    fixtureId: text('fixture_id').notNull(), // references a live-feed fixture id
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id),
    buyIn: integer('buy_in').notNull().default(50), // points, or µUSD₮ when currency='usdt'
    currency: text('currency', { enum: ['points', 'usdt'] }).notNull().default('points'),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['open', 'locked', 'settled'] })
      .notNull()
      .default('open'),
    lockTime: integer('lock_time', { mode: 'timestamp_ms' }), // kickoff — no entries after
    resultHome: integer('result_home'),
    resultAway: integer('result_away'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    settledAt: integer('settled_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    codeIdx: uniqueIndex('pools_code_idx').on(t.code),
    fixtureIdx: index('pools_fixture_idx').on(t.fixtureId),
    creatorIdx: index('pools_creator_idx').on(t.creatorId),
  }),
);

/** A user's entry in a pool — their prediction + staked points. */
export const poolMembers = sqliteTable(
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
    staked: integer('staked').notNull(), // points, or µUSD₮ when the pool is usdt
    depositTx: text('deposit_tx'), // USD₮ buy-in tx hash
    // Filled at settlement:
    won: integer('won', { mode: 'boolean' }),
    winnings: integer('winnings'),
    payoutTx: text('payout_tx'), // USD₮ payout tx hash
    exact: integer('exact', { mode: 'boolean' }),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    uniqMember: uniqueIndex('pool_members_uniq').on(t.poolId, t.userId), // one entry per user per pool
    poolIdx: index('pool_members_pool_idx').on(t.poolId),
    userIdx: index('pool_members_user_idx').on(t.userId),
  }),
);

/** Immutable audit trail of every points balance change. */
export const pointsLedger = sqliteTable(
  'points_ledger',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    delta: integer('delta').notNull(), // +credit / -debit
    reason: text('reason', { enum: ['signup', 'stake', 'payout', 'refund', 'bonus'] }).notNull(),
    poolId: text('pool_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    userIdx: index('points_ledger_user_idx').on(t.userId),
  }),
);

/** Lightweight session tokens now; swap the issuer for magic-link auth at launch. */
export const sessions = sqliteTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
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
   every move on the points ledger. `currency` flips points → USD₮ (WDK) later.
   ============================================================================ */

/** A knockout tournament. Pot = sum of paid entries; split by `splitBps`. */
export const tournaments = sqliteTable(
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
    entryFee: integer('entry_fee').notNull().default(0), // points (or µUSD₮ when currency='usdt')
    currency: text('currency', { enum: ['points', 'usdt'] }).notNull().default('points'),
    maxPlayers: integer('max_players').notNull().default(8), // bracket cap (4/8/16)
    splitBps: text('split_bps').notNull().default('[10000]'), // JSON basis-points per placement
    winnerId: text('winner_id'), // participant id of the champion
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    codeIdx: uniqueIndex('tournaments_code_idx').on(t.code),
    organizerIdx: index('tournaments_organizer_idx').on(t.organizerId),
  }),
);

/** An entrant. Either a real user (pays the entry) or an organizer-added name. */
export const tournamentParticipants = sqliteTable(
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
    staked: integer('staked').notNull().default(0), // points, or µUSD₮ when currency='usdt'
    depositTx: text('deposit_tx'), // USD₮ buy-in tx hash
    placement: integer('placement'), // 1 = champion, 2 = runner-up, …
    payout: integer('payout'),
    payoutTx: text('payout_tx'), // USD₮ payout tx hash
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    tourIdx: index('tp_tour_idx').on(t.tournamentId),
    userIdx: index('tp_user_idx').on(t.userId),
    uniqUser: uniqueIndex('tp_uniq_user').on(t.tournamentId, t.userId), // NULLs distinct
  }),
);

/** One tie in the bracket. `nextMatchId`/`nextSlot` wire the winner forward. */
export const tournamentMatches = sqliteTable(
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
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
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

export const fantasyLeagues = sqliteTable(
  'fantasy_leagues',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id),
    buyIn: integer('buy_in').notNull().default(0),
    currency: text('currency', { enum: ['points', 'usdt'] }).notNull().default('points'),
    splitBps: text('split_bps').notNull().default('[10000]'),
    status: text('status', { enum: ['open', 'live', 'settled'] }).notNull().default('open'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),
    settledAt: integer('settled_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    codeIdx: uniqueIndex('fantasy_leagues_code_idx').on(t.code),
    creatorIdx: index('fantasy_leagues_creator_idx').on(t.creatorId),
  }),
);

/** One manager's entry in a league — their XI + captain + staked buy-in. */
export const fantasySquads = sqliteTable(
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
    staked: integer('staked').notNull().default(0), // points, or µUSD₮ when currency='usdt'
    depositTx: text('deposit_tx'),
    placement: integer('placement'),
    payout: integer('payout'),
    payoutTx: text('payout_tx'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    leagueIdx: index('fantasy_squads_league_idx').on(t.leagueId),
    userIdx: index('fantasy_squads_user_idx').on(t.userId),
    uniqMember: uniqueIndex('fantasy_squads_uniq').on(t.leagueId, t.userId),
  }),
);

export const fantasySquadPlayers = sqliteTable(
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

export type User = typeof users.$inferSelect;
export type Pool = typeof pools.$inferSelect;
export type PoolMember = typeof poolMembers.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type TournamentParticipant = typeof tournamentParticipants.$inferSelect;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;
export type FantasyLeague = typeof fantasyLeagues.$inferSelect;
export type FantasySquad = typeof fantasySquads.$inferSelect;
