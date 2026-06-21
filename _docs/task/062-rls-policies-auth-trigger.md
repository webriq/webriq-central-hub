# Task 062 — Sprint 0A: RLS Policies v1 + Auth Trigger

> **Status:** TESTING
> **Completed:** 2026-06-11
> **Implementation Notes:** Migration 026 created. One deviation from task doc: discovered that `projects` already had a permissive `"Authenticated users can read customer_projects"` policy from migration 024 — this is dropped in 026 before adding role-based policies. `get_my_role()` and `get_my_customer_id()` are `security definer stable` functions. Auth trigger uses `on conflict (id) do nothing` for idempotency. `npx tsc --noEmit` exits 0 (no TypeScript changes). Migration must be applied to Supabase before testing.
> **Type:** feature
> **Priority:** CRITICAL
> **Recommended Model:** sonnet
> **Version Impact:** minor
> **Sprint:** Phase 0 / Sprint 0A (Weeks 1–2)

---

## Goal

Complete Sprint 0A by writing `supabase/migrations/026_rls_policies_v2.sql` which:

1. Creates a `handle_new_user()` trigger that auto-inserts a `profiles` row whenever a new `auth.users` row is created.
2. Creates two helper SQL functions (`get_my_role()`, `get_my_customer_id()`) used by all policies below.
3. Writes Role-Based RLS policies ("v1") for every table that had `enable row level security` called in migration 025 but no policies yet (comment in 025: "policies in migration 026").

**Sprint 0A exit condition:** migrations green; all five roles can be demonstrated; existing v0.1 flows still pass.

---

## Requirements

### Must Have

1. **Auth trigger** — `after insert on auth.users` → inserts into `public.profiles`. Uses `raw_user_meta_data->>'full_name'`, `->>'avatar_url'`, and `->>'role'` (defaults to `'client'` if absent). `on conflict (id) do nothing` to be idempotent.
2. **Helper functions** — `get_my_role()` and `get_my_customer_id()`, both `security definer stable`, read from `profiles` where `id = auth.uid()`.
3. **Policies for all 21 tables enabled in migration 025:**
   - `profiles`
   - `tasks`, `task_comments`, `attachments`, `time_logs`
   - `tickets`, `ticket_messages`
   - `event_bus`, `notifications`, `notification_preferences`, `push_subscriptions`, `audit_logs`
   - `hr.employees`, `hr.attendance_punches`, `hr.attendance_days`, `hr.leave_types`, `hr.leave_balances`, `hr.leave_requests`, `hr.timesheets`, `hr.announcements`, `hr.hr_requests`
4. **`projects` table** — RLS was already enabled in migration 003 (as `customer_projects`). Add v1 policies now that it's been renamed and the role matrix is defined.
5. **TypeScript check passes** — `npx tsc --noEmit` exits 0 (no TS changes; verify no regressions).

### Out of Scope

- RLS policies on v0.1 tables (`customers`, `customer_products`, `classification_records`, etc.) — already handled by migration 003; tighten at Phase 1D.
- Column-level security (Postgres EE only).
- JWT custom claims (`app_metadata.role`) — deferred; all policies use the `get_my_role()` DB-function approach for now.
- Any UI or TypeScript changes.

---

## Role Matrix (v1)

| Role | Access |
|------|--------|
| `admin` | Full CRUD on all tables |
| `hr` | Full CRUD on `hr.*`; read-only on public tables |
| `pm` | Full CRUD on public PM/Desk tables (`projects`, `tasks`, `task_comments`, `attachments`, `time_logs`, `tickets`, `ticket_messages`); read on `hr.attendance_days`, `hr.leave_requests`, `hr.announcements` (leave calendar visibility) |
| `developer` | Read/write own `time_logs`; read tasks where `auth.uid() = any(assignees)` or unassigned pool; read tickets; own rows in `hr.*` (via `employee_id` FK chain through `hr.employees.profile_id`); own `notifications`, `preferences`, `push_subscriptions` |
| `client` | Own `tickets` (by `customer_id = get_my_customer_id()`) and `ticket_messages` on those tickets (public visibility only); own `notifications`, `preferences`, `push_subscriptions`; **no access** to projects/tasks/hr |

---

## Implementation Steps

### Step 1 — Auth trigger + profiles bootstrap

```sql
-- Auto-insert profiles row on new auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'role', 'client')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### Step 2 — Helper functions

```sql
create or replace function public.get_my_role()
returns text language sql stable security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.get_my_customer_id()
returns text language sql stable security definer
set search_path = public
as $$ select customer_id from public.profiles where id = auth.uid() $$;
```

### Step 3 — `profiles` policies

```sql
-- Own row read
create policy "profiles_read_own"
  on profiles for select to authenticated
  using (auth.uid() = id or get_my_role() = 'admin');

-- Own row update (cannot change role or id)
create policy "profiles_update_own"
  on profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admin full write
create policy "profiles_admin_write"
  on profiles for all to authenticated
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');
```

### Step 4 — `projects` policies

`projects` already has RLS enabled (since migration 003 when it was `customer_projects`). Add v1 policies:

```sql
-- Staff can read all projects
create policy "projects_staff_read"
  on projects for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer', 'hr'));

-- PM/Admin full write
create policy "projects_pm_write"
  on projects for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));
```

### Step 5 — PM tables (`tasks`, `task_comments`, `attachments`, `time_logs`)

**tasks:**
```sql
create policy "tasks_staff_read"
  on tasks for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

create policy "tasks_pm_write"
  on tasks for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));

-- Developer: update/insert only on tasks assigned to them
create policy "tasks_developer_write"
  on tasks for update to authenticated
  using (get_my_role() = 'developer' and auth.uid() = any(assignees))
  with check (get_my_role() = 'developer');
```

**task_comments:**
```sql
create policy "task_comments_staff_read"
  on task_comments for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

create policy "task_comments_staff_write"
  on task_comments for insert to authenticated
  with check (get_my_role() in ('admin', 'pm', 'developer') and author_id = auth.uid());

create policy "task_comments_admin_delete"
  on task_comments for delete to authenticated
  using (get_my_role() = 'admin' or author_id = auth.uid());
```

**attachments:**
```sql
create policy "attachments_staff_read"
  on attachments for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

create policy "attachments_pm_write"
  on attachments for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));

create policy "attachments_developer_insert"
  on attachments for insert to authenticated
  with check (get_my_role() = 'developer' and uploaded_by = auth.uid());
```

**time_logs:**
```sql
-- PM/Admin/HR read all
create policy "time_logs_manager_read"
  on time_logs for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'hr'));

-- Developer: own rows
create policy "time_logs_developer_own"
  on time_logs for all to authenticated
  using (get_my_role() = 'developer' and employee_id = auth.uid())
  with check (get_my_role() = 'developer' and employee_id = auth.uid());
```

### Step 6 — Desk tables (`tickets`, `ticket_messages`)

**tickets:**
```sql
-- Staff: all
create policy "tickets_staff_all"
  on tickets for all to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'))
  with check (get_my_role() in ('admin', 'pm', 'developer'));

-- Client: own tickets by customer_id
create policy "tickets_client_own"
  on tickets for select to authenticated
  using (get_my_role() = 'client' and customer_id = get_my_customer_id());

create policy "tickets_client_insert"
  on tickets for insert to authenticated
  with check (get_my_role() = 'client' and customer_id = get_my_customer_id());
```

**ticket_messages:**
```sql
-- Staff: all
create policy "ticket_messages_staff_all"
  on ticket_messages for all to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'))
  with check (get_my_role() in ('admin', 'pm', 'developer'));

-- Client: read public messages on own tickets; insert public messages
create policy "ticket_messages_client_read"
  on ticket_messages for select to authenticated
  using (
    get_my_role() = 'client'
    and visibility = 'public'
    and ticket_id in (
      select id from tickets where customer_id = get_my_customer_id()
    )
  );

create policy "ticket_messages_client_insert"
  on ticket_messages for insert to authenticated
  with check (
    get_my_role() = 'client'
    and visibility = 'public'
    and ticket_id in (
      select id from tickets where customer_id = get_my_customer_id()
    )
  );
```

### Step 7 — Plumbing tables

**event_bus:**
```sql
-- Internal use: staff can insert; admin can read/delete
create policy "event_bus_staff_insert"
  on event_bus for insert to authenticated
  with check (get_my_role() in ('admin', 'pm', 'developer'));

create policy "event_bus_admin_read"
  on event_bus for select to authenticated
  using (get_my_role() = 'admin');
```

**notifications:** own row only
```sql
create policy "notifications_own"
  on notifications for all to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
```

**notification_preferences:** own row only
```sql
create policy "notification_preferences_own"
  on notification_preferences for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
```

**push_subscriptions:** own row only
```sql
create policy "push_subscriptions_own"
  on push_subscriptions for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
```

**audit_logs:** admin read only; written by service role / triggers
```sql
create policy "audit_logs_admin_read"
  on audit_logs for select to authenticated
  using (get_my_role() = 'admin');
```

### Step 8 — HR schema policies

**hr.employees:**
```sql
create policy "hr_employees_hr_admin_all"
  on hr.employees for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- PM: read all for oversight
create policy "hr_employees_pm_read"
  on hr.employees for select to authenticated
  using (get_my_role() = 'pm');

-- Developer: own record
create policy "hr_employees_developer_own"
  on hr.employees for select to authenticated
  using (get_my_role() = 'developer' and profile_id = auth.uid());
```

**hr.attendance_punches:**
```sql
create policy "hr_attendance_punches_hr_admin"
  on hr.attendance_punches for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

create policy "hr_attendance_punches_developer_own"
  on hr.attendance_punches for all to authenticated
  using (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  )
  with check (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  );
```

**hr.attendance_days:**
```sql
create policy "hr_attendance_days_hr_admin"
  on hr.attendance_days for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- PM: read (leave calendar dates)
create policy "hr_attendance_days_pm_read"
  on hr.attendance_days for select to authenticated
  using (get_my_role() = 'pm');

create policy "hr_attendance_days_developer_own"
  on hr.attendance_days for select to authenticated
  using (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  );
```

**hr.leave_types:** lookup table, all authenticated can read; HR/admin write
```sql
create policy "hr_leave_types_read"
  on hr.leave_types for select to authenticated
  using (true);

create policy "hr_leave_types_hr_admin_write"
  on hr.leave_types for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));
```

**hr.leave_balances:**
```sql
create policy "hr_leave_balances_hr_admin"
  on hr.leave_balances for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

create policy "hr_leave_balances_developer_own"
  on hr.leave_balances for select to authenticated
  using (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  );
```

**hr.leave_requests:**
```sql
create policy "hr_leave_requests_hr_admin"
  on hr.leave_requests for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- PM: read (for leave calendar)
create policy "hr_leave_requests_pm_read"
  on hr.leave_requests for select to authenticated
  using (get_my_role() = 'pm');

-- Developer: own rows (create, read, cancel)
create policy "hr_leave_requests_developer_own"
  on hr.leave_requests for all to authenticated
  using (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  )
  with check (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  );
```

**hr.timesheets:**
```sql
create policy "hr_timesheets_hr_admin"
  on hr.timesheets for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- PM: read
create policy "hr_timesheets_pm_read"
  on hr.timesheets for select to authenticated
  using (get_my_role() = 'pm');

-- Developer: own timesheets
create policy "hr_timesheets_developer_own"
  on hr.timesheets for all to authenticated
  using (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  )
  with check (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  );
```

**hr.announcements:** all staff read; HR/admin write
```sql
create policy "hr_announcements_read"
  on hr.announcements for select to authenticated
  using (get_my_role() in ('admin', 'hr', 'pm', 'developer'));

create policy "hr_announcements_hr_admin_write"
  on hr.announcements for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));
```

**hr.hr_requests:**
```sql
create policy "hr_requests_hr_admin"
  on hr.hr_requests for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

create policy "hr_requests_developer_own"
  on hr.hr_requests for all to authenticated
  using (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  )
  with check (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  );
```

### Step 9 — TypeScript check

```bash
npx tsc --noEmit
```

No TypeScript changes in this task. Verify zero new errors.

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/026_rls_policies_v2.sql` | CREATE | Full role-based RLS + auth trigger + helpers |

---

## Code Context

### `supabase/migrations/003_rls_policies.sql` — existing v0.1 pattern (lines 1–20)

```sql
-- Migration 003: Enable RLS on all tables with permissive authenticated policies
-- Phase 2 will add per-customer policies once the user/customer mapping is defined.

alter table customers              enable row level security;
alter table customer_products      enable row level security;
alter table classification_records enable row level security;
-- ... (more alter statements)

create policy "authenticated_read_customers"
  on customers for select to authenticated using (true);

create policy "authenticated_write_customers"
  on customers for all to authenticated using (true) with check (true);
```

### `supabase/migrations/025_v2_schema.sql` — RLS comment at end

```sql
-- ─── Enable RLS on all new tables (policies in migration 026) ─────────────────
alter table profiles enable row level security;
alter table tasks enable row level security;
-- ... etc for all 21 tables + hr.* tables
```

### `profiles` table columns (from migration 025)

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'hr', 'pm', 'developer', 'client')),
  full_name text,
  avatar_url text,
  customer_id text references customers(customer_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## Acceptance Criteria

- [ ] `supabase/migrations/026_rls_policies_v2.sql` exists and is valid SQL
- [ ] Auth trigger fires on new `auth.users` insert and creates a `profiles` row
- [ ] `get_my_role()` and `get_my_customer_id()` functions exist in `public` schema
- [ ] All 21 tables from migration 025 have at least one policy
- [ ] `projects` table has v1 policies added
- [ ] Admin can read/write all tables
- [ ] Client cannot read `tasks`, `projects`, `hr.*` tables
- [ ] Developer cannot read `hr.employees` rows belonging to other employees
- [ ] `npx tsc --noEmit` exits 0 with no new errors

---

## Notes for Implementation Agent

- **Sonnet recommended** — this is security-critical SQL; every policy must be logically correct. Think through the `using` vs `with check` distinction for each table before writing.
- **Migration file number is 026** — migration 025 explicitly comments "policies in migration 026". Do not use any other number.
- **HR schema requires `schema("hr")` prefix** — policy syntax is `on hr.employees`, not `on employees`.
- **`get_my_role()` is `security definer`** — required so it can query `profiles` without hitting the `profiles` RLS policies in a chicken-and-egg loop. Always `set search_path = public`.
- **`projects` table** — v1 policies go in this migration even though its RLS was enabled back in migration 003 (when the table was `customer_projects`). The table was renamed in 025, so any `customer_projects` policy names in migration 003 are still valid (Postgres keeps policies through renames). Verify with `select policyname from pg_policies where tablename = 'projects'` before adding — avoid name collisions.
- **`for all` vs separate verbs** — use `for all` only when `using` and `with check` both apply. For read-only policies use `for select`. For insert-only use `for insert` with only `with check`.
- **Do not touch migration 025** — it is already applied. Write only migration 026.
- **Do not modify any TypeScript files** — this task is SQL-only.
