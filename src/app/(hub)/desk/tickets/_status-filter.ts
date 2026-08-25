// Shared between `page.tsx` (server) and `_tickets-index.tsx`/`_filter-multi-select.tsx`
// (client) — deliberately not marked "use client": Next.js proxies every export of a "use
// client" module as a client reference, so a plain function or const exported from one cannot
// be called/read from server code at runtime (only types, which erase at compile time, cross
// that boundary safely). This file has no client-only APIs, so it's safe on both sides.

// Curated status filter — not a 1:1 mirror of `tickets.status`'s 6-value enum. "On Hold" maps
// to the `waiting_on_us` status (Zoho's own "hold"/"escalated" tickets land there per
// `mapTicketStatus`); "Overdue" is a computed condition (`sla_due_at` in the past, not yet
// resolved/closed), not a status value at all. `new`/`waiting_on_client`/`resolved` are real
// enum values with no dedicated chip here — they only ever surface under "All" (the real
// imported dataset never produces them; they exist for future live-created tickets, task 303).
export const STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "on_hold", label: "On Hold" },
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
