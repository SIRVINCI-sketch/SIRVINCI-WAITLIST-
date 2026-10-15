# Sirvinci Academy Waitlist — Operations and Research Guide

## What the waitlist is for

The waitlist is the pre-launch interest and lead-capture system for Sirvinci Academy's self-paced, mobile-first Canva design masterclass currently presented as a 2027 cohort. It is not an enrolment or payment system. Its purpose is to estimate demand, understand the audience, shape the curriculum and pricing, and build a contact list for consented launch updates.

## Where the information lives

- `public.waitlist`: one record per normalized email address, with sign-up time, name/email, experience, goal, learning barrier, payment preference, and the expected course cost response.
- `private.waitlist_email_jobs`: operational email queue and delivery state.
- `private.waitlist_email_resend_requests` and `private.waitlist_email_resend_limits`: internal resend idempotency and per-email rate-limit records.
- `private.waitlist_ip_rate_limits`: keyed hashes and counters for the Edge Function IP limiter. Raw IP addresses are not stored in this table.

The frontend cannot read the waitlist or email queue directly. Staff should use Supabase's authenticated dashboard.

## Routine use

1. Open the Supabase project and choose **SQL Editor**.
2. Open `supabase/reports/waitlist-period-end.sql` in this repository.
3. Copy and run each SELECT block separately. These queries are read-only.
4. Use the executive summary and weekly trend to track volume and growth.
5. Use the answer distribution to see the most common audience needs, obstacles, payment preferences, and stated price expectations.
6. Use the email-queue queries to find jobs stuck in blocked/retryable/failed/uncertain states. An accepted Resend request is not proof of inbox delivery.
7. If the team needs a contact list, use **Table Editor → public.waitlist → Export CSV**. This file contains personal data and should be shared only with people who need it for launch operations.

## End-of-waitlist-period analysis

Do not count every answer manually. Let SQL calculate totals, response completion, category counts, percentages, and weekly growth. Export only the anonymised analysis query when working in Excel or Google Sheets; use a pivot table or chart for visual summaries.

Use the findings to answer:
- How many unique people registered, and did registrations grow after specific outreach?
- Are they beginners, occasional users, or existing designers?
- Is the dominant goal earning through freelancing, growing a brand/business, switching careers, or personal projects?
- What is the dominant obstacle (time, cost, uncertainty about where to begin, or perceived difficulty)?
- Do learners prefer one-time payment or instalments?
- What price ranges do people state? The expected-cost field is free text, so normalize spelling/currency variants into clear bands before calculating a median or making pricing decisions.
- Which curriculum, support format, and launch message best answer the audience's dominant needs?

A stated price preference is not a purchase commitment. Before fixing the final price or investing heavily in production, run a small validation step such as a clear course outline plus price test, refundable deposit/pre-order (with clear terms), or direct interviews with a sample of interested learners.

## Data quality note

The experience and payment-preference questions previously preselected their first radio option. New visitors should now choose deliberately or leave these optional questions unanswered; there is no longer an implicit default answer. This improves future response quality without changing the required registration fields or the email flow. Older records do not record whether those choices were actively selected or simply left at the old default, so treat historical experience/payment percentages as provisional rather than confirmed intent.

## What the current data cannot tell us

The current waitlist stores completed registrations, not page views or traffic-source attribution. It cannot calculate a true landing-page conversion rate or reliably tell which Instagram post, WhatsApp share, or campaign brought a registration. That would require additional, privacy-conscious analytics/UTM tracking and a count of page visits. Do not infer campaign performance from registration dates alone.

## Operational safeguards

- Keep `public.waitlist` and email-job data private to authorised staff; do not grant the browser direct SELECT access.
- Per-email resend controls: 10-second cooldown; up to 3 requests in the current minute window, 10 in the current hour window, and 20 in the current 24-hour window.
- The Edge Function also applies a separate per-trusted-IP budget when Supabase provides a valid gateway IP header: 15 per minute, 60 per hour, 200 per rolling day. Raw IPs are transformed into keyed HMAC hashes before they reach the database. The function prefers the dedicated `WAITLIST_RATE_LIMIT_HMAC_SECRET`; until that secret is configured, it derives a purpose-specific key from `EMAIL_RECOVERY_SECRET`. Configure the dedicated key in Supabase Function Secrets during routine maintenance. If the trusted IP header, secret, or rate-limit RPC is unavailable, that layer logs a warning and fails open so legitimate registration is not blocked; per-email controls remain.
- Public resend responses do not disclose whether an email address is registered. Do not add sensitive recipient details to logs.
- The email worker runs every five minutes as a recovery safety net; first dispatch is attempted immediately.
- Review the Supabase Edge Function logs and the email-queue health query during testing and before launch.
- Keep automated checks current: `node --test tests/waitlist-flow.test.js`. Maintain a live integration test for registration, duplicate prevention, queueing, and retry behavior before material database/function changes.
- Keep backups/export copies secure. Retain contact data only as long as needed for the Academy launch and related follow-up; fulfil deletion requests and document retention expectations in a privacy notice.

## Launch and close-out checklist

- [ ] Confirm the course promise, outline, format, start window, and price assumptions.
- [ ] Run one real registration using a controlled email address and verify both the row and email-job state.
- [ ] Confirm Resend acceptance and check the recipient inbox/spam; do not treat provider acceptance as guaranteed inbox delivery.
- [ ] Review queue-health queries for unresolved jobs.
- [ ] At close-out, export the aggregate report and an anonymised response dataset.
- [ ] Decide the first cohort size, curriculum priorities, price test, launch messages, and follow-up schedule.
- [ ] Restrict access to the contact CSV and delete temporary working copies when analysis is complete.


## International price analysis

New waitlist submissions must provide country of residence and either a positive numeric price plus currency or “I'm not sure yet.” Use `expected_cost_amount`, `expected_cost_currency`, `country_of_residence`, and `pricing_unsure` to calculate medians/ranges by market and currency. Do not average values across currencies without an explicit exchange-rate methodology. The older `expected_cost` text field is retained for historical responses and readable exports; older entries may have no structured amount/currency/country values.
