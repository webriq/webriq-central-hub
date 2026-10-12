-- STEP 3 of the Desk step-down runbook: lower the Zoho Desk StackShift poll cadence (task 450, stage 5)
-- MANUAL SCRIPT — deliberately NOT in supabase/migrations/ (see ./README.md): run it yourself in the SQL editor.
-- Apply ONLY after: (1) the parity gate is signed off, (2) the Desk poll has run in
-- reconcile mode (STACKSHIFT_DESK_RECONCILE_ENABLED=true) for an observation window with no unexplained misses.
--
-- Guarded: refuses to run unless a non-revoked parity sign-off exists (task 449). Changes ONLY the schedule of
-- the existing 'stackshift-desk-ticket-poll' job (every 10 min -> hourly); the job's command is untouched.
--
-- Rollback (restore the original cadence):
--   select cron.alter_job((select jobid from cron.job where jobname = 'stackshift-desk-ticket-poll'), schedule := '*/10 * * * *');

do $$
begin
  if not exists (select 1 from stackshift_parity_signoff where revoked_at is null) then
    raise exception 'Refusing to step down: no active StackShift parity sign-off (task 449).';
  end if;

  if not exists (select 1 from cron.job where jobname = 'stackshift-desk-ticket-poll') then
    raise exception 'The stackshift-desk-ticket-poll job does not exist; nothing to change.';
  end if;

  perform cron.alter_job(
    (select jobid from cron.job where jobname = 'stackshift-desk-ticket-poll'),
    schedule := '0 * * * *'
  );
end $$;
