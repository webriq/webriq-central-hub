# 421: Timeline Tab — P0 Fixes: Keyboard/Touch Access, Unscheduled Deliverables, Drag Feedback

**Created:** 2026-10-05
**Priority:** HIGH
**Type:** fix + enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Output of the Project > Timeline tab audit (P0 group). Three correctness/accessibility gaps, across both Timeline engines:

1. **Keyboard + touch access (audit U1, U2, U3).** StackShift I `DeliverableCard` is reachable only by mouse for its extra functions: schedule drag/resize is pointer-only (resize handles are unlabeled `<div>`s), the description/owner/date hover card is `onMouseEnter`/`onMouseLeave` only, and the checklist badge (`3/5`) has no `aria-label`/`aria-expanded`.
2. **Unscheduled generic deliverables are invisible (M8).** `GenericSwimlaneLane` drops any tasklist with a null `day_start`/`day_end` (and any shifted fully outside the window), then shows "No deliverables yet" even when tasklists exist — misleading.
3. **Drag feedback (U7, U8).** While dragging a StackShift deliverable the user sees no date, only a moving bar; a failed save sets a page-level `error` at the top of the grid (`handleScheduleChange`), which is off-screen when the grid is scrolled, and the bar silently snaps back.

## Requirements

### A. Keyboard / touch access
- [ ] The deliverable details (name, description, owner chips, date range, % complete) are available without a mouse: shown on keyboard focus of the card button **and** on touch tap-and-hold is not required — instead expose the same content via `aria-describedby` and show the card on `focus-visible`. Hover behaviour is unchanged.
- [ ] The checklist badge button gets `aria-label="Checklist, {done} of {total} done"`, `aria-expanded`, `aria-haspopup="dialog"`; the popover closes on `Escape` and returns focus to the badge.
- [ ] Schedule editing has a keyboard path for users with `canEditSchedule`: with the card button focused, `Alt+←/→` moves the bar by 1 day, `Alt+Shift+←/→` resizes the end edge by 1 day (clamped to the phase via existing `clampDragToPhase`), committing through the existing `onScheduleChange`. A visually-hidden hint (`aria-keyshortcuts` + `sr-only` text) documents it.
- [ ] Resize handles get `role="separator"`-free treatment: mark them `aria-hidden` (keyboard path replaces them) and keep the pointer behaviour.
- [ ] Live region (`role="status"`, `sr-only`) announces committed schedule changes ("Brand assets moved to Oct 8 – Oct 12") and failures.

### B. Unscheduled generic deliverables
- [ ] In `GenericSwimlaneLane`, tasklists with null day range **or** shifted entirely outside `[1, totalDays]` are collected into `unscheduled` instead of dropped.
- [ ] When expanded, an "Unscheduled (N)" row renders beneath the cards: one pill per tasklist (name + `done/total`), clickable → same `onOpenTasklist` destination as scheduled cards.
- [ ] "No deliverables yet" shows only when the milestone has zero tasklists; otherwise the unscheduled row (or cards) shows.
- [ ] Lane label count line unchanged; the collapsed lane shows a small `N unscheduled` text in the span strip (visible without expanding) when N > 0.

### C. Drag feedback
- [ ] While dragging/resizing, a small floating chip over the card shows the live range (`Oct 8 – Oct 12 · 5d`), using the existing `formatDeliverableDateRange` + `startDate`.
- [ ] When the drag hits the phase clamp, the chip shows `Phase limit` styling (amber) so the stop isn't silent.
- [ ] A failed schedule save reverts (existing behaviour) **and** shows an inline error chip on the affected card for ~5 s (and via the live region), not only the page-level text. The page-level `error` stays as a fallback.
- [ ] `Escape` during a drag cancels it without saving (restores `livePreview = null`, `dragState = null`).

## Out of Scope / Must-Not-Change

- No new scheduling features (no drag in the generic engine, no dependencies, zoom, filters — those are P1/P2 audit items).
- No schema/API change: `PATCH .../deliverables/[key]/schedule` untouched.
- Visual design of cards/lanes otherwise unchanged; v2 `isDark`-free hex palette convention kept; Tailwind classes only (no new `style={{}}` beyond computed positions the grid already needs).
- Wheel-hijack, Jump menu Escape/outside-click, realtime in generic view, collapse persistence — separate (P1/P2) tasks.
- Do not run git commands.

## Proposed File Changes

`_onboarding-detail.tsx` is already ~1,800 lines, so the card must be **extracted, not grown**.

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/v2/[projectId]/_deliverable-card.tsx` | Create (~230) | Move `DeliverableCard` + `ProgressRing` out of `_onboarding-detail.tsx`; add focus-visible details card, aria on badge, Escape handling, drag chip, inline error chip. |
| `src/app/(hub)/projects/v2/[projectId]/_deliverable-card-popovers.tsx` | Create (~120) | Hover/focus details card and checklist popover (portal) so the card file stays under the limit. |
| `src/app/(hub)/projects/v2/[projectId]/_use-deliverable-schedule-drag.ts` | Create (~120) | Hook: pointer drag + keyboard nudge + Escape cancel → `{ livePreview, dragging, clamped, handlers }`. Wraps existing `clampDragToPhase`. |
| `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` | Modify (net −~300) | Import the extracted card; make `handleScheduleChange` return success/failure (Promise<boolean>) so the card can show its own error; add the `sr-only` live region. |
| `src/app/(hub)/projects/v2/[projectId]/_generic-swimlane-lane.tsx` | Modify (118 → ≤200) | `unscheduled` collection + row; collapsed-strip count; fix empty-state condition. |

## Code Context

### Dropped deliverables — `_generic-swimlane-lane.tsx:38-41, 84-88`

```tsx
const placed = tasklists
  .filter((tl) => tl.day_start != null && tl.day_end != null)   // ← unscheduled silently dropped
  .map(...)
  .filter((p) => p.end >= p.start);                              // ← out-of-window silently dropped
...
{placed.length === 0 && <div>… No deliverables yet</div>}         // ← wrong when tasklists exist
```

Change to partition `tasklists` into `placed` / `unscheduled`, and gate the empty state on `tasklists.length === 0`.

### Pointer-only interaction — `_onboarding-detail.tsx:374-404, 490-491, 512-519, 549`

`beginDrag`/`handleDragMove`/`endDrag` use pointer events only; `hovered` state is set by `onMouseEnter/Leave`; badge `<button>` has no aria. `handleScheduleChange` (`:1286`) swallows failure into page `error`.

### Reuse

`clampDragToPhase`, `formatDeliverableDateRange`, `DAY_WIDTH`, `CARD_INSET`, `ROW_HEIGHT`, `PHASE_VISUALS`, `ownerChips`. Export what the new files need from a small shared module if they would otherwise import back from `_onboarding-detail.tsx` (avoid a circular import — the generic files already import from it; do not add more).

## Implementation Steps

1. Extract `ProgressRing` + `DeliverableCard` verbatim into `_deliverable-card.tsx`; re-import in `_onboarding-detail.tsx`. Confirm no behaviour change (`tsc` + manual).
2. Move the drag logic into `_use-deliverable-schedule-drag.ts`; add `Escape` cancel, keyboard nudge, and a `clamped` flag.
3. Move hover card + checklist popover into `_deliverable-card-popovers.tsx`; add `focus-visible`/`aria-describedby`, badge aria, popover Escape + focus return.
4. Add the live-range chip and inline error chip; change `handleScheduleChange` to resolve a boolean; add the page-level `sr-only` live region.
5. Fix `GenericSwimlaneLane` (partition, Unscheduled row, collapsed count, empty-state condition).
6. Verify with `npx tsc --noEmit`, `pnpm lint`, line counts.
7. Browser acceptance (below), including keyboard-only and a throttled/offline failure case.

## Acceptance Criteria

- [ ] Tabbing to a deliverable card shows its details card and announces name, % and date range to a screen reader; no mouse needed.
- [ ] Checklist badge announces "Checklist, 3 of 5 done", toggles `aria-expanded`, closes on Escape and refocuses the badge.
- [ ] As an admin/marketing user, `Alt+→` moves a focused card 1 day and persists; `Alt+Shift+→` extends it; both stop at the phase edge and the live region announces the new range.
- [ ] Mouse drag shows a live date-range chip; hitting the phase edge turns it amber; Escape mid-drag cancels with no request sent.
- [ ] Forcing the PATCH to fail (offline) reverts the card and shows an inline error on that card even when scrolled far from the top of the page.
- [ ] Generic project with tasklists lacking `day_start`/`day_end` shows them in "Unscheduled (N)" and they open Tasks; a milestone with zero tasklists still says "No deliverables yet"; collapsed lane shows "N unscheduled".
- [ ] StackShift I and generic Timelines otherwise render identically to before.
- [ ] `_onboarding-detail.tsx` shrinks; every new/modified file ≤ ~250 lines; `npx tsc --noEmit` and `pnpm lint` clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
wc -l "src/app/(hub)/projects/v2/[projectId]/_deliverable-card"*.tsx \
      "src/app/(hub)/projects/v2/[projectId]/_use-deliverable-schedule-drag.ts" \
      "src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx" \
      "src/app/(hub)/projects/v2/[projectId]/_generic-swimlane-lane.tsx"
# Manual (pnpm dev): StackShift I project Timeline as admin — mouse drag, keyboard nudge, Escape,
# offline failure; same page as a pm/developer (read-only, details still reachable by focus).
# Generic project with undated tasklists — Timeline lane, collapsed + expanded.
```

## Compatibility Touchpoints

- No env, migration, packaging or API impact. Source of audit: Timeline tab audit, 2026-10-05 (items U1–U3, U7, U8, M8). Builds on task 420 (`generic-timeline.ts`, lane extraction).

## Open Questions (defaults chosen — flag to change)

1. **Keyboard shortcut choice** — default `Alt+←/→` (move) and `Alt+Shift+←/→` (resize end). Alternative: an explicit "Edit dates" focus mode with plain arrows.
2. **Touch** — default: tap focuses the card and reveals the details card (no long-press). Drag by touch stays out of scope (pointer events already cover pen/touch where `touch-action` allows).
3. **Unscheduled placement** — default: a row under the cards, not a side panel.

## Implementation Notes

### What Changed
- **Keyboard/touch:** focusing a deliverable card (`:focus-visible`) shows the details card; an always-present `sr-only` description is wired via `aria-describedby`. Checklist badge has `aria-label`/`aria-expanded`/`aria-haspopup`; its popover is `role="dialog"`, closes on Escape and returns focus to the badge. Alt+←/→ moves, Alt+Shift+←/→ resizes the end (clamped to the phase); `aria-keyshortcuts` set; resize handles `aria-hidden`.
- **Drag feedback:** live range chip (`Oct 8 – Oct 12 · 5d`, amber + "Phase limit" when clamped); Escape cancels a drag with no request; failed save shows a `role="alert"` chip on the card for 5 s plus an `sr-only` live-region message.
- **Generic lane:** tasklists with no day range or fully outside the window go to an "Unscheduled (N)" pill row (sticky so it stays visible when scrolled sideways), each opening Tasks; "No deliverables yet" only when the milestone has zero tasklists; lane label shows "· N unscheduled".
- Details/checklist cards now clamp to the viewport's right edge.

### Files Changed
- New: `_gantt-shared.ts` (107), `_deliverable-card.tsx` (282), `_deliverable-card-popovers.tsx` (104), `_progress-ring.tsx` (44), `_use-deliverable-schedule-drag.ts` (103)
- Modified: `_onboarding-detail.tsx` (1,800 → 1,385; re-exports the shared constants so existing importers are unaffected; `handleScheduleChange` returns `Promise<boolean>`), `_generic-swimlane-lane.tsx` (118 → 151)

### Deviations From Plan
- Added `_gantt-shared.ts` (constants/helpers) and `_progress-ring.tsx` to avoid a circular import and keep the card under the length limit.
- Live region is per-card (`role="status"` in each card) instead of one page-level region; the inline error chip is per-card as planned.
- The "N unscheduled" collapsed-state hint lives in the lane's label cell (always visible), not the span strip, which can sit thousands of pixels off-screen.
- Impeccable hook flagged 7px/9px font sizes in the moved details/checklist popovers — copied verbatim from the existing card, kept for consistency.

### Verification Run
- `npx tsc --noEmit` — PASS
- `eslint` on all touched files — PASS (unused `DeliverableConfig` import removed)
- Browser acceptance (2026-10-05, local dev, Chrome, Super Admin; schedule PATCH stubbed to fail so no customer data was written):
  - Tab-focus on a deliverable card → details card shows, `aria-describedby` text resolves, `aria-keyshortcuts` set — PASS (Hello Homes GR)
  - `Alt+←` → PATCH day 30→29 issued, stubbed 500 → card reverted, `role="alert"` chip + live-region text shown, page-level error also shown — PASS
  - `Alt+→`, `Alt+Shift+→`, `Alt+Shift+←` at the phase edge → no request sent (clamped) — PASS
  - Pointer drag (synthetic events) → live range chip ("Aug 30 – Aug 31 · 2d"); dragging past the phase start → amber "· Phase limit"; Escape → chip gone, no request, bar back at original position — PASS
  - Checklist badge (Studio Belmont, Phase 1) → `aria-label="Checklist, 0 of 3 done"`, Enter opens `role="dialog"` with 3 items (`aria-expanded=true`), Escape closes and focus returns to the badge — PASS
  - Generic Timeline, milestone with zero tasklists (UFP International) → "No deliverables yet" still shown — PASS
  - **"Unscheduled (N)" row — NOT EXERCISED:** no existing generic-engine project has a tasklist (UFP, Salas Ayala: 0; Baoase is on the StackShift engine). Covered by `tsc`/eslint only; needs a milestone with a tasklist whose `day_start`/`day_end` are null.
  - Real (non-synthetic) mouse drag and touch not run, to avoid writing schedule overrides to real customer projects.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. All new/modified files are within length guidance (largest: `_deliverable-card.tsx` 282, `_generic-swimlane-lane.tsx` ~152); `_onboarding-detail.tsx` shrank 1,800 → ~1,385. No `any`, dead code, debug logging or commented-out code. Drag/keyboard logic is isolated in a hook, popovers and `ProgressRing` in their own files, shared Gantt constants in `_gantt-shared.ts` (no circular import from the card).
- Fixes applied during review: removed a dangling "Deliverable card" section header left in `_onboarding-detail.tsx` after the extraction; dropped a pass-through `rangeLabel` wrapper in `_deliverable-card.tsx` in favour of `formatDeliverableDateRange` directly; refreshed the stale header comment in `_generic-swimlane-lane.tsx` (tasklists outside the window are now listed as Unscheduled, not skipped). `tsc` and eslint re-run: PASS.
- Left as-is: `max-w-[calc(100vw-20rem)]` on the Unscheduled row (no Tailwind scale step expresses it); popover width constants (256/224) mirror the `w-64`/`w-56` classes beside them.

### Deviations
- Minor: extra files `_gantt-shared.ts` and `_progress-ring.tsx` (circular-import avoidance / file length); per-card instead of page-level live region; "N unscheduled" hint in the label cell rather than the span strip. All documented in Implementation Notes.
- Out-of-scope boundaries respected: no API/schema change, no drag in the generic engine, no P1/P2 audit items.
- Note for testing: the "Unscheduled (N)" row has not been exercised in a browser (no generic project has tasklists); see Verification Run.

### Required Fixes
- None.
