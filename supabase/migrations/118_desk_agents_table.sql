-- Migration 118: Zoho Desk Agents Table (task 310)
-- Receives imported Zoho Desk agents — a flat, unmatched lookup table (agents don't
-- correspond 1:1 to Hub profiles/auth.users, unlike issues.assignee_id — see task doc's
-- Out of Scope). Used to resolve tickets.source_meta.assigneeId into a display name for
-- the Tickets list's Owner column.
--
--   external_id   text unique — Desk agent id, the import dedupe key
--   full_name     text — composed from firstName/lastName at import time, or Desk's own
--                 `name` field as fallback
--   source_meta   jsonb — Desk fields with no first-class Hub equivalent (status, roleId,
--                 associated departments, etc.)

create table desk_agents (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  email text,
  full_name text,
  source_meta jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table desk_agents enable row level security;

create policy "desk_agents_staff_read"
  on desk_agents for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "desk_agents_pm_write"
  on desk_agents for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index desk_agents_email_idx on desk_agents(email) where email is not null;
