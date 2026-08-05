-- Migration 094: time_logs — developer read-all (Task Detail "Time Logs" tab, task 214)
-- time_logs_developer_own (migration 026) only lets a developer see their OWN rows. The new
-- Time Logs tab needs to show every entry logged against a task (like task_comments_staff_read,
-- migration 048, does for comments) so a developer can see teammates' logged hours on a shared
-- task. Write access is untouched — still own-row only, via time_logs_developer_own's own
-- USING/WITH CHECK (permissive policies OR together for SELECT, so this only adds read reach).
create policy "time_logs_developer_read_all"
  on time_logs for select to authenticated
  using (get_my_role() = 'developer');
