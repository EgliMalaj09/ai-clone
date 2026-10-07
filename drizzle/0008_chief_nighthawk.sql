CREATE TABLE `generation_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`user_id` text,
	`reason` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`guideline` text,
	`admin_reason` text,
	`redo_generation_id` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_reports_status` ON `generation_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reports_generation` ON `generation_reports` (`generation_id`);--> statement-breakpoint
ALTER TABLE `generations` ADD `report_id` text;