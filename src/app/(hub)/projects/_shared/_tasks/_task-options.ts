import type { TaskStatus, TaskPriority } from "@/app/(hub)/projects-old/_pm-shared";
import type { SortKey, SortDir } from "@/lib/tasks/task-sort";

// Task 487 — moved from `_project-detail.tsx` (still re-exported there for `_create-task-modal.tsx`).
export const STATUS_OPTS: TaskStatus[] = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
];
export const PRIORITY_OPTS: TaskPriority[] = ["low", "normal", "high", "critical"];

export const SORT_OPTIONS: { value: string; label: string; key: SortKey; dir: SortDir }[] = [
  { value: "position_asc",  label: "Manual order",             key: "position", dir: "asc" },
  { value: "status_asc",    label: "Status (pipeline order)",  key: "status",   dir: "asc" },
  { value: "status_desc",   label: "Status (reverse order)",   key: "status",   dir: "desc" },
  { value: "name_asc",      label: "Task name (A–Z)",          key: "title",    dir: "asc" },
  { value: "name_desc",     label: "Task name (Z–A)",          key: "title",    dir: "desc" },
  { value: "due_soonest",   label: "Due date (soonest)",       key: "due_date", dir: "asc" },
  { value: "due_latest",    label: "Due date (latest)",        key: "due_date", dir: "desc" },
  { value: "priority_high", label: "Priority (highest first)", key: "priority", dir: "asc" },
  { value: "priority_low",  label: "Priority (lowest first)",  key: "priority", dir: "desc" },
];
