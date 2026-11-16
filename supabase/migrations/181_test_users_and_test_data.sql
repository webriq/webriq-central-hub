-- Migration 181: Test Users + Test Companies / Test Projects (task 476, rev 3)
-- WRITTEN, NOT APPLIED — the app probes for projects.is_test and degrades (Settings banner, no
-- test-data filtering) until this runs. Apply it ALONE (SQL editor or db push --dry-run listing only 181).
--
-- Rules:
--   * Test records (customers.is_test, projects.is_test, and tasks/tickets of test projects) are visible
--     ONLY to Test Users (profiles.is_test_user). Admins are not exempt; they manage flags in Settings,
--     which reads with the service role.
--   * Test Users get full access to all test data, whatever their role.
--   * Flagging a customer flags/unflags all of its projects (D5).
--   * vw_hub_metrics excludes test customers (D8).

-- ─── Columns ──────────────────────────────────────────────────────────────────
alter table profiles  add column if not exists is_test_user boolean not null default false;
alter table customers add column if not exists is_test      boolean not null default false;
alter table projects  add column if not exists is_test      boolean not null default false;

create index if not exists customers_is_test_idx on customers (customer_id) where is_test;
create index if not exists projects_is_test_idx  on projects  (id) where is_test;

-- ─── Helpers (same style as get_my_role(); security definer avoids RLS recursion) ──
create or replace function public.get_my_is_test_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select is_test_user from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_test_project(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select is_test from public.projects where id = p_project_id), false)
$$;

-- ─── Guard: only the service role may change profiles.is_test_user ───────────
-- profiles_update_own (026) lets a user update any column of their own row.
create or replace function guard_profiles_is_test_user()
returns trigger
language plpgsql
as $$
begin
  if new.is_test_user is distinct from old.is_test_user
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'is_test_user can only be changed by the service role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_is_test_user on profiles;
create trigger profiles_guard_is_test_user
  before update of is_test_user on profiles
  for each row execute function guard_profiles_is_test_user();

-- ─── Cascade: a customer's flag applies to all its projects (D5) ─────────────
create or replace function cascade_customer_is_test()
returns trigger
language plpgsql
as $$
begin
  if new.is_test is distinct from old.is_test then
    update projects set is_test = new.is_test where customer_id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_cascade_is_test on customers;
create trigger customers_cascade_is_test
  after update of is_test on customers
  for each row execute function cascade_customer_is_test();

-- ─── Hide test data from everyone but Test Users (restrictive SELECT) ─────────
-- Restrictive policies AND with every permissive one. SELECT visibility also limits UPDATE/DELETE
-- targets, so non-test users can't change rows they can't see.
drop policy if exists customers_test_hidden on customers;
create policy customers_test_hidden on customers as restrictive for select to authenticated
  using (not is_test or get_my_is_test_user());

drop policy if exists projects_test_hidden on projects;
create policy projects_test_hidden on projects as restrictive for select to authenticated
  using (not is_test or get_my_is_test_user());

drop policy if exists tasks_test_hidden on tasks;
create policy tasks_test_hidden on tasks as restrictive for select to authenticated
  using (project_id is null or get_my_is_test_user() or not is_test_project(project_id));

-- (`tickets` is the former `issues` table, renamed in migration 147.)
drop policy if exists tickets_test_hidden on tickets;
create policy tickets_test_hidden on tickets as restrictive for select to authenticated
  using (get_my_is_test_user() or not is_test_project(project_id));

-- ─── Test Users: full access to test data (permissive, ORs with existing) ─────
drop policy if exists customers_test_user_all on customers;
create policy customers_test_user_all on customers for all to authenticated
  using (is_test and get_my_is_test_user())
  with check (is_test and get_my_is_test_user());

drop policy if exists projects_test_user_all on projects;
create policy projects_test_user_all on projects for all to authenticated
  using (is_test and get_my_is_test_user())
  with check (is_test and get_my_is_test_user());

drop policy if exists tasks_test_user_all on tasks;
create policy tasks_test_user_all on tasks for all to authenticated
  using (get_my_is_test_user() and is_test_project(project_id))
  with check (get_my_is_test_user() and is_test_project(project_id));

drop policy if exists tickets_test_user_all on tickets;
create policy tickets_test_user_all on tickets for all to authenticated
  using (get_my_is_test_user() and is_test_project(project_id))
  with check (get_my_is_test_user() and is_test_project(project_id));

drop policy if exists project_phases_test_user_all on project_phases;
create policy project_phases_test_user_all on project_phases for all to authenticated
  using (get_my_is_test_user() and is_test_project(project_id))
  with check (get_my_is_test_user() and is_test_project(project_id));

drop policy if exists project_deliverables_test_user_all on project_deliverables;
create policy project_deliverables_test_user_all on project_deliverables for all to authenticated
  using (get_my_is_test_user() and is_test_project(project_id))
  with check (get_my_is_test_user() and is_test_project(project_id));

drop policy if exists project_members_test_user_all on project_members;
create policy project_members_test_user_all on project_members for all to authenticated
  using (get_my_is_test_user() and is_test_project(project_id))
  with check (get_my_is_test_user() and is_test_project(project_id));

drop policy if exists phase_members_test_user_all on phase_members;
create policy phase_members_test_user_all on phase_members for all to authenticated
  using (get_my_is_test_user() and is_test_project(project_id))
  with check (get_my_is_test_user() and is_test_project(project_id));

drop policy if exists task_comments_test_user_all on task_comments;
create policy task_comments_test_user_all on task_comments for all to authenticated
  using (get_my_is_test_user() and exists (select 1 from tasks t where t.id = task_id and is_test_project(t.project_id)))
  with check (get_my_is_test_user() and exists (select 1 from tasks t where t.id = task_id and is_test_project(t.project_id)));

drop policy if exists ticket_comments_test_user_all on ticket_comments;
create policy ticket_comments_test_user_all on ticket_comments for all to authenticated
  using (get_my_is_test_user() and exists (select 1 from tickets i where i.id = ticket_id and is_test_project(i.project_id)))
  with check (get_my_is_test_user() and exists (select 1 from tickets i where i.id = ticket_id and is_test_project(i.project_id)));

-- ─── Metrics view: exclude test customers (D8). Views run as owner, bypassing RLS. ──
create or replace view vw_hub_metrics as
select
  (select count(*) from customers where status != 'inactive' and not is_test) as customers_total,
  (select count(*) from classification_records) as classifications_total,
  (
    select round(
      100.0 * count(*) filter (where llm_eligible = 'YES') / nullif(count(*), 0),
      1
    )
    from classification_records
  ) as llm_eligible_rate_pct,
  (
    select round(avg(confidence_score)::numeric, 2)
    from classification_records
    where confidence_score is not null
  ) as avg_classification_confidence,
  (select count(*) from requirements_assessments) as assessments_total,
  (
    select round(
      100.0 * count(*) filter (where status in ('APPROVED', 'EXECUTING', 'COMPLETE'))
             / nullif(count(*) filter (where status != 'draft'), 0),
      1
    )
    from implementation_plans
  ) as plan_approval_rate_pct,
  (
    select round(
      100.0 * count(*) filter (where status = 'REJECTED')
             / nullif(count(*) filter (where status != 'draft'), 0),
      1
    )
    from implementation_plans
  ) as plan_rejection_rate_pct,
  (select count(*) from execution_records where status in ('COMPLETED', 'PARTIAL_EXECUTION')) as executions_completed,
  (
    select round(
      100.0 * count(*) filter (where status = 'COMPLETED')
             / nullif(count(*) filter (where status != 'PENDING'), 0),
      1
    )
    from execution_records
  ) as execution_success_rate_pct,
  (select round(sum(cost_usd)::numeric, 4) from llm_invocation_logs where status = 'success') as llm_cost_total_usd,
  (
    select round(sum(cost_usd)::numeric, 4)
    from llm_invocation_logs
    where status = 'success'
      and created_at >= date_trunc('month', now())
  ) as llm_cost_month_usd;
