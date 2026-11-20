-- Migration 186: Desk Inbox unread indicator (task 490)
--
-- Shared, team-wide read state on each inbox thread (D1): opening a thread clears it for everyone.
-- Only customer messages (inbox_messages.author_type = 'client') count as new (D2). Counting is done by an
-- AFTER INSERT trigger so every ingest path (email-poll, Desk poll / message sync, StackShift inbound, importers,
-- backfills) is covered without app changes. A message only counts when it is recent (< 48h old) and newer than
-- the thread's seen_at — a historical import or backfill inserts old customer messages and must never light up.
-- Existing threads are baselined as read (D4).
--
-- Written, not applied — application code degrades on 42703 until this runs.
--
-- Rollback:
--   drop trigger if exists inbox_messages_count_client on inbox_messages;
--   drop function if exists inbox_count_client_message();
--   drop index if exists inbox_unread_idx;
--   alter table inbox drop column if exists seen_by, drop column if exists seen_at, drop column if exists last_client_message_at, drop column if exists unread_count;
--   (inbox stays in the supabase_realtime publication — harmless; remove with `alter publication supabase_realtime drop table public.inbox;` if wanted)

alter table inbox
  add column if not exists unread_count integer not null default 0,
  add column if not exists last_client_message_at timestamptz null,
  add column if not exists seen_at timestamptz null,
  add column if not exists seen_by uuid null references auth.users(id) on delete set null;

-- D4 baseline: every existing thread starts read. last_client_message_at is informational (display/sort only).
-- Guarded by `seen_at is null` so a re-run doesn't move the baseline of threads already seen since.
update inbox i
set seen_at = now(),
    last_client_message_at = (
      select max(m.created_at) from inbox_messages m where m.inbox_id = i.id and m.author_type = 'client'
    )
where i.seen_at is null;

create or replace function inbox_count_client_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update inbox
  set unread_count = unread_count + 1,
      last_client_message_at = greatest(coalesce(last_client_message_at, '-infinity'::timestamptz), new.created_at)
  where id = new.inbox_id
    and new.created_at > now() - interval '48 hours'
    and new.created_at > coalesce(seen_at, '-infinity'::timestamptz);
  return null;
end;
$$;

drop trigger if exists inbox_messages_count_client on inbox_messages;
create trigger inbox_messages_count_client
  after insert on inbox_messages
  for each row
  when (new.author_type = 'client')
  execute function inbox_count_client_message();

create index if not exists inbox_unread_idx on inbox (id) where unread_count > 0;

-- Live counter: broadcast inbox row changes (RLS applies — inbox_staff_all for hub staff). Same guard as migration 159.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inbox'
     ) then
    alter publication supabase_realtime add table public.inbox;
  end if;
end $$;

comment on column inbox.unread_count is 'Task 490 — new customer messages since the thread was last opened (shared team-wide). Incremented by inbox_messages_count_client; reset by POST /api/desk/tickets/[id]/read.';
comment on column inbox.seen_at is 'Task 490 — when any staff member last opened the thread. Customer messages older than this never count.';
