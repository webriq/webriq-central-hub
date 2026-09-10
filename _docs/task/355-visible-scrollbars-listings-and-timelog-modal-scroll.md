# 355: Visible Scrollbars on Tasks/Issues Listings + Scrollable Add/Edit Time Log Modal

**Created:** 2026-09-10
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Completed (2026-09-10 — marked complete at user's explicit request; browser acceptance not run)

---

## Overview

Two related UI-affordance gaps, both reported with screenshots:

1. **Tasks & Issues list views** (`_list-view.tsx`, `_issue-list-view.tsx`) scroll their rows
   inside an `overflow-y-auto` container, but the scrollbar is effectively invisible. `globals.css`
   forces classic (non-overlay) WebKit scrollbars app-wide, but the default thumb is a translucent
   **white** (`oklch(1 0 0 / 12%)`) tuned for the Hub's dark surfaces — on the white listing card it
   is white-on-white. The codebase already has the fix for exactly this situation: the
   `.scrollbar-light` utility class (`globals.css:251`). It just isn't applied to these two
   containers. Users can't tell the list is scrollable or where they are in it.

2. **Add / Edit Time Log modal** (`_time-log-entry-modal.tsx`) has no max-height and no scroll
   region. The body is a plain `flex flex-col` that grows with its content, and the Notes rich-text
   editor (`_time-log-notes-editor.tsx`) grows unbounded with the text entered. With a multi-line
   note the modal outgrows the viewport: the header + Project field are pushed off the top and the
   Cancel / Add Time Log buttons off the bottom, with no way to scroll to them (screenshot #2).

Both fixes are small, follow existing patterns, and are purely presentational (no data / API / schema).

## Requirements

- [ ] Tasks list view (`_list-view.tsx`) row scroll container shows a visible scrollbar when rows overflow.
- [ ] Issues list view (`_issue-list-view.tsx`) row scroll container shows a visible scrollbar when rows overflow.
- [ ] The visible scrollbar uses the established `.scrollbar-light` treatment (no new bespoke pattern).
- [ ] `.scrollbar-light` is wide enough to read as a real scrollbar (bump from the global 5px), without regressing its two existing consumers (both white file-preview panes — wider is fine there).
- [ ] Add/Edit Time Log modal is capped at `max-h-[90vh]`; when content exceeds that, the modal **body** scrolls while the header (title/close) and footer (Cancel / Add Time Log) stay pinned and always visible.
- [ ] The modal's scroll region also uses `.scrollbar-light`.
- [ ] The Notes editor inside the modal is capped in height and scrolls internally for long notes (so it never single-handedly blows out the modal), keeping the rest of the form reachable.
- [ ] Sticky column headers in both list views continue to work (they sit inside the same scroll container).
- [ ] No visual regression to the list card corner-rounding / `headerStuck` behaviour.

## Out of Scope / Must-Not-Change

- Board and Calendar views for tasks/issues (`_board-view.tsx`, `_calendar-view.tsx`,
  `_issue-board-view.tsx`, `_issue-calendar-view.tsx`) — the request is about the *listing* views only.
- The Milestones-tab scroll container in `_project-detail.tsx` (line ~688).
- The inline task/issue-detail time-log forms (`_time-log-form.tsx` under `projects/legacy`,
  `projects/v2`, `projects-old`) — different surface, not in the screenshots. (Could get the same
  Notes-height cap later if desired; note it, don't do it here.)
- The global `::-webkit-scrollbar` rule (`globals.css:240-243`) — leave the app-wide default alone;
  only extend the `.scrollbar-light` class.
- No changes to time-log validation, save payload, `TaskIssuePicker`, or any API route.
- No new dependencies. No `style={{}}` — Tailwind classes / the existing raw-CSS `.scrollbar-light` block only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/globals.css` | Modify | Add a width/height rule (and optional subtle track) scoped to `.scrollbar-light` so it renders as a visibly-sized bar; keep the existing color overrides. |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | Add `scrollbar-light` to the row scroll container (`<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 pb-5">`, ~line 354). |
| `src/app/(hub)/projects/_shared/_issue-list-view.tsx` | Modify | Same class addition on the equivalent container (~line 225). |
| `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Modify | Make the modal card `flex flex-col max-h-[90vh]`; header + footer `shrink-0`; body becomes the `flex-1 min-h-0 overflow-y-auto scrollbar-light` scroll region. |
| `src/app/(hub)/dashboard/timelogs/_time-log-notes-editor.tsx` | Modify | Wrap `<EditorContent>` in a `max-h-[220px] overflow-y-auto scrollbar-light` container so long notes scroll inside the field. |

## Code Context

### `src/app/globals.css` (existing — lines 239-253)

```css
/* ─── Scrollbar ──────────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: oklch(1 0 0 / 12%); border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: oklch(1 0 0 / 20%); }

/* The default thumb above is a translucent WHITE tuned for the Hub's dark surfaces — invisible
   (white-on-white) on genuinely light/white content ... Opt into this class ... */
.scrollbar-light::-webkit-scrollbar-track { background: #f1f5f9; }
.scrollbar-light::-webkit-scrollbar-thumb { background: #cbd5e1; }
.scrollbar-light::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
```

Add (scoped to the class, so the app-wide 5px default is untouched):

```css
.scrollbar-light::-webkit-scrollbar { width: 10px; height: 10px; }
.scrollbar-light::-webkit-scrollbar-thumb { border: 2px solid #f1f5f9; }  /* inset look; bg + radius already inherited */
```

Note: `.scrollbar-light::-webkit-scrollbar-thumb` already inherits `border-radius: 99px` from the
generic rule; the block above only overrode `background`, so adding `border` here is additive.
Keep the existing three `.scrollbar-light` lines.

### `src/app/(hub)/projects/_shared/_list-view.tsx` (~line 354) and `_issue-list-view.tsx` (~line 225)

```tsx
// before
<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 pb-5">
// after
<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-light px-8 pb-5">
```

The long comment immediately below this line (about not adding `overflow-hidden` / sticky header /
margin-not-padding) stays as-is — `scrollbar-light` is colour + width only and doesn't affect it.

### `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` (lines 260-390)

```tsx
// outer card — line ~262
<div className="w-full max-w-md rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] overflow-hidden">
//  ->  add:  flex flex-col max-h-[90vh]

// header — line ~263 : add `shrink-0`
<div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7]">

// body — line ~270 : this is the scroll region
<div className="px-5 py-4 flex flex-col gap-3">
//  ->  px-5 py-4 flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto scrollbar-light

// footer — line ~372 : add `shrink-0`
<div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]">
```

The overlay is already `fixed inset-0 flex items-center justify-center ... p-4`, so `max-h-[90vh]`
keeps the whole card on-screen and vertically centered. `overflow-hidden` on the card stays (it
clips the rounded corners); the inner body is what scrolls.

### `src/app/(hub)/dashboard/timelogs/_time-log-notes-editor.tsx` (lines 41-61)

```tsx
// The PM class keeps `min-h-[56px]`. Wrap the editor output:
<div className="max-h-[220px] overflow-y-auto scrollbar-light">
  <EditorContent editor={editor} />
</div>
```

Parent `<div>` already has `overflow-hidden` + `rounded-[10px]`; the new inner wrapper sits below the
toolbar row, so the scrollbar appears inside the field's rounded border. `focus-within` ring on the
parent is unaffected.

## Implementation Steps

1. `globals.css`: add the two `.scrollbar-light::-webkit-scrollbar` / `-thumb` rules described above,
   directly under the existing `.scrollbar-light` block. Keep a short comment.
2. `_list-view.tsx`: add `scrollbar-light` to the `overflow-y-auto` row container className.
3. `_issue-list-view.tsx`: same change on the equivalent container.
4. `_time-log-entry-modal.tsx`:
   - outer card: append `flex flex-col max-h-[90vh]`.
   - header row: append `shrink-0`.
   - body row: append `flex-1 min-h-0 overflow-y-auto scrollbar-light`.
   - footer row: append `shrink-0`.
5. `_time-log-notes-editor.tsx`: wrap `<EditorContent editor={editor} />` in
   `<div className="max-h-[220px] overflow-y-auto scrollbar-light">…</div>`.
6. `npx tsc --noEmit` + `pnpm lint`.
7. Browser check per Verification.

## Acceptance Criteria

- [ ] On a Tasks list and an Issues list with enough rows to overflow, a grey scrollbar is clearly
      visible on the right edge of the row area, and dragging it scrolls the rows.
- [ ] Sticky column headers still pin to the top of the scroll area while scrolling; card top
      corners still square off when the header is stuck (`headerStuck`) and round again when not.
- [ ] Add Time Log: with a Notes value long enough to exceed the viewport, the modal stops growing
      at ~90vh, the title + close button stay visible at the top, and the Cancel / Add Time Log
      buttons stay visible at the bottom; the middle of the form scrolls.
- [ ] The Notes editor itself stops growing at ~220px and scrolls internally for very long notes.
- [ ] Edit Time Log (opened from a row) shows the same capped/scrollable behaviour.
- [ ] Modal scroll region and Notes editor both show the light (grey) scrollbar, not an invisible one.
- [ ] The two existing `.scrollbar-light` file-preview panes in `_onboarding-wizard.tsx` still look
      correct (just a slightly wider bar).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser (pnpm dev):
#  1. A v2 project → Tasks tab → List view with many tasks: confirm visible scrollbar + sticky header.
#  2. Same for Issues tab → List view (matches screenshot #1).
#  3. /dashboard/timelogs → Add Time Log → pick project → type a long multi-line Notes value:
#     confirm header + footer stay visible and the body scrolls (fixes screenshot #2).
#  4. Edit an existing time log with a long note: same check.
#  5. Open a CSV/file preview in the onboarding wizard: confirm scrollbar still fine.
```

## Compatibility Touchpoints

- No packaging / docs / adapter / install-surface impact.
- CSS-only + className-only changes; no migration, no deps, no API, no `database.ts`.
- `.scrollbar-light` change is global but scoped to the class; only 2 pre-existing consumers, both benign.

## Implementation Notes

### What Changed
- Extended the existing `.scrollbar-light` utility in `globals.css`: added a `::-webkit-scrollbar { width: 10px; height: 10px }` rule (scoped to the class, so the app-wide 5px default is untouched) and a `2px solid #f1f5f9` inset border on the thumb. The three existing color lines are unchanged.
- Added `scrollbar-light` to the `overflow-y-auto` row scroll container in both `_list-view.tsx` (tasks) and `_issue-list-view.tsx` (issues) — the only change in those two files (one word each). Sticky-header / `headerStuck` corner logic and the long explanatory comment below the container are untouched.
- Add/Edit Time Log modal (`_time-log-entry-modal.tsx`): outer card is now `flex flex-col max-h-[90vh]`; header and footer rows got `shrink-0`; the body row got `flex-1 min-h-0 overflow-y-auto scrollbar-light`. Header (title/close) and footer (Cancel / Add Time Log) now stay pinned and the middle scrolls when content exceeds 90vh.
- Notes editor (`_time-log-notes-editor.tsx`): wrapped `<EditorContent>` in a `max-h-[220px] overflow-y-auto scrollbar-light` div so a long note scrolls inside the field instead of growing the modal. `min-h-[56px]`, the parent `overflow-hidden`/rounded border and `focus-within` ring are unchanged.

### Files Changed
- `src/app/globals.css` — widen `.scrollbar-light` (5px → 10px) + inset thumb border so it reads as a real scrollbar on white surfaces.
- `src/app/(hub)/projects/_shared/_list-view.tsx` — `scrollbar-light` on the row scroll container.
- `src/app/(hub)/projects/_shared/_issue-list-view.tsx` — `scrollbar-light` on the row scroll container.
- `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` — cap modal height, pin header/footer, make body the scroll region.
- `src/app/(hub)/dashboard/timelogs/_time-log-notes-editor.tsx` — cap + scroll the rich-text editor area.

### Deviations From Plan
- None. Implemented exactly as specified.

### Design Hook Findings
- `globals.css` L253/L254 `design-system-color` (`#cbd5e1`, `#94a3b8`): pre-existing scrollbar-thumb colors already in the file — the edit only added a `border`/width line and re-touched the lines. Not new drift; left as-is (established scrollbar palette).
- `_list-view.tsx` / `_issue-list-view.tsx` `design-system-font-size` findings: pre-existing `text-[NNpx]` literals throughout both files (the codebase-wide convention per CLAUDE.md), unrelated to the one-word className change. Not in scope.

### Verification Run
- `npx tsc --noEmit` — PASS (no output)
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file, `onboarding-workspace/_checklist-tab.tsx`)
- Browser acceptance — NOT RUN (handed to test stage; needs `pnpm dev` + a project with overflowing task/issue lists and a long-note time log)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. All five edits are minimal and match existing conventions:
  - `globals.css` — the width bump + same-color (`#f1f5f9`) inset border on the thumb is a standard WebKit "padded thumb" technique; thumb keeps the inherited `border-radius: 99px`. Scoped to `.scrollbar-light`, so the app-wide 5px default is untouched. `#cbd5e1`/`#94a3b8` are the pre-existing thumb colors, not new.
  - Both list views — single `scrollbar-light` token added to the existing scroll container; the sticky-header comment below it stays accurate (no `overflow-hidden` introduced).
  - Modal — `flex flex-col` + `max-h-[90vh]` + `shrink-0` header/footer + `flex-1 min-h-0 overflow-y-auto` body is the correct fixed-chrome/scrolling-body pattern; card `overflow-hidden` retained for corner clipping.
  - Notes editor — `max-h-[220px]` scroll wrapper; inner `min-h-[56px]` and the parent's `overflow-hidden`/rounded border/`focus-within` ring all preserved.
- Arbitrary values (`max-h-[90vh]`, `max-h-[220px]`) are acceptable per CLAUDE.md — no Tailwind scale step maps to a viewport-relative or 220px cap.
- No dead code, no `any`, no `style={{}}`, no debug logging, no secrets.

### Deviations
- None. Implemented exactly as planned.

### Required Fixes
- None.
