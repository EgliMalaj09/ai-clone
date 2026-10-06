# HTTP API

Base path: `/api`. JSON errors have `{ "error": "Human-readable message" }`. JSON responses are not cached. Mutating JSON requests require `Content-Type: application/json`. Authenticated mutations require an Origin matching the application origin (or same-origin browser metadata). Browser clients use the `studio_session` HttpOnly cookie; never expose this cookie to client JavaScript. Uploaded files use multipart form data with a `file` field.

Videos are paid with **credits** (whole numbers). Credit packs are bought with money; money amounts are integer minor units (499 means EUR 4.99). Credit cost, ownership, photo count, consent, provider readiness and workflow are checked on the server. Credit design: [CREDITS-ARCHITECTURE.md](CREDITS-ARCHITECTURE.md).

## Public and authentication

| Method | Route | Behavior |
|---|---|---|
| GET | `/health` | Application mode and availability |
| GET | `/templates` | Public templates with `creditCost`; `q`, `category`, `tag=all/trending/new/popular`, `sort=featured/newest/price-low/price-high` (by credit cost), `page`, `limit` |
| GET | `/credit-packages` | Credit packs on sale: credits, bonus, total and price per currency |
| GET | `/templates/:slug` | Active public template; no prompt, cost, provider or model |
| GET | `/me` | Current safe profile or null; demo flag |
| POST | `/auth/register` | `{name,email,password}`; creates an account and session |
| POST | `/auth/login` | `{email,password}`; creates a session |
| POST | `/auth/logout` | `{}`; invalidates the current session |
| POST | `/auth/forgot` | `{email}`; neutral response; never returns a reset URL |
| POST | `/auth/reset` | `{token,password}`; consumes a one-use token and revokes sessions |
| POST | `/auth/verify` | `{token}`; verifies the email and grants welcome credits if configured |
| POST | `/auth/resend` | Signed-in account; sends another verification email |
| POST | `/webhooks/pok?purchase=…&sig=…` | POK order notification. The `sig` HMAC of the purchase ID must match; the server then reads the order from POK and grants credits only if the captured amount, currency and reference match. The body is never trusted |

## Customer

| Method | Route | Behavior |
|---|---|---|
| POST | `/uploads` | Private JPG/PNG/WEBP upload, at most 8 MB; requires a credit balance above zero (402 otherwise). Unused photos are deleted after 24 hours |
| GET | `/uploads` | Owned private upload inventory |
| DELETE | `/uploads/:id` | Deletes unused owned upload bytes and record |
| GET | `/media/:id` | Ownership, public-preview or signed-link access; Range supported |
| GET | `/media/:id?download=1` | Authenticated/signed attachment download |
| GET / POST | `/favorites` | List IDs / toggle `{templateId}` |
| GET | `/credits` | `{available,held}` balance; `held` is reserved by running creations |
| GET | `/credits/history` | Paginated credit transactions with the change and resulting balance |
| POST | `/credits/checkout` | `{packageId,currency,idempotencyKey,consent:true}`; returns `{purchaseId,url}` (test checkout in demo, POK order page in production) |
| GET | `/credits/purchases`, `/credits/purchases/:id` | Owned pack purchases |
| POST | `/credits/purchases/:id/verify` | Server reads the POK order after a return; the return URL alone grants nothing |
| POST | `/credits/purchases/:id/retry` | Reuses an open POK order or safely replaces an expired one |
| POST | `/credits/purchases/:id/pay` | Demo only: `{result:"success"}` or `{result:"fail"}` |
| POST | `/generations` | `{templateId,uploadIds,expectedCost,idempotencyKey,consent:true}`; reserves the credit cost and queues the creation. 402 when the balance is too low |
| GET | `/generations` | Paginated creations with `creditCost` and `creditStatus` (pending/captured/released); `status=all/processing/completed/failed` |
| GET | `/generations/:id` | Owned creation, returned in `generations` array |
| DELETE | `/generations/:id` | Removes a finished creation and its stored outputs |
| POST | `/generations/:id/share` | 23-hour signed output URL |
| POST | `/queue/tick` | Advances up to five of the account's eligible jobs |
| PATCH | `/account` | `{name}` profile update |
| POST | `/account/password` | `{currentPassword,newPassword}`; rotates sessions |
| GET / DELETE | `/account/sessions` | Safe active-session summary / revoke other sessions |
| GET | `/account/export` | JSON download of owned profile, credit balance and history, credit purchases, uploads, creations and favorites |
| DELETE | `/account` | `{password}`; deletes identity and files after active work finishes |
| POST | `/analytics` | Allowlisted product event name and optional templateId |

`idempotencyKey` must be a UUID generated once per intended action. Repeating it returns the same creation or purchase without charging again; reusing it for different photos, another template or another pack is a 409. If a template's credit cost changed (409), the customer must review the new cost. A creation keeps the credit cost and workflow it started with; its credits are charged on delivery and returned automatically on failure.

## Administrator

Every route below revalidates the current server-side role and account status.

| Method | Route | Behavior |
|---|---|---|
| GET | `/admin/dashboard` | Pack revenue per currency, credits sold/spent/given/outstanding, estimated AI cost, recent work and purchases, template margins |
| GET | `/admin/operations` | Readiness, queue heartbeat, issues, storage and product events |
| POST | `/admin/operations/dispatch` | Manual queue check, recorded in the audit log |
| GET | `/admin/activity` | Searchable, paginated audit log |
| GET / POST | `/admin/templates` | List / create full template definition |
| GET / PATCH / DELETE | `/admin/templates/:id` | Inspect / update / delete template |
| POST | `/admin/templates/:id/duplicate` | Copy as unpublished draft |
| POST | `/admin/media` | Public preview image/MP4 upload, at most 30 MB |
| GET / DELETE | `/admin/media`, `/admin/media/:id` | Media library with usage; delete unused files |
| GET | `/admin/generations` | Paginated search, user and status filters |
| GET | `/admin/generations/:id` | Internal execution steps, provider IDs and errors |
| POST | `/admin/generations/:id/retry` | Failed, non-deleted work; reserves the customer's credits again (402 if too few) |
| GET / POST | `/admin/credit-packages` | All packs / create `{name,credits,bonusCredits,prices:{EUR:499},active,sortOrder}` |
| PATCH / DELETE | `/admin/credit-packages/:id` | Update / remove a pack (past purchases keep their snapshot) |
| GET | `/admin/credits/purchases` | Paginated pack purchases with customer email |
| POST | `/admin/credits/purchases/:id/reverse` | `{reason:"Payment refunded"|"Payment disputed",currentPassword}`; records a refund or chargeback made in POK and removes the pack's credits, even below zero. Paid purchases only |
| GET | `/admin/credits/ledger` | Paginated credit transactions; `search` (email, transaction or reference ID), `kind` |
| GET | `/admin/credits/reconciliation` | Ledger invariant check: zero-sum entries, balances equal to entries, negative balances |
| GET / POST | `/admin/users/:id/credits` | Balance and history / adjustment `{amount,reason,currentPassword,idempotencyKey}` (audited; never below zero) |
| GET | `/admin/users` | Paginated search/status, activity counts, credit balance, pack spending per currency |
| PATCH | `/admin/users/:id` | `{status:"active"}` or `{status:"suspended"}`; suspension revokes sessions |
| DELETE | `/admin/users/:id` | Delete a non-admin account and personal files |
| GET / PATCH | `/admin/providers`, `/admin/providers/:id` | Safe provider readiness / `{enabled:boolean}` |
| GET / PATCH | `/admin/settings` | Safe readiness and preferences / `{welcomeCredits:number}` (0 turns welcome credits off) |

Template create/update accepts `AdminTemplate` in `lib/contracts.ts`; Zod validates `lib/server/validation.ts`. Workflow steps support image, transform, video, upscale and process. Publishing requires a valid video-ending workflow and valid public preview media. Referenced variables must exist at that step. JSON objects are checked before saving, including hidden editor tabs.

Admin record lists accept `page` (1–100000), `limit` (1–100), `search`, `status`, and, where relevant, `user` (email). Responses include `{pagination:{page,limit,total,pages}}`. Personal APIs default to 24 creations / 25 credit transactions per page.

## Worker

`POST /queue/dispatch` requires `Authorization: Bearer QUEUE_SECRET`, not an account cookie. It advances up to five eligible jobs and records a dispatcher heartbeat labelled `external`. It is the fallback for hosting without the Worker's cron trigger, which records its own heartbeat labelled `cron`. A private site access gate must also permit that scheduler; knowing QUEUE_SECRET does not bypass hosting authorization.

## Common errors

400 invalid input, 401 not signed in, 402 not enough credits, 403 wrong owner/role/origin, 404 missing record, 409 cost/checkout/workflow conflict, 413 body/file/quota exceeded, 415 unsupported content type, 429 rate limited, 502 invalid provider output, 503 service not configured. The UI shows errors without exposing API keys or internal prompts.


## Production connections and presets

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/admin/connections` | Admin-only presence/source flags, sender address and setup readiness. No secret values. |
| PATCH | `/api/admin/connections` | `{currentPassword,values:{FAL_KEY,...},remove:[]}`. Allowed fields: POK_KEY_ID, POK_KEY_SECRET, POK_MERCHANT_ID, POK_ENVIRONMENT (`staging` or `production`), HIGGSFIELD_API_KEY, HIGGSFIELD_API_SECRET, FAL_KEY, REPLICATE_API_TOKEN, RESEND_API_KEY, MAIL_FROM. Authenticated encryption at rest; env bindings take precedence. |
| POST | `/api/admin/workflows/preset` | Admin-only preset definition from name, slug, description, requiredImageCount, aspectRatio, duration (5 or 10), estimatedCost. Returns editable private workflow and hidden prompt; performs no inference. |

In production, buying credits returns 503 until payments, email, an AI provider, the dispatcher and public access are ready; starting a creation returns 503 until an AI provider, the dispatcher and public access are ready. The test checkout and mock jobs are disabled with DEMO_MODE=false. The ordinary provider and payment adapters use either environment-managed keys or encrypted dashboard connections.
