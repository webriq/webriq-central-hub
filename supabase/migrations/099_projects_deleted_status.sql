-- Expand projects.status CHECK constraint to allow 'deleted' for soft-delete
-- (task 231). Mirrors 023_customer_products_archive_status.sql's pattern.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active', 'on_hold', 'completed', 'archived', 'deleted'));
