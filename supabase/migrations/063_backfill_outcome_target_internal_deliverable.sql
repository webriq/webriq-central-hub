-- Migration 063: Backfill Outcome Target completion-checklist row (task 130)
--
-- Task 130 adds 1 new onboarding_internal_deliverables config entry (outcome-target-filed).
-- seedAndStartProgramme() only inserts internal-deliverable rows at project creation, so
-- projects already mid-programme never get new config entries added later. Backfill it for
-- every project that already has at least one onboarding_internal_deliverables row (i.e. its
-- programme was already seeded) — same pattern as migration 062.

insert into onboarding_internal_deliverables (project_id, deliverable_key)
select distinct oid.project_id, 'outcome-target-filed'
from onboarding_internal_deliverables oid
on conflict (project_id, deliverable_key) do nothing;
