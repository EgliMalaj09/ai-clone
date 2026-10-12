CREATE TABLE `template_experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`kind` text NOT NULL,
	`thumbnail_b` text,
	`preview_video_b` text,
	`credit_cost_b` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_by` text,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_experiments_template` ON `template_experiments` (`template_id`,`status`);