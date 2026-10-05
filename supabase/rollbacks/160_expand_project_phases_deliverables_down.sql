-- Down-migration for supabase/migrations/160_expand_project_phases_deliverables.sql (task 427)
--
-- Lives in supabase/rollbacks/ (NOT migrations/) so `supabase db push` never applies it as a forward migration —
-- see the explanation at the top of 147_desk_inbox_tickets_rename_down.sql.
-- VALID ONLY BEFORE the task-428 backfill: afterwards rows may carry `skipped`/`bypassed` statuses, programme
-- columns and phase_programme_state data that this script drops or cannot represent — restore from backup instead.
-- Verified on the spike DB: schema after apply+rollback is byte-identical to the pre-160 schema (pg_dump diff).
begin;
drop view tasklists;
drop view milestones;
drop table phase_programme_state;

drop policy project_phases_read on project_phases;
drop policy project_phases_write on project_phases;
drop policy project_deliverables_read on project_deliverables;
drop policy project_deliverables_write on project_deliverables;

drop index project_deliverables_phase_position_idx;
drop index project_phases_project_position_idx;
drop index project_phases_one_active_programme_uq;
drop index project_deliverables_project_key_uq;
drop index project_phases_project_phase_number_uq;

alter table project_deliverables
  drop constraint project_deliverables_status_check, drop constraint project_deliverables_source_check,
  drop column source, drop column completed_at, drop column status, drop column due_date, drop column start_date,
  drop column owner_label, drop column description, drop column deliverable_key;
alter table project_phases drop constraint project_phases_status_check, drop constraint project_phases_source_check;
alter table project_phases
  drop column source, drop column actual_completed_date, drop column actual_start_date, drop column owner_label, drop column phase_number;
-- the widened status check can't be restored while skipped/bypassed rows exist (none before 428)
alter table project_phases add constraint milestones_status_check check (status in ('planned', 'active', 'completed'));

alter index project_deliverables_phase_id_idx rename to tasklists_milestone_id_idx;
alter index project_deliverables_project_id_idx rename to tasklists_project_id_idx;
alter table project_deliverables rename constraint project_deliverables_day_range_check to tasklists_day_range_check;
alter table project_deliverables rename constraint project_deliverables_external_id_key to tasklists_external_id_key;
alter table project_deliverables rename constraint project_deliverables_phase_id_fkey to tasklists_milestone_id_fkey;
alter table project_deliverables rename constraint project_deliverables_project_id_fkey to tasklists_project_id_fkey;
alter table project_deliverables rename constraint project_deliverables_pkey to tasklists_pkey;

create index milestones_external_id_idx on project_phases (external_id) where external_id is not null;
alter index project_phases_project_id_idx rename to milestones_project_id_idx;
alter table project_phases rename constraint project_phases_day_range_check to milestones_day_range_check;
alter table project_phases rename constraint project_phases_external_id_key to milestones_external_id_key;
alter table project_phases rename constraint project_phases_created_by_fkey to milestones_created_by_fkey;
alter table project_phases rename constraint project_phases_project_id_fkey to milestones_project_id_fkey;
alter table project_phases rename constraint project_phases_pkey to milestones_pkey;

alter table project_deliverables rename column phase_id to milestone_id;
alter table project_deliverables rename to tasklists;
alter table project_phases rename to milestones;

create policy milestones_staff_read on milestones for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
create policy milestones_pm_write on milestones for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm')) with check (get_my_role() in ('admin', 'super_admin', 'pm'));
create policy tasklists_staff_read on tasklists for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
create policy tasklists_pm_write on tasklists for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm')) with check (get_my_role() in ('admin', 'super_admin', 'pm'));
commit;
