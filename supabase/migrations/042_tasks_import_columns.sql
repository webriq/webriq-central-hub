-- Migration 042: Tasks import — full column set + free-form status
--
-- 1. Drop the tasks_status_check constraint (migration 034) so Zoho status names can be
--    stored verbatim ("Ready for QA/QC", "Roadblock", etc.). Status is free-form text
--    going forward; Hub-native tasks created after decommission use the same column.
-- 2. Back-fill any existing rows that used old Hub-style snake_case values.
-- 3. Add five columns needed for the full Zoho dataset.

-- Step 1: drop old constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Step 2: back-fill existing rows to readable Zoho-style names
UPDATE tasks SET status = 'Open'                WHERE status = 'open';
UPDATE tasks SET status = 'In Progress'         WHERE status = 'in_progress';
UPDATE tasks SET status = 'Ready for QA/QC'     WHERE status = 'ready_for_qa';
UPDATE tasks SET status = 'Closed'              WHERE status IN ('closed', 'testing_completed');
UPDATE tasks SET status = 'For Client Approval' WHERE status = 'for_client_approval';
UPDATE tasks SET status = 'Ready to Merge'      WHERE status = 'ready_to_merge';
UPDATE tasks SET status = 'Post-live QA/QC'     WHERE status = 'post_live_qa';

-- Step 3: update default to match Zoho's default open status name
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'Open';

-- Step 4: add missing import columns
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completion_percentage integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_completed          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS depth                 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_on          timestamptz,
  ADD COLUMN IF NOT EXISTS source_meta           jsonb NOT NULL DEFAULT '{}';

-- Step 5: index for subtask hierarchy queries
CREATE INDEX IF NOT EXISTS tasks_depth_idx ON tasks(depth) WHERE depth > 0;
