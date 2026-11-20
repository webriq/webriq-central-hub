-- Rollback for migration 187 (task 492): restores the original per-row policy expressions on tasks/tickets,
-- drops the created_at indexes and my_test_project_ids().
--
-- Generated from 187's own swap list with from/to reversed, through the same guard: a policy is only changed when its
-- live expression is exactly 187's rewritten form; anything else is skipped with a NOTICE. Run in the SQL editor.

create or replace function pg_temp.rls492_swap(
  p_table text, p_policy text,
  p_from_using text, p_from_check text,
  p_to_using text, p_to_check text
) returns void
language plpgsql as $$
declare
  live record;
  probe record;
  scratch text := 'rls492_' || p_table;
  matches_from boolean;
  matches_to boolean;
  clauses text;
begin
  select qual, with_check, cmd, permissive into live
  from pg_policies where schemaname = 'public' and tablename = p_table and policyname = p_policy;
  if not found then
    raise notice '492: policy % on % not found — skipped', p_policy, p_table;
    return;
  end if;

  execute format('create temp table if not exists %I (like public.%I)', scratch, p_table);

  execute format('create policy probe_from on %I as %s for %s %s %s', scratch, live.permissive, live.cmd,
    case when p_from_using is null then '' else 'using (' || p_from_using || ')' end,
    case when p_from_check is null then '' else 'with check (' || p_from_check || ')' end);
  select qual, with_check into probe from pg_policies where tablename = scratch and policyname = 'probe_from';
  matches_from := live.qual is not distinct from probe.qual and live.with_check is not distinct from probe.with_check;

  execute format('create policy probe_to on %I as %s for %s %s %s', scratch, live.permissive, live.cmd,
    case when p_to_using is null then '' else 'using (' || p_to_using || ')' end,
    case when p_to_check is null then '' else 'with check (' || p_to_check || ')' end);
  select qual, with_check into probe from pg_policies where tablename = scratch and policyname = 'probe_to';
  matches_to := live.qual is not distinct from probe.qual and live.with_check is not distinct from probe.with_check;

  execute format('drop policy probe_from on %I', scratch);
  execute format('drop policy probe_to on %I', scratch);

  if matches_to then
    raise notice '492: % on % already in target form — unchanged', p_policy, p_table;
    return;
  end if;
  if not matches_from then
    raise notice '492: % on % differs from the reviewed original — SKIPPED (live using: %, with check: %)',
      p_policy, p_table, live.qual, live.with_check;
    return;
  end if;

  clauses := concat_ws(' ',
    case when p_to_using is null then null else 'using (' || p_to_using || ')' end,
    case when p_to_check is null then null else 'with check (' || p_to_check || ')' end);
  execute format('alter policy %I on public.%I %s', p_policy, p_table, clauses);
  raise notice '492: % on % rewritten', p_policy, p_table;
end $$;

select pg_temp.rls492_swap('tasks', 'tasks_staff_read',
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm', 'developer')$$,
  null,
  $$get_my_role() in ('admin', 'super_admin', 'pm', 'developer')$$,
  null);
select pg_temp.rls492_swap('tasks', 'tasks_pm_write',
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm')$$,
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm')$$,
  $$get_my_role() in ('admin', 'super_admin', 'pm')$$,
  $$get_my_role() in ('admin', 'super_admin', 'pm')$$);
select pg_temp.rls492_swap('tasks', 'tasks_developer_insert',
  null,
  $$(select get_my_role()) = 'developer' and created_by = (select auth.uid())$$,
  null,
  $$get_my_role() = 'developer' and created_by = auth.uid()$$);
select pg_temp.rls492_swap('tasks', 'tasks_developer_update',
  $$(select get_my_role()) = 'developer' and (created_by = (select auth.uid()) or (select auth.uid()) = any(assignees))$$,
  $$(select get_my_role()) = 'developer'$$,
  $$get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees))$$,
  $$get_my_role() = 'developer'$$);
select pg_temp.rls492_swap('tasks', 'tasks_developer_delete',
  $$(select get_my_role()) = 'developer' and created_by = (select auth.uid())$$,
  null,
  $$get_my_role() = 'developer' and created_by = auth.uid()$$,
  null);
select pg_temp.rls492_swap('tasks', 'tasks_checklist_write_insert',
  null,
  $$kind <> 'checklist' or (select get_my_role()) in ('admin', 'super_admin', 'marketing')$$,
  null,
  $$kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing')$$);
select pg_temp.rls492_swap('tasks', 'tasks_checklist_write_update',
  $$kind <> 'checklist' or (select get_my_role()) in ('admin', 'super_admin', 'marketing')$$,
  $$kind <> 'checklist' or (select get_my_role()) in ('admin', 'super_admin', 'marketing')$$,
  $$kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing')$$,
  $$kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing')$$);
select pg_temp.rls492_swap('tasks', 'tasks_checklist_write_delete',
  $$kind <> 'checklist' or (select get_my_role()) in ('admin', 'super_admin', 'marketing')$$,
  null,
  $$kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing')$$,
  null);
select pg_temp.rls492_swap('tasks', 'tasks_checklist_marketing_read',
  $$kind = 'checklist' and (select get_my_role()) = 'marketing'$$,
  null,
  $$kind = 'checklist' and get_my_role() = 'marketing'$$,
  null);
select pg_temp.rls492_swap('tasks', 'tasks_checklist_marketing_write',
  $$kind = 'checklist' and (select get_my_role()) = 'marketing'$$,
  $$kind = 'checklist' and (select get_my_role()) = 'marketing'$$,
  $$kind = 'checklist' and get_my_role() = 'marketing'$$,
  $$kind = 'checklist' and get_my_role() = 'marketing'$$);
select pg_temp.rls492_swap('tasks', 'tasks_test_hidden',
  $$project_id is null or (select get_my_is_test_user()) or project_id <> all ((select my_test_project_ids())::uuid[])$$,
  null,
  $$project_id is null or get_my_is_test_user() or not is_test_project(project_id)$$,
  null);
select pg_temp.rls492_swap('tasks', 'tasks_test_user_all',
  $$(select get_my_is_test_user()) and project_id = any ((select my_test_project_ids())::uuid[])$$,
  $$(select get_my_is_test_user()) and project_id = any ((select my_test_project_ids())::uuid[])$$,
  $$get_my_is_test_user() and is_test_project(project_id)$$,
  $$get_my_is_test_user() and is_test_project(project_id)$$);
select pg_temp.rls492_swap('tickets', 'tickets_staff_read',
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm', 'developer')$$,
  null,
  $$get_my_role() in ('admin', 'super_admin', 'pm', 'developer')$$,
  null);
select pg_temp.rls492_swap('tickets', 'tickets_pm_write',
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm')$$,
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm')$$,
  $$get_my_role() in ('admin', 'super_admin', 'pm')$$,
  $$get_my_role() in ('admin', 'super_admin', 'pm')$$);
select pg_temp.rls492_swap('tickets', 'tickets_developer_update',
  $$(select get_my_role()) = 'developer' and (created_by = (select auth.uid()) or (select auth.uid()) = any(assignees))$$,
  $$(select get_my_role()) = 'developer'$$,
  $$get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees))$$,
  $$get_my_role() = 'developer'$$);
select pg_temp.rls492_swap('tickets', 'tickets_developer_delete',
  $$(select get_my_role()) = 'developer' and created_by = (select auth.uid())$$,
  null,
  $$get_my_role() = 'developer' and created_by = auth.uid()$$,
  null);
select pg_temp.rls492_swap('tickets', 'tickets_test_hidden',
  $$project_id is null or (select get_my_is_test_user()) or project_id <> all ((select my_test_project_ids())::uuid[])$$,
  null,
  $$get_my_is_test_user() or not is_test_project(project_id)$$,
  null);
select pg_temp.rls492_swap('tickets', 'tickets_test_user_all',
  $$(select get_my_is_test_user()) and project_id = any ((select my_test_project_ids())::uuid[])$$,
  $$(select get_my_is_test_user()) and project_id = any ((select my_test_project_ids())::uuid[])$$,
  $$get_my_is_test_user() and is_test_project(project_id)$$,
  $$get_my_is_test_user() and is_test_project(project_id)$$);

drop table if exists pg_temp.rls492_tasks;
drop table if exists pg_temp.rls492_tickets;
drop function pg_temp.rls492_swap(text, text, text, text, text, text);

drop index if exists tasks_created_at_idx;
drop index if exists tickets_created_at_idx;
-- Only once no policy uses it (every 187 rewrite above restored); errors instead of dropping if one still does.
drop function if exists public.my_test_project_ids();
