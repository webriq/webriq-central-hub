-- Migration 079: onboarding-scheduled-autostart — tighten interval from 15 to 5 minutes
--
-- Cron ticks, it doesn't fire at the exact scheduled second — a project scheduled for 2:02 PM
-- only actually starts on the job's next run. At */15 that's up to a 15-minute lag; at */5 it's
-- up to 5. Not exact-to-the-second (no polling interval can be, short of a per-project one-shot
-- job), but tighter. Only this job's schedule changes — the other 4 (daily-pm-digest,
-- weekly-wiki-lint, zoho-tasklists-sync, daily-programme-reminders) are correctly daily/weekly
-- and untouched. The command (Vault-based URL/secret lookup, migration 077) is unchanged.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'onboarding-scheduled-autostart') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'onboarding-scheduled-autostart'),
      schedule := '*/5 * * * *'
    );
  end if;
end $$;
