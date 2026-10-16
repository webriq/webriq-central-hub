# 453: Legacy Projects grid: kebab menu and delete dialog hidden behind other cards

**Created:** 2026-10-16
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Two layering bugs on the Legacy Projects grid (`/projects/legacy`, grid view):

1. **Kebab menu covered by the next card.** When you open a card's "Project actions" menu, the card below it paints over the bottom of the dropdown, so "Delete Project" is partly hidden (screenshot 1).
2. **Delete confirmation covered by other cards.** "Delete Project" opens `ConfirmDialog`. Its dim overlay and dialog box render *under* every card later in the grid and under the sticky toolbar. The dialog is cut off and the overlay only dims part of the page (screenshot 2).

### Root cause (verified in code)

In `ProjectGridCard` (`_legacy-listing/_project-grid-view.tsx:86-91`) each card's content layer is `relative z-10`, and the stretched `<Link>` behind it is `absolute z-0`. A positioned element with a non-`auto` z-index **creates its own stacking context**. So every card is its own stacking context at level 10, and all of them are siblings in the page's context.

`ProjectCardMenu` renders inside that layer, and so does everything it shows: the `fixed z-40` click-catcher, the `fixed z-50` dropdown, `ConfirmDialog` (`fixed z-[60]`) and the error `<p>`. `position: fixed` only changes the positioning box. It does **not** escape the parent stacking context, so those z-indexes only count *inside the card*. Against other cards they all sit at level 10, and a card later in DOM order wins the tie. That is why the next card covers the menu. The sticky toolbar (`_projects-index.tsx:168`, `sticky top-0 z-20`) beats 10, so it shows above the dialog overlay.

The three modals this menu opens (Manage Collaborators, Set Project Owner, Update Classification) are **not** affected. They already use `createPortal(document.body)`, and their header comments explain why. `ConfirmDialog` and the dropdown are the only overlays here that don't portal.

The v2 listing card (`_v2-listing/_project-card.tsx:125`, `relative h-full`, no z-index) and `_portfolio-card-menu.tsx` don't have the per-card `z-10`, so they aren't affected. They are out of scope.

## Requirements

- [ ] The open kebab menu shows fully above every other card, in any grid position (top row, middle, last row, any column).
- [ ] The delete confirmation's overlay covers the whole viewport: cards, sticky toolbar, top bar and sidebar. This matches the portaled modals. The dialog box is fully visible and clickable.
- [ ] Keep the card's stretched-link behaviour: clicking empty card space still opens the project, and the rename input, kebab, tasks/tickets stats, tag-remove buttons and avatar tooltips still get their own clicks.
- [ ] Clicks inside the dropdown or dialog must not navigate the card. Keep the existing `preventDefault`/`stopPropagation` calls.

## Out of Scope / Must-Not-Change

- `src/components/ui/confirm-dialog.tsx`: don't change the shared component (about 25 call sites). Portal it **at this call site** only.
- The v2 listing (`_v2-listing/*`) and the list view (`_project-list-view.tsx`).
- Menu items, permissions, the delete API, `useDeleteProject`, and the three already-portaled modals.
- The stretched-link structure and its long explanatory comment in `_project-grid-view.tsx`. Update only the sentence about `z-0`/`z-10`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_legacy-listing/_project-grid-view.tsx` | Modify | Remove `z-0` from the stretched `<Link>` and `z-10` from the content layer, so each card stops creating its own stacking context. The content still paints above the Link by DOM order (both positioned, `z-index: auto`, content comes later). Update the comment to match. |
| `src/app/(hub)/projects/_legacy-listing/_project-card-menu.tsx` | Modify | Portal the click-catcher + dropdown and the `ConfirmDialog` to `document.body` with `createPortal`, as the sibling modals do. Then no future stacking context on the card can trap them. Update the header comment. |

The first change alone fixes both screenshots. The second makes the fix hold even if someone later adds a z-index, transform or filter to the card, and it lets the dialog overlay cover the top bar and sidebar the same way the other modals do.

## Code Context

### File: `src/app/(hub)/projects/_legacy-listing/_project-grid-view.tsx` (lines 85-91)

```tsx
<div className="group relative h-full">
  <Link ... className="absolute inset-0 z-0 rounded-[14px]" />
  <div className="pointer-events-none relative z-10 h-full flex flex-col gap-3 p-4 rounded-[14px] border border-[#E2E7F2] bg-white transition-colors group-hover:border-[#A8C6F5]">
```

The comment at lines 57-62 says "z-0" / "on top (z-10)". Reword it to say the content paints above the Link by DOM order, and that adding a z-index here would trap the card's overlays (this task).

### File: `src/app/(hub)/projects/_legacy-listing/_project-card-menu.tsx`

- Lines 132-210: `{menuPos && (<> <div className="fixed inset-0 z-40" .../> <div className="fixed z-50 ..." style={{ left, top }}> ... </div> </>)}`. Wrap the fragment in `createPortal(..., document.body)`. That's safe for SSR because `menuPos` is only set from a click handler.
- Lines 212-220: `<ConfirmDialog open={confirmOpen} ... />`. Change to `{confirmOpen && createPortal(<ConfirmDialog open ... />, document.body)}`. The guard keeps `document` out of the server render. `ConfirmDialog` already returns `null` when closed, so behaviour doesn't change.
- React synthetic events still bubble through the React tree from a portal. The card's real navigation target is the sibling `<Link>`, not an ancestor, so a portaled click can't trigger it. Keep the existing `preventDefault`/`stopPropagation` handlers anyway.
- The header comment (lines 17-24) says the fixed dropdown avoids being covered by adjacent cards. That was wrong while the card had `z-10`. Rewrite it to say: portaled to `document.body`, because `position: fixed` doesn't escape an ancestor stacking context.
- The error `<p>` (line 238, `absolute ... z-50`) can stay in place. Once `z-10` is removed it paints above later cards again.

Portal pattern to copy: `src/components/projects/set-project-owner-modal.tsx:75` (`return createPortal(<div className="fixed inset-0 z-[60] ...">…</div>, document.body)`).

## Implementation Steps

1. In `_project-grid-view.tsx`, remove `z-0` from the Link className and `z-10` from the content div, and update the comment.
2. In `_project-card-menu.tsx`, import `createPortal` from `react-dom`, then portal the dropdown fragment and the `ConfirmDialog` (guarded by `confirmOpen`). Update the header comment.
3. Run `npx tsc --noEmit` and eslint on both files.
4. Do the browser checks below.

## Acceptance Criteria

- [ ] Open the kebab on a top-row card that has a card below it (as in screenshot 1). The whole menu shows, including "Delete Project", and nothing paints over it.
- [ ] Open the kebab on a middle-column card and on a last-row card. The menu is fully visible, and a last-row card's menu still clamps inside the viewport.
- [ ] Click "Delete Project" on the first card (as in screenshot 2). The overlay dims the whole screen, including the toolbar, top bar and sidebar. The dialog is centred and fully visible, and Cancel/Delete work. Delete removes the card after the refresh.
- [ ] Clicking the dim area around the open menu closes it without navigating. Clicking inside the dialog doesn't navigate.
- [ ] Clicking empty card space still opens the project. Rename, the tasks/tickets stats, tag-remove and avatar tooltips still work.
- [ ] Hovering a card still turns its border blue.

## Verification

```bash
npx tsc --noEmit
pnpm lint -- "src/app/(hub)/projects/_legacy-listing/_project-grid-view.tsx" "src/app/(hub)/projects/_legacy-listing/_project-card-menu.tsx"
```

Then do a browser acceptance run on `/projects/legacy` (grid view) with at least 5 projects, as a role that can delete (admin/super_admin), and go through each Acceptance Criterion.

## Compatibility Touchpoints

- None: no API, DB, packaging or docs changes. No CLAUDE.md update needed. If you want to record it, the lesson for `LEARNINGS.md` is: "`position: fixed` + a high z-index does not escape an ancestor that sets its own z-index. Portal overlays to `document.body`."

## Implementation Notes

### What Changed
- Removed the per-card stacking context. The stretched `<Link>` lost `z-0` and the content layer lost `z-10`, so the content now sits above the Link by DOM order alone. Added a task-453 note to the component comment explaining why no z-index belongs there.
- `ProjectCardMenu` now portals the dropdown, its click-catcher, and the delete `ConfirmDialog` to `document.body` with `createPortal`. The dialog is only mounted (`confirmOpen &&`) while open, so `document` is never touched during the server render. The header comment now explains why.

### Files Changed
- `src/app/(hub)/projects/_legacy-listing/_project-grid-view.tsx`: removed the z-indexes and updated the comment.
- `src/app/(hub)/projects/_legacy-listing/_project-card-menu.tsx`: portals the dropdown and `ConfirmDialog`; updated the header comment.

### Deviations From Plan
- None. The error `<p>` stays in place as planned.

### Verification Run
- `npx tsc --noEmit -p .`: PASS (no output)
- `npx eslint` on both changed files: PASS
- Browser acceptance on `/projects/legacy` grid view: NOT RUN (left for the `test` stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. The diff is limited to the 2 planned files: 2 class removals, 2 `createPortal` wraps, and comment updates. No dead code, no `any`, no debug logging, and no new `style={{}}`. The existing `style` on the dropdown is the runtime-computed `left`/`top`, which CLAUDE.md allows.
- SSR safety: the menu portal only runs when `menuPos` is set, which happens in a click handler. The dialog portal is guarded by `confirmOpen`. `document` is never read during the server render.
- Event flow: React events from portaled nodes still bubble through the React tree. No ancestor in that tree has an `onClick`, and the card's navigating `<Link>` is a sibling, not an ancestor. The existing `preventDefault`/`stopPropagation` handlers stay as a safeguard.
- The grid cards no longer have a z-index, but the error `<p>` (`absolute z-50`) still paints above later cards.
- The new comments explain why, which matches how much this file already comments.

### Deviations
- None from the plan.
- Minor behaviour note, check in `test`: the dropdown now lives in `document.body`, so the pointer over the menu no longer counts as hovering the card. The card's blue hover border (`group-hover`) disappears once the pointer moves onto the menu, where screenshot 1 showed it staying lit. This is cosmetic and acceptable. It can be restored later with a "menu open" class on the card if wanted.
- Pre-existing and out of scope: the header comment still says "the whole card is a Next.js `<Link>`". That was already out of date after the task-268 stretched-link refactor. Left alone, since the task limits comment edits to the stacking explanation.

### Required Fixes
- None.
