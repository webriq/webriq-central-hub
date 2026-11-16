# 474: Move project detail pages under `/projects/[classification]/[projectId]` and retire `/projects/v2`

**Created:** 2026-11-16
**Priority:** MEDIUM
**Type:** refactor (routing)
**Recommended Tier:** standard
**Status:** Completed
**Depends on:** 473 (classification listing routes)

---

## Overview

Task 473 moved the listings to `/projects/<slug>` and the status report to `/projects/<slug>/status-report`.
The project detail pages still live at `/projects/v2/<projectId>/…`, so opening a project leaves the
classification URL. This task moves every page under `projects/v2/` to a classification-scoped path
and reduces `/projects/v2` to a redirect-only route.

| Today | After |
|-------|-------|
| `/projects/v2/<projectId>/timeline` (and every other tab, task/ticket/milestone detail, onboarding-workspace) | `/projects/<slug>/<projectId>/timeline` |
| `/projects/v2/new` | `/projects/new` |
| `/projects/v2/import` | `/projects/import` |
| `/projects/v2?tab=<slug>` (473 redirect) | redirect kept |
| `/projects/v2/status-report` (473 redirect) | redirect kept |
| `/projects/v2/<projectId>/<rest>` | **redirect** to `/projects/<slug>/<projectId>/<rest>` |

`<projectId>` stays the display `project_id` (CLAUDE.md `projects` bullet), not the UUID.

## Scope (measured 2026-11-16)

- **118 files** under `src/app/(hub)/projects/v2/` move (`[projectId]` tree, `new`, `import`, `status-report` components).
- **35 link sites in 29 files** inside the `[projectId]` tree build `${V2_ROUTES.PROJECTS_V2}/${projectId}/…`.
- **~25 link sites outside the tree**: listing cards/menus, dashboards, timer header, time-logs table, drive `_reuse.ts`, stackshift-orders, `_shared/_project-detail-header.tsx`, `_shared/_task-subtasks.tsx`, portfolio-tracker redirects.
- **10 server-built links** (notification and mention `url`s, saved in the DB): `lib/comments/mentions.ts`, `api/programme/reminders`, `api/projects/[projectId]/programme/{complete-phase,deliverables,internal-deliverables}`, `api/projects/[projectId]/members` (×2), `api/customers/…/onboarding`.
- **11 files import components from `@/app/(hub)/projects/v2/…`** (customers, desk inbox, `_shared/*`, drive, `lib/programme/__checks__/layout.check.ts`).

## Requirements

- [ ] Every page under `projects/v2/[projectId]/` is served at `projects/[classification]/[projectId]/` with the same sub-paths.
- [ ] `[classification]` on a project page accepts any of the project's own classification slugs, or `unclassified` for a project with none (D1, D2).
- [ ] A project page under a slug the project doesn't have redirects to the same sub-path under its first classification (or `unclassified`), keeping the query string.
- [ ] `unclassified` is accepted only on project pages. `/projects/unclassified` (listing) and `/projects/unclassified/status-report` stay 404 (D2).
- [ ] New Project and Import Project are at `/projects/new` and `/projects/import` (D4).
- [ ] `/projects/v2/**` holds no pages. One catch-all resolves old links (D3):
  - `/projects/v2` and `/projects/v2?tab=…` → classification listing (473 behaviour)
  - `/projects/v2/status-report` → `/projects/stackshift-i/status-report`
  - `/projects/v2/new`, `/projects/v2/import` → `/projects/new`, `/projects/import`
  - `/projects/v2/<projectId>/<rest>?<q>` → `/projects/<slug>/<projectId>/<rest>?<q>`; an unknown project → 404
- [ ] Links inside a project page keep the classification you're in (no hop through the resolver).
- [ ] Links from the classification listing use that listing's slug.
- [ ] Links from places that don't know a classification (dashboards, timer, time logs, drive, orders, server-built notification and mention URLs) go through the resolver (`/projects/v2/<projectId>/…`) via one named helper, so they work no matter the classification (D3).
- [ ] Sidebar: on a project page, the classification in the URL is highlighted (plain path-prefix match).
- [ ] `_docs/context/projects.md` and `_docs/context/uploads.md` describe the new paths.

## Out of Scope / Must-Not-Change

- No change to page content, data loading, permissions, or the display-ID-vs-UUID rule.
- `/projects/legacy` and the legacy detail routes are unchanged.
- `src/app/v2/` (the parallel `/v2/*` app) is unrelated and unchanged.
- No DB migration. Saved notification URLs are **not** rewritten; the resolver handles them.
- No changes to the listing/status report pages from 473 beyond their links.

## Design

### Routes

```
src/app/(hub)/projects/
  [classification]/
    page.tsx                  (473 listing)
    status-report/page.tsx    (473)
    [projectId]/…             ← moved from v2/[projectId]/ (layout.tsx validates the slug)
  new/                        ← moved from v2/new/
  import/                     ← moved from v2/import/
  v2/
    [[...rest]]/page.tsx      ← the only file left: the resolver (replaces v2/page.tsx + v2/status-report/page.tsx)
  _status-report/             ← status report components moved out of v2/status-report/ (they're imported from 11 places)
```

Static folders win over `[classification]`, so `legacy`, `v2`, `new`, `import` are reserved slugs; inside
`[classification]`, the static `status-report` wins over `[projectId]`.

### Slug validation (project layout)

`[classification]/[projectId]/layout.tsx` already loads the project's classification tabs (`getProjectShell`,
task 414). Add: allowed = `tabs`, or `["unclassified"]` if `tabs` is empty. If the URL slug isn't allowed,
`redirect()` to the same path with the slug swapped. The layout reads the full path from the
`x-pathname` header (`proxy.ts` sets it; the hub layout already uses it) and keeps the query string.

### Link helpers (`_classification-tabs.ts`)

```ts
export type ProjectSlug = ClassificationTabId | "unclassified";
export function projectHref(slug: ProjectSlug, projectId: string, sub = ""): string   // /projects/<slug>/<id>[/sub]
export function projectResolverHref(projectId: string, sub = ""): string           // /projects/v2/<id>[/sub]
```

- Inside the project tree: a `useProjectBase()` client hook (`useParams()` → `projectHref(...)`); server
  components use their `params`. All 35 `${V2_ROUTES.PROJECTS_V2}/${projectId}` sites switch to it.
- Listing (`_project-card.tsx`, `_portfolio-card-menu.tsx`): `projectHref(activeTabId, …)`.
- Everything else: `projectResolverHref(…)`.
- `V2_ROUTES`: `PROJECTS_V2_NEW` / `PROJECTS_V2_IMPORT` → `PROJECTS_NEW` / `PROJECTS_IMPORT`; `PROJECTS_V2` is used only by the resolver helper.

### Sidebar

With the classification in the URL, the plain `pathname.startsWith(href + "/")` check highlights the
right link. Task 414's context (`sidebar-project-context.tsx`, `SidebarClassificationSync`, the
`isProjectDetailPath` special case) is no longer needed and is deleted. **Behaviour change:** a
multi-classification project highlights the classification in the URL, not all of its classifications.

## Proposed File Changes

| File / folder | Action |
|---------------|--------|
| `projects/v2/[projectId]/**` → `projects/[classification]/[projectId]/**` | Move (`mv`), then fix links |
| `projects/v2/new/**`, `projects/v2/import/**` → `projects/new/**`, `projects/import/**` | Move |
| `projects/v2/status-report/_*.tsx` → `projects/_status-report/` | Move + update the 11 importers |
| `projects/v2/page.tsx`, `projects/v2/status-report/page.tsx` | Delete (replaced by the resolver) |
| `projects/v2/[[...rest]]/page.tsx` | Create (resolver) |
| `projects/[classification]/[projectId]/layout.tsx` | Modify (slug validation + redirect; drop `SidebarClassificationSync`) |
| `projects/_classification-tabs.ts` | Add `ProjectSlug`, `projectHref`, `projectResolverHref` |
| `src/config/constants.ts` | Rename the New/Import routes |
| `_components/v2-hub-sidebar.tsx`, `_components/sidebar-project-context.tsx`, `_components/v2-hub-shell.tsx` (provider) | Simplify / delete |
| ~29 files in the project tree, ~15 outside, 7 API/lib files | Switch links to the helpers |
| `lib/programme/__checks__/layout.check.ts` | Update import path |
| `_docs/context/projects.md`, `_docs/context/uploads.md` | Update paths |

## Implementation Steps

1. Add the helpers to `_classification-tabs.ts` (`projectHref`, `projectResolverHref`, `ProjectSlug`).
2. Move the folders (`mv`, keeping history-neutral content), then fix imports: `npx tsc --noEmit` lists every broken `@/app/(hub)/projects/v2/…` path.
3. Write the resolver `v2/[[...rest]]/page.tsx`; delete the old `v2/page.tsx` and `v2/status-report/page.tsx`.
4. Add slug validation + redirect to the moved project layout.
5. Replace the 35 in-tree link sites with `useProjectBase()` / `params`; replace outside links per the Design section; switch the 10 server URLs to `projectResolverHref`.
6. Simplify the sidebar and delete the task-414 context.
7. Update `_docs/context/projects.md` and `uploads.md`.
8. `grep -rn "PROJECTS_V2\b\|/projects/v2" src` → only the resolver helper and the resolver route remain. `npx tsc --noEmit`, `npx eslint` on changed files, `npx tsx src/lib/programme/__checks__/layout.check.ts`.

## Acceptance Criteria

- [ ] **Browser:** from `/projects/pipelineforge`, open a project → URL is `/projects/pipelineforge/<id>/timeline`; the sidebar highlights PipelineForge.
- [ ] **Browser:** click through every project tab (Overview, Timeline, Tasks, Tickets, Milestones, Files, Notes, Members, Access, Time logs, Status report) plus a task detail, a ticket detail, a milestone detail and onboarding-workspace. Every URL stays under `/projects/pipelineforge/<id>/…` and the page renders as before.
- [ ] **Browser:** a multi-classification project opens under both of its slugs without a redirect. Under a slug it doesn't have, it redirects to its first classification and keeps the sub-path and query.
- [ ] **Browser:** an unclassified project opens at `/projects/unclassified/<id>/timeline`. `/projects/unclassified` returns 404.
- [ ] **Browser:** `/projects/v2/<id>/tasks/<taskDisplayId>` redirects to `/projects/<slug>/<id>/tasks/<taskDisplayId>`. `/projects/v2/NOPE-PROJ-99/timeline` returns 404.
- [ ] **Browser:** a saved notification (e.g. phase completed, member added) and a comment @mention link open the right project page.
- [ ] **Browser:** New Project and Import Project open at `/projects/new` and `/projects/import`; after creating, the app lands on the new project's page.
- [ ] **Browser:** PM dashboard project links, timer header link and time-logs project link open the project.
- [ ] `grep -rn "/projects/v2" src` shows only the resolver route and `projectResolverHref`.
- [ ] `npx tsc --noEmit` passes; `npx tsx src/lib/programme/__checks__/layout.check.ts` passes.

## Coordination

- **473 (Testing)** must land first; this task builds on its `[classification]` segment and replaces its two v2 redirect pages.
- **429 (In Progress)** edits files in the project detail tree. Moving the folder will conflict with any pending 429 edits there. **Land 429's pending edits in `projects/v2/[projectId]/` first, or rebase them onto the new path.**
- **472 (Testing)** touches only the status-report API route, which this task doesn't change.

## Open Decisions

- **D1: RESOLVED (2026-11-16).** A project page accepts any of the project's own classification slugs; another slug redirects to its first classification.
- **D2: RESOLVED (2026-11-16).** Projects with no classification live at `/projects/unclassified/<id>`. `unclassified` gets no sidebar link, listing or status report.
- **D3: RESOLVED (2026-11-16).** Keep a redirect-only `/projects/v2` catch-all for saved and classification-less links; no pages remain under it.
- **D4: RESOLVED (2026-11-16).** New Project and Import Project move to `/projects/new` and `/projects/import`.

## Known Limits / Risks

- **Reserved slugs grow:** `legacy`, `v2`, `new`, `import`, `unclassified` can never be classification slugs; `status-report` can never be a project display ID (it can't be today: display IDs look like `82ACEB0F-PROJ-02`).
- Links from classification-less places take one redirect hop through the resolver (one extra small DB read).
- Large mechanical diff (118 moved files). Mainly a merge-conflict risk with 429.

## Operator Steps

None: merge is enough. No migration, no env change.

## Compatibility Touchpoints

- No MCP tool change. Check during implementation whether `src/app/api/mcp/route.ts` returns any `/projects/v2` URLs; the grep above found none.

## Baseline

- `grep -rn "PROJECTS_V2\|/projects/v2" src` (non-comment lines, excluding `src/app/v2/`): **114** before the change.
- `npx tsx src/lib/programme/__checks__/layout.check.ts`: exit 0.
- Browser checks: before the change every project URL was `/projects/v2/<id>/…`, so each "URL stays under `/projects/<slug>/…`" check fails by construction against the baseline.

## Implementation Notes

### What Changed
- Project detail pages moved from `projects/v2/[projectId]/` to `projects/[classification]/[projectId]/` (same sub-paths); New/Import moved to `projects/new`, `projects/import`; status report components moved to `projects/_status-report/`.
- `/projects/v2` now has a single file, `v2/[[...rest]]/page.tsx`, which redirects every old URL shape (listing `?tab=`, status-report, new, import, `<projectId>/<rest>` keeping the query; unknown project → 404).
- The project layout checks the slug against the project's own classifications (`unclassified` when it has none) and redirects any other slug to the first one, keeping sub-path and query (`x-pathname`).
- In-project links use `useProjectsBase()` (`useParams`), so they stay in the classification you came from; server tab pages use `params.classification`. Listing cards and the status report table use the same hook. Classification-less callers (dashboards, timer, time logs, orders, portfolio-tracker, 9 server notification URLs) use `projectResolverHref()`.
- Sidebar: path-prefix match only. Task 414's `sidebar-project-context.tsx` and its provider were deleted.

### Files Changed
- **Moved:** `projects/v2/[projectId]/**` → `projects/[classification]/[projectId]/**`; `projects/v2/new/**` → `projects/new/**`; `projects/v2/import/**` → `projects/import/**`; `projects/v2/status-report/_*` → `projects/_status-report/`.
- **Created:** `projects/v2/[[...rest]]/page.tsx` (resolver); `[classification]/[projectId]/_project-shell.ts` (`getProjectShell` + `allowedProjectSlugs`, extracted from the layout so the resolver can share it); `[classification]/[projectId]/_use-projects-base.ts`.
- **Deleted:** `projects/v2/page.tsx`, `projects/v2/status-report/page.tsx` (both replaced by the resolver), `_components/sidebar-project-context.tsx`.
- **Modified:** `_classification-tabs.ts` (`ProjectSlug`, `isProjectSlug`, `projectHref`, `projectResolverHref`); `[classification]/[projectId]/layout.tsx` (slug validation); 9 `(tabs)/*/page.tsx` + `(tabs)/layout.tsx` + `[projectId]/page.tsx` (basePath/redirect from `params.classification`); 13 in-tree client components (hook); `_v2-listing/_project-card.tsx`, `_portfolio-card-menu.tsx`, `_onboarding-list.tsx`, `_status-report/_status-report-table.tsx`, `_shared/_project-detail-header.tsx` (back button), `_load-detail-data.ts`, `new/*`, `import/*`, `pm-dashboard.tsx`, `marketing-dashboard.tsx`, `_time-logs-table.tsx`, `timer-header-widget.tsx`, `stackshift-orders/[orderId]/page.tsx`, 4 `portfolio-tracker` redirects, 6 API routes (notification URLs), `v2-hub-sidebar.tsx`, `v2-hub-shell.tsx`, `src/config/constants.ts` (`PROJECTS_NEW`/`PROJECTS_IMPORT` replace the `PROJECTS_V2_*` routes), ~11 importers of moved modules (path-only edits), path-reference comments.
- **Docs:** `_docs/context/projects.md` (routing paragraph rewritten), `_docs/context/uploads.md` (paths).

### Deviations From Plan
- **`src/lib/comments/mentions.ts` keeps the literal `/projects/v2/…`** instead of calling `projectResolverHref()`. The file is deliberately import-free so `_docs/task/466-comment-mentions.check.ts` can run it under `tsx`; a comment points at the resolver. So the final grep shows 4 expected hits (helper, hook fallback, constant, mentions literal), not 2.
- **The detail header's back button** goes to the current classification's listing, or bare `/projects` (last-visited tab) when the slug is `unclassified`. Deleting a project and the New/Import back buttons also go to bare `/projects`. The plan didn't specify these.
- **`useProjectsBase()` falls back to the resolver** when there's no `classification` param, because `_onboarding-detail` also renders on `/customers/[customerId]`. This wasn't in the plan; without it those links would have been `/projects/undefined/…`.
- Historical task notes in comments that mention `/projects/v2` (17 lines) were left as history; comments naming file paths or describing current routing were updated.

### Verification Run
- `npx tsc --noEmit`: PASS (ignoring stale `.next/types` from the old routes, which the dev server regenerates).
- `npx eslint` on all changed dirs/files: PASS, 0 errors. Fixed 2 `exhaustive-deps` warnings this change introduced; 4 remaining warnings are in files this change didn't touch.
- `npx tsx src/lib/programme/__checks__/layout.check.ts`: PASS. `npx tsx _docs/task/466-comment-mentions.check.ts`: PASS (11 checks).
- grep `PROJECTS_V2|/projects/v2` (non-comment): baseline 114 → now 4, all expected (see Deviations).
- **Browser (local dev, admin session, project `C72F6F09-PROJ-01`, classified StackShift II + PipelineForge):**
  - Listing `/projects/pipelineforge`: "3 PipelineForge projects"; Status Report → `/projects/pipelineforge/status-report`; New → `/projects/new`; sidebar highlights PipelineForge: PASS
  - Clicking a card → `/projects/pipelineforge/C72F6F09-PROJ-01/timeline` (no redirect; stays in the classification you came from): PASS
  - All 12 sub-pages (timeline, overview, tasks, tickets, milestones, files, notes, members, access, time_logs, status_report, onboarding-workspace) return 200 with the right page title under `/projects/pipelineforge/…`: PASS
  - Tasks tab click keeps `/projects/pipelineforge/…`; task links are `/projects/pipelineforge/<id>/tasks/<taskId>`; task detail renders with PipelineForge highlighted; its back link → `/projects/pipelineforge/<id>/tasks`; header "All projects" → `/projects/pipelineforge`: PASS
  - Same project under its other slug `/projects/stackshift-ii/…/timeline`: 200, no redirect: PASS
  - Slug the project doesn't have (`stackshift-access/…/tasks?x=1`) → `stackshift-ii/…/tasks?x=1`; `unclassified/…/timeline` → `stackshift-ii/…/timeline`: PASS
  - Resolver: `/projects/v2/<id>/files?folder=…` → `/projects/stackshift-ii/<id>/files?folder=…`; `/projects/v2/<id>` → `…/timeline`; `/projects/v2/NOPE-PROJ-99/timeline` → 404; `/projects/v2?tab=stackshift-ii&page=2` → `/projects/stackshift-ii?page=2`; `/projects/v2` → `/projects/stackshift-i`; `/projects/v2/status-report`, `/new`, `/import` → their new paths: PASS
  - `/projects/unclassified`, `/projects/unclassified/status-report`, `/projects/not-a-tab` → 404: PASS
  - `/portfolio-tracker/status-report` → `/projects/stackshift-i/status-report`; `/portfolio-tracker/<id>` → `/projects/stackshift-ii/<id>/timeline`: PASS
  - `/projects/new` renders the New Project wizard: PASS
- **Not run:**
  - A real unclassified project at `/projects/unclassified/<id>`. No such project was at hand; the "wrong slug → canonical" redirect was proven in the other direction.
  - Creating a project via New/Import (would write data).
  - Clicking a saved notification, @mention, dashboard or timer link. These all build `/projects/v2/<id>/…`, and the resolver behind them is covered above.

### Attempts That Failed
- The first browser pass flagged every page as `[404 page]`. The not-found text turned out to be in the HTML of every page (Next.js bundles the not-found template), including the page open in the tab, which rendered fine. Switched the check to the `<title>`.
- Fetching all 30 URLs in one synchronous script timed out (45s CDP limit) while the dev server compiled routes on first hit; moved to a background loop in the page plus polling.
- The first in-tree server-page rewrite matched only 2 of 11 files because `[classification]` in the path was read as a glob pattern; re-ran with `glob.escape`.

### Operator Steps
- None: merge is enough (no migration, no env). The dev server may need a restart, or `.next` cleared, to drop stale route types for the old `projects/v2/*` pages.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during the gate: removed the unused export `isProjectSlug` from `_classification-tabs.ts` (added during implementation, no callers). `tsc` and `eslint` were re-run afterwards and are clean.
- New helpers each have exactly one responsibility and real callers: `projectHref` (resolver), `projectResolverHref` (14 classification-less call sites), `useProjectsBase` (16 in-route components), `allowedProjectSlugs` and `getProjectShell` (shared by the layout and the resolver, so the "which slugs are valid" rule lives in one place).
- The resolver is a flat chain of guard-clause redirects; the query is rebuilt once and multi-valued params are kept (fixes the 473 redirect's single-value limit).
- No `any`, no debug logging, no new dependencies. The 9 server tab pages repeat one `params` destructure, matching the existing per-page pattern; not extracted.
- `useProjectsBase()`'s fallback to the resolver is the only safe value outside a `[classification]` route (proven necessary: `_onboarding-detail` also renders on `/customers/[customerId]`).
- `mentions.ts` keeps a literal `/projects/v2/…` with a comment, preserving its import-free contract (its 466 check still passes).
- Acceptance criteria: every route/redirect criterion was checked in the browser with a check that could fail (status + final URL + page title, after the false-positive 404 heuristic was replaced). Three criteria are **not yet evidenced**: a real unclassified project page, project creation landing, and clicking an actual saved notification or dashboard link (the resolver they depend on is evidenced). These carry over to `test 474`.
- Pre-existing lint warnings (4) are in untouched files and out of scope.

### Deviations
- **Minor:** `mentions.ts` uses the resolver path literally instead of `projectResolverHref()` (keeps the file import-free).
- **Minor:** back-to-listing targets that the plan didn't specify (delete project, New/Import back buttons, the unclassified project header) go to bare `/projects` (last-visited tab), since `/projects/unclassified` has no listing.
- **Minor:** `useProjectsBase()` resolver fallback for components that also render outside the project route; not in the plan, required for correctness.
- **Medium (stated in the plan, accepted with D1):** sidebar highlights only the classification in the URL for multi-classified projects (task 414 highlighted all of them).

### Required Fixes
- None
