CREATE TABLE `tournament_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`round` integer NOT NULL,
	`slot` integer NOT NULL,
	`home_participant_id` text,
	`away_participant_id` text,
	`home_score` integer,
	`away_score` integer,
	`winner_participant_id` text,
	`decided_by` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`next_match_id` text,
	`next_slot` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tm_tour_idx` ON `tournament_matches` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `tournament_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`seed` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`staked` integer DEFAULT 0 NOT NULL,
	`placement` integer,
	`payout` integer,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tp_tour_idx` ON `tournament_participants` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tp_user_idx` ON `tournament_participants` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tp_uniq_user` ON `tournament_participants` (`tournament_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`format` text DEFAULT 'knockout' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`organizer_id` text NOT NULL,
	`entry_fee` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'points' NOT NULL,
	`max_players` integer DEFAULT 8 NOT NULL,
	`split_bps` text DEFAULT '[10000]' NOT NULL,
	`winner_id` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`organizer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_code_idx` ON `tournaments` (`code`);--> statement-breakpoint
CREATE INDEX `tournaments_organizer_idx` ON `tournaments` (`organizer_id`);