# 280: Retire `/portfolio-tracker` — Move Status Report + Import Project to `/projects/v2`, Replace Content with "Moved" Notice

**Created:** 2026-08-20
**Priority:** MEDIUM
**Type:** refactor
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

`/portfolio-tracker`'s listing, project detail, and onboarding-workspace content already have a fully working equivalent at `/projects/v2` (ported by task 276) and `/projects/v2/new` (moved by task 279's follow-up). The two pieces that never got moved are **"Status Report"** (`/portfolio-tracker/status-report` — the portfolio-wide report across all projects, not to be confused with the per-project `[projectId]/status_report` tab that already exists in both `/projects/v2` and `/projects/legacy`) and **"Import Project"** (`/portfolio-tracker/import`). The `/projects/v2` listing page already has "Status Report" and "Import Project" pill links in its header — they just still point at the old `/portfolio-tracker` URLs (`V2_ROUTES.PORTFOLIO_TRACKER_STATUS_REPORT` / `PORTFOLIO_TRACKER_IMPORT`).

This task:
1. Physically moves `status-report/` and `import/` (route + all supporting files) from `/portfolio-tracker` into `/projects/v2`, fixing their internal cross-references.
2. Fixes 5 files **outside** `/portfolio-tracker` that quietly import shared types/components from it (`_status-summary-phase-cards.tsx`, `_status-summary-drawer.tsx`, `_shared/_status-report-tab.tsx`, `_shared/_access-tab.tsx`, `_shared/_files-tab.tsx` — see Code Context) — these must be repointed *before* the old files are deleted, or the build breaks.
3. Repoints every remaining internal app link that targets `V2_ROUTES.PORTFOLIO_TRACKER*` (sidebar, header breadcrumb, both dashboards) to the `/projects/v2` equivalents.
4. Deletes every other file under `/portfolio-tracker` (listing, `[projectId]` detail, `onboarding-workspace` — all superseded), and replaces `/portfolio-tracker/page.tsx`'s content with a centered "this section has moved" notice per the official design system (`_final_design/guide/`). `[projectId]`, `onboarding-workspace`, `status-report`, and `import` become thin server-side redirects to their new `/projects/v2` locations (so existing deep links/bookmarks still resolve) rather than 404s.

Locked-in interpretation of the request (stated here since it shapes scope):
- "Move all the routes... to `/projects/v2`" = the two routes that don't already have a `/projects/v2` equivalent (Status Report, Import Project) get their actual code relocated; the routes that already have an equivalent (listing, detail, onboarding-workspace) just get redirected there instead of duplicated again.
- "Replace the content [with a message]" applies to the **root** `/portfolio-tracker` page only — it has no single unambiguous redirect target (unlike `[projectId]`/`status-report`/`import`, which map 1:1), and the user explicitly wants a visible message there, not a silent redirect.
- Sub-routes (`[projectId]`, `onboarding-workspace`, `status-report`, `import`) redirect server-side rather than also showing the notice, so nobody with an old bookmark/Cliq link/email link hits a dead end — this is what "the routes are moved" means functionally.

## Requirements

- [ ] Create `src/app/(hub)/projects/v2/status-report/` — move all 7 files from `portfolio-tracker/status-report/`, fixing internal imports (see Code Context for exact lines).
- [ ] Create `src/app/(hub)/projects/v2/import/` — move both files from `portfolio-tracker/import/`, fixing the 3 `V2_ROUTES.PORTFOLIO_TRACKER` references (see Code Context).
- [ ] `src/config/constants.ts` — add `PROJECTS_V2_STATUS_REPORT: "/projects/v2/status-report"` and `PROJECTS_V2_IMPORT: "/projects/v2/import"`. Remove `PORTFOLIO_TRACKER_IMPORT` and `PORTFOLIO_TRACKER_STATUS_REPORT` (fully dead once the move + repoints below are done — re-run the grep in Verification to confirm before deleting). Keep bare `PORTFOLIO_TRACKER: "/portfolio-tracker"` defined (the route physically still exists as the redirect/notice section; nothing in code needs to reference the constant anymore, but there's no reason to remove it either).
- [ ] Repoint the 5 outside files that import from `/portfolio-tracker` (Code Context has exact import lines) to the equivalents that already exist inside `/projects/v2`:
  - `_status-summary-phase-cards.tsx`, `_status-summary-drawer.tsx`, `_shared/_status-report-tab.tsx` → new `projects/v2/status-report/*` (moved in this task).
  - `_shared/_access-tab.tsx`, `_shared/_files-tab.tsx` → existing `projects/v2/[projectId]/onboarding-workspace/*` (already an identical, already-ported copy — confirmed byte-for-byte via diff — no new file needed, just repoint the import path).
- [ ] `_v2-listing/_onboarding-list.tsx:170,178` — swap `V2_ROUTES.PORTFOLIO_TRACKER_STATUS_REPORT` → `V2_ROUTES.PROJECTS_V2_STATUS_REPORT`, `PORTFOLIO_TRACKER_IMPORT` → `PROJECTS_V2_IMPORT`.
- [ ] Repoint `V2_ROUTES.PORTFOLIO_TRACKER` deep links to `V2_ROUTES.PROJECTS_V2` (bare or `/${project_id}`, matching each site's existing pattern) in: `pm-dashboard.tsx` (3 sites), `marketing-dashboard.tsx` (1 site).
- [ ] `v2-hub-sidebar.tsx` — remove the standalone "Tracker" nav item entirely (its content now lives under "Projects" → "V2 Projects", which already exists as a sidebar entry per task 279). `ChartGantt` icon import becomes unused if nothing else in the file uses it — remove if so.
- [ ] `v2-hub-header.tsx` — remove the `[V2_ROUTES.PORTFOLIO_TRACKER]: { section: "Work", page: "Portfolio Tracker" }` breadcrumb entry (the page it described no longer shows that content).
- [ ] Delete everything under `portfolio-tracker/` except `page.tsx`, `[projectId]/page.tsx`, `[projectId]/onboarding-workspace/page.tsx`, `status-report/page.tsx`, `import/page.tsx` (all 5 rewritten per below) — i.e. delete `_avatar-stack.tsx`, `_filter-multi-select.tsx`, `_list-skeleton.tsx`, `_load-list-data.ts`, `_onboarding-list.tsx`, `_portfolio-card-menu.tsx`, `_project-card.tsx`, `_sort-select.tsx`, `loading.tsx`, and every other file under `[projectId]/` and `[projectId]/onboarding-workspace/` (their content is superseded by `/projects/v2`'s copies), and every other file under `status-report/`/`import/` (moved in this task).
- [ ] Rewrite `portfolio-tracker/[projectId]/page.tsx` as a server redirect to `${V2_ROUTES.PROJECTS_V2}/${projectId}/timeline` (not the bare `[projectId]` page — task 277 already moved this exact content to a `timeline` tab; the bare `[projectId]` page in `/projects/v2` is now a "coming soon" placeholder), preserving `?phase=&deliverable=` if present.
- [ ] Rewrite `portfolio-tracker/[projectId]/onboarding-workspace/page.tsx` as a server redirect to `${V2_ROUTES.PROJECTS_V2}/${projectId}/onboarding-workspace`, preserving any query params present (`tab`, `parent_folder`, `sub_folder_l1`, etc. — pass the whole search-params object through, don't hand-enumerate keys).
- [ ] Rewrite `portfolio-tracker/status-report/page.tsx` as a server redirect to `V2_ROUTES.PROJECTS_V2_STATUS_REPORT`.
- [ ] Rewrite `portfolio-tracker/import/page.tsx` as a server redirect to `V2_ROUTES.PROJECTS_V2_IMPORT`.
- [ ] Rewrite `portfolio-tracker/page.tsx` as the centered "moved" notice (Server Component, no data fetching, no auth/role branching needed — the `(hub)` layout already gates auth). Delete `loading.tsx` (nothing async left to show a skeleton for).
- [ ] Notice page content (grammar-checked, matches the user's requested message):
  - Heading: "Portfolio Tracker has moved"
  - Body: "This page is now part of **Projects**. Head to **V2 Projects** for the same portfolio view, plus onboarding, milestones, and time tracking in one place." — "V2 Projects" (or "Projects → V2 Projects") is a hyperlink to `V2_ROUTES.PROJECTS_V2`.
  - Secondary line: "Looking for timeline tracking or phase management, like onboarding? Open a project and use its **Timeline** tab."
  - Small, muted deprecation note: "This page will be removed soon."
  - A single primary button/link (blue "navigate" style per the design system — this is a wayfinding action, not a business-critical CTA, so it should not use the orange CTA color reserved for primary actions) to `/projects/v2`.
- [ ] Visual design: centered both axes on the page (full-height flex/grid centering within the `(hub)` content area), matching `_final_design/guide/central-hub-design-system.md` — Space Grotesk for the heading, Inter for body copy, `--ink`/`--body`/`--muted` text tones, `--bg`/`--surface`/`--line` surface tones, `--r-lg` radius on any card/icon container, `lucide-react` icon only (no emoji). Should read as a deliberate, polished empty-state, not a bare error page. Reference `/frontend-design:frontend-design` and `/impeccable:impeccable` guidance during implementation for aesthetic polish (icon treatment, spacing rhythm, hover state on the CTA).

## Out of Scope / Must-Not-Change

- No change to `/projects/v2`'s or `/projects/legacy`'s actual listing/detail/tab behavior — this task only relocates two routes into that tree and fixes the import paths that already pointed at soon-to-be-deleted files.
- No change to `/projects-old` (untouched by task 279, untouched here).
- Do not change `role-access.ts` — both old and new paths stay default-allow fallthrough.
- Do not add a client-side or automatic redirect on the root `/portfolio-tracker` page — the user explicitly wants the message shown there, not a silent bounce.
- Do not rename or restructure `/projects/v2/[projectId]/onboarding-workspace/*` — it's reused as-is by the redirect; nothing there changes.
- Do not touch the `_status-report-types.ts` data shape, the status-report Supabase query logic, or the import wizard's parsing/validation logic — pure file relocation + import-path fixes for those two features, no behavior change.

## Proposed File Changes

| File / Path | Action | Purpose |
|---|---|---|
| `src/config/constants.ts` | Modify | Add `PROJECTS_V2_STATUS_REPORT`, `PROJECTS_V2_IMPORT`; remove `PORTFOLIO_TRACKER_IMPORT`, `PORTFOLIO_TRACKER_STATUS_REPORT` |
| `src/app/(hub)/portfolio-tracker/status-report/*` → `src/app/(hub)/projects/v2/status-report/*` | Move (7 files) | Relocate Overall Status Report; fix 4 internal reference fixes (see Code Context) |
| `src/app/(hub)/portfolio-tracker/import/*` → `src/app/(hub)/projects/v2/import/*` | Move (2 files) | Relocate Import Project; fix 3 `PORTFOLIO_TRACKER` references |
| `src/app/(hub)/projects/v2/[projectId]/_status-summary-phase-cards.tsx` | Modify | Repoint 3 imports to new `../../status-report/*` location |
| `src/app/(hub)/projects/v2/[projectId]/_status-summary-drawer.tsx` | Modify | Repoint 2 imports to new `../../status-report/*` location |
| `src/app/(hub)/projects/_shared/_status-report-tab.tsx` | Modify | Repoint 2 imports to new `v2/status-report/*` location |
| `src/app/(hub)/projects/_shared/_access-tab.tsx` | Modify | Repoint 2 imports to existing `v2/[projectId]/onboarding-workspace/*` |
| `src/app/(hub)/projects/_shared/_files-tab.tsx` | Modify | Repoint 3 imports to existing `v2/[projectId]/onboarding-workspace/*` |
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Modify | Lines 170, 178 — constant swap |
| `src/app/(hub)/dashboard/_components/pm-dashboard.tsx` | Modify | 3 sites — `PORTFOLIO_TRACKER` → `PROJECTS_V2` |
| `src/app/(hub)/dashboard/_components/marketing-dashboard.tsx` | Modify | 1 site — `PORTFOLIO_TRACKER` → `PROJECTS_V2` |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Remove "Tracker" nav item; drop now-unused `ChartGantt` import if applicable |
| `src/app/(hub)/_components/v2-hub-header.tsx` | Modify | Remove `PORTFOLIO_TRACKER` breadcrumb entry |
| `src/app/(hub)/portfolio-tracker/page.tsx` | Rewrite | Centered "moved" notice, no data fetching |
| `src/app/(hub)/portfolio-tracker/loading.tsx` | Delete | No longer needed |
| `src/app/(hub)/portfolio-tracker/[projectId]/page.tsx` | Rewrite | Redirect to `/projects/v2/[projectId]/timeline` (preserve `?phase=&deliverable=`) |
| `src/app/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/page.tsx` | Rewrite | Redirect to `/projects/v2/[projectId]/onboarding-workspace` (preserve all query params) |
| `src/app/(hub)/portfolio-tracker/status-report/page.tsx` | Rewrite | Redirect to `V2_ROUTES.PROJECTS_V2_STATUS_REPORT` |
| `src/app/(hub)/portfolio-tracker/import/page.tsx` | Rewrite | Redirect to `V2_ROUTES.PROJECTS_V2_IMPORT` |
| `src/app/(hub)/portfolio-tracker/_avatar-stack.tsx`, `_filter-multi-select.tsx`, `_list-skeleton.tsx`, `_load-list-data.ts`, `_onboarding-list.tsx`, `_portfolio-card-menu.tsx`, `_project-card.tsx`, `_sort-select.tsx` | Delete | Superseded by `_v2-listing/*` equivalents |
| `src/app/(hub)/portfolio-tracker/[projectId]/*` (all files except the rewritten `page.tsx`) | Delete | Superseded by `projects/v2/[projectId]/*` |
| `src/app/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/*` (all files except the rewritten `page.tsx`) | Delete | Superseded by `projects/v2/[projectId]/onboarding-workspace/*` (already identical, confirmed via diff) |

## Code Context

### Cross-tree imports that must be fixed *before* deleting the old files
Found via `grep -rln "portfolio-tracker" src` filtered to files outside `portfolio-tracker/` itself:

```
src/app/(hub)/projects/v2/[projectId]/_status-summary-phase-cards.tsx:5-8
  import type { HealthTone, PhaseStatus, ProjectStatusReportItem } from "@/app/(hub)/portfolio-tracker/status-report/_status-report-types";
  import { HEALTH_LABEL, STATUS_LABEL, formatUsedAlloted } from "@/app/(hub)/portfolio-tracker/status-report/_status-report-types";
  import { AssigneeCell } from "@/app/(hub)/portfolio-tracker/status-report/_status-report-assignee-cell";
  import { NoteCell } from "@/app/(hub)/portfolio-tracker/status-report/_status-report-note-cell";
  → repoint all 4 to "@/app/(hub)/projects/v2/status-report/_status-report-types" etc.

src/app/(hub)/projects/v2/[projectId]/_status-summary-drawer.tsx:8-9
  import type { HealthTone, ProjectStatusReportItem } from "@/app/(hub)/portfolio-tracker/status-report/_status-report-types";
  import { HEALTH_LABEL } from "@/app/(hub)/portfolio-tracker/status-report/_status-report-types";
  → repoint both to "@/app/(hub)/projects/v2/status-report/_status-report-types"

src/app/(hub)/projects/_shared/_status-report-tab.tsx:5-6
  import StatusReportTable from "@/app/(hub)/portfolio-tracker/status-report/_status-report-table";
  import type { ProjectStatusReportItem, StatusReportResponse } from "@/app/(hub)/portfolio-tracker/status-report/_status-report-types";
  → repoint both to "@/app/(hub)/projects/v2/status-report/..."

src/app/(hub)/projects/_shared/_access-tab.tsx:5-6
  import { AccessTab as AccessTabPresentational } from "@/app/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_access-tab";
  import type { AssetRow, StaffPerson } from "@/app/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_wizard-v2-types";
  → repoint both to "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/..." (already-existing, byte-identical files — confirmed via `diff`)

src/app/(hub)/projects/_shared/_files-tab.tsx:5-7
  import { FilesTab as FilesTabPresentational } from "@/app/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_files-tab";
  import { uploadFileWithProgress } from "@/app/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_upload-queue";
  import type { AssetRow, AssetFolder, StaffPerson } from "@/app/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_wizard-v2-types";
  → repoint all 3 to "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/..."
```
`_shared/_access-tab.tsx` and `_shared/_files-tab.tsx` back both `/projects/v2/[projectId]/access|files` and `/projects/legacy/[projectId]/access|files` (task 276's shared-tab design) — repointing them to the v2-tree copies is safe for both variants since the source files are identical.

### `status-report/` internal fixes needed after the move (new path: `projects/v2/status-report/`)
```
_status-report-client.tsx:6,11-12
  import { V2_ROUTES } from "@/config/constants";           // unchanged
  import { FilterMultiSelect } from "../_filter-multi-select";   // was portfolio-tracker/_filter-multi-select.tsx (deleted)
  import { SortSelect } from "../_sort-select";                  // was portfolio-tracker/_sort-select.tsx (deleted)
  → repoint both to "@/app/(hub)/projects/_v2-listing/_filter-multi-select" / "_sort-select"
    (confirmed byte-identical to the portfolio-tracker originals via `diff` — task 276 already ported these)

_status-report-client.tsx:148
  <Link href={V2_ROUTES.PORTFOLIO_TRACKER} ...>Portfolio Tracker</Link>
  → href={V2_ROUTES.PROJECTS_V2}, label "Projects" (back-link now points to the V2 listing, not the retired tracker)

_status-report-table.tsx:8, _status-report-row-detail.tsx:4
  import { Chip, PhaseChip } from "../../dashboard/_components/dashboard-shared";
  → the relative depth changes when moving one folder deeper (portfolio-tracker/status-report/ was 2 levels under (hub)/;
    projects/v2/status-report/ is 3 levels under (hub)/). Simplest fix: switch to the absolute alias already used
    elsewhere in this exact tree (projects/v2/[projectId]/_status-summary-phase-cards.tsx:4):
    import { Chip, PhaseChip } from "@/app/(hub)/dashboard/_components/dashboard-shared";

_status-report-table.tsx:140
  href={`${V2_ROUTES.PORTFOLIO_TRACKER}/${project.projectId ?? project.id}`}
  → href={`${V2_ROUTES.PROJECTS_V2}/${project.projectId ?? project.id}`}
```

### `import/` internal fixes needed after the move (new path: `projects/v2/import/`)
```
page.tsx:20        redirect(V2_ROUTES.PORTFOLIO_TRACKER)   → redirect(V2_ROUTES.PROJECTS_V2)
_content.tsx:786   router.push(V2_ROUTES.PORTFOLIO_TRACKER) → router.push(V2_ROUTES.PROJECTS_V2)
_content.tsx:866   onClick={() => router.push(V2_ROUTES.PORTFOLIO_TRACKER)} → router.push(V2_ROUTES.PROJECTS_V2)
```
No other cross-references in `_content.tsx` — its import block is entirely package/absolute-alias imports, self-contained.

### Redirect stub pattern (model for `[projectId]`, `onboarding-workspace`, `status-report`, `import`)
```tsx
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ phase?: string; deliverable?: string }>;
}

export default async function PortfolioTrackerProjectRedirect({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { phase, deliverable } = await searchParams;
  const qs = new URLSearchParams();
  if (phase !== undefined) qs.set("phase", phase);
  if (deliverable !== undefined) qs.set("deliverable", deliverable);
  const query = qs.toString();
  redirect(`${V2_ROUTES.PROJECTS_V2}/${projectId}/timeline${query ? `?${query}` : ""}`);
}
```
`onboarding-workspace`'s redirect takes an untyped `Promise<Record<string, string | string[] | undefined>>` for `searchParams` and forwards every string-valued key (it has more query keys than `[projectId]` — `tab`, `parent_folder`, `sub_folder_l1`, etc., per `_workspace-url-params.ts`) rather than hand-enumerating them. `status-report`/`import` need no dynamic params — a one-line `redirect(V2_ROUTES.PROJECTS_V2_STATUS_REPORT)` / `redirect(V2_ROUTES.PROJECTS_V2_IMPORT)` in the function body is sufficient.

### Design tokens for the notice page (`_final_design/guide/central-hub-design-system.md`)
```
--bg:      #F4F6FB   page background
--surface: #FFFFFF   any icon-circle/card
--line:    #E2E7F2   borders
--ink:     #0B1533   heading
--body:    #3A4565   body copy
--muted:   #5F6A88   small/deprecation note
--blue:    #007BFF   primary navigate button bg (not orange — orange is reserved for
                      business-critical CTAs elsewhere; this is wayfinding)
--blue-700: #0063D6  button hover
Heading: Space Grotesk 600-700, ~22px, -0.015em, --ink
Body: Inter 400-500, 13-14px, --body
Small note: Inter 600, 11px, --muted
Radius: --r-lg (14px) on any icon container; 999px (pill) on the button
```
Existing page-local `EmptyState` components (e.g. `dashboard/_components/pm-dashboard.tsx:140`, `dev-dashboard.tsx:116`) show this codebase's established icon-circle + title + body pattern — the notice page should read as a full-page, centered version of that same visual language, not a new pattern.

## Implementation Steps

1. **Constants**: add `PROJECTS_V2_STATUS_REPORT`, `PROJECTS_V2_IMPORT` to `constants.ts`. Don't remove the two `PORTFOLIO_TRACKER_*` constants yet — remove them last, after confirming (via grep) nothing references them anymore.
2. **Move Status Report**: create `projects/v2/status-report/`, copy all 7 files, apply the 4 internal fixes above. Delete `portfolio-tracker/status-report/`'s original 6 supporting files (not `page.tsx` yet).
3. **Move Import Project**: create `projects/v2/import/`, copy both files, apply the 3 reference fixes above. Delete `portfolio-tracker/import/_content.tsx` (not `page.tsx` yet).
4. **Fix the 5 outside cross-tree imports** (`_status-summary-phase-cards.tsx`, `_status-summary-drawer.tsx`, `_shared/_status-report-tab.tsx`, `_shared/_access-tab.tsx`, `_shared/_files-tab.tsx`) to point at the new/existing `/projects/v2` locations.
5. **`npx tsc --noEmit`** — confirm zero errors from steps 2-4 before proceeding (this is the checkpoint that catches any missed cross-reference).
6. **Listing pill links**: fix `_v2-listing/_onboarding-list.tsx:170,178`.
7. **External deep links**: fix `pm-dashboard.tsx` (3 sites), `marketing-dashboard.tsx` (1 site).
8. **Sidebar + header**: remove the "Tracker" nav item and its breadcrumb entry.
9. **Rewrite the 4 redirect stubs**: `[projectId]/page.tsx`, `[projectId]/onboarding-workspace/page.tsx`, `status-report/page.tsx`, `import/page.tsx` — then delete every other file in those trees.
10. **Rewrite `portfolio-tracker/page.tsx`** as the centered notice; delete `loading.tsx` and the now-orphaned listing support files (`_avatar-stack.tsx`, `_filter-multi-select.tsx`, `_list-skeleton.tsx`, `_load-list-data.ts`, `_onboarding-list.tsx`, `_portfolio-card-menu.tsx`, `_project-card.tsx`, `_sort-select.tsx`).
11. **Remove dead constants**: re-run `grep -rn "PORTFOLIO_TRACKER_IMPORT\|PORTFOLIO_TRACKER_STATUS_REPORT" src` — if zero hits outside `constants.ts`, delete both from `constants.ts`.
12. **Full verification sweep** (see Verification).

## Acceptance Criteria

- [ ] `/projects/v2` listing's "Status Report" and "Import Project" pills load the moved pages at `/projects/v2/status-report` and `/projects/v2/import`, with identical behavior (filters, health rollups, expand/collapse rows, XLSX upload/parse/validate/submit) to before the move.
- [ ] `/projects/v2/[projectId]` Overview tab's status-summary drawer/cards and the `/projects/v2/[projectId]/status_report` (and `/projects/legacy/[projectId]/status_report`) tab still render correctly (they depend on the moved status-report types/components).
- [ ] `/projects/v2/[projectId]/access` and `/files` tabs (both `v2` and `legacy` variants) still render correctly (they depend on the repointed onboarding-workspace imports).
- [ ] Visiting `/portfolio-tracker` shows the centered "moved" notice — heading, body with a working hyperlink to `/projects/v2`, the Timeline-tab pointer sentence, and a small "this page will be removed soon" note. No listing content, no data fetching.
- [ ] Visiting `/portfolio-tracker/[any-project-id]` (with or without `?phase=&deliverable=`) redirects to `/projects/v2/[project-id]/timeline` (with those params preserved if present).
- [ ] Visiting `/portfolio-tracker/[any-project-id]/onboarding-workspace` (with any of its query params) redirects to `/projects/v2/[project-id]/onboarding-workspace` with those params preserved.
- [ ] Visiting `/portfolio-tracker/status-report` redirects to `/projects/v2/status-report`. Visiting `/portfolio-tracker/import` redirects to `/projects/v2/import`.
- [ ] Sidebar no longer shows a "Tracker" item; "Projects" → "V2 Projects" is the only path to this content.
- [ ] Both dashboards' client/project links land on `/projects/v2/...`, not `/portfolio-tracker/...`.
- [ ] `grep -rn "PORTFOLIO_TRACKER" src` (after the dead-constant removal in step 11) returns only the `PORTFOLIO_TRACKER: "/portfolio-tracker"` definition line in `constants.ts` and nothing else.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
grep -rn "portfolio-tracker" src --include="*.tsx" --include="*.ts" | grep -v "^src/app/(hub)/portfolio-tracker/"   # expect zero hits after all repoints
grep -rn "PORTFOLIO_TRACKER" src --include="*.tsx" --include="*.ts"   # expect only the constants.ts definition line
pnpm build   # forces compilation of every route incl. the new/moved ones and the 4 redirect stubs
pnpm dev
# Browser walk: /portfolio-tracker (notice renders, link works); /portfolio-tracker/<id> and
# /portfolio-tracker/<id>/onboarding-workspace (redirect correctly, params preserved);
# /portfolio-tracker/status-report and /portfolio-tracker/import (redirect correctly);
# /projects/v2 listing → Status Report and Import Project pills; a project's Overview
# status-summary drawer, status_report tab, access tab, files tab (v2 and legacy); sidebar
# (no "Tracker" item); both dashboards' project links.
```
Browser-based acceptance testing is required per CLAUDE.md (no test runner configured).

## Compatibility Touchpoints

- `_docs/mcp-tools.md` — not affected (no `server.registerTool` changes).
- No env vars, no DB migration, no `role-access.ts` change.
- Builds directly on task 276 (`/projects/v2` unification) and task 279 (routing rename, sidebar collapsible nav, `/portfolio-tracker/new` → `/projects/v2/new`) — this task is the piece those two left unfinished (Status Report + Import Project were explicitly out of scope for both).

## Implementation Notes

### What Changed

- Moved `portfolio-tracker/status-report/*` (7 files) and `portfolio-tracker/import/*` (2 files) verbatim into `projects/v2/status-report/` and `projects/v2/import/`, fixing every internal reference in the moved files: `_status-report-client.tsx`'s `../_filter-multi-select`/`../_sort-select` imports (now point at `projects/_v2-listing/_filter-multi-select`/`_sort-select`, confirmed byte-identical originals) and its back-link (now "Projects" → `V2_ROUTES.PROJECTS_V2`); `_status-report-table.tsx` and `_status-report-row-detail.tsx`'s relative `dashboard-shared` import (switched to the absolute-alias form already used elsewhere in this exact tree, since the relative depth changed by one level); `_status-report-table.tsx`'s per-project deep link; `import/page.tsx`'s role-gate redirect and `import/_content.tsx`'s two "back to projects" `router.push` calls.
- Fixed 5 files outside `/portfolio-tracker` that quietly imported shared types/components from it (found during planning via a repo-wide reverse-dependency grep, confirmed still needed at implementation time): `projects/v2/[projectId]/_status-summary-phase-cards.tsx` and `_status-summary-drawer.tsx` now import from the new `projects/v2/status-report/*`; `projects/_shared/_status-report-tab.tsx` likewise; `projects/_shared/_access-tab.tsx` and `_files-tab.tsx` now import from the already-existing, byte-identical `projects/v2/[projectId]/onboarding-workspace/*` (no new files needed there — task 276 had already ported those).
- Added `PROJECTS_V2_STATUS_REPORT` and `PROJECTS_V2_IMPORT` to `V2_ROUTES`; removed the now-fully-dead `PORTFOLIO_TRACKER_IMPORT`/`PORTFOLIO_TRACKER_STATUS_REPORT`. Kept bare `PORTFOLIO_TRACKER` defined (the route still physically exists as the notice/redirect section).
- Repointed the `_v2-listing/_onboarding-list.tsx` "Status Report"/"Import Project" pill links, both dashboards' project deep links, the sidebar's (removed) "Tracker" item, and the header breadcrumb map — all previously described in the plan.
- Rewrote `portfolio-tracker/page.tsx` as a centered, static "moved" notice (icon, heading, two body lines — one linking to `/projects/v2`, one pointing to the per-project Timeline tab for onboarding/phase tracking — a blue "Go to Projects" button, and a small muted "this page will be removed soon" line), matching the design system's Space Grotesk heading / Inter body / navy-blue palette and the visual language already established by `projects/v2/[projectId]/_coming-soon-overview.tsx`'s icon-circle + centered-card pattern. Deleted `loading.tsx` (nothing async left to skeleton for).
- Rewrote `[projectId]/page.tsx`, `[projectId]/onboarding-workspace/page.tsx`, `status-report/page.tsx`, and `import/page.tsx` as thin server redirects to their `/projects/v2` equivalents (the first two preserve their query params; `[projectId]` redirects to `.../timeline`, not the bare `[projectId]` page, since task 277 already moved that content there). Deleted every other file under those four sub-trees (27 files total) — all superseded by `/projects/v2`'s existing copies.

### Files Changed

- `src/config/constants.ts` — new/removed route constants
- `src/app/(hub)/projects/v2/status-report/*` (new, 7 files moved from `portfolio-tracker/status-report/`) — Overall Status Report
- `src/app/(hub)/projects/v2/import/*` (new, 2 files moved from `portfolio-tracker/import/`) — Import Project
- `src/app/(hub)/projects/v2/[projectId]/_status-summary-phase-cards.tsx`, `_status-summary-drawer.tsx` — repointed imports
- `src/app/(hub)/projects/_shared/_status-report-tab.tsx`, `_access-tab.tsx`, `_files-tab.tsx` — repointed imports
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` — pill link constants
- `src/app/(hub)/dashboard/_components/pm-dashboard.tsx`, `marketing-dashboard.tsx` — deep-link repoints + a type-import fix (see Deviations)
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — removed "Tracker" nav item + unused `ChartGantt` import
- `src/app/(hub)/_components/v2-hub-header.tsx` — removed breadcrumb entry
- `src/app/(hub)/portfolio-tracker/page.tsx` — rewritten as the notice; `loading.tsx` deleted
- `src/app/(hub)/portfolio-tracker/_avatar-stack.tsx`, `_filter-multi-select.tsx`, `_list-skeleton.tsx`, `_load-list-data.ts`, `_onboarding-list.tsx`, `_portfolio-card-menu.tsx`, `_project-card.tsx`, `_sort-select.tsx` — deleted
- `src/app/(hub)/portfolio-tracker/[projectId]/page.tsx`, `onboarding-workspace/page.tsx` — rewritten as redirect stubs; all 27 other files under `[projectId]/` and `[projectId]/onboarding-workspace/` deleted
- `src/app/(hub)/portfolio-tracker/status-report/page.tsx`, `import/page.tsx` — rewritten as redirect stubs; their other files deleted (moved above)
- 6 API route files (discovered during the verification sweep, not in the original plan — see Deviations): `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts`, `src/app/api/programme/reminders/route.ts`, `src/app/api/projects/[projectId]/members/route.ts`, `src/app/api/projects/[projectId]/programme/complete-phase/route.ts`, `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts`, `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts` — hardcoded `/portfolio-tracker/${id}` notification/reminder links repointed to `/projects/v2/${id}`
- `src/app/api/onboarding/projects/route.ts` — stale comment updated (no functional change)

### Deviations From Plan

- **Discovered and fixed 2 broken type-imports the task doc's grep sweep missed.** `pm-dashboard.tsx` and `marketing-dashboard.tsx` both had `import type { OnboardingProjectListItem } from "../../portfolio-tracker/_onboarding-list"` — a relative-path import that the planning grep (scoped to `V2_ROUTES.PORTFOLIO_TRACKER*` and absolute-alias `portfolio-tracker` strings) didn't catch. `npx tsc --noEmit` caught both immediately after deleting `portfolio-tracker/_onboarding-list.tsx`. Fixed by repointing to `../../projects/_v2-listing/_onboarding-list`, where the same type (and the list component task 276 ported) already lives — confirmed compatible via a clean `tsc` pass, no shape changes needed.
- **Scope expanded to 6 API route files + 1 comment, outside the task doc's file list, discovered via the Verification section's own `grep -rn "portfolio-tracker" src` sweep.** These build server-side notification/reminder link URLs (Cliq messages, in-app notifications, onboarding-linked-project links) as hardcoded `/portfolio-tracker/${project_id}` strings — not `V2_ROUTES.PORTFOLIO_TRACKER` references, so they weren't in the original cross-reference audit. They weren't functionally broken (the new redirect stub means these links still resolve correctly), but leaving them meant every future notification would route through a page slated for full removal, which conflicts with this task's explicit goal ("repoint every remaining internal link" to `/projects/v2`). Repointed all 6, plus one stale comment in `api/onboarding/projects/route.ts` that named the old path.
- **Left 6 pre-existing historical comments** in `projects/v2/[projectId]/_load-detail-data.ts`, `_onboarding-wizard.tsx`, `_delete-project-menu-item.tsx`, `_onboarding-detail.tsx`, and `onboarding-workspace/_onboarding-wizard-v2.tsx`/`_workspace-header.tsx` that say things like "Task 276 (Phase 3) — was `V2_ROUTES.PORTFOLIO_TRACKER`" — these predate this task (task 276/277 wrote them), describe genuine history, and reference no functional code path. Same treatment task 279 gave analogous "was X, task 276" comments. A handful of other comments elsewhere (`_programme-tab.tsx`, `_filter-controls.tsx`, `projects-old/**`, `dashboard/timelogs/**`) also name "portfolio-tracker" purely as a code-provenance note ("reduced port of portfolio-tracker/...", "mirrors portfolio-tracker/page.tsx's guard pattern") — left untouched for the same reason.
- No other deviations — file structure, constant names, redirect targets, and the notice page's content/behavior match the plan.

### Verification Run

- `npx tsc --noEmit` — PASS (0 errors), run at the plan's step-5 checkpoint (after the move + 5 cross-tree import fixes, before touching dashboards/sidebar/header) and again after every subsequent change.
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in `onboarding-workspace/_checklist-tab.tsx`, the same baseline task 279 documented, untouched by this task).
- `pnpm build` (full production build, `--webpack` flag baked into the script) — PASS, 0 errors; route manifest confirms every expected route compiled: `/portfolio-tracker`, `/portfolio-tracker/[projectId]`, `/portfolio-tracker/[projectId]/onboarding-workspace`, `/portfolio-tracker/status-report`, `/portfolio-tracker/import` (all four now redirect stubs, notice page for the bare route), `/projects/v2/status-report`, `/projects/v2/import` (new).
- `pnpm dev` + `curl` — PASS for the auth-guard smoke test (same pattern task 279 used): `/portfolio-tracker`, `/portfolio-tracker/[id]`, `/portfolio-tracker/[id]/onboarding-workspace`, `/portfolio-tracker/status-report`, `/portfolio-tracker/import`, `/projects/v2/status-report`, `/projects/v2/import` all returned clean `307`s to `/auth/login?returnTo=...` with correctly encoded paths — confirms no 500s and that the `(hub)` auth guard covers every new/rewritten route before any of my `redirect()` calls would even execute.
- `grep -rn "portfolio-tracker" src --include="*.tsx" --include="*.ts" | grep -v "^src/app/(hub)/portfolio-tracker/"` — only historical/provenance comments remain (see Deviations); zero functional string or import references.
- `grep -rn "PORTFOLIO_TRACKER" src --include="*.tsx" --include="*.ts"` — only the `constants.ts` definition line plus the 6 pre-existing historical comments noted above; zero functional usages.
- **Interactive/authenticated browser testing — NOT COMPLETED**, same sandbox limitation task 279 documented (no test-user credentials available to log in). Recommended before merge: visit `/portfolio-tracker` (notice renders, copy reads correctly, link and CTA both work, centered on the page, "will be removed soon" line visible); visit `/portfolio-tracker/<id>` and `/portfolio-tracker/<id>/onboarding-workspace` with and without query params (confirm redirect lands on `/projects/v2/<id>/timeline` / `/projects/v2/<id>/onboarding-workspace` with params preserved); visit `/portfolio-tracker/status-report` and `/portfolio-tracker/import` (confirm redirect); on `/projects/v2`, click "Status Report" and "Import Project" pills; open a project's Overview tab (status-summary drawer), Status Report tab, Access tab, and Files tab in both `/projects/v2` and `/projects/legacy` (confirms the 5 repointed cross-tree imports render correctly); confirm the sidebar no longer shows "Tracker"; click both dashboards' client/project links.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Every changed/rewritten file was read directly (4 redirect stubs, the notice page, all 7 moved status-report files, both moved import files, all 5 cross-tree import repoints, the sidebar/header/dashboard diffs, constants.ts) — not spot-checked, fully reviewed.
- No unused code introduced: `ChartGantt` import removed from `v2-hub-sidebar.tsx` alongside the "Tracker" nav item it exclusively backed; no dead imports left in any moved/rewritten file (confirmed by a clean `pnpm lint`, which fails this project's build on unused vars).
- No `any` or untyped escape hatches. The one intentionally broad type (`onboarding-workspace/page.tsx`'s `Record<string, string | string[] | undefined>` for `searchParams`) is a deliberate, narrow choice — matches how `_workspace-url-params.ts` itself treats that same query-param set as open-ended (`tab`, `parent_folder`, `sub_folder_l1..N`), not a laziness shortcut.
- No deep nesting; each redirect stub is a single early-exit function. The notice page is flat JSX with no conditional branches.
- Names are accurate and behavior-describing: `PortfolioTrackerProjectRedirect`, `PortfolioTrackerWorkspaceRedirect`, `PortfolioTrackerStatusReportRedirect`, `PortfolioTrackerImportRedirect`, `PortfolioTrackerRetiredPage`.
- No repeated logic needing extraction — the 4 redirect stubs are each shaped differently enough (dynamic-param interpolation, param passthrough scope, static vs. dynamic) that a shared helper would add more indirection than the ~5 lines it would save.
- Errors: `redirect()` is used exactly as Next.js's App Router convention requires (throws internally, no try/catch needed); no other error paths were touched.
- No secrets, credentials, or debug logging anywhere in the diff.
- Project conventions followed: page-scoped UI kept inline (no new files under `src/components/`); Tailwind-only styling, no `style={{}}`; hover states present on every interactive element in the new notice page; icon is `lucide-react` only; `V2_ROUTES` constants used everywhere a route is referenced in code (the 6 API-route fixes are hardcoded literals matching those files' own pre-existing convention — none of the 6 import `V2_ROUTES` today, and introducing it in only some of six sibling call sites would be a worse inconsistency than matching what's already there); AGENTS.md's vexp guidance correctly skipped since the task doc already named every file/symbol to touch.

### Deviations
- **Minor** — the Verification section's own acceptance criterion ("`grep -rn 'PORTFOLIO_TRACKER' src` returns only the constants.ts definition line") isn't met to the letter: 6 pre-existing historical comments in `projects/v2/[projectId]/*` files (written by task 276, e.g. "Task 276 (Phase 3) — was `V2_ROUTES.PORTFOLIO_TRACKER`") remain. These document genuine history and reference no functional code path. This is the exact same treatment task 279's own acceptance criteria explicitly allowed for its analogous `projects-v2` string sweep ("only, if any, historical comments referencing 'task 276'"). Not blocking.
- **Medium, documented and accepted** — scope expanded beyond the task doc's file list in two ways, both discovered via the task doc's own Verification grep sweep (not scope drift, but the sweep doing its job): (1) 2 broken relative-path type-imports in `pm-dashboard.tsx`/`marketing-dashboard.tsx` that the planning-stage grep (scoped to `V2_ROUTES.PORTFOLIO_TRACKER*` string patterns) didn't catch, caught instead by `tsc` immediately after deleting the file they pointed at; (2) 6 API-route files with hardcoded `/portfolio-tracker/${id}` notification/reminder link strings, plus one stale comment — not `V2_ROUTES` references, so outside the original cross-reference audit's search pattern, and not strictly required for the stated acceptance criteria (they still functioned correctly via the new redirect stub). Both are exactly the "missing dependency blocks implementation" / "discovered while completing the stated goal" pattern task 279 hit and documented the same way. Verified complete via a repo-wide `grep -rn "portfolio-tracker" src` (zero functional hits remain) and a clean full `pnpm build`.
- No other deviations — file structure, constant names, redirect targets, and the notice page's content/behavior match the plan exactly.

### Required Fixes
- None.
