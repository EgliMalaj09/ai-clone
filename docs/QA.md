# Verification record

20 September 2026: production Worker build and TypeScript checks passed. All 156 executable checks passed against the compiled Worker with disposable D1/R2 bindings and the checked-in migrations.

| Suite | Checks | Coverage |
|---|---:|---|
| `pnpm test:integration` | 72 | Catalog/routes, authentication, uploads, ownership, pricing, checkout, payment replay, asynchronous demo jobs, downloads, favorites, admin templates/workflows, refunds, deletion |
| `pnpm test:security` | 45 | Reset-token concurrency, session rotation, CSRF, body limits, protected operational APIs, pagination/search, workflow/media validation, checkout expiry races, signed webhook ordering, deadline/refund controls, exports and account deletion |
| `pnpm test:providers` | 9 | Live-mode guards, Fal image-to-video, Replicate video, MIME detection, known-length R2 streaming, stable intermediate identities, renewed signed links and blocked unsafe delivery hosts |
| `pnpm test:production` | 30 | Encrypted credentials, password/role/origin enforcement, redaction, tamper protection, readiness, production preset, closed checkout and mock blocking |

Provider and Stripe HTTP responses in contract tests are simulated inside the test runtime. No real card charge, refund, email, or paid inference was performed. Live credentials are still required for account-specific validation.

Browser verification: homepage, catalog images/prices, Formula search (one result), Sports filter (two results), Formula Driver detail, playable five-second concept video, and anonymous admin access gate. Explore rendered without horizontal overflow in 375px, 390px and 430px iframe viewports. A hidden mobile menu button was corrected; its drawer and Orders navigation were then exercised at 375px. The temporary responsive-test page was removed before the final build.

No application console errors were observed on the inspected public routes. The browser extension itself emitted metadata errors. Browser-level authenticated UI actions were not automated; account, checkout and administrator operations were exercised through production HTTP handlers, including authenticated server rendering.

WebMCP `search_templates` remains feature-detected. The preview browser reported modelContext unavailable, so UI controls were tested directly instead.

Detailed results are in integration-results.json, security-regressions-results.json providers-results.json and production-results.json. See SECURITY.md and dependency-audit.json for the remaining build-time dependency advisories and production limits.


Production update: all four suites passed against the updated compiled Worker (72 integration, 45 security, 9 provider, 30 production-configuration checks). New connection keys were disposable test values. Every email, Stripe, Fal and Replicate response in the relevant suites was a local HTTP fixture. No paid model invocation, real charge or actual email delivery occurred. Production-mode template detail was also inspected in the internal browser: concept-preview label, setup-unavailable notice, disabled checkout, and no horizontal overflow at the inspected desktop width. No new application console errors were observed; the browser extension emitted its own metadata errors. The existing mobile checks above belong to the earlier full-flow build; authenticated Connections UI interactions were not browser-automated.
