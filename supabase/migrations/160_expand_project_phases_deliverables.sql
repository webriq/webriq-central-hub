-- ─── Expand: milestones/tasklists → project_phases/project_deliverables (task 427, step 1 of task 423) ──────
-- WRITTEN, NOT APPLIED by the agent (repo convention) — the operator applies it with `supabase db push` after review.
-- Verified on a disposable local Postgres 17.6 (replay of migrations 001–159, rename, constraints, RLS matrix 96/96,
-- compat views with security_invoker, Realtime, rollback diff = identical). See _docs/task/427-expand-migration-project-phases-deliverables.md.
-- Rollback (valid only BEFORE the task-428 backfill): supabase/rollbacks/160_expand_project_phases_deliverables_down.sql
-- Prerequisites: migration 159 (Realtime publication) is independent of this one; the Zoho import/sync routes are frozen (task 426).
begin;

-- ── 1. Rename in place (UUIDs, FKs, RLS bindings, publication membership follow the table OID) ───────────
alter table milestones rename to project_phases;
alter table tasklists  rename to project_deliverables;
alter table project_deliverables rename column milestone_id to phase_id;

-- cosmetic renames so catalog names match the new tables
alter table project_phases rename constraint milestones_pkey to project_phases_pkey;
alter table project_phases rename constraint milestones_project_id_fkey to project_phases_project_id_fkey;
alter table project_phases rename constraint milestones_created_by_fkey to project_phases_created_by_fkey;
alter table project_phases rename constraint milestones_external_id_key to project_phases_external_id_key;
alter table project_phases rename constraint milestones_day_range_check to project_phases_day_range_check;
alter index milestones_project_id_idx rename to project_phases_project_id_idx;
-- milestones_external_id_idx (partial btree on external_id) duplicates the unique index that backs
-- milestones_external_id_key — redundant, dropped.
drop index milestones_external_id_idx;

alter table project_deliverables rename constraint tasklists_pkey to project_deliverables_pkey;
alter table project_deliverables rename constraint tasklists_project_id_fkey to project_deliverables_project_id_fkey;
alter table project_deliverables rename constraint tasklists_milestone_id_fkey to project_deliverables_phase_id_fkey;
alter table project_deliverables rename constraint tasklists_external_id_key to project_deliverables_external_id_key;
alter table project_deliverables rename constraint tasklists_day_range_check to project_deliverables_day_range_check;
alter index tasklists_project_id_idx rename to project_deliverables_project_id_idx;
alter index tasklists_milestone_id_idx rename to project_deliverables_phase_id_idx;

-- ── 2. project_phases: new columns + widened status ─────────────────────────────────────────────────────
alter table project_phases
  add column phase_number smallint,
  add column owner_label text,
  add column actual_start_date date,
  add column actual_completed_date date,
  add column source text not null default 'manual';
alter table project_phases add constraint project_phases_source_check check (source in ('manual', 'programme', 'zoho_import'));
alter table project_phases drop constraint milestones_status_check;
alter table project_phases add constraint project_phases_status_check
  check (status in ('planned', 'active', 'completed', 'skipped', 'bypassed'));

-- ── 3. project_deliverables: new columns ────────────────────────────────────────────────────────────────
alter table project_deliverables
  add column deliverable_key text,
  add column description text,
  add column owner_label text,
  add column start_date date,
  add column due_date date,
  add column status text not null default 'pending',
  add column completed_at timestamptz,
  add column source text not null default 'manual';
alter table project_deliverables add constraint project_deliverables_source_check check (source in ('manual', 'programme', 'zoho_import'));
alter table project_deliverables add constraint project_deliverables_status_check check (status in ('pending', 'in_progress', 'done'));

-- ── 4. Tag existing rows by origin (deterministic from external_id; the programme backfill itself is task 428) ──
update project_phases set source = case
  when external_id like 'programme-phase-%' then 'programme'
  when external_id is not null then 'zoho_import'
  else 'manual' end;
update project_deliverables set source = case
  when external_id like 'programme-deliverable-%' then 'programme'
  when external_id is not null then 'zoho_import'
  else 'manual' end;

-- ── 5. Uniqueness (partial: only programme rows carry these keys) ───────────────────────────────────────
create unique index project_phases_project_phase_number_uq on project_phases (project_id, phase_number) where phase_number is not null;
create unique index project_deliverables_project_key_uq on project_deliverables (project_id, deliverable_key) where deliverable_key is not null;
-- one active programme phase per project. NOT global: 130 live projects have several active (Zoho-imported) milestones.
create unique index project_phases_one_active_programme_uq on project_phases (project_id) where source = 'programme' and status = 'active';
create index project_phases_project_position_idx on project_phases (project_id, position);
create index project_deliverables_phase_position_idx on project_deliverables (phase_id, position);

-- ── 6. Programme-only state (marketing/admin-writable; PM/dev read) ─────────────────────────────────────
create table phase_programme_state (
  phase_id uuid primary key references project_phases (id) on delete cascade,
  wizard_data jsonb not null default '{}'::jsonb,
  is_manual_override boolean not null default false,
  override_note text,
  delay_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 7. RLS (uses get_my_role(); never inline) ───────────────────────────────────────────────────────────
alter table phase_programme_state enable row level security;
drop policy milestones_staff_read on project_phases;
drop policy milestones_pm_write on project_phases;
drop policy tasklists_staff_read on project_deliverables;
drop policy tasklists_pm_write on project_deliverables;

create policy project_phases_read on project_phases for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
create policy project_phases_write on project_phases for all to authenticated
  using ((source <> 'programme' and get_my_role() in ('admin', 'super_admin', 'pm'))
      or (source = 'programme' and get_my_role() in ('admin', 'super_admin', 'marketing')))
  with check ((source <> 'programme' and get_my_role() in ('admin', 'super_admin', 'pm'))
           or (source = 'programme' and get_my_role() in ('admin', 'super_admin', 'marketing')));

create policy project_deliverables_read on project_deliverables for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
create policy project_deliverables_write on project_deliverables for all to authenticated
  using ((source <> 'programme' and get_my_role() in ('admin', 'super_admin', 'pm'))
      or (source = 'programme' and get_my_role() in ('admin', 'super_admin', 'marketing')))
  with check ((source <> 'programme' and get_my_role() in ('admin', 'super_admin', 'pm'))
           or (source = 'programme' and get_my_role() in ('admin', 'super_admin', 'marketing')));

create policy phase_programme_state_read on phase_programme_state for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
create policy phase_programme_state_write on phase_programme_state for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

-- ── 8. Compat views for not-yet-migrated code (same names + columns as before) ─────────────────────────
-- security_invoker = true is REQUIRED: a plain view runs as its owner and would bypass RLS.
create view milestones with (security_invoker = true) as
  select id, project_id, external_id, name, description, start_date, due_date, status, position,
         day_start, day_end, created_by, created_at, updated_at
  from project_phases
  where not (source = 'programme' and phase_number is not distinct from 1)   -- NULL-safe: programme rows with no phase_number yet stay visible
  with cascaded check option;

create view tasklists with (security_invoker = true) as
  select d.id, d.project_id, d.external_id, d.name, d.position, d.is_default, d.phase_id as milestone_id,
         d.day_start, d.day_end, d.created_at, d.updated_at
  from project_deliverables d
  where not exists (select 1 from project_phases p where p.id = d.phase_id and p.source = 'programme' and p.phase_number is not distinct from 1)
  with cascaded check option;

-- ── 9. Explicit grants ──────────────────────────────────────────────────────────────────────────────────
-- Renamed tables keep their grants, but the NEW table and the compat views do not inherit them, and newer
-- Supabase projects/CLIs no longer auto-grant on public objects. RLS still gates every row.
grant select, insert, update, delete on phase_programme_state, milestones, tasklists to authenticated, service_role;

commit;
