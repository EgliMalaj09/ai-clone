CREATE TABLE `error_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`level` text DEFAULT 'error' NOT NULL,
	`message` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_error_events_created` ON `error_events` (`created_at`);