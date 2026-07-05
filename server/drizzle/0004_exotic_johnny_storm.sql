ALTER TABLE `fantasy_squad_players` ADD `starter` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `fantasy_squad_players` ADD `bench_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fantasy_squads` ADD `vice_captain_player_id` text;--> statement-breakpoint
ALTER TABLE `fantasy_squads` ADD `chip` text;