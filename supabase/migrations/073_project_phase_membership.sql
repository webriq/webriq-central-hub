-- Migration 073: Project & Phase Membership (task 153)
--
-- Two new membership tables layered on top of the existing role-based access model:
--
-- project_members  — gates whether a marketing/pm user sees a project on the Onboarding list
--                     at all. admin/super_admin always see everything regardless of rows here.
-- phase_members     — gates whether a marketing/pm user can open a given phase's management UI
--                      (today: only Phase 1, the Wizard). Phase 1 has exactly one owner
--                      (is_owner = true) plus any number of additional members. phase_number is
--                      a plain integer (not constrained to 1) so the schema already supports all
--                      5 phases, even though only Phase 1 has enforcement/UI today (task 153 doc).
--
-- Backward compatibility: a project or phase with ZERO membership rows is treated as
-- unrestricted at the application layer (not enforced here in RLS) — this migration does not
-- backfill membership for any existing project/phase, by design, to avoid locking out every
-- currently in-progress onboarding the moment this ships. See task 153 doc's "Backward
-- compatibility" section.
--
-- RLS: SELECT is broadly readable by any authenticated staff role (matches the existing
-- customer_asset_folders-style "permissive read, app-layer decides" convention) — knowing who's
-- a member isn't itself sensitive; the actual project/phase data is what's protected elsewhere.
-- INSERT/UPDATE/DELETE are routed through API routes using adminClient with explicit role
-- checks in code (the multi-condition logic — "owner OR assigned marketing agent OR
-- super_admin" — isn't cleanly expressible as a single RLS `using()` clause the way this
-- codebase's simpler role-list policies are), so no RLS write policies are created here; the
-- tables are written to exclusively via adminClient (service role bypasses RLS) from
-- server-side routes that perform their own authorization.

-- ─── project_members ──────────────────────────────────────────────────────────
create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  added_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index if not exists idx_project_members_project_id on project_members (project_id);
create index if not exists idx_project_members_user_id on project_members (user_id);

alter table project_members enable row level security;

create policy "project_members_staff_read"
  on project_members for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer', 'hr'));

-- ─── phase_members ────────────────────────────────────────────────────────────
create table if not exists phase_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  phase_number integer not null,
  user_id uuid not null references profiles (id) on delete cascade,
  is_owner boolean not null default false,
  added_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, phase_number, user_id)
);
create index if not exists idx_phase_members_project_phase on phase_members (project_id, phase_number);
create index if not exists idx_phase_members_user_id on phase_members (user_id);

-- At most one owner per (project_id, phase_number) — mirrors contacts.is_primary's existing
-- partial unique index pattern (migration 072, task 151).
create unique index if not exists idx_phase_members_one_owner
  on phase_members (project_id, phase_number) where is_owner = true;

alter table phase_members enable row level security;

create policy "phase_members_staff_read"
  on phase_members for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer', 'hr'));
