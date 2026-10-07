-- 164_hr_leave_holidays.sql  (task 435 — APPLIED by the operator)
--
-- First attempt: built the leave/holiday tables in the `hr` schema. The Supabase project cannot
-- expose `hr` to the Data API (PGRST106), so 165_hr_public_tables.sql moves the feature to
-- public.hr_* tables and drops the new hr.* tables created here. Kept as-is for migration history.

create extension if not exists btree_gist;

grant usage on schema hr to authenticated, service_role;
grant select, insert, update, delete on all tables in schema hr to authenticated, service_role;
alter default privileges in schema hr
  grant select, insert, update, delete on tables to authenticated, service_role;

create table if not exists hr.holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holiday_date date not null,
  kind text not null default 'regular' check (kind in ('regular', 'special', 'company')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (holiday_date, name)
);
create index if not exists holidays_date_idx on hr.holidays (holiday_date);

create table if not exists hr.leave_allotment_periods (
  id uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references hr.leave_types(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  days_allotted numeric(5, 2) null check (days_allotted is null or days_allotted >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  exclude using gist (
    leave_type_id with =,
    (daterange(period_start, period_end, '[]')) with &&
  )
);

create table if not exists hr.leave_request_notes (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references hr.leave_requests(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists leave_request_notes_req_idx on hr.leave_request_notes (leave_request_id, created_at);

create table if not exists hr.leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  leave_type_id uuid not null references hr.leave_types(id) on delete cascade,
  period_id uuid not null references hr.leave_allotment_periods(id) on delete cascade,
  days_used_before numeric(5, 2) not null default 0 check (days_used_before >= 0),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (employee_id, period_id)
);

create table if not exists hr.holiday_reminders_sent (
  holiday_id uuid not null references hr.holidays(id) on delete cascade,
  days_before int not null,
  sent_at timestamptz not null default now(),
  primary key (holiday_id, days_before)
);

alter table hr.leave_requests add column if not exists team_emails text[] not null default '{}';
alter table hr.leave_requests drop constraint if exists leave_requests_team_emails_max;
alter table hr.leave_requests add constraint leave_requests_team_emails_max check (cardinality(team_emails) <= 10);
create index if not exists leave_requests_employee_idx on hr.leave_requests (employee_id, start_date);
create index if not exists leave_requests_status_idx on hr.leave_requests (status, start_date);

insert into hr.leave_types (name, code, paid) values
  ('Mandatory holidays',      'mandatory_holidays',  true),
  ('Paid time off',           'paid_time_off',       true),
  ('Personal and sick leave', 'personal_sick_leave', true)
on conflict (code) do nothing;

insert into hr.employees (profile_id, full_name, employment_type, status)
select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed user'), 'full_time', 'active'
from public.profiles p
where p.role <> 'client'
  and not exists (select 1 from hr.employees e where e.profile_id = p.id);

create or replace function public.hr_my_employee_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from hr.employees where profile_id = auth.uid() limit 1;
$$;

create or replace function public.hr_is_direct_report(p_employee_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from hr.employees e
    where e.id = p_employee_id
      and e.manager_id is not null
      and e.manager_id = public.hr_my_employee_id()
      and e.id <> e.manager_id
  );
$$;

create or replace function public.hr_has_direct_reports()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from hr.employees where manager_id = public.hr_my_employee_id());
$$;

grant execute on function public.hr_my_employee_id() to authenticated;
grant execute on function public.hr_is_direct_report(uuid) to authenticated;
grant execute on function public.hr_has_direct_reports() to authenticated;

alter table hr.holidays                enable row level security;
alter table hr.leave_allotment_periods enable row level security;
alter table hr.leave_request_notes     enable row level security;
alter table hr.leave_adjustments       enable row level security;
alter table hr.holiday_reminders_sent  enable row level security;

create policy "hr_holidays_staff_read" on hr.holidays for select to authenticated using (get_my_role() <> 'client');
create policy "hr_holidays_manager_write" on hr.holidays for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr')) with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_allotments_staff_read" on hr.leave_allotment_periods for select to authenticated using (get_my_role() <> 'client');
create policy "hr_allotments_manager_write" on hr.leave_allotment_periods for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr')) with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_request_notes_manager" on hr.leave_request_notes for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr'))
  with check (get_my_role() in ('super_admin', 'admin', 'hr') and author_id = auth.uid());
create policy "hr_adjustments_manager" on hr.leave_adjustments for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr')) with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_adjustments_self_read" on hr.leave_adjustments for select to authenticated
  using (get_my_role() <> 'client' and employee_id = public.hr_my_employee_id());
create policy "hr_adjustments_reports_read" on hr.leave_adjustments for select to authenticated
  using (public.hr_is_direct_report(employee_id));

drop policy if exists "hr_employees_hr_admin_all" on hr.employees;
drop policy if exists "hr_employees_pm_read" on hr.employees;
drop policy if exists "hr_employees_developer_own" on hr.employees;
create policy "hr_employees_manager_all" on hr.employees for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr')) with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_employees_pm_read" on hr.employees for select to authenticated using (get_my_role() = 'pm');
create policy "hr_employees_self_read" on hr.employees for select to authenticated
  using (get_my_role() <> 'client' and profile_id = auth.uid());
create policy "hr_employees_reports_read" on hr.employees for select to authenticated using (public.hr_is_direct_report(id));

drop policy if exists "hr_leave_types_staff_read" on hr.leave_types;
drop policy if exists "hr_leave_types_hr_admin_write" on hr.leave_types;
create policy "hr_leave_types_staff_read" on hr.leave_types for select to authenticated using (get_my_role() <> 'client');
create policy "hr_leave_types_manager_write" on hr.leave_types for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr')) with check (get_my_role() in ('super_admin', 'admin', 'hr'));

drop policy if exists "hr_leave_requests_hr_admin" on hr.leave_requests;
drop policy if exists "hr_leave_requests_pm_read" on hr.leave_requests;
drop policy if exists "hr_leave_requests_developer_own" on hr.leave_requests;
create policy "hr_leave_requests_manager_all" on hr.leave_requests for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr')) with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_leave_requests_pm_read" on hr.leave_requests for select to authenticated using (get_my_role() = 'pm');
create policy "hr_leave_requests_self_read" on hr.leave_requests for select to authenticated
  using (get_my_role() <> 'client' and employee_id = public.hr_my_employee_id());
create policy "hr_leave_requests_self_insert" on hr.leave_requests for insert to authenticated
  with check (get_my_role() <> 'client' and employee_id = public.hr_my_employee_id() and status = 'pending');
create policy "hr_leave_requests_self_cancel" on hr.leave_requests for update to authenticated
  using (get_my_role() <> 'client' and employee_id = public.hr_my_employee_id() and status = 'pending')
  with check (employee_id = public.hr_my_employee_id() and status in ('pending', 'cancelled'));
create policy "hr_leave_requests_reports_read" on hr.leave_requests for select to authenticated using (public.hr_is_direct_report(employee_id));
create policy "hr_leave_requests_reports_decide" on hr.leave_requests for update to authenticated
  using (public.hr_is_direct_report(employee_id))
  with check (public.hr_is_direct_report(employee_id) and status in ('pending', 'approved', 'rejected', 'cancelled'));

create extension if not exists supabase_vault cascade;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hr-holiday-reminders') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'hr-holiday-reminders'),
      schedule := '5 16 * * *',
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/hr/holiday-reminders',
          body    := '{}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  else
    perform cron.schedule(
      'hr-holiday-reminders',
      '5 16 * * *',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/hr/holiday-reminders',
          body    := '{}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  end if;
end $$;
