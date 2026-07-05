ALTER TABLE `pool_members` ADD `deposit_tx` text;--> statement-breakpoint
ALTER TABLE `pool_members` ADD `payout_tx` text;--> statement-breakpoint
ALTER TABLE `pools` ADD `currency` text DEFAULT 'points' NOT NULL;