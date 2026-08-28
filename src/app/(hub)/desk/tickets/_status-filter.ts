// Shared between `page.tsx` (server) and `_tickets-index.tsx`/`_filter-multi-select.tsx`
// (client) — deliberately not marked "use client": Next.js proxies every export of a "use
// client" module as a client reference, so a plain function or const exported from one cannot
// be called/read from server code at runtime (only types, which erase at compile time, cross
// that boundary safely). This file has no client-only APIs, so it's safe on both sides.

// Curated status filter. `open`/`on_hold`/`escalated`/`closed` are the real `tickets.status`
// enum values (task 326); "Overdue" is a computed condition (`sla_due_at` in the past, not yet
// closed), not a status value at all — the query layer expresses it as a nested `and(...)`.
export const STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On Hold" },
  { value: "escalated", label: "Escalated" },
  { value: "closed", label: "Closed" },
  { value: "overdue", label: "Overdue" },
] as const;

// Absent `status` param (first-ever visit to the page) defaults to "Open" only — distinct from
// an explicit `?status=all` (every option checked, written by `FilterMultiSelect`'s own "All"
// toggle) and an explicit `?status=` (every option unchecked, shows zero tickets). Once the user
// interacts with the filter at all, the URL always carries an explicit value and this default
// never re-applies.
export function parseStatusFilterParam(raw: string | null): string[] {
  if (raw === null) return ["open"];
  if (raw === "all") return STATUS_FILTER_OPTIONS.map((o) => o.value);
  if (raw === "") return [];
  return raw.split(",");
}
