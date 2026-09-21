-- Migration 147: Desk Inbox/Tickets rename (task 382)
--
-- Task 364 renamed "Issue" -> "Ticket" at the application/UI layer everywhere, but
-- deliberately left the DB tables alone ("issues"/"issue_comments" DB tables, RLS policy
-- names, issues.prefix, and entity_type values kept unchanged — collision/migration-risk
-- avoidance") because `tickets` was already taken by the Desk email/support table. This
-- migration finishes that rename at the DB level:
--
--   tickets         -> inbox            (Desk email/support threads — Zoho Desk + StackShift)
--   issues          -> tickets          (filed, assignable work items)
--   ticket_messages -> inbox_messages   (child of the Desk domain)
--   issue_comments  -> ticket_comments  (child of the filed-work-item domain)
--
-- Deliberately NOT changed (decided in task 382 planning, not oversights):
--   - time_logs.issue_id / active_timers.issue_id stay named issue_id (still reads fine,
--     renaming touches ~15 timer/dashboard files for a cosmetic-only gain)
--   - storage bucket `ticket-attachments` stays named as-is (Supabase Storage buckets can't
--     be renamed in place without copying every object — disproportionate for a cosmetic
--     rename)
--   - tickets.ticket_number / the "TKT-" ticket_id display key / the "#<n>" badge format —
--     no renumbering, no reformatting (see task 382 doc rationale)
--   - issues.display_id's per-project "-TKT####" sequence stays independent of
--     tickets(inbox).ticket_number's global sequence (Zoho itself kept these as two
--     separate numbering domains — see issues.prefix, e.g. "TC3-I1")
--   - issues.prefix / entity_type = 'issue' — untouched, same as task 364's own precedent
--
-- Decided during task 382 planning (previously flagged OPEN):
--   - issues.source_ticket_id -> renamed to source_inbox_id (it points at what's now
--     literally `inbox`)
--   - tasks.ticket_id -> renamed to tasks.inbox_id, per the same reasoning
--
-- Application-code routing-key change (not part of this SQL, tracked in task 382 doc):
-- /desk/inbox/[ticketId] and the public /tickets/[ticketId] view switch from routing by
-- the display string (old tickets.ticket_id, "TKT-XXXX") to routing by `id` (UUID). This
-- migration does not touch that column — `inbox.ticket_id` (the display key) and
-- `inbox.ticket_number` (the "#<n>" badge source) are both left exactly as they are.
--
-- Constraint/index renames use a dynamic sweep (pattern: migration 088's dynamic FK
-- discovery) rather than hardcoded guesses, since this repo has no live-schema
-- introspection available at authoring time — only migration files that were read. Any
-- constraint/index whose name still carries the pre-rename table prefix is renamed to
-- match; a handful of cross-table constraints/indexes that are individually known by name
-- are renamed explicitly below the sweep.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PART 1: Core table renames
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter table tickets rename to inbox;
alter table issues rename to tickets;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PART 2: Child table renames + their FK columns
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter table ticket_messages rename to inbox_messages;
alter table inbox_messages rename column ticket_id to inbox_id;

alter table issue_comments rename to ticket_comments;
alter table ticket_comments rename column issue_id to ticket_id;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PART 3: FK column renames on tables that are not themselves being renamed
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- tasks.ticket_id (migration 025) FK'd the old `tickets` (Desk) table — now points at `inbox`.
alter table tasks rename column ticket_id to inbox_id;

-- issues.source_ticket_id (migration 137) FK'd the old `tickets` (Desk) table — now points
-- at `inbox`. The table itself is already renamed to `tickets` above, so this is now a
-- column rename on the (new) `tickets` table.
alter table tickets rename column source_ticket_id to source_inbox_id;

-- The three FK constraints below had BOTH their table and their own column renamed. A
-- generic "swap the table-name prefix" sweep (Part 4) would leave their column-derived
-- suffix stale (e.g. issues_source_ticket_id_fkey -> tickets_source_ticket_id_fkey, on a
-- column now called source_inbox_id) — cosmetically wrong in exactly the way this whole
-- migration exists to fix, even though FK enforcement itself is unaffected by a constraint's
-- name. Renamed explicitly, in full, here — before Part 4 runs, using their original
-- creation-time default names (column renames above don't rename dependent constraints any
-- more than table renames do) — so the sweep below simply has nothing left to match for these
-- three and skips them.
alter table tickets rename constraint issues_source_ticket_id_fkey to tickets_source_inbox_id_fkey;
alter table inbox_messages rename constraint ticket_messages_ticket_id_fkey to inbox_messages_inbox_id_fkey;
alter table ticket_comments rename constraint issue_comments_issue_id_fkey to ticket_comments_ticket_id_fkey;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PART 4: Dynamic constraint-name sweep — rename every OTHER constraint on a renamed table
-- that still carries the pre-rename table-name prefix (pkey, unique, check — anything
-- Postgres auto-named at creation time following "<table>_<...>" convention). The three FK
-- constraints above are already fully renamed and no longer match this sweep's patterns.
-- ═══════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  r record;
  new_name text;
begin
  -- inbox (was `tickets`)
  for r in select conname from pg_constraint where conrelid = 'public.inbox'::regclass loop
    if r.conname like 'tickets\_%' escape '\' then
      new_name := 'inbox_' || substring(r.conname from 9);
      execute format('alter table public.inbox rename constraint %I to %I', r.conname, new_name);
    end if;
  end loop;

  -- tickets (was `issues`)
  for r in select conname from pg_constraint where conrelid = 'public.tickets'::regclass loop
    if r.conname like 'issues\_%' escape '\' then
      new_name := 'tickets_' || substring(r.conname from 8);
      execute format('alter table public.tickets rename constraint %I to %I', r.conname, new_name);
    end if;
  end loop;

  -- ticket_comments (was `issue_comments`)
  for r in select conname from pg_constraint where conrelid = 'public.ticket_comments'::regclass loop
    if r.conname like 'issue\_comments\_%' escape '\' then
      new_name := 'ticket_comments_' || substring(r.conname from 16);
      execute format('alter table public.ticket_comments rename constraint %I to %I', r.conname, new_name);
    end if;
  end loop;

  -- inbox_messages (was `ticket_messages`)
  for r in select conname from pg_constraint where conrelid = 'public.inbox_messages'::regclass loop
    if r.conname like 'ticket\_messages\_%' escape '\' then
      new_name := 'inbox_messages_' || substring(r.conname from 17);
      execute format('alter table public.inbox_messages rename constraint %I to %I', r.conname, new_name);
    end if;
  end loop;
end $$;

-- Known cross-table constraint (lives on `tasks`, which is not itself renamed).
alter table tasks rename constraint tasks_ticket_id_fkey to tasks_inbox_id_fkey;

-- Known indexes (not always visible via pg_constraint if created as plain CREATE INDEX
-- rather than an inline ADD CONSTRAINT) — renamed explicitly by their known names.
alter index if exists issue_comments_issue_id_idx rename to ticket_comments_ticket_id_idx;
alter index if exists issues_source_ticket_id_idx rename to tickets_source_inbox_id_idx;
alter index if exists idx_tickets_zoho_mail_thread_id_unique rename to idx_inbox_zoho_mail_thread_id_unique;

-- Serial sequence backing inbox.ticket_number — cosmetic only (sync_inbox_ticket_number_
-- sequence() below resolves it dynamically via pg_get_serial_sequence regardless of name),
-- but renamed for the same clarity reasons as everything else here. `if exists` guards
-- against the default name not matching exactly.
alter sequence if exists tickets_ticket_number_seq rename to inbox_ticket_number_seq;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PART 5: RLS policy renames
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter policy "tickets_staff_all" on inbox rename to "inbox_staff_all";
alter policy "tickets_client_read" on inbox rename to "inbox_client_read";
alter policy "tickets_client_insert" on inbox rename to "inbox_client_insert";

alter policy "issues_staff_read" on tickets rename to "tickets_staff_read";
alter policy "issues_pm_write" on tickets rename to "tickets_pm_write";
alter policy "issues_developer_delete" on tickets rename to "tickets_developer_delete";
alter policy "issues_developer_update" on tickets rename to "tickets_developer_update";

alter policy "issue_comments_staff_read" on ticket_comments rename to "ticket_comments_staff_read";
alter policy "issue_comments_pm_write" on ticket_comments rename to "ticket_comments_pm_write";
alter policy "issue_comments_staff_insert" on ticket_comments rename to "ticket_comments_staff_insert";
alter policy "issue_comments_delete" on ticket_comments rename to "ticket_comments_delete";

alter policy "ticket_messages_staff_all" on inbox_messages rename to "inbox_messages_staff_all";
alter policy "ticket_messages_client_read" on inbox_messages rename to "inbox_messages_client_read";
alter policy "ticket_messages_client_insert" on inbox_messages rename to "inbox_messages_client_insert";

-- Storage policies `ticket_attachments_staff_read`/`ticket_attachments_staff_write` are
-- deliberately untouched — they gate the `ticket-attachments` bucket, which is not being
-- renamed (see header note).

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PART 6: Functions/triggers
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- generate_ticket_display_id() now fires on the renamed `tickets` table (was `issues`) —
-- its body queried `from issues`, which no longer exists post-rename, so it must be
-- recreated. Its own name is already correct (task 364 left this named "ticket" already).
create or replace function generate_ticket_display_id() returns trigger as $$
declare
  proj_base text;
  next_seq int;
begin
  if new.display_id is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.project_id::text || ':ticket'));

  select replace(project_id, '-PROJ-', '') into proj_base
  from projects where id = new.project_id;

  select coalesce(max(substring(display_id from '-TKT(\d+)$')::int), 0) + 1
  into next_seq
  from tickets
  where project_id = new.project_id;

  new.display_id := proj_base || '-TKT' || lpad(next_seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;
-- Trigger `trg_generate_ticket_display_id` stays attached to the renamed table automatically.

-- generate_ticket_id() (fires on `inbox`, sets ticket_id = 'TKT-'||ticket_number) has no
-- table-name references in its body — no change needed, trigger stays attached.

-- sync_ticket_number_sequence() referenced `public.tickets` (the Desk table) by name twice;
-- that identifier now refers to the *other* table post-rename, so this must be repointed at
-- `public.inbox` and renamed for clarity (it was never trigger-wired — called manually, as
-- migration 124 did once — so no trigger re-wiring is needed here).
drop function if exists sync_ticket_number_sequence();

create or replace function sync_inbox_ticket_number_sequence() returns void as $$
  select setval(
    pg_get_serial_sequence('public.inbox', 'ticket_number'),
    greatest((select coalesce(max(ticket_number), 0) from public.inbox), 1),
    true
  );
$$ language sql security definer;

comment on function sync_inbox_ticket_number_sequence() is 'Advances inbox.ticket_number''s backing sequence past the current max. Was sync_ticket_number_sequence() (migration 124), renamed + repointed at `inbox` by migration 147''s table rename. Not trigger-wired — call manually after any bulk ticket_number backfill, same as migration 124''s one-time use.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PART 7: attachments.entity_type — 'ticket_message' -> 'inbox_message'
-- The CHECK constraint must be dropped BEFORE the data UPDATE, not after: the old constraint
-- only permits 'ticket_message', so setting entity_type = 'inbox_message' while it's still
-- active fails immediately (confirmed live — 23514 on this exact statement). Drop -> update ->
-- re-add is the correct order: with no constraint active the UPDATE can't violate anything,
-- and ADD CONSTRAINT's default existing-row validation then passes because every row already
-- holds a value the new check permits.
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter table attachments drop constraint attachments_entity_type_check;

update attachments set entity_type = 'inbox_message' where entity_type = 'ticket_message';

alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment', 'issue', 'inbox_message'));

-- 'issue' is left unchanged, same precedent as task 364 (entity_type values deliberately
-- not renamed on the filed-work-item side).

comment on column tickets.source_inbox_id is 'Desk inbox thread this ticket was filed from via the "File a Ticket" action (task 333/363/381). Null for tickets authored directly on a project. Was issues.source_ticket_id before migration 147''s rename — see migration 137 for original rationale.';
