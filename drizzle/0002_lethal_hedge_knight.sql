CREATE TABLE `template_media` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`name` text NOT NULL,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_media_storage_key_unique` ON `template_media` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_generations_thumbnail` ON `generations` (`thumbnail`);--> statement-breakpoint
-- Move studio preview media out of customer uploads. Ids and storage keys are kept, so every existing /api/media/<id> link keeps working.
INSERT INTO `template_media` (`id`,`storage_key`,`mime`,`size`,`name`,`uploaded_by`,`created_at`) SELECT `id`,`storage_key`,`mime`,`size`,`name`,`user_id`,`created_at` FROM `user_uploads` WHERE `public`=1;
--> statement-breakpoint
DELETE FROM `user_uploads` WHERE `public`=1;
--> statement-breakpoint
ALTER TABLE `user_uploads` DROP COLUMN `public`;