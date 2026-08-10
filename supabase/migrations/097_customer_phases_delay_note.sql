-- Migration 097: customer_phases.delay_note
--
-- Task 221 (Portfolio Tracker status report). Distinct from `override_note` (migration 059),
-- which records why a phase was manually jumped to via the phase-override PATCH route —
-- `delay_note` records why a phase is running late, entered from the new status report page.
-- No RLS change needed: the existing customer_phases_marketing_update/
-- customer_phases_pm_developer_read policies (migration 070) are column-agnostic and already
-- cover this column the same way they cover every other one on the table.

alter table customer_phases add column if not exists delay_note text;
