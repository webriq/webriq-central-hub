-- Migration 121: Fix infinite recursion in notes/note_collaborators RLS
--
-- Migration 120's "notes_select"/"notes_update" policies subquery note_collaborators, while
-- "note_collaborators_select"/"_insert"/"_update"/"_delete" subquery notes right back — Postgres
-- detects this mutual reference as infinite recursion (42P17: "infinite recursion detected in
-- policy for relation \"note_collaborators\"") on essentially every query against either table.
--
-- Fix: route both cross-table checks through security-definer helper functions, the same
-- RLS-bypass pattern this repo already uses for get_my_role()/get_my_customer_id() (migration
-- 026) — a security-definer function executes with its owner's privileges, so its internal
-- queries don't re-trigger the RLS of the table they read, breaking the cycle.

create or replace function is_note_author(p_note_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from notes n where n.id = p_note_id and n.created_by = auth.uid()
  );
$$;

create or replace function is_note_collaborator(p_note_id uuid, p_permission text default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from note_collaborators nc
    where nc.note_id = p_note_id
      and nc.user_id = auth.uid()
      and (p_permission is null or nc.permission = p_permission)
  );
$$;

-- ── notes ────────────────────────────────────────────────────────────────────────────────
drop policy if exists "notes_select" on notes;
create policy "notes_select" on notes for select to authenticated
  using (
    created_by = auth.uid()
    or get_my_role() in ('admin', 'super_admin')
    or is_note_collaborator(id)
  );

drop policy if exists "notes_update" on notes;
create policy "notes_update" on notes for update to authenticated
  using (
    created_by = auth.uid()
    or get_my_role() in ('admin', 'super_admin')
    or is_note_collaborator(id, 'edit')
  );

-- ── note_collaborators ───────────────────────────────────────────────────────────────────
drop policy if exists "note_collaborators_select" on note_collaborators;
create policy "note_collaborators_select" on note_collaborators for select to authenticated
  using (
    user_id = auth.uid()
    or get_my_role() in ('admin', 'super_admin')
    or is_note_author(note_id)
  );

drop policy if exists "note_collaborators_insert" on note_collaborators;
create policy "note_collaborators_insert" on note_collaborators for insert to authenticated
  with check (
    get_my_role() in ('admin', 'super_admin')
    or is_note_author(note_id)
  );

drop policy if exists "note_collaborators_update" on note_collaborators;
create policy "note_collaborators_update" on note_collaborators for update to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or is_note_author(note_id)
  );

drop policy if exists "note_collaborators_delete" on note_collaborators;
create policy "note_collaborators_delete" on note_collaborators for delete to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or is_note_author(note_id)
  );
