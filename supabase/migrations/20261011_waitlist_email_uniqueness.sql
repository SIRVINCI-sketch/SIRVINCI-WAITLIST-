BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.waitlist_duplicate_backup_20261011 (
  created_at timestamptz,
  full_name text,
  email text,
  canva_experience text,
  main_goal text,
  stopped_reason text,
  payment_pref text,
  expected_cost text,
  status text,
  backup_collected_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO private.waitlist_duplicate_backup_20261011 (
  created_at,
  full_name,
  email,
  canva_experience,
  main_goal,
  stopped_reason,
  payment_pref,
  expected_cost,
  status,
  backup_collected_at
)
SELECT
  w.created_at,
  w.full_name,
  w.email,
  w.canva_experience,
  w.main_goal,
  w.stopped_reason,
  w.payment_pref,
  w.expected_cost,
  w.status,
  now()
FROM public.waitlist AS w
WHERE lower(btrim(w.email)) IN (
  SELECT lower(btrim(email))
  FROM public.waitlist
  GROUP BY lower(btrim(email))
  HAVING count(*) > 1
)
AND ctid IN (
  SELECT ctid
  FROM (
    SELECT
      ctid,
      ROW_NUMBER() OVER (
        PARTITION BY lower(btrim(email))
        ORDER BY created_at ASC, ctid ASC
      ) AS row_num
    FROM public.waitlist
  ) AS ranked
  WHERE row_num > 1
);

DELETE FROM public.waitlist
WHERE ctid IN (
  SELECT ctid
  FROM (
    SELECT
      ctid,
      ROW_NUMBER() OVER (
        PARTITION BY lower(btrim(email))
        ORDER BY created_at ASC, ctid ASC
      ) AS row_num
    FROM public.waitlist
  ) AS ranked
  WHERE row_num > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_normalized_unique
  ON public.waitlist (lower(btrim(email)));

ALTER TABLE private.waitlist_duplicate_backup_20261011 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA private FROM public;
REVOKE ALL ON TABLE private.waitlist_duplicate_backup_20261011 FROM public, anon, authenticated;

COMMIT;
