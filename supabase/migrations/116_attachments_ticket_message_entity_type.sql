-- Migration 116: attachments.entity_type — add 'ticket_message' (task 306)
-- attachments is already a polymorphic entity_type/entity_id table (migration 025);
-- extending the CHECK constraint is the correct fix, not a new table — same reasoning
-- already applied for 'issue' (migration 054). entity_id will be ticket_messages.id
-- (the specific Desk Thread/Comment message), not tickets.id.

alter table attachments
  drop constraint attachments_entity_type_check;

alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment', 'issue', 'ticket_message'));
