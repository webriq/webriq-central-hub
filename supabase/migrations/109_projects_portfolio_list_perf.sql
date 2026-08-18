-- Migration 109: /projects + /portfolio-tracker list-fetching performance (task 263)
--
-- 1. Trigram indexes for leading-wildcard ilike search (pg_trgm already enabled — migration 030).
-- 2. Btree indexes for sort columns not yet covered by migration 036.
-- 3. Composite (project_id, status) indexes for the two new count-aggregate RPCs below.
-- 4. GIN index for tasks.assignees array-containment filter (developer project scoping).
-- 5. get_project_task_counts / get_project_issue_counts — DB-side aggregation so /projects
--    never has to pull every row in tasks/issues just to sum two integers per project.
-- 6. projects.onboarding_status — trigger-maintained column (same shape as the existing
--    project_id/display_id trigger-computed columns) so Portfolio Tracker's status filter can
--    be a plain indexed .in() instead of fetching every row to compute status in JS.
-- 7. projects.target_handover_at — trigger-maintained column (folded into the same
--    recompute_onboarding_status trigger pair below) mirroring the client-side
--    "target_handover_date" computation in _onboarding-list.tsx (programme_started_at, falling
--    back to scheduled_onboarding_start_at, + 14 days), so the "due_soonest" sort can run as a
--    plain indexed .order() instead of a client-side Array.sort() over the full result set.
--    NOT a GENERATED column: `timestamptz + interval` is STABLE, not IMMUTABLE, in Postgres
--    (interval day/month arithmetic is timezone-sensitive), so `GENERATED ALWAYS AS (...) STORED`
--    is rejected with "generation expression is not immutable" (42P17) — confirmed against the
--    live database.

-- ─── Search indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_name_trgm ON projects USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_company_name_trgm ON customers USING gin (company_name gin_trgm_ops);

-- ─── Sort indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);
CREATE INDEX IF NOT EXISTS idx_projects_end_date   ON projects(end_date);
CREATE INDEX IF NOT EXISTS idx_projects_name       ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- ─── Count-aggregate support ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_project_status_top_level
  ON tasks(project_id, status) WHERE parent_task_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_project_status ON issues(project_id, status);

-- ─── Developer project-access scoping ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_assignees_gin ON tasks USING gin (assignees);

-- ─── target_handover_at (trigger-maintained, not generated — see note 7 above) ──
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_handover_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_projects_target_handover_at ON projects(target_handover_at);

-- ─── Count-aggregate RPCs ────────────────────────────────────────────────────────
-- Scoped to a caller-supplied project_id list (the current page's rows only) — replaces
-- unscoped `select("project_id,status")` full-table reads in /projects/page.tsx.
CREATE OR REPLACE FUNCTION get_project_task_counts(p_project_ids uuid[])
RETURNS TABLE (project_id uuid, total int, done int)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    t.project_id,
    count(*)::int AS total,
    count(*) FILTER (WHERE t.status = 'closed')::int AS done
  FROM tasks t
  WHERE t.project_id = ANY(p_project_ids)
    AND t.parent_task_id IS NULL
  GROUP BY t.project_id;
$$;

CREATE OR REPLACE FUNCTION get_project_issue_counts(p_project_ids uuid[])
RETURNS TABLE (project_id uuid, total int, done int)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    i.project_id,
    count(*)::int AS total,
    count(*) FILTER (WHERE i.status = 'closed')::int AS done
  FROM issues i
  WHERE i.project_id = ANY(p_project_ids)
  GROUP BY i.project_id;
$$;

GRANT EXECUTE ON FUNCTION get_project_task_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_issue_counts(uuid[]) TO authenticated;

-- ─── projects.onboarding_status + target_handover_at (trigger-maintained, mirrors the
-- project_id/display_id trigger-column pattern; folded into one function/trigger pair since both
-- columns are driven by the same programme_started_at/scheduled_onboarding_start_at inputs) ────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS onboarding_status text;

CREATE OR REPLACE FUNCTION recompute_onboarding_status(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started timestamptz;
  v_scheduled timestamptz;
  v_last_phase_status text;
  v_status text;
  v_handover timestamptz;
BEGIN
  SELECT programme_started_at, scheduled_onboarding_start_at
    INTO v_started, v_scheduled
    FROM projects
    WHERE id = p_project_id;

  -- "Last" phase = highest sort_order for this project (mirrors the JS reduce() in
  -- GET /api/onboarding/projects, which this function replicates for the new page.tsx path).
  SELECT status INTO v_last_phase_status
    FROM customer_phases
    WHERE project_id = p_project_id
    ORDER BY sort_order DESC
    LIMIT 1;

  v_status := CASE
    WHEN v_last_phase_status = 'completed' THEN 'completed'
    WHEN v_started IS NOT NULL THEN 'in_progress'
    WHEN v_scheduled IS NOT NULL THEN 'scheduled'
    ELSE 'draft'
  END;

  -- NULL + interval = NULL in Postgres, so this is already NULL when neither source column is
  -- set. Plain plpgsql assignment (not a GENERATED column) sidesteps the IMMUTABLE requirement
  -- that rejects timestamptz + interval arithmetic in a generated-column expression.
  v_handover := COALESCE(v_started, v_scheduled) + interval '14 days';

  UPDATE projects
    SET onboarding_status = v_status, target_handover_at = v_handover
    WHERE id = p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_projects_recompute_onboarding_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recompute_onboarding_status(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_recompute_onboarding_status ON projects;
CREATE TRIGGER projects_recompute_onboarding_status
  AFTER INSERT OR UPDATE OF programme_started_at, scheduled_onboarding_start_at ON projects
  FOR EACH ROW
  EXECUTE FUNCTION trg_projects_recompute_onboarding_status();

CREATE OR REPLACE FUNCTION trg_customer_phases_recompute_onboarding_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recompute_onboarding_status(NEW.project_id);
  RETURN NEW;
END;
$$;

-- customer_phases rows are never deleted (skip = status 'skipped', not a row removal) —
-- INSERT/UPDATE OF status only, no DELETE trigger needed.
DROP TRIGGER IF EXISTS customer_phases_recompute_onboarding_status ON customer_phases;
CREATE TRIGGER customer_phases_recompute_onboarding_status
  AFTER INSERT OR UPDATE OF status ON customer_phases
  FOR EACH ROW
  EXECUTE FUNCTION trg_customer_phases_recompute_onboarding_status();

-- One-time backfill for existing rows.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM projects LOOP
    PERFORM recompute_onboarding_status(r.id);
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_projects_onboarding_status ON projects(onboarding_status);
