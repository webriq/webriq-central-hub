-- ─── Onboarding checklist as tasks (task 434) ────────────────────────────────────────────────────────────
-- WRITTEN, NOT APPLIED by the agent (repo convention) — the operator applies it with `supabase db push` after review.
-- Rollback: supabase/rollbacks/163_tasks_checklist_kind_down.sql
--
-- StackShift I's Phase 1 onboarding checklist (INTERNAL_DELIVERABLES) becomes `tasks` rows with kind = 'checklist', keyed per project by
-- `checklist_key`. Access PRESERVES the legacy onboarding_internal_deliverables table (migration 070): admin / super_admin / marketing
-- read + write, pm / developer READ-ONLY (the PM dashboard's Intake checklist card and the Timeline cards read statuses).
--   * pm / developer / admin / super_admin already pass `tasks_staff_read` for select; marketing has no tasks policy, so it gets a
--     checklist-only permissive policy below.
--   * pm (tasks_pm_write) and developer (tasks_developer_*) would otherwise be able to WRITE checklist rows — three RESTRICTIVE policies
--     (insert / update / delete; deliberately not `for all`, which would also hide the rows from select) close that.
-- To make the checklist admin/marketing-only instead, add a restrictive `for select` policy with the same role list.

alter table tasks
  add column kind text not null default 'task',
  add column checklist_key text;

alter table tasks add constraint tasks_kind_check check (kind in ('task', 'checklist'));
-- A checklist row always has a key, a normal task never does.
alter table tasks add constraint tasks_checklist_key_kind_check check ((kind = 'checklist') = (checklist_key is not null));
-- One row per checklist item per project (mirrors the legacy table's unique (project_id, deliverable_key)).
create unique index tasks_checklist_key_uq on tasks (project_id, checklist_key) where checklist_key is not null;

-- ── RLS ────────────────────────────────────────────────────────────────────────────────────────────────
create policy tasks_checklist_write_insert on tasks as restrictive for insert to authenticated
  with check (kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing'));
create policy tasks_checklist_write_update on tasks as restrictive for update to authenticated
  using (kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing'));
create policy tasks_checklist_write_delete on tasks as restrictive for delete to authenticated
  using (kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy tasks_checklist_marketing_read on tasks for select to authenticated
  using (kind = 'checklist' and get_my_role() = 'marketing');
create policy tasks_checklist_marketing_write on tasks for all to authenticated
  using (kind = 'checklist' and get_my_role() = 'marketing')
  with check (kind = 'checklist' and get_my_role() = 'marketing');

-- ── Display ids: checklist rows are hidden, so they must not burn visible T#### numbers ───────────────────
create or replace function generate_task_display_id() returns trigger as $$
declare
  proj_base text;
  next_seq int;
begin
  if new.display_id is not null or new.kind = 'checklist' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.project_id::text || ':task'));

  select replace(project_id, '-PROJ-', '') into proj_base
  from projects where id = new.project_id;

  select coalesce(max(substring(display_id from '-T(\d+)$')::int), 0) + 1
  into next_seq
  from tasks
  where project_id = new.project_id;

  new.display_id := proj_base || '-T' || lpad(next_seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;
