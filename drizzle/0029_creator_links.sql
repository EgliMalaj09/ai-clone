CREATE TABLE `creator_links` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_links_code_unique` ON `creator_links` (`code`);--> statement-breakpoint
ALTER TABLE `users` ADD `signup_source` text;