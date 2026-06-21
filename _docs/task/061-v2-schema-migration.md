# Task 061 — Sprint 0A: v2.0 Schema Migration

> **Status:** TESTING
> **Completed:** 2026-06-11
> **Implementation Notes:** Migration 025 creates all new tables including the `hr` schema. `client.tsx` was not in the original file list but required 3 fixes (`proj.project_name` → `proj.name`, `editProject.project_name` → `editProject.name`, import rename). The `projects` table API response now uses `name` instead of `project_name` — any component that calls `GET /api/projects` and reads `project_name` from the response will need updating (the task 056/057 create-task modals are candidates to check).
> **Priority:** CRITICAL
> **Type:** feature
> **Recommended Model:** sonnet
> **Sprint:** Phase 0 / Sprint 0A (Weeks 1–2)

---

## Goal

Deploy the full v2.0 Supabase schema on the existing v0.1 database via a single migration file. This is the foundational Sprint 0A deliverable — every other Sprint 0A item (auth wiring, RLS matrix, event bus) depends on these tables existing first.

Simultaneously apply the §10.6 codebase mapping: rename `customer_projects` → `projects` in all TypeScript code, update `database.ts` types, and widen the `classification_records.source` constraint. Existing onboarding and classification flows must continue to work after this migration.

---

## Requirements

### Must Have

1. **`profiles` table** — extends `auth.users`; `role` enum `(admin|hr|pm|developer|client)`; `customer_id` FK for client users; needed by `hr.employees` FK.
2. **Rename `customer_projects` → `projects`** — add `status`, `customer_product_id`, `description`, `created_by` columns; rename `project_name` → `name`.
3. **Widen `classification_records.source`** — constraint must accept `portal | email | manual | recurring | hub_manual` (read current constraint from migration 022 before writing the ALTER).
4. **New PM tables** — `tasks`, `task_comments`, `attachments`, `time_logs` per §8.3.
5. **New Desk tables** — `tickets`, `ticket_messages` per §8.3.
6. **`hr` schema + 9 tables** — `hr.employees`, `hr.attendance_punches`, `hr.attendance_days`, `hr.leave_types`, `hr.leave_balances`, `hr.leave_requests`, `hr.timesheets`, `hr.announcements`, `hr.hr_requests`.
7. **Plumbing tables** — `event_bus`, `notifications`, `notification_preferences`, `push_subscriptions`, `audit_logs`.
8. **TypeScript types updated** — `src/types/database.ts` reflects all new/renamed tables.
9. **All `customer_projects` code references renamed to `projects`** — 13 files listed in File Changes.
10. **TypeScript check passes** — `npx tsc --noEmit` exits 0 after all changes.

### Out of Scope (Separate Tasks)

- RLS policies for new tables (Task 062)
- Supabase Auth trigger to auto-create `profiles` rows (Task 062)
- Retiring `src/app/api/webhooks/`, `src/app/api/zoho/`, `src/lib/zoho/` (separate task — keep working until event bus is live)
- Any UI changes

---

## Implementation Steps

### Step 1 — Read current classification source constraint

Before writing the migration, read `supabase/migrations/022_classification_source_hub_manual.sql` to discover the exact current CHECK values on `classification_records.source`. The ALTER TABLE in step 2 must include all existing valid values plus the new ones.

### Step 2 — Write `supabase/migrations/025_v2_schema.sql`

Create the migration file. Sections in order:

#### 2a. `profiles` table

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','hr','pm','developer','client')),
  full_name text,
  avatar_url text,
  customer_id text references customers(customer_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Enable RLS immediately (policies come in Task 062 — no policies here, just `enable row level security`).

#### 2b. Rename `customer_projects` → `projects` + add columns

```sql
-- Rename table
alter table customer_projects rename to projects;

-- Rename project_name → name
alter table projects rename column project_name to name;

-- Add v2 columns (keep existing zoho_project_id, sanity_project_id, github_repo — retire in Phase 1D)
alter table projects
  add column status text not null check (status in ('active','on_hold','completed','archived')) default 'active',
  add column customer_product_id uuid references customer_products(id) on delete set null,
  add column description text,
  add column created_by uuid references auth.users(id) on delete set null;
```

#### 2c. Widen `classification_records.source`

Read the existing constraint name from migration 022, then:

```sql
alter table classification_records
  drop constraint <existing_source_constraint_name>;

alter table classification_records
  add constraint classification_records_source_check
  check (source in ('portal','email','manual','recurring','hub_manual'));
```

#### 2d. New PM tables

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  ticket_id uuid null,           -- FK added after tickets table
  parent_task_id uuid null references tasks(id) on delete cascade,
  title text not null,
  description text,
  task_type text,
  priority text not null check (priority in ('low','normal','high','critical')) default 'normal',
  status text not null check (status in ('backlog','todo','in_progress','for_review','done','cancelled')) default 'backlog',
  assignees uuid[],
  due_date date,
  estimate_hours numeric(5,2),
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
  hours numeric(5,2) not null,
  billable boolean not null default true,
  note text,
  source text not null check (source in ('timer','manual')) default 'manual',
  timesheet_id uuid null,        -- FK added after hr.timesheets
  created_at timestamptz not null default now()
);
```

#### 2e. Desk tables

```sql
create table tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number serial unique,
  customer_id text not null references customers(customer_id) on delete cascade,
  customer_product_id uuid references customer_products(id) on delete set null,
  subject text not null,
  channel text not null check (channel in ('portal','email','manual')),
  priority text not null check (priority in ('low','normal','high','critical')) default 'normal',
  status text not null check (status in ('new','open','waiting_on_client','waiting_on_us','resolved','closed')) default 'new',
  requester_email text,
  requester_profile_id uuid references profiles(id) on delete set null,
  sla_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  classification_id uuid references classification_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add deferred FK from tasks to tickets
alter table tasks add constraint tasks_ticket_id_fkey
  foreign key (ticket_id) references tickets(id) on delete set null;

create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_type text not null check (author_type in ('client','staff','system','llm_draft')),
  author_id uuid null references auth.users(id) on delete set null,
  body text not null,
  email_message_id text null,
  visibility text not null check (visibility in ('public','internal')) default 'public',
  created_at timestamptz not null default now()
);
```

#### 2f. HR schema

```sql
create schema if not exists hr;

create table hr.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  employee_number text unique,
  full_name text not null,
  department text,
  position text,
  employment_type text not null check (employment_type in ('full_time','part_time','contract')),
  manager_id uuid null references hr.employees(id) on delete set null,
  date_hired date,
  date_separated date null,
  status text not null check (status in ('active','on_leave','separated')) default 'active',
  emergency_contact jsonb,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hr.attendance_punches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  punched_at timestamptz not null,
  direction text not null check (direction in ('in','out')),
  ip inet null,
  geo point null,
  device text null
);

create table hr.attendance_days (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  work_date date not null,
  status text not null check (status in ('present','late','half_day','absent','on_leave','holiday','rest_day')),
  first_in timestamptz,
  last_out timestamptz,
  total_hours numeric(5,2),
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
  accrued numeric(5,2) not null default 0,
  used numeric(5,2) not null default 0,
  balance numeric(5,2) generated always as (accrued - used) stored,
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
  status text not null check (status in ('pending','approved','rejected','cancelled')) default 'pending',
  approver_id uuid null references auth.users(id),
  decided_at timestamptz null,
  decision_note text null,
  created_at timestamptz not null default now()
);

create table hr.timesheets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  week_start date not null,
  status text not null check (status in ('draft','submitted','approved','locked')) default 'draft',
  submitted_at timestamptz null,
  approved_by uuid null references auth.users(id),
  approved_at timestamptz null,
  unique (employee_id, week_start)
);

-- Add deferred FK from time_logs to hr.timesheets
alter table time_logs add constraint time_logs_timesheet_id_fkey
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
  status text not null check (status in ('pending','approved','rejected','cancelled')) default 'pending',
  approver_id uuid null references auth.users(id),
  created_at timestamptz not null default now()
);
```

#### 2g. Plumbing tables

```sql
create table event_bus (
  id bigserial primary key,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb,
  status text not null check (status in ('pending','processing','done','failed')) default 'pending',
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
```

#### 2h. Enable RLS on all new tables (no policies yet — Task 062)

```sql
alter table profiles enable row level security;
alter table projects enable row level security;
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
```

### Step 3 — Update `src/types/database.ts`

This is the largest change. Update the `Database` interface:

1. **Rename** `customer_projects` → `projects` everywhere in the file (table key, Row/Insert/Update, FK relationship name `customer_projects_customer_id_fkey` → `projects_customer_id_fkey`).
2. **Add new column types** to the `projects` Row/Insert/Update blocks: `name` (was `project_name`), `status`, `customer_product_id`, `description`, `created_by`.
3. **Remove** the `CustomerProjectRow` export at the bottom and replace with `ProjectRow`.
4. **Add type blocks** for every new table: `profiles`, `tasks`, `task_comments`, `attachments`, `time_logs`, `tickets`, `ticket_messages`, `event_bus`, `notifications`, `notification_preferences`, `push_subscriptions`, `audit_logs`.
5. **Add `hr` schema** — add a second schema key alongside `public`:
   ```ts
   hr: {
     Tables: {
       employees: { Row: {...}; Insert: {...}; Update: {...}; Relationships: [...] }
       attendance_punches: { ... }
       // ... all 9 hr tables
     }
   }
   ```
6. **Add convenience type exports** at the bottom for new tables (e.g. `ProjectRow`, `TaskRow`, `TicketRow`, `HrEmployeeRow`).

### Step 4 — Update all `customer_projects` code references

Rename all `.from("customer_projects")` calls to `.from("projects")` and update type references. Files:

| File | Change |
|------|--------|
| `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx` | `.from("customer_projects")` → `.from("projects")` |
| `src/app/(hub)/orchestration/_content.tsx` | `.from("customer_projects")` → `.from("projects")` |
| `src/app/api/customers/[customerId]/projects/[projectId]/route.ts` | type `ProjectUpdate = Database["public"]["Tables"]["customer_projects"]["Update"]` → `"projects"["Update"]`; both `.from()` calls |
| `src/app/api/customers/[customerId]/projects/route.ts` | both `.from()` calls |
| `src/app/api/classification/[id]/assign/route.ts` | `.from("customer_projects")` → `.from("projects")` |
| `src/app/api/projects/route.ts` | `.from("customer_projects")` → `.from("projects")` |
| `src/app/api/execution/route.ts` | both `.from()` calls |
| `src/app/api/execution/[id]/revert/route.ts` | both `.from()` calls |
| `src/app/api/zoho/route.ts` | `.from("customer_projects")` → `.from("projects")` (keep file working for now — do not delete) |
| `src/app/api/webhooks/route.ts` | `.from("customer_projects")` → `.from("projects")` (keep file working for now) |
| `src/lib/zoho/index.ts` | all 4 `.from("customer_projects")` → `.from("projects")` |

Also update `project_name` → `name` in any select queries or `.eq("project_name", ...)` chains in these files. Grep for `project_name` after the rename to catch any remaining references.

### Step 5 — Fix `CustomerProjectRow` type references

Grep for `CustomerProjectRow` across the codebase and replace with `ProjectRow`. The export in `database.ts` changes from:

```ts
export type CustomerProjectRow = Database["public"]["Tables"]["customer_projects"]["Row"];
```
to:
```ts
export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
```

### Step 6 — TypeScript check

Run `npx tsc --noEmit`. Fix all type errors before marking done. Common errors to expect:
- References to `customer_projects` that weren't caught by grep
- `project_name` property accesses that should now be `name`
- `CustomerProjectRow` usages in components

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/025_v2_schema.sql` | CREATE | Full v2.0 schema — all new tables, rename, enum widen |
| `src/types/database.ts` | MODIFY | Rename customer_projects → projects, add all new table types, add hr schema |
| `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx` | MODIFY | .from() rename |
| `src/app/(hub)/orchestration/_content.tsx` | MODIFY | .from() rename |
| `src/app/api/customers/[customerId]/projects/[projectId]/route.ts` | MODIFY | type + .from() renames |
| `src/app/api/customers/[customerId]/projects/route.ts` | MODIFY | .from() renames |
| `src/app/api/classification/[id]/assign/route.ts` | MODIFY | .from() rename |
| `src/app/api/zoho/route.ts` | MODIFY | .from() rename only — do not delete |
| `src/app/api/projects/route.ts` | MODIFY | .from() rename |
| `src/app/api/execution/route.ts` | MODIFY | .from() renames |
| `src/app/api/execution/[id]/revert/route.ts` | MODIFY | .from() renames |
| `src/app/api/webhooks/route.ts` | MODIFY | .from() rename only — do not delete |
| `src/lib/zoho/index.ts` | MODIFY | 4× .from() renames |

---

## Code Context

### `src/types/database.ts` — current customer_projects block (lines 102–145)

```ts
customer_projects: {
  Row: {
    id: string;
    customer_id: string;
    project_name: string;
    project_type: string;
    zoho_project_id: string | null;
    sanity_project_id: string | null;
    github_repo: string | null;
    dedicated_developers: string[];
    created_at: string;
    updated_at: string;
  };
  Insert: { id?: string; customer_id: string; project_name: string; ... };
  Update: { id?: string; customer_id?: string; project_name?: string; ... };
  Relationships: [{
    foreignKeyName: "customer_projects_customer_id_fkey";
    columns: ["customer_id"];
    isOneToOne: false;
    referencedRelation: "customers";
    referencedColumns: ["customer_id"];
  }];
};
```

And at line 796:
```ts
export type CustomerProjectRow = Database["public"]["Tables"]["customer_projects"]["Row"];
```

### How `projects` is queried (typical pattern, _pm-tasks.tsx line 46)

```ts
.from("customer_projects")
.select("id, project_name, project_type")
```

After rename these become:
```ts
.from("projects")
.select("id, name, project_type")
```

---

## Acceptance Criteria

- [ ] `supabase/migrations/025_v2_schema.sql` exists and is valid SQL
- [ ] `projects` table exists in DB (renamed from `customer_projects`)
- [ ] All 9 `hr.*` tables exist in `hr` schema
- [ ] All plumbing tables exist (`event_bus`, `notifications`, etc.)
- [ ] `profiles` table exists
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] No remaining references to `customer_projects` in `src/` (verify with `grep -r customer_projects src/`)
- [ ] No remaining references to `CustomerProjectRow` in `src/` (verify with `grep -r CustomerProjectRow src/`)
- [ ] Existing onboarding + classification flows are unbroken (API routes still compile and query the renamed table)

---

## Notes for Implementation Agent

- Use sonnet: spans a new `hr` Postgres schema, 20+ new table definitions, 13 TypeScript files, deferred FKs between tables, and requires careful judgment on column types. Any mistake in the migration SQL will block all subsequent Sprint 0A work.
- **Read `supabase/migrations/022_classification_source_hub_manual.sql` first** to get the exact current source CHECK constraint name before writing the ALTER TABLE. You cannot assume the constraint name.
- **Do not delete `src/app/api/zoho/`, `src/app/api/webhooks/`, or `src/lib/zoho/`** — only update their `customer_projects` references. These are retired in a later task when the event bus is live.
- The `dedicated_developers` column stays as `text[]` (v0.1 convention) in this migration. The spec targets `uuid[]` but casting live data is a separate migration concern.
- `hr.leave_balances.balance` uses a generated column (`generated always as (accrued - used) stored`). Verify your Supabase Postgres version supports this (Supabase uses PG 15+ — it does).
- `project_name` is renamed to `name` in both the migration AND all TypeScript `.select()` calls that reference it. Grep for `project_name` after step 4 to catch any stragglers.
- The `hr` schema type in `database.ts` needs to be added as a second top-level key alongside `public`: `export interface Database { public: { ... }; hr: { ... } }`. This is non-standard for the Supabase TypeScript type generator but necessary to type hr.* table queries.
- `supabase` client calls to `hr.*` tables use `.schema("hr").from("employees")` pattern — add a note in the type file about this.
