-- Migration 137: issues.source_ticket_id (task 363)
-- Links an `issues` row back to the Desk `tickets` row it was filed from, when it was created via
-- the "File an Issue" thread-message action (task 333) rather than authored directly on a project.
-- Nullable — most issues have no Desk origin at all. `on delete set null` (mirrors `issues.task_id`,
-- migration 051) so deleting the source ticket doesn't cascade-delete an issue already in progress;
-- it just loses its origin link.
--
-- Backs the new Desk > Tickets tab (task 363), which lists exactly the issues where this column is
-- not null, across every project. No RLS change needed — `issues_staff_read`/`issues_pm_write`
-- (migration 051) gate by row, not column, and already permit admin/super_admin/pm to read every
-- issues row regardless of project.

alter table issues
  add column if not exists source_ticket_id uuid references tickets(id) on delete set null;

create index if not exists issues_source_ticket_id_idx
  on issues(source_ticket_id)
  where source_ticket_id is not null;

comment on column issues.source_ticket_id is 'Desk ticket this issue was filed from via the thread "File an Issue" action (task 333/363). Null for issues authored directly on a project.';
