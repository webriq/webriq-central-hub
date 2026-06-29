-- Migration 041: Schedule weekly Zoho tasklists sync via pg_cron + pg_net
--
-- pg_cron and pg_net must already be enabled (migration 012 enables them).
--
-- SETUP REQUIRED AFTER RUNNING THIS MIGRATION:
-- After deploying to Vercel, update the job URL + secret via the Supabase SQL editor:
--
--    select cron.alter_job(
--      (select jobid from cron.job where jobname = 'zoho-tasklists-sync'),
--      command := format(
--        $cmd$
--        select net.http_post(
--          url     := '%s/api/admin/zoho-sync/tasklists',
--          body    := '{}'::jsonb,
--          headers := '{"x-digest-secret":"%s","content-type":"application/json"}'::jsonb
--        )
--        $cmd$,
--        'https://YOUR_VERCEL_APP_URL',  -- replace with actual URL
--        'YOUR_DIGEST_SECRET'            -- matches DIGEST_SECRET env var
--      )
--    );
--
-- For local development, trigger the sync manually via:
--   POST /api/admin/zoho-sync/tasklists (with admin session)
-- pg_cron cannot reach localhost from Supabase cloud.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule weekly sync on Sundays at 02:00 UTC.
-- Placeholder URL — update via cron.alter_job() after deployment (see above).
select cron.schedule(
  'zoho-tasklists-sync',
  '0 2 * * 0',
  $job$
  select net.http_post(
    url     := 'https://REPLACE_WITH_APP_URL/api/admin/zoho-sync/tasklists',
    body    := '{}'::jsonb,
    headers := '{"x-digest-secret":"REPLACE_WITH_DIGEST_SECRET","content-type":"application/json"}'::jsonb
  )
  $job$
);
