-- STEP 6 of the Desk step-down runbook: unschedule the Zoho Desk StackShift poll (task 450, stage 6)
-- MANUAL SCRIPT — deliberately NOT in supabase/migrations/ (see ./README.md): run it yourself in the SQL editor.
-- Apply ONLY after step-3_lower-desk-poll-cadence.sql has been in place for a further observed window.
--
-- Guards (the script aborts unless all hold):
--   1. a non-revoked parity sign-off exists (task 449);
--   2. no IN-FLIGHT Desk-only StackShift tickets remain — open Desk-polled rows that are not retired and have no
--      direct copy still rely on this poll to sync (design D5). Override deliberately, for a ticket you accept
--      losing sync on, with:   set local app.stackshift_force_unschedule = 'on';   in the same transaction.
-- Unscheduling does NOT delete data, change tickets, or touch the Mail poll or any other cron job.
--
-- Rollback (re-register the job exactly as migration 148 did):
--   select cron.schedule('stackshift-desk-ticket-poll', '*/10 * * * *', $cmd$
--     select net.http_post(
--       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/desk-ticket-poll',
--       body    := '{}'::jsonb,
--       headers := jsonb_build_object(
--         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
--         'content-type', 'application/json')) $cmd$);

do $$
declare
  v_inflight integer;
begin
  if not exists (select 1 from stackshift_parity_signoff where revoked_at is null) then
    raise exception 'Refusing to step down: no active StackShift parity sign-off (task 449).';
  end if;

  select count(*) into v_inflight
  from inbox i
  where i.source_meta ->> 'source' = 'stackshift-desk-poll'
    and i.status <> 'closed'
    and not (i.source_meta ? 'retiredInto')
    and not exists (
      select 1 from inbox d where d.channel = 'stackshift' and d.desk_ticket_id = i.external_id
    );

  if v_inflight > 0 and coalesce(current_setting('app.stackshift_force_unschedule', true), '') <> 'on' then
    raise exception 'Refusing to unschedule: % in-flight Desk-only StackShift ticket(s) still rely on the poll. Close them, or set local app.stackshift_force_unschedule = ''on'' to accept losing their sync.', v_inflight;
  end if;

  if exists (select 1 from cron.job where jobname = 'stackshift-desk-ticket-poll') then
    perform cron.unschedule('stackshift-desk-ticket-poll');
  end if;
end $$;
