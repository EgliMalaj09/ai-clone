CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_sq` text NOT NULL,
	`body_sq` text NOT NULL,
	`subject_en` text NOT NULL,
	`body_en` text NOT NULL,
	`link` text,
	`link_label` text,
	`template_id` text,
	`status` text DEFAULT 'sending' NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`cursor` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`finished_at` integer
);
