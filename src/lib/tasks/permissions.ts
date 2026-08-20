import type { Database } from "@/types/database";

type TaskStatus = Database["public"]["Tables"]["tasks"]["Row"]["status"];

// Task 209 — a developer who is assigned to (but did not create) a task may only move it
// forward through these two statuses; every other field stays read-only for them.
export const DEVELOPER_ASSIGNEE_STATUS_OPTIONS: TaskStatus[] = ["in_progress", "ready_for_qa"];

export type TaskEditPermission = {
  canEditDetails: boolean;
  canChangeStatus: boolean;
  allowedStatusValues: TaskStatus[] | "all";
  // Independent of the edit tier — an assignee gets this regardless of whether they're also the
  // creator; PM/Admin/super_admin get `false` since /api/v2/timer/start already 403s any
  // non-developer role, so the client should never show a button that would fail. Mirrors
  // getIssueEditPermission's `canStartTimer` (src/lib/issues/permissions.ts).
  canStartTimer: boolean;
};

const FULL_EDIT: TaskEditPermission = {
  canEditDetails: true,
  canChangeStatus: true,
  allowedStatusValues: "all",
  canStartTimer: false,
};

const READ_ONLY: TaskEditPermission = {
  canEditDetails: false,
  canChangeStatus: false,
  allowedStatusValues: [],
  canStartTimer: false,
};

const ASSIGNEE_STATUS_ONLY: TaskEditPermission = {
  canEditDetails: false,
  canChangeStatus: true,
  allowedStatusValues: DEVELOPER_ASSIGNEE_STATUS_OPTIONS,
  canStartTimer: true,
};

/**
 * Single source of truth for task edit rights — used both server-side (API route
 * enforcement) and client-side (disabling/hiding controls). Keep in sync with the
 * `tasks_developer_update` RLS policy (migration 092), which only enforces row visibility;
 * this is what enforces which fields/values are actually allowed.
 */
export function getTaskEditPermission(
  role: string | null | undefined,
  userId: string,
  task: { created_by: string | null; assignees: string[] | null }
): TaskEditPermission {
  const isAssignee = task.assignees?.includes(userId) ?? false;

  if (role === "admin" || role === "pm" || role === "super_admin") {
    return { ...FULL_EDIT, canStartTimer: false };
  }
  if (role !== "developer") return READ_ONLY;

  if (task.created_by === userId) return { ...FULL_EDIT, canStartTimer: isAssignee };
  if (isAssignee) return ASSIGNEE_STATUS_ONLY;
  return READ_ONLY;
}
