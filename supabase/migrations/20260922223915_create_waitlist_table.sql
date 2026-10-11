-- Reconstructed locally from the live schema for the already-applied remote
-- migration version 20260922223915. No production table is recreated by this file.
BEGIN;

CREATE TABLE IF NOT EXISTS public.waitlist (
  created_at timestamptz NOT NULL DEFAULT now(),
  full_name text NOT NULL,
  email text NOT NULL,
  canva_experience text,
  main_goal text,
  stopped_reason text,
  payment_pref text,
  expected_cost text,
  status text DEFAULT 'pending'
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'waitlist'
       AND policyname = 'Allow public insert to waitlist'
  ) THEN
    CREATE POLICY "Allow public insert to waitlist"
      ON public.waitlist
      FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END;
$policy$;

CREATE INDEX IF NOT EXISTS idx_waitlist_created_at
  ON public.waitlist (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_email
  ON public.waitlist (email);

COMMIT;
