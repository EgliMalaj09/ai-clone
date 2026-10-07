ALTER TABLE `users` ADD `terms_version` text;--> statement-breakpoint
ALTER TABLE `users` ADD `terms_accepted_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `age_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `marketing_opt_in` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `marketing_opt_in_at` integer;