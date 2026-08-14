-- Task 246 (design per task 245): let a StackShift I/II project have phases beyond the fixed 5.
-- customer_phases/customer_deliverables gain nullable override columns, mirroring the pattern
-- migration 071 already established for customer_deliverables' day_start_override/day_end_override
-- (effective value = override ?? PROGRAMME_PHASES static default). A phase/deliverable with every
-- new column null behaves byte-identically to today.
--
-- sort_order decouples *display order* from phase_number's *identity* — phase_number stays a
-- stable, monotonically-increasing per-project id (never renumbered, so every existing FK
-- reference — phase_members, customer_assets, etc. — keeps working unchanged); sort_order is what
-- actually controls Gantt-lane/list order and is freely reorderable. This is what makes inserting
-- a phase "in the middle" safe: it's a sort_order change, not a renumbering cascade.
--
-- No RLS changes — task 245's research confirmed every policy on these tables is role-only, never
-- conditioned on phase_number's value.

ALTER TABLE customer_phases
  ADD COLUMN custom_name text,
  ADD COLUMN day_start_override integer,
  ADD COLUMN day_end_override integer,
  ADD COLUMN sort_order integer;

ALTER TABLE customer_phases
  ADD CONSTRAINT customer_phases_schedule_override_check
  CHECK (
    (day_start_override IS NULL AND day_end_override IS NULL)
    OR (day_start_override IS NOT NULL AND day_end_override IS NOT NULL AND day_start_override <= day_end_override)
  );

-- Backfill sort_order = phase_number for every existing row — zero visual/ordering change on ship.
UPDATE customer_phases SET sort_order = phase_number WHERE sort_order IS NULL;
ALTER TABLE customer_phases ALTER COLUMN sort_order SET NOT NULL;

-- phase_number is no longer capped at 5 — open-ended, matching the already-unconstrained sibling
-- phase_number columns on phase_members/customer_assets/customer_asset_folders.
ALTER TABLE customer_phases DROP CONSTRAINT IF EXISTS customer_phases_phase_number_check;
ALTER TABLE customer_phases ADD CONSTRAINT customer_phases_phase_number_check CHECK (phase_number > 0);

ALTER TABLE customer_deliverables
  ADD COLUMN custom_name text,
  ADD COLUMN custom_description text,
  ADD COLUMN custom_owner text;

ALTER TABLE customer_deliverables DROP CONSTRAINT IF EXISTS customer_deliverables_phase_number_check;
ALTER TABLE customer_deliverables ADD CONSTRAINT customer_deliverables_phase_number_check CHECK (phase_number > 0);
