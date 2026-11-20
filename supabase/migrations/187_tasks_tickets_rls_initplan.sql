-- Migration 187: Tasks/Tickets RLS — evaluate helper calls once per query, not once per row (task 492)
--
-- Quick Links › Tasks (`/dashboard/tasks`) timed out (57014). Its listing is `count=exact` + `ORDER BY created_at`,
-- so every row of `tasks` is checked against RLS, and every SELECT-relevant policy called SECURITY DEFINER helpers
-- (`get_my_role()`, `get_my_is_test_user()`, `is_test_project(project_id)`, `auth.uid()`) — each a lookup, per row.
--
-- Fix (same access, cheaper plan):
--   * helper calls are wrapped as scalar subqueries — `(select get_my_role())` — which Postgres evaluates once per
--     statement (InitPlan) instead of once per row;
--   * the row-dependent `is_test_project(project_id)` becomes a membership test against one array of test project
--     ids, read once per statement through the new SECURITY DEFINER `my_test_project_ids()`. It must bypass RLS:
--     an inline `select id from projects where is_test` would itself be filtered by `projects_test_hidden`, come back
--     empty for non-test users, and expose test rows;
--   * `created_at` indexes for the listings' sort.
--
-- Safety: every rewrite goes through `pg_temp.rls492_swap`, which changes a policy ONLY when its live expression
-- is exactly the reviewed original (compared after Postgres deparses both, on a scratch copy of the table). A policy
-- that is missing or was edited elsewhere is skipped with a NOTICE — read the notices after applying. Already
-- rewritten policies are left alone, so the file is idempotent. Policy names, commands, roles and
-- permissive/restrictive are untouched (ALTER POLICY changes only the expressions).
--
-- Works with or without migration 181: the 181 policies are skipped when absent. If 181 is applied AFTER this,
-- re-run this file (181 recreates its four policies in the per-row form).
--
-- Written, not applied. Rollback: supabase/manual/187_rollback_tasks_tickets_rls_initplan.sql

-- ── Test-project ids, once per statement ───────────────────────────────────────────────────────────────────
-- Only meaningful once 181 added projects.is_test; created only then (the 181 policies that use it need it too).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'projects' and column_name = 'is_test') then
    execute $f$
      create or replace function public.my_test_project_ids()
      returns uuid[]
      language sql stable security definer
      set search_path = public
      as $body$ select coalesce(array_agg(id), '{}'::uuid[]) from public.projects where is_test $body$
    $f$;
    -- Policies run as the querying role, so `authenticated` needs EXECUTE; anon never reads these tables.
    execute 'revoke all on function public.my_test_project_ids() from public, anon';
    execute 'grant execute on function public.my_test_project_ids() to authenticated';
  end if;
end $$;

-- ── Guarded expression swap ────────────────────────────────────────────────────────────────────────────────
-- Probes how Postgres deparses the `from` and `to` expressions by creating them as policies on a temp copy of the
-- table (same columns, same session search_path), then compares with the live policy in pg_policies.
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

-- ── tasks ──────────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.rls492_swap('tasks', 'tasks_staff_read',
  $$get_my_role() in ('admin', 'super_admin', 'pm', 'developer')$$, null,
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm', 'developer')$$, null);

select pg_temp.rls492_swap('tasks', 'tasks_pm_write',
  $$get_my_role() in ('admin', 'super_admin', 'pm')$$,
  $$get_my_role() in ('admin', 'super_admin', 'pm')$$,
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm')$$,
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm')$$);

select pg_temp.rls492_swap('tasks', 'tasks_developer_insert',
  null, $$get_my_role() = 'developer' and created_by = auth.uid()$$,
  null, $$(select get_my_role()) = 'developer' and created_by = (select auth.uid())$$);

select pg_temp.rls492_swap('tasks', 'tasks_developer_update',
  $$get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees))$$,
  $$get_my_role() = 'developer'$$,
  $$(select get_my_role()) = 'developer' and (created_by = (select auth.uid()) or (select auth.uid()) = any(assignees))$$,
  $$(select get_my_role()) = 'developer'$$);

select pg_temp.rls492_swap('tasks', 'tasks_developer_delete',
  $$get_my_role() = 'developer' and created_by = auth.uid()$$, null,
  $$(select get_my_role()) = 'developer' and created_by = (select auth.uid())$$, null);

select pg_temp.rls492_swap('tasks', 'tasks_checklist_write_insert',
  null, $$kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing')$$,
  null, $$kind <> 'checklist' or (select get_my_role()) in ('admin', 'super_admin', 'marketing')$$);

select pg_temp.rls492_swap('tasks', 'tasks_checklist_write_update',
  $$kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing')$$,
  $$kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing')$$,
  $$kind <> 'checklist' or (select get_my_role()) in ('admin', 'super_admin', 'marketing')$$,
  $$kind <> 'checklist' or (select get_my_role()) in ('admin', 'super_admin', 'marketing')$$);

select pg_temp.rls492_swap('tasks', 'tasks_checklist_write_delete',
  $$kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing')$$, null,
  $$kind <> 'checklist' or (select get_my_role()) in ('admin', 'super_admin', 'marketing')$$, null);

select pg_temp.rls492_swap('tasks', 'tasks_checklist_marketing_read',
  $$kind = 'checklist' and get_my_role() = 'marketing'$$, null,
  $$kind = 'checklist' and (select get_my_role()) = 'marketing'$$, null);

select pg_temp.rls492_swap('tasks', 'tasks_checklist_marketing_write',
  $$kind = 'checklist' and get_my_role() = 'marketing'$$,
  $$kind = 'checklist' and get_my_role() = 'marketing'$$,
  $$kind = 'checklist' and (select get_my_role()) = 'marketing'$$,
  $$kind = 'checklist' and (select get_my_role()) = 'marketing'$$);

-- 181 (skipped when absent). `not is_test_project(pid)` ⇔ `pid <> all(test_ids)` and `is_test_project(pid)` ⇔
-- `pid = any(test_ids)` for any non-null pid (both sides false/true alike for an empty set); null pids keep their
-- explicit `project_id is null` branch.
select pg_temp.rls492_swap('tasks', 'tasks_test_hidden',
  $$project_id is null or get_my_is_test_user() or not is_test_project(project_id)$$, null,
  $$project_id is null or (select get_my_is_test_user()) or project_id <> all ((select my_test_project_ids())::uuid[])$$, null);

select pg_temp.rls492_swap('tasks', 'tasks_test_user_all',
  $$get_my_is_test_user() and is_test_project(project_id)$$,
  $$get_my_is_test_user() and is_test_project(project_id)$$,
  $$(select get_my_is_test_user()) and project_id = any ((select my_test_project_ids())::uuid[])$$,
  $$(select get_my_is_test_user()) and project_id = any ((select my_test_project_ids())::uuid[])$$);

-- ── tickets (the former `issues` table; policies renamed by 147) ───────────────────────────────────────────
select pg_temp.rls492_swap('tickets', 'tickets_staff_read',
  $$get_my_role() in ('admin', 'super_admin', 'pm', 'developer')$$, null,
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm', 'developer')$$, null);

select pg_temp.rls492_swap('tickets', 'tickets_pm_write',
  $$get_my_role() in ('admin', 'super_admin', 'pm')$$,
  $$get_my_role() in ('admin', 'super_admin', 'pm')$$,
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm')$$,
  $$(select get_my_role()) in ('admin', 'super_admin', 'pm')$$);

select pg_temp.rls492_swap('tickets', 'tickets_developer_update',
  $$get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees))$$,
  $$get_my_role() = 'developer'$$,
  $$(select get_my_role()) = 'developer' and (created_by = (select auth.uid()) or (select auth.uid()) = any(assignees))$$,
  $$(select get_my_role()) = 'developer'$$);

select pg_temp.rls492_swap('tickets', 'tickets_developer_delete',
  $$get_my_role() = 'developer' and created_by = auth.uid()$$, null,
  $$(select get_my_role()) = 'developer' and created_by = (select auth.uid())$$, null);

-- tickets.project_id is NOT NULL today; the `is null` branch keeps the original's null semantics exactly anyway
-- (`not is_test_project(null)` is true, `null <> all(...)` is not).
select pg_temp.rls492_swap('tickets', 'tickets_test_hidden',
  $$get_my_is_test_user() or not is_test_project(project_id)$$, null,
  $$project_id is null or (select get_my_is_test_user()) or project_id <> all ((select my_test_project_ids())::uuid[])$$, null);

select pg_temp.rls492_swap('tickets', 'tickets_test_user_all',
  $$get_my_is_test_user() and is_test_project(project_id)$$,
  $$get_my_is_test_user() and is_test_project(project_id)$$,
  $$(select get_my_is_test_user()) and project_id = any ((select my_test_project_ids())::uuid[])$$,
  $$(select get_my_is_test_user()) and project_id = any ((select my_test_project_ids())::uuid[])$$);

drop table if exists pg_temp.rls492_tasks;
drop table if exists pg_temp.rls492_tickets;
drop function pg_temp.rls492_swap(text, text, text, text, text, text);

-- ── Listing sort ───────────────────────────────────────────────────────────────────────────────────────────
create index if not exists tasks_created_at_idx on tasks (created_at desc);
create index if not exists tickets_created_at_idx on tickets (created_at desc);
