// Task 234 — mirrors src/lib/tasks/permissions.ts's shape, but is deliberately a separate
// function, not a shared/generalized one: ticket `status` is a plain string column (not the
// TaskStatus union), and per this task's own planning, "assignee" is a strictly lower tier than
// "creator" for tickets (unlike tasks, where an assignee-only developer also gets status-change
// rights) — the ask was "assignee → timer only" and "creator → edit title/description/etc.".
// TICKET_ASSIGNEE_STATUS_OPTIONS is duplicated locally rather than imported from the tasks module
// — matches this codebase's established convention of duplicating small per-entity arrays across
// independent permission modules (see task 233's Decision 3 for the same reasoning already
// accepted here).
//
// Task 364 renamed "Issue" to "Ticket" everywhere at the application layer — this module still
// operates on the `issues` DB table (unchanged, see task 364's Out of Scope), just under
// `src/lib/tickets/` now instead of `src/lib/issues/`.
const TICKET_ASSIGNEE_STATUS_OPTIONS = ["in_progress", "ready_for_qa"] as const;

export type TicketEditPermission = {
  canEditDetails: boolean;
  canChangeStatus: boolean;
  allowedStatusValues: readonly string[] | "all";
  // Independent of the edit tier — an assignee gets this regardless of whether they're also the
  // creator; PM/Admin/super_admin get `false` since /api/v2/timer/start already 403s any
  // non-developer role, so the client should never show a button that would fail.
  canStartTimer: boolean;
};

const FULL_EDIT_BASE = { canEditDetails: true, canChangeStatus: true, allowedStatusValues: "all" as const };
const READ_ONLY: TicketEditPermission = {
  canEditDetails: false,
  canChangeStatus: false,
  allowedStatusValues: [],
  canStartTimer: false,
};

/**
 * Normalize a ticket row's assignees to an id array — reads the multi-assignee `assignees`
 * column (migration 132), falling back to the legacy scalar `assignee_id` for rows not yet
 * backfilled / read before that migration is applied. The one place the array/scalar bridge
 * lives; every consumer (permissions, timer eligibility, filter, list picker) goes through it.
 */
export function ticketAssigneeIds(ticket: {
  assignees?: string[] | null;
  assignee_id?: string | null;
}): string[] {
  if (ticket.assignees && ticket.assignees.length > 0) return ticket.assignees;
  return ticket.assignee_id ? [ticket.assignee_id] : [];
}

/**
 * Single source of truth for ticket edit rights — used both server-side (API route enforcement)
 * and client-side (disabling/hiding controls). Keep in sync with the `issues_developer_update`
 * RLS policy (migration 132), which only enforces row visibility; this is what enforces which
 * fields/values are actually allowed.
 */
export function getTicketEditPermission(
  role: string | null | undefined,
  userId: string,
  ticket: { created_by: string | null; assignees?: string[] | null; assignee_id?: string | null }
): TicketEditPermission {
  const isAssignee = ticketAssigneeIds(ticket).includes(userId);

  if (role === "admin" || role === "pm" || role === "super_admin") {
    return { ...FULL_EDIT_BASE, canStartTimer: false };
  }
  if (role !== "developer") return READ_ONLY;

  if (ticket.created_by === userId) {
    return { ...FULL_EDIT_BASE, canStartTimer: isAssignee };
  }
  if (isAssignee) {
    return {
      canEditDetails: false,
      canChangeStatus: true,
      allowedStatusValues: TICKET_ASSIGNEE_STATUS_OPTIONS,
      canStartTimer: true,
    };
  }
  return READ_ONLY;
}
