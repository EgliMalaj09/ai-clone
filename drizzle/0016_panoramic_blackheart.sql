CREATE TABLE `removal_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text,
	`share_id` text,
	`video_reference` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`relation` text NOT NULL,
	`details` text NOT NULL,
	`locale` text DEFAULT 'sq' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`admin_note` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_removals_status` ON `removal_requests` (`status`,`created_at`);