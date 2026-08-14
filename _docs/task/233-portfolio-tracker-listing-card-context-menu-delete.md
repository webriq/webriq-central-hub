# 233: Portfolio Tracker Listing — Card Context Menu with Delete Action

**Created:** 2026-08-13
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

Second follow-up to task 231 (soft-delete backend + detail-page trigger) and sibling to task 232
(which added the same kebab-menu delete action to the Projects module's Grid view). This task ports
that same pattern to the Portfolio Tracker listing (`/v2/portfolio-tracker`, `ProjectCard` in
`_onboarding-list.tsx`), so a project can be soft-deleted from that listing too, not only from its
detail page.

Everything the delete itself needs already exists and is reused as-is: `DELETE
/api/v2/projects/[projectId]` (soft delete, role-gated), the shared `useDeleteProject` hook, and the
shared `ConfirmDialog`. `GET /api/onboarding/projects` (this listing's data source) already excludes
`status = 'deleted'` (added in task 231), so a deleted card only needs the list to re-fetch to
disappear — same `router.refresh()` pattern task 232 already established.

**The one real complication, and why this isn't a copy-paste of task 232's component:**
Projects' Grid card wraps its whole content in a Next.js `<Link>` (an `<a>` tag) — nesting a `<button>`
kebab trigger inside it is technically non-conformant HTML but browsers tolerate it fine (confirmed
already working via task 232, and it matches this codebase's own pre-existing `TagChip`-in-card
pattern). **Portfolio Tracker's card is different**: when `editable`, `ProjectCard` wraps its content in
an actual `<button onClick={() => router.push(...)}>` (`_onboarding-list.tsx:186-192`). A `<button>`
cannot contain another `<button>` — this is not just a style-guide violation but an HTML parsing rule
browsers enforce; a nested `<button>` breaks the DOM (the parser force-closes the outer button early),
which would corrupt the whole card's click target. Task 232's `preventDefault`/`stopPropagation`
approach doesn't fix this — it only prevents the *click event* from reaching the ancestor, but the
*parsed DOM structure* itself would already be broken before any JS runs.

**Decisions made below (not explicitly specified by the user — flagged for review):**

1. **Fix: render the kebab as a sibling overlay, outside the button, not nested inside it.** Wrap
   `ProjectCard`'s return in a `<div className="relative h-full">` containing the existing
   button-or-div (unchanged) *and*, as a separate sibling, an absolutely-positioned
   `PortfolioProjectCardMenu` when the caller can delete. Because it's a sibling (not a descendant of
   the button), no `preventDefault`/`stopPropagation` is even needed for navigation-blocking — clicking
   the kebab simply can't reach the button's `onClick` since it isn't inside it. This also means the
   `!editable` branch (which renders a plain `<div>`, not a button) needs no special handling either —
   the overlay works identically over both branches.
2. **Header gets a same-sized invisible spacer** when the menu will render, so `OnboardingStatusPill`
   shifts left and the overlaid kebab doesn't visually sit on top of it — achieves "status, then kebab
   to its right, top-right corner" (matching the just-corrected Projects Grid placement) without the
   overlay literally covering the status pill. The spacer's size matches the kebab's own rendered
   footprint (`w-6 h-6`, mirroring task 232's trigger button size) so removing/adding the menu (e.g. a
   future permission change) can't cause the header to reflow.
3. **Role gate**: a new local `["admin", "pm", "super_admin"]` array in the new component, duplicating
   task 231/232's same three-role check rather than importing
   `portfolio-tracker/[projectId]/_delete-project-menu-item.tsx`'s exported `DELETE_PROJECT_ROLES` —
   that file is scoped to the `[projectId]` detail route; having the list-level directory import a
   dynamic-segment route's private component would be a backward/unusual dependency. Matches this
   codebase's already-established pattern of duplicating this exact 3-item array per call site (now a
   4th instance: API route, Projects detail trigger, Portfolio Tracker detail menu, this one) rather
   than centralizing it — noted and accepted in task 231/232's own Quality Gate Notes as consistent
   with existing convention, not a new smell.
4. **Independent of `roleEditable`.** The existing `roleEditable` gate (`marketing`/`admin`/
   `super_admin` — no `pm`, but includes `marketing`) controls whether the card is clickable/navigable
   at all; it is **not** reused for delete. A new `canDelete` check (`admin`/`pm`/`super_admin`) is
   computed separately in `OnboardingList` and passed down, since the two capabilities have different
   role sets (e.g. `marketing` can open a project but must not see Delete; `pm` must see Delete but
   isn't in `roleEditable` today).
5. **After a successful delete, `router.refresh()`** — same as task 232, not a redirect. The card
   disappears because `/api/onboarding/projects` already excludes `status = 'deleted'`.

## Requirements

1. Each Portfolio Tracker listing card shows a kebab (⋮) trigger, visible only to `admin`/`pm`/
   `super_admin`, positioned to the right of `OnboardingStatusPill` in the card's top-right corner.
2. Clicking the kebab opens a small dropdown with one action: **Delete Project** (danger-styled, trash
   icon, matching task 232's exact styling).
3. Clicking the kebab, and any subsequent menu interaction, never triggers the card's own navigation —
   achieved structurally (sibling-not-descendant of the button/div), not via event-suppression tricks.
4. Selecting Delete opens the shared `ConfirmDialog` (irreversible-action wording, matching tasks
   231/232) — no native `window.confirm`.
5. Confirming calls the existing `DELETE /api/v2/projects/[projectId]` soft-delete endpoint via the
   existing `useDeleteProject` hook (`confirmDisabled={deleting}` wired from the start — task 231's
   quality gate found this missing after the fact once already; task 232 got it right the first time;
   this task must too).
6. On success, the dialog closes and the list refreshes (`router.refresh()`); the deleted card is gone.
7. On failure, an inline error is shown near the kebab and the card remains.
8. Clicking outside an open menu closes it (matching task 232's click-away overlay).
9. Applies to every card regardless of `editable`/`roleEditable` state — an `admin`/`pm`/`super_admin`
   who happens not to be a project member (and so can't open a `pm`/`marketing`-gated project, per
   `canOpenProject`) can still delete it from the card, since deletion is a role capability, not a
   membership one (Decision 4).

## Out of Scope / Must Not Change

- Any change to the `DELETE`/`GET` API route, migration, `useDeleteProject`, `ConfirmDialog`, the
  Projects module (task 232, already shipped-to-Testing behavior beyond the already-agreed
  repositioning note below), or the Portfolio Tracker *detail* page's existing Settings-menu delete
  item (task 231) — all reused verbatim.
- `roleEditable`/`canOpenProject` membership logic — untouched; delete visibility is a separate,
  additive check (Decision 4).
- Bulk/multi-select delete, undo/restore.
- The Portfolio Tracker Status Report page (`/v2/portfolio-tracker/status-report`) — a different
  listing, not touched.

## Proposed File Changes

- `src/app/v2/(hub)/portfolio-tracker/_portfolio-card-menu.tsx` **(new, small)** — the kebab trigger +
  fixed-position dropdown + `ConfirmDialog` + `useDeleteProject` + `router.refresh()` on success.
  Near-identical to task 232's `src/app/v2/(hub)/projects/_project-card-menu.tsx`, minus the
  `preventDefault`/`stopPropagation` calls (not needed — Decision 1: this component is never nested
  inside the card's clickable button).
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx`:
  - `ProjectCard`'s signature gains a `canDelete: boolean` prop.
  - Header row (`132-140`) gets a spacer (Decision 2) reserving room for the overlay when
    `canDelete` is true.
  - The component's return (`184-192`) is restructured per Decision 1: outer
    `<div className="relative h-full">` wrapping the existing button-or-div branch, plus a sibling
    `{canDelete && item.project_id && <div className="absolute top-4 right-4"><PortfolioCardMenu
    projectId={item.project_id} projectName={item.project_name} /></div>}`.
  - `OnboardingList` (the exported default, `~248`) computes a new `canDelete = role === "admin" ||
    role === "pm" || role === "super_admin"` and passes it to every `<ProjectCard>` call site
    (`~543`), independent of `canOpenProject`/`editable`.

## Code Context

Current `ProjectCard` return (`_onboarding-list.tsx:184-193`) — the structural problem this task fixes:
```tsx
if (!editable) return <div className="h-full">{content}</div>;
return (
  <button
    onClick={() => router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${item.project_id ?? item.id}`)}
    className="h-full text-left w-full bg-transparent border-none p-0 cursor-pointer"
  >
    {content}
  </button>
);
```
A `<PortfolioCardMenu>` rendered inside `content`'s header would end up nested inside this `<button>`
when `editable` — invalid, breaks the DOM. This task moves it outside instead (Decision 1).

Current header row (`_onboarding-list.tsx:131-140`) — where the spacer (Decision 2) goes:
```tsx
<div className="flex items-start justify-between gap-3 mb-2.5">
  <div className="min-w-0"> ... project_name / company_name ... </div>
  <OnboardingStatusPill status={item.status} />
</div>
```

Task 232's `_project-card-menu.tsx` (the pattern to adapt — reuse the fixed-position/click-away
technique and `ConfirmDialog`/`useDeleteProject` wiring verbatim; drop the `preventDefault`/
`stopPropagation` calls per Decision 1):
```tsx
export function ProjectCardMenu({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { deleteProject, deleting, error } = useDeleteProject();
  // toggleMenu / closeMenu / openConfirm / handleConfirm — see task 232's file for the full
  // fixed-position + click-away implementation.
}
```

`OnboardingList`'s existing role/gating computation (`_onboarding-list.tsx:350-356`) — `canDelete` is
new and separate from this:
```ts
const roleEditable = role === "marketing" || role === "admin" || role === "super_admin";
const canOpenProject = (item: OnboardingProjectListItem) =>
  roleEditable || (isRoleGatedByMembership(role) && !!currentUserId && item.members.some((m) => m.id === currentUserId));
```

Call site (`_onboarding-list.tsx:543`):
```tsx
<ProjectCard key={p.id} item={p} editable={canOpenProject(p)} />
```

## Implementation Steps

1. Build `_portfolio-card-menu.tsx` by adapting task 232's `_project-card-menu.tsx` (drop the
   `preventDefault`/`stopPropagation` calls; keep everything else — `ConfirmDialog`,
   `confirmDisabled={deleting}`, `useDeleteProject`, `router.refresh()`).
2. In `_onboarding-list.tsx`, add the `canDelete` computation to `OnboardingList` and thread it to
   `ProjectCard`.
3. Add the header spacer and restructure `ProjectCard`'s return per Decision 1/2.
4. `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] As `admin`/`pm`/`super_admin`, every card (editable or not) shows a kebab to the right of its
      status pill; as any other role, it does not.
- [ ] Clicking the kebab opens a dropdown with only "Delete Project" and never navigates the card.
- [ ] Clicking elsewhere closes an open menu without navigating.
- [ ] Confirming a delete removes the card from the listing and the project's DB row still exists with
      `status = 'deleted'`.
- [ ] The Delete button in `ConfirmDialog` is disabled while the request is in flight.
- [ ] No React/DOM warning about invalid nesting (button-in-button) in the browser console.
- [ ] Portfolio Tracker's detail-page delete (task 231) and Status Report page are unaffected.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Browser: as `pm`, open `/v2/portfolio-tracker`, delete a disposable/test project from its card menu,
  confirm it disappears without a full page navigation, confirm the DB row still exists with
  `status = 'deleted'`, and check the console for no nested-button warnings.
- As `developer`, confirm no kebab appears on any card (including cards that role can still open).
- As `marketing` (in `roleEditable` but not in the delete role set), confirm the card still opens on
  click but shows no kebab.

## Compatibility Touchpoints

- No RLS, migration, or API changes — additive UI only, dependent on task 231's backend and task 232's
  established `router.refresh()`-on-delete pattern.

## Implementation Notes

### What Changed
- Added a kebab menu with a "Delete Project" action to every card in the Portfolio Tracker listing
  (`ProjectCard` in `_onboarding-list.tsx`), gated to `admin`/`pm`/`super_admin` via a new
  `canDeleteProjects` computed independently of `roleEditable`/`canOpenProject`.
- Rendered the new `PortfolioCardMenu` as a sibling positioned outside the card's own
  button-or-div wrapper (never nested inside the `<button>`), avoiding the invalid button-in-button
  HTML that a direct copy of task 232's approach would have produced. A same-size invisible spacer
  in the header keeps `OnboardingStatusPill` from being visually covered by the overlay.
- `PortfolioCardMenu` reuses task 231's `useDeleteProject`/`ConfirmDialog` and mirrors task 232's
  `ProjectCardMenu` (fixed-position dropdown, click-away overlay, `confirmDisabled={deleting}`,
  `router.refresh()` on success) — with the `preventDefault`/`stopPropagation` calls dropped, since
  this component is structurally never inside a clickable ancestor here.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/_portfolio-card-menu.tsx` - new: kebab trigger, dropdown,
  Delete item, `ConfirmDialog`, `useDeleteProject`, `router.refresh()` on success.
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx`:
  - Added `canDeleteProjects` in `OnboardingList`, threaded to every `<ProjectCard>` call site as
    `canDelete`.
  - `ProjectCard` gained the `canDelete` prop and a `showMenu = canDelete && !!item.project_id` guard.
  - Header row gets a `w-6 h-6` spacer when `showMenu` is true, wrapped with `OnboardingStatusPill`
    in a `flex items-center gap-1` group.
  - Return restructured: outer `<div className="relative h-full">` wraps the existing
    button-or-div branch (unchanged internally) plus a sibling `{showMenu && (<div className="absolute
    top-4 right-4"><PortfolioCardMenu .../></div>)}`.

### Deviations From Plan
- None — implementation matches the task doc's Decisions, Requirements, and Proposed File Changes
  exactly, including the structural fix for the button-in-button concern.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing warnings in the untouched `_checklist-tab.tsx`, unrelated
  to this task)
- Manual browser verification (kebab visibility by role, click-away close, delete + listing refresh,
  no nested-button console warning, `marketing`/`developer` role checks) - SKIPPED (deferred to the
  `test` stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code, no broad `any`, no deep nesting; the button-in-button restructure is a clean,
  well-commented fix (both the "why" in `_onboarding-list.tsx`'s return and the mirrored note in
  `_portfolio-card-menu.tsx`'s file header explain the constraint, not just the mechanics).
- **Found and fixed during this gate**: `PortfolioCardMenu`'s success handler called
  `router.refresh()`, copied directly from task 232's Grid card menu. Traced
  `OnboardingList`'s actual data flow (`_onboarding-list.tsx:274-315`) and confirmed its `projects`
  state is populated by a client-side `fetch("/api/onboarding/projects")` inside a
  `useEffect(..., [retryKey])` — not server-rendered props like `/v2/projects`. `router.refresh()`
  only re-runs the Server Component tree; it has no effect on that `useEffect`, so the deleted card
  would have silently stayed visible until a manual page reload — a real failure of Requirement 6
  ("the list refreshes; the deleted card is gone"), not a cosmetic difference. Fixed by threading an
  `onDeleted: () => void` callback from `OnboardingList` (`() => { setLoading(true);
  setRetryKey((k) => k + 1); }` — the exact same expression the listing's own pre-existing "Try
  again" button already uses) through `ProjectCard` to `PortfolioCardMenu`, replacing the
  `router.refresh()` call. Removed the now-unused `useRouter` import/`router` variable from
  `_portfolio-card-menu.tsx` as part of the same fix. Re-verified `npx tsc --noEmit` and `pnpm lint`
  both pass clean after the change.
- Confirmed the "no `preventDefault`/`stopPropagation` needed" claim in the task doc and the new
  file's own comment by tracing the actual render tree, not just trusting the comment: `ProjectCard`
  now renders the navigate button/div and `PortfolioCardMenu` as siblings under a shared
  `<div className="relative h-full">`, so a click on the kebab structurally cannot bubble through the
  navigate button's `onClick` (they share no ancestor-descendant relationship) — verified correct by
  construction, not just documented as such.
- `MENU_WIDTH`/`MENU_HEIGHT` constants are duplicated verbatim from task 232's file. Consistent with
  the task doc's own Decision 1/3 reasoning (already accepted in tasks 231/232's gates) — not flagged.

### Deviations
- Medium (found and fixed, not left open): the `router.refresh()` no-op described above. Classified
  Medium rather than Minor because it would have silently broken the task's own primary success
  criterion for end users, not just an internal implementation nit — but it's fully resolved, so it
  proceeds as a documented, corrected deviation rather than a blocker.
- No Major deviations — Portfolio Tracker's detail-page delete (task 231), the Status Report page,
  and the Projects module (task 232) are all confirmed untouched by this task's diff.
