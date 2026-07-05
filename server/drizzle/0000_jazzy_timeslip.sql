CREATE TABLE `points_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`pool_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `points_ledger_user_idx` ON `points_ledger` (`user_id`);--> statement-breakpoint
CREATE TABLE `pool_members` (
	`id` text PRIMARY KEY NOT NULL,
	`pool_id` text NOT NULL,
	`user_id` text NOT NULL,
	`pred_home` integer NOT NULL,
	`pred_away` integer NOT NULL,
	`staked` integer NOT NULL,
	`won` integer,
	`winnings` integer,
	`exact` integer,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pool_members_uniq` ON `pool_members` (`pool_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `pool_members_pool_idx` ON `pool_members` (`pool_id`);--> statement-breakpoint
CREATE INDEX `pool_members_user_idx` ON `pool_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `pools` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`fixture_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`buy_in` integer DEFAULT 50 NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`lock_time` integer,
	`result_home` integer,
	`result_away` integer,
	`created_at` integer NOT NULL,
	`settled_at` integer,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pools_code_idx` ON `pools` (`code`);--> statement-breakpoint
CREATE INDEX `pools_fixture_idx` ON `pools` (`fixture_id`);--> statement-breakpoint
CREATE INDEX `pools_creator_idx` ON `pools` (`creator_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`email` text,
	`avatar` text,
	`points` integer DEFAULT 1000 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);