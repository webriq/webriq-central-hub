-- Migration 033: milestones (PM core) + tasks.milestone_id
-- Adds milestone grouping under projects for the native PM core (task 073).
-- RLS mirrors tasks/projects: staff read; PM/Admin full write. Uses get_my_role()
-- helper (migration 026) — never replicate the role lookup inline.

-- ─── milestones ───────────────────────────────────────────────────────────────
create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  due_date date,
  status text not null check (status in ('planned', 'active', 'completed')) default 'planned',
  position numeric,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── tasks.milestone_id ───────────────────────────────────────────────────────
alter table tasks
  add column milestone_id uuid references milestones(id) on delete set null;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table milestones enable row level security;

-- Staff read (clients have no visibility into internal project milestones).
create policy "milestones_staff_read"
  on milestones for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

-- PM / Admin: full write.
create policy "milestones_pm_write"
  on milestones for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index milestones_project_id_idx on milestones(project_id);
create index tasks_milestone_id_idx on tasks(milestone_id);
