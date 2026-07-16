-- Migration 078: Every other pre-existing cron job — read app URL + cron secret from Vault
--
-- Same discovery and fix as migration 077, extended to the 4 cron jobs that predate it:
-- daily-pm-digest (012), weekly-wiki-lint (017), zoho-tasklists-sync (041), and
-- daily-programme-reminders (059). Every one of them was registered with the identical
-- REPLACE_WITH_APP_URL / REPLACE_WITH_DIGEST_SECRET placeholder pattern, and nothing in this
-- migration history ever swaps it for real values — so as far as this repo can tell, none of
-- these 5 scheduled jobs (including onboarding-scheduled-autostart) have ever actually fired
-- successfully in production.
--
-- Converts all 4 to the same Vault-based lookup migration 077 introduced (`app_base_url`,
-- `cron_secret_key`) — one Vault secret pair now covers every scheduled cron job in the app,
-- and real values never need to appear in a migration file again. Also completes the rename of
-- the underlying env var every affected route reads from DIGEST_SECRET to CRONJOB_SECRET_KEY
-- (application code updated alongside this migration) and the request header from
-- x-digest-secret to x-cron-secret — "digest" was never an accurate name once 4 unrelated
-- routes started sharing the same secret.
--
-- Requires the same one-time manual step as migration 077 (Supabase SQL editor, not tracked in
-- git) — if you already ran migration 077's setup, nothing further is needed; both migrations
-- read the same two Vault secrets:
--
--   select vault.create_secret('https://your-actual-deployed-url.vercel.app', 'app_base_url', ...);
--   select vault.create_secret('YOUR_ACTUAL_CRONJOB_SECRET_KEY', 'cron_secret_key', ...);

create extension if not exists supabase_vault cascade;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-pm-digest') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'daily-pm-digest'),
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/digest',
          body    := '{"type":"pm"}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  else
    perform cron.schedule(
      'daily-pm-digest',
      '0 8 * * *',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/digest',
          body    := '{"type":"pm"}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  end if;

  if exists (select 1 from cron.job where jobname = 'weekly-wiki-lint') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'weekly-wiki-lint'),
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/kb/lint',
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
      'weekly-wiki-lint',
      '0 6 * * 1',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/kb/lint',
          body    := '{}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  end if;

  if exists (select 1 from cron.job where jobname = 'zoho-tasklists-sync') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'zoho-tasklists-sync'),
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/admin/zoho-sync/tasklists',
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
      'zoho-tasklists-sync',
      '0 2 * * 0',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/admin/zoho-sync/tasklists',
          body    := '{}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  end if;

  if exists (select 1 from cron.job where jobname = 'daily-programme-reminders') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'daily-programme-reminders'),
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/programme/reminders',
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
      'daily-programme-reminders',
      '0 9 * * *',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/programme/reminders',
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
