-- Migration 077: Scheduled auto-start cron — read app URL + cron secret from Supabase Vault
--
-- Migration 060 registered the onboarding-scheduled-autostart cron job (every 15 min) with
-- literal placeholder values (REPLACE_WITH_APP_URL / REPLACE_WITH_DIGEST_SECRET), meant to be
-- swapped for the real deployed URL + secret post-deploy via cron.alter_job(). That swap was
-- never done — discovered live when a scheduled project's start time passed with nothing
-- happening. Rather than hardcoding the real values into a git-tracked migration (or an
-- untracked one-off SQL statement with no record of what changed), this job now looks up both
-- values from Supabase Vault by name at execution time — the actual URL/secret never appear in
-- this file, in `cron.job.command`, or anywhere in migration history.
--
-- Vault secret is named `cron_secret_key` (not `digest_secret`) — see migration 078, which
-- converts every other pre-existing cron job (digest, kb-lint, zoho sync, programme reminders)
-- to this same lookup and renames the underlying env var from DIGEST_SECRET to
-- CRONJOB_SECRET_KEY across all 5 routes. "Digest" stopped being an accurate name once 4 other
-- unrelated cron-triggered routes started sharing the same secret.
--
-- One-time manual setup required after this migration runs, via the Supabase SQL editor (NOT a
-- migration file — these calls carry real secret values):
--
--   select vault.create_secret('https://your-actual-deployed-url.vercel.app', 'app_base_url',
--     'Base URL used by every scheduled cron job in this app');
--   select vault.create_secret('YOUR_ACTUAL_CRONJOB_SECRET_KEY', 'cron_secret_key',
--     'Shared secret for cron-triggered API routes — matches the CRONJOB_SECRET_KEY env var');
--
-- Until both secrets exist, the job's net.http_post call resolves a null url/header and the
-- request harmlessly fails each run — same "does nothing until configured" behavior as the
-- placeholder had, just without a real secret ever touching version control. If either secret's
-- value changes later (e.g. redeploying to a new URL), update it in place with
-- vault.update_secret(id, new_secret) — the cron job's command never needs to change again.

create extension if not exists supabase_vault cascade;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'onboarding-scheduled-autostart') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'onboarding-scheduled-autostart'),
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/onboarding/scheduled-autostart',
          body    := '{}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  else
    perform cron.schedule(
      'onboarding-scheduled-autostart',
      '*/15 * * * *',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/onboarding/scheduled-autostart',
          body    := '{}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  end if;
end $$;
