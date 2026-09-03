-- Migration 131: time_logs.log_title (task 348)
-- The Add/Edit Time Log modal's "Enter General Log" path used to write the free-text
-- description straight into time_logs.note, so for a task-less/issue-less entry the note
-- column doubled as both the title and the notes. Task 348 separates them: the General Log
-- text is a *Log Title* (the equivalent of a task title / issue title for a work-item-linked
-- entry), and note becomes purely optional rich-text notes for every entry kind.
--
-- log_title is additive + nullable. It is NULL for task- or issue-linked rows (their title
-- derives from the linked work item) and holds the free text for General Log rows. Existing
-- time_logs_* RLS policies gate by row, not column, so no policy change is needed (same
-- reasoning as migration 128).
--
-- Backfill: move the existing description out of note into log_title for every general row
-- (task_id IS NULL AND issue_id IS NULL) and null note, so a pre-existing general entry does
-- not render the same string in both the Log Title and Notes columns. Idempotent via the
-- `log_title is null` guard.

alter table time_logs add column if not exists log_title text;

comment on column time_logs.log_title is
  'Free-text title for a task-less/issue-less General Log entry (task 348). NULL for task- or issue-linked rows, whose title derives from the linked work item. Distinct from note (optional rich-text notes).';

update time_logs
  set log_title = note, note = null
  where task_id is null and issue_id is null and log_title is null;
