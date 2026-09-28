# HTTP API

Base path: `/api`. JSON errors have `{ "error": "Human-readable message" }`. JSON responses are not cached. Mutating JSON requests require `Content-Type: application/json`. Authenticated mutations require an Origin matching the application origin (or same-origin browser metadata). Browser clients use the `studio_session` HttpOnly cookie; never expose this cookie to client JavaScript. Uploaded files use multipart form data with a `file` field.

Amounts are integer minor units: 299 means USD 2.99. Price, currency, ownership, photo count, consent, provider readiness and workflow are checked on the server. Templates do not use a points system.

## Public and authentication

| Method | Route | Behavior |
|---|---|---|
| GET | `/health` | Application mode and availability |
| GET | `/templates` | Public templates; `q`, `category`, `tag=all/trending/new/popular`, `sort=featured/newest/price-low/price-high`, `page`, `limit` |
| GET | `/templates/:slug` | Active public template; no prompt, cost, provider or model |
| GET | `/me` | Current safe profile or null; demo flag |
| POST | `/auth/register` | `{name,email,password}`; creates an account and session |
| POST | `/auth/login` | `{email,password}`; creates a session |
| POST | `/auth/logout` | `{}`; invalidates the current session |
| POST | `/auth/forgot` | `{email}`; neutral response; never returns a reset URL |
| POST | `/auth/reset` | `{token,password}`; consumes a one-use token and revokes sessions |
| POST | `/auth/verify` | `{token}`; verifies the email |
| POST | `/auth/resend` | Signed-in account; sends another verification email |
| POST | `/webhooks/stripe` | Raw signed Stripe event; signature, time and payment details validated |

## Customer

| Method | Route | Behavior |
|---|---|---|
| POST | `/uploads` | Private JPG/PNG/WEBP upload, at most 8 MB |
| GET | `/uploads` | Owned private upload inventory |
| DELETE | `/uploads/:id` | Deletes unused owned upload bytes and record |
| GET | `/media/:id` | Ownership, public-preview or signed-link access; Range supported |
| GET | `/media/:id?download=1` | Authenticated/signed attachment download |
| GET / POST | `/favorites` | List IDs / toggle `{templateId}` |
| POST | `/checkout` | `{templateId,uploadIds,expectedPrice,idempotencyKey,consent:true}`; returns order/generation IDs and checkout URL |
| GET | `/orders` | Paginated owned orders |
| GET | `/orders/:id` | Owned order and current generation/payment status |
| POST | `/orders/:id/pay` | Demo-only `{result:"success"}` or `{result:"fail"}` |
| POST | `/orders/:id/verify` | Server retrieves Stripe session; frontend return parameters are insufficient |
| POST | `/orders/:id/retry` | Reuses open checkout or safely renews an expired session |
| GET | `/generations` | Paginated creations; `status=all/processing/completed/failed/awaiting_payment` |
| GET | `/generations/:id` | Owned creation, returned in `generations` array |
| DELETE | `/generations/:id` | Removes finished/unpaid creation and stored outputs |
| POST | `/generations/:id/share` | 23-hour signed output URL |
| POST | `/queue/tick` | Advances up to five of the account's eligible jobs |
| PATCH | `/account` | `{name}` profile update |
| POST | `/account/password` | `{currentPassword,newPassword}`; rotates sessions |
| GET / DELETE | `/account/sessions` | Safe active-session summary / revoke other sessions |
| GET | `/account/export` | JSON download of owned profile, orders, uploads, creations and favorites |
| DELETE | `/account` | `{password}`; deletes identity and files after active work finishes |
| POST | `/analytics` | Allowlisted product event name and optional templateId |

`idempotencyKey` must be a UUID generated once for the intended checkout. Reusing it with different photos or a different template is a conflict. Refreshing a template's price after a 409 must be an explicit customer review. Paid generations preserve the original price/workflow.

## Administrator

Every route below revalidates the current server-side role and account status.

| Method | Route | Behavior |
|---|---|---|
| GET | `/admin/dashboard` | Currency-separated financials, recent work/payments and template performance |
| GET | `/admin/operations` | Readiness, queue heartbeat, issues, storage and product events |
| POST | `/admin/operations/dispatch` | Manual queue check, recorded in the audit log |
| GET | `/admin/activity` | Searchable, paginated audit log |
| GET / POST | `/admin/templates` | List / create full template definition |
| GET / PATCH / DELETE | `/admin/templates/:id` | Inspect / update / delete template |
| POST | `/admin/templates/:id/duplicate` | Copy as unpublished draft |
| POST | `/admin/media` | Public preview image/MP4 upload, at most 30 MB |
| GET | `/admin/generations` | Paginated search, user and status filters |
| GET | `/admin/generations/:id` | Internal execution steps, provider IDs and errors |
| POST | `/admin/generations/:id/retry` | Only failed, paid, non-refunded, non-deleted work |
| GET | `/admin/orders`, `/admin/payments` | Paginated search/status/user filters; includes refund state |
| POST | `/admin/orders/:id/refund` | Full refund through original provider after work stops |
| GET | `/admin/users` | Paginated search/status, activity counts, spending per currency |
| PATCH | `/admin/users/:id` | `{status:"active"}` or `{status:"suspended"}`; suspension revokes sessions |
| DELETE | `/admin/users/:id` | Delete a non-admin account and personal files |
| GET / PATCH | `/admin/providers`, `/admin/providers/:id` | Safe provider readiness / `{enabled:boolean}` |
| GET / PATCH | `/admin/settings` | Safe readiness/preferences / `{autoRefund:boolean}` |

Template create/update accepts `AdminTemplate` in `lib/contracts.ts`; Zod validates `lib/server/validation.ts`. Workflow steps support image, transform, video, upscale and process. Publishing requires a valid video-ending workflow and valid public preview media. Referenced variables must exist at that step. JSON objects are checked before saving, including hidden editor tabs.

Admin record lists accept `page` (1–100000), `limit` (1–100), `search`, `status`, and, where relevant, `user` (email). Responses include `{pagination:{page,limit,total,pages}}`. Payment `status=refund-review` selects pending/failed/action-required refunds. Personal APIs default to 24 creations / 25 orders per page.

## Worker

`POST /queue/dispatch` requires `Authorization: Bearer QUEUE_SECRET`, not an account cookie. It advances up to five eligible jobs and records an external-dispatch heartbeat. Schedule it independently of browsers. A private site access gate must also permit that scheduler; knowing QUEUE_SECRET does not bypass hosting authorization.

## Common errors

400 invalid input, 401 not signed in, 403 wrong owner/role/origin, 404 missing record, 409 price/checkout/workflow conflict, 413 body/file/quota exceeded, 415 unsupported content type, 429 rate limited, 502 invalid provider output, 503 service not configured. The UI shows errors without exposing API keys or internal prompts.


## Production connections and presets

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/admin/connections` | Admin-only presence/source flags, sender address and setup readiness. No secret values. |
| PATCH | `/api/admin/connections` | `{currentPassword,values:{FAL_KEY,...},remove:[]}`. Allowed fields: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FAL_KEY, REPLICATE_API_TOKEN, RESEND_API_KEY, MAIL_FROM. Authenticated encryption at rest; env bindings take precedence. |
| POST | `/api/admin/workflows/preset` | Admin-only preset definition from name, slug, description, requiredImageCount, aspectRatio, duration (5 or 10), estimatedCost. Returns editable private workflow and hidden prompt; performs no inference. |

Production checkout returns 503 before creating an order when required service configuration or dispatcher readiness is missing. Development payment/retry paths and mock jobs are disabled with DEMO_MODE=false. The ordinary provider and payment adapters use either environment-managed keys or encrypted dashboard connections.
