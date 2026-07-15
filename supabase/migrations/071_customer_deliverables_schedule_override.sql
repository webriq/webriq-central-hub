-- Migration 071: customer_deliverables — per-project schedule override
--
-- Task 148. PROGRAMME_PHASES (src/config/customer-phases.ts) is a static config shared by
-- every customer, so it cannot hold per-project drag-resize/move edits to a deliverable's
-- day span. This adds a nullable override pair read on top of the static default
-- (effective span = override ?? staticConfigDefault), never mutating the shared config.
--
-- No RLS changes needed — the existing customer_deliverables_marketing_*/
-- customer_deliverables_pm_developer_read policies (migration 070) already cover all columns
-- on this table.

alter table customer_deliverables
  add column if not exists day_start_override smallint,
  add column if not exists day_end_override smallint;

alter table customer_deliverables
  add constraint customer_deliverables_schedule_override_check
  check (
    (day_start_override is null and day_end_override is null)
    or (day_start_override is not null and day_end_override is not null and day_start_override <= day_end_override)
  );
