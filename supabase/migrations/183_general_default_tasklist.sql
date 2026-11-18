-- ─── Migration 183: "General" default task list (task 486) ───────────────────────────────────────────────
-- Every task with no task list goes into its project's "General" list (created on demand), now and from here on.
--   • ensure_general_tasklist(project) — pick-or-create General; flags it is_default only when the project has no
--     default yet (D1: existing defaults, e.g. Zoho-imported, are kept).
--   • tasks trigger — on INSERT and on UPDATE OF tasklist_id/project_id (D2: a deleted or cleared list moves its tasks
--     to General; `on delete set null` runs as an UPDATE on tasks, so it is covered too).
--   • project_deliverables trigger — General can't be renamed or deleted (D3), except when its project is being
--     deleted (cascade) or another General remains in the project (extra duplicate).
--   • General = a non-programme list named "General" (any case/whitespace), with or without a phase: Zoho-imported
--     Generals usually sit under a milestone (task 486 test run: 5 of 15 sampled projects).
--   • backfill — duplicate Generals in a project are merged into one (keeper: no phase first, then oldest; the others'
--     tasks move to it, a default flag carries over, the others are deleted), then General for every project, then
--     every null-list task (checklist rows excluded) moved into it.
-- `tasklists` is a compat view over project_deliverables (migration 160); this writes the table directly.
-- SECURITY DEFINER: a developer creating a subtask can't insert deliverables under RLS (pm/admin only).
-- ensure_general_tasklist is reachable only through the triggers (EXECUTE revoked), never as an RPC.
-- Idempotent: re-running creates no second General and moves nothing new.
-- Only tasks.tasklist_id references project_deliverables (checked in _sql/schema.sql), so deleting merged duplicates loses nothing.

begin;

create or replace function is_general_tasklist(p_name text, p_source text) returns boolean
language sql immutable as $$
  select lower(trim(p_name)) = 'general' and p_source is distinct from 'programme'
$$;

create or replace function ensure_general_tasklist(p_project_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- project is gone (cascade delete in progress): creating a list would fail its FK and block the delete
  if p_project_id is null or not exists (select 1 from projects where id = p_project_id) then return null; end if;
  perform pg_advisory_xact_lock(hashtext('general_tasklist:' || p_project_id));

  select id into v_id from project_deliverables
   where project_id = p_project_id and is_general_tasklist(name, source)
   order by phase_id is not null, created_at, id limit 1;  -- same keeper order as the merge below

  if v_id is null then
    insert into project_deliverables (project_id, name, source, is_default, position)
    select p_project_id, 'General', 'manual',
           not coalesce(bool_or(coalesce(is_default, false)), false),
           coalesce(min(position), 0) - 1
      from project_deliverables where project_id = p_project_id
    returning id into v_id;
  elsif not exists (select 1 from project_deliverables where project_id = p_project_id and is_default) then
    update project_deliverables set is_default = true where id = v_id;
  end if;
  return v_id;
end $$;

-- Not callable as an RPC: only the (definer) trigger below uses it.
revoke execute on function ensure_general_tasklist(uuid) from public, anon, authenticated;

create or replace function tasks_default_general_tasklist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tasklist_id is null and new.project_id is not null and new.kind is distinct from 'checklist' then
    new.tasklist_id := ensure_general_tasklist(new.project_id);
  end if;
  return new;
end $$;

-- definer: the "project still exists / another General exists" checks must not be hidden by the caller's RLS
-- (e.g. test projects, migration 181), or a hidden project would look like a cascade delete.
create or replace function project_deliverables_protect_general() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_general_tasklist(old.name, old.source) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' then
    if is_general_tasklist(new.name, new.source) then return new; end if;
  elsif not exists (select 1 from projects where id = old.project_id)
     or exists (select 1 from project_deliverables d
                 where d.project_id = old.project_id and d.id <> old.id and is_general_tasklist(d.name, d.source)) then
    return old;
  end if;
  raise exception 'The General task list cannot be renamed or deleted' using errcode = 'P0001';
end $$;

-- Backfill before the triggers exist, so the bulk updates don't run the trigger per row.
-- 1. Merge duplicate Generals per project into one keeper.
create temp table general_lists on commit drop as
select id, project_id, coalesce(is_default, false) as is_default,
       row_number() over (partition by project_id order by phase_id is not null, created_at, id) as rn
  from project_deliverables
 where is_general_tasklist(name, source);

update tasks t
   set tasklist_id = k.id
  from general_lists d
  join general_lists k on k.project_id = d.project_id and k.rn = 1
 where d.rn > 1 and t.tasklist_id = d.id;

update project_deliverables
   set is_default = true
 where id in (select k.id from general_lists k
               where k.rn = 1
                 and exists (select 1 from general_lists d where d.project_id = k.project_id and d.rn > 1 and d.is_default));

delete from project_deliverables where id in (select id from general_lists where rn > 1);

-- 2. General for every project (creates one where none exists; flags it default where the project has none, D1).
select ensure_general_tasklist(id) from projects;

-- 3. Move every null-list task into its project's (now single) General.
update tasks t
   set tasklist_id = g.id
  from project_deliverables g
 where g.project_id = t.project_id
   and is_general_tasklist(g.name, g.source)
   and t.tasklist_id is null
   and t.kind is distinct from 'checklist';

drop trigger if exists tasks_default_general_tasklist on tasks;
create trigger tasks_default_general_tasklist
  before insert or update of tasklist_id, project_id on tasks
  for each row execute function tasks_default_general_tasklist();

drop trigger if exists project_deliverables_protect_general on project_deliverables;
create trigger project_deliverables_protect_general
  before update of name or delete on project_deliverables
  for each row execute function project_deliverables_protect_general();

commit;
