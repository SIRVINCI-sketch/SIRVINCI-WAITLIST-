CREATE OR REPLACE FUNCTION public.register_waitlist(
  p_full_name text,
  p_email text,
  p_canva_experience text DEFAULT NULL::text,
  p_main_goal text DEFAULT NULL::text,
  p_stopped_reason text DEFAULT NULL::text,
  p_payment_pref text DEFAULT NULL::text,
  p_expected_cost text DEFAULT NULL::text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  did_insert boolean := false;
  inserted_email text;
  inserted_name text;
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
  ) ON CONFLICT DO NOTHING
  RETURNING email, full_name INTO inserted_email, inserted_name;

  did_insert := FOUND;

  -- Create the outbox job transactionally for new registrations. Existing
  -- registrations without delivery history are handled by the guarded resend
  -- path rather than being assumed delivered or blindly re-sent.
  IF did_insert THEN
    INSERT INTO private.waitlist_email_jobs (
      email, normalized_email, full_name, status
    ) VALUES (
      inserted_email, lower(btrim(inserted_email)), inserted_name, 'pending'
    );
  END IF;

  RETURN 'received';
END;
$function$;
