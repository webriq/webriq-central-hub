-- Migration 172: StackShift Support Center read stats (task 448)
-- WRITTEN, NOT APPLIED — the operator applies it (after 169-171).
--
--   1. stackshift_ticket_message_stats(): per-ticket count + latest timestamp of the messages the Support
--      Center may see (public, customer/staff authored) for a page of tickets in ONE call, so the list
--      endpoint's `messageCount` / `lastMessageAt` never need whole threads fetched. SECURITY INVOKER: it is
--      only called from the service-role client, and gains no privileges.
--   2. A partial index for the list query: direct tickets of a site, newest first (keyset on created_at, id).
--
-- Rollback:
--   drop function if exists stackshift_ticket_message_stats(uuid[]);
--   drop index if exists inbox_stackshift_site_created_idx;

create or replace function stackshift_ticket_message_stats(p_ticket_ids uuid[])
returns table (ticket_id uuid, message_count bigint, last_message_at timestamptz)
language sql
stable
as $$
  select m.inbox_id, count(*), max(m.created_at)
  from inbox_messages m
  where m.inbox_id = any(p_ticket_ids)
    and m.visibility = 'public'
    and m.author_type in ('client', 'staff')
  group by m.inbox_id
$$;

create index if not exists inbox_stackshift_site_created_idx
  on inbox (stackshift_site, created_at desc, id desc)
  where channel = 'stackshift';
