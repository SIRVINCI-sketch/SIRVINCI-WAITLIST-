-- Add a stable identifier without changing existing waitlist fields or endpoint payloads.
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE public.waitlist
   SET id = gen_random_uuid()
 WHERE id IS NULL;

ALTER TABLE public.waitlist
  ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.waitlist'::regclass
       AND contype = 'p'
  ) THEN
    ALTER TABLE public.waitlist
      ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);
  END IF;
END
$$;

-- The Edge Function sends only a keyed hash; never persist raw IP addresses.
CREATE TABLE IF NOT EXISTS private.waitlist_ip_rate_limits (
  ip_hash text PRIMARY KEY CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  minute_started_at timestamptz NOT NULL DEFAULT now(),
  minute_count integer NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
  hour_started_at timestamptz NOT NULL DEFAULT now(),
  hour_count integer NOT NULL DEFAULT 0 CHECK (hour_count >= 0),
  day_started_at timestamptz NOT NULL DEFAULT now(),
  day_count integer NOT NULL DEFAULT 0 CHECK (day_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_ip_rate_limits_updated_at
  ON private.waitlist_ip_rate_limits (updated_at);

ALTER TABLE private.waitlist_ip_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.waitlist_ip_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.waitlist_ip_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_waitlist_ip_rate_limit(p_ip_hash text)
RETURNS TABLE(allowed boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  limit_row private.waitlist_ip_rate_limits%ROWTYPE;
  now_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid rate-limit key' USING ERRCODE = '22023';
  END IF;

  INSERT INTO private.waitlist_ip_rate_limits (ip_hash)
  VALUES (p_ip_hash)
  ON CONFLICT (ip_hash) DO NOTHING;

  SELECT limits.* INTO limit_row
    FROM private.waitlist_ip_rate_limits AS limits
   WHERE limits.ip_hash = p_ip_hash
   FOR UPDATE;

  -- Use wall-clock time after acquiring the row lock so concurrent callers
  -- evaluate their windows against the time they actually obtain the lock.
  now_at := clock_timestamp();

  IF limit_row.minute_started_at > now_at - interval '1 minute'
     AND limit_row.minute_count >= 15 THEN
    UPDATE private.waitlist_ip_rate_limits
       SET updated_at = now_at
     WHERE ip_hash = p_ip_hash;
    RETURN QUERY SELECT false, 'minute_limit'::text;
    RETURN;
  END IF;

  IF limit_row.hour_started_at > now_at - interval '1 hour'
     AND limit_row.hour_count >= 60 THEN
    UPDATE private.waitlist_ip_rate_limits
       SET updated_at = now_at
     WHERE ip_hash = p_ip_hash;
    RETURN QUERY SELECT false, 'hour_limit'::text;
    RETURN;
  END IF;

  IF limit_row.day_started_at > now_at - interval '24 hours'
     AND limit_row.day_count >= 200 THEN
    UPDATE private.waitlist_ip_rate_limits
       SET updated_at = now_at
     WHERE ip_hash = p_ip_hash;
    RETURN QUERY SELECT false, 'daily_limit'::text;
    RETURN;
  END IF;

  UPDATE private.waitlist_ip_rate_limits AS limits
     SET minute_started_at = CASE
           WHEN limits.minute_started_at <= now_at - interval '1 minute' THEN now_at
           ELSE limits.minute_started_at
         END,
         minute_count = CASE
           WHEN limits.minute_started_at <= now_at - interval '1 minute' THEN 1
           ELSE limits.minute_count + 1
         END,
         hour_started_at = CASE
           WHEN limits.hour_started_at <= now_at - interval '1 hour' THEN now_at
           ELSE limits.hour_started_at
         END,
         hour_count = CASE
           WHEN limits.hour_started_at <= now_at - interval '1 hour' THEN 1
           ELSE limits.hour_count + 1
         END,
         day_started_at = CASE
           WHEN limits.day_started_at <= now_at - interval '24 hours' THEN now_at
           ELSE limits.day_started_at
         END,
         day_count = CASE
           WHEN limits.day_started_at <= now_at - interval '24 hours' THEN 1
           ELSE limits.day_count + 1
         END,
         updated_at = now_at
   WHERE limits.ip_hash = p_ip_hash;

  RETURN QUERY SELECT true, 'allowed'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_waitlist_ip_rate_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_waitlist_ip_rate_limit(text) TO service_role;

CREATE OR REPLACE FUNCTION private.cleanup_waitlist_ip_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM private.waitlist_ip_rate_limits
   WHERE updated_at < clock_timestamp() - interval '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

REVOKE ALL ON FUNCTION private.cleanup_waitlist_ip_rate_limits() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cleanup_waitlist_ip_rate_limits() TO postgres;

DO $schedule$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = 'sirvinci-waitlist-ip-rate-limit-cleanup'
  ) THEN
    PERFORM cron.schedule(
      'sirvinci-waitlist-ip-rate-limit-cleanup',
      '17 3 * * *',
      'select private.cleanup_waitlist_ip_rate_limits();'
    );
  END IF;
END;
$schedule$;
