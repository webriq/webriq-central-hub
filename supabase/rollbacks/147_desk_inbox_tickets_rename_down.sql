-- Down-migration for supabase/migrations/147_desk_inbox_tickets_rename.sql (task 382)
--
-- Reverses every step of the up-migration, in the dependency order explained inline below
-- (NOT a strict mirror of the up-migration's part numbering — see Reverse PART 6's note).
--
-- Deliberately lives OUTSIDE supabase/migrations/, in this sibling supabase/rollbacks/
-- directory: `supabase db push` applies every .sql file it finds inside migrations/ as a
-- forward migration, in filename order, with no way to mark one "manual rollback only." A
-- first version of this file was placed in migrations/ (matching the paired-name convention
-- for readability) and the CLI immediately applied it as the very next migration in the same
-- push that applied 147 itself — reverting the rename seconds after it succeeded, with no
-- chance to verify the up-migration first. Never put a rollback script inside migrations/.
--
-- Apply manually via `psql -f` (or equivalent) against the target DB, rehearsed against a
-- staging/scratch copy before the production maintenance window, per task 382's Acceptance
-- Criteria.
--
-- NOTE: this restores schema/naming, not runtime state — if the application-code deploy
-- that paired with 147 has already gone out (routing-key change, entity_type literal
-- swap in code, etc.), rolling back only this SQL without also rolling back that deploy
-- will break the app. Roll back both together.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Reverse PART 7: attachments.entity_type
-- Same drop -> update -> re-add order as the up-migration (task 382 — a live push caught this
-- ordering bug in the up-migration; mirrored the fix here since this file has the identical
-- failure mode, just surfacing at ADD CONSTRAINT instead of UPDATE: adding the constraint
-- before updating would reject every row still holding 'inbox_message').
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter table attachments drop constraint attachments_entity_type_check;

update attachments set entity_type = 'ticket_message' where entity_type = 'inbox_message';

alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment', 'issue', 'ticket_message'));

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Reverse PART 5: RLS policy renames
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter policy "inbox_staff_all" on inbox rename to "tickets_staff_all";
alter policy "inbox_client_read" on inbox rename to "tickets_client_read";
alter policy "inbox_client_insert" on inbox rename to "tickets_client_insert";

alter policy "tickets_staff_read" on tickets rename to "issues_staff_read";
alter policy "tickets_pm_write" on tickets rename to "issues_pm_write";
alter policy "tickets_developer_delete" on tickets rename to "issues_developer_delete";
alter policy "tickets_developer_update" on tickets rename to "issues_developer_update";

alter policy "ticket_comments_staff_read" on ticket_comments rename to "issue_comments_staff_read";
alter policy "ticket_comments_pm_write" on ticket_comments rename to "issue_comments_pm_write";
alter policy "ticket_comments_staff_insert" on ticket_comments rename to "issue_comments_staff_insert";
alter policy "ticket_comments_delete" on ticket_comments rename to "issue_comments_delete";

alter policy "inbox_messages_staff_all" on inbox_messages rename to "ticket_messages_staff_all";
alter policy "inbox_messages_client_read" on inbox_messages rename to "ticket_messages_client_read";
alter policy "inbox_messages_client_insert" on inbox_messages rename to "ticket_messages_client_insert";

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Reverse PART 4: constraint/index/sequence renames
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter sequence if exists inbox_ticket_number_seq rename to tickets_ticket_number_seq;

alter index if exists idx_inbox_zoho_mail_thread_id_unique rename to idx_tickets_zoho_mail_thread_id_unique;
alter index if exists tickets_source_inbox_id_idx rename to issues_source_ticket_id_idx;
alter index if exists ticket_comments_ticket_id_idx rename to issue_comments_issue_id_idx;

alter table tasks rename constraint tasks_inbox_id_fkey to tasks_ticket_id_fkey;

-- Mirrors the up-migration's explicit (non-swept) renames for the three FK constraints whose
-- column was also renamed — must be reversed to their exact original names before the generic
-- sweep below runs, or the sweep would produce a wrong hybrid name (e.g.
-- issues_source_inbox_id_fkey instead of the original issues_source_ticket_id_fkey).
alter table tickets rename constraint tickets_source_inbox_id_fkey to issues_source_ticket_id_fkey;
alter table inbox_messages rename constraint inbox_messages_inbox_id_fkey to ticket_messages_ticket_id_fkey;
alter table ticket_comments rename constraint ticket_comments_ticket_id_fkey to issue_comments_issue_id_fkey;

do $$
declare
  r record;
  new_name text;
begin
  for r in select conname from pg_constraint where conrelid = 'public.inbox_messages'::regclass loop
    if r.conname like 'inbox\_messages\_%' escape '\' then
      new_name := 'ticket_messages_' || substring(r.conname from 17);
      execute format('alter table public.inbox_messages rename constraint %I to %I', r.conname, new_name);
    end if;
  end loop;

  for r in select conname from pg_constraint where conrelid = 'public.ticket_comments'::regclass loop
    if r.conname like 'ticket\_comments\_%' escape '\' then
      new_name := 'issue_comments_' || substring(r.conname from 17);
      execute format('alter table public.ticket_comments rename constraint %I to %I', r.conname, new_name);
    end if;
  end loop;

  for r in select conname from pg_constraint where conrelid = 'public.tickets'::regclass loop
    if r.conname like 'tickets\_%' escape '\' then
      new_name := 'issues_' || substring(r.conname from 9);
      execute format('alter table public.tickets rename constraint %I to %I', r.conname, new_name);
    end if;
  end loop;

  for r in select conname from pg_constraint where conrelid = 'public.inbox'::regclass loop
    if r.conname like 'inbox\_%' escape '\' then
      new_name := 'tickets_' || substring(r.conname from 7);
      execute format('alter table public.inbox rename constraint %I to %I', r.conname, new_name);
    end if;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Reverse PART 3: FK column renames
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter table tickets rename column source_inbox_id to source_ticket_id;
alter table tasks rename column inbox_id to ticket_id;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Reverse PART 2: Child table renames
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter table ticket_comments rename column ticket_id to issue_id;
alter table ticket_comments rename to issue_comments;

alter table inbox_messages rename column inbox_id to ticket_id;
alter table inbox_messages rename to ticket_messages;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Reverse PART 1: Core table renames
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter table tickets rename to issues;
alter table inbox rename to tickets;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Reverse PART 6: Functions/triggers
-- Moved to run LAST, after Reverse PART 1 above — these bodies reference `issues`/`tickets`
-- by their ORIGINAL meaning (the pre-rename tables), which only exist again once Part 1's
-- table renames have been reversed. Running this where the up-migration's Part 6 numbering
-- would suggest (mirroring forward order in strict reverse) fails live: at that point in
-- execution "tickets" still means the filed-work-items table (today's up-migration name),
-- which has no `ticket_number` column — confirmed via a live push (42703, "column
-- ticket_number does not exist").
-- ═══════════════════════════════════════════════════════════════════════════════════════

drop function if exists sync_inbox_ticket_number_sequence();

create or replace function sync_ticket_number_sequence() returns void as $$
  select setval(
    pg_get_serial_sequence('public.tickets', 'ticket_number'),
    greatest((select coalesce(max(ticket_number), 0) from public.tickets), 1),
    true
  );
$$ language sql security definer;

create or replace function generate_ticket_display_id() returns trigger as $$
declare
  proj_base text;
  next_seq int;
begin
  if new.display_id is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.project_id::text || ':issue'));

  select replace(project_id, '-PROJ-', '') into proj_base
  from projects where id = new.project_id;

  select coalesce(max(substring(display_id from '-TKT(\d+)$')::int), 0) + 1
  into next_seq
  from issues
  where project_id = new.project_id;

  new.display_id := proj_base || '-TKT' || lpad(next_seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;
