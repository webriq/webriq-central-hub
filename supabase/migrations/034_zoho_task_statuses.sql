-- 034_zoho_task_statuses.sql
-- Align tasks.status with Zoho Projects workflow.
-- New values: open | in_progress | ready_for_qa | testing_completed |
--             for_client_approval | ready_to_merge | post_live_qa | closed

-- Step 1: Drop old constraint first so the remapping UPDATEs are not rejected
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Step 2: Remap existing rows to new status values
UPDATE tasks SET status = 'open'         WHERE status IN ('backlog', 'todo');
UPDATE tasks SET status = 'ready_for_qa' WHERE status = 'for_review';
UPDATE tasks SET status = 'closed'       WHERE status IN ('done', 'cancelled');

-- Step 3: Add new constraint
ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN (
    'open',
    'in_progress',
    'ready_for_qa',
    'testing_completed',
    'for_client_approval',
    'ready_to_merge',
    'post_live_qa',
    'closed'
  ));

-- Step 4: Update column default
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'open';
