-- Migration 036: Project listing performance + first-class tags/owner columns
--
-- Adds indexes needed before server-side pagination is meaningful.
-- Adds tags text[] and owner_name text as first-class columns on projects.
-- owner_name stores the Zoho owner display name for rows imported from Zoho
-- (created_by is always null for imported rows so profiles join is not possible).

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated  ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_project     ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);

-- ─── First-class columns ──────────────────────────────────────────────────────
-- tags: extracted from Zoho tags[].name; also editable in the Hub create/edit modal
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- owner_name: Zoho owner.full_name (PM display name). Null for Hub-native rows
-- where created_by already links to a profiles row.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_name text;
