-- Migration 095: timer event timeline + time_logs time-period columns (task 215)
-- active_timers.timeline is an append-only event log for the CURRENT session (start/pause/
-- resume/break-start/break-end/stop) — every timer route appends one event as it happens. On
-- stop, the accumulated array (plus a derived start_time/end_time) is copied onto the new
-- time_logs row before the active_timers row is deleted, same deletion behavior as before
-- (migration 092/task 209). time_logs.start_time/end_time/timeline stay null for every row that
-- predates this migration and for manual entries that don't set a period yet — the UI must
-- degrade gracefully (see task 215 Out of Scope).
alter table active_timers add column timeline jsonb not null default '[]'::jsonb;

alter table time_logs add column start_time timestamptz;
alter table time_logs add column end_time timestamptz;
alter table time_logs add column timeline jsonb;
