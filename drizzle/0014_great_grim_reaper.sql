CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	`views` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_share_generation` ON `share_links` (`generation_id`);