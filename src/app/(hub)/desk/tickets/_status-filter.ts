// Shared between `page.tsx` (server) and `_tickets-index.tsx`/`_filter-multi-select.tsx`
// (client) — deliberately not marked "use client": Next.js proxies every export of a "use
// client" module as a client reference, so a plain function or const exported from one cannot
// be called/read from server code at runtime (only types, which erase at compile time, cross
// that boundary safely). This file has no client-only APIs, so it's safe on both sides.

// Curated status filter. `open`/`on_hold`/`escalated`/`closed` are the real `tickets.status`
// enum values (task 326); "Overdue" is a computed condition (`sla_due_at` in the past, not yet
// closed), not a status value at all — the query layer expresses it as a nested `and(...)`.
//
// "Archived" (task 331) is also not a status — it's `source_meta.isArchived === true` on the
// imported Zoho Desk archive (task 325), orthogonal to every status (an archived ticket is
// always `closed`). It sits below a divider in the dropdown and defaults OFF: when unchecked
// the query AND-excludes archived rows; when checked they're OR'd back in. See
// `ARCHIVED_FILTER_VALUE` and `buildStatusOrClause` in `page.tsx`.
export const ARCHIVED_FILTER_VALUE = "archived";

export const STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On Hold" },
  { value: "escalated", label: "Escalated" },
  { value: "closed", label: "Closed" },
  { value: "overdue", label: "Overdue" },
  { value: ARCHIVED_FILTER_VALUE, label: "Archived" },
] as const;

// What the dropdown's "All" row toggles and reflects — every status EXCEPT "Archived", so the
// archive stays opt-in even from the "All" shortcut. Checking "Archived" therefore un-checks
// "All" (the selection is no longer exactly this set), and clicking "All" clears "Archived".
export const ALL_STATUS_VALUES = STATUS_FILTER_OPTIONS
  .map((o) => o.value)
  .filter((v) => v !== ARCHIVED_FILTER_VALUE);

// Absent `status` param (first-ever visit to the page) defaults to "Open" only — distinct from
// an explicit `?status=all` (the "All" row: every status EXCEPT "Archived", written by
// `FilterMultiSelect`'s own toggle) and an explicit `?status=` (every option unchecked, shows
// zero tickets). "Archived" is never part of `?status=all` — to include it the URL carries the
// full explicit list. Once the user interacts with the filter at all, the URL always carries an
// explicit value and this default never re-applies.
export function parseStatusFilterParam(raw: string | null): string[] {
  if (raw === null) return ["open"];
  if (raw === "all") return [...ALL_STATUS_VALUES];
  if (raw === "") return [];
  return raw.split(",");
}
