-- Migration 092: Developer task creation/edit permissions + active_timers (task 209)
--
-- 1) developer can create tasks (created_by = self) — no INSERT policy existed before this,
--    so task creation silently failed for developers even though the "New Task" UI never
--    gated the button by role.
-- 2) developer update visibility widens to creator OR assignee (row-level only). Field/value
--    restriction — assignee-only developers may only set status to in_progress/ready_for_qa,
--    everything else read-only — is enforced in the PATCH API route
--    (src/app/api/v2/tasks/[taskId]/route.ts), matching this policy's own pre-existing lack of
--    field-level restriction (today's policy already lets an assigned developer change ANY
--    field at the raw DB level; the app UI is what limits it).
-- 3) task-content storage bucket (migration 091, inline description-image paste) widens to
--    developer at the role level — the description editor is only reachable by a developer who
--    already passed the app-layer edit-permission check for that specific task.
-- 4) active_timers — one row per developer, server-persisted timer + break state so a running
--    timer survives navigation/refresh and can be controlled from the hub-wide floating break
--    widget (a different part of the tree than the task row that started it).

-- ─── tasks: developer create own ───────────────────────────────────────────────
create policy "tasks_developer_insert"
  on tasks for insert to authenticated
  with check (get_my_role() = 'developer' and created_by = auth.uid());

-- ─── tasks: widen developer update row-visibility to creator OR assignee ──────
drop policy if exists "tasks_developer_update" on tasks;
create policy "tasks_developer_update"
  on tasks for update to authenticated
  using (get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees)))
  with check (get_my_role() = 'developer');

-- ─── task-content storage bucket: allow developer uploads (inline description images) ──
drop policy if exists "task_content_staff_write" on storage.objects;
create policy "task_content_staff_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-content'
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
  );

-- ─── active_timers ──────────────────────────────────────────────────────────────
-- task_id/project_id are nullable — a break can exist with no task timer running (a developer
-- can take a break without having started a timer at all). status/accumulated_seconds/
-- segment_started_at are only meaningful when task_id is set; break_* fields are only
-- meaningful when break_type is set. Both can be set simultaneously (timer paused-for-break).
create table if not exists active_timers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  task_id uuid references tasks (id) on delete cascade,
  project_id uuid references projects (id) on delete cascade,
  status text check (status in ('running', 'paused')),
  accumulated_seconds numeric not null default 0,
  segment_started_at timestamptz,
  break_type text check (break_type in ('meal', 'coffee', 'few_minutes')),
  break_started_at timestamptz,
  break_duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_active_timers_task_id on active_timers (task_id);

alter table active_timers enable row level security;

create policy "active_timers_developer_own"
  on active_timers for all to authenticated
  using (get_my_role() = 'developer' and user_id = auth.uid())
  with check (get_my_role() = 'developer' and user_id = auth.uid());
