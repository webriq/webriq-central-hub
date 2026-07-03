-- Composite index: every query filters attachments by parent (entity_type, entity_id)
create index if not exists attachments_entity_idx on attachments(entity_type, entity_id);

-- Restrict entity_type to known values — prevents a typo from creating a silently
-- unqueryable orphan row. 'task' is the only value populated today; 'project' and
-- 'comment' are reserved for anticipated future parents (not built in this task).
alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment'));
