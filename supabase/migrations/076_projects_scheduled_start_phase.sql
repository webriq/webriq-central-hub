-- Migration 076: projects.scheduled_start_phase (New Project intake's scheduled start, phase-aware)
--
-- The New Project wizard's "Start at phase" dropdown (task/chat follow-up to 157) already lets
-- admin/super_admin/marketing jump straight to Phase 2-5 when starting immediately. This column
-- carries that same selection through to the "Save + Set Schedule" path, so the scheduled
-- auto-start cron (scheduled-autostart route) knows which phase to seed as active once the
-- scheduled time arrives, instead of always defaulting to Phase 1. Null means Phase 1 — every
-- already-scheduled project predates this column and should keep starting at Phase 1 unchanged.

alter table projects add column if not exists scheduled_start_phase smallint
  check (scheduled_start_phase between 1 and 5);
