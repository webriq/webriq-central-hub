-- Task 249: persist the New Project wizard's per-phase custom-duration + auto-distributed
-- deliverable day-range edits (Requirement A/E) for every start mode, mirroring task 248's
-- draft_skip_phase_numbers/draft_custom_phases persistence pattern for the same "draft phase
-- plan" concept — a separate column rather than folding into draft_custom_phases (which is
-- specifically for phases 6+, isCustom: true; conflating the two would break
-- resolveEffectivePhase's isCustom branching). customer_phases-engine-only in practice, declared
-- on every project row for simplicity, matching draft_skip_phase_numbers/draft_custom_phases'
-- own precedent.
ALTER TABLE projects ADD COLUMN draft_default_phase_overrides jsonb NOT NULL DEFAULT '[]';
