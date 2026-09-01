-- Migration 129: Backfill issues.assignee_id from the free-text assignee_name (task 345)
--
-- Migration 100 added issues.assignee_id (FK → profiles.id) and did a one-time backfill with an
-- exact, case-sensitive `p.full_name = i.assignee_name` match and no ambiguity guard. Any issue
-- assigned since then via the Issues *listing* wrote only assignee_name (the list-view
-- IssueAssigneePicker never set assignee_id until task 345), and any issue whose Zoho assignee
-- email didn't map to a hub_users row on import also came through with assignee_id null. Those
-- rows are invisible to getIssueEditPermission() (status-change 403) and to the timer.
--
-- This re-resolves assignee_id for the remaining `assignee_id IS NULL AND assignee_name IS NOT
-- NULL` rows, case/whitespace-insensitive, and ONLY when exactly one profile carries that name
-- (ambiguous names are left null rather than guessed). Idempotent — scoped to null rows.

with unambiguous_profiles as (
  -- exactly one row per group (having count(*) = 1), so array_agg[1] is that lone id;
  -- Postgres has no min()/max() aggregate for uuid.
  select lower(btrim(full_name)) as norm_name, (array_agg(id))[1] as profile_id
  from profiles
  where full_name is not null and btrim(full_name) <> ''
  group by lower(btrim(full_name))
  having count(*) = 1
)
update issues i
set assignee_id = up.profile_id
from unambiguous_profiles up
where i.assignee_id is null
  and i.assignee_name is not null
  and lower(btrim(i.assignee_name)) = up.norm_name;

-- Grant the just-linked assignees persistent project access, matching addProjectMember()'s
-- behaviour on a live assignment (task 287). added_by is null (system backfill). ON CONFLICT
-- keeps this safe to re-run and non-destructive to existing membership rows.
insert into project_members (project_id, user_id, added_by)
select distinct i.project_id, i.assignee_id, null::uuid
from issues i
where i.assignee_id is not null
on conflict (project_id, user_id) do nothing;
