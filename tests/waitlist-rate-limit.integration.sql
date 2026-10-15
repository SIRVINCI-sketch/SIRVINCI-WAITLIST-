-- Rollback-only integration checks for waitlist IDs and IP quotas.
-- Safe to run against the linked project; test rate-limit rows are rolled back.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  i integer;
  check_result record;
  primary_key_exists boolean;
  rls_enabled boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.waitlist'::regclass AND contype = 'p'
  ) INTO primary_key_exists;
  IF NOT primary_key_exists THEN
    RAISE EXCEPTION 'public.waitlist is missing a primary key';
  END IF;

  SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
   WHERE oid = 'private.waitlist_ip_rate_limits'::regclass;
  IF rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'IP rate-limit table must have row-level security enabled';
  END IF;

  -- Exactly 15 requests are allowed in the first minute; request 16 is blocked.
  FOR i IN 1..16 LOOP
    SELECT * INTO check_result
      FROM public.consume_waitlist_ip_rate_limit(repeat('c', 64));
    IF i <= 15 AND check_result.allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'IP minute bucket blocked too early at request %', i;
    END IF;
    IF i = 16 AND (check_result.allowed IS DISTINCT FROM false OR check_result.reason <> 'minute_limit') THEN
      RAISE EXCEPTION 'IP minute bucket did not block request 16';
    END IF;
  END LOOP;

  INSERT INTO private.waitlist_ip_rate_limits
    (ip_hash, minute_started_at, minute_count, hour_started_at, hour_count, day_started_at, day_count, updated_at)
  VALUES
    (repeat('d',64), clock_timestamp(), 15, clock_timestamp(), 0, clock_timestamp(), 0, clock_timestamp()),
    (repeat('e',64), clock_timestamp() - interval '2 minutes', 0, clock_timestamp(), 60, clock_timestamp(), 0, clock_timestamp()),
    (repeat('f',64), clock_timestamp() - interval '2 minutes', 0, clock_timestamp() - interval '2 hours', 0, clock_timestamp(), 200, clock_timestamp());

  SELECT * INTO check_result FROM public.consume_waitlist_ip_rate_limit(repeat('d',64));
  IF check_result.allowed OR check_result.reason <> 'minute_limit' THEN
    RAISE EXCEPTION 'Minute threshold test failed';
  END IF;

  SELECT * INTO check_result FROM public.consume_waitlist_ip_rate_limit(repeat('e',64));
  IF check_result.allowed OR check_result.reason <> 'hour_limit' THEN
    RAISE EXCEPTION 'Hour threshold test failed';
  END IF;

  SELECT * INTO check_result FROM public.consume_waitlist_ip_rate_limit(repeat('f',64));
  IF check_result.allowed OR check_result.reason <> 'daily_limit' THEN
    RAISE EXCEPTION 'Daily threshold test failed';
  END IF;
END
$$;
ROLLBACK;
