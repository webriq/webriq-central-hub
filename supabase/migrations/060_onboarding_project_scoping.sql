-- Migration 060: Onboarding Redesign — Bert-gated Phase 1, project-scoped Programme
--
-- Supersedes significant parts of migration 059 (task 122). Programme state moves from
-- customer-scoped to project-scoped so one customer can run multiple independent 120-day
-- onboardings (one per project/product) without collision. New `marketing` role gives Bert
-- a real identity distinct from `pm`. New `onboarding_visible_at` on `projects` hides a
-- project (and its customer, if it has no other visible project) from PM/staff view until
-- Phase 1 is handed over.
--
-- Task 122's one live test row (WRQ-CUST-3691 / AGL Co) predates project-scoping and has no
-- `projects` row — it was explicitly flagged as disposable verification data. Deleted below
-- before `project_id` is made NOT NULL, rather than leaving the column nullable forever.

-- ─── profiles.role: add 'marketing' ─────────────────────────────────────────
-- Same CHECK-constraint-swap pattern as migration 047 (super_admin).
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'hr', 'pm', 'developer', 'client', 'super_admin', 'marketing'));

-- ─── customer_products.classification ───────────────────────────────────────
-- Service-tier/engagement-type axis, distinct from product_name (the underlying software
-- platform). See task 123 doc's "Key Design Decisions" for the product_name derivation rule.
alter table customer_products add column if not exists classification text
  check (classification in ('StackShift I', 'StackShift II', 'StackShift Access', 'StackShift Access Plus', 'PipelineForge', 'Discrete Development'));

-- ─── projects: programme fields (moved off customers) ───────────────────────
alter table projects add column if not exists programme_started_at timestamptz;
alter table projects add column if not exists onboarding_visible_at timestamptz;
alter table projects add column if not exists scheduled_onboarding_start_at timestamptz;

-- CRITICAL: backfill existing rows visible so nothing currently shown to PMs disappears —
-- only new projects created via the new /v2/onboarding flow start hidden (onboarding_visible_at null).
update projects set onboarding_visible_at = created_at where onboarding_visible_at is null;

create index if not exists idx_projects_onboarding_hidden on projects (customer_id) where onboarding_visible_at is null;
create index if not exists idx_projects_scheduled_onboarding_start_at on projects (scheduled_onboarding_start_at) where scheduled_onboarding_start_at is not null;

-- ─── Task 122 disposable test/verification data ─────────────────────────────
-- No projects row exists for WRQ-CUST-3691's programme rows yet, and they predate
-- project-scoping. Clear rather than leave project_id nullable forever for one row's sake.
delete from customer_deliverables where customer_id = 'WRQ-CUST-3691';
delete from customer_phases where customer_id = 'WRQ-CUST-3691';
delete from programme_notifications where customer_id = 'WRQ-CUST-3691';

-- ─── customer_phases: project-scoped ─────────────────────────────────────────
alter table customer_phases add column if not exists project_id uuid references projects (id) on delete cascade;
alter table customer_phases drop constraint if exists customer_phases_customer_id_phase_number_key;
alter table customer_phases alter column project_id set not null;
alter table customer_phases add constraint customer_phases_project_id_phase_number_key unique (project_id, phase_number);
create index if not exists idx_customer_phases_project_id on customer_phases (project_id);

-- ─── customer_deliverables: project-scoped ───────────────────────────────────
-- Live constraint name is Postgres-truncated to 63 chars — confirmed via pg_constraint,
-- not the untruncated name a naive read of migration 059 would suggest.
alter table customer_deliverables add column if not exists project_id uuid references projects (id) on delete cascade;
alter table customer_deliverables drop constraint if exists customer_deliverables_customer_id_phase_number_deliverable__key;
alter table customer_deliverables alter column project_id set not null;
alter table customer_deliverables add constraint customer_deliverables_project_id_phase_number_deliverable_key unique (project_id, phase_number, deliverable_key);
create index if not exists idx_customer_deliverables_project_id on customer_deliverables (project_id);

-- ─── customer_assets: nullable project tag ───────────────────────────────────
-- Stays nullable — most existing assets are general customer files with no project scope.
alter table customer_assets add column if not exists project_id uuid references projects (id) on delete cascade;
create index if not exists idx_customer_assets_project_id on customer_assets (project_id) where project_id is not null;

-- ─── programme_notifications: project-scoped dedupe ──────────────────────────
-- Same collision reasoning as customer_phases/customer_deliverables: a customer can now run
-- two simultaneous onboardings (different projects), each needing independent due/overdue
-- dedupe. No live rows exist yet (confirmed via direct query), so this is a clean swap.
alter table programme_notifications add column if not exists project_id uuid references projects (id) on delete cascade;
alter table programme_notifications drop constraint if exists programme_notifications_customer_id_notification_key_key;
alter table programme_notifications alter column project_id set not null;
alter table programme_notifications add constraint programme_notifications_project_id_notification_key_key unique (project_id, notification_key);

-- ─── onboarding_internal_deliverables ─────────────────────────────────────────
-- QBR "2.3 Bert's Internal Deliverables" checklist (8 items), never modeled in task 122.
create table if not exists onboarding_internal_deliverables (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects (id) on delete cascade,
  deliverable_key  text not null,
  status           text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (project_id, deliverable_key)
);
create index if not exists idx_onboarding_internal_deliverables_project_id on onboarding_internal_deliverables (project_id);

alter table onboarding_internal_deliverables enable row level security;
drop policy if exists "onboarding_internal_deliverables_staff" on onboarding_internal_deliverables;
create policy "onboarding_internal_deliverables_staff"
  on onboarding_internal_deliverables for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

-- ─── Tighten customer_phases / customer_deliverables RLS ─────────────────────
-- pm loses access entirely (task 122 granted admin|super_admin|pm write, staff-wide read).
-- Bert now operates under the dedicated `marketing` role; PMs only ever see the restricted
-- onboarding list endpoint, never these tables directly.
drop policy if exists "customer_phases_staff_read" on customer_phases;
drop policy if exists "customer_phases_staff_write" on customer_phases;
create policy "customer_phases_marketing_only"
  on customer_phases for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

drop policy if exists "customer_deliverables_staff_read" on customer_deliverables;
drop policy if exists "customer_deliverables_staff_write" on customer_deliverables;
create policy "customer_deliverables_marketing_only"
  on customer_deliverables for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

-- ─── customers.programme_started_at: dead, moved to projects ────────────────
alter table customers drop column if exists programme_started_at;

-- ─── projects RLS: grant marketing the same read/write breadth pm already has ──
-- Discovered live (not called out in the task doc's Code Context): `projects_staff_read`/
-- `projects_pm_write` (migration 025/026) predate the `marketing` role and don't include it.
-- Bert needs to create/read/update projects for the New Project intake, Start Onboarding,
-- and scheduled auto-start — extending the existing pm-breadth policies is consistent with
-- the precedent (pm already has full projects access, not just programme fields) rather than
-- introducing a new, narrower policy shape.
drop policy if exists "projects_staff_read" on projects;
create policy "projects_staff_read" on projects for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr', 'marketing'));

drop policy if exists "projects_pm_write" on projects;
create policy "projects_pm_write" on projects for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'marketing'));

-- ─── Scheduled auto-start cron ────────────────────────────────────────────────
-- New frequent-interval job (existing jobs are all daily) — finds projects whose
-- scheduled_onboarding_start_at is due and runs the same start logic as the manual button.
-- URL/secret are placeholders — update post-deploy via cron.alter_job(), same pattern as
-- migrations 012/059, e.g.:
--
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'onboarding-scheduled-autostart'),
--     command := format(
--       $cmd$
--       select net.http_post(
--         url     := '%s/api/onboarding/scheduled-autostart',
--         body    := '{}'::jsonb,
--         headers := '{"x-digest-secret":"%s","content-type":"application/json"}'::jsonb
--       )
--       $cmd$,
--       'https://YOUR_VERCEL_APP_URL',
--       'YOUR_DIGEST_SECRET'  -- reuses the existing DIGEST_SECRET env var, no new secret introduced
--     )
--   );
select cron.schedule(
  'onboarding-scheduled-autostart',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := 'https://REPLACE_WITH_APP_URL/api/onboarding/scheduled-autostart',
    body    := '{}'::jsonb,
    headers := '{"x-digest-secret":"REPLACE_WITH_DIGEST_SECRET","content-type":"application/json"}'::jsonb
  )
  $job$
);
