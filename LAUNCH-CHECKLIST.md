# Launch checklist

This is the single list of **everything** to finish before PROJECT STUDIO goes live. Nothing is deferred: version 1 ships with every item here, and after launch there is no new development (no v2) for a while, only the operating routine in Phase 6. It is a living document: tick items as you finish them and add a line to the [change log](#change-log) at the bottom.

**How to update it**
- Tick a box by changing `- [ ]` to `- [x]`, or tell Claude "mark I4.2 done" (or "add a task under C3") and it will update the file for you.
- Every item has an ID (`D1`, `C2.3`, `I4.1`…), so you can refer to it in chats and commits.
- `F…` and `L…` IDs point to the detailed write-ups in [TODO.md](../TODO.md).
- Every item is done before launch. 🔴 = the core flow (sign up → buy credits → make a video) depends on it, so do these first · 🟡 = rest of version 1.
- If you decide to drop something from version 1, don't delete it: strike it through (`~~text~~`) and say why in the change log.

## Progress

Update the counts when you tick items.

| Phase | Done | Total |
|---|---:|---:|
| 0. Business decisions | 4 | 18 |
| 1. Codebase | 21 | 30 |
| 2. Infrastructure | 0 | 13 |
| 3. Content | 0 | 8 |
| 3B. Version 1 features | 38 | 45 |
| 4. Live testing on staging | 0 | 10 |
| 4B. Pre-live finishing | 0 | 2 |
| 5. Launch day | 0 | 5 |
| 6. After launch: operating routine (no new code) | 0 | 6 |

---

## Phase 0 — Business decisions

These come first, because the code and infrastructure work depends on them.

- [ ] **D1 🔴 Choose the payment provider.** **POK** (Albanian payment provider). Account open and verified; POK allows selling credit packs. Open until the fees (D1.4) are written down.
  - [x] D1.1 Provider chosen: POK.
  - [x] D1.2 Open the account and complete verification (identity, bank account, business details).
  - [x] D1.3 Confirm the provider allows selling AI-generated digital goods and credit packs.
  - [ ] D1.4 Write down the fees per transaction, used for D3. *(Later.)*
- [ ] **D2 🔴 Legal entity and tax.**
  - [x] D2.1 Business: **VASIL XHAJA** (personal business). Address and tax number for the legal pages still to be added.
  - [ ] D2.2 *(To be decided.)* Ask an accountant about VAT on digital services to EU customers (OSS) and Albanian VAT. A merchant of record covers most of this.
- [ ] **D3 🔴 Credit packs and prices.**
  - [ ] D3.1 Measure the real AI cost of one video per template (from I8 and L1 tests).
  - [x] D3.2 ✅ Four packs priced in EUR + ALL (1 EUR = 92 ALL): Starter 100 (€14.99 / 1,380 ALL), Creator 250 (€29.99 / 2,760 ALL), Pro 550 (€59.99 / 5,520 ALL), Studio 1,200 (€119.99 / 11,040 ALL). Seeded via `pnpm seed:packs`; editable in Admin → Credit packs.
  - [ ] D3.3 Set each template's credit cost so the margin covers AI cost, payment fees, tax and failed attempts.
  - [x] D3.4 ✅ Welcome credits set to 10 after a verified sign-up (never expire). Applied by `pnpm seed:packs`; changeable in Admin → Studio settings.
- [x] **D4 🔴 Refund policy.** ✅ **No refunds.** Credit packs are non-refundable (already in the Terms). Failed videos still return their credits automatically; that is not a money refund. A bank chargeback can still happen: record it with Reverse in Admin → Credit purchases, which removes the pack's credits.
- [ ] **D5 🔴 Brand and domain.** Final product name, domain, logo, favicon, sender email address (e.g. `hello@yourdomain`).
- [ ] **D6 🟡 Content policy.** What users may not upload (minors, nudity, public figures, other people without consent) and what happens when they do (refusal, account ban).
- [ ] **D7 🟡 Support.** A support email or channel and the response time you promise.
- [ ] **D8 🔴 Fiscalization.** Albanian businesses must fiscalize sales (fiscal invoice with NIVF/NSLF through the tax authority). Ask your accountant whether each credit purchase needs one and whether POK issues it; if not, the app needs a fiscalization service integration (becomes a codebase task).
- [ ] **D9 🔴 Business details on the website.** E-commerce rules require the seller's identity on the site: business name (VASIL XHAJA), NIPT, address, email and phone. Collect them for the footer, Terms and Privacy.
- [ ] **D10 🔴 Personal data obligations.** Face photos are personal data and may count as biometric data. Check with a lawyer whether you must notify or register with the Information and Data Protection Commissioner, and get the data processing terms of every service that receives customer data (Cloudflare, fal.ai, Resend, POK), since data leaves Albania.
- [ ] **D11 🔴 How long files are kept.** Decide how long finished videos and their photos stay stored (e.g. 90 days or until deleted). Storage grows with every video and costs money; the privacy policy must state it.
- [x] **D12 🔴 Bad result policy.** ✅ A customer can report any finished video that isn't good. You review each case by hand (their photo + the video). If the photo was good and the generation went wrong, they get **one free new generation of the same video with the same photo**. If the photo itself was the problem (blurry, dark, face hidden, breaks the photo guidelines), there is no free try. No money is ever refunded. Built in C21; photo guidelines in C31.
- [x] **D13 🔴 Minimum age.** ✅ **13+**, like Genematic. Customers confirm their age at sign-up (C20.2).
  - [ ] D13.1 Ask the lawyer (with D10): in Albania, can 13–17 year olds agree to the use of their data and photos on their own, or is a parent's consent needed (many countries set this at 16)?
  - [ ] D13.2 Ask the lawyer: can a minor buy credit packs without a parent? A purchase by a minor can sometimes be cancelled by the parent; with no refunds this is the risk in the Genematic complaint. If needed, require parent confirmation for purchases by under-18s.
- [ ] **D14 🟡 AI label on videos.** Decide whether finished videos carry a small "AI-generated" mark or only metadata, to limit misuse as deepfakes.
- [ ] **D15 🟡 Marketing channels.** Decide where you will advertise (Instagram/Facebook, TikTok, Google). This decides which tracking the app needs (C24).
- [ ] **D16 🟡 Free trial.** Genematic gives 10 free tokens at sign-up. Decide whether new accounts get enough welcome credits for one cheap creation (e.g. an image template, V8), and whether those free results carry a watermark (V41). Welcome credits are already a setting (now 0).
- [ ] **D17 🟡 Creator program (marketing).** Genematic pays creators per published video plus view bonuses. Decide whether you'll pay or give credits to local creators who post videos made with your app; needs a simple way to track their posts (V38 creator links).
- [x] **D18 🔴 AI provider.** ✅ **Higgsfield AI** through its API. Its moderation handles content checks (C2); the app needs a Higgsfield connection (C32).

## Phase 1 — Codebase

- [ ] **C1 🔴 Payment provider integration** (depends on D1).
  - [x] C1.1 Add a POK adapter next to `lib/server/payments.ts` (create checkout, verify the signed webhook, confirm, fail and reverse purchases). Reuse `lib/server/credit-purchases.ts`; the ledger does not change.
  - [x] C1.2 Add contract tests (fake POK in all test suites).
  - [ ] C1.4 Confirm on POK staging: the Authorization header format, the webhook body, and that a paid order shows the full `capturedAmount`. **Owner does this personally at the end, during Phase 4 (T2).**
  - [x] ~~C1.3 Implement the partial-refund rule from D4.~~ Not needed: no refunds (D4).
- [x] **C2 🔴 Content safety (L3).** ✅ Done, except C2.2d which is part of C32 (Higgsfield). Decision: content checks are done by the AI platform (Higgsfield moderation); the app records refusals and blocks repeat offenders. No separate moderation service.
  - [x] ~~C2.1 Moderate uploaded photos with a moderation API.~~ Not needed: Higgsfield moderates and doesn't charge for refused requests.
  - [x] C2.2 Clean and prepare uploaded photos, without slowing uploads (file security and privacy, not moderation). Matches Higgsfield's input rules: JPEG/PNG/WebP, max 15 MB, at least 512×512, no HEIC.
    - [x] C2.2a In the browser, before upload: turn the photo upright, convert iPhone HEIC to JPEG, resize to about 2048 px on the long side and save as JPEG. Smaller files make uploads faster on mobile data.
    - [x] C2.2b On the server, fast byte-level checks with no full re-encode: real image type, at least 512×512, remove metadata (GPS location, phone model, owner name) and drop any data hidden after the end of the image.
    - [x] C2.2c Clear messages for photos that are too small (under 512×512) or in an unsupported format, before any credits are reserved.
    - [ ] C2.2d (moved to C32) Send the cleaned photo to Higgsfield through its upload endpoint (or a signed link), never the original file.
  - [x] ~~C2.3 Own face and quality check before credits are reserved.~~ Dropped by decision; photo guidelines (C31) remain.
  - [x] ~~C2.4 "Report this video" link and admin view.~~ Covered by C21.
  - [x] C2.5 Record every moderation refusal from the AI platform as its own status ("Refused by content rules"), separate from technical failures, and return the reserved credits.
  - [x] C2.6 Clear customer message on a refusal, explaining it was refused under the content rules, with a link to the photo guidelines.
  - [x] C2.7 Flag the account on each refusal and show it in the admin (customer detail V31, Users list, Reports queue).
  - [x] C2.8 **Three refusals = blocked.** After the 3rd refusal the account can no longer upload or create videos. The customer is warned after the 1st and 2nd refusal ("2 of 3"). Blocked customers see a message with the support contact; their credit balance stays (no refunds).
  - [x] C2.9 The admin can review a blocked account's refused photos and unblock it, since the platform sometimes flags innocent photos (e.g. swimwear, sports); unblocking resets the count. Every block and unblock goes to the activity log.
  - [x] C2.10 Add the rule to the Terms and FAQ: content refused 3 times leads to a blocked account.
- [x] **C3 🔴 Production queue trigger (F10, L2).** ✅
  - [x] C3.1 Cron trigger `* * * * *` in `vite.config.ts` → `dist/server/wrangler.json`; the Worker's `scheduled()` runs every minute. External `/api/queue/dispatch` with `QUEUE_SECRET` kept as a fallback.
  - [x] C3.2 Admin → Operations shows the dispatcher heartbeat and its source (cron / external); a cron run reopens sales after a stale heartbeat (tested in `tests/production.mjs`).
- [ ] **C4 🟡 Security hardening.**
  - [x] C4.1 Admin MFA (L5), e.g. TOTP for the admin account. ✅ Two-step sign-in with an authenticator app (TOTP) in Account, for admins and customers: encrypted secret, each code works once, 8 one-time recovery codes, 5-minute sign-in ticket with attempt limits, turning on signs out other browsers. Admin pages show a reminder until it is on. See DECISIONS.md #5.
  - [x] C4.2 ✅ passwordHash embeds the iteration count and checkPassword reads it from the stored hash, so iterations can be raised later without breaking existing logins (F16).
  - [x] C4.3 ✅ Removed `app/chatgpt-auth.ts` (dead) and `chatgpt.com` from the CSP; `/__qa/responsive` already gone.
  - [x] C4.4 Re-run the dependency audit and update `image-size` (F12). ✅ next/eslint-config-next 16.3.8; overrides lift image-size ≥2.0.3, brace-expansion, fast-uri, sharp, source-map-js. Audit: 0 critical, 1 high (`braces`, build-tooling only, no patched release yet).
  - [x] C4.5 ✅ The "Studio admin" footer and mobile-menu links are gated to role==='admin' (F19).
  - [ ] C4.6 Run `/security-review` on the final branch.
- [x] **C5 🟡 Reliability fixes.** ✅
  - [x] C5.1 ✅ Already correct: deletion removes DB rows (cascading uploads/assets) first, then R2 files in a retry-logged loop (F17).
  - [x] C5.2 ✅ Dashboard user count is a plain COUNT(*) with no phantom status filter (F18).
  - [x] C5.3 ✅ Generated assets use the right extension from the MIME map (webp/jpg/png), not always .png (F15).
- [ ] **C6 🔴 Account emails (sign-up and password).** Sign-up depends on these, so they block the launch.
  - [x] C6.1 Branded HTML verification email (wordmark, verify button, copy-paste link, 30-min expiry, business name VASIL XHAJA, support contact); plain-text version kept. Logo image waits for D5.
  - [x] C6.2 Same branded HTML + plain-text for the password reset email.
  - [x] C6.3 Albanian text (or Albanian + English) for both emails.
  - [~] C6.4 Brand name moved to one config value (`BRAND_NAME`, temporary "Project Studio"); no more "PROJECT STUDIO" in emails. **TODO before launch:** set the final brand once D5 is decided (part of X2).
  - [x] C6.5 Already fixed: resend returns "already verified" for verified accounts (F13); `/reset-password` and `/verify` without a link show a clear "incomplete link" message with a way to request a new one (F14).
- [x] **C11 🟡 Other emails customers expect.**
  - [x] C11.1 Receipt email after a credit purchase (skip if POK already sends one; check during T2). ✅ After each paid purchase the customer gets a receipt email in their language (pack, credits, amount, discount code if used, purchase and POK transaction IDs), marked as not a tax invoice. Sent once per purchase. See DECISIONS.md #18.
  - [x] C11.2 "Your video is ready" and "Your video failed, credits returned" emails. ✅ Branded HTML + plain-text emails sent by the queue when a creation is delivered ("Watch my video") or fails/is refused (credits returned, amount shown). Best-effort and idempotent per attempt. English for now (Albanian with C10).
- [x] **C7 🟡 Error tracking (L10).** Send Worker errors to a tracker (e.g. Sentry) and log provider and webhook failures with the generation or purchase ID. ✅ Every server error, failed generation, payment/webhook, email, credit and queue problem goes through one reporter: logged with its IDs (generation, purchase, user), kept 30 days in a new `error_events` table and listed under **Admin → Operations → Recent errors**, and sent to Sentry when a `SENTRY_DSN` is saved in Admin → Connections (optional). See DECISIONS.md #4.
- [x] **C8 🟡 Analytics (F9).** ✅ Page and template views are now recorded for guests too (the analytics endpoint moved to the public section with an IP rate limit; home/explore and template pages fire views regardless of sign-in), so the dashboard funnel includes anonymous visitors.
- [x] **C9 🟡 Catalog scale (F7).** Paginate the storefront instead of loading all templates at once, so the catalog can grow after launch without code changes. ✅ The server renders the first 24 templates for the current filters; filter changes and "Show more templates" load further pages from `/api/templates`. Search also matches category names. Favorites stay a personal list.
- [x] **C10 🟡 Albanian translation.** i18n for the whole UI, emails and legal pages, with a language switcher (Albanian and English). ✅ Albanian (default) and English across the storefront, account pages, help and legal pages, page titles, customer API messages and all emails (sent in the customer's language, `users.locale`). Shqip/English switch in the footer and mobile menu, kept in a cookie; `<html lang>` follows it. The studio admin stays English. Draft translation by Claude — a native speaker must review it (P7). `pnpm test:i18n` fails if a customer-facing line has no Albanian. See DECISIONS.md #7–8.
- [ ] **C32 🔴 Higgsfield AI connection.** Higgsfield is the AI provider (D18). The app currently supports only fal.ai and Replicate.
  - [x] C32.1 Higgsfield provider adapter: submit, check status, fetch the result, using the API key ID + secret.
  - [x] C32.2 Key ID and secret in Admin → Connections (encrypted), and Higgsfield in Admin → AI providers.
  - [x] C32.3 Handle Higgsfield's NSFW/moderation response as a refusal: return `status:'refused'` from its adapter (the refusal, strike and block system from C2 is ready), with `check_nsfw` enabled.
  - [x] C32.7 Higgsfield receives the cleaned photo: it fetches the stored copy (already cleaned by C2.2b) through a short-lived signed link. Switching to Higgsfield's upload endpoint is only needed if public access (I9) can't be enabled.
  - [x] C32.4 Replace the ready-made workflow (today Nano Banana → Kling on fal.ai) with Higgsfield models, and choose the model per template.
  - [ ] C32.5 Estimated AI cost per template from Higgsfield prices, for the margin calculation (C19). Needs Higgsfield's prices per model; set them per template in the editor after the first real runs.
  - [ ] C32.8 **Owner, at the end (Phase 4):** with your Higgsfield key in Admin → Connections, make 2–3 real videos and confirm: the model field names (`image_urls` for Seedream edit, `image_url` and `duration` for Kling), the host results are downloaded from, and the real cost per video.
  - [x] C32.6 Contract tests with a fake Higgsfield, like the fal and Replicate ones.
- [x] **C12 🟡 Replicate adapter (F8).** Support versioned community models and reliable output-type detection, so any model can be used later without code changes. ✅ Accepts official `owner/model`, community `owner/model:version` and bare version IDs (validated on save); the result file is picked from any output shape (URL, list, file object, named outputs; video first), and the stored file type is sniffed from its bytes.
- [~] **C13 🟡 Money display and minimums (F20).** Show ALL prices correctly (no rounding of 299.50 → 300) and confirm POK's minimum amounts for ALL and EUR in the pack validator.
  - [x] C13.1 ✅ Prices are shown exactly: whole lek without decimals, any fractional amount with two decimals (never rounded). Pack prices in ALL are whole lek (POK charges lek as whole numbers).
  - [ ] C13.2 **Needs POK:** confirm POK's minimum charge for ALL and EUR (check during T2) and set it in the pack validator (today: at least 0.50).
- [x] **C14 🟡 Complete account export.** Include the customer's photos and videos (or download links), not only metadata, for privacy requests. ✅ The JSON export now includes signed download links (23 h) for every photo and every generated file per creation, plus consents (Terms version, age, marketing), refusal/block status and reports.
- [x] **C15 🔴 Fix: `/verify` without a link.** ✅ Opening `/verify` or `/reset-password` without a token now shows "This verification/reset link is incomplete" with a button to send a new one, instead of hanging.
- [x] **C16 🔴 Remove leftover and outdated text.** ✅
  - [x] C16.1 ✅ Site description already uses credits language.
  - [x] C16.2 ✅ Export text now reads "profile, credit history, upload list, and creation records".
  - [x] C16.3 ✅ No codex-preview meta tag remains.
  - [x] C16.4 ✅ CSP `frame-ancestors` is now `'self'` only; no Stripe hosts present.
  - [x] C16.5 ✅ Legal pages show `Version {TERMS_VERSION}` (2026-10-07). Full rewrite still in P3.
- [x] **C17 🔴 Proper page titles.** ✅ Every route has a real title and the 404 page has its own title. Brand word stays "PROJECT STUDIO" until C30/D5.
- [x] **C18 🔴 Show what credits cost before sign-up.** ✅ New public `/pricing` page shows the four packs with price, credits and per-credit value (EUR/ALL switch), welcome-credits note and CTA; "Pricing" link added to the header and mobile menu; approximate price ("≈ ALL 2,750") now shown next to credit costs on template cards, the hero and the template page. Guests see all of it without an account.
- [x] **C19 🔴 Fix profit calculation currencies.** ✅ Admin → Settings → Exchange rates (USD→EUR default 0.92, USD→ALL default 85, editable). AI costs (USD) are converted into the selling currency so the dashboard and template list show real margins; the dashboard now opens in EUR (switchable to ALL) and no longer shows a USD column. New lib/server/rates.ts.
- [x] **C20 🔴 Sign-up form.** ✅
  - [x] C20.1 Explicit "I accept the Terms and Privacy Policy" checkbox; stored per account with the accepted-at time and the Terms version (`TERMS_VERSION`). Required to submit.
  - [x] C20.2 "I am 13 years of age or older" checkbox, required to submit; the confirmation time is stored. Any extra 13–17 wording waits on the lawyer (D13.1, D13.2).
  - [x] C20.3 Optional "Send me news and offers" checkbox (off by default); marketing consent and its timestamp are stored, ready for V29/V36 announcements.
  - [x] C20.4 Show/hide password button on the password field (sign-up, sign-in and reset).
- [x] **C21 🔴 "Report a problem" and free redo (from D12).** ✅ (FAQ copy waits for C26.)
  - [x] C21.1 ✅ "Report a problem" on each finished video (reason + optional comment); one open report per video; accepted for 7 days after delivery.
  - [x] C21.2 ✅ The creation shows its case status: Under review / Approved — free redo started / Not approved (with the guideline or reason + photo-tips link).
  - [x] C21.3 ✅ Admin → Reports queue: each case shows the uploaded photo(s), the finished video, template, reason/comment, and the customer's report history; abuse flag for frequent reporters.
  - [x] C21.4 ✅ Approve starts one free redo of the same video with the same photo at no cost, funded by a goodwill credit (shown in the ledger); the redo appears in My creations marked "Free redo" and linked to the report.
  - [x] C21.5 ✅ Reject "photo not suitable": admin picks the broken guideline (from C31); the customer sees it with a photo-tips link. No free try.
  - [x] C21.5b ✅ Reject "other" requires a short customer-visible reason.
  - [x] C21.6 ✅ While a report is open, the reported video, its photos, and the account can't be deleted.
  - [x] C21.7 ✅ Branded email to the customer on approve/reject (best-effort; sends when email is configured).
  - [x] C21.8 ✅ Queue flags customers with 4+ reports; a free redo can itself be reported and re-decided.
  - [x] C21.9 ✅ Policy in the Terms ("Reporting a bad result") and in the FAQ (C26).
- [~] **C31 🔴 Photo guidelines in the upload section.** Core done: guidelines card + required checkbox in the upload area (C31.1, C31.3), editable studio-wide in admin (C31.4). Remaining: side-by-side example photos (C31.2) and per-template custom text + Albanian (C31.4).
  - [x] C31.1 ✅ Photo guidelines card in every template's upload area (before uploading): a photo-count line driven by the template's required photos, plus ✓ do / ✕ don't lists.
  - [~] C31.2 Do/don't guidance shown as a clear ✓/✕ two-column card. Side-by-side **example photos** still to add (needs real example images, like P4).
  - [x] C31.3 ✅ Required "My photo follows the photo guidelines above" checkbox; Generate stays disabled until it (and the permission consent) are ticked.
  - [~] C31.4 Studio-wide guidelines editable in Admin → Settings (Do/Don't lists). Per-template photo **count** already adapts (e.g. 2 photos for couples). ✅ Per-template custom **tips** (one per line, in the template editor) are shown in the guidelines card. ✅ The default guidelines are translated to Albanian (C10); admin-written lines and tips show as written, so write them in Albanian.
  - [x] ~~C31.5 Automatic photo checks before credits are spent.~~ Dropped by decision (C2): the AI platform checks content.
- [x] **C22 🔴 Maintenance switch and banner.** ✅ Admin → Settings → Maintenance mode: separate toggles to pause new video creation and/or new credit purchases, with an optional custom message. Paused actions return 503 with the message; a site-wide banner shows it. Work already running keeps going. No deploy needed.
- [x] **C23 🔴 Spending safety limits.** ✅ Admin → Settings → Spending safety limits: per-customer caps on videos running at once (default 3) and per day (default 20), and a studio-wide daily AI-cost cap (off by default) that pauses creation and records a `spend_cap_reached` alert event. 0 means no limit. Enforced before any credits are reserved.
- [ ] **C24 🟡 Marketing tracking (from D15).** Meta and/or TikTok pixel plus server-side conversion events for sign-up and purchase, UTM campaign capture at sign-up, and a cookie consent banner (required once trackers are added).
- [x] ~~**C25 🟡 SEO basics.**~~ Moved to **X1 Enhanced SEO** in the pre-live phase, done together at the end.
- [x] **C26 🟡 Help pages.** A Contact/Support page and an FAQ (how it works, photo tips, credits, failed videos, privacy, deleting data), linked from the footer with your social accounts. ✅ `/faq` (grouped, expandable questions: how it works, photos, credits, failures, privacy, deleting data) and `/contact` (support email/phone/response time, business name, social links). Support details and social links are set in Admin → Settings; footer links Help & FAQ, Contact and the social accounts. See DECISIONS.md #1–2.
- [~] **C27 🟡 Template page details.** Photo tips with good and bad example photos, what the customer receives (length, resolution, format, any watermark), and related templates at the bottom.
  - [x] C27.1 ✅ "What you receive" box: length, MP4 + resolution, format and where it fits (e.g. vertical for Stories/TikTok), no watermark, ready in minutes with an email.
  - [x] C27.2 ✅ "You might also like": 4 related templates, same category first.
  - [ ] C27.3 Good and bad **example photos** next to the photo tips (needs real example images, same as C31.2/P4).
- [x] **C28 🟡 Polish.** ✅ The pager is hidden on empty and single-page lists (no more "0 results · Page 1 of 1" with buttons). Empty states already use the Empty component; broader copy review continues as pages change.
- [~] **C29 🟡 Accessibility and browsers.** Keyboard navigation, colour contrast and labels; video playback and uploads on iPhone Safari, Android Chrome and desktop Safari/Firefox/Edge.
  - [x] C29.1 ✅ Colour contrast: 124 text colours darkened (same hue) to WCAG AA, at least 4.6:1 for text and 3:1 for icons. An axe-core WCAG 2 A/AA scan of the Account page reports no violations.
  - [x] C29.2 ✅ Keyboard: visible focus outline on links, buttons, inputs, checkboxes, switches, tabs, menus, FAQ items and upload areas; "Skip to content" link; reduced motion when the device asks for it. Icon buttons, images and inputs already had labels.
  - [ ] C29.3 Real-device checks (iPhone Safari, Android Chrome, desktop Safari/Firefox/Edge) — done together with T5/T9 on staging.
- [x] ~~**C30 🔴 Branding everywhere.**~~ Moved to **X2 Branding** in the pre-live phase.

## Phase 2 — Infrastructure

- [ ] **I1 🔴 Hosting account.** Cloudflare account (or the Sites project) with Workers, D1 and R2 enabled, on a paid plan if you expect real traffic.
- [ ] **I2 🔴 Production database (D1).**
  - [ ] I2.1 Create the production D1 database and bind it as `DB`.
  - [ ] I2.2 Apply all migrations in `drizzle/` (0000 onwards, currently up to 0028) through the hosting workflow.
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
- [ ] **I7 🔴 Email sending (Resend).** Without it, sign-up stays closed in live mode.
  - [ ] I7.1 Create the Resend account and an API key (starts with `re_`).
  - [ ] I7.2 Quick local test before the domain is ready: `DEMO_MODE=false`, `RESEND_API_KEY`, `MAIL_FROM=onboarding@resend.dev`, then sign up with the email of your Resend account (Resend only delivers there until a domain is verified).
  - [ ] I7.3 Verify your domain in Resend and add the SPF, DKIM and DMARC DNS records.
  - [ ] I7.4 Choose the sender address (e.g. `hello@yourdomain`) and save the Resend key and `MAIL_FROM` in Admin → Connections.
  - [ ] I7.5 Send a test to Gmail, Outlook and an Albanian provider; check it lands in the inbox, not spam.
- [ ] **I8 🔴 AI provider.**
  - [ ] I8.1 Create the Higgsfield account and API key (ID + secret), add billing, and set a spending limit.
  - [ ] I8.2 Save the key in Admin → Connections and enable the provider in Admin → AI providers.
- [ ] **I9 🔴 Public access.** Allow public traffic on the hosting side (webhooks and AI providers must reach the app), then set `PUBLIC_SERVICE_ACCESS=true`.
- [ ] **I10 🟡 Backups, monitoring and abuse protection.**
  - [ ] I10.1 D1 backups: confirm point-in-time recovery, and export before every migration (L7).
  - [ ] I10.2 Uptime monitor on the homepage and an alert when the dispatcher heartbeat goes stale.
  - [ ] I10.3 Cloudflare rate limiting or WAF rules on `/api/auth/*`, `/api/uploads` and `/api/generations` (L6).
  - [ ] I10.4 A simple load test (e.g. 50 users creating videos at once) on staging.
- [ ] **I11 🔴 Separate staging environment.** A second copy (own database, storage and test keys) that stays after launch, so every bug fix is tested there before production. Since there's no v2 for a while, this is how you fix bugs safely.
- [ ] **I12 🔴 Cost alerts.** Billing alerts on Cloudflare, fal.ai, Resend and the domain, sent to your phone.
- [ ] **I13 🟡 Error alerts.** Errors from the error tracker (C7) and stale-dispatcher alerts (I10.2) reach your phone or email, not only a dashboard.

## Phase 3 — Content

- [~] **P1 🔴 Credit packs live.** Structure applied: the four D3 packs are seeded (EUR + ALL) and active, verified on the packs API; prices render correctly. **To do on production:** run `pnpm seed:packs -- --remote` (or create them in Admin), and revisit prices against measured AI costs (D3.1/D3.3).
- [ ] **P2 🔴 Template credit costs.** Set every published template's credit cost and check the margin column in Admin → Templates.
- [ ] **P3 🔴 Legal pages (L8).** Replace the draft Terms and Privacy with your business identity, contact details, the no-refund policy for packs, photo retention (24 h for unused photos), how long videos are kept, and the content policy from D6. Have a lawyer review them. The Terms currently say "intended for adults"; change this to the 13+ rule (D13).
- [ ] **P4 🔴 Real template examples (L9).** Replace every concept preview with a real generated example (poster and video) made with the live workflow.
- [ ] **P5 🟡 Template catalog for launch.** Decide which templates are published at launch; unpublish any whose output quality is not good enough.
- [ ] **P6 🟡 Landing page and SEO.** Final copy, page titles and descriptions, an Open Graph image, favicon, and `robots.txt`.
- [ ] **P7 🔴 Albanian text review.** A native speaker reads every page, button, error message, email and legal text. The draft translation is in `lib/i18n-sq.ts` (one line per text) and `components/legal-sq.tsx`.
- [ ] **P8 🟡 Launch assets.** Social media accounts and handles, profile images, and a few real example videos ready for when marketing starts.

## Phase 3B — Version 1 features

Everything from the feature list in TODO.md, built before launch. Strike through any you decide to drop and note why in the change log.

**Customer side**
- [ ] **V1 🟡 Google and Apple sign-in.** The `accounts` table is ready for it; keep email sign-up as well.
- [ ] **V2 🟡 Watermarked preview.** A low-resolution, watermarked preview before credits are charged, to build trust. **Blocked (owner + service):** every preview is a real AI run that costs money even when the customer doesn't buy, and Workers can't watermark or downscale video, so it needs a media-processing service. Needs your decision on who pays for discarded previews (D16/D3). Today the template's example video and the free redo (C21) cover trust. See DECISIONS.md #19.
- [x] **V3 🟡 Share page.** `/v/<id>` with an Open Graph preview and links the owner can revoke, instead of a raw 23-hour media link.
- [x] **V4 🟡 Promo codes and referrals.** Codes that grant credits or discount packs, plus "invite a friend, both get credits". ✅ Admin → Promo codes: codes that give credits or a % off a pack (limits, expiry, on/off, one use per customer); customers enter them under Credits → Have a code? (discounted prices shown, POK charged the discounted amount, whole lek for ALL). Invite friends: each customer's link; both get the set credits after the friend's first paid purchase (Credits page box; 0 = off, the default). See DECISIONS.md #16.
- [x] **V5 🟡 Progress and ETA.** Progress estimate on creations; use fal.ai webhooks instead of polling. ✅ Videos being made show a progress bar and "about N min left", estimated from how long that template's last 20 videos took (2 minutes when there's no history); it never shows 100% before the video is ready. Provider webhooks are not used — see DECISIONS.md #15.
- [x] **V6 🟡 Ratings and gallery.** Customers rate results; an opt-in "made with this template" gallery.
- [x] **V7 🟡 Installable app (PWA).** Add to home screen on phones, with an app icon and offline page. ✅ Web app manifest (standalone, theme colour, shortcuts), icons incl. maskable and Apple home-screen icon, a network-first service worker with a bilingual offline page. Icons are made from today's logo; replace them with the final brand (X2.2).
- [x] **V8 🟡 Image-only templates.** Photo results (portraits, photoshoots) as a cheaper product; allow publishing workflows that end in an image.
- [x] **V9 🟡 Upscale / post-processing step.** A built-in step type using a real upscaling model.
- [x] **V17 🟡 Saved photos ("My photos").** Customers save a photo once and reuse it for any template.
  - [x] V17.1 After uploading on a template page, a "Save this photo for future videos" option, off by default and unticked, so saving is the customer's explicit choice.
  - [x] V17.2 On every template page, "Use a saved photo" shows the customer's saved photos to pick from, next to the normal upload. For 2-photo templates, pick one for each slot.
  - [x] V17.3 A "My photos" section (Account or its own tab) to see, rename (e.g. "Me", "My partner"), set a default, and delete saved photos.
  - [x] V17.4 Saved photos are excluded from the 24-hour cleanup and count toward the per-account photo limit; unsaved photos keep today's behaviour.
  - [x] V17.5 Deleting a saved photo removes the file but keeps past videos; deleting the account removes all saved photos.
  - [x] V17.6 Privacy: state in the Privacy Policy how long saved photos are kept (D11) and that customers can delete them anytime; covered by D10 since face photos are personal data.
  - [x] V17.7 Saved photos still pass the photo checks (C2) when used, and are never shown to anyone else.

**Found by walking through the customer journey**
- [x] **V18 🟡 Change email address.** Today the email is read-only, so a customer who changes email is stuck. Change it with a confirmation link sent to the new address. ✅ Account → Change email address (with password): a confirmation link goes to the new address (30 minutes); the change happens when it's opened, and the old address gets a notice. Pending changes can be cancelled. Demo studio without email changes it at once.
- [x] **V19 🟡 Photo editing before upload.** Crop, rotate and zoom so the face is centred, and see a preview of what will be sent.
- [x] **V20 🟡 "Make it again".** One button on a finished video to run the same template with the same photo again (a new result, charged again). ✅ "Make it again" on a finished video (while its template is live and the photo is kept): confirms the current credit cost, then starts a new creation with the same photo.
- [x] **V21 🟡 One photo, several templates.** Pick several templates and create them all from one photo in one step, with the total credit cost shown.
- [x] **V22 🟡 Template options.** Templates can offer choices the customer picks (e.g. outfit colour, background, day/night) that change the hidden prompt.
- [x] **V23 🟡 Format choice.** Choose 9:16 (Stories/TikTok), 1:1 or 16:9 where the template supports it.
- [ ] **V24 🟡 Music on videos.** Optional background music track chosen from a licensed library, added to the downloaded video.
- [x] **V25 🟡 Share straight to apps.** On phones, the native share sheet (WhatsApp, Instagram, TikTok) with the video file, not only a link.
- [x] **V26 🟡 "Your video is ready" browser notification.** In addition to the email (C11.2), so customers can leave the page while waiting. ✅ While a video is being made, My creations offers "Notify me"; when it finishes (or fails, credits returned) the browser shows a notification through the service worker, also when the tab is in the background; clicking it opens My creations. Works while the site is open in some tab — push to a closed browser would need Web Push keys (see DECISIONS.md #11).
- [x] **V27 🟡 Low balance reminder.** When credits drop below the cheapest template, show a reminder with the best pack.
- [x] **V28 🟡 Gift credits.** Buy a pack as a gift and send it by email with a redeem code. ✅ Credits → Buy as a gift (name, email, message): when POK confirms the payment the credits become a one-time GIFT-… code emailed to the recipient (in the buyer's language) with a redeem link; the buyer gets the code too. The recipient redeems it under Have a code?. Reversing a gift cancels the code, or takes the credits back if already redeemed. Ledger stays balanced (gifts holding account).
- [x] **V29 🟡 New template emails.** Announce new and seasonal templates to customers who opted in (C20.3), with an unsubscribe link.
- [x] **V30 🟡 Removal request form.** A public form for someone who finds themselves in a video they didn't agree to, going to the admin report queue (C21) with a fast takedown. ✅ Public /removal-request form (footer "Report a video", and a link on every share page): a request naming a shared video hides it at once. Admin → Reports → Removal requests: watch the video, Remove it (deleted, owner emailed) or Keep it (requester emailed, optional note). Support can handle these too. See DECISIONS.md #12.

**Found by walking through your admin work**
- [x] **V31 🟡 Customer detail page.** One page per customer with their purchases, credit history, creations, reports and actions (adjust credits, reset link, suspend), for fast support.
  - [x] V31.1 Customer page built: profile (rename), credits with adjust and history, purchases with Reverse, creations, activity; suspend/reactivate, mark email verified, delete. Adjust credits only here.
  - [x] V31.2 Still to add when those features exist: reports (C21), refusals and block status (C2), send reset link (V11).
- [x] **V32 🟡 Free test runs for admins.** Run a template with real AI from the editor without spending credits, to check quality before publishing. ✅ Template editor → Test run: upload your photo(s) and run the saved template (drafts too) with the real AI; no credits are reserved or charged, a refusal is not a strike, no customer email is sent; the result plays in the editor and is listed in your My creations as "test run". The AI provider still bills the run.
- [x] **V33 🟡 Prompt history.** Every saved change to a template's prompt and workflow is kept, so you can compare and roll back. ✅ Template editor → History: every save keeps a version (prompt, workflow, price, format, media; newest 50; identical saves skipped), shows who changed what, compares any version with the current one side by side, and restores it (URL and publish state unchanged). History starts with the first save after this update.
- [x] **V34 🟡 Template statistics.** Per template: views, creations, success rate, average generation time and credits earned. ✅ Admin → Templates → Columns: Statistics, per period (7/30/90 days, all time): views, creations, views→creations, success rate (refusals counted), average generation time and credits earned (free redos excluded).
- [x] **V35 🟡 Backup AI model.** If the main model fails or is down, a template can retry automatically with a second model. ✅ Each workflow step can have a backup provider and model (template editor → AI workflow). If the main model fails or can't be reached, that step switches to the backup once and runs again; the switch is logged under Operations → Recent errors. Content refusals never switch models.
- [x] **V36 🟡 Announcements to customers.** Send an email to all opted-in customers from the admin (new templates, offers), using C20.3 consent.

**Found by comparing with Genematic (similar product)**
- [x] **V37 🟡 Quality levels per template.** Let a template offer "Standard" and "Premium" (e.g. a cheaper and a better AI model), each with its own credit cost, shown before generating.
- [ ] **V38 🟡 Creator tracking links.** Personal links/codes for creators (D17) and referrals (V4), showing sign-ups and purchases per creator in the admin.
- [x] **V39 🟡 Product templates for businesses.** Templates that turn a product photo (not a face) into an ad clip, for shops and small businesses; separate category and photo guidelines (C31) without the face rules.
- [x] **V40 🟡 Public feed.** A public feed of results customers chose to share (opt-in), with likes, that links each video to its template; extends the gallery in V6.
- [ ] **V41 🟡 Watermark on free results.** Results made with free welcome credits carry a small logo watermark; paid results don't (from D16).
- [x] **V42 🟡 Ask for a review.** After a good result (e.g. a high rating in V6), ask the customer to leave a Google or Trustpilot review.
- [x] **V43 🟡 Template requests.** Customers suggest templates they want; the admin sees requests and votes.
- [ ] **V44 🟡 Community templates with royalties.** Genematic lets creators publish scenarios and earn tokens each time they're used. Large feature (creator accounts, review of submitted prompts, royalty payouts in credits); strike it if it's too much for version 1.

**Other purchase options**
- [ ] **V45 🟡 Buy one video without a pack.** On a template page, "Buy this video" pays the price of that one video through POK (no credit pack needed), for customers who want to try once. Notes for later: price per template in ALL/EUR (higher per video than packs, so packs stay the better deal); the purchase grants exactly that template's credit cost and starts the creation, so the credits ledger stays the single system; no refunds (D4) and the same report/free redo rule (D12) apply.

**Admin side**
- [x] **V10 🟡 Roles.** Promote other admins and add a support role with limited access. ✅ Roles: Customer, Support, Administrator. An admin changes a role on the customer page (with their password; not their own; the studio always keeps an admin; the account is signed out). Support sees Users, Generations, Reports and Operations and can send reset links, mark emails verified, unblock, retry and resolve reports, but nothing with money, keys, settings, templates, exports or roles. See DECISIONS.md #9.
- [x] **V11 🟡 Admin password reset.** Send a reset link to a customer from Admin → Users.
- [x] **V12 🟡 CSV exports.** Credit purchases, the credit ledger and users. ✅ Export CSV buttons on Credit purchases, Credit ledger and Users (UTF-8 with BOM for Excel, formula-safe cells, logged in Activity).
- [x] **V13 🟡 Template management.** Drag-and-drop ordering, bulk publish/unpublish and scheduled publishing.
- [x] **V14 🟡 Template archive.** Archive (soft delete) instead of permanent delete.
- [x] **V15 🟡 Real AI cost tracking.** Record the actual provider cost per creation and compare it with the estimate.
- [x] **V16 🟡 A/B tests.** Test two previews or credit costs for a template. ✅ Template editor → A/B test: test a second credit cost or a second preview (thumbnail/video). Signed-in customers are split by account (always the same version), guests see version A; cards, template page, checkout price and Make it again follow the version. Results per version: views, creations, conversion, credits. See DECISIONS.md #17.

Not planned: PostgreSQL. D1 handles the expected load and no code change is needed for it.

## Phase 4 — Live testing on staging

Run these on a staging copy with test keys before switching to live keys (L1). Record each result in the change log.

- [ ] **T1 🔴 Accounts and email.**
  - [ ] T1.1 Sign up: the verification email arrives within a minute, in the inbox.
  - [ ] T1.2 The link opens your domain and verifies the account; welcome credits arrive if set.
  - [ ] T1.3 An expired link (after 30 minutes) shows a clear message, and "Resend" on the Account page sends a new one.
  - [ ] T1.4 Before verifying, buying credits and creating videos are blocked with a clear message.
  - [ ] T1.5 Forgot password: the reset email arrives, the link works once, and old sessions are signed out.
  - [ ] T1.6 Delete the account from the Account page.
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
- [ ] **T7 🔴 Real photo quality test.** For every template, test photos of different ages, skin tones, glasses, beards, low light, side profiles and group photos. Decide what the app should refuse (C2.3) and unpublish templates that fail too often.
- [ ] **T8 🔴 Security test.** Run `/security-review`, try opening another user's creations and purchases by ID, and try changing amounts during a real POK staging payment.
- [ ] **T9 🟡 Slow phone test.** Use the site on a mid-range phone with slow mobile data; uploads and video playback must still work.
- [ ] **T10 🟡 Email display test.** Check the verification and reset emails in Gmail, Outlook and phone mail apps, in light and dark mode.

## Phase 4B — Pre-live finishing

Done at the end, after the features are built and before launch day, once the final name and domain (D5) are known. These touch every page, so doing them once at the end avoids redoing them.

- [ ] **X1 🟡 Enhanced SEO** (replaces C25; includes P6).
  - [x] X1.1 ✅ `robots.txt` (blocks admin/account/credits/favorites/api/share) + `sitemap.xml` with the public pages and every published template, served by the Worker from `lib/server/seo.ts`. Generated from the database so new templates appear automatically.
  - [ ] X1.2 Unique page titles and descriptions for every page and template, in Albanian and English, with `hreflang` links between the two languages (after C10).
  - [ ] X1.3 Open Graph and Twitter images: one for the homepage and one per template (its poster), so links shared on WhatsApp, Instagram and Facebook show a preview.
  - [ ] X1.4 Structured data (JSON-LD): Organization and WebSite on the homepage, Product/Offer for credit packs, VideoObject for template examples, FAQPage for the FAQ (C26).
  - [x] X1.5 ✅ Every indexable page declares a canonical URL on `APP_ORIGIN` (template pages too); private/admin pages stay noindex. No duplicate pages (e.g. with and without a trailing slash or filter parameters).
  - [ ] X1.6 Speed (Core Web Vitals): compress previews, lazy-load videos below the fold, check with PageSpeed Insights on mobile.
  - [ ] X1.7 Landing pages for the main searches (e.g. "AI video nga foto", birthday/wedding templates), and category pages people can find from Google.
  - [ ] X1.8 Register the domain in Google Search Console and Bing Webmaster Tools, submit the sitemap, and check for indexing errors.
- [ ] **X2 🔴 Branding** (replaces C30; needs D5).
  - [ ] X2.1 Final name everywhere: replace "PROJECT STUDIO" in the header, footer, page titles, 404 page and admin.
  - [ ] X2.2 Logo and favicon (all sizes, including the phone home-screen icon for V7) and the tagline.
  - [ ] X2.3 Set `BRAND_NAME` (C6.4) and add the logo image to all emails; sender address `MAIL_FROM` on the final domain.
  - [ ] X2.4 Legal pages, FAQ and help pages use the final name and domain.
  - [ ] X2.5 Download file names (today `project-studio-….mp4`) and any watermark (V41) use the final brand.

## Phase 5 — Launch day

- [ ] **L-1 🔴 Back up** the production D1 database.
- [ ] **L-2 🔴 Deploy** the final tested commit with CI green.
- [ ] **L-3 🔴 Switch to live keys** (payment and webhook) and check Admin → Connections shows every item ready.
- [ ] **L-4 🔴 Smoke test with real money.** Buy the smallest pack with your own card, make one video, then refund yourself.
- [ ] **L-5 🟡 Watch for the first hours.** Admin → Operations (queue, failures, reversals), the error tracker, and the AI provider's spending.

## Phase 6 — After launch: operating routine (no new code)

Only operations here. Bugs found after launch are fixed; new features wait for version 2.

- [ ] **W1** Compare the real AI cost per video with the estimates and adjust credit costs if needed.
- [ ] **W2** Review failed generations and support emails daily.
- [ ] **W3** Check the ledger reconciliation and the payment provider's payouts match the purchases.
- [ ] **W4** Collect customer feedback into a version 2 list; don't build it yet.
- [ ] **W6** Publish new templates regularly (Genematic adds new ones every week) using the admin, without code changes; seasonal ones ahead of holidays.
- [ ] **W5** Weekly: back up D1, check the AI provider and POK balances, renew anything expiring (domain, keys).

---

## Change log

Add a line every time you tick something or change the plan.

| Date | Item | Change | Notes |
|---|---|---|---|
| 2026-10-12 | C11.1 | Done | Receipt email after each paid credit purchase (once per purchase, customer's language, not a tax invoice). 1 production check |
| 2026-10-12 | V16 | Done | A/B tests (template_experiments, migration 0028): stable split by account id, applied to catalog API, storefront, template page, related, generation pricing and repeat price; views/creations tagged with experiment and version; admin start/stop and results. 3 integration checks |
| 2026-10-12 | V15 | Done | AI cost tracking: each finished step records its cost (provider-reported when an adapter returns it, otherwise the step's listed price); Admin → AI costs shows per month and provider the recorded cost next to the invoice you enter (difference and %), and per template the estimated vs recorded cost per video. Migration 0027. 1 integration check |
| 2026-10-12 | V8, V9 | Done | Photo templates: generationType image can be published (no video step allowed); customers see 'Photo' on cards, a photo 'What you receive', and the image in My creations, share pages and the community. Upscale step: works on the previous result (or the photo) and goes through the image or video API to match; editor button 'Add upscale step' (fal clarity-upscaler / video-upscaler, to confirm on first real runs with C32.8). 1 integration check |
| 2026-10-12 | V19 | Done | Photo editor before upload: after choosing or dropping a photo, a 4:5 frame lets the customer drag, zoom (slider, arrow keys) and rotate, previewing exactly what is sent; 'Use the whole photo' skips cropping; crops stay at least 512 px (mild enlargement allowed, otherwise a warning). Verified in the browser (512×640 crop uploaded). Translated; HEIC/too-small photo messages now in Albanian too |
| 2026-10-12 | V21 | Done | One photo, several templates: after adding the photo(s), 'Make more with the same photo' lets the customer add up to 2 other templates (same photo count), shows the total, and starts them together via /api/generations/batch (total and running-video limits checked first, repeat-safe keys). 1 integration check |
| 2026-10-12 | V39 | Done | Product templates: template editor → What's in the photo (person / product); product templates show product photo rules and texts (EN+SQ) instead of face rules; new Products category. Also fixed the Albanian count line for multi-photo templates. Migration 0026. 2 integration checks |
| 2026-10-12 | V22, V23, V37 | Done | Template options: up to 4 groups per template (template editor → Customer options) — style choices add words to the hidden prompt, a format choice sets 9:16/1:1/16:9/4:5, quality levels add credits and can switch the main video model. Customers pick them on the template page (EN/SQ labels); the price, reservation, snapshot and Make it again follow the picks; cards show the opening price. Prompts and models stay private. Migration 0025. 3 integration checks |
| 2026-10-12 | V28 | Done | Gift purchases: gift fields on credit_purchases (migration 0024), confirmGiftPayment (issued→system:gifts, one-time gift code, emails), redemption from system:gifts, reverseGiftPayment, ledger kinds gift_sale/gift, Credits page gift form, redeem code prefilled from ?code=. 3 credits checks |
| 2026-10-12 | V4 | Done | Promo codes (promo_codes, promo_redemptions), discount applied in startPackCheckout and counted when paid, credit codes granted from system:promo (new ledger kinds promo/referral), referral codes + referred_by, reward after the first paid purchase, admin page and settings, customer code box and invite panel (translated). Migration 0023. 4 credits checks |
| 2026-10-12 | V35 | Done | Backup model per workflow step (validated), queue tryFallback on provider failure or failed submissions, logged as a warning with the generation ID, editor fields. 1 provider check |
| 2026-10-12 | V32 | Done | Admin test runs: generations.test_run (migration 0022), POST /api/admin/templates/:id/test-run, queue runs test runs without a credit hold, no strike/email, staff may upload without credits, Test run tab with live status and video. 1 integration check |
| 2026-10-12 | V5 | Done | Progress estimate: typicalSeconds per running creation (average of the template's last 20 completed), animated progress bar with time left in My creations (translated). 1 integration check |
| 2026-10-12 | V17 | Done | Saved photos: unticked 'Save this photo for future videos' after upload; 'Use a saved photo' picker per slot and the default photo pre-filled; Account → My photos with names, a default, delete, and Save for recent uploads; saved photos skip the 24-hour cleanup (max 20) and are never deleted by replacing/removing them on a template page; deleting keeps past videos; privacy text, FAQ (EN+SQ) updated. Photos were cleaned at upload (C2) and stay private. Migration 0021. 3 integration checks |
| 2026-10-12 | V6, V40, V42 | Done | Ratings (1–5 stars) on finished videos; opt-in Share to the community (consent dialog) puts a video on the new /feed Community page (newest / most liked, likes for signed-in customers) and in a 'See what others made' gallery on its template page; stop sharing, deletion, removal requests and staff Hide take it out. Customers who rate 4–5 stars are invited to review (review link set in Admin → Settings → Support). Header nav fits at tablet widths. Privacy text and FAQ updated (EN+SQ). Migration 0020. 6 integration checks |
| 2026-10-12 | V43 | Done | Template ideas: public /ideas page (footer "Suggest a template", link from empty search) where signed-in customers suggest ideas and vote once each; Admin → Template ideas sorted by votes with status (open / coming soon / available / declined) and a linked template. Migration 0019. 2 integration checks |
| 2026-10-12 | V36, V29 | Done | Admin → Announcements: write the email in Albanian and English (or pick a template to announce it with a ready message), send yourself a test, then send to verified customers who opted in; the dispatcher sends 40 per minute, can be stopped, each customer gets their language once. One-click unsubscribe (signed link + List-Unsubscribe header) and a news toggle in Account. Migration 0018. 2 production + 1 integration check |
| 2026-10-12 | V34 | Done | lib/server/template-stats.ts + /api/admin/template-stats; Statistics column set in the template list with period picker. 1 integration check |
| 2026-10-12 | V33 | Done | template_versions (migration 0017), recordVersion on every editor save, list/restore API, History tab with compare and restore. 2 integration checks |
| 2026-10-12 | V30 | Done | Removal requests (removal_requests, migration 0016): public form + API with IP rate limit, instant share-page takedown, admin/support queue with remove/keep and emails to requester and owner in their language, error-log entry for each new request. 3 integration checks |
| 2026-10-12 | V18 | Done | Email change: users.pending_email (migration 0015), POST/DELETE /api/account/email, /confirm-email page + /api/auth/email-change, confirmation email and old-address notice in the customer's language. 1 integration + 1 production check |
| 2026-10-12 | V26 | Done | Browser notifications for finished/failed creations via the service worker (permission asked from a Notify me prompt while a video is in progress), translated |
| 2026-10-12 | V7 | Done | PWA: public/manifest.webmanifest, public/icons (192/512/maskable/apple, rendered from favicon.svg), public/sw.js (network-first, offline page, notification clicks), public/offline.html (SQ+EN), layout manifest/theme/apple metadata, SW registration. 1 integration check |
| 2026-10-12 | V27 | Done | Low balance reminder on Explore, My creations, Favorites and Account when credits can't pay for the cheapest video, naming the best-value pack that covers it, with a Buy credits button (translated). 1 integration check |
| 2026-10-12 | V3, V25 | Done | Share page /v/<id> (share_links, migration 0014): stable link per video, Open Graph image + video card, view count, Make your own CTA, owner can Stop sharing, deleting the video revokes it; video served via short signed links. My creations: Shared state, Stop sharing, and on phones Send video → native share sheet with the MP4 file. Privacy text updated (EN+SQ). 3 integration checks |
| 2026-10-12 | V20 | Done | POST /api/generations/:id/again (owner only, completed, current cost must match, idempotent key) reusing startGeneration; creations list returns repeatCost; Make it again button with confirm, translated. 1 integration check |
| 2026-10-12 | V10 | Done | Roles user/support/admin: requireUser lets staff into the admin, adminAPI allow-list for support, role change via PATCH users (admin password, not self, keep one admin, sessions cleared), filtered sidebar, role panel. 3 security checks |
| 2026-10-12 | V13, V14 | Done | Templates: drag-and-drop (and arrow) ordering saved as sort_order for Recommended; select + bulk publish/unpublish/archive (publish checks the same rules as saving); scheduled publishing (publish_at, validated, published by the dispatcher every minute, logged); Delete now archives, with an Archive view to Restore or delete permanently. Migration 0013. 5 integration checks |
| 2026-10-12 | V12 | Done | lib/server/exports.ts: /api/admin/export/{purchases,ledger,users} CSV (admin only, rate-limited, audited, formula injection neutralised); buttons in the three admin pages. 2 integration checks |
| 2026-10-12 | V11, V31 | Done | Admin → customer page: Send reset link (emailed in the customer's language; demo shows/copies the link), reports list, two-step and email-language badges, more activity labels. 1 integration + 1 production check |
| 2026-10-12 | C10, C6.3 | Done | i18n: lib/i18n.ts + lib/i18n-sq.ts (≈600 lines), useI18n/LanguageSwitch, Albanian legal pages, translated metadata/404/error/loading, API errors and field messages per language (admin English), emails per users.locale (migration 0012), language cookie no longer counts as a signed-in cookie for the origin check. tests: test:i18n coverage + 6 integration + 1 production check; test helpers send studio_lang=en |
| 2026-10-12 | C29.1, C29.2 | Done | Contrast raised to WCAG AA across globals.css (124 colours, hue kept), stronger focus styles, skip link, prefers-reduced-motion. Real-device checks stay with T5/T9. 1 integration check |
| 2026-10-12 | C4.1 (L5) | Done | TOTP two-step sign-in (lib/server/mfa.ts, migration 0011): setup with key + otpauth link, enable with code, recovery codes, login ticket step, disable/regenerate with password + code; admin reminder banner. Also fixed a pre-existing hydration mismatch (dates now formatted in Europe/Tirane on server and browser). 7 security checks |
| 2026-10-12 | C7 (L10) | Done | lib/server/errors.ts reportError(): structured log + error_events (migration 0010, pruned after 30 days) + optional Sentry envelope; all console.error sites moved over with IDs; Operations shows Recent errors and a readiness line; SENTRY_DSN connection with validation. 3 production checks |
| 2026-10-12 | C12 (F8) | Done | Replicate: version IDs for community models (POST /v1/predictions with version), model reference validated on template save, output picked from any shape (video preferred), aborted status handled; image steps default to an image key. 3 provider checks |
| 2026-10-12 | C31.4 | Mostly done | Per-template photo tips: new templates.photo_tips column (migration 0009), textarea in the template editor, shown in the template's guidelines card. Albanian waits for C10. 1 integration check |
| 2026-10-12 | C27.1, C27.2, C21.9 | Done | Template page: What you receive box and related templates (same category first). Example photos (C27.3) wait for real images. FAQ now covers the report/free-redo rule (C21.9). 1 integration check |
| 2026-10-12 | C26 | Done | Help & FAQ and Contact pages, footer links, admin-editable support details and social links (validated https). 4 integration checks. New DECISIONS.md records choices made for soft-blocked items |
| 2026-10-12 | C13.1 | Done | money() shows fractional amounts exactly instead of rounding (ALL whole amounts keep no decimals); ALL packs already limited to whole lek. C13.2 (POK minimums) waits on POK |
| 2026-10-12 | C14 | Done | Account export adds signed 23-hour download links for every upload and generated file (grouped per creation), consents, refusal count and reports; Account page text updated. 2 integration checks |
| 2026-10-12 | C11.2 | Done | Creation finished emails: ready / failed / refused (credits returned), sent best-effort from the queue with one idempotency key per attempt; shared branded notice layout reused by report emails. 3 production checks |
| 2026-10-12 | C9 (F7) | Done | Storefront paged on the server: first page (24) rendered with the page for the URL filters, filter changes refetch page 1, Show more appends pages; hero is its own top-3 query; favorites load only saved templates. 3 integration checks |
| 2026-10-12 | C25, C30, X1, X2 | Moved | New pre-live phase (4B) at the end: C25 SEO basics become X1 Enhanced SEO (with P6), C30 branding becomes X2 Branding |
| 2026-10-12 | C4.4 (F12) | Done | Audit re-run: next 16.3.8 + overrides for image-size/brace-expansion/fast-uri/sharp/source-map-js; 19 → 1 advisory (braces in lint/build tooling, no fix published). docs/SECURITY.md and dependency-audit.json updated |
| 2026-10-11 | C8 | Done | Anonymous page/template views recorded: analytics endpoint moved to the public route section (optional user, IP rate limit); client fires homepage_view on home/explore and template_view on template pages for guests too. 1 integration check |
| 2026-10-11 | C4.2, C5, C28 | Done | PBKDF2 iteration count now stored in and read from the hash (F16); pager hidden on empty/single-page lists (C28). Verified F15/F17/F18/F19 were already fixed (image extensions, deletion order, user count, admin-only footer link). 3 integration checks added |
| 2026-10-11 | C19 | Done | Exchange-rate settings (USD→EUR/ALL, defaults 0.92 / 85, admin-editable); AI costs converted into the selling currency for dashboard financials, profitable templates and the admin template margin column; dashboard defaults to EUR, no USD column. lib/server/rates.ts. 4 integration checks; security financials assertion updated |
| 2026-10-11 | C23 | Done | Spending safety limits: per-customer concurrent (default 3) and daily (default 20) caps + studio-wide daily estimated-AI-cost cap (off by default, records spend_cap_reached event). New lib/server/limits.ts enforced in startGeneration before reserving credits; admin panel + settings API. 5 integration checks |
| 2026-10-11 | C22 | Done | Maintenance mode in Admin → Settings: toggles to pause creation and/or purchases + custom message; app_settings-backed, gates checkout and generation (503), storefront banner + closed buttons via publicAvailability. 5 integration checks |
| 2026-10-11 | Checklist | Moved | Checklist now lives in the repo at LAUNCH-CHECKLIST.md (was in Downloads) so it persists and is versioned |
| 2026-10-11 | C16, C17, C4.3 | Done | CSP frame-ancestors self-only + removed dead app/chatgpt-auth.ts; legal date -> Version TERMS_VERSION; 404 title; C16.1–C16.3 already clean; titles were already proper |
| 2026-10-07 | C21 | Done | Report a problem on finished videos (reason+comment, 7-day window, one open), case status in My creations, admin Reports queue with photos/video/history + abuse flag, approve = free goodwill redo (ledger-recorded, same photo), reject photo-unsuitable (guideline) / other (reason), file+account retention while open, branded decision emails, Terms policy. Migration 0008. 15 integration checks added. FAQ copy deferred to C26 |
| 2026-10-07 | C31 | Mostly done | Photo-guidelines card (count line + ✓do/✕don't) in the upload area, shown before upload; required "my photo follows the guidelines" checkbox gates Generate; guidelines editable studio-wide in Admin → Settings. Remaining: example photos (C31.2) and per-template custom text + Albanian (C10) |
| 2026-10-07 | C18 | Done | Public /pricing page (packs, per-credit value, EUR/ALL switch, welcome-credits note); Pricing nav link; approximate real-money price next to credit costs on cards/hero/template page via a shared creditRef from the active packs |
| 2026-10-07 | D3.2 | Rate set | ALL pack prices use 1 EUR = 92 ALL (6 Oct 2026), rounded to nearest 10 lek: 1,380 / 2,760 / 5,520 / 11,040 |
| 2026-10-07 | D3.2, D3.4, P1 | Done / applied | Four credit packs (Starter/Creator/Pro/Studio) priced in EUR + ALL and welcome credits = 10, from the D3 pricing doc. Added scripts/seed-packs.* + pnpm seed:packs (idempotent; local and --remote). Packs stay editable in admin. D3.1/D3.3 (per-template costs) still need real Higgsfield runs |
| 2026-10-07 | C20 | Done | Sign-up now has required Terms/Privacy and 13+ checkboxes (stored with version + timestamps), an optional marketing opt-in (stored with timestamp), and a show/hide password button. Migration 0007 adds the consent columns |
| 2026-10-06 | C6.1, C6.2, C6.5, C15 | Done | Branded HTML + plain-text verification and reset emails (English); brand name now a config value (temp "Project Studio", BRAND_NAME env); resend/verify/reset link-missing bugs confirmed fixed. C6.3 (Albanian) folds into C10; C6.4 needs final brand (D5) |
| 2026-10-06 | C3 (F10, L2) | Done | Every-minute Cloudflare cron trigger runs the Worker's scheduled() dispatcher; heartbeat shows source (cron/external) in Operations; external scheduler kept as fallback; production tests run the real scheduled() handler |
| 2026-10-06 | C32 | Done (except C32.5, C32.8) | Higgsfield adapter, refusals, empty-account handling, default workflow, admin UI, fake Higgsfield tests; owner confirms with real runs in C32.8 |
| 2026-10-06 | C2 | Done | Photo cleanup (browser + server), refusals with credits returned, 3-strike block, admin unblock, customer warnings, Terms text. C2.2d moved to C32 |
| 2026-10-06 | V31.1 | Done | Customer page in the admin; adjust credits moved there |
| 2026-10-06 | V45 | Added | Option to buy a single video without a credit pack |
| 2026-10-06 | C2.2 | Detailed | Photo cleanup split into fast browser preparation and byte-level server checks, following Higgsfield's input rules |
| 2026-10-06 | D13 | Decided | Minimum age 13+; lawyer to confirm parental consent rules for data and purchases by 13–17 year olds |
| 2026-10-06 | D18, C2, C31.5, C32, I8 | Decided | Higgsfield is the AI provider and does content checks; refusals recorded and flagged; 3 refusals = blocked; Higgsfield connection added |
| 2026-10-06 | D13, D16–D17, V37–V44, W6 | Added | Comparison with Genematic |
| 2026-10-06 | D12, C21, C31 | Changed | Free redo only when the photo was good; unsuitable photo = no free try; photo guidelines in the upload section |
| 2026-10-06 | D12, C21 | Decided | Bad videos can be reported; admin reviews photo + video and can approve one free redo of the same video |
| 2026-10-06 | D4, C1.3 | Done | No refund policy; Reverse stays for chargebacks; partial refunds not needed |
| 2026-10-06 | V18–V36 | Added | Customer journey and admin walk-through |
| 2026-10-06 | V17 | Added | Saved photos to reuse in future videos |
| 2026-10-06 | D8–D15, C15–C30, I11–I13, P7–P8, T7–T10 | Added | Full review of every page (guest, customer, admin; desktop and phone), legal text and code |
| 2026-10-06 | All | Changed | Nothing waits for after launch: every feature from TODO.md added (C9–C14, V1–V16); Phase 6 is operations only |
| 2026-10-06 | C6, C11, I7, T1 | Changed | Account emails made a launch blocker with their own steps; email test steps added |
| 2026-10-06 | C1.1, C1.2 | Done | POK replaces Stripe; refunds recorded with Reverse in Admin → Credit purchases. C1.4 needs the real POK staging keys |
| 2026-10-06 | D1.1–D1.3, D2.1 | Done | POK chosen and verified; business VASIL XHAJA. D1.4 fees and D2.2 tax still open |
| 2026-10-06 | — | Checklist created | Credits system done (steps 1–3); payment provider and packs still to be decided |
