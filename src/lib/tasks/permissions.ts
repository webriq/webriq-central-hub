import type { Database } from "@/types/database";

type TaskStatus = Database["public"]["Tables"]["tasks"]["Row"]["status"];

// Task 209 — a developer who is assigned to (but did not create) a task may only move it
// forward through these two statuses; every other field stays read-only for them.
export const DEVELOPER_ASSIGNEE_STATUS_OPTIONS: TaskStatus[] = ["in_progress", "ready_for_qa"];

export type TaskEditPermission = {
  canEditDetails: boolean;
  canChangeStatus: boolean;
  allowedStatusValues: TaskStatus[] | "all";
};

const FULL_EDIT: TaskEditPermission = {
  canEditDetails: true,
  canChangeStatus: true,
  allowedStatusValues: "all",
};

const READ_ONLY: TaskEditPermission = {
  canEditDetails: false,
  canChangeStatus: false,
  allowedStatusValues: [],
};

const ASSIGNEE_STATUS_ONLY: TaskEditPermission = {
  canEditDetails: false,
  canChangeStatus: true,
  allowedStatusValues: DEVELOPER_ASSIGNEE_STATUS_OPTIONS,
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
  if (role === "admin" || role === "pm" || role === "super_admin") return FULL_EDIT;
  if (role !== "developer") return READ_ONLY;

  if (task.created_by === userId) return FULL_EDIT;
  if (task.assignees?.includes(userId)) return ASSIGNEE_STATUS_ONLY;
  return READ_ONLY;
}
