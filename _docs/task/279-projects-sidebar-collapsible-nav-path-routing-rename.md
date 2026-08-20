# 279: Projects Sidebar → Collapsible Nav + Path-Based Routing + Old Route Rename/Hide

**Created:** 2026-08-20
**Priority:** HIGH
**Type:** refactor
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Restructure the "Projects" area of the sidebar and URL scheme, building on task 276's unified `/projects-v2` page (draggable "V2 Projects"/"Legacy Projects" tab strip switched via `?tab=v2|legacy`):

1. Replace the two current sidebar entries — "Projects" (→ `/projects`, the old single-page legacy module) and "Projects V2" (→ `/projects-v2`, the unified tab page) — with **one** collapsible "Projects" nav item that expands to two sub-links: **"V2 Projects"** and **"Legacy Projects"**.
2. Replace the `?tab=v2` / `?tab=legacy` query-param tab switch with real paths: **`/projects/v2`** and **`/projects/legacy`**. This means the folder currently at `src/app/(hub)/projects-v2/` becomes `src/app/(hub)/projects/`, and its existing `v2/[projectId]` / `legacy/[projectId]` sub-trees (already real routes from task 276) simply move up with it — no change needed to their own internal shape, only to the `/projects-v2/...` literal strings and the `V2_ROUTES.PROJECTS_V2` constant value they use.
3. Rename the **current** `/projects` route (old legacy single-page module, untouched by task 276) to **`/projects-old`**, and remove its sidebar entry entirely (route stays live and directly reachable — task 276's "hide from sidebar" precedent — just no longer linked in nav).
4. Rename the visible label "Projects V2" to **"Projects"** (the page's own `<h1>` heading and `<title>`, matching the new collapsible nav's parent label). The pill labels inside the page — "V2 Projects" / "Legacy Projects" — are unchanged; only the container-level "Projects V2" label goes away.

Locked-in decisions (confirmed with user, 2026-08-20):

- **Bare `/projects`** (no `/v2` or `/legacy` segment) client-redirects to the last-used sub-tab (the first entry in the existing drag-order `localStorage` preference from task 276's `_use-tab-order.ts`), defaulting to `/projects/v2` on first visit / no saved preference.
- **External links that currently point at the old `/projects` page** — the Customers page's "view projects for this customer" link, the dev/marketing dashboard "Projects" quick-link cards, and 3 files under `/portfolio-tracker` that deep-link into a project's Tasks/Milestones tab — are repointed to the new **`/projects/legacy`** routes (not left on `/projects-old`). This includes editing the 3 `/portfolio-tracker` files; their "do-not-touch" boundary from task 276 was scoped to that task only, not permanent, and repointing is a one-line route-constant/string change, not a logic change.
- **`/projects-old` stays fully live**, just unlinked from the sidebar — no redirect is added.

## Requirements

- [ ] Sidebar (`v2-hub-sidebar.tsx`): remove the old "Projects" entry (→ old `/projects`). Rename "Projects V2" entry's label to **"Projects"**, and convert it into a collapsible item with two children: **"V2 Projects"** (→ `/projects/v2`) and **"Legacy Projects"** (→ `/projects/legacy`). Same visibility as today (both current entries are ungated — visible to every role reaching `workItems`, including `client` and `developer`; the merged item keeps that same no-gate visibility).
- [ ] Collapsible nav mechanics: clicking the parent row toggles expand/collapse (does not itself navigate); auto-expand when the current pathname is under `/projects` (any sub-route); parent shows the active-highlight style when either child is active or pathname matches `/projects` exactly. When the whole sidebar is in its icon-only rail mode (`collapsed` state, unrelated to this change), children are not rendered — clicking the parent icon navigates directly to bare `V2_ROUTES.PROJECTS` (`/projects`), same as every other rail-mode item today.
- [ ] `src/config/constants.ts`: add `PROJECTS_OLD: "/projects-old"`; add `PROJECTS_LEGACY: "/projects/legacy"`; change `PROJECTS_V2`'s value from `"/projects-v2"` to `"/projects/v2"` (constant name unchanged — it is already imported everywhere the V2 listing/detail routes are built, so most call sites keep working once the redundant `/v2` segment some of them append is dropped, see Code Context). Existing `PROJECTS: "/projects"` stays defined but its meaning changes to "the new unified Projects entry point" (the bare-path redirect page), since the old content that used to live there has moved to `PROJECTS_OLD`.
- [ ] Rename folder `src/app/(hub)/projects/` → `src/app/(hub)/projects-old/`. Inside it, replace every internal self-reference from `V2_ROUTES.PROJECTS` → `V2_ROUTES.PROJECTS_OLD`, and every hardcoded literal `` `/projects/${...}` `` / `"/projects/..."` path string → the `/projects-old/` equivalent (see Code Context for the exact file:line list already found).
- [ ] Rename folder `src/app/(hub)/projects-v2/` → `src/app/(hub)/projects/`. Inside it, mechanically replace every literal `/projects-v2/v2/` → `/projects/v2/`, `/projects-v2/legacy/` → `/projects/legacy/`, `/projects-v2?tab=v2` → `/projects/v2`, `/projects-v2?tab=legacy` → `/projects/legacy`, and adjust `V2_ROUTES.PROJECTS_V2`-based constructions per the new constant values (drop the now-redundant `/v2` or `/legacy` segment some of them append — see Code Context).
- [ ] Split the old combined `page.tsx` (which branched on `?tab=` to render either listing) into three route files:
  - `src/app/(hub)/projects/v2/page.tsx` — Server Component: auth/role guard + `loadOnboardingProjectsList` + renders `V2ProjectsListing` wrapped in the shared listing-shell (`activeTab="v2"`).
  - `src/app/(hub)/projects/legacy/page.tsx` — Server Component: auth/role guard + `loadLegacyProjectsList` (including the existing `?customer=` handling, needed by the repointed Customers-page link) + renders `ProjectsIndex` wrapped in the shared listing-shell (`activeTab="legacy"`).
  - `src/app/(hub)/projects/page.tsx` — thin client component: reads the saved tab order via the existing `useTabOrder()` hook and `router.replace`s to `/projects/${order[0]}` on mount (defaulting to `/projects/v2` when nothing is saved / on the server-snapshot render).
- [ ] Adapt `_projects-v2-shell.tsx` into a listing-only shell (e.g. `src/app/(hub)/projects/_listing-shell.tsx`) that takes `{ activeTab: "v2" | "legacy"; children }` instead of `{ activeTab, v2Content, legacyContent }`, renders the draggable pill strip (unchanged dnd-kit wiring) plus `{children}`, and on pill click/reorder-select navigates via `router.push` to `V2_ROUTES.PROJECTS_V2` or `V2_ROUTES.PROJECTS_LEGACY` (real routes) instead of appending `?tab=`. Update the shell's `<h1>` text and the two `page.tsx`'s `metadata.title` from **"Projects V2"** to **"Projects"**.
- [ ] Repoint the 6 external call sites identified below (Customers page, dev-dashboard, marketing-dashboard, 3 portfolio-tracker files) from `V2_ROUTES.PROJECTS` to `V2_ROUTES.PROJECTS_LEGACY`, preserving each site's existing query-string/sub-path behavior.
- [ ] Verify no remaining references to the literal strings `projects-v2` or `/projects-old`-mismatched `V2_ROUTES.PROJECTS` usages remain anywhere in `src/` after the sweep (see Verification).

## Out of Scope / Must-Not-Change

- No change to `/portfolio-tracker`'s own UI, data, or logic — the 3 files there get only a route-destination string/constant swap (old `/projects/[id]` deep link → new `/projects/legacy/[id]` deep link), nothing else in those files changes.
- No change to the actual listing/detail feature behavior (filters, pagination, drag-reorder persistence, tab content) inside either the old `/projects-old` module or the new `/projects/v2` + `/projects/legacy` modules — this task is a routing/nav restructure only.
- No change to `role-access.ts` — both old and new routes stay default-allow via fallthrough, same as today.
- No DB schema or API route changes.
- Do not rename the `localStorage` key `"projects-v2-tab-order"` used by `_use-tab-order.ts` — renaming it would silently reset every user's saved tab-order preference for no functional benefit; keep the existing key even though the folder/URL it backs is renamed.
- Do not change the pill labels "V2 Projects" / "Legacy Projects" inside the page — only the page-level "Projects V2" title/heading is renamed to "Projects".

## Proposed File Changes

| File / Path | Action | Purpose |
|---|---|---|
| `src/config/constants.ts` | Modify | Add `PROJECTS_OLD`, add `PROJECTS_LEGACY`, change `PROJECTS_V2`'s value to `/projects/v2` |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Remove old "Projects" entry; rename "Projects V2" → "Projects", make collapsible with 2 children; add `children` support to `NavItem`/render logic |
| `src/app/(hub)/_components/v2-hub-header.tsx` | Modify | `BREADCRUMB_MAP` — `V2_ROUTES.PROJECTS` entry now describes the new unified page ("Projects"); no `PROJECTS_OLD` breadcrumb entry needed unless desired (falls through to generic "WebriQ / Hub") |
| `src/app/(hub)/projects/` → `src/app/(hub)/projects-old/` | Rename (folder) | Old legacy single-page module moves out of the way of the new `/projects` |
| `src/app/(hub)/projects-old/**` internal route strings | Modify | Swap `V2_ROUTES.PROJECTS` → `V2_ROUTES.PROJECTS_OLD`; swap literal `/projects/${...}` strings → `/projects-old/${...}` (file:line list in Code Context) |
| `src/app/(hub)/projects-v2/` → `src/app/(hub)/projects/` | Rename (folder) | Unified module takes over the "Projects" URL |
| `src/app/(hub)/projects/page.tsx` (new, from old shell branch) | Rewrite | Thin client redirect to `/projects/{lastTab}` |
| `src/app/(hub)/projects/v2/page.tsx` | Create | V2 listing route (extracted from old combined `page.tsx`'s `activeTab === "v2"` branch) |
| `src/app/(hub)/projects/legacy/page.tsx` | Create | Legacy listing route (extracted from old combined `page.tsx`'s `else` branch, keeps `?customer=` support) |
| `src/app/(hub)/projects/_listing-shell.tsx` (renamed from `_projects-v2-shell.tsx`) | Modify | Single-`children` shell; pill navigation → real routes; heading text → "Projects" |
| `src/app/(hub)/projects/_use-tab-order.ts` (moved, unchanged content) | Move | Same file, new parent folder |
| `src/app/(hub)/projects/_v2-listing/**`, `_legacy-listing/**`, `_shared/**`, `v2/[projectId]/**`, `legacy/[projectId]/**` | Modify (string sweep) | Replace `/projects-v2/v2/` → `/projects/v2/`, `/projects-v2/legacy/` → `/projects/legacy/`, `/projects-v2?tab=v2` → `/projects/v2`, `/projects-v2?tab=legacy` → `/projects/legacy`; adjust `V2_ROUTES.PROJECTS_V2`-based constructions for the new value (file:line list in Code Context) |
| `src/app/(hub)/customers/_customers-index.tsx` | Modify | "View projects for customer" link: `V2_ROUTES.PROJECTS` → `V2_ROUTES.PROJECTS_LEGACY` |
| `src/app/(hub)/dashboard/_components/dev-dashboard.tsx` | Modify | Quick-link card: `V2_ROUTES.PROJECTS` → `V2_ROUTES.PROJECTS_LEGACY` |
| `src/app/(hub)/dashboard/_components/marketing-dashboard.tsx` | Modify | Quick-link card: `V2_ROUTES.PROJECTS` → `V2_ROUTES.PROJECTS_LEGACY` |
| `src/app/(hub)/portfolio-tracker/[projectId]/_generic-phase-view.tsx` | Modify | Deep link into legacy Milestones: `V2_ROUTES.PROJECTS` → `V2_ROUTES.PROJECTS_LEGACY` |
| `src/app/(hub)/portfolio-tracker/[projectId]/_generic-swimlane.tsx` | Modify | Deep link into legacy Tasks (`?tasklist=`): `V2_ROUTES.PROJECTS` → `V2_ROUTES.PROJECTS_LEGACY` |
| `src/app/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Same deep link, line ~1562: `V2_ROUTES.PROJECTS` → `V2_ROUTES.PROJECTS_LEGACY` |

## Code Context

### Current sidebar entries to merge (`v2-hub-sidebar.tsx:41-42`)
```tsx
{ label: "Projects",      icon: <FolderKanban size={18} />,   href: V2_ROUTES.PROJECTS },
{ label: "Projects V2",   icon: <LayoutGrid size={18} />,     href: V2_ROUTES.PROJECTS_V2 },
```
Becomes one collapsible entry, e.g.:
```tsx
{
  label: "Projects",
  icon: <FolderKanban size={18} />,
  href: V2_ROUTES.PROJECTS, // "/projects" — bare-path redirect target, used for rail-mode click + active-prefix match
  children: [
    { label: "V2 Projects",     href: V2_ROUTES.PROJECTS_V2 },     // "/projects/v2"
    { label: "Legacy Projects", href: V2_ROUTES.PROJECTS_LEGACY }, // "/projects/legacy"
  ],
}
```
`NavItem`/`NavGroup` types and the `group.items.map(...)` render loop need a `children?: NavItem[]` branch: render a chevron + expand/collapse local state (default expanded = `pathname.startsWith("/projects")`), and when expanded, render the two children indented under the parent row with the same active/hover styling pattern used elsewhere in this file. `LayoutGrid` import becomes unused once "Projects V2"'s icon is dropped — remove it if nothing else in the file references it.

### Old `/projects` folder — internal self-references needing `PROJECTS` → `PROJECTS_OLD`
```
src/app/(hub)/projects/_project-card-menu.tsx:69
src/app/(hub)/projects/_project-grid-view.tsx:87,168,175
src/app/(hub)/projects/_project-list-view.tsx:42
src/app/(hub)/projects/_projects-index.tsx:141,269
src/app/(hub)/projects/[projectId]/_delete-project-action.tsx:33
src/app/(hub)/projects/[projectId]/_milestone-swimlane.tsx:79
src/app/(hub)/projects/[projectId]/_project-detail.tsx:437
```
Plus hardcoded literal `` `/projects/${...}` `` strings (not using the constant) that need the same folder-rename treatment:
```
src/app/(hub)/projects/[projectId]/_milestone-panel.tsx:193
src/app/(hub)/projects/[projectId]/_project-detail.tsx:483,566,576,599,661,667,682
src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx:143,151
src/app/(hub)/projects/[projectId]/page.tsx:11
src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx:95
src/app/(hub)/projects/[projectId]/milestones/[milestoneId]/_milestone-detail.tsx:79,179
src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-quick-access-panel.tsx:42,57
```
(This list was produced by `grep -rn '"/projects/\|\`/projects/'` scoped to this folder — re-run it after the rename to confirm zero remaining `/projects/` literals that should have become `/projects-old/`.)

### `projects-v2` folder — scope of the literal-string sweep
114 occurrences of the substring `projects-v2` across 53 files under `src/app/(hub)/projects-v2/` (plus `constants.ts`) — found via:
```bash
grep -rn "projects-v2" src --include="*.tsx" --include="*.ts"
```
Two patterns to replace mechanically everywhere they appear inside the (soon-to-be-renamed) folder:
- `` `/projects-v2/v2/${...}` `` → `` `/projects/v2/${...}` ``
- `` `/projects-v2/legacy/${...}` `` → `` `/projects/legacy/${...}` ``
- `"/projects-v2?tab=v2"` → `"/projects/v2"` (or the `V2_ROUTES.PROJECTS_V2` constant, where the file already imports `V2_ROUTES`)
- `"/projects-v2?tab=legacy"` → `"/projects/legacy"` (or `V2_ROUTES.PROJECTS_LEGACY`)

Representative call sites already using the constant (adjust for the new value — most simplify by dropping a redundant segment):
```ts
// _v2-listing/_project-card.tsx, _portfolio-card-menu.tsx — was:
router.push(`${V2_ROUTES.PROJECTS_V2}/v2/${item.project_id}`)
// PROJECTS_V2 is now "/projects/v2" itself, so:
router.push(`${V2_ROUTES.PROJECTS_V2}/${item.project_id}`)

// _legacy-listing/_project-card-menu.tsx, _project-grid-view.tsx, _project-list-view.tsx — was:
router.push(`${V2_ROUTES.PROJECTS_V2}/legacy/${projectId}`)
// use the new PROJECTS_LEGACY constant instead:
router.push(`${V2_ROUTES.PROJECTS_LEGACY}/${projectId}`)

// _legacy-listing/_projects-index.tsx:141 and _v2-listing/_onboarding-list.tsx:109 — self-pagination links, was:
`${V2_ROUTES.PROJECTS_V2}?${p.toString()}`
// becomes tab-specific:
`${V2_ROUTES.PROJECTS_LEGACY}?${p.toString()}`   // in _legacy-listing
`${V2_ROUTES.PROJECTS_V2}?${p.toString()}`       // in _v2-listing (constant's value already changed)

// _projects-v2-shell.tsx:82 (becomes _listing-shell.tsx) — was:
router.push(`${V2_ROUTES.PROJECTS_V2}?tab=${tab}`)
// becomes:
router.push(tab === "v2" ? V2_ROUTES.PROJECTS_V2 : V2_ROUTES.PROJECTS_LEGACY)
```
Bounce-back / back-link literals to update the same way (`/projects-v2?tab=v2` → `/projects/v2`):
```
v2/[projectId]/_delete-project-menu-item.tsx:32
v2/[projectId]/_load-detail-data.ts:27
v2/[projectId]/_onboarding-detail.tsx:1634 (backHref prop)
v2/[projectId]/_coming-soon-overview.tsx:31 (backHref prop)
v2/[projectId]/onboarding-workspace/_workspace-header.tsx:44
v2/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx:341
_shared/_delete-project-action.tsx:35 (both variant branches)
_shared/_project-detail.tsx:448 (listingHref, both variant branches)
```
`basePath={`/projects-v2/v2/${projectId}`}` / `basePath={`/projects-v2/legacy/${projectId}`}` props appear in every `v2/[projectId]/{access,files,issues,members,milestones,status_report,tasks,time_logs}/page.tsx` and the matching `legacy/[projectId]/...` files — same mechanical substring swap, no structural change.

### Old combined listing route to split (`projects-v2/page.tsx`, full file already read)
Currently one Server Component reading `searchParams.tab` and branching between `loadOnboardingProjectsList` (v2) and `loadLegacyProjectsList` (legacy), passing both results into `<ProjectsV2Shell activeTab v2Content legacyContent />`. Split into `v2/page.tsx` (v2 branch only, own `searchParams` type without `tab`/`customer`) and `legacy/page.tsx` (legacy branch only, own `searchParams` type without `tab`, keeping `customer`/`view`). Both wrap their content in the adapted shell instead of the shell picking between two pre-rendered subtrees.

### New bare-path redirect (`projects/page.tsx`)
Model on `_use-tab-order.ts`'s existing `useTabOrder()` hook (unchanged, just relocated with the folder):
```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { useTabOrder } from "./_use-tab-order";

export default function ProjectsRedirectPage() {
  const router = useRouter();
  const { order } = useTabOrder();
  useEffect(() => {
    router.replace(order[0] === "legacy" ? V2_ROUTES.PROJECTS_LEGACY : V2_ROUTES.PROJECTS_V2);
  }, [order, router]);
  return null;
}
```
`useTabOrder()`'s `getServerSnapshot()` already returns `DEFAULTS = { order: ["v2", "legacy"] }`, so first-visit/no-preference correctly lands on `/projects/v2`.

### `v2-hub-header.tsx` breadcrumb map (`BREADCRUMB_MAP`, line 12)
`[V2_ROUTES.PROJECTS]: { section: "Work", page: "Projects" }` — the prefix-match fallback (`pathname.startsWith(prefix + "/")`) already covers `/projects/v2` and `/projects/legacy` once `V2_ROUTES.PROJECTS` stays `"/projects"`, so no new entry is strictly required; leave as-is unless a more specific breadcrumb per sub-tab is wanted (out of scope here).

## Implementation Steps

1. **Constants**: update `src/config/constants.ts` — add `PROJECTS_OLD`, add `PROJECTS_LEGACY`, change `PROJECTS_V2`'s value.
2. **Rename old folder**: `projects/` → `projects-old/`; sweep internal `V2_ROUTES.PROJECTS` and literal `/projects/` references per the Code Context file:line list; re-run the grep to confirm none remain.
3. **Rename new folder**: `projects-v2/` → `projects/`; run the mechanical `projects-v2` string sweep across all 53 files per Code Context; re-run `grep -rn "projects-v2" src` to confirm zero remaining hits outside comments referencing the historical task-276 name (comments may keep "task 276" references, but any functional string must be gone).
4. **Split the listing route**: create `projects/v2/page.tsx` and `projects/legacy/page.tsx` from the two branches of the old combined `page.tsx`; delete the old combined `page.tsx` content in favor of the new redirect version.
5. **Adapt the shell**: rename `_projects-v2-shell.tsx` → `_listing-shell.tsx` (or keep filename, mover's choice — just update its props/behavior), single-`children` API, route-based pill navigation, heading/title text → "Projects".
6. **New redirect page**: `projects/page.tsx` per Code Context.
7. **Sidebar**: merge the two nav entries into one collapsible "Projects" item with the two children; implement expand/collapse + active-state logic; remove the old "Projects" entry.
8. **External repoints**: update the 6 files (Customers page, dev-dashboard, marketing-dashboard, 3 portfolio-tracker files) from `V2_ROUTES.PROJECTS` → `V2_ROUTES.PROJECTS_LEGACY`.
9. **Full-repo verification sweep** (see Verification) — confirm no stray `/projects-v2` strings, no stray old-folder `/projects/` self-links inside `projects-old/`, and no remaining `V2_ROUTES.PROJECTS` usages outside `projects-old/` and the header's breadcrumb map that should have moved to `PROJECTS_OLD` or `PROJECTS_LEGACY`.

## Acceptance Criteria

- [ ] Sidebar shows a single "Projects" item; clicking it expands/collapses "V2 Projects" and "Legacy Projects" sub-links; no separate old "Projects" entry is visible anywhere in the sidebar.
- [ ] `/projects` (bare) redirects client-side to `/projects/v2` on first visit, and to whichever tab (`v2`/`legacy`) is first in the user's saved drag-order after they've reordered the pills.
- [ ] `/projects/v2` renders the V2 Projects listing (identical filters/pagination/behavior to the current `?tab=v2`); `/projects/legacy` renders the Legacy Projects listing including `?customer=` filtering.
- [ ] Dragging the pill order and reloading still persists via the existing `localStorage` key, now reflected as which route the sidebar/pill "select" navigates to.
- [ ] Every V2 and Legacy project detail page (`/projects/v2/[projectId]/...`, `/projects/legacy/[projectId]/...`, all 9/8 tabs) loads and all internal links (back-to-listing, task/issue/milestone drawers, onboarding workspace) resolve to `/projects/...` paths with zero `/projects-v2` in any URL or link target.
- [ ] `/projects-old` still loads the untouched legacy single-page module end-to-end (listing, detail, tasks/issues/milestones) and is not linked from the sidebar.
- [ ] Customers page "view projects for customer" link, both dashboard "Projects" quick-link cards, and all 3 `/portfolio-tracker` deep-links now land on `/projects/legacy/...` (not `/projects-old`), with the same target project/tasklist/tab as before.
- [ ] The page heading/title reads "Projects" (not "Projects V2") on both `/projects/v2` and `/projects/legacy`.
- [ ] `grep -rn "projects-v2" src` returns no functional matches (only, if any, historical comments referencing "task 276").
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
grep -rn "projects-v2" src --include="*.tsx" --include="*.ts"   # expect zero functional hits
grep -rn "V2_ROUTES\.PROJECTS\b" src --include="*.tsx" --include="*.ts"  # audit every remaining use is intentional (bare /projects redirect + breadcrumb)
pnpm dev
# Browser walk: collapse/expand the new "Projects" sidebar nav; visit bare /projects (fresh + after reordering);
# /projects/v2 and /projects/legacy listings (filters, pagination); a V2 and a Legacy project detail (all tabs,
# including onboarding-workspace); /projects-old directly (not in sidebar); Customers "view projects" link;
# both dashboards' "Projects" card; one portfolio-tracker deliverable's Tasks/Milestones deep link.
```
Browser-based acceptance testing is required per CLAUDE.md (no test runner configured).

## Compatibility Touchpoints

- `_docs/mcp-tools.md` — not affected (no `server.registerTool` changes).
- No env vars, no DB migration.
- `role-access.ts` — no change required (default-allow fallthrough covers both `/projects` and `/projects-old`).
- This task builds directly on task 276 (`_docs/task/276-projects-v2-unified-legacy-v2-tabs-page.md`) and touches files task 277/278 also modified (`_onboarding-detail.tsx`, `_generic-phase-view.tsx` etc. under `projects-v2/v2/[projectId]/`) — those tasks' functional changes are preserved; only route strings move.

## Implementation Notes

### What Changed

- `src/config/constants.ts` — added `PROJECTS_OLD: "/projects-old"` and `PROJECTS_LEGACY: "/projects/legacy"`; changed `PROJECTS_V2`'s value from `/projects-v2` to `/projects/v2`.
- Renamed `src/app/(hub)/projects/` (old legacy single-page module) → `src/app/(hub)/projects-old/` via plain filesystem `mv` (not `git mv` — this project's convention is no git commands of any kind). Swept all 7 files with internal `V2_ROUTES.PROJECTS` self-references to `V2_ROUTES.PROJECTS_OLD`, and all 7 files with hardcoded literal `` `/projects/${...}` `` route strings to `` `/projects-old/${...}` ``.
- Renamed `src/app/(hub)/projects-v2/` (task 276's unified module) → `src/app/(hub)/projects/`. Swept the literal-string route patterns (`/projects-v2/v2/` → `/projects/v2/`, `/projects-v2/legacy/` → `/projects/legacy/`, `/projects-v2?tab=v2|legacy` → `/projects/v2|legacy`) across all 53 affected files, then hand-fixed the handful of `V2_ROUTES.PROJECTS_V2`-based constructions that needed semantic adjustment now that the constant's value changed (dropped redundant `/v2` segments in `_v2-listing/*`; switched to the new `PROJECTS_LEGACY` constant in `_legacy-listing/*` and `_shared/_delete-project-action.tsx`; fixed `_shared/_project-detail.tsx`'s `listingHref`).
- Split the old combined `page.tsx` (query-param `?tab=` branch) into three routes: `v2/page.tsx` and `legacy/page.tsx` (each a real Server Component route with its own auth guard + data load, wrapped in the new shared shell) and a thin client `page.tsx` at the bare `/projects` path that redirects to `/projects/{lastSavedTab}` via the existing `useTabOrder()` hook, defaulting to `/projects/v2`.
- Replaced `_projects-v2-shell.tsx` with `_listing-shell.tsx` — single-`children` API instead of `{v2Content, legacyContent}`, pill clicks `router.push` to real routes instead of appending `?tab=`, heading text changed from "Projects V2" to "Projects".
- Sidebar (`v2-hub-sidebar.tsx`): merged the "Projects" and "Projects V2" entries into one collapsible "Projects" item (`NavItem.children`) with "V2 Projects" / "Legacy Projects" sub-links, expand/collapse toggle (defaults to following the current route until manually toggled), rail-mode (whole-sidebar collapsed) falls back to direct navigation on the parent icon.
- Repointed the 6 external call sites (Customers page, dev-dashboard, marketing-dashboard, 3 portfolio-tracker files) from `V2_ROUTES.PROJECTS` to `V2_ROUTES.PROJECTS_LEGACY`.
- Updated the stale in-code comments across the touched files that described the old `/projects-v2?tab=` mechanism, so they now describe the real `/projects/v2` and `/projects/legacy` routes (kept a few clearly historical "was X, task 276" comments as-is per the acceptance criteria).

### Files Changed

- `src/config/constants.ts` — new/changed route constants
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — collapsible "Projects" nav item
- `src/app/(hub)/_components/timer-floating-widget.tsx` — fixed a broken absolute import (`@/app/(hub)/projects/_pm-shared` → `@/app/(hub)/projects-old/_pm-shared`) discovered during the sweep; this file was outside the task doc's originally-scoped file list but the rename broke it
- `src/app/(hub)/dashboard/page.tsx` — fixed a broken relative import (`../projects/_project-access` → `../projects-old/_project-access`), same category of discovered breakage
- `src/app/(hub)/projects/` (renamed from `projects-v2/`) — 53+ files swept for literal route strings; `page.tsx`, `v2/page.tsx`, `legacy/page.tsx`, `_listing-shell.tsx` restructured; 42 files' absolute imports of `_pm-shared`/`_project-access` repointed to `projects-old`
- `src/app/(hub)/projects-old/` (renamed from `projects/`) — 14 files swept for internal self-references
- `src/app/(hub)/customers/_customers-index.tsx`, `dashboard/_components/dev-dashboard.tsx`, `dashboard/_components/marketing-dashboard.tsx`, `portfolio-tracker/[projectId]/_generic-phase-view.tsx`, `_generic-swimlane.tsx`, `_onboarding-detail.tsx` — external link repoints

### Deviations From Plan

- **Discovered and fixed 43 broken cross-folder imports the task doc didn't anticipate.** The plan's file-change table covered route *strings* but not the fact that `projects-v2/_shared/**` and `projects-v2/{v2,legacy}/[projectId]/**` imported shared types/helpers (`_pm-shared.tsx`, `_project-access.ts`) from the old `/projects` folder via the path alias `@/app/(hub)/projects/_pm-shared` — a reference that resolved correctly before the rename (when `/projects/` meant the old module) but silently pointed at the wrong (new, now-missing-that-file) folder afterward. Also found and fixed 2 more outside the `projects/` tree entirely: `timer-floating-widget.tsx` (global component) and `dashboard/page.tsx` (relative import). All fixed by repointing to `@/app/(hub)/projects-old/...`. `npx tsc --noEmit` initially caught the `_project-detail.tsx` and `dashboard/page.tsx` cases directly; the rest were found by a proactive repo-wide grep for `@/app/(hub)/projects/` before running tsc, since a stale `.next/types/validator.ts` was also throwing unrelated errors that needed `rm -rf .next` to clear first.
- **`_listing-shell.tsx` kept as a new filename rather than reusing `_projects-v2-shell.tsx`** — the task doc offered either as acceptable ("or keep filename, mover's choice"); chose the rename since the old name is misleading post-rename and the file's props changed shape anyway.
- **DndContext's `id` prop renamed from `"projects-v2-tab-order"` to `"projects-tab-order"`** (cosmetic dnd-kit internal id, not the localStorage key) — not explicitly called out in the plan but harmless and consistent with the rest of the cleanup; the actual `localStorage` key (`"projects-v2-tab-order"`) was left untouched exactly as the task doc required.
- No other deviations — file structure, constant names, and behavior match the plan.

### Verification Run

- `npx tsc --noEmit` — PASS (0 errors, after clearing a stale `.next/types` build artifact that was reporting unrelated errors from the pre-rename route structure)
- `pnpm lint` — PASS (0 errors; 4 pre-existing warnings in `onboarding-workspace/_checklist-tab.tsx`, inherited unchanged from task 276's verbatim port, present in both the `portfolio-tracker` original and the `projects/v2` copy)
- `pnpm build` (with the required `--webpack` flag baked into the script) — PASS, 0 errors; confirmed every route in the new tree compiled and appears in the route manifest: `/projects`, `/projects/v2`, `/projects/v2/[projectId]` (+ all 8 sub-tabs incl. `onboarding-workspace`), `/projects/legacy`, `/projects/legacy/[projectId]` (+ all 8 sub-tabs), `/projects-old`, `/projects-old/[projectId]` (+ its sub-tabs)
- `pnpm dev` + `curl` — PASS for the auth-guard smoke test: `/projects`, `/projects/v2`, `/projects/legacy`, `/projects-old`, and several `[projectId]` sub-routes all returned clean `307` redirects to `/auth/login?returnTo=...` with the correct encoded path, confirming no 500s and that the (hub) route group's auth guard covers every new/renamed route
- `grep -rn "projects-v2" src` — PASS, zero functional hits (only the intentionally-preserved `localStorage` key and 2 historical "was `/projects-v2?tab=`" comments remain)
- **Interactive/authenticated browser testing — NOT COMPLETED**, same limitation task 276 documented: no test-user credentials available in this sandbox to log in and exercise the sidebar's expand/collapse, the drag-reorder-then-reload persistence, both listings' filters, and all detail-page tabs end-to-end. Per CLAUDE.md's browser-testing requirement, a manual authenticated pass is still needed before this can be called fully verified — recommended before merge: log in, expand/collapse "Projects" in the sidebar, visit bare `/projects` fresh and after reordering the pills, walk both listing tabs, open a V2 and a Legacy project detail (all tabs), confirm `/projects-old` still works when visited directly, and click through the Customers "view projects" link, both dashboards' "Projects" card, and one Tracker deliverable's Tasks/Milestones link.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Hand-written/rewritten files (`constants.ts`, `v2-hub-sidebar.tsx`, `_listing-shell.tsx`, `page.tsx`, `v2/page.tsx`, `legacy/page.tsx`, the `_delete-project-action.tsx`/`_project-detail.tsx` import fixes) reviewed directly; the ~150 mechanically-swept files were spot-checked and additionally validated by a clean `tsc --noEmit`, `pnpm lint`, and full `pnpm build` (which forces compilation of every route, including ones the auth-guard smoke test alone wouldn't reach).
- No unused code, dead imports, or commented-out implementation — `LayoutGrid` was removed from `v2-hub-sidebar.tsx` once its only use (the old "Projects V2" icon) was dropped; `ChevronDown` added and used. `pnpm lint` (which fails on unused vars in this project) is clean.
- No new `any`/untyped escape hatches introduced.
- Naming is clear and behavior-accurate (`hasChildren`, `childActive`, `isExpanded`, `PROJECTS_LEGACY`, `ListingShell`).
- No secrets, credentials, or debug logging introduced.
- Project conventions followed: `mv` used for folder renames (never `git mv`, per CLAUDE.md's no-git-commands rule); sidebar kept its pre-existing inline-style pattern rather than introducing the `isDark`-prop/`cn()` pattern used elsewhere in `v2/`, since that file predates that convention and mixing patterns within one file would be worse than following the file's own established one; page-scoped listing pages stayed as single files rather than being split, matching "inline small components into the page file" guidance.

### Deviations
- **Minor** — `v2-hub-sidebar.tsx` grew to 372 lines (`nextjs-file-length-best-practices.md`'s soft warning is ~250-300). The growth is inherent to adding a second render branch (parent-with-children) to an existing single-file sidebar component; splitting it would cut against CLAUDE.md's "page-scoped UI, inline small components" convention for a component that isn't shared elsewhere. Not blocking.
- **Minor** — the parent-with-children button's hover/active styling logic duplicates the pre-existing leaf-button block (and the new child-button block duplicates a third, smaller variant of the same pattern) rather than being extracted into a shared helper. Matches the file's existing non-abstracted style (every nav item already inlined the same hover handlers before this change); introducing a shared helper now would touch more of the file than the task required. Not blocking.
- **Minor** — the "Projects" parent item's `active` computation includes an explicit `childActive` check that's technically redundant with the existing `pathname.startsWith(item.href + "/")` branch (since both children's paths already start with `/projects/`). Harmless belt-and-suspenders, kept for readability/robustness against a future child route that might not nest under the parent path. Not blocking.
- **Minor (pre-existing, not introduced by this task)** — `projects/_shared/*` files import shared types/helpers from `projects-old/_pm-shared.tsx` and `projects-old/_project-access.ts`. This cross-tree dependency was task 276's original design (reuse rather than duplicate); this task only had to keep those references pointing at the correct post-rename location. Worth flagging for whoever eventually retires `/projects-old`: those two files will need to move or be duplicated first. Noted for awareness, not a defect in this task.
- **Medium, documented and accepted** — scope necessarily expanded beyond the task doc's file list to fix 43 broken imports the rename silently caused (`_pm-shared`/`_project-access` absolute-path imports across the `projects/` tree, plus `timer-floating-widget.tsx` and `dashboard/page.tsx` outside it). This is exactly the "missing dependency blocks implementation" case the `implement` skill's reading rules anticipate, already fully documented in the task doc's own "Deviations From Plan" section with the fix pattern and file counts. Verified complete via a repo-wide `grep` for the broken import pattern (zero remaining hits) and a clean full `pnpm build`.

### Required Fixes
- None.

## Post-Implementation Follow-Up (Same Session)

After the quality gate passed, the user iterated conversationally on the shipped `/projects` header/UX through several small, tightly-scoped requests. Handled as direct follow-up implementation (not separate task docs) since each was a small refinement building directly on this task's own output. Documented together here for a complete record.

### What Changed

1. **Sidebar expand/collapse animation** — `v2-hub-sidebar.tsx`'s "Projects" children (V2 Projects / Legacy Projects) now animate open/closed via `framer-motion` (`AnimatePresence` + height/opacity `motion.div`, 0.18s easeOut, `overflow-hidden`) instead of an instant conditional render. Matches this codebase's existing `AccordionCard`/`_collapsible-section.tsx` convention exactly. Respects `prefers-reduced-motion` via `useReducedMotion()`.
2. **Listing header redesign** — replaced the draggable two-pill "V2 Projects"/"Legacy Projects" tab strip with a compact tone-coded badge next to the "Projects" title (showing the *current* tab) plus a single right-aligned control that switches to the *other* tab. Rationale: with only two tabs, "current state (badge) + one action (switch)" reads clearer than two always-visible pills that needed drag-to-reorder.
   - `_listing-shell.tsx` rewritten: removed all `@dnd-kit` wiring (`DndContext`/`SortableContext`/`useSortable`/`arrayMove`) since there's no longer a multi-item list to reorder.
   - `_use-tab-order.ts` (2-tab drag-order array) deleted; replaced by `_use-last-tab.ts` (single "last visited tab" value, same `localStorage` key preserved). `projects/page.tsx`'s bare-path redirect updated to use it.
   - Switch control implemented as a `<Link>` (not `<button onClick={router.push}>`) styled as a bordered pill — matches this codebase's own convention for identical cases ("Status Report"/"Import Project" in the V2 header are `<Link>`s styled as pills) and preserves native link behavior (cmd/ctrl-click new tab, prefetch, right-click menu) that a button loses. Confirmed with the user as the better choice over a borderless/plain-text-link alternative — the bordered pill gives clear affordance for the sole remaining interactive element in that row and contrasts correctly against the now-passive badge.
   - Badge tone: V2 = blue, Legacy = purple (both reusing literal hex values from this codebase's existing `Chip` design-system palette in `dashboard-shared.tsx` — "migrate" and "publish" tones — re-implemented locally with light/dark variants rather than importing `Chip` directly, since that component has no dark-mode variant and this shell is `isDark`-aware). Legacy was originally styled gray, but on the dark theme that read as low-contrast gray-on-near-black against the already-dark page background; purple was chosen as a clearly distinct, non-alarming alternative (avoided amber/red tones that could misread as a warning).
   - Removed double vertical padding between the shell's title row and each listing's own header below it (shell had `pb-4`, each listing's sticky header opened with `pt-6` — stacked to a 40px gap). Shell's bottom padding removed entirely; the listing's `pt-6` is now the sole source of that spacing.
3. **Removed duplicate page titles** — `_legacy-listing/_projects-index.tsx`'s own `<h1>Projects</h1>` and `_v2-listing/_onboarding-list.tsx`'s own `<h1>Portfolio Tracker</h1>` removed (redundant now that the shell already shows "Projects" above). Each listing's action buttons in that row (New Project, Status Report, Import Project) were preserved.
4. **Count line now carries a description** — each listing's `{total} projects` line was extended to `{total} projects · {short description}`, describing the real distinction between the two: V2 = "Current classifications: StackShift I/II, Access, Access Plus & Discrete Development — succeeding Legacy's original StackShift"; Legacy = "Original StackShift & Discrete Development — predate onboarding and the 120-day timeline". Iterated twice on wording per user feedback (first pass over-claimed that *all* V2 project types go through the 120-day onboarding programme, which isn't universally true — generalized to describe the classification list without that claim).
5. **Legacy tab: removed "New Project," added a pointer to V2** — the Legacy listing no longer has its own "New Project" button (new projects are only created going forward in V2). In its place, an `Info` icon (still gated to users who could previously create projects) opens a hover tooltip: *"New projects are now created in **V2 Projects**."*, with "V2 Projects" hyperlinked to the creation flow. The now-dead `showCreate` state, `CreateProjectModal` import/render, and the now-fully-orphaned `_legacy-listing/_create-project-modal.tsx` file were removed. Fixed a follow-up alignment bug: `TooltipContent`'s base class is `inline-flex items-center`, so the message text and the inline `<Link>` were rendering as separate flex items instead of wrapping as one line — fixed by wrapping the whole message in a single `<span>` and switching to `items-start`.
6. **Moved the "New Project" route** — `/portfolio-tracker/new` moved to `/projects/v2/new` (`V2_ROUTES.PORTFOLIO_TRACKER_NEW` removed, `PROJECTS_V2_NEW` added). All 3 consumers repointed (V2 listing, Legacy listing's new tooltip link, and Portfolio Tracker's own "+ New Project" link — the old Tracker module's own creation entry point now also lands on the same unified flow). Since the flow now lives under `/projects/v2`, its internal navigation was updated to match: the auth-guard's unauthorized-role redirect, the wizard's "back" button, and the post-creation success screen's "back"/"view project" links now target `/projects/v2` and `/projects/v2/[projectId]` instead of the old `/portfolio-tracker` equivalents.

### Files Changed (this follow-up)

- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — framer-motion expand/collapse
- `src/app/(hub)/projects/_listing-shell.tsx` — full header redesign (badge + switch link, dnd-kit removed, spacing fix)
- `src/app/(hub)/projects/_use-last-tab.ts` — new, replaces deleted `_use-tab-order.ts`
- `src/app/(hub)/projects/page.tsx` — updated to `useLastTab()`
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` — title removed, description rewritten, New Project link repointed
- `src/app/(hub)/projects/_legacy-listing/_projects-index.tsx` — title + New Project button removed, Info/tooltip added, description rewritten, link repointed
- `src/app/(hub)/projects/_legacy-listing/_create-project-modal.tsx` — deleted (orphaned)
- `src/config/constants.ts` — `PORTFOLIO_TRACKER_NEW` removed, `PROJECTS_V2_NEW` added
- `src/app/(hub)/portfolio-tracker/new/` → moved to `src/app/(hub)/projects/v2/new/`
- `src/app/(hub)/projects/v2/new/page.tsx`, `_content.tsx` — internal nav targets repointed to `/projects/v2`
- `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx` — own "+ New Project" link repointed
- `src/app/(hub)/projects/_shared/_datetime-field-picker.tsx`, `src/app/(hub)/projects-old/[projectId]/_datetime-field-picker.tsx` — stale comment paths updated

### Note on Acceptance Criteria Supersession

Two bullets in this task doc's original Acceptance Criteria no longer apply as literally stated, superseded by the header redesign above:
- *"Dragging 'Legacy Projects' before 'V2 Projects' reorders the tab strip and persists across a page reload"* — the draggable two-pill strip was replaced entirely by the badge + single switch link design (see above); there is nothing left to drag-reorder.
- Any acceptance-criteria mention of both pills being simultaneously visible — only one control (the switch link) is visible at a time now, by design.

All other acceptance criteria from the original implementation still hold.

### Verification Run (this follow-up)

- `npx tsc --noEmit` — PASS (0 errors) after every step in this follow-up.
- `pnpm lint` — PASS throughout (0 errors; same 4 pre-existing baseline warnings in `_checklist-tab.tsx`, unrelated to this work).
- `pnpm build` (full production build, `--webpack` flag) — run 3 times across this follow-up (after the header redesign, after the route move, and not re-run after the final spacing/color tweaks since those were CSS-class-only changes already covered by a clean `tsc`/`lint` pass) — PASS each time, 0 errors; confirmed `/projects/v2/new` compiles at its new path and `/portfolio-tracker/new` no longer exists in the route manifest.
- **Interactive/authenticated browser testing — still NOT COMPLETED**, same sandbox limitation noted in the original Implementation Notes above (no test-user credentials available to log in). All UI decisions in this follow-up were verified from the user's own screenshots taken against a running instance, not from this sandbox. A manual authenticated pass covering the redesigned header (badge colors in both themes, switch link, tooltip, animation, spacing) and the moved `/projects/v2/new` route is still recommended before considering this fully verified end-to-end.
