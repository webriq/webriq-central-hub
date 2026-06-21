-- Migration 025: v2.0 Schema — Sprint 0A
-- Deploys all new tables, renames customer_projects → projects, widens source enum.
-- §10.6 codebase mapping: https://github.com/webriq/central-hub/blob/main/_docs/plan-v2/WebriQ-Central-Hub-Spec-v2.md#106

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- Extends auth.users with role and optional customer link for client users.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'hr', 'pm', 'developer', 'client')),
  full_name text,
  avatar_url text,
  customer_id text references customers(customer_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── projects (was customer_projects) ─────────────────────────────────────────
alter table customer_projects rename to projects;
alter table projects rename column project_name to name;
alter table projects
  add column status text not null check (status in ('active', 'on_hold', 'completed', 'archived')) default 'active',
  add column customer_product_id uuid references customer_products(id) on delete set null,
  add column description text,
  add column created_by uuid references auth.users(id) on delete set null;

-- Update FK constraint name for clarity
alter table projects rename constraint customer_projects_customer_id_fkey to projects_customer_id_fkey;

-- ─── classification_records.source — widen enum ───────────────────────────────
-- Keep existing zoho_* values during v0.1→v2 transition; retire at Phase 1D cutover.
alter table classification_records
  drop constraint classification_records_source_check;

alter table classification_records
  add constraint classification_records_source_check
    check (source in ('zoho_desk', 'zoho_projects', 'hub_manual', 'portal', 'email', 'manual', 'recurring'));

-- ─── tasks ────────────────────────────────────────────────────────────────────
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  ticket_id uuid null,
  parent_task_id uuid null references tasks(id) on delete cascade,
  title text not null,
  description text,
  task_type text,
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')) default 'normal',
  status text not null check (status in ('backlog', 'todo', 'in_progress', 'for_review', 'done', 'cancelled')) default 'backlog',
  assignees uuid[],
  due_date date,
  estimate_hours numeric(5, 2),
  labels text[],
  position numeric,
  classification_id uuid references classification_records(id) on delete set null,
  github_pr_url text,
  preview_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null,
  filename text not null,
  size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table time_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  employee_id uuid references auth.users(id) on delete set null,
  date_logged date not null,
  hours numeric(5, 2) not null,
  billable boolean not null default true,
  note text,
  source text not null check (source in ('timer', 'manual')) default 'manual',
  timesheet_id uuid null,
  created_at timestamptz not null default now()
);

-- ─── tickets ──────────────────────────────────────────────────────────────────
create table tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number serial unique,
  customer_id text not null references customers(customer_id) on delete cascade,
  customer_product_id uuid references customer_products(id) on delete set null,
  subject text not null,
  channel text not null check (channel in ('portal', 'email', 'manual')),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')) default 'normal',
  status text not null check (status in ('new', 'open', 'waiting_on_client', 'waiting_on_us', 'resolved', 'closed')) default 'new',
  requester_email text,
  requester_profile_id uuid references profiles(id) on delete set null,
  sla_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  classification_id uuid references classification_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deferred FK from tasks to tickets (tickets must exist first)
alter table tasks
  add constraint tasks_ticket_id_fkey
  foreign key (ticket_id) references tickets(id) on delete set null;

create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_type text not null check (author_type in ('client', 'staff', 'system', 'llm_draft')),
  author_id uuid null references auth.users(id) on delete set null,
  body text not null,
  email_message_id text null,
  visibility text not null check (visibility in ('public', 'internal')) default 'public',
  created_at timestamptz not null default now()
);

-- ─── HR schema ────────────────────────────────────────────────────────────────
create schema if not exists hr;

create table hr.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  employee_number text unique,
  full_name text not null,
  department text,
  position text,
  employment_type text not null check (employment_type in ('full_time', 'part_time', 'contract')),
  manager_id uuid null references hr.employees(id) on delete set null,
  date_hired date,
  date_separated date null,
  status text not null check (status in ('active', 'on_leave', 'separated')) default 'active',
  emergency_contact jsonb,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hr.attendance_punches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  punched_at timestamptz not null,
  direction text not null check (direction in ('in', 'out')),
  ip inet null,
  geo point null,
  device text null
);

create table hr.attendance_days (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  work_date date not null,
  status text not null check (status in ('present', 'late', 'half_day', 'absent', 'on_leave', 'holiday', 'rest_day')),
  first_in timestamptz,
  last_out timestamptz,
  total_hours numeric(5, 2),
  correction_of uuid null references hr.attendance_days(id),
  corrected_by uuid null references auth.users(id),
  unique (employee_id, work_date)
);

create table hr.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  paid boolean not null default true,
  accrual_rule jsonb,
  carry_over_cap numeric,
  active boolean not null default true
);

create table hr.leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  leave_type_id uuid not null references hr.leave_types(id) on delete cascade,
  year int not null,
  accrued numeric(5, 2) not null default 0,
  used numeric(5, 2) not null default 0,
  balance numeric(5, 2) generated always as (accrued - used) stored,
  unique (employee_id, leave_type_id, year)
);

create table hr.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  leave_type_id uuid not null references hr.leave_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  reason text,
  attachment_path text null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled')) default 'pending',
  approver_id uuid null references auth.users(id),
  decided_at timestamptz null,
  decision_note text null,
  created_at timestamptz not null default now()
);

create table hr.timesheets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  week_start date not null,
  status text not null check (status in ('draft', 'submitted', 'approved', 'locked')) default 'draft',
  submitted_at timestamptz null,
  approved_by uuid null references auth.users(id),
  approved_at timestamptz null,
  unique (employee_id, week_start)
);

-- Deferred FK from time_logs to hr.timesheets
alter table time_logs
  add constraint time_logs_timesheet_id_fkey
  foreign key (timesheet_id) references hr.timesheets(id) on delete set null;

create table hr.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  pinned boolean not null default false,
  author_id uuid not null references auth.users(id),
  published_at timestamptz not null default now()
);

create table hr.hr_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  request_type text not null,
  details jsonb,
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled')) default 'pending',
  approver_id uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

-- ─── Platform plumbing ────────────────────────────────────────────────────────
create table event_bus (
  id bigserial primary key,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb,
  status text not null check (status in ('pending', 'processing', 'done', 'failed')) default 'pending',
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz null,
  channels_sent text[],
  created_at timestamptz not null default now()
);

create table notification_preferences (
  profile_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  in_app boolean not null default true,
  push boolean not null default false,
  email boolean not null default false,
  primary key (profile_id, event_type)
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ─── Enable RLS on all new tables (policies in migration 026) ─────────────────
alter table profiles enable row level security;
alter table tasks enable row level security;
alter table task_comments enable row level security;
alter table attachments enable row level security;
alter table time_logs enable row level security;
alter table tickets enable row level security;
alter table ticket_messages enable row level security;
alter table event_bus enable row level security;
alter table notifications enable row level security;
alter table notification_preferences enable row level security;
alter table push_subscriptions enable row level security;
alter table audit_logs enable row level security;
alter table hr.employees enable row level security;
alter table hr.attendance_punches enable row level security;
alter table hr.attendance_days enable row level security;
alter table hr.leave_types enable row level security;
alter table hr.leave_balances enable row level security;
alter table hr.leave_requests enable row level security;
alter table hr.timesheets enable row level security;
alter table hr.announcements enable row level security;
alter table hr.hr_requests enable row level security;
