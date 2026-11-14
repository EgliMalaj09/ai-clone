CREATE TABLE `feed_likes` (
	`generation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feed_like` ON `feed_likes` (`generation_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `generations` ADD `rating` integer;--> statement-breakpoint
ALTER TABLE `generations` ADD `rated_at` integer;--> statement-breakpoint
ALTER TABLE `generations` ADD `public_at` integer;--> statement-breakpoint
ALTER TABLE `generations` ADD `likes` integer DEFAULT 0 NOT NULL;