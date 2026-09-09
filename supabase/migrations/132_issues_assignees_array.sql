-- Migration 132: issues.assignees uuid[] — multi-assignee parity with tasks (task 351)
--
-- Issues have only ever supported one assignee (assignee_id, migration 100). Tasks already
-- support many (tasks.assignees uuid[], migration 092). This adds the array to issues and
-- brings the developer-update RLS to the same shape as tasks_developer_update.
--
-- assignee_id / assignee_name / assignee_email are KEPT and stay in sync app-side
-- (assignee_id := assignees[0]) for the Zoho export + any legacy display path not yet migrated.
--
-- Written for task 351; APPLY MANUALLY (Notes/issues-migration convention, tasks 129/345/347).
-- Until applied, the app reads `issue.assignees ?? [assignee_id]` so everything keeps working
-- single-assignee.

alter table issues add column assignees uuid[];

-- one-time backfill from the existing scalar FK
update issues
set assignees = array[assignee_id]
where assignee_id is not null and assignees is null;

-- developer: creator OR any array member may update their own issue rows (row-visibility only —
-- field/value restriction stays in the PATCH API route via getIssueEditPermission). Mirrors
-- tasks_developer_update (migration 092). issues_pm_write (migration 051) is untouched and
-- still OR's in for admin/super_admin/pm on every op including delete.
drop policy if exists "issues_developer_update" on issues;
create policy "issues_developer_update"
  on issues for update to authenticated
  using (get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees)))
  with check (get_my_role() = 'developer');

create index issues_assignees_gin on issues using gin (assignees);
