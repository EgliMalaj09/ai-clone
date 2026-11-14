ALTER TABLE `user_uploads` ADD `saved_at` integer;--> statement-breakpoint
ALTER TABLE `user_uploads` ADD `label` text;--> statement-breakpoint
ALTER TABLE `user_uploads` ADD `is_default` integer DEFAULT 0 NOT NULL;