-- SIRVINCI ACADEMY WAITLIST REPORT
-- Run each SELECT block separately in the Supabase SQL Editor.
-- This report reads existing data only; it does not update registrations or email jobs.

-- 1) Executive summary and response completion.
SELECT
  count(*) AS total_registrations,
  count(DISTINCT lower(btrim(email))) AS unique_emails,
  min(created_at) AS first_registration_at,
  max(created_at) AS latest_registration_at,
  count(*) FILTER (WHERE nullif(btrim(canva_experience), '') IS NOT NULL) AS answered_experience,
  count(*) FILTER (WHERE nullif(btrim(main_goal), '') IS NOT NULL) AS answered_goal,
  count(*) FILTER (WHERE nullif(btrim(stopped_reason), '') IS NOT NULL) AS answered_barrier,
  count(*) FILTER (WHERE nullif(btrim(payment_pref), '') IS NOT NULL) AS answered_payment_preference,
  count(*) FILTER (WHERE nullif(btrim(expected_cost), '') IS NOT NULL) AS answered_expected_cost,
  round(100.0 * count(*) FILTER (WHERE nullif(btrim(canva_experience), '') IS NOT NULL) / nullif(count(*), 0), 1) AS experience_completion_pct,
  round(100.0 * count(*) FILTER (WHERE nullif(btrim(main_goal), '') IS NOT NULL) / nullif(count(*), 0), 1) AS goal_completion_pct,
  round(100.0 * count(*) FILTER (WHERE nullif(btrim(stopped_reason), '') IS NOT NULL) / nullif(count(*), 0), 1) AS barrier_completion_pct,
  round(100.0 * count(*) FILTER (WHERE nullif(btrim(payment_pref), '') IS NOT NULL) / nullif(count(*), 0), 1) AS payment_completion_pct,
  round(100.0 * count(*) FILTER (WHERE nullif(btrim(expected_cost), '') IS NOT NULL) / nullif(count(*), 0), 1) AS expected_cost_completion_pct
FROM public.waitlist;

-- 2) Sign-up trend by week (use this to see whether outreach is working over time).
SELECT
  date_trunc('week', created_at)::date AS week_start,
  count(*) AS registrations
FROM public.waitlist
GROUP BY 1
ORDER BY 1;

-- 3) Distribution of audience answers.
-- "No answer" is explicit so missing responses are visible rather than silently excluded.
WITH responses AS (
  SELECT 'Canva experience'::text AS field, coalesce(nullif(btrim(canva_experience), ''), 'No answer') AS answer FROM public.waitlist
  UNION ALL
  SELECT 'Main goal', coalesce(nullif(btrim(main_goal), ''), 'No answer') FROM public.waitlist
  UNION ALL
  SELECT 'Barrier', coalesce(nullif(btrim(stopped_reason), ''), 'No answer') FROM public.waitlist
  UNION ALL
  SELECT 'Payment preference', coalesce(nullif(btrim(payment_pref), ''), 'No answer') FROM public.waitlist
  UNION ALL
  SELECT 'Expected course cost (raw answer)', coalesce(nullif(btrim(expected_cost), ''), 'No answer') FROM public.waitlist
),
counts AS (
  SELECT field, answer, count(*) AS responses
  FROM responses
  GROUP BY field, answer
),
totals AS (
  SELECT field, count(*) AS registrations
  FROM responses
  GROUP BY field
)
SELECT
  counts.field,
  counts.answer,
  counts.responses,
  round(100.0 * counts.responses / nullif(totals.registrations, 0), 1) AS pct_of_registrations
FROM counts
JOIN totals USING (field)
ORDER BY counts.field, counts.responses DESC, counts.answer;

-- 4) Email queue health: counts by state.
-- "accepted" means Resend accepted the message; it does not guarantee inbox placement.
SELECT
  status,
  count(*) AS jobs,
  min(created_at) AS oldest_job_created_at,
  max(updated_at) AS latest_job_update
FROM private.waitlist_email_jobs
GROUP BY status
ORDER BY jobs DESC, status;

-- 5) Email jobs requiring attention. No recipient email is selected by this query.
SELECT
  job_id,
  status,
  attempt_count,
  error_category,
  created_at,
  updated_at,
  next_attempt_at,
  provider_message_id,
  last_error_message
FROM private.waitlist_email_jobs
WHERE status IN ('blocked', 'retryable', 'failed', 'uncertain')
ORDER BY updated_at ASC;

-- 6) Anonymised analysis export: no names or email addresses.
-- Use the SQL result download option if available, then analyse categories in a spreadsheet.
SELECT
  canva_experience,
  main_goal,
  stopped_reason,
  payment_pref,
  expected_cost,
  created_at::date AS signup_date
FROM public.waitlist
ORDER BY created_at;

-- 7) Contact export for authorised launch follow-up only (contains personal data).
-- Prefer Table Editor > public.waitlist > Export CSV when a full list is needed.
-- Do not publish or share this export in public channels.
SELECT created_at, full_name, email
FROM public.waitlist
ORDER BY created_at;


-- Structured pricing analysis. Compare amounts only within the same currency.
SELECT country_of_residence, expected_cost_currency,
  count(*) FILTER (WHERE expected_cost_amount IS NOT NULL) AS numeric_price_responses,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY expected_cost_amount) FILTER (WHERE expected_cost_amount IS NOT NULL) AS median_amount,
  min(expected_cost_amount) AS minimum_amount,
  max(expected_cost_amount) AS maximum_amount,
  count(*) FILTER (WHERE pricing_unsure) AS unsure_responses
FROM public.waitlist
WHERE country_of_residence IS NOT NULL
GROUP BY country_of_residence, expected_cost_currency
ORDER BY country_of_residence, expected_cost_currency;
