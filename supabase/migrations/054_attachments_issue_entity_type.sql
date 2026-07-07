-- Migration 054: attachments.entity_type — add 'issue' (task 114)
-- attachments is already a polymorphic entity_type/entity_id table (migration 025);
-- extending the CHECK constraint is the correct fix, not a new table — same reasoning
-- already applied to time_logs.issue_id in task 112.

alter table attachments
  drop constraint attachments_entity_type_check;

alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment', 'issue'));
