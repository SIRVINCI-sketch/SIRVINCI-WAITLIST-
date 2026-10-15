BEGIN;
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS country_of_residence text,
  ADD COLUMN IF NOT EXISTS expected_cost_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS expected_cost_currency text,
  ADD COLUMN IF NOT EXISTS pricing_unsure boolean NOT NULL DEFAULT false;
DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_expected_cost_amount_positive') THEN
    ALTER TABLE public.waitlist ADD CONSTRAINT waitlist_expected_cost_amount_positive CHECK (expected_cost_amount IS NULL OR expected_cost_amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_expected_cost_currency_code') THEN
    ALTER TABLE public.waitlist ADD CONSTRAINT waitlist_expected_cost_currency_code CHECK (expected_cost_currency IS NULL OR expected_cost_currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_expected_cost_pair_valid') THEN
    ALTER TABLE public.waitlist ADD CONSTRAINT waitlist_expected_cost_pair_valid CHECK (
      (expected_cost_amount IS NULL AND expected_cost_currency IS NULL)
      OR (expected_cost_amount > 0 AND expected_cost_currency ~ '^[A-Z]{3}$')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_pricing_unsure_has_no_amount') THEN
    ALTER TABLE public.waitlist ADD CONSTRAINT waitlist_pricing_unsure_has_no_amount CHECK (
      NOT pricing_unsure OR (expected_cost_amount IS NULL AND expected_cost_currency IS NULL)
    );
  END IF;
END;
$constraints$;
DROP FUNCTION IF EXISTS public.register_waitlist(text, text, text, text, text, text, text);
CREATE FUNCTION public.register_waitlist(
  p_full_name text, p_email text,
  p_canva_experience text DEFAULT NULL::text,
  p_main_goal text DEFAULT NULL::text,
  p_stopped_reason text DEFAULT NULL::text,
  p_payment_pref text DEFAULT NULL::text,
  p_expected_cost text DEFAULT NULL::text,
  p_country_of_residence text DEFAULT NULL::text,
  p_expected_cost_amount numeric DEFAULT NULL::numeric,
  p_expected_cost_currency text DEFAULT NULL::text,
  p_pricing_unsure boolean DEFAULT false
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  did_insert boolean := false;
  inserted_email text;
  inserted_name text;
  structured_pricing boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(p_full_name), '') IS NULL OR length(btrim(p_full_name)) > 120 THEN
    RAISE EXCEPTION 'invalid registration' USING ERRCODE = '22023';
  END IF;
  IF p_email IS NULL OR length(btrim(p_email)) > 254 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid registration' USING ERRCODE = '22023';
  END IF;
  structured_pricing := p_country_of_residence IS NOT NULL OR p_expected_cost_amount IS NOT NULL
    OR p_expected_cost_currency IS NOT NULL OR coalesce(p_pricing_unsure, false);
  IF structured_pricing THEN
    IF nullif(btrim(p_country_of_residence), '') IS NULL OR length(btrim(p_country_of_residence)) > 100 THEN
      RAISE EXCEPTION 'country of residence is required' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p_pricing_unsure, false) THEN
      IF p_expected_cost_amount IS NOT NULL OR nullif(btrim(p_expected_cost_currency), '') IS NOT NULL THEN
        RAISE EXCEPTION 'unsure pricing response cannot include an amount or currency' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF p_expected_cost_amount IS NULL OR p_expected_cost_amount <= 0 OR p_expected_cost_currency IS NULL
         OR upper(btrim(p_expected_cost_currency)) !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'a valid amount and currency are required' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;
  INSERT INTO public.waitlist (
    full_name, email, canva_experience, main_goal, stopped_reason, payment_pref, expected_cost,
    country_of_residence, expected_cost_amount, expected_cost_currency, pricing_unsure
  ) VALUES (
    btrim(p_full_name), lower(btrim(p_email)),
    nullif(btrim(p_canva_experience), ''), nullif(btrim(p_main_goal), ''),
    nullif(btrim(p_stopped_reason), ''), nullif(btrim(p_payment_pref), ''),
    nullif(btrim(p_expected_cost), ''), nullif(btrim(p_country_of_residence), ''),
    p_expected_cost_amount,
    CASE WHEN p_pricing_unsure THEN NULL ELSE nullif(upper(btrim(p_expected_cost_currency)), '') END,
    coalesce(p_pricing_unsure, false)
  ) ON CONFLICT DO NOTHING
  RETURNING email, full_name INTO inserted_email, inserted_name;
  did_insert := FOUND;
  IF did_insert THEN
    INSERT INTO private.waitlist_email_jobs (email, normalized_email, full_name, status)
    VALUES (inserted_email, lower(btrim(inserted_email)), inserted_name, 'pending');
  END IF;
  RETURN 'received';
END;
$function$;
REVOKE ALL ON FUNCTION public.register_waitlist(text, text, text, text, text, text, text, text, numeric, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_waitlist(text, text, text, text, text, text, text, text, numeric, text, boolean) TO service_role;
COMMIT;
