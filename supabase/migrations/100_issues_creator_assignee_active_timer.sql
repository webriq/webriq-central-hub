-- Migration 100: Issue Creator/Assignee columns + Active Timer support for Issues (task 234)
--
-- issues.created_by — mirrors tasks.created_by (migration 092). Always null for existing rows
-- (100% Zoho-imported, no in-Hub issue-creation flow exists) and for any future Zoho-imported
-- rows too — wired for a future issue-creation flow, not reachable by any current data path.
-- issues.assignee_id — a real FK to profiles, resolved once here by best-effort match against
-- the existing free-text assignee_name column (Zoho's own data), and going forward set directly
-- by the Issue Detail page's Assignee selector instead of relying on name-string equality.
-- assignee_name/assignee_email are kept as-is (unchanged, still Zoho's own text fields).

alter table issues add column created_by uuid references profiles(id) on delete set null;
alter table issues add column assignee_id uuid references profiles(id) on delete set null;

update issues i
set assignee_id = p.id
from profiles p
where i.assignee_name is not null
  and p.full_name = i.assignee_name
  and i.assignee_id is null;

create index issues_assignee_id_idx on issues(assignee_id) where assignee_id is not null;
create index issues_created_by_idx on issues(created_by) where created_by is not null;

-- developer: creator or assignee may update their own issue rows (row-visibility only — field
-- value restriction enforced in the PATCH API route, mirrors tasks_developer_update, migration 092).
-- issues_pm_write (migration 051) is untouched and stays admin/super_admin/pm-only for all ops
-- including delete — RLS policies for the same operation are OR'd together, so this is additive.
create policy "issues_developer_update"
  on issues for update to authenticated
  using (get_my_role() = 'developer' and (created_by = auth.uid() or assignee_id = auth.uid()))
  with check (get_my_role() = 'developer');

-- active_timers: add issue_id so a developer can time an Issue the same way they time a Task.
-- Mutually exclusive with task_id by convention, enforced in the timer API routes (not a DB
-- CHECK) — matches this table's existing app-layer-only enforcement style (task_id and
-- break_type are already allowed to coexist with no DB constraint forcing exclusivity either).
alter table active_timers add column issue_id uuid references issues(id) on delete cascade;
create index idx_active_timers_issue_id on active_timers(issue_id) where issue_id is not null;
