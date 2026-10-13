BEGIN;

-- Route registration through the Edge Function so PostgREST's unique-violation
-- response cannot be used to check whether an arbitrary address is registered.
REVOKE INSERT ON TABLE public.waitlist FROM PUBLIC, anon, authenticated;
REVOKE INSERT (full_name, email, canva_experience, main_goal, stopped_reason, payment_pref, expected_cost)
  ON TABLE public.waitlist FROM PUBLIC, anon, authenticated;

ALTER TABLE private.waitlist_email_jobs
  DROP CONSTRAINT IF EXISTS waitlist_email_jobs_normalized_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_jobs_one_active_per_email
  ON private.waitlist_email_jobs (normalized_email)
  WHERE status IN ('pending', 'processing', 'retryable', 'blocked');

CREATE TABLE IF NOT EXISTS private.waitlist_email_resend_limits (
  normalized_email text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count BETWEEN 0 AND 3),
  last_requested_at timestamptz
);

CREATE TABLE IF NOT EXISTS private.waitlist_email_resend_requests (
  request_id uuid PRIMARY KEY,
  normalized_email text NOT NULL,
  job_id uuid,
  outcome text NOT NULL DEFAULT 'request_received',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.waitlist_email_resend_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.waitlist_email_resend_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.waitlist_email_resend_limits FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE private.waitlist_email_resend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.waitlist_email_resend_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.waitlist_email_resend_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.enqueue_waitlist_email_on_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO private.waitlist_email_jobs (email, normalized_email, full_name)
  VALUES (NEW.email, lower(btrim(NEW.email)), NEW.full_name)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.register_waitlist(
  p_full_name text,
  p_email text,
  p_canva_experience text DEFAULT NULL,
  p_main_goal text DEFAULT NULL,
  p_stopped_reason text DEFAULT NULL,
  p_payment_pref text DEFAULT NULL,
  p_expected_cost text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_full_name), '') IS NULL OR length(btrim(p_full_name)) > 120 THEN
    RAISE EXCEPTION 'invalid registration' USING ERRCODE = '22023';
  END IF;
  IF p_email IS NULL OR length(btrim(p_email)) > 254 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid registration' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.waitlist (
    full_name, email, canva_experience, main_goal, stopped_reason, payment_pref, expected_cost
  ) VALUES (
    btrim(p_full_name), lower(btrim(p_email)),
    nullif(btrim(p_canva_experience), ''), nullif(btrim(p_main_goal), ''),
    nullif(btrim(p_stopped_reason), ''), nullif(btrim(p_payment_pref), ''),
    nullif(btrim(p_expected_cost), '')
  ) ON CONFLICT DO NOTHING;

  -- Intentionally identical for new and existing registrations.
  RETURN 'received';
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_waitlist_email(p_email text)
RETURNS TABLE(job_id uuid, status text, email text, full_name text, attempt_count integer, idempotency_key uuid, created_at timestamptz, next_attempt_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  registered_email text;
  registered_name text;
  existing_job private.waitlist_email_jobs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR length(btrim(p_email)) > 254 OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;

  SELECT w.email, w.full_name INTO registered_email, registered_name
    FROM public.waitlist AS w
   WHERE lower(btrim(w.email)) = lower(btrim(p_email))
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT j.* INTO existing_job
    FROM private.waitlist_email_jobs AS j
   WHERE j.normalized_email = lower(btrim(registered_email))
   ORDER BY j.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO private.waitlist_email_jobs (
      email, normalized_email, full_name, status, error_category, last_error_message
    ) VALUES (
      registered_email,
      lower(btrim(registered_email)),
      registered_name,
      'uncertain',
      'legacy_delivery_unknown',
      'No prior outbox record exists; historical delivery cannot be safely inferred.'
    ) RETURNING * INTO existing_job;
  END IF;

  RETURN QUERY SELECT existing_job.job_id, existing_job.status, existing_job.email,
    existing_job.full_name, existing_job.attempt_count, existing_job.idempotency_key,
    existing_job.created_at, existing_job.next_attempt_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_waitlist_email_resend(
  p_email text,
  p_sender_verified boolean,
  p_request_id uuid
)
RETURNS TABLE(outcome text, job_id uuid, email text, full_name text, status text, attempt_count integer, idempotency_key uuid, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  registered_email text;
  registered_name text;
  normalized text;
  limit_row private.waitlist_email_resend_limits%ROWTYPE;
  selected_job private.waitlist_email_jobs%ROWTYPE;
  prior_request private.waitlist_email_resend_requests%ROWTYPE;
  request_outcome text := 'request_received';
  registration_found boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR length(btrim(p_email)) > 254 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;
  normalized := lower(btrim(p_email));

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request id is required' USING ERRCODE = '22023';
  END IF;

  -- Lock the matching registration first so parallel requests for this address
  -- serialize even before a legacy registration has a queue row.
  SELECT w.email, w.full_name INTO registered_email, registered_name
    FROM public.waitlist AS w
   WHERE lower(btrim(w.email)) = normalized
   LIMIT 1
   FOR UPDATE;
  registration_found := FOUND;

  -- Unknown addresses get the exact same returned shape, but create no stored
  -- rows. Only an address already registered can consume an email resend slot.
  IF NOT registration_found THEN
    RETURN QUERY SELECT 'request_received'::text, NULL::uuid, NULL::text, NULL::text,
      NULL::text, NULL::integer, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  INSERT INTO private.waitlist_email_resend_limits (normalized_email)
  VALUES (normalized)
  ON CONFLICT (normalized_email) DO NOTHING;
  SELECT l.* INTO limit_row
    FROM private.waitlist_email_resend_limits AS l
   WHERE l.normalized_email = normalized
   FOR UPDATE;

  -- Repeating the same request UUID returns the existing job/result without
  -- consuming another cooldown token or creating a second queue row.
  SELECT r.* INTO prior_request
    FROM private.waitlist_email_resend_requests AS r
   WHERE r.request_id = p_request_id;
  IF FOUND THEN
    IF prior_request.normalized_email <> normalized THEN
      RETURN QUERY SELECT 'request_received'::text, NULL::uuid, NULL::text, NULL::text,
        NULL::text, NULL::integer, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
    IF prior_request.job_id IS NOT NULL THEN
      SELECT j.* INTO selected_job FROM private.waitlist_email_jobs AS j WHERE j.job_id = prior_request.job_id;
    END IF;
    RETURN QUERY SELECT prior_request.outcome, selected_job.job_id, selected_job.email,
      selected_job.full_name, selected_job.status, selected_job.attempt_count,
      selected_job.idempotency_key, selected_job.created_at;
    RETURN;
  END IF;

  IF limit_row.last_requested_at > now() - interval '15 minutes'
     OR (limit_row.window_started_at > now() - interval '24 hours' AND limit_row.request_count >= 3) THEN
    INSERT INTO private.waitlist_email_resend_requests (request_id, normalized_email, outcome)
    VALUES (p_request_id, normalized, 'request_received') ON CONFLICT (request_id) DO NOTHING;
    RETURN QUERY SELECT 'request_received'::text, NULL::uuid, NULL::text, NULL::text,
      NULL::text, NULL::integer, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE private.waitlist_email_resend_limits AS l
     SET window_started_at = CASE WHEN l.window_started_at <= now() - interval '24 hours' THEN now() ELSE l.window_started_at END,
         request_count = CASE WHEN l.window_started_at <= now() - interval '24 hours' THEN 1 ELSE l.request_count + 1 END,
         last_requested_at = now()
   WHERE l.normalized_email = normalized;

  SELECT j.* INTO selected_job
    FROM private.waitlist_email_jobs AS j
   WHERE j.normalized_email = normalized
     AND j.status IN ('pending', 'processing', 'retryable', 'blocked')
   ORDER BY j.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF selected_job.status = 'blocked' AND p_sender_verified THEN
      UPDATE private.waitlist_email_jobs AS j
         SET status = 'pending', error_category = NULL, last_error_message = NULL,
             next_attempt_at = NULL, updated_at = now()
       WHERE j.job_id = selected_job.job_id
      RETURNING j.* INTO selected_job;
    ELSIF selected_job.status IN ('pending', 'retryable') AND NOT p_sender_verified THEN
      UPDATE private.waitlist_email_jobs AS j
         SET status = 'blocked', error_category = 'configuration_blocked',
             last_error_message = 'Sender domain is not verified; recovery is held until configuration is valid.',
             next_attempt_at = NULL, updated_at = now()
       WHERE j.job_id = selected_job.job_id
      RETURNING j.* INTO selected_job;
    END IF;
  ELSE
    INSERT INTO private.waitlist_email_jobs (
      email, normalized_email, full_name, status, error_category, last_error_message
    ) VALUES (
      registered_email, normalized, registered_name,
      CASE WHEN p_sender_verified THEN 'pending' ELSE 'blocked' END,
      CASE WHEN p_sender_verified THEN NULL ELSE 'configuration_blocked' END,
      CASE WHEN p_sender_verified THEN NULL ELSE 'Sender domain is not verified; recovery is held until configuration is valid.' END
    ) RETURNING * INTO selected_job;
  END IF;

  INSERT INTO private.waitlist_email_resend_requests (request_id, normalized_email, job_id, outcome)
  VALUES (p_request_id, normalized, selected_job.job_id, request_outcome)
  ON CONFLICT (request_id) DO NOTHING;

  RETURN QUERY SELECT request_outcome, selected_job.job_id, selected_job.email,
    selected_job.full_name, selected_job.status, selected_job.attempt_count,
    selected_job.idempotency_key, selected_job.created_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_waitlist(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_waitlist_email_resend(text, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_waitlist_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_waitlist(text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_waitlist_email_resend(text, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_waitlist_email(text) TO service_role;

COMMIT;
