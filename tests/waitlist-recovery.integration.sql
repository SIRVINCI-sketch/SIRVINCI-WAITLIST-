-- Run against the linked database only as an isolated rollback-only test:
-- npx supabase db query --linked --file tests/waitlist-recovery.integration.sql
BEGIN;

-- Exercise the real anonymous insert grants and database trigger with synthetic
-- .invalid addresses. All test rows and queue mutations are rolled back below.
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.role = 'anon';
INSERT INTO public.waitlist (full_name, email)
VALUES
  ('Synthetic Recovery Test', 'waitlist-retry-test@example.invalid'),
  ('Synthetic Recovery Test', 'waitlist-blocked-test@example.invalid');
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $test$
DECLARE
  retry_job uuid;
  legacy_job uuid;
  blocked_job uuid;
  job_status text;
  claimed_count integer;
  job_rows integer;
  registration_rows integer;
BEGIN
  SELECT count(*) INTO registration_rows
    FROM public.waitlist
   WHERE lower(btrim(email)) IN (
     'waitlist-retry-test@example.invalid',
     'waitlist-blocked-test@example.invalid'
   );
  SELECT count(*) INTO job_rows
    FROM private.waitlist_email_jobs
   WHERE normalized_email IN (
     'waitlist-retry-test@example.invalid',
     'waitlist-blocked-test@example.invalid'
   );
  IF registration_rows <> 2 OR job_rows <> 2 THEN
    RAISE EXCEPTION 'anonymous insert or atomic outbox trigger failed';
  END IF;

  BEGIN
    INSERT INTO public.waitlist (full_name, email)
    VALUES ('Synthetic Duplicate', ' WAITLIST-RETRY-TEST@EXAMPLE.INVALID ');
    RAISE EXCEPTION 'normalized duplicate registration was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT e.job_id, e.status INTO retry_job, job_status
    FROM public.enqueue_waitlist_email(' WAITLIST-RETRY-TEST@EXAMPLE.INVALID ') AS e;
  IF job_status <> 'pending' THEN
    RAISE EXCEPTION 'idempotent enqueue did not return the pending job';
  END IF;

  SELECT count(*) INTO claimed_count
    FROM public.claim_waitlist_email_jobs(ARRAY[retry_job], false, 1);
  IF claimed_count <> 1 THEN
    RAISE EXCEPTION 'first worker failed to claim the due job';
  END IF;
  SELECT count(*) INTO claimed_count
    FROM public.claim_waitlist_email_jobs(ARRAY[retry_job], false, 1);
  IF claimed_count <> 0 THEN
    RAISE EXCEPTION 'processing job was claimed a second time';
  END IF;

  PERFORM public.complete_waitlist_email_job(retry_job, 'retryable', NULL, 'temporary_provider_error', 'synthetic temporary failure', 30);
  UPDATE private.waitlist_email_jobs SET next_attempt_at = now() - interval '1 minute' WHERE job_id = retry_job;
  SELECT count(*) INTO claimed_count
    FROM public.claim_waitlist_email_jobs(ARRAY[retry_job], false, 1);
  IF claimed_count <> 1 THEN
    RAISE EXCEPTION 'due retry was not reclaimable';
  END IF;
  SELECT j.status INTO job_status FROM private.waitlist_email_jobs AS j WHERE j.job_id = retry_job;
  IF job_status <> 'processing' THEN
    RAISE EXCEPTION 'retry job was not marked processing';
  END IF;
  PERFORM public.complete_waitlist_email_job(retry_job, 'accepted', 'synthetic-provider-id', NULL, NULL, NULL);

  SELECT e.status INTO job_status
    FROM public.enqueue_waitlist_email('waitlist-retry-test@example.invalid') AS e;
  IF job_status <> 'accepted' THEN
    RAISE EXCEPTION 'duplicate enqueue did not preserve accepted state';
  END IF;
  SELECT count(*) INTO job_rows FROM private.waitlist_email_jobs WHERE normalized_email = 'waitlist-retry-test@example.invalid';
  IF job_rows <> 1 THEN
    RAISE EXCEPTION 'duplicate enqueue created another durable job';
  END IF;

  -- Simulate a pre-outbox registration with unknowable prior email delivery.
  DELETE FROM private.waitlist_email_jobs WHERE job_id = retry_job;
  SELECT e.job_id, e.status INTO legacy_job, job_status
    FROM public.enqueue_waitlist_email('waitlist-retry-test@example.invalid') AS e;
  IF job_status <> 'uncertain' THEN
    RAISE EXCEPTION 'legacy registration was incorrectly assumed safe to resend';
  END IF;
  SELECT count(*) INTO claimed_count
    FROM public.claim_waitlist_email_jobs(ARRAY[legacy_job], true, 1);
  IF claimed_count <> 0 THEN
    RAISE EXCEPTION 'legacy unknown delivery was automatically resent';
  END IF;

  SELECT job_id INTO blocked_job
    FROM private.waitlist_email_jobs
   WHERE normalized_email = 'waitlist-blocked-test@example.invalid';
  PERFORM public.block_waitlist_email_job(blocked_job, 'synthetic sender configuration failure');
  UPDATE private.waitlist_email_jobs SET updated_at = now() - interval '2 hours' WHERE job_id = blocked_job;
  SELECT count(*) INTO claimed_count
    FROM public.claim_waitlist_email_jobs(ARRAY[blocked_job], true, 10);
  IF claimed_count <> 1 THEN
    RAISE EXCEPTION 'eligible blocked job was not bulk-recoverable';
  END IF;
  PERFORM public.complete_waitlist_email_job(blocked_job, 'accepted', 'synthetic-provider-id-2', NULL, NULL, NULL);

  SELECT count(*) INTO job_rows
    FROM private.waitlist_email_jobs
   WHERE normalized_email IN (
     'waitlist-retry-test@example.invalid',
     'waitlist-blocked-test@example.invalid'
   ) AND status = 'accepted';
  IF job_rows <> 1 THEN
    RAISE EXCEPTION 'bulk recovery did not complete the synthetic blocked job';
  END IF;
  SELECT count(*) INTO job_rows
    FROM private.waitlist_email_jobs
   WHERE normalized_email = 'waitlist-retry-test@example.invalid'
     AND status = 'uncertain'
     AND error_category = 'legacy_delivery_unknown';
  IF job_rows <> 1 THEN
    RAISE EXCEPTION 'unknown historical delivery state was not preserved';
  END IF;

  SELECT count(*) INTO registration_rows
    FROM public.waitlist
   WHERE lower(btrim(email)) IN (
     'waitlist-retry-test@example.invalid',
     'waitlist-blocked-test@example.invalid'
   );
  IF registration_rows <> 2 THEN
    RAISE EXCEPTION 'email state transition changed saved registrations';
  END IF;
END;
$test$;

ROLLBACK;
