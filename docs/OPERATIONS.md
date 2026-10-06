# Operations

## Deployment

This project is registered with Sites. Keep its existing project identifier. Build the Worker, apply the checked-in D1 migrations through the hosting workflow, supply D1 binding DB and R2 binding BUCKET, and deploy the exact built source. APP_SECRET, QUEUE_SECRET and bootstrap authentication belong in the hosting environment, never the repository. Provider/payment/email keys may also be saved through Admin → Connections; these values are encrypted in D1 with an APP_SECRET-derived AES-256-GCM key. Environment-managed connections take precedence and are read-only in the admin form. Set APP_ORIGIN to the exact deployed HTTPS origin, APP_SECRET and QUEUE_SECRET to independent random secrets, and bootstrap the admin using ADMIN_EMAIL and a hash produced by scripts/init-demo.mjs. Keep the generated password private. Changing bootstrap configuration does not replace an existing account password.

The private preview is for its owner. Third-party AI downloads and POK webhooks require publicly reachable endpoints in a production deployment; owner-only Sites access blocks external callers. Review the audience deliberately before activating live providers.

## Credit sales (live payments)

Customers buy credit packs; generations spend credits. See [credits architecture](CREDITS-ARCHITECTURE.md).

Payments go through [POK](https://pokpay.io), using its SDK order API (`/auth/sdk/login`, `/merchants/{merchantId}/sdk-orders`, `/sdk-orders/{id}`).

1. Save POK_KEY_ID, POK_KEY_SECRET and POK_MERCHANT_ID from your POK merchant account (Admin → Connections or the hosting environment). Keep POK_ENVIRONMENT=staging (the default, test payments) until you have tested; set it to production for real money.
2. Create credit packs under Admin → Credit packs (credits, optional bonus, a price in ALL and/or EUR; POK charges only these, and ALL prices are whole lek).
3. Set DEMO_MODE=false. The test checkout is then disabled. Each purchase creates a POK order from the pack price with `autoCapture`, the purchase ID as `merchantCustomReference`, a 30-minute expiry, and a webhook URL that carries an HMAC of the purchase ID. Nothing needs registering in POK.
4. POK does not document a webhook signature, so a webhook only triggers a check: the server reads the order from the POK API and grants the pack's credits exactly once, only when the captured amount, currency and reference match. The customer's return to `/credits?purchase=…` and an hourly background check of pending purchases do the same, so a lost webhook still confirms a payment. Browser return URLs cannot grant credits on their own.
5. Exercise a successful purchase, a cancelled payment, an expired order and a refund in POK staging before switching to production.

POK does not notify the studio about refunds or chargebacks. After refunding a customer in POK, open Admin → Credit purchases and choose **Reverse** on that purchase (administrator password required).

Packs are non-refundable by policy and customers consent to immediate delivery at checkout. A reversed purchase (a refund or chargeback recorded with Reverse) removes the purchased credits, even below zero; such accounts are listed in Operations. Money amounts are integer minor units and admin currencies assume two decimal places. Taxes and invoices require additional business configuration. Retrying an expired POK order creates a new order on the same purchase; an open order is reused; a delayed webhook for an old order does not fail the replacement, because only the purchase's current order is checked.

## AI services

Higgsfield is the default AI provider. Save HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET (the key ID and key secret from the Higgsfield console) in Admin → Connections, enable Higgsfield in Admin → Providers, and set a spending limit in Higgsfield. The adapter queues each step with `POST https://api.higgsfield.ai/<model>` (`Authorization: Key <id>:<secret>`), checks `GET /requests/<id>/status` until it reports completed, failed or nsfw, and downloads the result into private storage. An `nsfw` answer marks the video refused: the customer's credits are returned and the account gets a strike (three strikes block it). A 403 from Higgsfield means its account is out of credits; the video fails with that reason in Admin → Generations and the customer's credits are returned. Confirm the model field names and the result host in your first real generation (checklist C32.8).

FAL_KEY and REPLICATE_API_TOKEN remain server-only and are optional. Enable a configured provider in Admin → Providers, then choose its provider/model and input mappings in a template workflow. Fal uses queue model endpoints; Replicate uses owner/model predictions. Model inputs are API-specific: set their exact field names in advanced settings/input mapping. Run a small paid test for each model before publishing its template. These live adapters have not been verified against an account with credentials in this build.

Variables: `{{user_image_1}}`, `{{user_image_2}}`, `{{previous_output}}`, `{{aspect_ratio}}`, `{{duration}}`, `{{template_name}}`, and named outputs from previous steps. A generation snapshots its entire workflow. Input URLs are signed and expire after one hour. Outputs are copied to private R2 rather than depending on provider retention. Allowed output domains are explicitly restricted in storage.ts; add an audited provider domain when introducing a new adapter.

To add another provider, implement AIProvider in providers.ts, register it in providerFor and add validation/admin choices. The customer UI remains provider-independent. Image/transform steps can precede video generation; publish video-ending workflows for this MVP. Upscale and final processing steps need an actual compatible model endpoint; they are not built-in media processors.

## Durable queue

Starting a generation reserves its credits and queues the job in the same D1 batch. The Worker attempts a 22-second background processing window. My Creations also polls while open. Neither is sufficient for unattended long jobs, so production relies on a dispatcher that runs at least once per minute.

### Queue dispatcher (production)

**Default: Cloudflare cron trigger.** `vite.config.ts` sets `triggers.crons = ["* * * * *"]`, so the build writes it into `dist/server/wrangler.json`. Deploying that config to Cloudflare (`wrangler deploy --config dist/server/wrangler.json`) registers the schedule, and Cloudflare calls the Worker's `scheduled()` handler every minute. Each run records a heartbeat (source `cron`) and then advances queued jobs for about 22 seconds. It needs no `QUEUE_SECRET` and no public access. Failures are logged and show as errors in the Worker's cron event log (Cloudflare dashboard → Workers → Settings → Triggers).

After deploying, check that:
1. Cloudflare dashboard → the Worker → Settings → Triggers lists the cron `* * * * *`.
2. Admin → Operations → Service readiness shows **Background dispatcher: Running · last run … by the every-minute cron trigger** within two minutes.

If your hosting deploys the Worker without applying `triggers` (older Sites deployments did not create cron schedules), add the cron by hand in the Cloudflare dashboard (Triggers → Add Cron Trigger → `* * * * *`) or use the fallback below.

**Fallback: external scheduler.** Call `POST /api/queue/dispatch` with `Authorization: Bearer QUEUE_SECRET` at least once per minute, using `pnpm queue:dispatch` (one run, for a cron job) or another scheduler. `pnpm queue:worker` runs a continuous dispatcher in a supervised Node service; configure APP_ORIGIN and QUEUE_SECRET in that service. It ticks every five seconds, reports errors without printing secrets, and shuts down on SIGTERM/SIGINT. Its runs are labelled "external scheduler" in Operations. Private hosting requires the scheduler to have authorized access as well.

Both can run at once: jobs are leased, so a job is never worked on twice. Locally, `pnpm dev` does not run the cron; demo mode does not need it, and Admin → Operations → "Run a queue check" advances jobs by hand.

Database leases prevent concurrent execution, provider job IDs persist, transient status checks retry, and a 30-minute deadline marks stuck jobs failed. Ambiguous provider submissions are not automatically resubmitted because they may already be billable. Inspect the provider before an admin retry. A failed or timed-out generation always returns its reserved credits; delivery charges them. The hourly maintenance settles any hold left pending by an interruption and deletes photos that no creation has used for 24 hours. An admin retry reserves the customer's credits again.

## Authentication and operations

Set RESEND_API_KEY and MAIL_FROM in Connections or the hosting environment to enable email verification/password reset in live mode. Without a configured mail sender, anonymous password recovery returns a neutral unavailable message and never reveals a reset token. Signed-in users can change their password in Account. Live signup requires a configured mail sender. Do not enable demo mode on a real paid service. Google sign-in is not implemented. Apply per-IP edge limits in addition to the application's database rate limits. Back up D1 and configure R2 lifecycle/retention policies to match your privacy terms. Deletions remove the current stored objects; operator-managed backup retention is separate.

Before public launch, replace draft legal pages with your business identity, jurisdiction, support contact and retention policy; establish abuse reporting, provider content moderation and monitoring; verify live checkout/provider behavior; configure durable queue scheduling; and load-test realistic concurrency. This is a functional MVP foundation, not a completed global compliance or scale certification.

## Operating the dashboard

- Overview separates currencies and reports pack revenue, reversed payments, estimated AI cost, average purchase, 30-day revenue, credits sold/spent/given/outstanding, recent purchases, most-used templates and estimated margins (at your cheapest credit price).
- Operations reports provider/email/payment configuration, the credit ledger reconciliation, queued work, credits reserved, jobs exceeding ten minutes, reversed purchases, storage usage, and event counts. Configuration presence does not prove live service health.
- The dispatcher heartbeat is separate from user/browser queue ticks. Green requires a run of the cron trigger, or an authenticated external dispatcher call, within the last three minutes. Operations shows which one ran last.
- Activity records template and pack changes, user administration, credit adjustments, settings, password changes, session revocation, and exports. Search and pagination operate on the server.
- Users, generations, credit purchases and the credit ledger support search/filters and pagination. Admins can add or remove a user's credits with a reason and their password. Money summaries stay separated by currency.

Migration 0001 revokes older reset links and sessions after recovery hardening. Migration 0003 adds the credit tables; migration 0004 removes the per-video orders, payments and refunds tables and template prices. Back up D1 before applying them. Existing accounts and creations remain intact; sign in again after upgrading. Bootstrap configuration does not reset a password already changed in Account.

Expired auth/session/rate-limit records are cleaned during queue maintenance, at most once per hour. Active uploads are limited to 250 files / 512 MB per account. Template preview media is stored separately (`template_media`) under a studio-wide limit of 5 GB / 1000 files. A preview is deleted when the last template using it is changed or removed, unless a past creation still uses it as its poster; uploads never saved to a template are swept by the hourly maintenance after 24 hours. Admin → Media library lists every file and where it is used. Large provider results stream to R2 using a known content length; responses without a length are limited to 24 MB. Intermediate asset identities are persisted and signed links are renewed on every workflow submission, including an administrator retry.


## Production setup through the dashboard

Set DEMO_MODE=false. `/admin/connections` accepts POK, Higgsfield, optional fal.ai and Replicate, and Resend credentials. Every save requires the current administrator password, a trusted request origin, and the admin role. The API never returns saved secret values. Changes take effect without a rebuild. Connections do not make a paid API call or send a verification email until an applicable customer action occurs. Enable your connected provider under AI providers.

Buying credits is closed until the POK key ID, key secret and merchant ID, an email sender, enabled AI provider, and a fresh dispatcher heartbeat are in place; starting a creation needs the AI provider, the dispatcher and public access. The hosting owner must deliberately allow public service traffic and then set PUBLIC_SERVICE_ACCESS=true. This flag does not change the hosting audience. It is an explicit deployment assertion; the app cannot inspect the Sites audience from inside the Worker. A stale dispatcher heartbeat (over three minutes) closes new credit sales and new creations but does not discard existing work. POK staging is usable for testing and is clearly identified in Connections; real sales require POK_ENVIRONMENT=production.

On the first production-mode request, untouched starter workflows are converted to a server-owned two-step Higgsfield recipe (Seedream edit, then Kling 3.0 Turbo image-to-video). A fal.ai version of the recipe remains in `workflow-presets.ts`. Edited prompts and custom workflows are preserved. The recipe uses Nano Banana image editing and Kling 2.6 Pro image-to-video; model endpoint, prompt, input mapping and settings remain editable per template. Built-in previews stay labeled as concept previews until you upload actual examples. Saving or selecting a workflow does not verify output quality or current provider billing rates.

APP_SECRET also protects stored connection values. Back up this secret separately from D1. If it changes, restore it or re-enter every dashboard-stored connection. The status page remains usable when a saved value cannot be decrypted. Re-saving uses a new encryption nonce; the credential name is authenticated so ciphertext cannot be moved between fields. Removing a connection deletes its encrypted record; revoke the original key at its provider separately if compromised.

See [admin guide](ADMIN-GUIDE.md) for creating a template without editing source. Model inputs were checked against [Nano Banana edit documentation](https://fal.ai/models/fal-ai/nano-banana/edit/api) and [Kling 2.6 Pro documentation](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video/api). POK API reference: [POK PHP SDK (OpenAPI models)](https://github.com/pokpay-ltd/php-sdk).
