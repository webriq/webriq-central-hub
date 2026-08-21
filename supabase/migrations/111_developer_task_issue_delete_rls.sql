-- Migration 111: Developer delete rights for own tasks/issues (task 285)
--
-- Previously developers had zero delete rights on tasks/issues — tasks_pm_write /
-- issues_pm_write (migrations 048/051) are FOR ALL scoped to admin/super_admin/pm only, and no
-- developer delete policy existed (migrations 092/100's own comments confirm developers only
-- ever got insert/update policies). The Hub UI already showed the task-detail/issue-detail
-- delete buttons to developer creators (getTaskEditPermission/getIssueEditPermission's
-- canEditDetails, true for the creator-developer), so those deletes were silently failing at
-- the RLS layer. This grants developers real delete rights, scoped to rows they created — same
-- row-visibility shape as tasks_developer_update / issues_developer_update (migrations 092/100),
-- minus the assignee clause: an assignee who isn't the creator still cannot delete.

create policy "tasks_developer_delete"
  on tasks for delete to authenticated
  using (get_my_role() = 'developer' and created_by = auth.uid());

create policy "issues_developer_delete"
  on issues for delete to authenticated
  using (get_my_role() = 'developer' and created_by = auth.uid());
