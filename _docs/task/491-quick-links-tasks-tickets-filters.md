# 491: Quick Links › Tasks and Tickets — Due date, Assignee and Project filters

**Created:** 2026-11-19
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The two cross-project listings in the sidebar's **Quick Links** group (task 385), **Tasks** (`/dashboard/tasks`) and **Tickets** (`/desk/tickets`), only have a text search (Tickets also has a Status filter). PMs can't narrow either list to "what's due this week", "what's assigned to X" or "what's in project Y" without opening each project.

This task adds three server-side, URL-backed filters to both pages:

1. **Due date.** The same Day / Week / Month / Range calendar as Time Logs' period picker (`TimePeriodPicker`), plus quick presets (Overdue, Today, This week, No due date) and an "Any" state.
2. **Assignees.** A searchable multi-select with the same panel as the assign action (`AssigneeMultiSelect`): header, auto-focused search, avatar rows with check marks and removable chips. It also has pinned **Me** and **Unassigned** rows.
3. **Projects.** A searchable multi-select built on the same panel (no avatars).

### Decisions (resolved with the user, 2026-11-19)

- **D1. The Tickets due-date filter uses the ticket's own `tickets.due_date`,** not the origin Inbox thread's SLA due time (`inbox.sla_due_at`). The Tickets table's **Due date** column switches to `tickets.due_date` (+ `due_time`) so the filter matches what the column shows. The SLA due time stays visible on the Inbox thread itself.
- **D2. The Project filter is multi-select** on both pages, matching the Assignees filter.

## Requirements

### Shared filter controls

- [ ] **Due date filter** (`DueDateFilter`):
  - Collapsed with no value it's a pill, `Due date: Any`, in the same style as `FilterMultiSelect`'s trigger.
  - With a value it shows the Time Logs stepper: `‹  📅 <label>  ›`, plus a `×` clear button (`aria-label="Clear due date filter"`). The arrows step the applied period, as `stepPeriod()` does. Presets (Overdue / No due date) show the label only, with no arrows.
  - The popover holds a preset row (**Overdue**, **Today**, **This week**, **No due date**). Below it are Day / Week / Month / Range tabs with the orange underline, rendering the existing `DayPanel` / `WeekPanel` / `MonthPanel` / `RangePanel`. Footer: **Clear** on the left, Cancel / OK on the right (same buttons as `TimePeriodPicker`).
  - Presets apply on click and close the popover. Calendar picks use the draft → OK flow, as in Time Logs.
  - Future dates must stay selectable. Do not pass `disabled={{ after: today }}`, which only `DateFieldPicker` uses.
  - Opening with no value starts the draft on Day = today.
- [ ] **Searchable multi filter** (`SearchableMultiFilter`):
  - The trigger pill reads `{label}: All`, `{label}: <name>` (one selected) or `{label}: N selected`. The border is highlighted blue when anything is selected (same convention as `SearchableSelect`'s `label` mode).
  - The panel visuals match `AssigneeMultiSelect`'s popover: header label, search input auto-focused once the panel is positioned, scrolling `max-h-52` list, rows with an optional avatar and a check mark, and a selected-chips footer with remove buttons. It adds a **Clear** text button in the header row when anything is selected.
  - Optional pinned rows sit above a hairline divider. Pinned rows always show, even while searching.
  - Toggling an item applies immediately (no OK step), so the list updates while the panel stays open. Escape or an outside click closes the panel.
  - Portal-positioned with `usePopoverPosition` (it flips above when there's no room below).
- [ ] **Assignee filter** — options come from `/api/staff/members` (already fetched on both pages). Pinned rows: **Me** (the current user, shown first with their avatar) and **Unassigned**.
- [ ] **Project filter** — options come from `GET /api/v2/projects` (RLS-scoped, excludes deleted), labelled `name`, values are project UUIDs. Fetch once on mount, in parallel with members.

### URL params and server filtering (both pages)

- [ ] Every filter lives in the URL, so links can be shared and filters survive refresh and back/forward:
  - `due=` takes one of these values:
    - `overdue`, `none`
    - `day:YYYY-MM-DD`, `week:YYYY-MM-DD` (any day in the week)
    - `month:YYYY-MM`, `range:YYYY-MM-DD..YYYY-MM-DD`

    An invalid or missing value means Any.
  - `assignee=` takes comma-separated profile UUIDs, plus the literal `unassigned`. "Me" is stored as the user's UUID.
  - `project=` takes comma-separated project UUIDs.
  - Any filter change resets `page` to 1. Existing `search`, `status` and `pageSize` params are kept.
- [ ] **Tasks** (`dashboard/tasks/page.tsx`), applied inside the existing `excludingChecklist()` callback:
  - Date periods: `due_date` between `from` and `to`, inclusive.
  - `none`: `due_date IS NULL`.
  - `overdue`: `due_date < today` and status not closed. Use the same closed-status spellings as the Dev Dashboard (`closed`/`Closed`). Check the tasks status vocabulary for other terminal values (e.g. `completed`) and include them if present.
  - Assignees: `assignees && {ids}`. `unassigned` → `assignees IS NULL OR assignees = '{}'`. Both together are ORed.
  - Projects: `project_id IN (ids)`.
- [ ] **Tickets** (`desk/tickets/page.tsx`): add the filters to `applyTicketFilters()`, so the main listing and both origin counts (Inbox / Manual) stay in sync.
  - Due: the same rules on `tickets.due_date` (D1). "Overdue" means status ≠ closed.
  - Assignees must follow the array-or-scalar rule (`ticketAssigneeIds()`): match `assignees && {ids}` OR `assignee_id IN (ids)`. `unassigned` → (`assignees` null or `{}`) AND `assignee_id IS NULL`.
  - Projects: `project_id IN (ids)`.
- [ ] "Today" for Overdue and the Today preset uses the Hub's local calendar date, not UTC midnight. Reuse whatever local-date helper the Dev Dashboard uses (`localDateKey`), or the same derivation.

### Toolbar UX (both pages)

- [ ] Toolbar order: **Search · Due date · Assignee · Project** (· **Status** on Tickets, kept where it is) · spacer · pagination. It wraps cleanly at narrow widths, as the existing `flex-wrap` row does.
- [ ] A **Clear filters** text button appears after the last filter whenever any of due/assignee/project/search is non-default. Clicking it removes those params. On Tickets it does not reset the status filter, which keeps its own default of hiding Closed.
- [ ] The subtitle reflects the filtered state:
  - Tasks: `{total} tasks across all projects`, or `{total} matching tasks` when filtered.
  - Tickets: leave the subtitle as is. Its counts already follow `applyTicketFilters`.
- [ ] Pending state: wrap every filter-driven `router.push` in `useTransition`. While pending, the table area drops to reduced opacity with `aria-busy`, and the active trigger is not disabled. No full-page skeleton flash.
- [ ] Empty states:
  - Tasks: "No tasks match your filters" + **Clear filters**. The existing search-only empty state becomes this generic filtered state.
  - Tickets: keep its existing filtered empty state, but its Clear button must also drop due/assignee/project.
- [ ] Accessibility: every trigger is a `<button>` with a visible focus ring. Icon-only buttons (stepper arrows, `×`, chip remove) have `aria-label`. Panel rows are buttons. Selected state is shown by both the check mark and font weight, never by colour alone.

### Tickets table — Due date column (D1)

- [ ] The **Due date** column shows `tickets.due_date` (with `due_time` when set) instead of `inbox.sla_due_at`.
- [ ] When the ticket's own status ≠ `closed` and the date is in the past, the cell is red with the `(ND)` overdue badge.
- [ ] Add `due_date, due_time` to the page's select. Replace `ticketDueAt` / `ticketOverdue` / `ticketOverdueDays` with values computed from the ticket's own fields. Keep the field names or rename them to `dueAt` / `overdue` / `overdueDays`; just update every consumer.

## Out of Scope / Must-Not-Change

- **Time Logs** (`dashboard/timelogs/*`): `TimePeriodPicker`, the panels, `SearchableSelect` and `DateFieldPicker` are imported, not modified. The only allowed change is a one-line `export` if something they already define is needed and isn't exported yet.
- **`AssigneeMultiSelect` behaviour and visuals:** unchanged. The only allowed change is exporting its existing `Avatar` (and the `colorFor`/`initialsFor` helpers if needed) for reuse.
- No new API routes, no migrations, no RLS changes. Test-data hiding stays with RLS, since both pages use the session client.
- No filtering by the legacy free-text `tickets.assignee_name` (Zoho-imported rows with only a name). If they show up as "Unassigned" when filtered, that's acceptable for this task; note it in the implementation notes.
- No column sorting, saved filter presets, or per-user filter persistence (`user_preferences`).
- Developers' access is unchanged: both pages stay gated to admin / super_admin / pm.
- The Inbox (`/desk/inbox`) filters and its SLA due display are untouched.
- `/api/v2/projects` is not paginated. If it ever returns more than 1000 rows the option list truncates silently. That's a pre-existing limit; don't fix it here, but mention it in implementation notes if the count is close.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/list-filters/params.ts` | Create | Pure, framework-free helpers: `parseDueParam` / `serializeDue` (to and from `PeriodValue` \| `overdue` \| `none`), `dueToRange()`, `parseIdListParam` / `serializeIdList`, `dueLabel()`. Also the PostgREST filter-string builders `assigneeOrFilter(ids, { scalarColumn? })`, plus a small `applyDueFilter(q, due, today, closedStatuses)` / `applyProjectFilter(q, ids)` structurally typed like `applyTicketFilters`. Shared by both server pages and the client filters. |
| `src/components/list-filters/due-date-filter.tsx` | Create | `DueDateFilter`, the Time Logs period-picker shell with an Any state, presets, Clear and stepper. Reuses the `_time-period-panels` panels plus `periodLabel` / `stepPeriod` / `toISODate` from `_time-logs-shared`. |
| `src/components/list-filters/searchable-multi-filter.tsx` | Create | `SearchableMultiFilter`, a pill trigger plus a panel in the `AssigneeMultiSelect` style, with optional avatars, pinned rows and Clear. |
| `src/components/list-filters/use-list-filters.ts` | Create | Client hook. It reads `due` / `assignee` / `project` from `useSearchParams`, exposes setters that `router.push` inside `useTransition` (resetting `page`), and returns `isPending`, `hasActiveFilters` and `clearFilters()`. Takes the base route (`DASHBOARD_TASKS` / `DESK_TICKETS`) and a list of params `clearFilters` must keep (Tickets keeps `status`). |
| `src/app/(hub)/projects/_shared/_assignee-multi-select.tsx` | Modify | Export the existing `Avatar` component only. No behaviour change. |
| `src/app/(hub)/dashboard/tasks/page.tsx` | Modify | Accept `due` / `assignee` / `project` search params, apply them in the `excludingChecklist` query, and pass `currentUserId` plus `isFiltered` to the index. |
| `src/app/(hub)/dashboard/tasks/_all-tasks-index.tsx` | Modify | Fetch projects, render the three filters plus Clear filters, add the transition pending state, and use the generic filtered empty state and subtitle. |
| `src/app/(hub)/desk/tickets/page.tsx` | Modify | Extend `applyTicketFilters` with due/assignee/project, select `due_date, due_time`, compute overdue from the ticket's own fields, pass `currentUserId`. |
| `src/app/(hub)/desk/tickets/_filed-issues-index.tsx` | Modify | Render the three filters plus Clear filters next to Status, add the pending state, and make the empty-state Clear also drop the new params. |
| `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` | Modify | The Due date column renders the ticket's own due date/time and overdue state (D1). Update the comment that says "origin ticket's SLA due time". |
| `src/app/(hub)/desk/tickets/loading.tsx` | Modify (only if needed) | Add placeholder pills for the new toolbar controls so the skeleton doesn't jump. |
| `_docs/task/491-list-filters.check.ts` | Create | `npx tsx` pure-logic checks for `params.ts`. |

## Code Context

### Both listing pages: same shape

Server page reads `searchParams` and runs one session-client query with `{ count: "exact" }` and `.range()`. The client index re-syncs rows during render and builds URLs with `buildUrl(overrides)`, which merges into the current `searchParams` and then calls `router.push`.

`src/app/(hub)/dashboard/tasks/page.tsx` — current query:

```ts
const { data, count } = await excludingChecklist((exclude) => {
  let query = supabase.from("tasks").select(
    "id, title, display_id, status, priority, assignees, due_date, created_at, projects(project_id, external_project_id, name)",
    { count: "exact" });
  if (exclude) query = query.eq("kind", "task");
  if (searchQ) { const esc = searchQ.replace(/[%,()]/g, ""); query = query.or(`title.ilike.%${esc}%,display_id.ilike.%${esc}%`); }
  return query.order("created_at", { ascending: false }).range(from, to);
});
```

Add the new filters inside this callback, since it may run twice: once with `exclude` and once as the pre-migration fallback.

`src/app/(hub)/desk/tickets/page.tsx` — the single filter funnel used by the listing **and** both counts:

```ts
function applyTicketFilters<Q extends { eq: …; in: …; or: … }>(query: Q): Q {
  // status (zero-selection sentinel / .in) + search .or(...)
}
```

Widen its structural type to include `is` / `lt` / `gte` / `lte` / `overlaps` as needed, or switch to the Supabase `PostgrestFilterBuilder` generic, so the new predicates go through the same funnel.

### Repeated `.or()` calls

Search already uses `.or(...)`. supabase-js appends each `.or()` as a separate `or=` query param, and PostgREST ANDs repeated params. So the assignee `.or(...)` combines with the search `.or(...)` as AND, which is correct. Verify this once in the browser (search + assignee together).

### Ticket assignee rule (`src/lib/tickets/permissions.ts`)

```ts
export function ticketAssigneeIds(ticket) {
  if (ticket.assignees && ticket.assignees.length > 0) return ticket.assignees;
  return ticket.assignee_id ? [ticket.assignee_id] : [];
}
```

SQL equivalent for selected ids: `.or("assignees.ov.{id1,id2},assignee_id.in.(id1,id2)")`. UUIDs contain no characters that need quoting. The Dev Dashboard comment (`_load-dev-dashboard.ts` ~L104) warns that brace syntax inside `or()` "quotes unreliably". If `ov` inside `.or()` misbehaves, fall back to `.or("assignees.ov.\"{…}\",…")` or split the query into an id prefetch plus `.in("id", …)` only for the ticket listing. Note in implementation notes which form was used. `tasks.assignees` has a GIN index (migration 109) and `tickets.assignees` has one too (migration 132), so `&&` is indexed.

Unassigned, for tickets: `and(or(assignees.is.null,assignees.eq.{}),assignee_id.is.null)` inside the same `.or()` list as the ids.

### Time Logs picker to mirror (`src/app/(hub)/dashboard/timelogs/`)

- `_time-period-picker.tsx`: stepper shell (`rounded-full border bg-white px-1 py-1`, chevron buttons `p-1.5 rounded-full hover:bg-[#F0F7FF]`), tabs with `border-b-2` orange `#FB914E` active, and an absolute popover `rounded-[14px] … p-4`. The Cancel/OK buttons are styled there. Copy this markup into `DueDateFilter` and extend it. Don't modify the Time Logs file.
- `_time-period-panels.tsx` exports `DayPanel`, `WeekPanel`, `MonthPanel`, `RangePanel`. Each takes `draft`, `onChange` and `actions`, and renders a `QuickLinkRow` (Today / Current Week / …) with the actions.
- `_time-logs-shared.ts` exports `PeriodValue`, `periodToRange`, `periodLabel`, `stepPeriod`, `toISODate`, `fromISODate`, `MONTH_NAMES`.

Convert `due=` to and from `PeriodValue` in `params.ts`, then reuse `periodToRange` for the server range.

### Assignee panel to mirror (`src/app/(hub)/projects/_shared/_assignee-multi-select.tsx`)

The panel markup is at ~L245–330: header `px-3 py-2.5 border-b` with uppercase 11px label; search input `pl-6 text-[12px]` focused once `pos` resolves (the `searchFocusedRef` pattern, because the panel mounts `visibility:hidden` for a frame); rows `px-2 py-1.5 text-[12px]` with `bg-[#F0F7FF]` and `Check` when selected; chips footer using `motion.span layout`.

Positioning uses `usePopoverPosition(open, triggerRef, panelRef, 248)` from `projects/_shared/_use-popover-position`. Export `Avatar` (L49) for the assignee filter rows and chips.

### Filter pill trigger to match (`src/app/(hub)/desk/tickets/_filter-multi-select.tsx`)

`FilterMultiSelect` (Status) is the pill style the three new triggers must line up with: same height, radius, font size, and `{label}: {value}` text.

### Data sources

- `/api/staff/members` → `AssigneeMember[]` (`id`, `full_name`, `avatar_url`), already fetched on both index pages.
- `/api/v2/projects` → `[{ id, project_id, name, … }]`, RLS-scoped, `status <> 'deleted'`, ordered by `updated_at desc`. Sort the options by name client-side.
- The current user id: both pages already read `claims.claims.sub` as `userId`. Pass it down as `currentUserId` for the **Me** row.

## Implementation Steps

1. **`src/lib/list-filters/params.ts` and the check script.** Write the parse/serialize helpers and filter-string builders, then `_docs/task/491-list-filters.check.ts`. Cover: round-trip of every `due` form; invalid inputs (`day:2026-13-40`, `range:` with from > to, which gets swapped, and garbage) → Any; id-list dedupe and empty-string handling; `unassigned` mixed with ids; and the exact `.or()` strings for tasks vs tickets.
2. **Export `Avatar`** from `_assignee-multi-select.tsx`.
3. **`SearchableMultiFilter`**: trigger plus panel as specified, with props `label`, `options: {value,label,avatar?}[]`, `pinned?: {value,label,avatar?}[]`, `selected`, `onChange`, `searchPlaceholder`, `headerLabel`, `emptyText`.
4. **`DueDateFilter`**: the stepper/pill trigger plus a popover with presets, tabs, panels and Clear/Cancel/OK. Props: `value: DueFilter | null`, `onChange`.
5. **`useListFilters` hook** with `useTransition`, page reset, `clearFilters(keep)`.
6. **Tasks page**: server params and query; index toolbar, pending opacity, empty state, subtitle.
7. **Tickets page**: extend `applyTicketFilters`; select and compute the ticket's own due date; index toolbar; empty-state Clear; table Due column (D1); skeleton tweak if needed.
8. Run `npx tsc --noEmit`, `npx eslint` on the changed files and the check script, then do the browser pass (Verification).

## Acceptance Criteria

- [ ] Both Quick Links pages show Due date, Assignee and Project filters in the toolbar, styled consistently with the existing Status pill and the Time Logs period picker.
- [ ] The Due date popover looks and behaves like Time Logs' picker (Day/Week/Month/Range tabs, orange active underline, the same calendars, Cancel/OK). It adds presets and Clear, and future dates are selectable.
- [ ] Prev/next arrows on an applied Day/Week/Month/Range due filter step the period and refetch.
- [ ] The Assignee filter is searchable (auto-focused input), shows avatars, supports several people at once, and has pinned **Me** and **Unassigned** rows.
- [ ] The Project filter is searchable and multi-select, with chips.
- [ ] Results are filtered server-side. Pagination totals and "x–y of N" reflect the filters. On Tickets, the Inbox/Manual subtitle counts reflect them too.
- [ ] Filters combine with AND: with search, with each other, and with Status on Tickets.
- [ ] A Tickets assignee filter matches tickets whose `assignees` array contains the person **and** legacy rows that only have `assignee_id` set.
- [ ] Overdue excludes closed items. "No due date" returns only null due dates.
- [ ] Filters are in the URL. Refresh, back/forward and a copied link all reproduce the same view. Changing a filter resets to page 1.
- [ ] **Clear filters** appears only when a filter is active and resets due/assignee/project/search. Tickets' status filter is untouched by it.
- [ ] While results load, the table dims (`aria-busy`). Nothing jumps and there's no blank flash.
- [ ] The filtered empty state shows an icon, one line and a Clear filters action.
- [ ] The Tickets **Due date** column shows the ticket's own due date (+ time), with red `(ND)` when overdue and not closed.
- [ ] Time Logs and the per-project assignee picker look and behave exactly as before.
- [ ] Keyboard: Tab reaches every trigger, Enter/Space opens it, Escape closes it, and focus rings are visible.

## Verification

```bash
npx tsc --noEmit
npx eslint "src/lib/list-filters" "src/components/list-filters" "src/app/(hub)/dashboard/tasks" "src/app/(hub)/desk/tickets" "src/app/(hub)/projects/_shared/_assignee-multi-select.tsx"
npx tsx _docs/task/491-list-filters.check.ts
```

Browser checks (signed in as pm or admin), on `/dashboard/tasks` and `/desk/tickets`:

1. Due → Week → OK. The rows' due dates fall within Mon–Sun, the URL has `due=week:…`, and the › arrow moves to next week.
2. Due → Overdue. Every row is past due and not closed. Due → No due date shows only "—" rows.
3. Assignee → Me, then add a second person. The rows include either person and the total updates. Add Unassigned too and unassigned rows appear.
4. Tickets: find a ticket with only `assignee_id` set (or temporarily confirm with the SQL `select id from tickets where (assignees is null or assignees = '{}') and assignee_id is not null limit 1`). It appears when filtering by that person.
5. Project → pick two projects. Only those projects' rows show. Search inside the panel filters the options.
6. Combine search + assignee + project + due. The results are the AND of all of them. Then Clear filters returns to the default (Tickets keeps its status default).
7. Refresh and use back/forward with filters applied. The view is identical.
8. A filter combination with no matches shows the empty state, and its Clear button works.
9. Time Logs' period picker and a project's task-row assignee picker are visually and functionally unchanged.
10. At ~1024px wide the toolbar wraps without overlapping, and the popovers flip above when opened near the bottom.

## Compatibility Touchpoints

- **Shared components:** new `src/components/list-filters/` imports from `app/(hub)/dashboard/timelogs/*` and `app/(hub)/projects/_shared/*`. That's the same cross-feature import direction the Tasks page already uses for `AssigneeMultiSelect`. If Time Logs files are later moved, these imports move with them.
- **No schema or migration changes.** Test data stays hidden by RLS (session client).
- **MCP (`list_tickets`, `list_tasks`):** untouched, so `_docs/mcp-tools.md` needs no update.
- **Docs:** no `_docs/context/*` file covers these pages. Mention the URL params in task 385's doc in the document stage if useful.
- **Landing order:** independent of the 489/490 Inbox work (different routes). The `tickets` page is not touched by those tasks.

## Implementation Notes

### What Changed
- Added server-side, URL-backed **Due date / Assignee / Project** filters to `/dashboard/tasks` and `/desk/tickets`.
  - Params: `due=` (overdue | none | day: | week: | month: | range:), `assignee=` (UUIDs + `unassigned`), `project=` (UUIDs).
  - Each change resets `page`. Search, status and pageSize are kept.
- **`DueDateFilter`** is the Time Logs period picker: the same tabs, panels (imported, not copied), Cancel/OK and `‹ label ›` stepper.
  - Additions: an "Any" pill, presets (Overdue / Today / This week / No due date, which apply in one click and highlight when active), a Clear button, and an inline `×`.
  - Overdue / No due date show no arrows. Future dates are selectable.
- **`SearchableMultiFilter`** is the `Status` pill trigger plus an `AssigneeMultiSelect`-style panel.
  - Panel: header with Clear, auto-focused search, check rows, avatar chips footer.
  - Pinned rows are never filtered by search. Toggles apply immediately.
  - Escape closes it and returns focus to the trigger.
- Assignee filter: **Me** and **Unassigned** are pinned; members are sorted by name. Project filter: options from `/api/v2/projects`, sorted by name.
- **Clear filters** shows in the toolbar when search/due/assignee/project is active. On Tickets it leaves `status` alone.
  - The Tickets empty-state Clear still resets status to All, as before, and now also drops the new params.
- All navigation (search, status, filters, pagination) goes through one `useTransition`. The table area dims to 60% with `aria-busy` while it's pending.
- Tasks subtitle reads "N matching tasks" when filtered. Its empty state is now the generic "No tasks match your filters" with Clear filters.
- **D1:** the Tickets Due date column and the due filter use `tickets.due_date` (+ `due_time`).
  - Overdue uses the ticket's own status (≠ closed/Closed). A date-only due date counts as due at the end of the day.
  - The client formats the date from its raw parts, so it never shifts by a day the way UTC parsing can.
  - `inbox.sla_due_at` is no longer selected on this page.

### Files Changed
- `src/lib/list-filters/params.ts` — new. Parse/serialize for `due` and id lists (UUID-only, which is the guard against PostgREST filter injection), `dueRange`, `assigneeOrFilter`, and `applyListFilters` over a structural `ListFilterQuery`.
- `src/components/list-filters/due-date-filter.tsx` — new. `DueDateFilter`.
- `src/components/list-filters/searchable-multi-filter.tsx` — new. `SearchableMultiFilter`.
- `src/components/list-filters/use-list-filters.ts` — new. URL state hook plus transition.
- `src/components/list-filters/list-filter-bar.tsx` — new. The Due · Assignee · Project · Clear filters group shared by both toolbars; fetches projects.
- `src/app/(hub)/projects/_shared/_assignee-multi-select.tsx` — `Avatar` exported. No behaviour change.
- `src/app/(hub)/dashboard/tasks/page.tsx` — parses the filters and applies them inside the `excludingChecklist` callback. Passes `currentUserId` and `isFiltered`.
- `src/app/(hub)/dashboard/tasks/_all-tasks-index.tsx` — toolbar, pending dim, subtitle, generic filtered empty state, navigation via the hook.
- `src/app/(hub)/desk/tickets/page.tsx` — `applyTicketFilters` now also applies the list filters, so the listing and both origin counts stay in sync. Selects and derives the ticket's own due date/overdue state.
- `src/app/(hub)/desk/tickets/_filed-issues-index.tsx` — toolbar, pending dim, empty-state Clear. Item fields `ticketDueAt/ticketOverdue/ticketOverdueDays` became `dueDate/dueTime/overdue/overdueDays`.
- `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` — the Due date cell renders the ticket's own due date via `formatDue()`.
- `_docs/task/491-list-filters.check.ts` — new. Pure-logic assertions.

### Deviations From Plan
- **Added `list-filter-bar.tsx`** (not in the file list). The trio plus Clear filters and the projects fetch are identical on both pages, so they live in one component instead of being duplicated in both index files.
- **`DueFilter` / `DuePeriod` are redeclared in `src/lib/list-filters/params.ts`** with the same shape as Time Logs' `PeriodValue`, instead of importing it. That way `src/lib` doesn't depend on a route's private file. The client hands them straight to the Time Logs panels and `periodLabel`/`stepPeriod`.
- **Ticket assignee predicate is stricter than the plan's first sketch.** The legacy `assignee_id` matches only when `assignees` is null or `{}`, exactly mirroring `ticketAssigneeIds()`. So a stale scalar never matches a ticket whose array says otherwise.
- **Overdue closed statuses are `closed`/`Closed` only.** The task status vocabulary (`TASK_STATUS` in the MCP tools) has no other terminal value. `testing_completed` is a workflow step, not done.
- **`desk/tickets/loading.tsx` not touched.** Filter navigations use the in-page transition dim, not the route skeleton, so the skeleton toolbar only shows on first load. It can get placeholder pills in polish if wanted.
- **"Today" is the server's local date** (`toDateKey(new Date())`), the same as the Dev Dashboard's `localDateKey`. On a UTC host, Overdue/Today flip at 08:00 Manila time. That's a pre-existing convention, left as is.

### Verification Run
- `npx tsx _docs/task/491-list-filters.check.ts` — PASS
- `npx tsc --noEmit` — PASS for source. The only errors are the known stale `.next/**/validator.ts` entries for `projects/[classification]/page.js`, which are generated files unrelated to this task.
- `npx eslint` on all changed paths — PASS (no output)
- Browser checks 1–10 — SKIPPED (no dev server running, and they need a signed-in pm/admin session). Left to the `test` stage. One item to watch there: the `assignees.ov.{…}` brace syntax inside `.or()` (the Dev Dashboard comment calls it unreliable). If PostgREST rejects it, wrap the set in quotes (`assignees.ov."{…}"`) in `assigneeOrFilter`.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Files reviewed: all 6 modified files (`git diff --name-only`), plus the new `src/lib/list-filters/`, `src/components/list-filters/` and the check script.
- Fixed during the gate:
  - The Tickets page still selected and typed `inbox.status`, which nothing used once the Due column moved to `tickets.due_date`. It's removed from both the select and the type.
  - The Tasks index had two copies of "clear debounce + reset search input" (the `ListFilterBar` `onClear` and the empty-state `clearAll`). They're collapsed into one `resetSearchInput()`, matching the Tickets index.
- No `any`, no debug logging, no commented-out code, no runtime-built class names. The only inline `style` is the portal `position`/`visibility`, a documented exception that matches `AssigneeMultiSelect`.
- Security: id-list params are UUID-validated before they're put into PostgREST `.or()`/`.in()` strings. The check script covers an injection attempt (`…),or(id.neq.0`). Due values only reach queries as validated `YYYY-MM-DD` keys.
- Conventions:
  - Tailwind + `cn()`, lucide icons, `<button>` everywhere.
  - `aria-label` on the icon-only buttons (stepper arrows, `×`, chip remove) and on both search inputs. Focus rings on the triggers.
  - `window`/`document` are touched only inside effects.
  - `excludingChecklist()` is still the entry point for the Tasks query, and the filters apply inside its callback.
- Re-ran `npx tsc --noEmit` (no errors outside the stale `.next` types) and `npx eslint` on the changed paths (clean) after the fixes.

### Deviations
- **Minor — new `list-filter-bar.tsx`.** It holds the shared trio plus Clear plus the projects fetch. This avoids duplicating them in both index files. Same scope, one fewer copy.
- **Minor — `DuePeriod` is redeclared in `src/lib`** with the same shape as `PeriodValue`, so `src/lib` doesn't import from a route's private file.
- **Minor — stricter legacy `assignee_id` match** (only when `assignees` is empty). This matches `ticketAssigneeIds()` exactly.
- **Minor — `desk/tickets/loading.tsx` unchanged.** The plan marked it "only if needed". Filter navigation uses the in-page transition dim, not the route skeleton.
- **Medium (visible, accepted) — "today" uses the server's local date.** On a UTC host, Overdue and Today roll over at 08:00 Manila time. That's the same convention as the Dev Dashboard's `localDateKey`. It's documented here so it gets noticed in testing; it's not a blocker.

### Required Fixes
- None.

### Watch in `test`
- PostgREST must accept `assignees.ov.{…}` inside `.or()` (and the nested `and(or(…))` used for Tickets). If it doesn't, quote the set in `assigneeOrFilter` and re-run the check script.
- Repeated `.or()` calls (search plus assignee) must be ANDed.

## Follow-up (2026-11-20): Tasks showed "0 tasks" with no filter set
- Reported by the user: `/dashboard/tasks` showed "0 tasks / No tasks yet" with no filter applied.
- Cause: not the filters. The listing query hit a Postgres statement timeout (`57014`). The page had always rendered a failed query as an empty list.
- Change in 491's scope:
  - `dashboard/tasks/page.tsx` now logs `[dashboard/tasks] listing query failed:` with the error code and message.
  - `_all-tasks-index.tsx` renders a **"Couldn't load tasks"** error state (`role="alert"`, the error message, Clear filters) instead of "No tasks yet".
- The timeout itself is planned as **task 492** (RLS per-row helper calls + no `created_at` index; migration 187).
