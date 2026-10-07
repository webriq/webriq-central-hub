-- Rollback for 164_hr_leave_holidays.sql (task 435). If 165 is applied, run 165's down script first.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hr-holiday-reminders') then
    perform cron.unschedule('hr-holiday-reminders');
  end if;
end $$;

drop policy if exists "hr_leave_requests_reports_decide" on hr.leave_requests;
drop policy if exists "hr_leave_requests_reports_read" on hr.leave_requests;
drop policy if exists "hr_leave_requests_self_cancel" on hr.leave_requests;
drop policy if exists "hr_leave_requests_self_insert" on hr.leave_requests;
drop policy if exists "hr_leave_requests_self_read" on hr.leave_requests;
drop policy if exists "hr_leave_requests_pm_read" on hr.leave_requests;
drop policy if exists "hr_leave_requests_manager_all" on hr.leave_requests;
create policy "hr_leave_requests_hr_admin" on hr.leave_requests for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr')) with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_leave_requests_pm_read" on hr.leave_requests for select to authenticated using (get_my_role() = 'pm');
create policy "hr_leave_requests_developer_own" on hr.leave_requests for all to authenticated
  using (get_my_role() = 'developer' and employee_id in (select id from hr.employees where profile_id = auth.uid()))
  with check (get_my_role() = 'developer' and employee_id in (select id from hr.employees where profile_id = auth.uid()));

drop policy if exists "hr_leave_types_manager_write" on hr.leave_types;
drop policy if exists "hr_leave_types_staff_read" on hr.leave_types;
create policy "hr_leave_types_staff_read" on hr.leave_types for select to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr', 'pm', 'developer'));
create policy "hr_leave_types_hr_admin_write" on hr.leave_types for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr')) with check (get_my_role() in ('super_admin', 'admin', 'hr'));

drop policy if exists "hr_employees_reports_read" on hr.employees;
drop policy if exists "hr_employees_self_read" on hr.employees;
drop policy if exists "hr_employees_pm_read" on hr.employees;
drop policy if exists "hr_employees_manager_all" on hr.employees;
create policy "hr_employees_hr_admin_all" on hr.employees for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr')) with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_employees_pm_read" on hr.employees for select to authenticated using (get_my_role() = 'pm');
create policy "hr_employees_developer_own" on hr.employees for select to authenticated
  using (get_my_role() = 'developer' and profile_id = auth.uid());

alter table hr.leave_requests drop constraint if exists leave_requests_team_emails_max;
alter table hr.leave_requests drop column if exists team_emails;

drop table if exists hr.holiday_reminders_sent;
drop table if exists hr.leave_adjustments;
drop table if exists hr.leave_request_notes;
drop table if exists hr.leave_allotment_periods;
drop table if exists hr.holidays;

drop function if exists public.hr_has_direct_reports();
drop function if exists public.hr_is_direct_report(uuid);
drop function if exists public.hr_my_employee_id();
