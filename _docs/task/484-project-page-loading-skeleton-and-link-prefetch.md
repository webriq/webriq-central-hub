# 484 — Project pages: route-level skeleton + `<Link>` / prefetch so opening a project doesn't freeze

**Priority:** MEDIUM · **Type:** bugfix · **Recommended Tier:** `standard` · **Date:** 2026-11-18
**Follows:** 483 (listing / legacy / status-report skeletons; this was its follow-up)

## Overview

**Measured in 483 (localhost dev, no throttling):** clicking a project row on `/projects/<slug>` left the listing
frozen for **2902 ms** before the URL changed. The RSC request is in flight, but nothing on screen changes.

**Root cause:** a navigation can only commit once the server has flushed everything down to the nearest
`loading.tsx` boundary. For `/projects/<slug>/<projectId>/<tab>`, no boundary sits above the slow parts:

| Segment | Blocking work | Boundary today |
|---------|---------------|----------------|
| `[classification]/[projectId]/layout.tsx` | `getProjectShell()` (2 small queries, `cache`d); `getDeletedProjectSummary()` returns at once unless `status='deleted'` | none |
| `[projectId]/(tabs)/layout.tsx` | `getProjectDetailData()`: visibility check, claims, then **9 parallel queries** (milestones, tasklists, tasks, issues, customer, profiles, time logs, members, attachment counts) | none |
| `(tabs)/timeline/page.tsx` (default tab) | `loadOnboardingDetailData()` | none (only `tasks`, `tickets`, `milestones` have `loading.tsx`) |

On top of that, every entry point navigates with `router.push` from a `<button>` / `<div>`, so Next.js never
prefetches. Even with a boundary in place, the skeleton waits a full server round trip before it shows:

- Listing row: `_v2-listing/_project-card-parts.tsx:117` (`ProjectOpenWrapper`, `div role="button"`)
- Project tab strip: `_shared/_project-detail-tab-strip.tsx:74` (shared by v2 and legacy)
- Sidebar: `_components/v2-hub-sidebar.tsx:275, 329, 364` (from 483's follow-up)

## Requirements

- [ ] Opening a project from the listing shows a project-shaped skeleton immediately (URL changes at once), then streams in the page.
- [ ] Switching tabs inside a project (Timeline ↔ Overview ↔ Files ↔ …) keeps the real header and tab strip and shows a content-area skeleton immediately.
- [ ] Tasks / Tickets / Milestones tab skeletons no longer draw a **second** header under the real one (see Code Context).
- [ ] The project tab strip and the sidebar use `<Link>` (prefetched), with the same look and active state as today.
- [ ] Listing rows prefetch the project on hover/focus (**D1 RESOLVED**: no markup change).
- [ ] Slug redirect (task 474), deleted-project view (415), merged-project view, `notFound()` for unknown/hidden projects: unchanged.

## Out of Scope / Must Not Change

- Data loading: no query changes, no caching added to `getProjectDetailData()` (it isn't `cache`d and is also
  called by `overview/page.tsx`; a separate task can dedupe it).
- Task / ticket / milestone **detail** pages and `onboarding-workspace`: they get the generic project skeleton
  from the new `[projectId]/loading.tsx` (see D2). No detail-specific skeletons.
- Legacy listing rows and other `router.push` callers outside the three entry points above.
- The sidebar's inline `style={{}}` hover handlers: they're kept as they are, and only the element changes.

## Proposed File Changes

| File | Change |
|------|--------|
| `src/app/(hub)/projects/[classification]/[projectId]/loading.tsx` | **New.** Full project skeleton: back link, title row, tab-strip pills, content block. It's the boundary *below* `[projectId]/layout` and *above* `(tabs)/layout`, so only `getProjectShell` stays blocking |
| `src/app/(hub)/projects/[classification]/[projectId]/(tabs)/loading.tsx` | **New.** Content-area-only skeleton, used for tab switches because the `(tabs)` layout header persists |
| `…/(tabs)/tasks/loading.tsx`, `…/(tabs)/tickets/loading.tsx`, `…/(tabs)/milestones/loading.tsx` | Drop the header/back-link/tab-pill block; keep the content part |
| `src/app/(hub)/projects/_shared/_project-detail-tab-strip.tsx` | `<button onClick={router.push}>` → `<Link href>`; same classes; drop `useRouter` if unused |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Child items (`:329`) and plain items (`:364`) → `<Link>`. Stub items stay non-navigable (render a `<span>`/disabled button). The collapsed-group click (`:275`) stays `router.push` (that button also toggles); add `router.prefetch(item.href)` on hover |
| `src/app/(hub)/projects/_v2-listing/_project-card-parts.tsx` | `ProjectOpenWrapper`: compute `href` once; add `onMouseEnter` / `onFocus` → `router.prefetch(href)` |

## Code Context

- **Boundary placement:** a `loading.tsx` in segment S wraps S's *children*, inside S's own layout. That's why
  `(tabs)/loading.tsx` alone can't fix opening a project (the `(tabs)` layout's 9 queries sit above it), and why
  `[projectId]/loading.tsx` is needed. 483 kept the listing skeleton out of project pages with the
  `[classification]/(listing)` route group, so no listing skeleton reaches here.
- **Doubled header:** `(tabs)/layout.tsx` (task 283) renders `ProjectDetailHeader` once, above `{children}`.
  `tasks/loading.tsx` (and `legacy/[projectId]/loading.tsx`, which it was copied from) still renders a header
  skeleton (back link, title, tab pills) *inside* `{children}`, so a tab switch to Tasks shows real header + fake
  header. Verify in the browser before trimming (Acceptance #5).
- **Prefetch behaviour (Next 16, dynamic routes):** `<Link>` prefetches the route down to the nearest `loading.tsx`
  when the link enters the viewport (production only; dev prefetches on hover). With the new boundaries the
  prefetched shell *is* the skeleton, so clicks render it with no round trip.
- **Sidebar active state** keeps using `pathname` (`isChildActive`): unchanged.
- **Row:** `ProjectOpenWrapper` stays a `div` on purpose: a `<button>` made Space/Enter in the inline rename input
  open the project (comment above `:107`).

## Implementation Steps

1. Add `[projectId]/loading.tsx`. Build the header part from the existing header skeleton block
   (`legacy/[projectId]/loading.tsx` top half), matching `ProjectDetailHeader` heights. Content: a neutral
   timeline-ish block (Timeline is the default tab).
2. Add `(tabs)/loading.tsx`: content-area skeleton only (no header).
3. Trim the header block from `(tabs)/tasks|tickets|milestones/loading.tsx` once #5 confirms the double header.
4. Tab strip → `<Link>`.
5. Sidebar → `<Link>` for child and plain items; `router.prefetch` on hover for the collapsed group button.
6. Listing row → `router.prefetch(href)` on `onMouseEnter` / `onFocus`.
7. `npx tsc --noEmit`, `pnpm exec eslint` on the touched folders, then the browser checks.

## Acceptance Criteria

Timings use the 483 method: rAF sampling from the click (time to URL change, time to the first `.animate-pulse`).

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` | passes | pre-merge |
| 2 | eslint on touched files | no new errors | pre-merge |
| 3 | Listing → click a project row (after hovering it) | URL + project skeleton < 300 ms (baseline 2902 ms) | pre-merge, manual |
| 4 | Inside a project: Timeline → Overview → Files → Members | header and tab strip stay; content skeleton < 300 ms on each | pre-merge, manual |
| 5 | Inside a project: → Tasks / Tickets / Milestones | exactly **one** header visible during loading (before step 3: two) | pre-merge, manual |
| 6 | Sidebar → a classification, Legacy, Dashboard | same look, hover and active highlight as before; skeleton < 100 ms | pre-merge, manual |
| 7 | Sidebar collapsed → Projects icon | still navigates; expanded group still toggles open/closed | pre-merge, manual |
| 8 | Tab strip: middle-click / ⌘-click a tab | opens in a new tab (new with `<Link>`) | pre-merge, manual |
| 9 | **No regression:** project URL with a wrong slug | redirects to the canonical slug, same sub-path | pre-merge, manual |
| 10 | **No regression:** deleted project URL; unknown project id | deleted-project view; 404 page | pre-merge, manual |
| 11 | **No regression:** listing row rename (Space/Enter in input), 3-dot menu | rename types/saves; menu opens; neither opens the project | pre-merge, manual |
| 12 | **No regression:** legacy project tab strip | navigates; `legacy/[projectId]/loading.tsx` still shows | pre-merge, manual |
| 13 | Open a task detail page from a project | generic project skeleton, then the detail page (D2) | pre-merge, manual |

## Coordination

- **483 (Testing):** this task builds on its route-group layout; land after 483.
- **480–482 (Testing):** 481/482 touch `_onboarding-list.tsx`, while this task touches the sibling
  `_project-card-parts.tsx` (`ProjectOpenWrapper` only). No overlap in lines.
- No Planned / In Progress task touches `v2-hub-sidebar.tsx` or `_project-detail-tab-strip.tsx` (checked
  460, 458, 452, 431, 430, 429, 423, 408, 373, 321, 194, 048, 056). 430 (work-breakdown rename) touches project
  tab *content* (milestones/tasklists), not the strip or loading files.

## Open Decisions

- **D1 — RESOLVED (2026-11-18, via AskUserQuestion):** the listing row preloads with `router.prefetch` on
  hover/focus and stays a `div`. (Other options were a `<Link>` on the title only, or no row change.)
- **D2 — NON-BLOCKING:** task/ticket/milestone detail pages and `onboarding-workspace` show the generic project
  skeleton (it lives at `[projectId]`). Default: **accept**. Shape-specific skeletons for them are a follow-up.

## Operator Steps

None: merge is enough.

## Baseline

- From 483's browser run: listing → project, URL changed at **2902 ms**; listing/status-report skeletons at 40–282 ms.
- Prefetch effects only show fully in a production build (`pnpm build` with `--webpack`, then `pnpm start`). Run
  checks 3/6 there too if the dev numbers are ambiguous.

## Implementation Notes

### What Changed
- New `[projectId]/loading.tsx` (project header + tab-strip skeleton, plus the content skeleton) and a content-only `(tabs)/loading.tsx`.
- Removed the header block (back link, title, tab pills) from the Tasks / Tickets / Milestones tab skeletons; their content parts are unchanged.
- Project tab strip: `<button onClick={router.push}>` → `<Link href aria-current>` (shared by v2 and legacy).
- Sidebar: child and plain items → `<Link aria-current>`. Stub items get `prefetch={false}`, `aria-disabled` and a `preventDefault` on click. The collapsed group button keeps `router.push` and now calls `router.prefetch(item.href)` on hover.
- Listing row (`ProjectOpenWrapper`): still a `div`; `router.prefetch(href)` on `onMouseEnter` / `onFocus` (D1).

### Files Changed
- `src/app/(hub)/projects/[classification]/[projectId]/loading.tsx` - new project skeleton
- `src/app/(hub)/projects/[classification]/[projectId]/(tabs)/loading.tsx` - new tab-content skeleton
- `src/app/(hub)/projects/[classification]/[projectId]/(tabs)/{tasks,tickets,milestones}/loading.tsx` - dropped the doubled header block (old lines 4–30)
- `src/app/(hub)/projects/_shared/_project-detail-tab-strip.tsx` - `<Link>`
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` - `<Link>` for child and plain items; prefetch on hover for the collapsed group
- `src/app/(hub)/projects/_v2-listing/_project-card-parts.tsx` - prefetch on hover/focus

### Deviations From Plan
- None in code. Checks 3/6 (prefetch → < 300 ms) could not be measured in production: see Verification.
- The task doc was read from the local copy. CLAUDE.md forbids git commands, so there was no integration-branch fetch.

### Verification Run
Browser: localhost:3000 dev, logged in, rAF timing from the click (`urlAt` = URL change; skeletons are detected by class).

- `npx tsc --noEmit` - PASS for 484's files (baseline: pass → now: pass). After the `next build` run below regenerated `.next/types`, tsc also reports a **pre-existing** error in `dashboard/users/page.tsx` (see Attempts That Failed).
- eslint on the touched files - PASS (baseline: pass → now: pass)
- #3 listing → project row - PASS on dev: URL + project skeleton at **745 ms** (baseline **2902 ms**), with no listing skeleton. The hover prefetch made no request, because prefetch only runs in production (Next docs: `link.md` "Prefetching is only enabled in production"). The < 300 ms target is not verified.
- #4 tab switches - PASS: Overview **90 ms** (baseline 1818), Files 68, Timeline **54** (baseline 2535); content skeleton under the real header, one `h1`.
- #5 Tasks tab - PASS: doubled header gone (baseline: header skeleton under the real header → now: none; the Tasks skeleton is still used).
- #6 sidebar - PASS on dev: StackShift II 70 ms, Legacy 99 ms; same colours, full-width flex, `aria-current="page"` on the active item, no underline. The prefetch-driven < 100 ms is not verified in production.
- #7 collapsed sidebar - SKIPPED (not run; that code path only gained a `router.prefetch` line).
- #8 tabs are real `<a href>` - PASS (all 11 tabs, `aria-current` on the active one); an actual middle-click was not performed.
- #9 wrong slug - PASS: `/projects/pipelineforge/…/files?x=1` → `/projects/stackshift-i/…/files?x=1`.
- #10 unknown project id - PASS: 404 page, no skeleton left. Deleted project: SKIPPED (no deleted project id at hand).
- #11 row kebab - PASS: the menu opens (View / Rename / Update Classification / Delete) and the URL is unchanged; row focus doesn't navigate. Typing Space/Enter in rename: SKIPPED.
- #12 legacy tab strip - PASS: tabs are `<a>` and navigate (`tasks` → `files`). Note: the legacy tab switch still froze **6643 ms** with no skeleton (pre-existing; legacy `(tabs)` has no content `loading.tsx`, so it's a follow-up).
- #13 task detail - PASS (as D2): generic project skeleton at 667 ms, then the detail page.

### Attempts That Failed
- `pnpm build --webpack` (to verify prefetch in production) failed at `tsc` on the stale `.next/types/validator.ts` path from 483's page move. That only affects a local `.next`; a fresh checkout has none.
- `npx next build --webpack` (which regenerates `.next/types`) then failed on a **pre-existing, unrelated** error: `src/app/(hub)/dashboard/users/page.tsx` exports `ROLE_OPTIONS`, which isn't a valid Page export. Not touched by 483/484 and left as is (out of scope), so the production prefetch checks are blocked until it's fixed.

### Operator Steps
- None: merge is enough (route files and client components only; no migration, no shared server module).

### Follow-ups (not in this task)
- `dashboard/users/page.tsx` `ROLE_OPTIONS` export breaks `next build`: move it to a sibling module. This blocks production builds.
- The legacy project tab switch freezes (6.6 s measured): add a content-only `legacy/[projectId]/(tabs)/loading.tsx`.
- Re-run #3 / #6 on a production build once the build passes.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Changed files were taken from Implementation Notes; there was no `git diff`, because CLAUDE.md forbids git commands. All 8 files were read.
- **Fixed in gate (minor):** the "Announcements" stub (`href: V2_ROUTES.DASHBOARD`) was given `aria-current="page"` on `/dashboard`, next to the real Dashboard link (two "current" items for screen readers). Now `aria-current={active && !item.stub ? "page" : undefined}`. tsc and eslint pass after the fix. The visual highlight of the stub on `/dashboard` is pre-existing and left alone.
- No dead code: `useRouter` is still used in the sidebar (collapsed-group push/prefetch). It was removed from the tab strip, where nothing else used it. The 3 trimmed skeletons no longer contain the header bones (`h-6 w-56` count is 0).
- Conventions: Tailwind classes via `cn()` with complete literal class strings (no runtime-built names). New skeletons use `motion-reduce:animate-none`. The sidebar's pre-existing inline `style={{}}` hover handlers were kept as they were, as the doc requires. Each new comment says why, in a line or two.
- Small coupling: `[projectId]/loading.tsx` imports the default export of `(tabs)/loading.tsx` to reuse the content skeleton. That's acceptable (one importer, same feature folder); split it into a `_` file only if a third user appears.
- Stub link: a middle-click on "Announcements" opens `/dashboard` in a new tab (a `<Link>` can't block `auxclick` via `onClick`). It's harmless, because the stub's href is the dashboard.

### Deviations
- **Medium (visible, accepted):** in production, `<Link>` prefetches every visible sidebar item (~15) and project tab (11) as it enters the viewport. Each partial prefetch renders the layouts above the nearest `loading.tsx` (for project tabs: `[projectId]/layout`'s `getProjectShell`, 2 small queries, `cache`d per request). This is more server/Supabase traffic than before (zero prefetch). Next.js reuses shared layout segments and doesn't re-prefetch fresh entries, so the cost is bounded. If it shows up in metrics, switch the sidebar to hover-only prefetch (the `HoverPrefetchLink` pattern in Next's `linking-and-navigating.md`).
- **Minor:** D2 as decided: task/ticket/milestone detail pages and `onboarding-workspace` show the generic project skeleton (measured: task detail 667 ms).

### Acceptance Criteria Coverage
- #3 and #6 have checks that can fail, but the targets that depend on prefetch (< 300 ms / < 100 ms) were **not verified**: prefetch only runs in production, and the production build is blocked by the pre-existing `dashboard/users/page.tsx` `ROLE_OPTIONS` export. The dev numbers (745 ms / 70–99 ms) only prove the loading boundaries.
- #7 (collapsed sidebar), deleted-project half of #10, and the rename half of #11 were skipped in implement. They're left for `test`.
- #4, #5, #8, #9, #12, #13 were measured and pass.

### Required Fixes
- None (the one minor fix was applied in the gate).
