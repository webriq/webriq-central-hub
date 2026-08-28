# 331: Desk Tickets List View — "Archived" Filter (hide the Zoho archive by default)

**Created:** 2026-08-28
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed (2026-08-28)

---

## Overview

Task 325 imported ~1566 archived Zoho Desk tickets into the same `tickets` table as live
tickets (`source_meta.isArchived === true`). They're all `status = 'closed'`, so the Desk
Tickets list view (task 309) now shows them mixed into the "Closed" status view — the count
jumps from ~528 live-closed to ~2094. There was no way to tell archived from live or to
exclude them.

This adds an **"Archived"** checkbox to the existing Status filter dropdown, below a divider,
**defaulting OFF** so archived tickets stay out of the default and status views until
explicitly requested.

## Key facts

- `source_meta->>'isArchived'` is `'true'` only for the task-325 archive import. Live Zoho
  imports have `'false'`; **Hub-native email-poll tickets are inserted with no `source_meta`
  at all**, so their value is `NULL`. The "not archived" test must be NULL-safe:
  `isArchived IS NULL OR isArchived <> 'true'` — never `= 'false'`.
- "Archived" is **orthogonal to status** (an archived ticket is always `closed`), so it can't
  be a plain union member of the existing `.or()` status filter — checking "Closed" must not
  drag in the archive.

## Requirements

- [x] "Archived" appears as the last option in the **Status** filter dropdown, separated from
      the real statuses (Open / On Hold / Escalated / Closed / Overdue) by a hairline divider.
- [x] Default (no `?status=` param) stays `["open"]` → archived excluded with zero config.
- [x] **Archived unchecked:** the query applies the selected status union AND
      `NOT_ARCHIVED_OR` (`source_meta->>isArchived.is.null,source_meta->>isArchived.neq.true`)
      — "Closed" alone shows live closed only (~528), not the ~1566 archive.
- [x] **Archived checked:** archived rows are OR'd back in
      (`<statusClause>,source_meta->>isArchived.eq.true`) — "Closed" + "Archived" → all closed
      (~2094); "Archived" alone → every archived ticket (~1566).
- [x] **"Archived" is a mutually-exclusive mode, not a combinable status.** Checking it
      clears every other status (selection becomes just `["archived"]`); checking any real
      status clears "Archived". Unchecking "Archived" → empty selection (zero-state), same as
      unchecking the last status.
- [x] **"All" (the dropdown's synthetic top row) covers only the 5 real statuses — NOT
      "Archived".** Clicking "All" shows every non-archived ticket (~538) and clears any
      "Archived" selection. `?status=all` round-trips to those 5 values. There is no UI path
      to "every status including archived" any more (it was `?status=<all 6>`, which the query
      layer still honours if hand-constructed).
- [x] Zero selection → matches no rows (unchanged).
- [x] Count, pagination, empty state, and "Clear filters" all flow from the query. "Clear
      filters" → `?status=all` → the 5 real statuses (archived excluded) → shows all
      non-archived tickets.
- [x] No row-level badge / visual marker (per the design decision — filter only).

## Out of Scope / Must-Not-Change

- No row badge, no separate column, no change to `_tickets-table.tsx` or the `TicketListItem`
  row model.
- No change to the import, `_resolve.ts`, the detail page, or any API route.
- The `tickets` schema — no migration.
- The Projects / Portfolio-Tracker copies of `FilterMultiSelect` — untouched (the new
  `dividerBeforeValue` prop is optional and additive).

## Files Changed

| File | Change |
|------|--------|
| `src/app/(hub)/desk/tickets/_status-filter.ts` | Add `{ value: "archived", label: "Archived" }` to `STATUS_FILTER_OPTIONS`; export `ARCHIVED_FILTER_VALUE` and `ALL_STATUS_VALUES` (the 5 real statuses — what "All" means). `parseStatusFilterParam("all")` now returns `ALL_STATUS_VALUES` (was every option). Default (`["open"]`) unchanged. |
| `src/app/(hub)/desk/tickets/_filter-multi-select.tsx` | Three new optional props: `dividerBeforeValue?: string` (hairline above the matching option), `allToggleValues?: readonly string[]` (the exact set "All" toggles/reflects — defaults to every option), `exclusiveValue?: string` (a mode option mutually exclusive with all others — `toggleOption` clears the rest when it's checked and drops it when any other option is checked). `allChecked` = selection equals `allValues` exactly. Each option wrapped in a keyed `<div>`. |
| `src/app/(hub)/desk/tickets/page.tsx` | Split `statusSelected` → `archivedChecked` + `realStatuses`; new `NOT_ARCHIVED_OR` / `IS_ARCHIVED` clause consts; rework the status-filter query branch (zero / all-6 / archived-checked / archived-unchecked). `buildStatusOrClause` now documented as status-only and returns `""` when empty. |
| `src/app/(hub)/desk/tickets/_tickets-index.tsx` | Pass `dividerBeforeValue` + `allToggleValues={ALL_STATUS_VALUES}` + `exclusiveValue={ARCHIVED_FILTER_VALUE}` to `FilterMultiSelect`. `handleStatusChange` writes `"all"` when the selection is exactly `ALL_STATUS_VALUES`; `isFiltered` is now "search active OR selection ≠ exactly ALL_STATUS_VALUES". |

## Verification

- `npx tsc --noEmit` — PASS (no new errors)
- `pnpm lint` (`npx eslint` on the 4 files) — PASS
- **PostgREST clause probe against live DB** (2104 tickets: 538 non-archived, 1566 archived):
  - `NOT_ARCHIVED_OR` → 538 ✓ (3 of the original 541 live rows flipped to archived on the
    task-325 import, as predicted)
  - `IS_ARCHIVED` → 1566 ✓
  - `status.eq.closed` AND `NOT_ARCHIVED_OR` (two `or=` params) → 528 ✓ (live closed only)
  - "All" = 5-status union AND `NOT_ARCHIVED_OR` → 538 ✓ (all non-archived)
  - all 6 checked → no filter → 2104 ✓ (everything)
  - `or(status.eq.open,isArchived.eq.true)` → 1576 ✓
  - `or(status.eq.closed,isArchived.eq.true)` → 2094 ✓
  - Confirms multiple `.or()` calls are ANDed by PostgREST (relied on by the archived-unchecked
    branch) and the JSON-path operators parse inside `or=()`.
- Browser acceptance — pending: default view hides archive; check "Archived" → all other
  statuses un-check, list shows the 1566 archived; check any status → "Archived" un-checks;
  click "All" → 538 non-archived, "Archived" cleared; uncheck "Archived" → empty/zero-state;
  divider renders above "Archived"; count + pagination track the filter.

## Implementation Notes

### Deviations From Plan
- Original design proposed a separate "View" (Active/Archived/All) dropdown; the user asked
  for it folded into the existing **Status** dropdown with a divider instead. Implemented that
  way — one filter control, "Archived" below a hairline.
- Follow-up refinement (user request): **"All" excludes "Archived".** The dropdown's "All"
  row toggles/reflects only the 5 real statuses (`ALL_STATUS_VALUES`); clicking "All" clears
  "Archived". Added the generic `allToggleValues` prop to `FilterMultiSelect`. `?status=all`
  and "Clear filters" both mean "all non-archived".
- Follow-up refinement 2 (user request): **"Archived" is mutually exclusive** with every
  status — checking it clears the rest, checking any status clears it. Added the generic
  `exclusiveValue` prop to `FilterMultiSelect` (`toggleOption` special-cases it). So the
  archived view is always exactly `?status=archived`.
- `_filter-multi-select.tsx` / `_tickets-index.tsx` carry pre-existing `text-[Npx]` literal
  font sizes (impeccable flags them) — left as-is per CLAUDE.md's UI-polish note (match the
  file's hand-rolled pattern, don't introduce a second one). No new literals added by this task.

## Completion Note

**Marked complete at the user's explicit request (2026-08-28).** `npx tsc --noEmit` and
`pnpm lint` pass; the filter logic is verified end-to-end at the data layer (live PostgREST
probe — every combination reconciles). The one outstanding item is **browser acceptance** of
the dropdown interaction (divider render, the "Archived" mutual-exclusion and "All" clearing
behaviour) — an operator check, not a code gap.
