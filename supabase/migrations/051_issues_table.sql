-- Migration 051: Issues Table (Zoho Bugs/Issues import)
-- Adds the `issues` table to receive imported Zoho Project Issues (task 107 export → task 108 import).
--
-- Design mirrors migration 035's tasklists table:
--   external_id  text unique — Zoho issue ID, the import dedup key
--   task_id      uuid nullable FK -> tasks — reserved for future Issue-Task Mapping linkage;
--                NOT populated by this import (Zoho's issue export has no task-linkage field;
--                would require a separate "Issue Task Mapping" API call, out of scope here)
--   severity     kept as Zoho's own vocabulary (None/Minor/Major/Critical/Show stopper) --
--                not mapped onto the Hub's task priority enum, to preserve the distinct
--                "Show stopper" signal a 4-value priority scale would collapse
--   source_meta  jsonb — Zoho-specific data with no first-class Hub equivalent
--                (created_by, full status object incl. color/is_closed_type, added_via,
--                subscription_type, raw project object)

create table issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  external_id text unique,
  prefix text,
  title text not null,
  description text,
  status text not null default 'open',
  severity text,
  flag text,
  assignee_name text,
  assignee_email text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_meta jsonb default '{}'
);

alter table issues enable row level security;

create policy "issues_staff_read"
  on issues for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "issues_pm_write"
  on issues for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index issues_project_id_idx on issues(project_id);
create index issues_task_id_idx on issues(task_id) where task_id is not null;
