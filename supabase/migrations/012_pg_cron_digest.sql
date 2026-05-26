-- Migration 012: Enable pg_cron + pg_net for daily digest scheduling (Sprint 3, M4)
--
-- SETUP REQUIRED AFTER RUNNING THIS MIGRATION:
-- 1. Enable these extensions in Supabase Dashboard → Database → Extensions if not already active.
-- 2. After deploying your app to Vercel, update the cron job URL via the Supabase SQL editor:
--
--    select cron.alter_job(
--      (select jobid from cron.job where jobname = 'daily-pm-digest'),
--      command := format(
--        $cmd$
--        select net.http_post(
--          url     := '%s/api/digest',
--          body    := '{"type":"pm"}'::jsonb,
--          headers := '{"x-digest-secret":"%s","content-type":"application/json"}'::jsonb
--        )
--        $cmd$,
--        'https://YOUR_VERCEL_APP_URL',  -- replace with actual URL
--        'YOUR_DIGEST_SECRET'            -- matches DIGEST_SECRET env var
--      )
--    );
--
-- 3. For local development, use the "Trigger Digest" button on the PM home page.
--    pg_cron cannot reach localhost from Supabase cloud.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule daily PM digest at 08:00 UTC.
-- The URL below is a placeholder — update it via cron.alter_job() after deployment (see above).
select cron.schedule(
  'daily-pm-digest',
  '0 8 * * *',
  $job$
  select net.http_post(
    url     := 'https://REPLACE_WITH_APP_URL/api/digest',
    body    := '{"type":"pm"}'::jsonb,
    headers := '{"x-digest-secret":"REPLACE_WITH_DIGEST_SECRET","content-type":"application/json"}'::jsonb
  )
  $job$
);
