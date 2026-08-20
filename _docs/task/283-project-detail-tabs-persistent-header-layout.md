# 283: Project Detail Tabs — Persistent Header via Shared Next.js Layout (Fixes Full Header Reload on Every Tab Click)

**Created:** 2026-08-20
**Priority:** HIGH
**Type:** bugfix / refactor
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

User-reported follow-up during task 282's Testing: clicking between tabs on a V2/Legacy project detail page (`/projects/{v2,legacy}/[projectId]/*`) visibly reloaded the entire header (title, badge, subtitle, Owner/Collaborators row, Settings gear, tab strip) on every click, not just the tab's own content.

## Root Cause

Every tab (Overview, Timeline, Tasks, Issues, Milestones, Files, Access, Members, Status Report, Time Logs) was its own independent Next.js route with no shared `layout.tsx` — each `page.tsx` fetched its own data and rendered a full copy of `ProjectDetailHeader` (or, for Timeline, its own bespoke header construction) inside itself. Every tab click was therefore a full route transition: the header component fully unmounted and remounted, visibly re-flashing its async-loaded pieces (phase badge skeleton, "Owner: Unassigned" before the members fetch resolved). Three routes (Tasks/Issues/Milestones) made this worse with their own `loading.tsx` Suspense fallback, which — since the header lived inside the same page tree as the content — replaced the **entire page including the header** with a full skeleton on every navigation into those tabs.

Confirmed via `find` for `loading.tsx` files and by reading `tasks/loading.tsx`, which explicitly skeletons a "Header" block (back link, title, badge, tab pills) alongside the content skeleton.

## Fix

Introduced a Next.js route-group layout (`(tabs)/layout.tsx`, invisible in the URL) per variant, so the header renders once and persists across tab navigation — only `{children}` (the page content) is subject to its own `loading.tsx`/data fetch.

**Scope decision (user-confirmed):** cover all 10 v2 tabs including Timeline, not just the 9 tabs that already shared a uniform header. Timeline's header was previously conditional per internal render branch (Settings gear hidden on restricted/wizard/loading/not-started screens) — confirmed this was an incidental effect of the gear being bundled inside a since-dissolved in-body "Header card," not a real permission rule (role/`isCreator` are available in every branch), so the gear is now uniformly visible when permitted, matching the other 9 tabs. Same treatment applied to `_generic-phase-view.tsx`'s previously-separate, previously-untouched (task 282's explicit Out-of-Scope) in-body Header card, since it's a second instance of the same reload problem.

## Requirements

- [x] Clicking between any two tabs on a V2 or Legacy project detail page does not remount/reflash the header — only the content area shows its own loading state.
- [x] `ProjectDetailHeader` becomes self-sufficient: computes its own phase badge (`useActivePhase`), Owner/Collaborators row (`OwnerCollaboratorsRow`), and Settings gear (role/creator-derived) internally from `project`/`companyName`/`classification`/`currentUserId`/`currentUserRole`/`variant`/`basePath`, instead of receiving them as props recomputed by every caller.
- [x] `ProjectDetailTabStrip` derives the active tab from the URL (`usePathname()`) instead of a prop threaded down from each page.
- [x] Task/Issue/Milestone detail sub-routes (`tasks/[taskId]`, `issues/[issueId]`, `milestones/[milestoneId]`) and the Onboarding Workspace (`onboarding-workspace`) remain outside the shared layout — they keep their own dedicated chrome, not the project tab strip.
- [x] Timeline's header (`_onboarding-detail.tsx`, `_generic-phase-view.tsx`) is fully dissolved into the shared layout — no in-body duplicate header/gear/Owner-Collaborators row remains on either the StackShift or generic-engine branch.
- [x] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Out of Scope / Must-Not-Change

- Any tab's actual data-fetching logic or content beyond removing the header it used to render.
- The Wizard, Onboarding Workspace's own internal tabs/content.
- `role-access.ts`, API routes, database schema — none touched.
- Task 282's other 13 items — this is exclusively the header-reload fix, discovered during that task's Testing pass.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_project-detail-header.tsx` | Rewrite | Self-sufficient: takes `project`/`companyName`/`classification`/`currentUserId`/`currentUserRole`/`basePath`/`variant`; computes badge/secondaryRow/gear/activeTab internally instead of as props |
| `src/app/(hub)/projects/v2/[projectId]/(tabs)/layout.tsx` | Create | Fetches project data once, renders the header once, `{children}` for tab content |
| `src/app/(hub)/projects/legacy/[projectId]/(tabs)/layout.tsx` | Create | Legacy equivalent |
| `src/app/(hub)/projects/v2/[projectId]/(tabs)/{overview,timeline,tasks,issues,milestones,files,access,members,status_report,time_logs}/page.tsx` | Move | Relocated from `v2/[projectId]/{tab}/` (one level deeper under the new route group); relative imports adjusted |
| `src/app/(hub)/projects/legacy/[projectId]/(tabs)/{overview,tasks,issues,milestones,files,access,members,status_report,time_logs}/page.tsx` | Move | Legacy equivalent |
| `src/app/(hub)/projects/v2/[projectId]/(tabs)/{tasks,issues,milestones}/loading.tsx`, Legacy equivalent | Move | Unchanged content, relocated alongside their `page.tsx` |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | No longer renders `ProjectDetailHeader`/settings gear/`variant` prop — content-only |
| `src/app/(hub)/projects/v2/[projectId]/_coming-soon-overview.tsx` | Modify | No longer renders the header — content-only, `project` is now its only prop |
| `src/app/(hub)/projects/legacy/[projectId]/(tabs)/overview/page.tsx` | Rewrite | No longer renders the header — content-only |
| `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` | Modify (substantial) | `backLink`/`mainBackLink`/`ownerCollaboratorsRow`/`settingsMenu` constructions removed; `OwnerPanel`/`CollaboratorsPanel`/`PersonChip`/`PanelHeader` component definitions removed (dead — no longer triggered); `GenericPhaseView` call site simplified; now-dead membership handlers/state removed |
| `src/app/(hub)/projects/v2/[projectId]/_generic-phase-view.tsx` | Modify (substantial) | In-body "Header card" (title/badge/Owner-Collaborators/Settings gear) dissolved; Jump to Phase moved to its own row; Programme Progress bar/stat chips become their own card |
| `src/app/(hub)/projects/v2/[projectId]/_delete-project-menu-item.tsx` | — | No further change beyond task 282's `variant` prop addition — still used by the header |

## Implementation Notes

### What Changed

- **Root cause confirmed** via `find`/`loading.tsx` inspection — see Root Cause above.
- **`ProjectDetailHeader` rewritten self-sufficient** — now takes `project`/`companyName`/`classification`/`currentUserId`/`currentUserRole`/`basePath`/`variant` and internally computes the phase badge (`useActivePhase`), `OwnerCollaboratorsRow` secondary row, Settings gear (role/creator-derived, routes "Set Owner"/"Manage Collaborators" to the Members tab), and active tab (`usePathname()`).
- **New route-group layouts** `v2/[projectId]/(tabs)/layout.tsx` and `legacy/[projectId]/(tabs)/layout.tsx` — fetch project data once via the existing `getProjectDetailData`, render the header once, `{children}` for tab content. Route groups are invisible in the URL, so `/projects/v2/{id}/tasks` etc. are unchanged.
- **10 v2 routes + 9 legacy routes moved** into their respective `(tabs)/` folders (page.tsx + loading.tsx where present), relative imports adjusted one level deeper. `onboarding-workspace/` and the bare `[projectId]/page.tsx` redirect stay outside the group — confirmed Next.js correctly resolves `(tabs)/tasks/page.tsx` (→ `/tasks`) alongside the untouched, ungrouped `tasks/[taskId]/page.tsx` (→ `/tasks/{id}`) without conflict.
- **`_project-detail.tsx`, `_coming-soon-overview.tsx`, the new Legacy Overview page** — all three no longer render `ProjectDetailHeader`/compute badge/gear/secondaryRow; content-only now.
- **Timeline (`_onboarding-detail.tsx`) — full dissolution**: `backLink`/`mainBackLink` (the two `ProjectDetailHeader` JSX consts, one with the gear, one without, split across 6 render branches) removed entirely; `ownerCollaboratorsRow`/`settingsMenu` construction removed; `OwnerPanel`/`CollaboratorsPanel`/`PersonChip`/`PanelHeader` component definitions deleted (their only trigger — the in-body gear — is gone; "Set Owner"/"Manage Collaborators" now route to the Members tab via the shared header, same pattern as the 8 previously-shared tabs); now-dead `staffDirectory` state/effect, `handleAddProjectMembers`/`handleRemoveProjectMember`/`handleTransferProjectOwnership`, `isCreator`/`canManageProjMembers`/`canSetOwner`/`canDeleteProject`/`ownerDisplayName`/`collaborators` all removed (cascading dead code from the gear/panel removal, cleaned up via `pnpm lint`'s unused-var warnings rather than manual guessing). `GenericPhaseView`'s call site simplified to 6 props (was 18).
- **`_generic-phase-view.tsx` — in-body Header card dissolved** (StackShift-equivalent dissolution task 281 already did for `_onboarding-detail.tsx`, deferred for this file by task 282's explicit Out-of-Scope note, now done): title/badge/Owner-Collaborators/Settings gear removed; Jump to Phase moved to its own row above the Programme Progress card; the progress bar + stat chips become their own standalone card instead of being nested in the removed Header card. `OwnerPanel`/`CollaboratorsPanel` imports and their trigger state removed.
- **Cascading unused-import/dead-code cleanup** driven by `pnpm lint` output rather than manual tracing — `_project-detail.tsx`'s now-fully-unused `variant` prop removed along with all 16 call sites; several now-dead lucide icon imports (`X`, `Settings`, `Crown`, `Users` in `_onboarding-detail.tsx`; `Settings`/`Users`/`Crown` in `_generic-phase-view.tsx`) removed; `DeleteProjectMenuItem`/`DELETE_PROJECT_ROLES`/`canManageProjectMembers`/`canSetProjectOwner` imports removed from `_onboarding-detail.tsx` where no longer referenced.
- **Stale Next.js route-type cache** (`.next/types/validator.ts`, referencing pre-move file paths) cleared (`rm -rf .next/types`) after the file moves — regenerates automatically on the next dev/build.

### Files Changed

See Proposed File Changes table above — 2 new layouts, 19 moved route files (10 v2 + 9 legacy), 5 substantially-rewritten shared/Timeline components, plus the two now-deleted `_shared/_delete-project-action.tsx`/`_manage-collaborators-action.tsx` files from task 282 (unaffected further here).

### Deviations From Plan

- **Timeline's Settings gear visibility changed from per-branch-conditional to uniform** — a deliberate behavior simplification confirmed with the user (see Overview's Scope Decision), not an accidental side effect. The underlying permission check (role/`isCreator`) was always available in every branch; only the historical "was inside the Header card, which only rendered on the main branch" constraint made it look conditional.
- **"Set Project Owner"/"Manage Collaborators" now route to the Members tab everywhere**, including from Timeline (previously opened inline `OwnerPanel`/`CollaboratorsPanel`) — necessary because the header now lives in a separate React subtree (the layout) from page content and cannot directly toggle state inside whichever page happens to be mounted. Matches the pattern task 282 already established for the 8 previously-shared tabs.

### Verification Run

- `npx tsc --noEmit` — PASS (0 errors)
- `pnpm lint` — PASS (0 errors; 2 pre-existing unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`, untouched)
- Browser walkthrough (Claude-in-Chrome, Super Admin, against the user's own running `pnpm dev`) — PASS:
  - **ABC Test Company Gantt** (Discrete Development) — Tasks → Issues navigation: header (title/badge/owner/tab strip) stayed static; only the content area showed Issues' `loading.tsx` skeleton, then real content. Timeline (generic-engine branch): dissolved Header card confirmed — active-milestone pill + Jump to Phase in their own row, Programme Progress card standalone, single gear in the shared header, no duplicate Owner/Collaborators row.
  - **Glorias Anzac Biscuits** (StackShift I) — Timeline: header persisted, badge "Phase 1: Onboard" correct, above-swimlane row order (Jump to Phase → Status Summary → Onboarding Workspace) intact from task 282, single gear opens correctly (Set Project Owner/Manage Collaborators/Delete Project) with no console errors. Tasks → task detail sub-route (`/tasks/{taskId}`) — confirmed the detail page renders its own dedicated header, NOT the project tab strip, validating the route-group exclusion works.
  - **RCB & Associates** (Legacy) — Tasks → Milestones navigation: header persisted correctly, Legacy-appropriate content rendered, no console errors.
  - **Onboarding Workspace** (`/onboarding-workspace`) — confirmed it renders its own dedicated UI, not wrapped by the project tab-strip layout.
- No console errors or hydration warnings observed on any tested page/transition.
