// Shared between `page.tsx` (server) and `_filed-issues-index.tsx`/`_filter-multi-select.tsx`
// (client) — see `desk/inbox/_status-filter.ts`'s identical header comment for why this file
// is deliberately NOT marked "use client".
//
// Task 363 — the full `issues.status` vocabulary (same 8 values as a project's own Issues tab),
// distinct from Inbox's `tickets.status` vocabulary (open/on_hold/escalated/closed) — no
// "overdue"/"archived" concepts here, those are ticket-specific.

export const STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "ready_for_qa", label: "Ready for QA/QC" },
  { value: "testing_completed", label: "Testing Completed" },
  { value: "for_client_approval", label: "For Client Approval" },
  { value: "ready_to_merge", label: "Ready to Merge" },
  { value: "post_live_qa", label: "Post-live QA/QC" },
  { value: "closed", label: "Closed" },
] as const;

export const ALL_STATUS_VALUES = STATUS_FILTER_OPTIONS.map((o) => o.value);

// Absent `status` param (default view) shows every status — unlike Inbox, there's no
// "Open only" default here since a filed issue's whole lifecycle (through Closed) is relevant to
// the assignee tracking this tab exists for.
export function parseStatusFilterParam(raw: string | null): string[] {
  if (raw === null || raw === "all") return [...ALL_STATUS_VALUES];
  if (raw === "") return [];
  return raw.split(",");
}
