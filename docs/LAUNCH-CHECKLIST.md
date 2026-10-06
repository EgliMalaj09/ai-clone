# Launch checklist

This is the single list of everything left before PROJECT STUDIO goes live. It is a living document: tick items as you finish them and add a line to the [change log](#change-log) at the bottom.

**How to update it**
- Tick a box by changing `- [ ]` to `- [x]`, or tell Claude "mark I4.2 done" (or "add a task under C3") and it will update the file for you.
- Every item has an ID (`D1`, `C2.3`, `I4.1`…), so you can refer to it in chats and commits.
- `F…` and `L…` IDs point to the detailed write-ups in [TODO.md](../TODO.md).
- 🔴 blocks the launch · 🟡 should be done before launch · 🟢 can wait until after launch.

## Progress

Update the counts when you tick items.

| Phase | Done | Total |
|---|---:|---:|
| 0. Business decisions | 0 | 7 |
| 1. Codebase | 0 | 10 |
| 2. Infrastructure | 0 | 10 |
| 3. Features and content | 0 | 7 |
| 4. Live testing on staging | 0 | 6 |
| 5. Launch day | 0 | 5 |
| 6. First week after launch | 0 | 4 |

---

## Phase 0 — Business decisions

These come first, because the code and infrastructure work depends on them.

- [ ] **D1 🔴 Choose the payment provider.** Stripe does not officially onboard Albanian businesses.
  - [ ] D1.1 Pick one: a company in a Stripe-supported country (e.g. an EU or UK company or an LLC) using Stripe, **or** a merchant of record (Paddle, Lemon Squeezy) that handles VAT for you.
  - [ ] D1.2 Open the account and complete verification (identity, bank account, business details).
  - [ ] D1.3 Confirm the provider allows selling AI-generated digital goods and credit packs.
  - [ ] D1.4 Write down the fees per transaction, used for D3.
- [ ] **D2 🔴 Legal entity and tax.**
  - [ ] D2.1 Decide which business sells (name, address, tax number). It appears on the legal pages and receipts.
  - [ ] D2.2 Ask an accountant about VAT on digital services to EU customers (OSS) and Albanian VAT. A merchant of record covers most of this.
- [ ] **D3 🔴 Credit packs and prices.**
  - [ ] D3.1 Measure the real AI cost of one video per template (from I8 and L1 tests).
  - [ ] D3.2 Pick 3–4 packs (e.g. small, medium with bonus, large with bigger bonus) and the price per currency.
  - [ ] D3.3 Set each template's credit cost so the margin covers AI cost, payment fees, tax and failed attempts.
  - [ ] D3.4 Decide the welcome credits for new accounts (currently 0, configurable).
- [ ] **D4 🔴 Partial refunds.** Decide what a partial refund does to credits (today it is ignored; full refunds and disputes remove the pack's credits). See L4.
- [ ] **D5 🔴 Brand and domain.** Final product name, domain, logo, favicon, sender email address (e.g. `hello@yourdomain`).
- [ ] **D6 🟡 Content policy.** What users may not upload (minors, nudity, public figures, other people without consent) and what happens when they do (refusal, account ban).
- [ ] **D7 🟡 Support.** A support email or channel and the response time you promise.

## Phase 1 — Codebase

- [ ] **C1 🔴 Payment provider integration** (depends on D1).
  - [ ] C1.1 If you chose Stripe: nothing to build; go to I6.
  - [ ] C1.2 If you chose Paddle or Lemon Squeezy: add an adapter next to `lib/server/payments.ts` (create checkout, verify the signed webhook, confirm, fail and reverse purchases). Reuse `lib/server/credit-purchases.ts`; the ledger does not change.
  - [ ] C1.3 Add contract tests like the Stripe ones in `tests/security-regressions.mjs`.
  - [ ] C1.4 Implement the partial-refund rule from D4.
- [ ] **C2 🔴 Content safety (L3).**
  - [ ] C2.1 Moderate uploaded photos before they are used (NSFW, minors) with a provider moderation API.
  - [ ] C2.2 Re-encode uploaded images on the server instead of trusting the file bytes.
  - [ ] C2.3 Check the face and quality before credits are reserved, so customers don't spend credits on unusable photos.
  - [ ] C2.4 Add a "Report this video" link and an admin view for reports.
- [ ] **C3 🔴 Production queue trigger (F10, L2).**
  - [ ] C3.1 Add a cron trigger that calls the Worker's `scheduled()` every minute, or set up an external scheduler calling `/api/queue/dispatch` with `QUEUE_SECRET`.
  - [ ] C3.2 Confirm Admin → Operations shows a fresh dispatcher heartbeat (purchases and creations stay closed without one).
- [ ] **C4 🟡 Security hardening.**
  - [ ] C4.1 Admin MFA (L5), e.g. TOTP for the admin account.
  - [ ] C4.2 Store the PBKDF2 iteration count in the hash (F16).
  - [ ] C4.3 Remove leftovers: `/__qa/responsive`, `app/chatgpt-auth.ts`, `chatgpt.com` in the CSP (F11).
  - [ ] C4.4 Re-run the dependency audit and update `image-size` (F12).
  - [ ] C4.5 Show the "Studio admin" footer link only to admins (F19).
  - [ ] C4.6 Run `/security-review` on the final branch.
- [ ] **C5 🟡 Reliability fixes.**
  - [ ] C5.1 Account deletion: delete DB rows before R2 files (F17).
  - [ ] C5.2 Don't resend verification to verified emails (F13).
  - [ ] C5.3 Friendly message for `/reset-password` without a token (F14).
  - [ ] C5.4 Fix the misleading user count on the dashboard (F18).
  - [ ] C5.5 Correct file extensions for generated images (F15).
- [ ] **C6 🟡 Emails customers expect.**
  - [ ] C6.1 Receipt email after a credit purchase (skip if the merchant of record sends one).
  - [ ] C6.2 "Your video is ready" and "Your video failed, credits returned" emails.
- [ ] **C7 🟡 Error tracking (L10).** Send Worker errors to a tracker (e.g. Sentry) and log provider and webhook failures with the generation or purchase ID.
- [ ] **C8 🟡 Analytics (F9).** Record anonymous page and template views so the dashboard funnel is complete.
- [ ] **C9 🟢 Catalog scale (F7).** Paginate the storefront instead of loading all templates at once. Needed once the catalog passes about 100 templates.
- [ ] **C10 🟢 Albanian translation.** i18n for the UI, emails and legal pages, with a language switcher.

## Phase 2 — Infrastructure

- [ ] **I1 🔴 Hosting account.** Cloudflare account (or the Sites project) with Workers, D1 and R2 enabled, on a paid plan if you expect real traffic.
- [ ] **I2 🔴 Production database (D1).**
  - [ ] I2.1 Create the production D1 database and bind it as `DB`.
  - [ ] I2.2 Apply all migrations in `drizzle/` (0000–0004) through the hosting workflow.
  - [ ] I2.3 Check the tables exist and the starter templates are seeded.
- [ ] **I3 🔴 File storage (R2).**
  - [ ] I3.1 Create the production bucket and bind it as `BUCKET`. Keep it private; the app serves signed links.
  - [ ] I3.2 Add lifecycle rules if you want videos removed after a retention period (match the privacy policy).
- [ ] **I4 🔴 Secrets and environment.**
  - [ ] I4.1 Generate independent random `APP_SECRET` and `QUEUE_SECRET` and store them in the hosting secrets, never in the repo.
  - [ ] I4.2 Save a copy of `APP_SECRET` in a password manager. Losing it makes the saved connections unreadable.
  - [ ] I4.3 Set `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (from `scripts/init-demo.mjs`), then change the admin password after the first login.
  - [ ] I4.4 Set `DEMO_MODE=false` and `APP_ORIGIN=https://yourdomain`.
- [ ] **I5 🔴 Domain and HTTPS.** Point the domain at the Worker, confirm HTTPS works, and make sure `APP_ORIGIN` matches exactly (no trailing slash).
- [ ] **I6 🔴 Payment webhook.**
  - [ ] I6.1 Create the webhook endpoint in the provider dashboard pointing at the URL shown in Admin → Connections.
  - [ ] I6.2 Subscribe to the events listed there (checkout completed, async succeeded/failed, expired, `charge.refunded`, `charge.dispute.created` for Stripe).
  - [ ] I6.3 Save the secret key and the webhook signing secret in Admin → Connections.
- [ ] **I7 🔴 Email sending (Resend).**
  - [ ] I7.1 Verify your domain in Resend and add the SPF, DKIM and DMARC DNS records.
  - [ ] I7.2 Save the Resend key and `MAIL_FROM` in Admin → Connections. Sign-up stays closed in live mode without it.
- [ ] **I8 🔴 AI provider.**
  - [ ] I8.1 Create the fal.ai account, add billing, and set a monthly spending limit.
  - [ ] I8.2 Save the key in Admin → Connections and enable the provider in Admin → AI providers.
- [ ] **I9 🔴 Public access.** Allow public traffic on the hosting side (webhooks and AI providers must reach the app), then set `PUBLIC_SERVICE_ACCESS=true`.
- [ ] **I10 🟡 Backups, monitoring and abuse protection.**
  - [ ] I10.1 D1 backups: confirm point-in-time recovery, and export before every migration (L7).
  - [ ] I10.2 Uptime monitor on the homepage and an alert when the dispatcher heartbeat goes stale.
  - [ ] I10.3 Cloudflare rate limiting or WAF rules on `/api/auth/*`, `/api/uploads` and `/api/generations` (L6).
  - [ ] I10.4 A simple load test (e.g. 50 users creating videos at once) on staging.

## Phase 3 — Features and content

- [ ] **P1 🔴 Credit packs live.** Create the packs from D3 in Admin → Credit packs and check them on `/credits`.
- [ ] **P2 🔴 Template credit costs.** Set every published template's credit cost and check the margin column in Admin → Templates.
- [ ] **P3 🔴 Legal pages (L8).** Replace the draft Terms and Privacy with your business identity, contact details, the no-refund policy for packs, photo retention (24 h for unused photos), how long videos are kept, and the content policy from D6. Have a lawyer review them.
- [ ] **P4 🔴 Real template examples (L9).** Replace every concept preview with a real generated example (poster and video) made with the live workflow.
- [ ] **P5 🟡 Template catalog for launch.** Decide which templates are published at launch; unpublish any whose output quality is not good enough.
- [ ] **P6 🟡 Landing page and SEO.** Final copy, page titles and descriptions, an Open Graph image, favicon, and `robots.txt`.
- [ ] **P7 🟢 Nice to have after launch.** Google sign-in, promo codes, share page with preview, email on video ready (if not done in C6). See TODO.md section 5.

## Phase 4 — Live testing on staging

Run these on a staging copy with test keys before switching to live keys (L1). Record each result in the change log.

- [ ] **T1 🔴 Accounts.** Sign up, receive the verification email, verify, reset the password, delete the account.
- [ ] **T2 🔴 Buying credits.**
  - [ ] T2.1 Successful card payment: credits appear once.
  - [ ] T2.2 Declined card: no credits, clear message.
  - [ ] T2.3 Abandoned checkout: the purchase expires.
  - [ ] T2.4 Webhook replay from the provider dashboard: credits are not added twice.
  - [ ] T2.5 Full refund from the dashboard: credits are removed.
  - [ ] T2.6 Test dispute: credits are removed and it appears under reversed purchases.
- [ ] **T3 🔴 Generating videos.**
  - [ ] T3.1 Every published template produces a good video from a real photo.
  - [ ] T3.2 Credits are reserved at start and charged once on delivery.
  - [ ] T3.3 A forced failure (e.g. a wrong model ID) returns the credits.
  - [ ] T3.4 Admin retry works and reserves credits again.
- [ ] **T4 🔴 Background work.** Close the browser while a video is generating; it still finishes (proves the dispatcher works).
- [ ] **T5 🟡 Devices.** Check the main flows on an iPhone, an Android phone and desktop browsers.
- [ ] **T6 🟡 Admin.** Ledger reconciliation shows "Balances match the ledger", and adjust credits, dashboard and export all work.

## Phase 5 — Launch day

- [ ] **L-1 🔴 Back up** the production D1 database.
- [ ] **L-2 🔴 Deploy** the final tested commit with CI green.
- [ ] **L-3 🔴 Switch to live keys** (payment and webhook) and check Admin → Connections shows every item ready.
- [ ] **L-4 🔴 Smoke test with real money.** Buy the smallest pack with your own card, make one video, then refund yourself.
- [ ] **L-5 🟡 Watch for the first hours.** Admin → Operations (queue, failures, reversals), the error tracker, and the AI provider's spending.

## Phase 6 — First week after launch

- [ ] **W1** Compare the real AI cost per video with the estimates and adjust credit costs if needed.
- [ ] **W2** Review failed generations and support emails daily.
- [ ] **W3** Check the ledger reconciliation and the payment provider's payouts match the purchases.
- [ ] **W4** Collect the first customer feedback and pick the next features from TODO.md.

---

## Change log

Add a line every time you tick something or change the plan.

| Date | Item | Change | Notes |
|---|---|---|---|
| 2026-10-06 | — | Checklist created | Credits system done (steps 1–3); payment provider and packs still to be decided |
