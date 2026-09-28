# Security review — 20 September 2026

This is a source review, dependency audit, and executable regression record for the working MVP. It is not an independent penetration-test certification or a claim that a public global launch has no remaining risk.

## Findings corrected in this revision

| Area | Finding and correction | Evidence |
|---|---|---|
| Recovery | Demo recovery returned a password-reset link to the requester. Removed token-bearing responses; an unconfigured sender cannot mint a reset token. Existing recovery tokens and sessions are revoked on upgrade. | Known/unknown email produce the same response; no token minted; migration 0001 |
| One-use tokens | Concurrent reset requests could both read an unused token. Atomic DELETE … RETURNING consumes it once; payload validation runs first. | Concurrent attempts yield one success and one rejection |
| Account access | Added password change with current-password verification, session rotation, revoke-other-sessions, and password reconfirmation for self-deletion. | Previous password/session rejected; unauthorized deletion rejected |
| CSRF | Cookie-authenticated mutations without trusted browser origin evidence could pass. Origin/same-origin checks now reject them. | Cross-origin and missing-origin regression requests |
| Request limits | JSON parsing could read an unbounded chunked body. Added streamed byte limits and explicit JSON content types. | Oversized JSON rejected; upload size/type regressions |
| Checkout retry | Expired checkout URLs were reused indefinitely. Added a persisted attempt counter and session reconciliation; concurrent retries share one Stripe idempotency key. | Stubbed Stripe expiration, concurrent retry and async-payment tests |
| Webhook ordering | Delayed old-session failure and refund events could leave inconsistent work. Failure checks the session; payment handoff is conditional/atomic; full refunds revoke work leases. | Old expiry cannot fail new checkout; late confirmation cannot restart refunded work |
| Refund policy | An enabled environment default overrode an administrator's disabled setting. Database preference now wins. | Deadline failure stays paid when auto-refund is disabled; manual refund works |
| Workflows | Forward references and unsafe output keys failed only after payment. Added publication-time variable, output, step-ID and media validation. | Invalid variable/key/preview rejected before purchase |
| Media privacy | A template path could refer to a personal upload. Template previews must reference public admin media or known bundled assets. | Private-upload publication rejected |
| External HTTP | Worker fetch does not implement redirect:error. Use redirect:manual and reject unsuccessful responses without following them. | Stripe retry and AI adapter contract suites |
| Output persistence | Image MIME was guessed and unknown-length streams were unsuitable for R2. Sniff supported bytes, bound downloads, stream known lengths, bound unknown lengths to 24 MB. | WEBP retained with correct MIME; MP4 streamed to private storage |
| Workflow retries | Persisted signed URLs could expire before a later retry. Persist asset IDs and sign on submission. | Multi-step context stores IDs; next step receives a fresh signed URL |
| Operational visibility | Capped admin lists, missing dispatcher observability, and refunded cost omission obscured issues. Added pagination, search, heartbeat, audit view, and currency-separated cost estimates. | Pagination/search, heartbeat, audit, and refunded-cost tests |

## Controls retained and checked

- Every admin API request checks the database-backed role and active account status.
- Passwords use a random salt and PBKDF2-SHA256; session tokens are random and stored as hashes. Cookies are HttpOnly, SameSite=Lax, Secure on HTTPS, and expire after seven days.
- Public template projections exclude database prompts, provider/model settings and internal cost. Template/workflow changes do not change existing order snapshots.
- Uploaded and generated files use random object keys and require the owner, administrator, or a valid limited-life signature. Deletion removes the object bytes. Completed downloads support byte ranges.
- Database queries bind user values. Sort/filter SQL fragments come only from explicit allowlists. Error responses avoid provider credentials and private workflow contents.
- Stripe webhook verification uses the original bounded body, constant-time signature comparison, a five-minute timestamp window, amount/currency/session matching, and persisted event IDs.
- Payment confirmation is required before queue selection. Leases, deterministic step IDs, and cautious handling of ambiguous submissions reduce duplicate work.
- Provider outputs use HTTPS on explicit provider delivery domains; redirects and private-host output URLs are refused. Signing/bootstrap/dispatcher secrets stay in environment bindings. Payment, AI and email credentials can additionally be stored as authenticated ciphertext through the protected Connections API. Environment-managed values take precedence.
- Response headers restrict embedding, base URLs and object content; disable unused device permissions; apply HSTS over HTTPS. CSP is a limited set of directives, not a nonce-based script policy.

## Dependency audit

The initial full audit reported 2 critical, 36 high, 19 moderate and 4 low advisories. Next.js, React/RSC, Vite and affected transitive packages were updated with the existing package manager. The final full audit reports **0 critical, 2 high, 0 moderate, 0 low**. Both remaining advisories concern `image-size@2.0.2`, a Vinext development dependency:

- [ICNS parser infinite loop](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
- [JXL/HEIF parser infinite loops](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)

The package manager identified `image-size@2.0.3` as published 14 September 2026, inside this project's seven-day minimum release-age window. No release-age exception was retained. The update can be retried after 21 September 2026 15:57 UTC. The source import in the installed Vinext version is `server/metadata-route-build-data.js`, which reads build-time metadata assets. Application upload validation accepts JPG, PNG and WEBP, not the affected ICNS/JXL/HEIF formats; user uploads never enter the build pipeline. Do not build this project with untrusted metadata assets. These findings remain recorded, not suppressed or described as fixed.

The checked-in dependency report records the audit result and package paths. An audit is a time-specific advisory check; rerun it before public launch and on dependency changes. Dependency fixes were tested with the compiled Worker and actual local D1/R2 bindings.

## Remaining production work

1. Enable publicly reachable authorized webhook/provider endpoints, configure real Stripe/AI/mail accounts, and run account-specific checkout, refund, delivery and inference tests. Stubbed adapter tests are not live service verification.
2. Operate an independently scheduled queue dispatcher with monitoring; the included best-effort background window and browser polling do not guarantee unattended long-running work.
3. Add edge-level abuse controls and load tests. File signature/size checks are not antivirus scanning or full image decoding; add normalization/scanning and provider moderation appropriate to public volume.
4. Define backup retention, abuse reporting, support, business identity, tax/refund policies, and region-specific legal requirements. The included legal text is for a private development preview.
5. Add administrator MFA / a managed identity provider before broader operational access. Google OAuth is not part of this MVP.
6. Reconcile actual model costs and handle partial refunds/disputes separately. Displayed AI costs and profit are estimates, excluding payment fees and tax.

Password-reset behavior follows the principles in [OWASP's recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Payment reconciliation follows [Stripe webhook guidance](https://docs.stripe.com/webhooks) and [Checkout session expiration behavior](https://docs.stripe.com/api/checkout/sessions/expire).


## Production connections review — 20 September 2026

Added an admin-only credential manager with current-password reauthentication, existing CSRF/origin checks and a per-admin write limit. AES-256-GCM uses fresh 96-bit nonces, an HKDF-SHA256 key derived from APP_SECRET with a dedicated context, and the credential name as authenticated additional data. Status responses return presence/source flags and the non-secret sender address only. The audit log records changed field names without values or passwords. Server requests read/decrypt credentials only when needed; credentials are not cached in browser storage. Host-managed credentials cannot be overridden or removed in the UI.

Regression coverage includes plaintext absence in D1, API redaction, ciphertext substitution, nonce uniqueness, removal, role and origin enforcement, invalid payment key rejection, environment precedence, and repair after unreadable storage. The production queue and test-payment endpoints reject mock work. Simulated orders cannot reopen checkout in production. Queue freshness and explicitly asserted public endpoint reachability gate new purchases.

Fal image output ingestion also permits the exact HTTPS host storage.googleapis.com under /falserverless/; other buckets, private hosts and redirects remain rejected. No external account credentials were supplied and no live provider, email, financial transaction or public audience change was exercised during this update.
