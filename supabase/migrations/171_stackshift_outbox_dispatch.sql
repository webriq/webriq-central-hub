-- Migration 171: StackShift outbox dispatch (task 446)
-- WRITTEN, NOT APPLIED — the operator applies it (after 169 + 170).
--
--   1. Delivery-tracking columns on stackshift_outbox (for the admin replay UI).
--   2. A unique guard so one staff message can never be enqueued twice.
--   3. An AFTER INSERT trigger on inbox_messages: a PUBLIC STAFF message on a channel='stackshift' ticket
--      writes its 'ticket.reply' outbox row in the SAME transaction (PostgREST cannot wrap two inserts, so
--      app code could save a reply and lose its event). Internal notes, customer comments and drafts never
--      match. Status events are enqueued from the staff status route instead (a trigger would also echo
--      customer-initiated status changes arriving through the inbound API back to StackShift).
--   4. The pg_cron job for /api/cron/stackshift-outbox (every minute; Vault pattern of migrations 122/148).
--
-- Rollback:
--   drop trigger if exists stackshift_enqueue_staff_reply on inbox_messages;
--   drop function if exists stackshift_enqueue_staff_reply();
--   drop index if exists stackshift_outbox_reply_message_key;
--   alter table stackshift_outbox drop column if exists sent_at, drop column if exists last_attempt_at,
--     drop column if exists last_status_code;
--   select cron.unschedule('stackshift-outbox-dispatch');

alter table stackshift_outbox
  add column if not exists sent_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_status_code integer;

create unique index if not exists stackshift_outbox_reply_message_key
  on stackshift_outbox ((payload -> 'data' ->> 'messageId'))
  where event_type = 'ticket.reply';

create or replace function stackshift_enqueue_staff_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel text;
  v_status  text;
  v_author  text;
begin
  if new.author_type <> 'staff' or new.visibility <> 'public' then
    return new;
  end if;

  select channel, status into v_channel, v_status from inbox where id = new.inbox_id;
  if v_channel is distinct from 'stackshift' then
    return new;
  end if;

  select full_name into v_author from profiles where id = new.author_id;

  insert into stackshift_outbox (ticket_id, event_type, payload)
  values (
    new.inbox_id,
    'ticket.reply',
    jsonb_build_object(
      'ticketStatus', v_status,
      'data', jsonb_build_object(
        'messageId',   new.id,
        'bodyHtml',    new.body,
        'authorName',  v_author,
        'createdAt',   new.created_at,
        'attachments', '[]'::jsonb
      )
    )
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists stackshift_enqueue_staff_reply on inbox_messages;
create trigger stackshift_enqueue_staff_reply
  after insert on inbox_messages
  for each row execute function stackshift_enqueue_staff_reply();

create extension if not exists supabase_vault cascade;
create extension if not exists pg_cron cascade;
create extension if not exists pg_net cascade;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'stackshift-outbox-dispatch') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'stackshift-outbox-dispatch'),
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/stackshift-outbox',
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
      'stackshift-outbox-dispatch',
      '* * * * *',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/stackshift-outbox',
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
