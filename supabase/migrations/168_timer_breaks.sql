-- Migration 168: durable break records (task 439)
-- WRITTEN, NOT APPLIED by the agent — the operator applies it. Deployed code degrades gracefully
-- until it lands (timer_breaks writes become warned no-ops; break-expiry backdating needs no new
-- column).
--
-- timer_breaks — one row per break (including break-only sessions that have no task timer),
--   opened at break start and closed at break end; linked to the time_logs row on Stop.

create table if not exists timer_breaks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  break_type       text not null check (break_type in ('meal', 'coffee', 'few_minutes')),
  planned_minutes  integer not null check (planned_minutes > 0),
  started_at       timestamptz not null,
  ended_at         timestamptz,
  end_reason       text check (end_reason in ('expired', 'manual', 'stopped')),
  task_id          uuid references tasks(id) on delete set null,
  issue_id         uuid references tickets(id) on delete set null,
  project_id       uuid references projects(id) on delete set null,
  time_log_id      uuid references time_logs(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists timer_breaks_user_started_idx on timer_breaks (user_id, started_at desc);
create index if not exists timer_breaks_open_idx on timer_breaks (user_id) where ended_at is null;
create index if not exists timer_breaks_time_log_idx on timer_breaks (time_log_id) where time_log_id is not null;

alter table timer_breaks enable row level security;

-- Owner: full access to own rows (timer tracking is open to every role, migration 113).
create policy "timer_breaks_own"
  on timer_breaks for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Same oversight roles as time_logs_manager_read (migration 048).
create policy "timer_breaks_manager_read"
  on timer_breaks for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'hr'));
