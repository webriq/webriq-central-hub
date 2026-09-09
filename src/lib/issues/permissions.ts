// Task 234 — mirrors src/lib/tasks/permissions.ts's shape, but is deliberately a separate
// function, not a shared/generalized one: issue `status` is a plain string column (not the
// TaskStatus union), and per this task's own planning, "assignee" is a strictly lower tier than
// "creator" for issues (unlike tasks, where an assignee-only developer also gets status-change
// rights) — the ask was "assignee → timer only" and "creator → edit title/description/etc.".
// ISSUE_ASSIGNEE_STATUS_OPTIONS is duplicated locally rather than imported from the tasks module
// — matches this codebase's established convention of duplicating small per-entity arrays across
// independent permission modules (see task 233's Decision 3 for the same reasoning already
// accepted here).
const ISSUE_ASSIGNEE_STATUS_OPTIONS = ["in_progress", "ready_for_qa"] as const;

export type IssueEditPermission = {
  canEditDetails: boolean;
  canChangeStatus: boolean;
  allowedStatusValues: readonly string[] | "all";
  // Independent of the edit tier — an assignee gets this regardless of whether they're also the
  // creator; PM/Admin/super_admin get `false` since /api/v2/timer/start already 403s any
  // non-developer role, so the client should never show a button that would fail.
  canStartTimer: boolean;
};

const FULL_EDIT_BASE = { canEditDetails: true, canChangeStatus: true, allowedStatusValues: "all" as const };
const READ_ONLY: IssueEditPermission = {
  canEditDetails: false,
  canChangeStatus: false,
  allowedStatusValues: [],
  canStartTimer: false,
};

/**
 * Normalize an issue row's assignees to an id array — reads the multi-assignee `assignees`
 * column (migration 132), falling back to the legacy scalar `assignee_id` for rows not yet
 * backfilled / read before that migration is applied. The one place the array/scalar bridge
 * lives; every consumer (permissions, timer eligibility, filter, list picker) goes through it.
 */
export function issueAssigneeIds(issue: {
  assignees?: string[] | null;
  assignee_id?: string | null;
}): string[] {
  if (issue.assignees && issue.assignees.length > 0) return issue.assignees;
  return issue.assignee_id ? [issue.assignee_id] : [];
}

/**
 * Single source of truth for issue edit rights — used both server-side (API route enforcement)
 * and client-side (disabling/hiding controls). Keep in sync with the `issues_developer_update`
 * RLS policy (migration 132), which only enforces row visibility; this is what enforces which
 * fields/values are actually allowed.
 */
export function getIssueEditPermission(
  role: string | null | undefined,
  userId: string,
  issue: { created_by: string | null; assignees?: string[] | null; assignee_id?: string | null }
): IssueEditPermission {
  const isAssignee = issueAssigneeIds(issue).includes(userId);

  if (role === "admin" || role === "pm" || role === "super_admin") {
    return { ...FULL_EDIT_BASE, canStartTimer: false };
  }
  if (role !== "developer") return READ_ONLY;

  if (issue.created_by === userId) {
    return { ...FULL_EDIT_BASE, canStartTimer: isAssignee };
  }
  if (isAssignee) {
    return {
      canEditDetails: false,
      canChangeStatus: true,
      allowedStatusValues: ISSUE_ASSIGNEE_STATUS_OPTIONS,
      canStartTimer: true,
    };
  }
  return READ_ONLY;
}
