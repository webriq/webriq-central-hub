-- Rollback of 163_tasks_checklist_kind.sql (task 434).
-- Checklist rows exist only because of this feature; the legacy onboarding_internal_deliverables table is dual-written during the soak,
-- so deleting them loses nothing. Run this ONLY after pointing the app back at the legacy table (revert the code first).
delete from tasks where kind = 'checklist';

drop policy if exists tasks_checklist_marketing_write on tasks;
drop policy if exists tasks_checklist_marketing_read on tasks;
drop policy if exists tasks_checklist_write_delete on tasks;
drop policy if exists tasks_checklist_write_update on tasks;
drop policy if exists tasks_checklist_write_insert on tasks;

drop index if exists tasks_checklist_key_uq;
alter table tasks drop constraint if exists tasks_checklist_key_kind_check;
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks drop column if exists checklist_key, drop column if exists kind;

-- Restore migration 089's trigger function (no kind guard).
create or replace function generate_task_display_id() returns trigger as $$
declare
  proj_base text;
  next_seq int;
begin
  if new.display_id is not null then
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
