# 473: Clean classification routes (`/projects/<slug>`) + per-classification Status Report

**Created:** 2026-11-16
**Priority:** MEDIUM
**Type:** enhancement (routing)
**Recommended Tier:** standard
**Status:** Testing

> Written after implementation. The code shipped to the working tree first and this doc records it
> retroactively; there was no approval step before the change.

---

## Overview

The project listing's classification lived in a query param (`/projects/v2?tab=stackshift-i`). The
Status Report at `/projects/v2/status-report` covered every classification and had its own
Classification filter, separate from the sidebar Project link the PM had just clicked.

This task:
1. Moves each classification listing to a clean path: `/projects/stackshift-i`,
   `/projects/stackshift-ii`, `/projects/stackshift-access`, `/projects/stackshift-access-plus`,
   `/projects/pipelineforge`, `/projects/discrete-development`. `/projects/legacy` doesn't change.
2. Scopes the Status Report to one classification at `/projects/<slug>/status-report`, and removes
   the Classification filter.

Task 361 (`_classification-tabs.ts`) avoided path segments because `/projects/v2/[projectId]` owns
the segment under `v2`. That's not an issue at the `/projects/` level: the new dynamic segment
`[classification]` sits next to the static `legacy` and `v2` folders, and Next.js matches static
segments first.

## Requirements

- [x] `/projects/<slug>` renders that classification's listing. An unknown slug returns 404.
- [x] `/projects/<slug>/status-report` shows only projects whose `classification` equals that slug's classification.
- [x] The Status Report has no Classification filter. Health, Phase, sort, search and "Include completed" stay.
- [x] Status Report header and back link name the classification ("StackShift I status report", "← StackShift I projects"), and the back link goes to `/projects/<slug>`.
- [x] The listing's "Status Report" button opens the current classification's report.
- [x] Sidebar classification links use the clean paths. A link stays highlighted on its listing and on its status report. On a project detail page, the project's own classification is still highlighted (task 414).
- [x] Old URLs keep working:
  - `/projects/v2?tab=<slug>&…` → `/projects/<slug>?…` (other query params kept; missing or unknown `tab` goes to StackShift I)
  - `/projects/v2/status-report` → `/projects/stackshift-i/status-report`
  - `/portfolio-tracker/status-report` → (via the old path) `/projects/stackshift-i/status-report`
- [x] Listing pagination, search, status filter and "Clear filters" stay on the current classification path.

## Out of Scope / Must-Not-Change

- Project detail routes stay at `/projects/v2/<projectId>/…` (display ID). `/projects/v2/new` and `/projects/v2/import` stay where they are.
- `GET /api/onboarding/projects/status-report` is unchanged. It still returns every classification, and the client filters.
- No Legacy status report (there wasn't one before).
- `useLastTab` storage key and behaviour are unchanged (bare `/projects` still redirects to the last tab).
- No migration.

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_classification-tabs.ts` | Modify | `classificationTabHref()` returns `/projects/<slug>`; new `classificationStatusReportHref()`; header comment updated |
| `src/app/(hub)/projects/[classification]/page.tsx` | Create | Listing page (moved from `v2/page.tsx`), slug comes from route params, `notFound()` on an unknown slug |
| `src/app/(hub)/projects/[classification]/status-report/page.tsx` | Create | Auth + role guard, renders `StatusReportClient` with `tabId` |
| `src/app/(hub)/projects/v2/page.tsx` | Replace | Redirects `?tab=` URLs to `/projects/<slug>` and keeps the other params |
| `src/app/(hub)/projects/v2/status-report/page.tsx` | Replace | Redirects to the default classification's report |
| `src/app/(hub)/projects/v2/status-report/_status-report-client.tsx` | Modify | `tabId` prop; filters on `classification`; Classification filter and its state removed; header and back link name the classification |
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Modify | `buildUrl()` uses the classification path; Status Report button uses the per-classification href |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | `isChildActive()` matches on path prefix (no more `?tab=` parsing or `useSearchParams`) and keeps the project-detail rule |
| `src/app/(hub)/projects/page.tsx`, `src/app/(hub)/portfolio-tracker/status-report/page.tsx` | Modify | Comments only |

The Status Report components stay in `v2/status-report/`. The project detail pages (`_status-summary-*`,
`_programme-notes-bar.tsx`) and `_shared/_status-report-tab.tsx` import from there, so moving them
would mean editing those files for no benefit.

## Key Design Decisions

- **Client-side classification filter.** The API already returns every project in one call and the client already filtered by classification. Filtering on `p.classification === classificationForTab(tabId)` reuses that code with no API change.
- **Unknown slug → 404 on the new route, default tab on the legacy `?tab=` redirect.** A clean path that doesn't match a classification is a real error. A stale `?tab=` bookmark still lands somewhere useful, as task 361 intended.
- **Old status report → StackShift I.** A server redirect can't read the client-side last-visited tab (localStorage), so it uses the default tab.

## Known Limits / Risks

- **Unclassified projects no longer appear in any Status Report.** The old filter had an "Unclassified" option. Projects with `classification = null` are now only reachable through their detail page.
- **Reserved slugs.** A future classification slug can't be `legacy` or `v2`; a static folder would shadow it. Avoid `new` and `status-report` too.
- `PROJECTS_V2_STATUS_REPORT` in `src/config/constants.ts` still points at the old path, which now only serves as a redirect.

## Acceptance Criteria

- [ ] **Browser:** sidebar → StackShift I goes to `/projects/stackshift-i`, and the listing shows "N StackShift I projects". Repeat for PipelineForge.
- [ ] **Browser:** the "Status Report" button on `/projects/pipelineforge` goes to `/projects/pipelineforge/status-report`. Every row is a PipelineForge project, there's no Classification filter, the header reads "PipelineForge status report", and the sidebar still highlights PipelineForge.
- [ ] **Browser:** the back link on the status report returns to `/projects/pipelineforge`.
- [ ] **Browser:** `/projects/v2?tab=stackshift-ii&page=2` redirects to `/projects/stackshift-ii?page=2`.
- [ ] **Browser:** `/projects/v2/status-report` redirects to `/projects/stackshift-i/status-report`.
- [ ] **Browser:** `/projects/not-a-tab` returns 404. `/projects/legacy` and `/projects/v2/<displayId>/timeline` still load.
- [ ] **Browser:** on a project detail page, the sidebar highlights that project's classification.
- [ ] **Browser:** listing search, status filter and pagination keep the `/projects/<slug>` path; "Clear filters" returns to it.
- [x] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
```
Then do the browser checks above as an admin on the local app.

## Coordination

- **472 (Testing)** edits `status-report/route.ts` (archived filter). No overlap with this task; the route isn't touched here.
- **429 (In Progress)** touches the listing and status report data. This task only changes routing and the client-side filter, so at most it's a minor conflict in `_onboarding-list.tsx`.

## Open Decisions

None. The user specified the scope (path per classification, report scoped by the active sidebar tab, Classification filter removed).

## Operator Steps

None: merging the change is enough. Update any bookmarks or shared links to `/projects/v2?tab=…` if you like; they redirect either way.

## Compatibility Touchpoints

- No MCP tool or API change. `_docs/mcp-tools.md` is unaffected.

## Implementation Notes

### What Changed
See File Changes above. Implemented 2026-11-16 in a single pass before this doc existed.

### Verification Run
- `npx tsc --noEmit`: PASS (exit 0)
- Browser checks: **not run yet**

### Related, not part of this task
- In the same session, `_status-report-table.tsx`'s table wrapper got `relative` to fix the page scrolling past the end of the content (an `sr-only` span placed against the whole page instead of the table). That was a separate one-class bugfix with no task doc.

## Quality Gate Notes

### Result
PASS

### Standards Review
- `npx tsc --noEmit` and `npx eslint` on every changed file: clean. No unused imports left after removing the Classification filter (`CLASSIFICATIONS`, `V2_ROUTES` dropped from the client; `useSearchParams` and `parseClassificationTab` dropped from the sidebar).
- Fixed during the gate: three comments still described `?tab=` matching (`sidebar-project-context.tsx`, `v2/[projectId]/layout.tsx`, `_listing-shell.tsx`) and now describe the path-based routing. `classificationStatusReportHref()` now reuses `classificationTabHref()` so the path is defined in one place.
- The two new pages repeat the existing auth + client-role guard used by every other `(hub)/projects` page. That matches the codebase, so it isn't extracted.
- No `any`, no debug logging, no new dependencies. The redirects are server-side `redirect()` calls, so there's no client flash.
- Each acceptance criterion names a URL and an expected result that would visibly fail (wrong rows, no redirect, wrong highlight, 404 vs page).

### Deviations
- **Minor:** existing `V2_ROUTES.PROJECTS_V2` links (dashboards, "back" fallbacks, post-create `router.push`) still point at `/projects/v2` and reach the listing through the redirect (one extra hop, lands on StackShift I). They work as before; updating them is optional cleanup.
- **Minor:** the `/projects/v2` redirect keeps only single-valued query params. The listing never writes repeated params, so nothing is lost in practice.
- **Minor:** `NON_PROJECT_V2_SEGMENTS` in the sidebar still lists `status-report`. That route is now a redirect, so the entry is harmless and is kept so the redirect page isn't treated as a project detail page.
- **Medium (accepted by the user's request):** projects with no classification no longer appear in any Status Report (the "Unclassified" filter option went away with the filter). Recorded under Known Limits.

### Required Fixes
- None
