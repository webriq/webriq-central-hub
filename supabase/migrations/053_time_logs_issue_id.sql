-- Migration 053: time_logs.issue_id — Issue Time Logs Import (task 112)
-- Reuses the existing time_logs table instead of a new issue_time_logs table:
-- task_id is already nullable (migration 035), so the same nullable-FK pattern
-- extends cleanly to issues. Confirmed zero external_id collision between the
-- existing Task time-log rows and the new Issue time-log import batch.

alter table time_logs
  add column issue_id uuid references issues(id) on delete set null;

create index time_logs_issue_id_idx on time_logs(issue_id) where issue_id is not null;
