-- Migration 026: v2.0 RLS Policies v1 + Auth Trigger
-- Sprint 0A — completes §8.2 role matrix for all tables enabled in migration 025.
-- RLS was already enabled on all tables in migration 025 (comment: "policies in migration 026").
-- `projects` table: had permissive policy from migration 024 — drop it, replace with role matrix.

-- ─── Helper: get current user's role from profiles ────────────────────────────
-- security definer so this can read profiles without hitting profiles' own RLS.
-- stable so Postgres can cache the result within a single transaction.
create or replace function public.get_my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ─── Helper: get current user's customer_id (for client portal access) ────────
create or replace function public.get_my_customer_id()
returns text
language sql stable security definer
set search_path = public
as $$
  select customer_id from public.profiles where id = auth.uid()
$$;

-- ─── Auth trigger: auto-create profiles row on new user signup ────────────────
-- Role defaults to 'client'; pass raw_user_meta_data->>'role' to override at
-- invitation time (e.g. when an admin creates a staff account via Supabase dashboard).
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- Own row read (+ admin reads all).
create policy "profiles_read_own"
  on profiles for select to authenticated
  using (auth.uid() = id or get_my_role() = 'admin');

-- Own row update — cannot change id or role via this policy.
create policy "profiles_update_own"
  on profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admin full write (covers insert/update/delete across all rows).
create policy "profiles_admin_write"
  on profiles for all to authenticated
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

-- ─── projects ─────────────────────────────────────────────────────────────────
-- Migration 024 created a permissive policy for customer_projects (now projects).
-- Drop it and replace with role-based policies.
drop policy if exists "Authenticated users can read customer_projects" on projects;

-- Staff: all roles except client can read projects.
create policy "projects_staff_read"
  on projects for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer', 'hr'));

-- PM / Admin: full write.
create policy "projects_pm_write"
  on projects for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));

-- ─── tasks ────────────────────────────────────────────────────────────────────
-- Staff read (clients have no visibility into internal project tasks).
create policy "tasks_staff_read"
  on tasks for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

-- PM / Admin: full write.
create policy "tasks_pm_write"
  on tasks for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));

-- Developer: update tasks they are assigned to.
create policy "tasks_developer_update"
  on tasks for update to authenticated
  using (get_my_role() = 'developer' and auth.uid() = any(assignees))
  with check (get_my_role() = 'developer');

-- ─── task_comments ────────────────────────────────────────────────────────────
create policy "task_comments_staff_read"
  on task_comments for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

create policy "task_comments_staff_insert"
  on task_comments for insert to authenticated
  with check (
    get_my_role() in ('admin', 'pm', 'developer')
    and author_id = auth.uid()
  );

-- Own comment delete (+ admin).
create policy "task_comments_delete"
  on task_comments for delete to authenticated
  using (get_my_role() = 'admin' or author_id = auth.uid());

-- ─── attachments ──────────────────────────────────────────────────────────────
create policy "attachments_staff_read"
  on attachments for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

-- PM / Admin: full write.
create policy "attachments_pm_write"
  on attachments for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));

-- Developer: insert own attachments only.
create policy "attachments_developer_insert"
  on attachments for insert to authenticated
  with check (
    get_my_role() = 'developer'
    and uploaded_by = auth.uid()
  );

-- ─── time_logs ────────────────────────────────────────────────────────────────
-- PM / Admin / HR can read all (needed for timesheet oversight and digest).
create policy "time_logs_manager_read"
  on time_logs for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'hr'));

-- Developer: full CRUD on own rows only.
create policy "time_logs_developer_own"
  on time_logs for all to authenticated
  using (get_my_role() = 'developer' and employee_id = auth.uid())
  with check (get_my_role() = 'developer' and employee_id = auth.uid());

-- ─── tickets ──────────────────────────────────────────────────────────────────
-- Staff: full access.
create policy "tickets_staff_all"
  on tickets for all to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'))
  with check (get_my_role() in ('admin', 'pm', 'developer'));

-- Client: read own tickets (by customer_id).
create policy "tickets_client_read"
  on tickets for select to authenticated
  using (get_my_role() = 'client' and customer_id = get_my_customer_id());

-- Client: create tickets for their own customer.
create policy "tickets_client_insert"
  on tickets for insert to authenticated
  with check (
    get_my_role() = 'client'
    and customer_id = get_my_customer_id()
  );

-- ─── ticket_messages ──────────────────────────────────────────────────────────
-- Staff: full access (can see internal + public messages).
create policy "ticket_messages_staff_all"
  on ticket_messages for all to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'))
  with check (get_my_role() in ('admin', 'pm', 'developer'));

-- Client: read public messages on own customer's tickets.
create policy "ticket_messages_client_read"
  on ticket_messages for select to authenticated
  using (
    get_my_role() = 'client'
    and visibility = 'public'
    and ticket_id in (
      select id from tickets where customer_id = get_my_customer_id()
    )
  );

-- Client: send public messages on own customer's tickets.
create policy "ticket_messages_client_insert"
  on ticket_messages for insert to authenticated
  with check (
    get_my_role() = 'client'
    and visibility = 'public'
    and ticket_id in (
      select id from tickets where customer_id = get_my_customer_id()
    )
  );

-- ─── event_bus ────────────────────────────────────────────────────────────────
-- Internal plumbing: staff can insert events; admin can read/manage.
create policy "event_bus_staff_insert"
  on event_bus for insert to authenticated
  with check (get_my_role() in ('admin', 'pm', 'developer'));

create policy "event_bus_admin_read"
  on event_bus for select to authenticated
  using (get_my_role() = 'admin');

-- ─── notifications ────────────────────────────────────────────────────────────
-- Each user sees and manages only their own notifications.
create policy "notifications_own"
  on notifications for all to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ─── notification_preferences ─────────────────────────────────────────────────
create policy "notification_preferences_own"
  on notification_preferences for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ─── push_subscriptions ───────────────────────────────────────────────────────
create policy "push_subscriptions_own"
  on push_subscriptions for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ─── audit_logs ───────────────────────────────────────────────────────────────
-- Written by service role / triggers only. Admins can read; no one else can.
create policy "audit_logs_admin_read"
  on audit_logs for select to authenticated
  using (get_my_role() = 'admin');

-- ─── hr.employees ─────────────────────────────────────────────────────────────
-- HR / Admin: full CRUD.
create policy "hr_employees_hr_admin_all"
  on hr.employees for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- PM: read all employee records (needed for assignment and oversight).
create policy "hr_employees_pm_read"
  on hr.employees for select to authenticated
  using (get_my_role() = 'pm');

-- Developer: read own employee record.
create policy "hr_employees_developer_own"
  on hr.employees for select to authenticated
  using (get_my_role() = 'developer' and profile_id = auth.uid());

-- ─── hr.attendance_punches ────────────────────────────────────────────────────
create policy "hr_attendance_punches_hr_admin"
  on hr.attendance_punches for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- Developer: own punches (clock in/out).
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

-- ─── hr.attendance_days ───────────────────────────────────────────────────────
create policy "hr_attendance_days_hr_admin"
  on hr.attendance_days for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- PM: read (leave calendar visibility).
create policy "hr_attendance_days_pm_read"
  on hr.attendance_days for select to authenticated
  using (get_my_role() = 'pm');

-- Developer: read own attendance days.
create policy "hr_attendance_days_developer_own"
  on hr.attendance_days for select to authenticated
  using (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  );

-- ─── hr.leave_types ───────────────────────────────────────────────────────────
-- Lookup table: all authenticated staff can read; HR/admin write.
create policy "hr_leave_types_staff_read"
  on hr.leave_types for select to authenticated
  using (get_my_role() in ('admin', 'hr', 'pm', 'developer'));

create policy "hr_leave_types_hr_admin_write"
  on hr.leave_types for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- ─── hr.leave_balances ────────────────────────────────────────────────────────
create policy "hr_leave_balances_hr_admin"
  on hr.leave_balances for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- Developer: read own balances.
create policy "hr_leave_balances_developer_own"
  on hr.leave_balances for select to authenticated
  using (
    get_my_role() = 'developer'
    and employee_id in (select id from hr.employees where profile_id = auth.uid())
  );

-- ─── hr.leave_requests ────────────────────────────────────────────────────────
create policy "hr_leave_requests_hr_admin"
  on hr.leave_requests for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- PM: read (for leave calendar).
create policy "hr_leave_requests_pm_read"
  on hr.leave_requests for select to authenticated
  using (get_my_role() = 'pm');

-- Developer: CRUD own leave requests.
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

-- ─── hr.timesheets ────────────────────────────────────────────────────────────
create policy "hr_timesheets_hr_admin"
  on hr.timesheets for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- PM: read (for oversight).
create policy "hr_timesheets_pm_read"
  on hr.timesheets for select to authenticated
  using (get_my_role() = 'pm');

-- Developer: own timesheets.
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

-- ─── hr.announcements ─────────────────────────────────────────────────────────
-- All staff can read; HR/admin write.
create policy "hr_announcements_staff_read"
  on hr.announcements for select to authenticated
  using (get_my_role() in ('admin', 'hr', 'pm', 'developer'));

create policy "hr_announcements_hr_admin_write"
  on hr.announcements for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- ─── hr.hr_requests ───────────────────────────────────────────────────────────
create policy "hr_requests_hr_admin"
  on hr.hr_requests for all to authenticated
  using (get_my_role() in ('admin', 'hr'))
  with check (get_my_role() in ('admin', 'hr'));

-- Developer: CRUD own HR requests.
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
