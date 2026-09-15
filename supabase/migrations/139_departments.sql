-- Migration 139: Departments (task 366)
-- New lookup table for department-based access control, plus the FK column on
-- `profiles` that assigns a department to a Hub user. Department narrows what a
-- user can see beyond their role for two departments (HR, Finance) — enforced in
-- application code (src/lib/auth/department-map.ts), not RLS. This table only needs
-- to be readable by any signed-in staff member (for the invite/edit dropdowns) and
-- writable only by the service role (adminClient), so RLS here is a simple open
-- `select` with no client-writable policy.

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into departments (name) values
  ('Business Team'),
  ('Enterprise Team'),
  ('HR'),
  ('Project Management'),
  ('Finance')
on conflict (name) do nothing;

alter table profiles
  add column if not exists department_id uuid references departments(id);

alter table departments enable row level security;

create policy "departments_select_authenticated" on departments
  for select
  to authenticated
  using (true);
