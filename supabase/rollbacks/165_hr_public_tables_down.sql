-- Rollback for 165_hr_public_tables.sql (task 435). Drops the public hr_* tables. The functions are
-- re-pointed at the hr-schema tables by 164, so run 164's down script afterwards if you want 164 gone too.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hr-holiday-reminders') then
    perform cron.unschedule('hr-holiday-reminders');
  end if;
end $$;

drop table if exists public.hr_holiday_reminders_sent;
drop table if exists public.hr_leave_adjustments;
drop table if exists public.hr_leave_request_notes;
drop table if exists public.hr_leave_allotment_periods;
drop table if exists public.hr_holidays;
drop table if exists public.hr_leave_requests;
drop table if exists public.hr_leave_types;
drop table if exists public.hr_employees;

-- Functions are intentionally kept (164 owns them; their bodies reference public.hr_* after 165).
