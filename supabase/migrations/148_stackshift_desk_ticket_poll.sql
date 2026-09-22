-- Migration 148: StackShift Desk ticket live poll (task 388)
--
-- StackShift's Support Center (a separate app) creates tickets directly in Zoho Desk, tagged
-- cf.cf_stack_shift_site — Central Hub only ever captured these via a one-time/manual import
-- (desk-tickets-import.ts). This migration supports the new live poll
-- (src/app/api/cron/desk-ticket-poll/route.ts) that closes that gap going forward:
--
--   1. Seeds a second email_poll_cursor row ('stackshift-desk') — reusing that table rather
--      than adding a new one, since `id` is a free-text primary key and the column is just a
--      text cursor value. Seeded to "now" (not null) so the first run doesn't re-ingest every
--      historical StackShift ticket the existing import already captured — same null-start
--      caveat migration 122 documents for the email cursor.
--   2. Widens inbox.channel's check constraint to add 'api' — the existing values
--      (portal | email | manual) have nothing that fits "created via Desk API by StackShift",
--      and channel renders as plain capitalized text on the ticket detail page
--      (_ticket-detail.tsx) — 'manual' there would visibly mislead staff into thinking a human
--      typed the ticket in by hand. Constraint name (`inbox_channel_check`) confirmed via
--      migration 147 Part 4's dynamic rename sweep (tickets_channel_check -> inbox_channel_check).
--   3. Registers the 'stackshift-desk-ticket-poll' pg_cron job, same Vault-secret pattern as
--      migration 122's 'ticket-email-poll' job. Every 10 minutes — StackShift tickets are
--      lower-volume/less time-sensitive than the primary support inbox.

insert into email_poll_cursor (id, last_received_time)
values ('stackshift-desk', (extract(epoch from now()) * 1000)::bigint::text)
on conflict (id) do nothing;

alter table inbox drop constraint inbox_channel_check;

alter table inbox
  add constraint inbox_channel_check
  check (channel in ('portal', 'email', 'manual', 'api'));

create extension if not exists supabase_vault cascade;
create extension if not exists pg_cron cascade;
create extension if not exists pg_net cascade;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'stackshift-desk-ticket-poll') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'stackshift-desk-ticket-poll'),
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/desk-ticket-poll',
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
      'stackshift-desk-ticket-poll',
      '*/10 * * * *',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/desk-ticket-poll',
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
