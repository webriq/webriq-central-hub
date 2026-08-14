-- Task 248: persist the intake-time skip/custom-phase selection (tasks 244/246) for every start
-- mode, not just an immediate `mode: "start"` submission. Confirmed gap: `skip_phase_numbers`/
-- `custom_phases` were only ever passed to seedAndStartProgramme when the New Project wizard
-- submitted `mode: "start"` directly — a Draft (`mode: "save"`) or Scheduled
-- (`mode: "save_scheduled"`) project's skip/custom-phase configuration was silently discarded, and
-- would seed with all 5 vanilla defaults whenever it eventually started. Both columns are
-- customer_phases-engine-only in practice (only ever written/read for `uses_customer_phases_engine
-- = true` projects) but declared on every project row for simplicity, matching
-- `programme_duration_days`'s own existing precedent (migration 102) of a customer_phases-only
-- column living on the shared `projects` table rather than a separate side table.
ALTER TABLE projects ADD COLUMN draft_skip_phase_numbers integer[] NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN draft_custom_phases jsonb NOT NULL DEFAULT '[]';
