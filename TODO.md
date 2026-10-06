# PROJECT STUDIO — Feature audit & TODO

Audit date: 6 October 2026. This audit covers the source code under `app/`, `components/`, `lib/`, `db/`, `worker.ts` and the docs, plus a run of the project's own checks.

## 1. Check results

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ passes |
| `pnpm build` | ✅ passes |
| `pnpm test:integration` | ✅ 72/72 |
| `pnpm test:security` | ✅ 45/45 |
| `pnpm test:providers` | ✅ 9/9 (local fixtures only) |
| `pnpm test:production` | ✅ 30/30 (local fixtures only) |
| `pnpm lint` | ❌ **fails**: 93 errors, 49 warnings |

The tests mock Stripe, fal, Replicate and Resend, so **no live payment, AI generation or email has ever been verified**.

## 2. Feature status

| Area | Status | Notes |
|---|---|---|
| Template catalog (18 templates), search, categories, tags, sorting | ✅ Works | Filtering happens in the browser. The server API supports pagination, but the UI doesn't use it. |
| Template detail, preview video, favorites | ✅ Works | Previews are bundled "concept" clips, not real outputs |
| Email/password accounts, verify email, reset password | ✅ Works | Live mode needs Resend configured, or signup stays closed |
| Password change, session revoke, account export, account delete | ✅ Works | The export holds metadata only, not the photo/video files |
| Photo uploads (JPG/PNG/WEBP, 8 MB, private R2) | ✅ Works | No cleanup of abandoned uploads (see F2) |
| Checkout: demo mock payment | ✅ Works | |
| Checkout: Stripe | ⚠️ Built, **never tested live** | Partial refunds and disputes aren't handled |
| Generation queue (multi-step workflows, leases, retries, 30-min deadline) | ✅ Works in demo | Production needs an external dispatcher (see L2) |
| AI providers: fal.ai (Nano Banana → Kling 2.6) | ⚠️ Built, **never tested live** | |
| AI providers: Replicate | ⚠️ Partial | Only `owner/model` official models; versioned community models aren't supported |
| Demo mode output | ⚠️ By design | Returns a sample clip and does **not** transform the user's photo |
| My Creations: play, download, share link (23 h), delete | ✅ Works | |
| Orders page | ✅ Works | No receipts/invoices |
| Admin: dashboard, templates editor, workflows, pricing, users, orders, refunds, providers, settings, operations, activity log, encrypted connections | ✅ Works | No MFA, no role management, admin preview uploads share the personal quota (F3) |
| Image-only templates | ❌ Can't be published | The validator only allows video-ending workflows |
| Upscale / post-process steps | ❌ No built-in processor | Needs a real model endpoint |
| Google / social login | ❌ Not implemented | The `accounts` table is ready for it |
| Albanian / multi-language UI | ❌ Not implemented | English only, though the `ALL` currency is supported |
| PostgreSQL | ❌ Not implemented | D1 (SQLite) only |
| CI pipeline | ❌ None | No `.github/workflows`, which is why lint failures went unnoticed |

## 3. Fixes (bugs and code problems)

### High priority
- [x] **F1 — My Creations polls forever.** ✅ *Fixed: polls only while a creation is processing, pauses in hidden tabs, backs off 2 s → 15 s, and the list refresh no longer depends on the tick.* `components/account-pages.tsx:21` calls `queue/tick` and then refetches the list every 2.2 s for as long as the page is open, even when nothing is processing. That's about 55 requests a minute per tab. Several open tabs can hit the 240 requests/min limit (`lib/server/api.ts:61`) and show "Too many requests". Fix: poll only while some creation is `queued/preparing/generating/finalizing`, back off over time, and pause when the tab is hidden.
- [ ] **F2 — Abandoned uploads and unpaid orders are never cleaned up.** A user who uploads a photo and leaves the template page keeps that file forever. After 250 files or 512 MB, uploads are blocked (`lib/server/api.ts:64`). Unpaid `awaiting_payment` generations and orders also stay forever. Fix: add a cleanup to the hourly maintenance in `lib/server/queue.ts:66-67`: delete unreferenced uploads older than about 24 h and expire unpaid orders older than about 48 h.
- [ ] **F3 — Admin preview media uses the admin's personal photo quota.** Both share the same 512 MB / 250-file limit, so about 17 uploads of 30 MB preview videos fills the admin quota (`lib/server/api.ts:64`). Fix: exclude `public=1` rows from the quota, or give admins a separate limit.
- [ ] **F4 — Lint fails (93 errors).** Mostly `no-explicit-any` (43) and `<a>` used instead of `<Link>` (about 30). There are also 4 real `react-hooks/set-state-in-effect` issues (`components/shared.tsx`, `components/auth.tsx`, `components/admin.tsx`) and unused imports. Fix the real hook issues, then either fix or deliberately relax the style rules so `pnpm lint` passes.
- [ ] **F5 — Add CI.** Add a GitHub Actions workflow that runs `typecheck`, `lint`, `build` and the four test suites on every push and PR.

### Medium priority
- [ ] **F6 — Discovery sorting/filters.** In `components/discovery.tsx:16`, "Recommended" sorts only by `trending` and ignores `featured`. "Price: high to low" is missing even though the API supports it. Filter, search and sort are not kept in the URL, so filtered views can't be shared or bookmarked.
- [ ] **F7 — Storefront loads every template at once.** `lib/server/data.ts:46` loads up to 500 templates into the page. Switch the UI to the paginated `/api/templates` endpoint before the catalog grows.
- [ ] **F8 — Replicate adapter is limited.** `lib/server/providers.ts:26` only calls `models/{owner}/{model}/predictions`. Add support for `version` IDs (community models). Also check that its output-type detection (`.mp4/.webm` in the URL) is reliable.
- [ ] **F9 — Anonymous analytics are missing.** `homepage_view` and `template_view` are recorded only for signed-in users (`components/studio.tsx:18`, `components/template-detail.tsx:12`), so funnel numbers in the dashboard are incomplete. Allow anonymous, rate-limited events.
- [ ] **F10 — No cron trigger configured.** `worker.ts` has a `scheduled()` handler, but no `triggers.crons` is set, so nothing calls it. Production checkout stays closed until the dispatcher heartbeat is fresh (`lib/server/connections.ts:55`). Add a cron trigger or document the external scheduler clearly (see L2).
- [ ] **F11 — Remove leftovers.**
  - The dev middleware `/__qa/responsive` in `vite.config.ts:59` is still there, although `docs/QA.md` says it was removed.
  - `app/chatgpt-auth.ts` is unused.
  - The CSP `frame-ancestors` in `worker.ts:13` allows `chatgpt.com`. Remove it unless the app is meant to be embedded in ChatGPT.
- [ ] **F12 — Retry the `image-size` dependency update.** `docs/SECURITY.md` says it could be retried after 21 Sept 2026, and that date has passed. Run the audit again.

### Low priority
- [ ] **F13** — `/api/auth/resend` sends a verification email even when the email is already verified (`lib/server/api.ts:49`).
- [ ] **F14** — Opening `/reset-password` without a token shows a raw validation error ("token: Required"). Show a friendly "link is invalid" message instead.
- [ ] **F15** — Generated images are always stored with a `.png` key extension, even when they are WEBP/JPG (`lib/server/queue.ts:52`). This is cosmetic: the MIME type is correct.
- [ ] **F16** — The PBKDF2 iteration count is hard-coded, and `checkPassword` ignores the count stored in the hash (`lib/server/security.ts:7-9`), so iterations can never be raised later without breaking logins. Read the count from the stored hash.
- [ ] **F17** — Account deletion removes the R2 files before the database batch (`lib/server/api.ts:31`). If the batch fails, records point to missing files. Delete the DB rows first, or make the cleanup retryable.
- [ ] **F18** — The admin dashboard counts users with `status!='deleted'`, but that status never exists (`lib/server/api.ts:116`). The result is harmless but misleading.
- [ ] **F19** — The footer shows a "Studio admin" link to every visitor (`components/studio.tsx:21`). Show it only to admins.
- [ ] **F20** — Prices in `ALL` display with 0 decimals (`lib/contracts.ts:20`), so e.g. 299.50 shows as 300. Confirm the minimum Stripe amounts for ALL/EUR/GBP, since the validator only enforces `price >= 50`.

## 4. Not implemented, needed before a public launch

- [ ] **L1 — Live service testing.** Run real Stripe test-mode checkouts (success, decline, webhook replay, full refund), real fal.ai generations, and real Resend emails.
- [ ] **L2 — Queue dispatcher in production.** Schedule `/api/queue/dispatch` every minute (cron trigger or `pnpm queue:worker`) and add alerting when it stops.
- [ ] **L3 — Content safety.** Add moderation of uploaded photos and outputs (NSFW, minors, celebrity/impersonation). Add antivirus scanning or image re-encoding. Add a face/quality check before payment.
- [ ] **L4 — Disputes and partial refunds.** Handle `charge.dispute.*` and partial `charge.refunded` events in `lib/server/payments.ts`.
- [ ] **L5 — Admin MFA**, or a managed identity provider.
- [ ] **L6 — Edge rate limiting and load tests.** The current limits are per-user/IP rows in D1.
- [ ] **L7 — Backups.** Set up D1 backups, R2 lifecycle/retention rules, and a separate backup of `APP_SECRET`, which encrypts the saved connections.
- [ ] **L8 — Legal pages.** Replace the draft Privacy/Terms with your real business identity, contact, refund policy, tax and retention terms.
- [ ] **L9 — Real template examples.** Replace the concept previews with real generated examples.
- [ ] **L10 — Monitoring.** Add error tracking and log alerts (stalled jobs, failed refunds, provider errors).

## 5. Possible new features

### Customer side
- [ ] **Albanian (sq) translation**, plus a language switcher (i18n for all UI text, emails and legal pages).
- [ ] Email notification when a video is ready or has failed, plus emailed payment receipts.
- [ ] A watermarked low-res preview before paying, to build trust and raise conversion.
- [ ] Google / Apple sign-in (the `accounts` table already exists).
- [ ] A proper share page (`/v/<id>`) with an Open Graph preview and revocable links, instead of a raw 23-hour media URL.
- [ ] Promo codes and coupons, bundles or credit packs, and a referral program.
- [ ] Regional pricing (a different price per currency for each template).
- [ ] Progress estimate and ETA on creations. Provider webhooks (fal supports them) instead of polling.
- [ ] Ratings/reviews and a "made with this template" gallery (opt-in).
- [ ] PWA / installable mobile app.
- [ ] Image-only templates (portraits/photoshoots) as a cheaper product.

### Admin side
- [ ] Role management: promote other admins and add a support role.
- [ ] Admin-triggered password reset for a user.
- [ ] CSV export for orders, payments and users.
- [ ] Drag-and-drop template ordering, bulk publish/unpublish, and scheduled publishing.
- [ ] Template archive (soft delete) instead of hard delete.
- [ ] Real provider cost reconciliation (actual model cost vs. estimate).
- [ ] A/B test prices or previews per template.
