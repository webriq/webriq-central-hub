import type { Task, Issue } from "@/app/(hub)/projects-old/_pm-shared";
import type { FilterOption } from "./_list-toolbar-controls";

// Task 346 — pure helpers backing the Assignee filter on the Tasks and Issues toolbars.
// Kept out of `_project-detail.tsx` (one concern per file, unit-testable).

export const UNASSIGNED_VALUE = "__unassigned__";

type MemberLite = { id: string; full_name: string | null };

/**
 * Options for the Assignee `FilterMultiSelect`:
 *   [ "Unassigned", <current user "(You)">, ...other members A–Z ]
 * The current user is always present even when absent from `allMembers`
 * (e.g. a PM/admin viewing a project they are not a member of).
 */
export function buildAssigneeFilterOptions(
  allMembers: MemberLite[],
  currentUserId: string,
  profilesById: Record<string, { full_name: string }>,
): FilterOption[] {
  const members: MemberLite[] = [...allMembers];
  if (!members.some((m) => m.id === currentUserId)) {
    members.push({ id: currentUserId, full_name: profilesById[currentUserId]?.full_name ?? "You" });
  }
  members.sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    return (a.full_name ?? "").localeCompare(b.full_name ?? "");
  });
  return [
    { value: UNASSIGNED_VALUE, label: "Unassigned" },
    ...members.map((m) => ({
      value: m.id,
      label: m.id === currentUserId ? `${m.full_name ?? "You"} (You)` : (m.full_name ?? "Unknown"),
    })),
  ];
}

/** Normalized `full_name` → member id, for resolving an Issue's legacy `assignee_name`. */
export function buildMemberIdByName(allMembers: MemberLite[]): Map<string, string> {
  return new Map(
    allMembers
      .filter((m) => m.full_name && m.full_name.trim())
      .map((m) => [m.full_name!.toLowerCase().trim(), m.id] as const),
  );
}

/**
 * `allSelected` short-circuits to `true` — so a Task assigned to someone no longer in the
 * member pool is never hidden by the default (every-option-selected) state.
 */
export function taskMatchesAssigneeFilter(
  task: Task,
  selectedSet: Set<string>,
  allSelected: boolean,
): boolean {
  if (allSelected) return true;
  const ids = task.assignees ?? [];
  if (ids.length === 0) return selectedSet.has(UNASSIGNED_VALUE);
  return ids.some((id) => selectedSet.has(id));
}

export function issueMatchesAssigneeFilter(
  issue: Issue,
  memberIdByName: Map<string, string>,
  selectedSet: Set<string>,
  allSelected: boolean,
): boolean {
  if (allSelected) return true;
  const resolvedId =
    issue.assignee_id ??
    (issue.assignee_name ? memberIdByName.get(issue.assignee_name.toLowerCase().trim()) ?? null : null);
  if (resolvedId) return selectedSet.has(resolvedId);
  // No FK and no resolvable name: unassigned only when neither field is set;
  // a legacy name that maps to nobody is excluded while the filter is narrowed.
  if (!issue.assignee_id && !issue.assignee_name) return selectedSet.has(UNASSIGNED_VALUE);
  return false;
}
