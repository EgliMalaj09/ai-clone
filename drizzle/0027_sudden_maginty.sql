CREATE TABLE `provider_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`month` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_provider_invoice_month` ON `provider_invoices` (`provider`,`month`);--> statement-breakpoint
ALTER TABLE `generation_steps` ADD `cost` integer;--> statement-breakpoint
ALTER TABLE `generation_steps` ADD `cost_source` text;