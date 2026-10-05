-- ─── Fix: deliverable_key uniqueness is per PHASE, not per project (task 428 prep; corrects migration 160) ──
-- Migration 160 created `project_deliverables_project_key_uq` on (project_id, deliverable_key). That is wrong for the
-- StackShift programme: the same key legitimately appears in two phases of one project (customer_deliverables is unique on
-- (customer_id, phase_number, deliverable_key)) — e.g. `updated-publishing-plan` and `gap-publishing` exist in BOTH Phase 4 and
-- Phase 5 of 28 live projects (56 project/key pairs). The 428 backfill would have been rejected. No row has a deliverable_key
-- yet when this runs (the backfill is what sets it), so swapping the index is lossless.
--
-- WRITTEN, NOT APPLIED by the agent — apply BEFORE the task-428 backfill. Rollback: supabase/rollbacks/161_*_down.sql
drop index if exists project_deliverables_project_key_uq;
create unique index project_deliverables_phase_key_uq on project_deliverables (phase_id, deliverable_key)
  where deliverable_key is not null and phase_id is not null;
