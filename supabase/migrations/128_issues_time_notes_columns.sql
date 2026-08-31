-- Migration 128: issues.due_time + issues.notes (task 338)
-- New Issue modal enhancement — give an issue's due-time and internal notes somewhere to
-- live. Mirrors task 274 / migration 110's `tasks.start_time` / `due_time` /
-- `notes` decision exactly: the date half stays in `issues.due_date` (type `date`), the
-- time-of-day half goes to a new `due_time` (type `time`).
--
-- Both columns are additive and nullable — every existing row and every `select("*")` /
-- `select()` consumer is unaffected, and no backfill is needed. Existing `issues_*` RLS
-- policies already cover all columns of the table (they gate by row, not column), so no
-- policy change is required.

alter table issues
  add column if not exists due_time time,
  add column if not exists notes text;

comment on column issues.due_time is 'Time-of-day component of the due date, paired with due_date (task 338). Nullable.';
comment on column issues.notes is 'Optional internal notes (rich-text HTML) authored in the New Issue modal / Issue Detail (task 338). Nullable.';
