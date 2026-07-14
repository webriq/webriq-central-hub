-- Migration 069: Backfill Client Sign-off completion-checklist rows (task 135)
--
-- Task 135 adds 2 new onboarding_internal_deliverables config entries (signoff-call-held,
-- signoff-agreement-filed). seedAndStartProgramme() only inserts internal-deliverable rows at
-- project creation, so projects already mid-programme never get new config entries added
-- later. Backfill them for every project that already has at least one
-- onboarding_internal_deliverables row (i.e. its programme was already seeded) — same pattern
-- as migrations 062/063.

insert into onboarding_internal_deliverables (project_id, deliverable_key)
select distinct oid.project_id, k.deliverable_key
from onboarding_internal_deliverables oid
cross join (values
  ('signoff-call-held'),
  ('signoff-agreement-filed')
) as k(deliverable_key)
on conflict (project_id, deliverable_key) do nothing;
