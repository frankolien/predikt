CREATE TABLE "fantasy_leagues" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"creator_id" text NOT NULL,
	"buy_in" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'points' NOT NULL,
	"split_bps" text DEFAULT '[10000]' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fantasy_squad_players" (
	"id" text PRIMARY KEY NOT NULL,
	"squad_id" text NOT NULL,
	"player_id" text NOT NULL,
	"starter" integer DEFAULT 1 NOT NULL,
	"bench_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_squads" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"captain_player_id" text NOT NULL,
	"vice_captain_player_id" text,
	"chip" text,
	"budget_used" integer DEFAULT 0 NOT NULL,
	"staked" bigint DEFAULT 0 NOT NULL,
	"deposit_tx" text,
	"placement" integer,
	"payout" bigint,
	"payout_tx" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"pool_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_members" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"user_id" text NOT NULL,
	"pred_home" integer NOT NULL,
	"pred_away" integer NOT NULL,
	"staked" bigint NOT NULL,
	"deposit_tx" text,
	"won" boolean,
	"winnings" bigint,
	"payout_tx" text,
	"exact" boolean,
	"joined_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"fixture_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"buy_in" bigint DEFAULT 50 NOT NULL,
	"currency" text DEFAULT 'points' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"lock_time" timestamp with time zone,
	"result_home" integer,
	"result_away" integer,
	"created_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"round" integer NOT NULL,
	"slot" integer NOT NULL,
	"home_participant_id" text,
	"away_participant_id" text,
	"home_score" integer,
	"away_score" integer,
	"winner_participant_id" text,
	"decided_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"next_match_id" text,
	"next_slot" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"seed" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"staked" bigint DEFAULT 0 NOT NULL,
	"deposit_tx" text,
	"placement" integer,
	"payout" bigint,
	"payout_tx" text,
	"joined_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"format" text DEFAULT 'knockout' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"organizer_id" text NOT NULL,
	"entry_fee" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'points' NOT NULL,
	"max_players" integer DEFAULT 8 NOT NULL,
	"split_bps" text DEFAULT '[10000]' NOT NULL,
	"winner_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"email" text,
	"avatar" text,
	"wallet_address" text,
	"points" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_leagues" ADD CONSTRAINT "fantasy_leagues_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_squad_players" ADD CONSTRAINT "fantasy_squad_players_squad_id_fantasy_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."fantasy_squads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_squads" ADD CONSTRAINT "fantasy_squads_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_squads" ADD CONSTRAINT "fantasy_squads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_leagues_code_idx" ON "fantasy_leagues" USING btree ("code");--> statement-breakpoint
CREATE INDEX "fantasy_leagues_creator_idx" ON "fantasy_leagues" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "fantasy_squad_players_squad_idx" ON "fantasy_squad_players" USING btree ("squad_id");--> statement-breakpoint
CREATE INDEX "fantasy_squads_league_idx" ON "fantasy_squads" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "fantasy_squads_user_idx" ON "fantasy_squads" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_squads_uniq" ON "fantasy_squads" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE INDEX "points_ledger_user_idx" ON "points_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_members_uniq" ON "pool_members" USING btree ("pool_id","user_id");--> statement-breakpoint
CREATE INDEX "pool_members_pool_idx" ON "pool_members" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "pool_members_user_idx" ON "pool_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pools_code_idx" ON "pools" USING btree ("code");--> statement-breakpoint
CREATE INDEX "pools_fixture_idx" ON "pools" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "pools_creator_idx" ON "pools" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tm_tour_idx" ON "tournament_matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tp_tour_idx" ON "tournament_participants" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tp_user_idx" ON "tournament_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tp_uniq_user" ON "tournament_participants" USING btree ("tournament_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_code_idx" ON "tournaments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "tournaments_organizer_idx" ON "tournaments" USING btree ("organizer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");