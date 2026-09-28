ALTER TABLE `payments` ADD `checkout_attempt` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Revoke links/sessions created before the recovery hardening release.
DELETE FROM auth_tokens WHERE type='reset';
--> statement-breakpoint
DELETE FROM sessions;
