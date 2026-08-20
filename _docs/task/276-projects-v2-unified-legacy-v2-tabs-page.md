# 276: Projects V2 — Unified `/projects-v2` Page with Draggable "V2 Projects" / "Legacy Projects" Tabs

**Created:** 2026-08-19
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Combine the existing `/portfolio-tracker` module and the existing `/projects` module into a single new page at **`/projects-v2`**, presented as two draggable-order tabs — **"V2 Projects"** (default active, backed by `/portfolio-tracker`'s data/UI) and **"Legacy Projects"** (backed by `/projects`'s data/UI). Each tab has its own project listing (filters, search, pagination) and its own project-detail page with a tab set. This is additive and non-destructive: `/portfolio-tracker` and `/projects` (and their sidebar nav items "Tracker" and "Projects") are **not modified** — they keep running until a future task retires them. `/projects-v2` is a new, parallel route that copies and recomposes existing features.

Target hierarchy (confirmed with user, 2026-08-19):

```
Sidebar: "Projects V2" (new nav item) → /projects-v2
  Tab strip: [V2 Projects] [Legacy Projects]  — draggable order, V2 Projects first/active by default

  V2 Projects tab
    Project Listing (Status filter + StackShift Classification filter — from /portfolio-tracker)
      ProjectId detail (/projects-v2/v2/[projectId])
        Overview tab — Progress bar + swimlane timeline (ported from /portfolio-tracker/[projectId])
          → clicking a Phase-1 ("Onboard") deliverable still opens Onboarding Workspace
            (Business Info / Files / Access / Checklist sub-tabs — ported as-is)
        Tasks tab
        Issues tab
        Milestones tab
        Files tab       — project documents, same UI/data as Onboarding Workspace's Files tab (NEW top-level placement)
        Access tab       — credentials, links, repos (NEW — mirrors Onboarding Workspace's Access tab meaning, project-wide)
        Members tab      — team/collaborator management (NEW tab; promotes existing collaborator-management modal)
        Status Report tab — project-scoped (existing status-report component/API, passed a projectId)
        Time Logs tab     — project-scoped (existing time-logs component/API, passed a projectId)

  Legacy Projects tab
    Project Listing (existing /projects filters — Status + legacy/v2 classification)
      ProjectId detail (/projects-v2/legacy/[projectId])
        Tasks tab (existing, ported)
        Issues tab (existing, ported)
        Milestones tab (existing, ported)
        Files tab        — SAME shared component as V2's Files tab (NEW for legacy projects)
        Access tab        — SAME shared component as V2's Access tab (NEW for legacy projects)
        Members tab        — SAME shared component as V2's Members tab (NEW for legacy projects)
        Status Report tab  — SAME shared component as V2's Status Report tab (NEW for legacy projects)
        Time Logs tab      — SAME shared component as V2's Time Logs tab (NEW for legacy projects)
```

### Key clarifications locked in with the user before writing this doc

1. **Nav access:** add a new sidebar nav item ("Projects V2") pointing at `/projects-v2`, visible to the same roles as the existing "Projects" item. Existing "Projects" and "Tracker" items are untouched.
2. **Top-level "Access" tab** (distinct from the Onboarding Workspace's own Access sub-tab) = credentials, links, and repos — mirrors the *meaning* of the Onboarding Workspace Access tab, but exposed project-wide as its own top-level tab.
3. **New "Members" tab** (not in the original hierarchy sketch, added per user) = team/collaborator management — promotes the existing collaborator-management modal (`_manage-collaborators-action.tsx`) from a modal action into a persistent tab. Backend already exists: `GET/POST /api/projects/[projectId]/members`.
4. **Top-level "Files" tab** (distinct from the Onboarding Workspace's own Files sub-tab) = project documents, including files uploaded during onboarding. UI/data should look and behave like the Onboarding Workspace's Files tab (`_files-tab.tsx`), just exposed as an always-visible top-level tab instead of nested under Onboarding Workspace.
5. Files/Access/Members/Status Report/Time Logs tabs are **shared** between the V2 and Legacy detail pages (same component, parameterized by `projectId` + `variant`), since neither variant has all five today and duplicating five tabs across two route trees would violate DRY and the file-length guidance.

---

## Requirements

- [ ] New route `/projects-v2` (`src/app/(hub)/projects-v2/`) — does not touch `/portfolio-tracker` or `/projects` files.
- [ ] New sidebar nav item "Projects V2" in `v2-hub-sidebar.tsx`, same role-visibility as current "Projects" item, new `V2_ROUTES.PROJECTS_V2` constant.
- [ ] `/projects-v2` shell: two-tab strip ("V2 Projects" / "Legacy Projects"), V2 Projects active by default on first visit, tabs reorderable via drag (dnd-kit, following the `_phase-builder.tsx` pattern) with order persisted to `localStorage` (new hook following the `use-pm-settings.ts` pattern). Active-tab selection reflected in a `?tab=v2|legacy` URL query param (mirrors the Onboarding Workspace's existing `?tab=` convention) so it's shareable/bookmarkable; on first load with no query param, the tab currently in the *first* position of the (possibly reordered) strip is the active one.
- [ ] **V2 Projects listing**: port `/portfolio-tracker`'s listing (`page.tsx`, `_load-list-data.ts`, `_project-card.tsx`, `_filter-multi-select.tsx`, `_sort-select.tsx`, `_onboarding-list.tsx`, `_portfolio-card-menu.tsx`) into the V2 tab panel — same Status (`draft|scheduled|in_progress|completed`) + Classification (`CLASSIFICATIONS` from `src/config/customer-phases.ts`) filters, same card design, same search/sort/pagination behavior. Card links point to `/projects-v2/v2/[projectId]`.
- [ ] **Legacy Projects listing**: port `/projects`'s listing (`page.tsx`, `_projects-index.tsx`, `_filter-controls.tsx`, `_project-grid-view.tsx`, `_project-list-view.tsx`, `_project-card-shared.tsx`, `_create-project-modal.tsx`) into the Legacy tab panel — same Status (`active|on_hold|completed|archived`) + legacy/version2 filter, same grid/list view toggle. Card/row links point to `/projects-v2/legacy/[projectId]`.
- [ ] **V2 project detail** (`/projects-v2/v2/[projectId]`): tab set = Overview, Tasks, Issues, Milestones, Files, Access, Members, Status Report, Time Logs.
  - Overview = ported `_generic-swimlane.tsx` / `_generic-phase-view.tsx` / `_status-summary-drawer.tsx` / `_status-summary-phase-cards.tsx` content from `/portfolio-tracker/[projectId]`, same progress-bar + day-based Gantt behavior. Clicking a Phase-1 deliverable still routes into an Onboarding Workspace, ported to `/projects-v2/v2/[projectId]/onboarding-workspace` with the same Business Info / Files / Access / Checklist sub-tabs (`_workspace-url-params.ts`'s `DELIVERABLE_WORKSPACE_TARGET` mapping updated to point at the new path).
  - Tasks / Issues / Milestones = there is no existing tab content for these on `/portfolio-tracker/[projectId]` (it's a single-scroll timeline page) — port the Tasks/Issues/Milestones tab implementations from `/projects/[projectId]` (`_list-view.tsx`, `_board-view.tsx`, `_calendar-view.tsx`, `_issue-list-view.tsx`, `_issue-board-view.tsx`, `_issue-calendar-view.tsx`, milestone subroute components, `_task-drawer.tsx`, `_create-task-modal.tsx`, etc.) and wire them to the V2 project's `projectId`.
- [ ] **Legacy project detail** (`/projects-v2/legacy/[projectId]`): tab set = Tasks, Issues, Milestones (ported as-is from `/projects/[projectId]`) + Files, Access, Members, Status Report, Time Logs (shared components, see below).
- [ ] **Shared tabs** (used by both V2 and Legacy detail pages), each accepting a `projectId` prop:
  - **Files** — reuses the Onboarding Workspace's `_files-tab.tsx` UI/data pattern, scoped to the given `projectId` (verify at implementation time whether the underlying storage/table is already keyed generically by `project_id` or is onboarding-specific; if onboarding-specific, confirm it still returns correctly for legacy projects that never went through onboarding — an empty state is acceptable there).
  - **Access** — reuses the Onboarding Workspace's `_access-tab.tsx` UI/data pattern (credentials/links/repos, masked values + undo-delete), scoped to `projectId`.
  - **Members** — new persistent-tab UI wrapping the existing `GET/POST /api/projects/[projectId]/members` endpoint and the content currently inside `_manage-collaborators-action.tsx` (promoted from modal-only to a full tab view; the modal trigger can remain available inside the tab for add/remove actions).
  - **Status Report** — reuses `_status-report-table.tsx` / `_status-report-types.ts` against `GET /api/onboarding/projects/status-report?projectId=`, scoped to one project instead of the current portfolio-wide default.
  - **Time Logs** — reuses the `/dashboard/timelogs` page's table/filter components against `GET /api/v2/time-logs?project_id=`, scoped to one project (this endpoint already aggregates task-level + issue-level time logs).
- [ ] All new pages/components follow `_final_design/guide/central-hub-design-system.md` tokens (see Code Context below) — no ad hoc colors, no `dark:` classes (v2 uses the `isDark`-prop pattern per CLAUDE.md), navy for tab/filter active states, blue for actions, one orange CTA max per screen, Space Grotesk only for titles, JetBrains Mono for IDs/counts/dates.
- [ ] All new/ported files respect `nextjs-file-length-best-practices.md` — soft warning ~250-300 lines, split into sub-components rather than growing any single file past that (the existing `_onboarding-detail.tsx` at 2254 lines is a cautionary example to *not* repeat when porting Overview content — split it during the port).

## Out of Scope / Must-Not-Change

- Do not modify any file under `src/app/(hub)/projects/` or `src/app/(hub)/portfolio-tracker/` — read/copy only.
- Do not modify the existing "Projects" or "Tracker" sidebar nav items, or `V2_ROUTES.PROJECTS` / `V2_ROUTES.PORTFOLIO_TRACKER`.
- Do not modify existing API routes under `src/app/api/projects/`, `src/app/api/v2/projects/`, `src/app/api/onboarding/projects/`, `src/app/api/v2/time-logs/` — this task only adds a `?projectId=` call pattern the endpoints already support (confirmed for status-report and time-logs) or reuses endpoints unchanged (members). No DB schema changes.
- Do not remove or deprecate `/projects` or `/portfolio-tracker` in this task — that is explicitly a future task once `/projects-v2` is validated.
- No new file-storage bucket or table for the Files tab — reuse whatever the Onboarding Workspace's Files tab already reads from.
- No changes to `role-access.ts` required by default (both `/projects` and `/portfolio-tracker` default-allow via fallthrough) — only add the client-role redirect inline in the new pages, matching existing page-level guards.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/config/constants.ts` | Modify | Add `PROJECTS_V2: "/projects-v2"` to `V2_ROUTES` (and any `_V2/_LEGACY` sub-path constants needed) |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Add new "Projects V2" nav item next to existing "Projects"/"Tracker" entries |
| `src/app/(hub)/projects-v2/page.tsx` | Create | Server component — auth/role guard, renders shell |
| `src/app/(hub)/projects-v2/_projects-v2-shell.tsx` | Create | Client shell — draggable tab strip (dnd-kit), `?tab=` URL sync, renders active tab panel |
| `src/app/(hub)/projects-v2/_use-tab-order.ts` | Create | localStorage-backed hook for tab order preference (follows `use-pm-settings.ts` pattern) |
| `src/app/(hub)/projects-v2/_v2-projects-listing.tsx` + supporting files | Create | Ported `/portfolio-tracker` listing (filters, cards, pagination) |
| `src/app/(hub)/projects-v2/_legacy-projects-listing.tsx` + supporting files | Create | Ported `/projects` listing (filters, grid/list view, pagination) |
| `src/app/(hub)/projects-v2/v2/[projectId]/page.tsx` + tab components | Create | V2 detail page: Overview (swimlane/timeline), Tasks, Issues, Milestones tabs |
| `src/app/(hub)/projects-v2/v2/[projectId]/onboarding-workspace/page.tsx` + sub-tabs | Create | Ported Onboarding Workspace (Business Info/Files/Access/Checklist), path updated |
| `src/app/(hub)/projects-v2/legacy/[projectId]/page.tsx` + tab components | Create | Legacy detail page: Tasks, Issues, Milestones tabs (ported) |
| `src/app/(hub)/projects-v2/_shared/_files-tab.tsx` | Create | Shared Files tab (project documents), used by both v2 and legacy detail pages |
| `src/app/(hub)/projects-v2/_shared/_access-tab.tsx` | Create | Shared Access tab (credentials/links/repos), used by both |
| `src/app/(hub)/projects-v2/_shared/_members-tab.tsx` | Create | Shared Members tab, wraps existing members API + promoted collaborator UI |
| `src/app/(hub)/projects-v2/_shared/_status-report-tab.tsx` | Create | Shared Status Report tab, project-scoped call to existing status-report API |
| `src/app/(hub)/projects-v2/_shared/_time-logs-tab.tsx` | Create | Shared Time Logs tab, project-scoped call to existing `/api/v2/time-logs` |
| `src/app/(hub)/projects-v2/_shared/_project-detail-tabs.tsx` | Create | Shared tab-strip chrome for project-detail pages (design-system tab styling reused by both v2 and legacy detail) |

Exact file breakdown within each "+ supporting files"/"+ tab components" bucket should follow the same decomposition already used by the source features (e.g. keep `_task-drawer.tsx`, `_create-task-modal.tsx`, `_board-view.tsx` etc. as separate ported files rather than merging) — do not flatten into fewer, larger files.

## Code Context

### Design tokens to apply (from `_final_design/guide/central-hub-design-system.md`)
- Tab strip / active state: **navy** fill for the active/selected tab pill (`--navy-active: #16296B`), never blue — blue is reserved for actions. Inactive tabs: white/neutral with `--line` border.
- Filter pills: pill radius, inactive white + `--line` border, **active navy fill** (`--navy: #071133`), mono count at 65% opacity.
- CTA buttons: pill radius 999px, orange (`--orange: #FB914E`) bg + `#471F02` text, ONE per screen max (e.g. "+ New Project" if kept).
- Panels: white, `--line` border, `--r-lg` (14px), `--sh-sm` shadow — border + shadow together, never shadow-only.
- Typography: Space Grotesk 600-700 for page/panel titles only; Inter for all UI/body text and tab labels; JetBrains Mono for `Day N/120`, dates, IDs, counts.
- Table styling per spec section 4 (`Table`): 9.5px/700 caps header on `#FAFBFE`, row hover `--blue-50`.
- Motion: 160ms `cubic-bezier(.22,1,.36,1)` transitions on color/background/border only; no scale/lift; respect `prefers-reduced-motion`.
- v2 theming convention (CLAUDE.md override of the generic guide): use the `isDark` boolean prop + `cn()` paired light/dark utility classes, **not** `dark:` variants or `bg-background`/`text-foreground` tokens.

### `_workspace-url-params.ts` — tab pattern to mirror for `/projects-v2`'s top-level tab and the detail-page tab set
```
// DELIVERABLE_WORKSPACE_TARGET maps swimlane deliverable → onboarding-workspace ?tab=
// business-info | files | access | checklist, driven by ?tab= query param
```
Update the equivalent mapping so V2 project detail's swimlane still opens the ported onboarding-workspace route at `/projects-v2/v2/[projectId]/onboarding-workspace?tab=...`.

### `_phase-builder.tsx` — dnd-kit pattern to reuse for the draggable tab strip
```
useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={...}>
  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
    {/* each item: useSortable({ id }) + CSS.Transform.toString(transform) */}
```
For a horizontal 2-item tab strip, use `horizontalListSortingStrategy` instead of vertical; reorder via `arrayMove`, then persist the resulting order array to `localStorage` (do not just hold in component state — the ask is a persisted preference).

### `use-pm-settings.ts` — localStorage preference pattern to reuse
Module-level cache + listener array; `readSettings()`/`writeSettings()` wrap `localStorage.getItem/setItem(STORAGE_KEY, JSON.stringify(...))` with a safe-parse fallback to defaults. Model the new `_use-tab-order.ts` hook on this exact shape (`STORAGE_KEY = "projects-v2-tab-order"`, default `["v2", "legacy"]`).

### Status Report — already supports project scoping
`GET /api/onboarding/projects/status-report` reads `?projectId=` and filters `.eq("id", projectId)` (route.ts). `_status-report-client.tsx` currently calls it with no param; the new shared tab just needs to pass `projectId` through.

### Time Logs — already supports project scoping
`/dashboard/timelogs`'s `_time-logs-content.tsx` sets `params.set("project_id", projectFilter)` against `GET /api/v2/time-logs`, which already aggregates task-level + issue-level entries. Reuse this query pattern for the new shared Time Logs tab rather than merging the separate per-task/per-issue endpoints manually.

### Members — backend already exists, no API work needed
`GET/POST /api/projects/[projectId]/members` — build the Members tab UI around this; promote the relevant parts of `_manage-collaborators-action.tsx` out of its modal wrapper into the new persistent tab.

## Implementation Steps

1. **Scaffold & nav**: add `PROJECTS_V2` route constant, sidebar nav item, `/projects-v2/page.tsx` + `_projects-v2-shell.tsx` with the draggable two-tab strip (dnd-kit) and `_use-tab-order.ts` localStorage hook. Wire `?tab=` URL sync. Verify V2 Projects is active by default and dragging Legacy to first position persists across reload.
2. **V2 Projects listing**: port `/portfolio-tracker`'s listing files into the V2 tab panel, pointing project links at `/projects-v2/v2/[projectId]`. Confirm filters (Status + Classification) and pagination behave identically to the source.
3. **Legacy Projects listing**: port `/projects`'s listing files into the Legacy tab panel, pointing links at `/projects-v2/legacy/[projectId]`. Confirm filters and grid/list toggle behave identically to the source.
4. **Shared detail tabs** (build once, used by both variants): `_shared/_files-tab.tsx`, `_shared/_access-tab.tsx`, `_shared/_members-tab.tsx`, `_shared/_status-report-tab.tsx`, `_shared/_time-logs-tab.tsx`, `_shared/_project-detail-tabs.tsx` (tab-strip chrome). Verify each against a project that HAS onboarding data and one that does NOT (legacy project) — confirm graceful empty states where data doesn't exist yet.
5. **V2 project detail**: `/projects-v2/v2/[projectId]/page.tsx` assembling Overview (ported swimlane/timeline) + Tasks/Issues/Milestones (ported from `/projects/[projectId]`, since portfolio-tracker never had these) + the 5 shared tabs. Port the Onboarding Workspace to `/projects-v2/v2/[projectId]/onboarding-workspace`, update the deliverable→tab routing map.
6. **Legacy project detail**: `/projects-v2/legacy/[projectId]/page.tsx` assembling ported Tasks/Issues/Milestones + the same 5 shared tabs.
7. **Design pass**: verify every new/ported surface against the design-system tokens (tab active state = navy, no `dark:` classes, Space Grotesk only on titles, mono on IDs/dates/counts, 160ms transitions, skeleton loading states, empty states with icon + message + action).
8. **File-length pass**: run through `nextjs-file-length-best-practices.md` guidance on every new/ported file; split anything trending past ~300 lines, especially the Overview/swimlane port (source `_onboarding-detail.tsx` is 2254 lines — do not port it as one file).

## Acceptance Criteria

- [ ] `/projects-v2` loads with "V2 Projects" tab active by default, showing the ported portfolio-tracker-style listing with working Status + Classification filters.
- [ ] Dragging "Legacy Projects" before "V2 Projects" reorders the tab strip and persists across a page reload (localStorage).
- [ ] "Legacy Projects" tab shows the ported `/projects`-style listing with working filters and grid/list toggle.
- [ ] Clicking a V2 project opens `/projects-v2/v2/[projectId]` with tabs: Overview, Tasks, Issues, Milestones, Files, Access, Members, Status Report, Time Logs — all functional.
- [ ] Overview tab renders the progress bar + swimlane identically to `/portfolio-tracker/[projectId]`, and clicking an Onboard-phase deliverable opens the ported Onboarding Workspace with working Business Info/Files/Access/Checklist sub-tabs.
- [ ] Clicking a Legacy project opens `/projects-v2/legacy/[projectId]` with tabs: Tasks, Issues, Milestones, Files, Access, Members, Status Report, Time Logs — all functional, including on a project with no onboarding history (graceful empty states for Files/Access).
- [ ] Files, Access, Members, Status Report, and Time Logs tabs are the same shared components rendering correctly for both a V2 and a Legacy project.
- [ ] `/portfolio-tracker` and `/projects` (and their nav items) are byte-for-byte unmodified — `git diff` (or file comparison) shows zero changes outside `src/app/(hub)/projects-v2/`, `constants.ts`, and `v2-hub-sidebar.tsx`.
- [ ] All new UI passes a visual check against `_final_design/guide/central-hub-design-system.md` (navy tab/filter active states, no `dark:` classes, correct type faces).
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-test: /projects-v2 — tab drag/reorder, both listings, both detail variants, all 9 (V2) / 8 (Legacy) tabs
```
Browser-based acceptance testing is required (per CLAUDE.md — no test runner configured): walk both listing tabs, open a V2 project and a Legacy project, exercise every tab including the Onboarding Workspace sub-tabs, and confirm the existing `/portfolio-tracker` and `/projects` pages still work unchanged.

## Compatibility Touchpoints

- `_docs/mcp-tools.md` — not affected (no new `server.registerTool` calls).
- No new env vars.
- No DB migration required (reuses existing tables/columns via existing API routes).
- `role-access.ts` — no change required (default-allow fallthrough covers `/projects-v2`); add the same client-role page-level redirect used by `/projects` and `/portfolio-tracker`.

## Implementation Notes

### What Changed

Built in 3 sequential phases (each a subagent, to keep the mechanical port/adapt work off the orchestrating context) plus a direct fix for a gap the phases left behind:

- **Phase 1 — Foundation**: `V2_ROUTES.PROJECTS_V2` route constant; new "Projects V2" sidebar nav item (same visibility as "Projects"); `/projects-v2` shell (`page.tsx` + `_projects-v2-shell.tsx` + `_use-tab-order.ts`) with a draggable "V2 Projects"/"Legacy Projects" tab strip (dnd-kit, `horizontalListSortingStrategy`, order persisted to `localStorage` via a hook modeled on `use-pm-settings.ts`); active tab driven by `?tab=` URL param, defaulting to `v2`. Both listings ported verbatim (`_v2-listing/` from `/portfolio-tracker`, `_legacy-listing/` from `/projects`), links repointed at the new detail routes.
- **Phase 2 — Legacy detail + shared tab layer**: `/projects-v2/legacy/[projectId]/` ported from `/projects/[projectId]/` (Tasks/Issues/Milestones, ~27 files via bulk `cp -r` + route-string fixups). Established `src/app/(hub)/projects-v2/_shared/` as the shared layer: `_project-detail.tsx` (the tab-strip + tab-body component, generalized with `basePath`/`variant` props) and its ~26 dependency components (board/list/calendar views, task/issue/milestone sub-components), plus 5 new tabs — `_files-tab.tsx`/`_access-tab.tsx` (thin wrappers around the existing customer-scoped `/api/customers/[customerId]/assets*` endpoints, reusing the Onboarding Workspace's presentational `FilesTab`/`AccessTab` components directly rather than duplicating them), `_members-tab.tsx` (wraps the existing `/api/projects/[projectId]/members`), `_status-report-tab.tsx` and `_time-logs-tab.tsx` (both reuse existing project-scoping query params on already-existing endpoints).
- **Phase 3 — V2 detail + Onboarding Workspace port**: `/projects-v2/v2/[projectId]/` — Overview tab ported from `/portfolio-tracker/[projectId]/` (`_onboarding-detail.tsx`, 2254 lines, kept as one file), Onboarding Workspace ported verbatim into `.../onboarding-workspace/`, and the 8 shared tabs wired in via thin route wrappers around `_shared/_project-detail.tsx` with `variant="v2"`. Extracted the tab-strip chrome into `_shared/_project-detail-tab-strip.tsx` so Overview and the other 8 tabs render one consistent, cross-navigable strip (`showOverview` prop, `v2`-only).
- **Post-Phase-3 fix (this pass)**: Phase 3's own audit found Phase 2 had built the Files/Access/Members/Status Report/Time Logs tab *components* but never created their Legacy *route folders* — clicking those tabs from a Legacy project 404'd. Added the 5 missing thin wrappers (`legacy/[projectId]/{files,access,members,status_report,time_logs}/page.tsx`, mirroring the V2 versions Phase 3 built) with `variant="legacy"`.

### Files Changed

- `src/config/constants.ts` — added `PROJECTS_V2` to `V2_ROUTES`
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — added "Projects V2" nav item
- `src/app/(hub)/projects-v2/page.tsx`, `_projects-v2-shell.tsx`, `_use-tab-order.ts` — new shell
- `src/app/(hub)/projects-v2/_v2-listing/` (9 files), `_legacy-listing/` (10 files) — ported listings
- `src/app/(hub)/projects-v2/_shared/` (33 files) — shared detail-page layer (tab strip, tab-body component, data loader, 26 supporting components, 5 new tab components)
- `src/app/(hub)/projects-v2/legacy/[projectId]/` (32 files: 27 ported + 5 new wrappers) — Legacy detail route
- `src/app/(hub)/projects-v2/v2/[projectId]/` (~65 files) — V2 detail route (Overview/swimlane, Onboarding Workspace, 8 shared-tab wrappers, task/issue/milestone detail subroutes)

Nothing under `src/app/(hub)/portfolio-tracker/`, `src/app/(hub)/projects/`, `src/app/(hub)/dashboard/timelogs/`, or any `/api/**` route was modified — confirmed via `find -newer` checks by each phase and re-verified directly.

### Deviations From Plan

- **Shared layer grew beyond the 6 files the task doc's file table named.** `_project-detail.tsx` statically imports ~26 dependency components (board/calendar/list views, task/issue drawers, attachment pickers, etc.); a single physical file can't have two different relative import targets for Legacy vs. V2, so "port once, generalize with `basePath`/`variant`" required moving all of them into `_shared/`, not just the 2 originally named. This is a stricter application of the task doc's own DRY intent for the 5 new tabs, extended consistently to Tasks/Issues/Milestones — not a scope change.
- **Files/Access tabs are customer-scoped, not project-scoped**, discovered while reading the Onboarding Workspace source (`GET /api/customers/{customerId}/assets`, no `project_id` filter). The same files/credentials appear on every project belonging to that customer. This matches the existing Onboarding Workspace's own behavior and the user's explicit direction that the new Files tab "look like the Onboarding Workspace > Files tab" — treated as intentional, not a bug.
- **Route segment names for the 2 tabs with hyphenated task-doc prose are `status_report`/`time_logs` (underscore)**, not `status-report`/`time-logs` — this matches `ProjectDetail`'s actual `PRIMARY_TABS` id values already wired by Phase 3's tab-strip navigation; using hyphens would have required a second rename pass across the tab strip's `router.push` calls for no benefit.
- **`_onboarding-detail.tsx` (2254 lines) was ported as one file**, not split, per the task doc's own acknowledged correctness-over-length tradeoff for this specific file. Flagged here again as a follow-up `simplify`/refactor candidate.
- **The Legacy 5-tab route-folder gap** (see "Post-Phase-3 fix" above) was Phase 2 building the tab components but not the Legacy route wrappers for them; fixed directly rather than re-dispatching a 4th agent for 5 small files.
- **`_access-tab.tsx`'s "phase_number" write-path default**: the underlying folder-scoping API requires `phaseNumber` (not optional); both Files/Access shared tabs default to `phaseNumber=1` for folder queries, matching the only folder scope that exists today (this affects folder organization only, not the flat asset list itself).

### Verification Run

- `npx tsc --noEmit` — PASS (0 errors, project-wide, re-run after all 3 phases plus the post-Phase-3 fix)
- `pnpm lint` — PASS (0 errors; 4 pre-existing warnings — 2 in the untouched `portfolio-tracker/[projectId]/onboarding-workspace/_checklist-tab.tsx` source, inherited unchanged by its verbatim port into `projects-v2/v2`)
- `pnpm dev` — PASS (server starts clean on Turbopack; `curl /projects-v2` returns a correct `307` redirect to `/auth/login?returnTo=%2Fprojects-v2` for an unauthenticated request, confirming the route compiles and the auth guard works)
- **Interactive/authenticated browser testing — NOT COMPLETED.** No `.env.local` existed in either subagent's sandbox (only Phase 1/2/3's reports noted this); this session found a `.env` with real Supabase config and could start the dev server, but the Claude-in-Chrome browser tool could not reach this sandbox's `localhost:3000` (separate network namespace from the user's actual Chrome browser) and no test-user credentials were available to log in server-side. **This means the full tab-drag-reorder interaction, both listings' filters, and all 9 (V2) / 8 (Legacy) detail tabs have only been verified by static analysis (types, lint, route-compiles-and-redirects) and subagent code review — not by an actual logged-in walkthrough.** Per CLAUDE.md's browser-testing requirement, a manual pass on a machine where the dev server and browser share a network is still needed before this can be called fully verified. Recommended before merge: `pnpm dev` locally, log in, and walk both listing tabs (filters, drag-reorder-then-reload persistence), open one V2 project (all 9 tabs including Onboarding Workspace sub-tabs) and one Legacy project (all 8 tabs), and confirm `/portfolio-tracker` and `/projects` still work unchanged.
