CREATE TABLE `fantasy_leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`creator_id` text NOT NULL,
	`buy_in` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'points' NOT NULL,
	`split_bps` text DEFAULT '[10000]' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`locked_at` integer,
	`settled_at` integer,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fantasy_leagues_code_idx` ON `fantasy_leagues` (`code`);--> statement-breakpoint
CREATE INDEX `fantasy_leagues_creator_idx` ON `fantasy_leagues` (`creator_id`);--> statement-breakpoint
CREATE TABLE `fantasy_squad_players` (
	`id` text PRIMARY KEY NOT NULL,
	`squad_id` text NOT NULL,
	`player_id` text NOT NULL,
	FOREIGN KEY (`squad_id`) REFERENCES `fantasy_squads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fantasy_squad_players_squad_idx` ON `fantasy_squad_players` (`squad_id`);--> statement-breakpoint
CREATE TABLE `fantasy_squads` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`user_id` text NOT NULL,
	`captain_player_id` text NOT NULL,
	`budget_used` integer DEFAULT 0 NOT NULL,
	`staked` integer DEFAULT 0 NOT NULL,
	`placement` integer,
	`payout` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `fantasy_leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fantasy_squads_league_idx` ON `fantasy_squads` (`league_id`);--> statement-breakpoint
CREATE INDEX `fantasy_squads_user_idx` ON `fantasy_squads` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fantasy_squads_uniq` ON `fantasy_squads` (`league_id`,`user_id`);