# 485 — Legacy projects listing: row-card List view (default), working kebab, List-first toggle, no-freeze navigation

**Priority:** MEDIUM · **Type:** enhancement · **Recommended Tier:** `balanced` · **Date:** 2026-11-18
**Follows:** 480 / 481 (same change for `/projects/<classification>`), 483 / 484 (skeletons + prefetch)

## Overview

`/projects/legacy` defaults to Grid. Its List view is an old `<table>` (`_legacy-listing/_project-list-view.tsx`)
with **no kebab menu**, row clicks via `router.push` (no prefetch, so the click freezes until the server answers),
and a toggle that triggers a full server round trip (it also changes `pageSize`). Bring it in line with the v2
listing (tasks 480–481):

1. Replace the table with stacked full-width **row cards**: the grid card's data laid out on one line, kebab included.
2. **List is the default**: no param = List, `?view=grid` = Grid (old `?view=list` links still work).
3. Toggle order **List, Grid**.
4. Kebab works in List view (every item: View, Copy link, Rename, Set owner, Classification, Collaborators, Delete).
5. Skeletons match the view, and moving listing ⇄ project (and between legacy project tabs) never freezes.

## Requirements

- [ ] Bare `/projects/legacy` renders List; `?view=grid` renders Grid; `?view=list` renders List.
- [ ] Toggle shows List first, then Grid; `aria-pressed` on the active button (copy the v2 `VIEW_OPTIONS` pattern).
- [ ] Switching view is client-only (`window.history.pushState`, like `_onboarding-list.tsx:143`): no RSC refetch,
      no skeleton, instant. List removes the `view` param, Grid writes `view=grid`.
- [ ] One page-size set for both views: `[15, 45, 90]` (see D1). Old `?pageSize=20` URLs still load (server parses any int).
- [ ] "Clear filters" keeps the current view (grid → `?view=grid`, list → bare URL).
- [ ] List row: title (`EditableProjectTitle`, renamable), company, status chip, type chip, tasks + tickets
      `ProgressStat` (clickable → `/tasks`, `/tickets`), tags (removable when `canManageTags`), days-left, members,
      kebab. Wraps to two lines below `md` (same approach as `_v2-listing/_project-row.tsx`).
- [ ] Row is a **stretched `<Link>`** (same structure as `ProjectGridCard`): prefetched, so a click shows
      `legacy/[projectId]/loading.tsx` at once. Href goes straight to `/projects/legacy/<project_id>/tasks`
      (skips the `[projectId]/page.tsx` redirect).
- [ ] Kebab in a row: opens, every item works, clicking an item never also opens the project, dropdown is not clipped
      or painted under the next row (no `z-index`/`transform` on row ancestors — task 453 / 481 notes).
- [ ] Route skeleton `_legacy-listing/loading.tsx` shows list rows (not the card grid); the in-page `isPending`
      skeleton shows rows/cards per current view.
- [ ] Legacy project tab switch no longer freezes: add content-only `legacy/[projectId]/(tabs)/loading.tsx`
      (the follow-up 484 recorded: 6.6 s freeze) and drop the doubled header from legacy tasks/tickets/milestones
      tab skeletons by re-exporting the v2 ones (bodies verified identical).

## Out of Scope / Must Not Change

- Grid card (`_project-grid-view.tsx`) look and behaviour.
- `_legacy-listing/_load-list-data.ts`, queries, filters, sort, auth in `legacy/page.tsx` (only the `initialView` line changes).
- V2 listing (`_v2-listing/*`, `[classification]/(listing)/*`).
- Per-user saved view (task 482) for legacy — see D2.
- `ProjectCardMenu` internals (it already `preventDefault` + `stopPropagation`s every handler and portals the dropdown).

## Proposed File Changes

| File | Change |
|------|--------|
| `src/app/(hub)/projects/_legacy-listing/_project-list-view.tsx` | Rewrite: `ListView` renders `ProjectListRow` cards (stretched Link + kebab), new props `canDeleteProjects`, `onSearchName` |
| `src/app/(hub)/projects/_legacy-listing/_projects-index.tsx` | `view` derived from URL (`get("view") === "grid" ? "grid" : "list"`), drop `initialView`/`useState`; `VIEW_OPTIONS` List-first; pushState toggle; single `PAGE_SIZES`; Clear filters keeps view; pass new `ListView` props; skeleton per view |
| `src/app/(hub)/projects/legacy/page.tsx` | Remove `initialView` prop (index reads the URL) |
| `src/app/(hub)/projects/_legacy-listing/_list-skeleton.tsx` | `ListRowSkeleton` → row-card skeleton mirroring the new row, `count` prop |
| `src/app/(hub)/projects/_legacy-listing/loading.tsx` | `CardSkeletonGrid` → `ListRowSkeleton` |
| `src/app/(hub)/projects/legacy/[projectId]/(tabs)/loading.tsx` | New: `export { default } from "../../../[classification]/[projectId]/(tabs)/loading";` |
| `src/app/(hub)/projects/legacy/[projectId]/(tabs)/{tasks,tickets,milestones}/loading.tsx` | Replace with re-export of the v2 counterpart (header removed in 484) |

## Code Context

**Current legacy List view** — `_project-list-view.tsx`: a `<table>`; rows are
`<tr onClick={() => p.project_id && router.push(`${V2_ROUTES.PROJECTS_LEGACY}/${p.project_id}/tasks`)}>` — no Link,
no prefetch, no `ProjectCardMenu`. Delete the table entirely.

**Grid card to copy the structure from** — `_project-grid-view.tsx:84-186` (`ProjectGridCard`): outer
`div.group.relative` → empty `<Link className="absolute inset-0">` → content `div.pointer-events-none.relative`, and
each interactive piece opts back in with `pointer-events-auto`. Long comment above it explains why (no nested
interactive content in `<a>`; no `z-index`, task 453). Kebab gate:

```tsx
{((canDeleteProjects && p.project_id) || p.canManageCollaborators || p.canSetOwner) && (
  <ProjectCardMenu projectId={p.project_id} projectDbId={p.id} projectName={p.name}
    canDelete={canDeleteProjects && !!p.project_id} canManageCollaborators={p.canManageCollaborators}
    canSetOwner={p.canSetOwner} hasProduct={p.hasProduct} currentClassifications={p.productClassifications}
    onRename={() => titleRef.current?.startEditing()} />
)}
```

The row needs its own component (per-row `useRef` for `titleRef`), same as the grid card. Consider a tiny shared
`canShowMenu(p, canDeleteProjects)` only if both files would otherwise duplicate the expression — not required.

**Row layout reference** — `_v2-listing/_project-row.tsx`: `flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2
rounded-[14px] border bg-white px-4 py-3`, identity `min-w-0 flex-1 basis-48`, fixed `md:w-*` columns so rows line up,
`basis-full h-0 md:hidden` line break on mobile, status `md:order-last`.

**V2 toggle to copy** — `_onboarding-list.tsx:84-89` (`VIEW_OPTIONS` List first), `:143-156` (`handleViewChange` via
`window.history.pushState`; legacy does **not** do the preference `fetch`), `:286-306` (toggle markup with
`aria-pressed`, focus ring).

**Legacy index, current** — `_projects-index.tsx`:
```ts
const [view, setView] = useState<"grid" | "list">(initialView);           // → derive from searchParams
function handleViewChange(next) { setView(next); navigate(buildUrl({ view: next, pageSize: next === "grid" ? 15 : 20, page: 1 })); }
const GRID_PAGE_SIZES = [15, 45, 90]; const LIST_PAGE_SIZES = [20, 50, 100]; // → one PAGE_SIZES
onClick={() => { setSearchInput(""); navigate(V2_ROUTES.PROJECTS_LEGACY); }} // Clear filters → keep view=grid
```
`legacy/page.tsx` default `pageSize` is already 15 — no server change needed.

**Kebab `openView`** (`_project-card-menu.tsx:68-73`) pushes `/projects/legacy/<id>` (redirects to `/tasks`). Leave it;
the dropdown is portaled (`createPortal`, `fixed`), so row overflow doesn't clip it.

**Skeletons** — `legacy/loading.tsx` re-exports `_legacy-listing/loading.tsx` (task 483). Legacy
`(tabs)/{tasks,tickets,milestones}/loading.tsx` still start with the duplicated header block; their bodies from the
`Content` marker on are identical to the v2 files (checked with `diff`), so a one-line re-export is enough.
484's notes: "legacy tab switch still froze **6643 ms** with no skeleton … add a content-only
`legacy/[projectId]/(tabs)/loading.tsx`."

## Implementation Steps

1. Rewrite `_project-list-view.tsx` as row cards (stretched Link + `ProjectListRow` with kebab, title rename, tags,
   progress stats, members). Href `${V2_ROUTES.PROJECTS_LEGACY}/${p.project_id}/tasks`; no `project_id` → listing URL (as grid).
2. `_projects-index.tsx`: URL-derived view, List-first `VIEW_OPTIONS`, pushState toggle, single `PAGE_SIZES`,
   Clear filters keeps view, pass `canDeleteProjects` + `onSearchName` to `ListView`, `isPending` skeleton per view.
3. `legacy/page.tsx`: drop `initialView`.
4. Skeletons: row-card `ListRowSkeleton({ count })`; `loading.tsx` uses it.
5. Legacy tab loaders: new `(tabs)/loading.tsx` re-export; replace the three tab loaders with re-exports.
6. `npx tsc --noEmit`, `pnpm eslint` on changed files, then the browser checks below.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` | 0 errors | pre-merge |
| 2 | `pnpm eslint "src/app/(hub)/projects/_legacy-listing" "src/app/(hub)/projects/legacy"` | 0 errors | pre-merge |
| 3 | Browser: open `/projects/legacy` | List of row cards; toggle shows List (active) then Grid | pre-merge, manual |
| 4 | Click Grid, then List | URL gets `?view=grid` / loses `view`; switch is instant (no skeleton, no `_rsc` request in Network) | pre-merge, manual |
| 5 | Open `/projects/legacy?view=list` | List | pre-merge, manual |
| 6 | List view, as PM/admin: open a row's kebab; try View, Copy link, Rename, Set owner, Classification, Collaborators, Delete (cancel) | each works; none also opens the project; dropdown fully visible over later rows | pre-merge, manual |
| 7 | List view: click a row body | `legacy/[projectId]` skeleton within ~100 ms, lands on `/tasks` (no redirect hop in Network) | pre-merge, manual |
| 8 | List view: click tasks / tickets stat, remove a tag | goes to `/tasks` / `/tickets`; tag removed, row not opened | pre-merge, manual |
| 9 | Hard reload `/projects/legacy` (throttled "Fast 4G") | route skeleton is rows, not cards | pre-merge, manual |
| 10 | Change search / status / page | `isPending` skeleton matches current view; view kept in URL | pre-merge, manual |
| 11 | Clear filters in Grid | URL `/projects/legacy?view=grid` | pre-merge, manual |
| 12 | Legacy project: switch tabs Tasks → Files → Tickets | content skeleton at once, real header + tab strip stay, no doubled header | pre-merge, manual |
| 13 | Project → back to listing (sidebar Legacy and browser Back) | listing skeleton or instant render, no frozen screen | pre-merge, manual |
| 14 | Viewport 390 px | rows wrap to two lines, no horizontal page scroll, kebab reachable | pre-merge, manual |
| 15 | **No regression:** Grid view | card look, kebab, rename, tag remove, stats unchanged | pre-merge, manual |
| 16 | **No regression:** `/projects/<classification>` listing and v2 project tab skeletons | unchanged | pre-merge, manual |

Manual = browser behaviour (timing, layout, menus); no test runner is configured.

## Coordination

- **480 / 481 / 482 / 484** (Testing, uncommitted): this task reads their patterns but edits none of their files.
  484 changed `(hub)/projects/[classification]/[projectId]/(tabs)/{tasks,tickets,milestones}/loading.tsx` and added
  `(tabs)/loading.tsx`; the legacy re-exports here depend on those versions — **land after 484**.
- **483** (Testing) created `legacy/loading.tsx` (re-export, unchanged here) and touched `_legacy-listing/loading.tsx`
  only by reference — **land after 483**.
- **430** (Planned, "legacy UIs" rename of `milestone_id`/`tasklist_id`): may touch legacy project pages, not the
  listing or loaders. No file overlap found.
- No other Planned / In Progress task touches `_legacy-listing/*`.

## Open Decisions

- **D1 — NON-BLOCKING.** Page sizes: one set `15 / 45 / 90` for both views (matches v2, and lets the toggle stay
  client-only). Default: yes. Alternative: keep list at 20/50/100, which forces a server round trip on every toggle.
- **D2 — NON-BLOCKING.** Should legacy also use the per-user saved view from task 482 (`projects_view`)? Default: no;
  URL only, List default. 482's migration is not applied yet; can be a follow-up.

## Operator Steps

None: merge is enough.

## Compatibility Touchpoints

- `src/lib/projects/deep-links.ts` and `_listing-shell.tsx` import `_legacy-listing` only for types/paths — check they
  don't reference `initialView` or `?view=list`/`grid` (grep before finishing).

## Baseline

- `npx tsc --noEmit`: 1 error, pre-existing (`.next/types/app/(hub)/dashboard/users/page.ts` — `ROLE_OPTIONS` export; same as 484's notes).
- Before: `/projects/legacy` defaulted to Grid; List was a `<table>` with no kebab and `router.push` rows; toggle Grid-first and
  server round trip; legacy project tab switch froze 6643 ms (484 notes) with doubled header skeletons.

## Implementation Notes

### What Changed
- Legacy List view is now stacked row cards (stretched `<Link>` → prefetched, straight to `/tasks`), with the kebab, rename,
  tag remove, tasks/tickets stats, days left, members. Wraps to two lines on narrow widths.
- List is the default (`?view=grid` = Grid; anything else = List). Toggle is List → Grid, `aria-pressed`, client-only
  (`history.pushState`, no RSC fetch). One page-size set 15/45/90 (D1 default). Clear filters keeps Grid.
- Route + in-page skeletons are row cards in List view.
- Legacy project `(tabs)/loading.tsx` added; legacy tasks/tickets/milestones tab skeletons now re-export the v2 ones (no doubled header).

### Files Changed
- `src/app/(hub)/projects/_legacy-listing/_project-list-view.tsx` - table → row cards with kebab
- `src/app/(hub)/projects/_legacy-listing/_projects-index.tsx` - URL-derived view, List-first client-only toggle, single page sizes, Clear filters keeps view, new ListView props
- `src/app/(hub)/projects/legacy/page.tsx` - dropped `initialView` / `view` param
- `src/app/(hub)/projects/_legacy-listing/_list-skeleton.tsx` - `ListRowSkeleton({ count })` mirrors the row card
- `src/app/(hub)/projects/_legacy-listing/loading.tsx` - row skeleton instead of card grid
- `src/app/(hub)/projects/legacy/[projectId]/(tabs)/loading.tsx` - new, re-exports v2 content skeleton
- `src/app/(hub)/projects/legacy/[projectId]/(tabs)/{tasks,tickets,milestones}/loading.tsx` - re-export v2 counterparts

### Deviations From Plan
- None. D1 and D2 took their defaults (one 15/45/90 set; no saved per-user view).

### Verification Run
- #1 `npx tsc --noEmit` - PASS (baseline 1 pre-existing error → still that 1, no new)
- #2 eslint on `_legacy-listing` + `legacy` - PASS (no output)
- #3 bare `/projects/legacy` - PASS: row cards, toggle List (pressed) then Grid
- #4 toggle Grid → List - PASS: `?view=grid` / bare URL, 15 cards then rows, **0** `_rsc`/legacy requests
- #5 `?view=list` - PASS by code (any non-`grid` value = list); not separately loaded
- #6 kebab in a list row - PASS for menu open (drawn over later rows, no navigation), Rename (input focused, stayed on listing, Escape),
  Delete (confirm dialog opened → **Cancel**, nothing deleted). View / Copy link / Set owner / Classification / Collaborators: menu items present, not clicked
- #7 row click - PASS: skeleton at 105 ms, href `/projects/legacy/<id>/tasks`, no redirect hop, content at 1725 ms (dev)
- #8 stats / tag remove - SKIPPED (not clicked; same `ProgressStat`/`TagChip` + `pointer-events-auto` as the grid card)
- #9 route skeleton - PASS: first load showed row skeletons (screenshot)
- #10 filter/page `isPending` skeleton - SKIPPED (not exercised; code path is `view`-based)
- #11 Clear filters in Grid - SKIPPED (not clicked)
- #12 legacy tab switch - PASS: files 85 ms, tickets 48 ms, tasks 43 ms skeleton with the real header (1 `h1`) (baseline 6643 ms freeze).
  First visit to a not-yet-compiled tab in dev took ~1.5 s (tickets, milestones) — dev compile, re-run of tickets was 48 ms
- #13 project → sidebar Legacy - PASS: listing skeleton at 42 ms; browser Back not tested
- #14 narrow width - PARTIAL: Chrome window min is 606 px (main ≈ 350 px): rows wrap, kebab reachable, rows don't overflow.
  `main` scrolls horizontally because of the **pre-existing** pagination controls (`flex items-center gap-2 shrink-0`), not this change
- #15 Grid no-regression - PARTIAL: 15 cards render after toggle; card kebab not re-clicked
- #16 v2 listing/tab skeletons - not re-tested (no v2 files edited; legacy files only re-export them)

### Attempts That Failed
- First tab-switch script picked the sidebar Desk "tickets" link (landed on `/desk/tickets`) — test selector bug, re-run with the exact tab href.

### Operator Steps
- None: merge is enough.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Changed files reviewed (list from Implementation Notes; git not run, per CLAUDE.md). No unused imports/code, no `any`, no debug logging; eslint clean.
- Fixed in this gate: tags column wrapper in `_project-list-view.tsx` repeated the inner div's `flex flex-wrap gap-1` → removed from the outer div (tsc: no new errors, eslint clean after).
- Kebab-visibility expression `(canDeleteProjects && p.project_id) || p.canManageCollaborators || p.canSetOwner` now exists in grid and list (2 copies). Left as is: too small to share, and the doc marked extracting it optional.
- Follows conventions: Tailwind only (the only `style` is the pre-existing select chevron), `cn()`, static class lookups, `aria-label`/`aria-pressed`, focus rings, `<Link>`/`<button>`, lucide icons, `window.history` only inside a handler.
- Re-exports for the legacy tab loaders keep one skeleton source (v2), so the doubled header can't come back separately.

### Deviations
- None against requirements. Minor: on narrow widths the status + kebab wrap below the title instead of sitting beside it (identity `basis-48` + status column > ~350 px). The kebab is still reachable; acceptable.
- Acceptance checks #5, #8, #10, #11, browser Back (#13), parts of #6/#15, and #16 were not observed during implement. They need the test stage.

### Required Fixes
- None.
