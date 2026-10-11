# Decisions made without the owner

Claude made these choices while working through the launch checklist unattended, for items that were only *softly* blocked (a product choice with a sensible default). Each one is easy to change. Branding, business identity, legal and money decisions were **not** made here; they stay in Phase 0 of [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md).

To change a decision, tell Claude "change decision N" or edit the setting mentioned.

| # | Date | Item | Decision | Why | How to change it |
|---|---|---|---|---|---|
| 1 | 2026-10-12 | C26 Help pages | Support email, phone, response time and Instagram/TikTok/Facebook links are **settings in Admin → Settings → Support and social accounts**, empty by default. Empty fields are hidden; the Contact page says the support address "will be listed here soon" until it is set. | The support channel (D7) and social accounts (P8) aren't decided yet, so nothing is invented; the pages work as soon as you fill the fields. | Fill or clear the fields in Admin → Settings. |
| 2 | 2026-10-12 | C26 FAQ text | The FAQ describes today's behaviour: unused photos deleted after 24 h, kept photos and videos stay until the customer deletes them, credits don't expire, no refunds, free redo via reports within 7 days, 3 refusals block the account. | It must match the Terms and the code. | When D11 (how long files are kept) is decided, update the "How long do you keep my photos?" answer in `components/help-pages.tsx` with the Privacy Policy. |
| 3 | 2026-10-12 | C27 What you receive | The template page says results come **with no watermark**, as MP4 at the template's resolution. | That is what the app delivers today. | If you decide on watermarks for free results (D16/V41), change the line in `components/template-detail.tsx`. |
