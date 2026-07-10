-- Migration 062: Backfill Kickoff completion-checklist rows (task 129)
--
-- Task 129 adds 3 new onboarding_internal_deliverables config entries (kickoff-meeting-held,
-- kickoff-contacts-confirmed, kickoff-goals-timeline-filed). seedAndStartProgramme() only
-- inserts internal-deliverable rows at project creation, so projects already mid-programme
-- never get new config entries added later. Backfill them for every project that already has
-- at least one onboarding_internal_deliverables row (i.e. its programme was already seeded).

insert into onboarding_internal_deliverables (project_id, deliverable_key)
select distinct oid.project_id, k.deliverable_key
from onboarding_internal_deliverables oid
cross join (values
  ('kickoff-meeting-held'),
  ('kickoff-contacts-confirmed'),
  ('kickoff-goals-timeline-filed')
) as k(deliverable_key)
on conflict (project_id, deliverable_key) do nothing;
