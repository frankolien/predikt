ALTER TABLE `fantasy_squads` ADD `deposit_tx` text;--> statement-breakpoint
ALTER TABLE `fantasy_squads` ADD `payout_tx` text;--> statement-breakpoint
ALTER TABLE `tournament_participants` ADD `deposit_tx` text;--> statement-breakpoint
ALTER TABLE `tournament_participants` ADD `payout_tx` text;--> statement-breakpoint
ALTER TABLE `users` ADD `wallet_address` text;