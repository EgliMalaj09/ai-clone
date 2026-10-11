ALTER TABLE `templates` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `templates` ADD `publish_at` integer;--> statement-breakpoint
ALTER TABLE `templates` ADD `archived_at` integer;