# 410: Time Logs — Fix Task/Ticket Link 404, Restyle Row Actions (Open + Copy URL, Tooltips), Per-Day Totals

**Created:** 2026-10-01
**Priority:** MEDIUM
**Type:** fix + enhancement
**Recommended Tier:** balanced
**Status:** Completed (2026-10-01)

---

## Overview

Three changes to the dedicated Time Logs page (`src/app/(hub)/dashboard/timelogs/`):

1. **Bug — the Log Title "open" link 404s.** `detailHref()` in `_time-logs-table.tsx:79` builds `/projects/${project_public_id}/tickets/${issue_display_id}` (and `/tasks/...`). No such route exists — `/projects/[projectId]` is not a route. Detail pages live under `/projects/v2/[projectId]/...` (Hub-native projects) and `/projects/legacy/[projectId]/...` (Zoho-imported projects). The reported URL `hub.webriqs.com/projects/50E6A317-PROJ-01/tickets/50E6A31701-TKT0061` returns 404.
2. **Row actions restyle.** The open-link icon is tiny (`size={12}`, bare, hover-only, inline next to the title). Make it match the Edit/Delete buttons (rounded-full `p-1.5` icon buttons with hover backgrounds), push it to the end of the Log Title column, add a sibling **Copy URL** button, and give **every** row action button (Open, Copy URL, Edit, Delete) a tooltip.
3. **Per-day totals in the admin (grouped) view.** Today each employee group header shows only the period total (e.g. `46:53`). When the period spans more than one day (week / month / range), also show a per-day subtotal inside each employee group.

## Requirements

### 1. Fix the detail link
- Resolve the correct base path per project: **legacy** if the project has `external_project_id IS NOT NULL` (same definition `_legacy-listing/_load-list-data.ts` uses, task 308), otherwise **v2**. Produce `/projects/{v2|legacy}/{project_id}/{tasks|tickets}/{display_id}`.
- Source of truth: extend `GET /api/v2/time-logs` (`src/app/api/v2/time-logs/route.ts:~129`) — the existing `projects` select already runs; add `external_project_id` to it and return a new `project_is_legacy: boolean` on each entry. Add the field to `TimeLogEntry` (`_time-logs-shared.ts`) and to the modal's optimistic `TimeLogEntry` construction (`_time-log-entry-modal.tsx:~234`, which builds entries client-side — it must set the field too, from the selected project's data or preserved `initial` value; if the project picker's `ProjectOption` lacks it, add it to wherever `ProjectOption` is loaded in `page.tsx`/content).
- Use `V2_ROUTES.PROJECTS_V2` / `V2_ROUTES.PROJECTS_LEGACY` from `@/config/constants` rather than string literals.
- `detailHref` returns `null` (hide Open + Copy URL) when `project_public_id` or the display id is missing — unchanged behavior.
- Verify the nested route segments are display values (CLAUDE.md: `/v2/projects/[projectId]/tasks/[taskId]` uses `project_id` + `tasks.display_id`). Confirm legacy routes accept the same display-id params (`projects/legacy/[projectId]/tickets/[ticketId]` already uses `display_id` in `_ticket-quick-access-panel.tsx:42,57`).

### 2. Row actions
- **Open link** (`ExternalLink`) and **Copy URL** (`Link2`/`Check`) become `p-1.5 rounded-full` icon buttons with the same classes as Edit (`text-[#5F6A88] hover:text-[#007BFF] hover:bg-[#E5F1FF] cursor-pointer transition-colors`), icon size **13–14** (same as/near Edit/Delete — "increase the size"), `aria-label`s retained.
- **Placement:** right-aligned at the end of the Log Title cell (title takes `flex-1 min-w-0`, action pair `ml-auto shrink-0`), not trailing the title text. Keep hover-reveal (`opacity-0 group-hover:opacity-100 focus-within:opacity-100`), consistent with Edit/Delete. Not shown while the title is in inline-edit mode (existing behavior).
- Open: keep `next/link` (`<Link>` styled as the icon button) — it is navigation, not an action; same-tab, as today. (Do not use `<div onClick>`.)
- **Copy URL:** reuse `copyLink()` from `@/app/(hub)/projects/_shared/_copy-link-button` (task 359) with the **relative** `href` (it resolves to absolute via `window.location.origin`). Show a transient `Check` icon + "Copied!" tooltip for ~1.5 s; per-row state (e.g. a small `CopyUrlButton` component inside the table file wrapping `useCopyLink(href)`, which already gives `copied` state — no new util needed).
- **Tooltips** on all four: Open → "Open task"/"Open ticket" (by `entry_kind`), Copy URL → "Copy URL" / "Copied!", Edit → "Edit time log", Delete → "Delete time log". Use the existing `Tooltip`/`TooltipTrigger render={…}`/`TooltipContent side="top"` pattern already used in this file for the Notes icon. Check `TooltipContent` behavior on a button inside a `group-hover:opacity-0` wrapper (tooltip should still open when revealed).
- Edit/Delete cell stays in the last column; only the new two buttons live in the Log Title cell.

### 3. Per-day totals (admin/grouped view)
- Applies when the selected `PeriodValue.mode` is `week | month | range`, i.e. the entries span more than one date. For `day` mode the grouped view stays as-is (a per-day row would duplicate the user total).
- Inside each expanded employee group, entries are ordered by date (the API already returns newest-first); after the last entry of each date insert a subtotal row: label `Total — {formatDate(date)}` (match the PDF export's `Subtotal — {date}` wording in `_export-pdf.ts:192-195` for consistency), hours in the **Daily Log Hours** column using the same `font-mono text-[13px] font-semibold` style as the existing `Total` row, tinted `bg-[#F9FAFD]`, no hover/actions. Keep the per-employee period total in the group header.
- Reuse `groupByDate()` (`_time-logs-shared.ts:197`) and `sumHours()` — both already exist, do not re-derive.
- Because rows sit inside `<tbody key={group.key}>`, render per-day subtotal `<tr>`s in the same body; collapsing a group hides them with the entries.
- **Single-user (developer) flat view:** apply the same per-day subtotal rows to the flat table on multi-day periods, ahead of the existing grand Total in `<tfoot>` — so the developer self-view and the admin view behave identically ("same as the per developer/user time logs"). *Assumption — see Open Questions.*
- The table needs the period mode. Pass a `showDailyTotals: boolean` prop from `_time-logs-content.tsx` (`period.mode !== "day"`) rather than threading `PeriodValue` into the table.
- Pass the same flag-awareness: the PDF export already does per-day subtotals; no export changes.

## Out of Scope / Must-Not-Change
- Inline-edit behavior of Log Title / Time Period / Date cells, the entry modal's validation, and PATCH/DELETE routes.
- PDF export (`_export-pdf.ts`) — already has per-day subtotals.
- The project-level time-log tabs (`projects/*/[projectId]/(tabs)/time_logs`, `_task-time-logs.tsx`, `_ticket-time-logs.tsx`) — separate surfaces.
- No DB migration. No change to routing structure or the `display_id` scheme.
- Do not "fix" other places that may build `/projects/{id}/...` URLs unless grep finds the same bug in this feature's files (note any other hits in the task retrospective instead).
- No `dark:` classes / `style={{}}` (CLAUDE.md UI conventions: Tailwind only, existing hex-token style in this file; Time Logs page is light-theme with hard-coded hex colors — follow it).

## Proposed File Changes
| File | Change |
|------|--------|
| `src/app/api/v2/time-logs/route.ts` | Select `external_project_id` in the `projects` query; return `project_is_legacy` per entry. |
| `src/app/(hub)/dashboard/timelogs/_time-logs-shared.ts` | Add `project_is_legacy: boolean` to `TimeLogEntry`. |
| `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Populate `project_is_legacy` where the optimistic entry is built (~line 234); thread through `ProjectOption` if needed. |
| `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Fix `detailHref`; new Open/Copy buttons in Log Title cell (right-aligned, icon-button style, tooltips); tooltips on Edit/Delete; `showDailyTotals` per-day subtotal rows in grouped and flat views. |
| `src/app/(hub)/dashboard/timelogs/_time-logs-content.tsx` | Pass `showDailyTotals={period.mode !== "day"}`. |
| `src/app/(hub)/dashboard/timelogs/page.tsx` / project loader | Only if `ProjectOption` needs `external_project_id`. |

Largest file is `_time-logs-table.tsx` (535 lines); if the additions push it well past ~600, extract `RowActions`/`DaySubtotalRow` into a sibling `_time-log-row-actions.tsx`.

## Code Context
- `_time-logs-table.tsx:79-88` — `detailHref()` (the bug).
- `_time-logs-table.tsx:268-292` — Log Title cell: `<div flex items-center gap-1.5>` with the edit button + a bare `<Link … opacity-0 group-hover:opacity-100><ExternalLink size={12}/></Link>`.
- `_time-logs-table.tsx:375-386` — Edit/Delete buttons: `p-1.5 rounded-full text-[#5F6A88] hover:text-[#007BFF] hover:bg-[#E5F1FF]` / `hover:text-[#C0392B] hover:bg-[#FDE8E6]`, `size={13}`, no tooltips yet.
- `_time-logs-table.tsx:349-370` — existing `Tooltip`/`TooltipTrigger render={<button/>}`/`TooltipContent side="top"` pattern to copy.
- `_time-logs-table.tsx:503-532` — grouped render; `:463-490` flat render + `tfoot` Total.
- `projects/_shared/_copy-link-button.tsx` — `copyLink(url?)`, `useCopyLink(url?)` (relative → absolute via `window.location.origin`; 1.5 s `copied` flag).
- `api/v2/time-logs/route.ts:129-136` — projects lookup; `:170` where `project_public_id` is returned.
- `_time-logs-shared.ts:197` `groupByDate`, `:186` `sumHours`.
- `projects/_legacy-listing/_load-list-data.ts` — legacy = `external_project_id IS NOT NULL`.

## Implementation Steps
1. Add `external_project_id` to the projects select in the time-logs API; emit `project_is_legacy`. Extend `TimeLogEntry`; fix every construction site (tsc will list them: modal, any tests/mocks).
2. Rewrite `detailHref` to use `V2_ROUTES.PROJECTS_V2`/`PROJECTS_LEGACY`.
3. Build `RowActions` for the Log Title cell (Open `<Link>` + `CopyUrlButton`), icon-button styling, tooltips; add tooltips to Edit/Delete.
4. Add `DaySubtotalRow` + `showDailyTotals` prop; render per-day subtotals in grouped and flat tables using `groupByDate`/`sumHours`; wire the prop from `_time-logs-content.tsx`.
5. `npx tsc --noEmit`, `pnpm lint`; manual browser pass.

## Acceptance Criteria
- Clicking Open on a ticket-linked and a task-linked entry for **both** a v2 project and a legacy (Zoho-imported) project lands on the real detail page — no 404. The reported URL case (`50E6A317-PROJ-01` / `…-TKT0061`) resolves.
- Open and Copy URL sit at the right end of the Log Title cell, same visual treatment/size class as Edit/Delete, revealed on row hover/focus; hidden for General Logs.
- Copy URL puts the **absolute** correct URL on the clipboard (same path Open navigates to) and shows a "Copied!" state.
- Open, Copy URL, Edit, Delete each show a tooltip on hover/focus.
- Admin view with week/month/range: every day inside each employee group is followed by a `Total — {date}` row equal to the sum of that day's entries; group header user total unchanged; day-mode unchanged.
- Developer view multi-day: same per-day subtotals + existing grand Total.
- Collapsing an employee group hides its day subtotals. Inline edits that change hours/date update subtotals (they derive from `entries`).
- `npx tsc --noEmit` and `pnpm lint` clean.

## Verification
- `npx tsc --noEmit`; `pnpm lint`.
- Browser (admin account): Month view → confirm day subtotals sum to the user total for 2 users; Day view → no day rows. Developer account: week view.
- Click Open on one v2 ticket, one v2 task, one legacy ticket, one legacy task; paste a Copy URL result into a new tab.
- Hover each action icon for tooltips; keyboard-tab to confirm focus reveals actions.

## Compatibility Touchpoints
- `GET /api/v2/time-logs` response shape gains one field (additive) — check other consumers of that route/`TimeLogEntry` (`grep -rn "TimeLogEntry"`), e.g. `_export-pdf.ts`.
- No docs/MCP-tool changes (`_docs/mcp-tools.md` unaffected). No migration.

## Open Questions
1. **Developer flat view** — the request says per-day totals "same as the per developer/user time logs" (screenshot shows a single-day view with only a `Total`). Planned reading: add per-day subtotals to the developer view too on multi-day ranges so both match. If instead you only want the admin grouped view changed, drop that bullet.
2. **Link target for Open** — same tab (current behavior) is planned; say if you want a new tab.

## Implementation Notes

### What Changed
- Fixed the 404: `detailHref` now routes to `/projects/v2/…` or `/projects/legacy/…` using a new `project_is_legacy` flag (from `projects.external_project_id`).
- Log Title cell: Open + new Copy URL icon buttons (rounded-full, size 14), right-aligned, hover/focus reveal; tooltips on Open, Copy URL, Edit, Delete.
- Per-day `Total — {date}` rows via `showDailyTotals` (week/month/range) in both grouped (admin) and flat (developer) views; per-user header total unchanged.

### Files Changed
- `src/app/api/v2/time-logs/route.ts` - select `external_project_id`, return `project_is_legacy`.
- `src/app/api/v2/projects/route.ts` - additive `external_project_id` in select (so the modal's optimistic entries get the flag).
- `_time-logs-shared.ts`, `_time-log-entry-modal.tsx`, `_time-logs-content.tsx`, `_time-logs-table.tsx` (under `dashboard/timelogs/`) - type, entry construction, prop wiring, UI.

### Deviations From Plan
- `showDailyTotals` is optional (default false) because `projects/_shared/_time-logs-tab.tsx` also renders `TimeLogsTable`; that surface is unchanged. It does gain the Open/Copy/tooltip/route fix.
- Added `external_project_id` to `/api/v2/projects` (not listed in plan) to feed `ProjectOption`.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors, 2 pre-existing warnings)
- Browser acceptance - NOT RUN

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Review was done by reading the changed files (no git commands, per CLAUDE.md). `tsc` and `pnpm lint` are clean.
- Reuses the existing `useCopyLink`, `groupByDate`, `sumHours`, `V2_ROUTES` and the file's own Tooltip pattern. No new helpers duplicated.
- `ActionTooltip` is a small local wrapper that removes four repeated Tooltip blocks; `ACTION_BTN` shares the Edit/Open/Copy button classes.
- `_time-logs-table.tsx` grew by roughly 60 lines to ~590, still under the ~600 extraction threshold set in the plan.

### Deviations
- Minor: `showDailyTotals` is optional (default false) because the project Time Logs tab shares the table; that tab gets no day totals.
- Minor: additive `external_project_id` in the `/api/v2/projects` select (not in the file list) to feed the modal's optimistic entries.

### Required Fixes
- None.

## Post-Review Change
- Per-day `Total — {date}` rows restyled (`DaySubtotalRow` in `_time-logs-table.tsx`): bold, blue `#0063D6` text on a `#F0F7FF` tint, instead of the neutral grey/black. Per-user header totals and the developer grand Total row are unchanged. `npx tsc --noEmit` PASS.
