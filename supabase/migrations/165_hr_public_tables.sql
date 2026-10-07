-- 165_hr_public_tables.sql  (task 435 — WRITTEN, NOT APPLIED by the agent; operator pushes it)
--
-- Supersedes 164 (which built the same feature in the `hr` schema — unreachable through the Data API).
-- Leave / holiday half of HR. Tables live in `public` with an `hr_` prefix (NOT the `hr` schema
-- from 025): the Supabase project cannot expose extra schemas to the Data API (PGRST106), so
-- PostgREST could never reach them. The unused hr.* tables from 025/026/048 are left untouched.
--   * hr_employees / hr_leave_types / hr_leave_requests — the working copies the app uses
--   * holidays, range-based allotments, admin-only notes, opening-used adjustments, reminder dedupe
--   * RLS via get_my_role() incl. super_admin / marketing, self-cancel, reporting-manager access
--   * daily pg_cron job for the 3-day holiday reminder (Vault pattern from 077)

create extension if not exists btree_gist;

-- ─── Clean up the unreachable hr-schema objects 164 created (new tables only; the legacy
-- 025 tables, their seeds/backfill and the widened policies on them are harmless and left) ───
drop table if exists hr.holiday_reminders_sent;
drop table if exists hr.leave_adjustments;
drop table if exists hr.leave_request_notes;
drop table if exists hr.leave_allotment_periods;
drop table if exists hr.holidays;

-- ─── Core tables ──────────────────────────────────────────────────────────────
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  employee_number text unique,
  full_name text not null,
  department text,
  position text,
  employment_type text not null default 'full_time' check (employment_type in ('full_time', 'part_time', 'contract')),
  manager_id uuid null references public.hr_employees(id) on delete set null,
  date_hired date,
  date_separated date null,
  status text not null default 'active' check (status in ('active', 'on_leave', 'separated')),
  emergency_contact jsonb,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hr_employees_manager_idx on public.hr_employees (manager_id);

create table if not exists public.hr_leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  paid boolean not null default true,
  accrual_rule jsonb,
  carry_over_cap numeric,
  active boolean not null default true
);

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type_id uuid not null references public.hr_leave_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  reason text,
  attachment_path text null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approver_id uuid null references auth.users(id),
  decided_at timestamptz null,
  decision_note text null,
  team_emails text[] not null default '{}' check (cardinality(team_emails) <= 10),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists hr_leave_requests_employee_idx on public.hr_leave_requests (employee_id, start_date);
create index if not exists hr_leave_requests_status_idx on public.hr_leave_requests (status, start_date);

-- ─── Feature tables ───────────────────────────────────────────────────────────
create table if not exists public.hr_holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holiday_date date not null,
  kind text not null default 'regular' check (kind in ('regular', 'special', 'company')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (holiday_date, name)
);
create index if not exists hr_holidays_date_idx on public.hr_holidays (holiday_date);

create table if not exists public.hr_leave_allotment_periods (
  id uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references public.hr_leave_types(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  days_allotted numeric(5, 2) null check (days_allotted is null or days_allotted >= 0), -- null = unlimited
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  exclude using gist (
    leave_type_id with =,
    (daterange(period_start, period_end, '[]')) with &&
  )
);

create table if not exists public.hr_leave_request_notes (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.hr_leave_requests(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists hr_leave_request_notes_req_idx on public.hr_leave_request_notes (leave_request_id, created_at);

create table if not exists public.hr_leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type_id uuid not null references public.hr_leave_types(id) on delete cascade,
  period_id uuid not null references public.hr_leave_allotment_periods(id) on delete cascade,
  days_used_before numeric(5, 2) not null default 0 check (days_used_before >= 0),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (employee_id, period_id)
);

create table if not exists public.hr_holiday_reminders_sent (
  holiday_id uuid not null references public.hr_holidays(id) on delete cascade,
  days_before int not null,
  sent_at timestamptz not null default now(),
  primary key (holiday_id, days_before)
);

grant select, insert, update, delete on
  public.hr_employees, public.hr_leave_types, public.hr_leave_requests, public.hr_holidays,
  public.hr_leave_allotment_periods, public.hr_leave_request_notes, public.hr_leave_adjustments,
  public.hr_holiday_reminders_sent
to authenticated, service_role;

-- ─── Seeds & backfill ─────────────────────────────────────────────────────────
insert into public.hr_leave_types (name, code, paid) values
  ('Mandatory holidays',      'mandatory_holidays',  true),
  ('Paid time off',           'paid_time_off',       true),
  ('Personal and sick leave', 'personal_sick_leave', true)
on conflict (code) do nothing;

insert into public.hr_employees (profile_id, full_name, employment_type, status)
select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed user'), 'full_time', 'active'
from public.profiles p
where p.role <> 'client'
on conflict (profile_id) do nothing;

-- ─── RLS helpers (security definer — migration 121 anti-recursion pattern) ───
create or replace function public.hr_my_employee_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.hr_employees where profile_id = auth.uid() limit 1;
$$;

create or replace function public.hr_is_direct_report(p_employee_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hr_employees e
    where e.id = p_employee_id
      and e.manager_id is not null
      and e.manager_id = public.hr_my_employee_id()
      and e.id <> e.manager_id
  );
$$;

-- Lets the hub layout decide whether to show "Team requests".
create or replace function public.hr_has_direct_reports()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.hr_employees where manager_id = public.hr_my_employee_id());
$$;

grant execute on function public.hr_my_employee_id() to authenticated;
grant execute on function public.hr_is_direct_report(uuid) to authenticated;
grant execute on function public.hr_has_direct_reports() to authenticated;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.hr_employees              enable row level security;
alter table public.hr_leave_types            enable row level security;
alter table public.hr_leave_requests         enable row level security;
alter table public.hr_holidays               enable row level security;
alter table public.hr_leave_allotment_periods enable row level security;
alter table public.hr_leave_request_notes    enable row level security;
alter table public.hr_leave_adjustments      enable row level security;
alter table public.hr_holiday_reminders_sent enable row level security; -- no policies: service role only

-- hr_employees
create policy "hr_employees_manager_all" on public.hr_employees for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr'))
  with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_employees_pm_read" on public.hr_employees for select to authenticated
  using (get_my_role() = 'pm');
create policy "hr_employees_self_read" on public.hr_employees for select to authenticated
  using (get_my_role() <> 'client' and profile_id = auth.uid());
create policy "hr_employees_reports_read" on public.hr_employees for select to authenticated
  using (public.hr_is_direct_report(id));

-- hr_leave_types
create policy "hr_leave_types_staff_read" on public.hr_leave_types for select to authenticated
  using (get_my_role() <> 'client');
create policy "hr_leave_types_manager_write" on public.hr_leave_types for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr'))
  with check (get_my_role() in ('super_admin', 'admin', 'hr'));

-- hr_leave_requests
create policy "hr_leave_requests_manager_all" on public.hr_leave_requests for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr'))
  with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_leave_requests_pm_read" on public.hr_leave_requests for select to authenticated
  using (get_my_role() = 'pm');
create policy "hr_leave_requests_self_read" on public.hr_leave_requests for select to authenticated
  using (get_my_role() <> 'client' and employee_id = public.hr_my_employee_id());
create policy "hr_leave_requests_self_insert" on public.hr_leave_requests for insert to authenticated
  with check (
    get_my_role() <> 'client'
    and employee_id = public.hr_my_employee_id()
    and status = 'pending'
  );
-- Staff may only cancel their own request while it is still pending.
create policy "hr_leave_requests_self_cancel" on public.hr_leave_requests for update to authenticated
  using (get_my_role() <> 'client' and employee_id = public.hr_my_employee_id() and status = 'pending')
  with check (employee_id = public.hr_my_employee_id() and status in ('pending', 'cancelled'));
-- Reporting manager: read + decide direct reports' requests.
create policy "hr_leave_requests_reports_read" on public.hr_leave_requests for select to authenticated
  using (public.hr_is_direct_report(employee_id));
create policy "hr_leave_requests_reports_decide" on public.hr_leave_requests for update to authenticated
  using (public.hr_is_direct_report(employee_id))
  with check (public.hr_is_direct_report(employee_id) and status in ('pending', 'approved', 'rejected', 'cancelled'));

-- hr_holidays + hr_leave_allotment_periods: everyone (non-client) reads, managers write
create policy "hr_holidays_staff_read" on public.hr_holidays for select to authenticated
  using (get_my_role() <> 'client');
create policy "hr_holidays_manager_write" on public.hr_holidays for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr'))
  with check (get_my_role() in ('super_admin', 'admin', 'hr'));

create policy "hr_allotments_staff_read" on public.hr_leave_allotment_periods for select to authenticated
  using (get_my_role() <> 'client');
create policy "hr_allotments_manager_write" on public.hr_leave_allotment_periods for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr'))
  with check (get_my_role() in ('super_admin', 'admin', 'hr'));

-- Admin notes are internal: managers only (never staff, PM, or reporting managers).
create policy "hr_request_notes_manager" on public.hr_leave_request_notes for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr'))
  with check (get_my_role() in ('super_admin', 'admin', 'hr') and author_id = auth.uid());

-- hr_leave_adjustments
create policy "hr_adjustments_manager" on public.hr_leave_adjustments for all to authenticated
  using (get_my_role() in ('super_admin', 'admin', 'hr'))
  with check (get_my_role() in ('super_admin', 'admin', 'hr'));
create policy "hr_adjustments_self_read" on public.hr_leave_adjustments for select to authenticated
  using (get_my_role() <> 'client' and employee_id = public.hr_my_employee_id());
create policy "hr_adjustments_reports_read" on public.hr_leave_adjustments for select to authenticated
  using (public.hr_is_direct_report(employee_id));

-- ─── Daily holiday reminder (pg_cron → pg_net, Vault secrets from 077/078) ───
-- 16:05 UTC = 00:05 Asia/Manila (UTC+8, no DST). The route computes "today + 3" in HR_TIMEZONE.
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
