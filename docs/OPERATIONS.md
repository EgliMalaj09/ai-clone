# Operations

## Deployment

This project is registered with Sites. Keep its existing project identifier. Build the Worker, apply the checked-in D1 migrations through the hosting workflow, supply D1 binding DB and R2 binding BUCKET, and deploy the exact built source. APP_SECRET, QUEUE_SECRET and bootstrap authentication belong in the hosting environment, never the repository. Provider/payment/email keys may also be saved through Admin → Connections; these values are encrypted in D1 with an APP_SECRET-derived AES-256-GCM key. Environment-managed connections take precedence and are read-only in the admin form. Set APP_ORIGIN to the exact deployed HTTPS origin, APP_SECRET and QUEUE_SECRET to independent random secrets, and bootstrap the admin using ADMIN_EMAIL and a hash produced by scripts/init-demo.mjs. Keep the generated password private. Changing bootstrap configuration does not replace an existing account password.

The private preview is for its owner. Third-party AI downloads and Stripe webhooks require publicly reachable endpoints in a production deployment; owner-only Sites access blocks external callers. Review the audience deliberately before activating live providers.

## Live payments

1. Configure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET; first use Stripe test credentials.
2. Register `/api/webhooks/stripe` for checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, charge.refunded and refund.updated.
3. Set DEMO_MODE=false. The development pay endpoint is then disabled. The server creates Checkout Sessions from immutable order amounts, verifies signed webhook bodies and checks session IDs, currency and amounts. Browser return URLs cannot independently authorize generation.
4. Exercise a successful checkout, a declined card, webhook replay and a full refund in your Stripe account before accepting live transactions.

Amounts are integer minor units. Supported admin currencies assume two decimal places. Taxes, invoices, regional pricing, partial refunds and chargeback operations require additional business configuration. Existing checkout snapshots preserve their price when a template price changes. Retrying an expired Stripe checkout creates a new session on the same immutable order. The checkout attempt counter scopes its idempotency key. A completed session awaiting asynchronous payment cannot create another session. Delayed expiry events for an old session do not fail the replacement.

## AI services

FAL_KEY and REPLICATE_API_TOKEN remain server-only. Enable a configured provider in Admin → Providers, then choose its provider/model and input mappings in a template workflow. Fal uses queue model endpoints; Replicate uses owner/model predictions. Model inputs are API-specific: set their exact field names in advanced settings/input mapping. Run a small paid test for each model before publishing its template. These live adapters have not been verified against an account with credentials in this build.

Variables: `{{user_image_1}}`, `{{user_image_2}}`, `{{previous_output}}`, `{{aspect_ratio}}`, `{{duration}}`, `{{template_name}}`, and named outputs from previous steps. A generation snapshots its entire workflow. Input URLs are signed and expire after one hour. Outputs are copied to private R2 rather than depending on provider retention. Allowed output domains are explicitly restricted in storage.ts; add an audited provider domain when introducing a new adapter.

To add another provider, implement AIProvider in providers.ts, register it in providerFor and add validation/admin choices. The customer UI remains provider-independent. Image/transform steps can precede video generation; publish video-ending workflows for this MVP. Upscale and final processing steps need an actual compatible model endpoint; they are not built-in media processors.

## Durable queue

Payment confirmation queues a generation in the same D1 batch that records payment. The Worker attempts a 22-second background processing window. My Creations also polls while open. Neither is sufficient for unattended long jobs: schedule `/api/queue/dispatch` with `Authorization: Bearer QUEUE_SECRET` at least once per minute, using scripts/dispatch-queue.mjs or an external scheduler. `pnpm queue:worker` runs a continuous dispatcher in a supervised Node service; configure APP_ORIGIN and QUEUE_SECRET in that service. It ticks every five seconds, reports errors without printing secrets, and shuts down on SIGTERM/SIGINT. A scheduled Worker handler is included for platforms supporting cron triggers. Sites deployment does not automatically create a cron schedule. Private hosting requires the scheduler to have authorized access as well.

Database leases prevent concurrent execution, provider job IDs persist, transient status checks retry, and a 30-minute deadline marks stuck jobs failed. Ambiguous provider submissions are not automatically resubmitted because they may already be billable. Inspect the provider before an admin retry. Automatic full refunds are configurable; the database setting overrides the environment default in either direction. Unsuccessful refunds remain visible for review. Out-of-band full Stripe refunds stop queued/running work and revoke the job lease. Accepted refund IDs are reconciled before another request. Partial refunds remain outside this MVP.

## Authentication and operations

Set RESEND_API_KEY and MAIL_FROM in Connections or the hosting environment to enable email verification/password reset in live mode. Without a configured mail sender, anonymous password recovery returns a neutral unavailable message and never reveals a reset token. Signed-in users can change their password in Account. Live signup requires a configured mail sender. Do not enable demo mode on a real paid service. Google sign-in is not implemented. Apply per-IP edge limits in addition to the application's database rate limits. Back up D1 and configure R2 lifecycle/retention policies to match your privacy terms. Deletions remove the current stored objects; operator-managed backup retention is separate.

Before public launch, replace draft legal pages with your business identity, jurisdiction, support contact and retention policy; establish abuse reporting, provider content moderation and monitoring; verify live checkout/provider behavior; configure durable queue scheduling; and load-test realistic concurrency. This is a functional MVP foundation, not a completed global compliance or scale certification.

## Operating the dashboard

- Overview separates currencies and reports revenue, estimated cost (including started refunded jobs), gross profit, average paid order, 30-day revenue, recent payments, and popular/profitable templates.
- Operations reports provider/email/payment configuration, queued work, jobs exceeding ten minutes, unresolved refunds, storage usage, and event counts. Configuration presence does not prove live service health.
- The external dispatcher heartbeat is separate from user/browser queue ticks. Green requires an authenticated dispatcher call within three minutes.
- Activity records template changes, user administration, refunds, settings, password changes, session revocation, and exports. Search and pagination operate on the server.
- Users, generations, orders, and payments support search/status filters and pagination. User spending and all finance summaries stay separated by currency.

Migration 0001 adds checkout attempt tracking and revokes older reset links and sessions after recovery hardening. Existing accounts and orders remain intact; sign in again after upgrading. Bootstrap configuration does not reset a password already changed in Account.

Expired auth/session/rate-limit records are cleaned during queue maintenance, at most once per hour. Active uploads are limited to 250 files / 512 MB per account. Large provider results stream to R2 using a known content length; responses without a length are limited to 24 MB. Intermediate asset identities are persisted and signed links are renewed on every workflow submission, including an administrator retry.


## Production setup through the dashboard

Set DEMO_MODE=false. `/admin/connections` accepts Stripe, webhook, fal.ai, optional Replicate, and Resend credentials. Every save requires the current administrator password, a trusted request origin, and the admin role. The API never returns saved secret values. Changes take effect without a rebuild. Connections do not make a paid API call or send a verification email until an applicable customer action occurs. Enable your connected provider under AI providers.

Checkout is closed until a Stripe key and webhook secret, email sender, enabled AI provider, and fresh external dispatcher heartbeat are configured. The hosting owner must deliberately allow public service traffic and then set PUBLIC_SERVICE_ACCESS=true. This flag does not change the hosting audience. It is an explicit deployment assertion; the app cannot inspect the Sites audience from inside the Worker. A stale dispatcher heartbeat (over three minutes) closes new checkout but does not discard existing work. Stripe test keys remain usable for staging and are clearly identified in Connections; real sales require matching live keys and a live webhook endpoint.

On the first production-mode request, untouched starter workflows are converted to a server-owned two-step Fal recipe. Edited prompts and custom workflows are preserved. The recipe uses Nano Banana image editing and Kling 2.6 Pro image-to-video; model endpoint, prompt, input mapping and settings remain editable per template. Built-in previews stay labeled as concept previews until you upload actual examples. Saving or selecting a workflow does not verify output quality or current provider billing rates.

APP_SECRET also protects stored connection values. Back up this secret separately from D1. If it changes, restore it or re-enter every dashboard-stored connection. The status page remains usable when a saved value cannot be decrypted. Re-saving uses a new encryption nonce; the credential name is authenticated so ciphertext cannot be moved between fields. Removing a connection deletes its encrypted record; revoke the original key at its provider separately if compromised.

See [admin guide](ADMIN-GUIDE.md) for creating a template without editing source. Model inputs were checked against [Nano Banana edit documentation](https://fal.ai/models/fal-ai/nano-banana/edit/api) and [Kling 2.6 Pro documentation](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video/api). Stripe key mode guidance: [Stripe API keys](https://docs.stripe.com/keys).
