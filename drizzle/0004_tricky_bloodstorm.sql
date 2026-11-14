-- Credits replace the per-video purchase system. Drop the referencing tables first so foreign keys never block a drop.
DROP TABLE `refunds`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
-- Old per-video jobs have no credit hold: unpaid ones are removed, unfinished paid ones are closed as failed.
UPDATE `generations` SET `deleted_at`=CAST(strftime('%s','now') AS INTEGER)*1000,`input_ids`='[]',`context`='{}' WHERE `status`='awaiting_payment' AND `deleted_at` IS NULL;--> statement-breakpoint
UPDATE `generations` SET `status`='failed',`error`='This creation was started before credits were introduced. Start it again with credits.',`completed_at`=CAST(strftime('%s','now') AS INTEGER)*1000,`lease_token`=NULL,`lease_until`=0 WHERE `status` IN ('queued','preparing','generating','finalizing') AND `hold_id` IS NULL;--> statement-breakpoint
DELETE FROM `app_settings` WHERE `key`='auto_refund';--> statement-breakpoint
-- A retried generation can hold credits again, so holds are indexed rather than unique per generation.
DROP INDEX `credit_holds_generation_id_unique`;--> statement-breakpoint
CREATE INDEX `idx_credit_holds_generation` ON `credit_holds` (`generation_id`);--> statement-breakpoint
ALTER TABLE `generations` DROP COLUMN `price`;--> statement-breakpoint
ALTER TABLE `templates` DROP COLUMN `price`;
