-- Migration 122: Zoho Mail-based ticketing (task 318) — replaces Resend as the email
-- provider behind tasks 303 (inbound) and 316 (outbound reply). Adds:
--
--   1. tickets.zoho_mail_thread_id (unique, partial) — Zoho Mail's own threadId groups a full
--      email conversation server-side, so thread-matching an inbound reply no longer needs to
--      parse In-Reply-To/References headers the way the Resend-based design did. Unique so
--      concurrent/overlapping poll runs can't create two tickets for the same thread.
--   2. email_poll_cursor — a single-row table tracking the last successfully processed Zoho
--      Mail message's receivedTime, so the polling cron (replacing Resend's inbound webhook)
--      knows where to resume on the next run.
--   3. Registers the 'ticket-email-poll' pg_cron job against the existing Vault-based
--      app_base_url/cron_secret_key secrets (same pattern as migration 078).

alter table tickets add column if not exists zoho_mail_thread_id text;
-- UNIQUE (not a plain index) for the same reason migration 119 made
-- ticket_messages.email_message_id unique: without it, two overlapping poll invocations
-- (e.g. a slow Zoho API response causing the next cron tick to overlap the previous run)
-- could both see "no ticket for this threadId" and both insert, splitting one email
-- conversation across two tickets. The unique constraint turns the second insert into a
-- clean, catchable conflict instead — the poll route's per-message try/catch logs it and
-- retries the message on the next run, at which point it correctly finds the ticket the
-- other invocation already created.
create unique index if not exists idx_tickets_zoho_mail_thread_id_unique
  on tickets (zoho_mail_thread_id)
  where zoho_mail_thread_id is not null;

create table if not exists email_poll_cursor (
  id text primary key default 'helpdesk',
  last_received_time text,
  updated_at timestamptz not null default now()
);

-- Cursor starts null, meaning the first poll run backfills up to the most recent 50 messages
-- already sitting in the inbox (see listNewMessages in src/lib/zoho/mail.ts) as brand-new
-- tickets — including old mail Zoho Desk may have already ticketed. If that backfill is
-- unwanted, seed last_received_time to the current epoch-ms (as text) before the first poll
-- runs, e.g.: update email_poll_cursor set last_received_time = (extract(epoch from now()) *
-- 1000)::text where id = 'helpdesk'; — same one-time cutover care as task 303's Open Decision 4.
insert into email_poll_cursor (id, last_received_time)
values ('helpdesk', null)
on conflict (id) do nothing;

alter table email_poll_cursor enable row level security;

create policy "email_poll_cursor_staff_all" on email_poll_cursor for all to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

create extension if not exists supabase_vault cascade;
create extension if not exists pg_cron cascade;
create extension if not exists pg_net cascade;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ticket-email-poll') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'ticket-email-poll'),
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/email-poll',
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
      'ticket-email-poll',
      '*/5 * * * *',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/email-poll',
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
