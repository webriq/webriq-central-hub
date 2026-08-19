-- Migration 110: New Task modal enhancement (task 274) — combined Start/Due date+time
-- picker needs somewhere to store the time-of-day half; start_date/due_date stay `date`
-- (unchanged, still read by List/Board/Calendar views, exports, Gantt/swimlane code).
-- `notes` is a new RTE field distinct from `description` (task 274 requirement 2).
-- All three additive/nullable — zero impact on existing readers.
alter table public.tasks
  add column start_time time,
  add column due_time time,
  add column notes text;
