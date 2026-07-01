-- Migration 048: Grant super_admin full RLS parity with admin across all staff tables.
-- Migration 047 added 'super_admin' to the profiles.role CHECK constraint but never
-- updated any RLS policies, leaving super_admin users with empty data on every page.
-- Uses get_my_role() helper (migration 026) — never replicate the role lookup inline.
-- Pattern: DROP POLICY IF EXISTS → CREATE POLICY (Postgres has no CREATE OR REPLACE POLICY).

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- Admins + super_admin can read all profiles; everyone can read their own row.
drop policy if exists "profiles_read_own" on profiles;
create policy "profiles_read_own"
  on profiles for select to authenticated
  using (auth.uid() = id or get_my_role() in ('admin', 'super_admin'));

-- Admin + super_admin: full write on all profile rows.
drop policy if exists "profiles_admin_write" on profiles;
create policy "profiles_admin_write"
  on profiles for all to authenticated
  using (get_my_role() in ('admin', 'super_admin'))
  with check (get_my_role() in ('admin', 'super_admin'));

-- ─── projects ─────────────────────────────────────────────────────────────────
-- All staff except client can read projects.
drop policy if exists "projects_staff_read" on projects;
create policy "projects_staff_read"
  on projects for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr'));

-- PM / Admin / super_admin: full write.
drop policy if exists "projects_pm_write" on projects;
create policy "projects_pm_write"
  on projects for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── tasks ────────────────────────────────────────────────────────────────────
drop policy if exists "tasks_staff_read" on tasks;
create policy "tasks_staff_read"
  on tasks for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

drop policy if exists "tasks_pm_write" on tasks;
create policy "tasks_pm_write"
  on tasks for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── task_comments ────────────────────────────────────────────────────────────
drop policy if exists "task_comments_staff_read" on task_comments;
create policy "task_comments_staff_read"
  on task_comments for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

drop policy if exists "task_comments_staff_insert" on task_comments;
create policy "task_comments_staff_insert"
  on task_comments for insert to authenticated
  with check (
    get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
    and author_id = auth.uid()
  );

-- Own comment delete (+ admin + super_admin).
drop policy if exists "task_comments_delete" on task_comments;
create policy "task_comments_delete"
  on task_comments for delete to authenticated
  using (get_my_role() in ('admin', 'super_admin') or author_id = auth.uid());

-- ─── attachments ──────────────────────────────────────────────────────────────
drop policy if exists "attachments_staff_read" on attachments;
create policy "attachments_staff_read"
  on attachments for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

drop policy if exists "attachments_pm_write" on attachments;
create policy "attachments_pm_write"
  on attachments for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── time_logs ────────────────────────────────────────────────────────────────
drop policy if exists "time_logs_manager_read" on time_logs;
create policy "time_logs_manager_read"
  on time_logs for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'hr'));

-- ─── tickets ──────────────────────────────────────────────────────────────────
drop policy if exists "tickets_staff_all" on tickets;
create policy "tickets_staff_all"
  on tickets for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

-- ─── ticket_messages ──────────────────────────────────────────────────────────
drop policy if exists "ticket_messages_staff_all" on ticket_messages;
create policy "ticket_messages_staff_all"
  on ticket_messages for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

-- ─── event_bus ────────────────────────────────────────────────────────────────
drop policy if exists "event_bus_staff_insert" on event_bus;
create policy "event_bus_staff_insert"
  on event_bus for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

drop policy if exists "event_bus_admin_read" on event_bus;
create policy "event_bus_admin_read"
  on event_bus for select to authenticated
  using (get_my_role() in ('admin', 'super_admin'));

-- ─── audit_logs ───────────────────────────────────────────────────────────────
drop policy if exists "audit_logs_admin_read" on audit_logs;
create policy "audit_logs_admin_read"
  on audit_logs for select to authenticated
  using (get_my_role() in ('admin', 'super_admin'));

-- ─── milestones (migration 033) ───────────────────────────────────────────────
drop policy if exists "milestones_staff_read" on milestones;
create policy "milestones_staff_read"
  on milestones for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

drop policy if exists "milestones_pm_write" on milestones;
create policy "milestones_pm_write"
  on milestones for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── tasklists (migration 035) ────────────────────────────────────────────────
drop policy if exists "tasklists_staff_read" on tasklists;
create policy "tasklists_staff_read"
  on tasklists for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

drop policy if exists "tasklists_pm_write" on tasklists;
create policy "tasklists_pm_write"
  on tasklists for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── hr.employees ─────────────────────────────────────────────────────────────
drop policy if exists "hr_employees_hr_admin_all" on hr.employees;
create policy "hr_employees_hr_admin_all"
  on hr.employees for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr'))
  with check (get_my_role() in ('admin', 'super_admin', 'hr'));

drop policy if exists "hr_employees_pm_read" on hr.employees;
create policy "hr_employees_pm_read"
  on hr.employees for select to authenticated
  using (get_my_role() in ('pm', 'super_admin'));

-- ─── hr.attendance_punches ────────────────────────────────────────────────────
drop policy if exists "hr_attendance_punches_hr_admin" on hr.attendance_punches;
create policy "hr_attendance_punches_hr_admin"
  on hr.attendance_punches for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr'))
  with check (get_my_role() in ('admin', 'super_admin', 'hr'));

-- ─── hr.attendance_days ───────────────────────────────────────────────────────
drop policy if exists "hr_attendance_days_hr_admin" on hr.attendance_days;
create policy "hr_attendance_days_hr_admin"
  on hr.attendance_days for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr'))
  with check (get_my_role() in ('admin', 'super_admin', 'hr'));

drop policy if exists "hr_attendance_days_pm_read" on hr.attendance_days;
create policy "hr_attendance_days_pm_read"
  on hr.attendance_days for select to authenticated
  using (get_my_role() in ('pm', 'super_admin'));

-- ─── hr.leave_types ───────────────────────────────────────────────────────────
drop policy if exists "hr_leave_types_staff_read" on hr.leave_types;
create policy "hr_leave_types_staff_read"
  on hr.leave_types for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr', 'pm', 'developer'));

drop policy if exists "hr_leave_types_hr_admin_write" on hr.leave_types;
create policy "hr_leave_types_hr_admin_write"
  on hr.leave_types for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr'))
  with check (get_my_role() in ('admin', 'super_admin', 'hr'));

-- ─── hr.leave_balances ────────────────────────────────────────────────────────
drop policy if exists "hr_leave_balances_hr_admin" on hr.leave_balances;
create policy "hr_leave_balances_hr_admin"
  on hr.leave_balances for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr'))
  with check (get_my_role() in ('admin', 'super_admin', 'hr'));

-- ─── hr.leave_requests ────────────────────────────────────────────────────────
drop policy if exists "hr_leave_requests_hr_admin" on hr.leave_requests;
create policy "hr_leave_requests_hr_admin"
  on hr.leave_requests for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr'))
  with check (get_my_role() in ('admin', 'super_admin', 'hr'));

drop policy if exists "hr_leave_requests_pm_read" on hr.leave_requests;
create policy "hr_leave_requests_pm_read"
  on hr.leave_requests for select to authenticated
  using (get_my_role() in ('pm', 'super_admin'));

-- ─── hr.timesheets ────────────────────────────────────────────────────────────
drop policy if exists "hr_timesheets_hr_admin" on hr.timesheets;
create policy "hr_timesheets_hr_admin"
  on hr.timesheets for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr'))
  with check (get_my_role() in ('admin', 'super_admin', 'hr'));

drop policy if exists "hr_timesheets_pm_read" on hr.timesheets;
create policy "hr_timesheets_pm_read"
  on hr.timesheets for select to authenticated
  using (get_my_role() in ('pm', 'super_admin'));

-- ─── hr.announcements ─────────────────────────────────────────────────────────
drop policy if exists "hr_announcements_staff_read" on hr.announcements;
create policy "hr_announcements_staff_read"
  on hr.announcements for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr', 'pm', 'developer'));

drop policy if exists "hr_announcements_hr_admin_write" on hr.announcements;
create policy "hr_announcements_hr_admin_write"
  on hr.announcements for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr'))
  with check (get_my_role() in ('admin', 'super_admin', 'hr'));

-- ─── hr.hr_requests ───────────────────────────────────────────────────────────
drop policy if exists "hr_requests_hr_admin" on hr.hr_requests;
create policy "hr_requests_hr_admin"
  on hr.hr_requests for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'hr'))
  with check (get_my_role() in ('admin', 'super_admin', 'hr'));
