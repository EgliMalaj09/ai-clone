CREATE TABLE `credit_balances` (
	`user_id` text PRIMARY KEY NOT NULL,
	`available` integer DEFAULT 0 NOT NULL,
	`held` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_transaction_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`account` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `credit_transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_credit_entries_transaction` ON `credit_entries` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_entries_account` ON `credit_entries` (`account`);--> statement-breakpoint
CREATE TABLE `credit_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`generation_id` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`settled_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_holds_generation_id_unique` ON `credit_holds` (`generation_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_holds_status` ON `credit_holds` (`status`);--> statement-breakpoint
CREATE TABLE `credit_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`credits` integer NOT NULL,
	`bonus_credits` integer DEFAULT 0 NOT NULL,
	`prices` text DEFAULT '{}' NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credit_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`package_id` text NOT NULL,
	`package_name` text NOT NULL,
	`credits` integer NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text NOT NULL,
	`provider_session_id` text,
	`provider_transaction_id` text,
	`checkout_url` text,
	`checkout_attempt` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_purchases_provider_session_id_unique` ON `credit_purchases` (`provider_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_credit_purchase_idempotency` ON `credit_purchases` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_credit_purchases_user` ON `credit_purchases` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `credit_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text,
	`reference_type` text,
	`reference_id` text,
	`actor_id` text,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_transactions_idempotency_key_unique` ON `credit_transactions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_credit_transactions_user` ON `credit_transactions` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `generations` ADD `credit_cost` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `generations` ADD `hold_id` text;--> statement-breakpoint
ALTER TABLE `templates` ADD `credit_cost` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Starting credit cost for existing templates: 1 credit per minor unit of the old price (e.g. 299 cents -> 299 credits). Admins can change it.
UPDATE `templates` SET `credit_cost`=`price` WHERE `credit_cost`=0;
