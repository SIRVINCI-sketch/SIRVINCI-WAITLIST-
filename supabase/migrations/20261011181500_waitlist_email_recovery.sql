BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- The browser only needs to create registrations; no anonymous reads or edits.
REVOKE ALL ON TABLE public.waitlist FROM PUBLIC, anon, authenticated;
GRANT INSERT (full_name, email, canva_experience, main_goal, stopped_reason, payment_pref, expected_cost)
  ON TABLE public.waitlist TO anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS private.waitlist_email_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  normalized_email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retryable', 'blocked', 'accepted', 'failed', 'uncertain')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 6),
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  lease_until timestamptz,
  provider_message_id text,
  error_category text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email_jobs_due
  ON private.waitlist_email_jobs (next_attempt_at, created_at)
  WHERE status IN ('pending', 'retryable');
CREATE INDEX IF NOT EXISTS idx_waitlist_email_jobs_blocked
  ON private.waitlist_email_jobs (created_at)
  WHERE status = 'blocked';

-- The transactional trigger closes the gap between saving a registration and
-- the browser reaching the email function.
CREATE OR REPLACE FUNCTION private.enqueue_waitlist_email_on_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO private.waitlist_email_jobs (email, normalized_email, full_name)
  VALUES (NEW.email, lower(btrim(NEW.email)), NEW.full_name)
  ON CONFLICT (normalized_email) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS waitlist_enqueue_confirmation_email ON public.waitlist;
CREATE TRIGGER waitlist_enqueue_confirmation_email
AFTER INSERT ON public.waitlist
FOR EACH ROW EXECUTE FUNCTION private.enqueue_waitlist_email_on_registration();

ALTER TABLE private.waitlist_email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.waitlist_email_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.waitlist_email_jobs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_waitlist_email(p_email text)
RETURNS TABLE(job_id uuid, status text, email text, full_name text, attempt_count integer, idempotency_key uuid, created_at timestamptz, next_attempt_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  registered_email text;
  registered_name text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_email IS NULL OR length(btrim(p_email)) > 254 OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;

  SELECT w.email, w.full_name
    INTO registered_email, registered_name
    FROM public.waitlist AS w
   WHERE lower(btrim(w.email)) = lower(btrim(p_email))
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration not found' USING ERRCODE = 'P0002';
  END IF;

  -- New registrations already received a pending outbox row from the INSERT
  -- trigger. If that row is absent for an older registration, do not guess
  -- whether a prior message was delivered and risk sending a duplicate.
  INSERT INTO private.waitlist_email_jobs (email, normalized_email, full_name, status, error_category, last_error_message)
  VALUES (
    registered_email,
    lower(btrim(registered_email)),
    registered_name,
    'uncertain',
    'legacy_delivery_unknown',
    'No prior outbox record exists; historical delivery cannot be safely inferred.'
  )
  ON CONFLICT (normalized_email) DO NOTHING;

  RETURN QUERY
  SELECT j.job_id, j.status, j.email, j.full_name, j.attempt_count, j.idempotency_key, j.created_at, j.next_attempt_at
    FROM private.waitlist_email_jobs AS j
   WHERE j.normalized_email = lower(btrim(registered_email));
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_waitlist_email_jobs(
  p_job_ids uuid[] DEFAULT NULL,
  p_include_blocked boolean DEFAULT false,
  p_batch_size integer DEFAULT 10
)
RETURNS TABLE(job_id uuid, email text, full_name text, attempt_count integer, idempotency_key uuid, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Reclaim only within Resend's idempotency retention window. Older ambiguous
  -- jobs are explicitly uncertain and are never automatically sent again.
  UPDATE private.waitlist_email_jobs AS j
     SET status = CASE WHEN j.created_at > now() - interval '23 hours' THEN 'retryable' ELSE 'uncertain' END,
         next_attempt_at = CASE WHEN j.created_at > now() - interval '23 hours' THEN now() ELSE NULL END,
         lease_until = NULL,
         error_category = 'worker_interrupted',
         last_error_message = 'Processing lease expired; safe recovery requires provider idempotency window.',
         updated_at = now()
   WHERE j.status = 'processing'
     AND j.lease_until < now();

  RETURN QUERY
  WITH candidates AS (
    SELECT j.job_id
      FROM private.waitlist_email_jobs AS j
     WHERE j.attempt_count < 6
       AND (
         (j.status IN ('pending', 'retryable') AND coalesce(j.next_attempt_at, '-infinity'::timestamptz) <= now())
         OR (p_include_blocked AND j.status = 'blocked' AND j.updated_at <= now() - interval '1 hour')
       )
       AND (p_job_ids IS NULL OR j.job_id = ANY (p_job_ids))
     ORDER BY j.created_at, j.job_id
     FOR UPDATE SKIP LOCKED
     LIMIT least(greatest(coalesce(p_batch_size, 10), 1), 25)
  ), claimed AS (
    UPDATE private.waitlist_email_jobs AS j
       SET status = 'processing',
           attempt_count = j.attempt_count + 1,
           last_attempt_at = now(),
           next_attempt_at = NULL,
           lease_until = now() + interval '5 minutes',
           updated_at = now()
      FROM candidates AS c
     WHERE j.job_id = c.job_id
     RETURNING j.job_id, j.email, j.full_name, j.attempt_count, j.idempotency_key, j.created_at
  )
  SELECT c.job_id, c.email, c.full_name, c.attempt_count, c.idempotency_key, c.created_at
    FROM claimed AS c;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_waitlist_email_job(
  p_job_id uuid,
  p_outcome text,
  p_provider_message_id text DEFAULT NULL,
  p_error_category text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_retry_after_seconds integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  saved_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('accepted', 'retryable', 'blocked', 'failed', 'uncertain') THEN
    RAISE EXCEPTION 'invalid outcome' USING ERRCODE = '22023';
  END IF;

  UPDATE private.waitlist_email_jobs AS j
     SET status = CASE WHEN p_outcome = 'retryable' AND j.attempt_count >= 6 THEN 'failed' ELSE p_outcome END,
         provider_message_id = coalesce(p_provider_message_id, j.provider_message_id),
         error_category = CASE WHEN p_outcome = 'accepted' THEN NULL ELSE left(p_error_category, 80) END,
         last_error_message = CASE WHEN p_outcome = 'accepted' THEN NULL ELSE left(p_error_message, 500) END,
         next_attempt_at = CASE
           WHEN p_outcome = 'retryable' AND j.attempt_count < 6
             THEN now() + make_interval(secs => least(greatest(coalesce(p_retry_after_seconds, 30), 30), 21600))
           ELSE NULL
         END,
         lease_until = NULL,
         updated_at = now()
   WHERE j.job_id = p_job_id AND j.status = 'processing'
  RETURNING j.status INTO saved_status;

  IF saved_status IS NULL THEN
    RAISE EXCEPTION 'job is not claimed' USING ERRCODE = 'P0002';
  END IF;
  RETURN saved_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_waitlist_email_job(p_job_id uuid, p_error_message text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  saved_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE private.waitlist_email_jobs AS j
     SET status = 'blocked',
         error_category = 'configuration_blocked',
         last_error_message = left(coalesce(p_error_message, 'Email sender configuration unavailable.'), 500),
         next_attempt_at = NULL,
         lease_until = NULL,
         updated_at = now()
  WHERE j.job_id = p_job_id AND j.status IN ('pending', 'processing', 'retryable', 'blocked')
  RETURNING j.status INTO saved_status;

  IF saved_status IS NULL THEN
    SELECT j.status INTO saved_status FROM private.waitlist_email_jobs AS j WHERE j.job_id = p_job_id;
  END IF;
  RETURN coalesce(saved_status, 'missing');
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_waitlist_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_waitlist_email_jobs(uuid[], boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_waitlist_email_job(uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_waitlist_email_job(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enqueue_waitlist_email_on_registration() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_waitlist_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_email_jobs(uuid[], boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_waitlist_email_job(uuid, text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.block_waitlist_email_job(uuid, text) TO service_role;

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'sirvinci_waitlist_email_recovery_secret') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sirvinci-waitlist-email-recovery') THEN
      PERFORM cron.unschedule(jobid)
        FROM cron.job
       WHERE jobname = 'sirvinci-waitlist-email-recovery';
    END IF;

    PERFORM cron.schedule(
      'sirvinci-waitlist-email-recovery',
      '*/5 * * * *',
      $command$
        SELECT net.http_post(
          url := 'https://pnkxoktjhzjvjarediid.supabase.co/functions/v1/send-welcome-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-email-recovery-secret', (
              SELECT decrypted_secret
                FROM vault.decrypted_secrets
               WHERE name = 'sirvinci_waitlist_email_recovery_secret'
               LIMIT 1
            )
          ),
          body := '{"action":"process_due","batch_size":10}'::jsonb
        );
      $command$
    );
  END IF;
END;
$schedule$;

COMMIT;
