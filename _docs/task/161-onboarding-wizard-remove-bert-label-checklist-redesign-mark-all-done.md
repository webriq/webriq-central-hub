# 161: Onboarding Wizard — Bert Label Removal, Checklist Redesign, shadcn Tooltips, Clickable Steps Indicator & Preview Fixes

**Created:** 2026-07-17
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed (2026-07-17)

**Retitled** from the original "Onboarding Wizard — Remove Static 'Bert' Owner Label, Checklist
Checkbox Redesign & 'Mark All as Done' Button" — that shipped as originally scoped (see
Requirements/Acceptance Criteria below and the first Implementation Notes entry), but the same
session kept surfacing follow-up work on the exact same Wizard file: swapping the hand-rolled hover
tooltip for the real shadcn Tooltip component, then rolling it out across every icon-only button in
the whole Wizard flow (not just the checklist); fixing two unrelated visual bugs found along the
way (the step indicator's `ring-4` glow clipped at the top, and CSV/Excel file preview columns
being unreachable with an effectively invisible scrollbar); and finally making the step indicator
itself clickable with completion-gated navigation. All of it landed here as one continuous thread
rather than spinning up new task docs per round, matching this repo's established convention for
chat-driven live-test iteration on a single doc (see task 158's Implementation Notes for the same
pattern). See "Implementation Notes" below for the full round-by-round breakdown.

---

## Overview

Three UI changes to the Phase 1 Onboarding Wizard's per-step deliverable card
(`_onboarding-wizard.tsx`), the exact card shown in the attached screenshot (the `"Kickoff"` card
with the clock icon, `Bert` label, `In progress` badge, description, and the `CHECKLIST` list of
three items below it).

**1 — Remove the static "Bert" owner label.** `WizardDeliverableRow` (`_onboarding-wizard.tsx:4610-
4647`) renders an `owner` pill next to the quoted step name (`4640`:
`<span ...>{owner}</span>`). The value comes straight from `PROGRAMME_PHASES[0].deliverables[*]
.owner` in `src/config/customer-phases.ts` — a static config string documented as `// display
label only, not a Hub user FK` (`customer-phases.ts:20`). For every Phase 1 step this component
renders, that value is either `"Bert"` (kickoff, outcome-target, migration-checklist, content-map,
html-mockup, storage-kb) or `"PM + Bert"` (client-signoff) — i.e. every instance of this badge in
this specific component is the static "Bert" text the user wants gone. Task 157 already replaced
the *project-level* static `"Owner: Bert"` label in `_onboarding-detail.tsx` with real
`created_by_name` data; this is the one remaining static "Bert" surface, and per the user's
instruction it should simply be removed here, not replaced with a real-owner lookup (no
"Bert"-equivalent real user/role data is wired into the Wizard's per-step context, and building
that is out of scope for what was asked).

**2 — Checklist checkbox redesign.** The internal-deliverable checklist rows
(`_onboarding-wizard.tsx:2271-2288`) currently render a plain `Circle` (pending), `Clock`
(in_progress — effectively dead for this list, see below), or `CheckCircle2` (done) lucide icon.
Internal-deliverable status is already a strict two-state toggle in practice —
`toggleInternalStatus` (`4620`... actually `832`: `(current === "done" ? "pending" : "done")`) never
produces `"in_progress"` for these items, so the `Clock` branch at `2284` never fires for this
particular list. Replace the icon with a custom checkbox: unchecked = an outlined `rounded-lg`
square; checked = a fully green-filled `rounded-lg` square with a white `Check` mark — matching the
"rounded-lg square, full green fill, white check" the user described instead of the current
circle/`CheckCircle2` pair.

**3 — Hover tooltip.** Add a small hover tooltip to the right of each checklist item's label text,
reading `"Mark as Done"` when the item is unchecked and `"Uncheck"` when it's checked (clearer than
a static "Toggle" label, and consistent with how `WizardDeliverableRow` already phrases its own
action as `Mark "${name}"` for the parallel case). The codebase has no shared floating-tooltip
component (only `button.tsx` exists in `src/components/ui/`) — build this as a small inline
`group`/`group-hover:opacity-100` hover reveal, the same reveal mechanism already used elsewhere in
`v2` (e.g. `_task-drawer.tsx:218`, `_calendar-view.tsx:108`), not a new dependency.

**4 — "Mark All as Done" button.** Add a button in the checklist section's header row (top-right,
next to/aligned with the existing `Checklist` label at `2268-2270`), labeled `Mark All as Done`,
that marks every internal-deliverable item for the current step as done in one action. The wizard
already has a complete "mark all as done" flow for the *incomplete-items gate* (`handleMarkAllDone`
→ validates any field-gated item, opens a force-confirm modal if one would fail validation
(`kickoff-contacts-confirmed`, `kickoff-goals-timeline-filed`, `html-md-files`,
`signoff-agreement-filed`), otherwise calls `finalizeMarkAllDone` directly) — reuse that flow rather
than adding a second bulk-toggle code path. Wire the new button to compute this step's incomplete
items and open the same `showIncompleteModal` (`2346-2380`) that `handleContinueClick` /
`handleComplete` already use, so the button gets the existing validation/force-confirm UX for free
instead of silently bypassing required-field checks.

## Requirements

### Remove "Bert" label
- [ ] `WizardDeliverableRow` no longer renders the `owner` pill (`_onboarding-wizard.tsx:4640`).
- [ ] The `owner` prop can be dropped from `WizardDeliverableRow`'s props/call site
      (`2261-2264`) if nothing else in the component needs it after the pill is removed — leave it
      in place only if removing it would ripple into unrelated typing changes not worth the churn.
- [ ] No other "Bert" surface is touched — the Gantt legend/owner-color map
      (`_onboarding-detail.tsx:145`), the insight banner's `Owner: ${phase.owner}` text
      (`_onboarding-detail.tsx:137`), `_programme-tab.tsx:133`'s owner chip, and the phase-complete
      Cliq notification text (`complete-phase/route.ts:134`) are all out of scope (see below).

### Checklist checkbox redesign
- [ ] Unchecked internal-deliverable item: a `rounded-lg` bordered square (no fill, or the same
      subtle muted fill `WizardDeliverableRow`'s own `pending` state already uses for visual
      consistency — `isDark ? "bg-white/[0.02] border-white/[0.08]" : "bg-slate-50 border-slate-200"`
      or similar), replacing the current `Circle` icon at `2284`.
- [ ] Checked (`done`) item: fully filled `bg-green-500` (matching the codebase's existing
      `text-green-500`/green-500 "done" convention used throughout this file, e.g. `4618`) `rounded-
      lg` square with a centered white `Check` icon (already imported at the top of the file),
      replacing `CheckCircle2`.
- [ ] The in-flight `togglingKey === \`internal-${id.key}\`` "…" state (`2280` disabled path) keeps
      working — same loading affordance, new checkbox shape.
- [ ] Checkbox sizing uses a Tailwind scale value (e.g. `h-4 w-4` / `size-4`), not an arbitrary
      bracket value, per the style guide.
- [ ] Do not touch the "Incomplete checklist items" modal's own `Circle` icons (`2359`) or
      `WizardDeliverableRow`'s status icon/cfg (`4617-4622`, used for the parent step's own
      pending/in_progress/done circle+badge) — both are out of scope; see below.

### Hover tooltip
- [ ] Hovering a checklist item reveals a small tooltip positioned to the right of that item's
      label text (not the far edge of the row), reading `"Mark as Done"` when unchecked or
      `"Uncheck"` when checked.
- [ ] Built as an inline `group`/`opacity-0 group-hover:opacity-100 transition-opacity` reveal
      (matching the existing hover-reveal pattern used elsewhere in `v2`), styled with the
      isDark-prop pattern (paired light/dark Tailwind classes via `cn()`), not `dark:` classes and
      not a new shadcn/Radix Tooltip dependency.
- [ ] When the checklist is read-only (`!canEditChecklist` — pm role, or an inactive/jumped-past
      phase), suppress the "Mark as Done"/"Uncheck" tooltip (the action can't be performed) —
      mirror `WizardDeliverableRow`'s own `readOnly` handling, which swaps to an explanatory `title`
      instead of an action label.

### "Mark All as Done" button
- [ ] Button reads exactly `Mark All as Done`, sits at the top-right of the checklist section's
      header row (same row as the existing `<ListChecks size={11} /> Checklist` label at `2268-
      2270`, which becomes a `justify-between` flex row).
- [ ] Only rendered when `stepInternal.length > 0` (i.e. only for steps that have an internal
      checklist at all — same guard already used at `2266`).
- [ ] Disabled (or hidden) when every item for the current step is already `done`, and while
      `canEditChecklist` is false (pm / inactive phase — checklist is locked, same rule the
      per-item toggle already follows at `1570`).
- [ ] On click: compute this step's incomplete items the same way `handleContinueClick`
      (`1620-1624`) and `handleComplete` (`1710-1713`) already do, then reuse the existing
      `incompleteItems` state + `showIncompleteModal` flow (`2346-2380`) — i.e. calling this button
      opens the same "Incomplete checklist items" modal, whose own "Mark all as done" action
      (`handleMarkAllDone`) already handles the field-validation / force-confirm-bypass logic. Do
      not duplicate that validation logic in the new button's handler.
- [ ] This is a per-step (per-checklist-section) action — it must not be confused with, and must
      not alter, the existing "Complete Phase 1" / final-step "mark all as done" behavior in
      `finalizeMarkAllDone`'s `isLastStep` branch (`1646-1650`), which advances/completes the phase
      as a side effect. The new button never advances `stepIdx` or completes the phase on its own —
      only `finalizeMarkAllDone`'s existing `isLastStep` check does that, unchanged.

## Out of Scope / Must-Not-Change

- Removing/changing the `owner` field in `src/config/customer-phases.ts` itself, or any other
  consumer of it (Gantt legend colors in `_onboarding-detail.tsx`, the insight banner's "Owner:
  {phase.owner}" text, `_programme-tab.tsx`'s owner chip, the phase-complete Cliq notification
  text). Those show real, non-"Bert" owner values for Phases 2-5 (`Dev`, `PM`, `Jun`, `Erica`,
  `April`, `Eri`, etc.) and are unrelated to the screenshot's card.
- Replacing the removed "Bert" label with a real-owner lookup (e.g. wiring in
  `created_by_name`/project members) — the user asked for removal, not a data-driven replacement.
- Changing internal-deliverable status from its current two-state (`pending`/`done`) behavior to a
  real three-state cycle, or touching `setDeliverableStatus`/`cycle` (used only for the *parent*
  step row when it has no internal checklist, `2264`) — unaffected by this task.
- The "Incomplete checklist items" modal's own `Circle` icons (`2359`) and the top-level
  `WizardDeliverableRow` status icon/badge (`Clock`/`CheckCircle2`/`Circle` at `4617-4622`) — both
  stay as-is; only the internal-deliverable checklist rows change shape.
- Adding a shadcn/Radix `Tooltip` primitive or any new dependency — use the existing hover-reveal
  pattern already present in the codebase.
- Any change to `handleValidatedInternalToggle`'s per-field validation rules (contacts, business
  facts, html mockup files, signoff agreement) — the new button must go through the same gate, not
  around it.

## Proposed File Changes

- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx`
  - `WizardDeliverableRow` (`4610-4647`): remove the `owner` pill render; optionally drop the
    `owner` prop.
  - Checklist header row (`2266-2270`): make it `justify-between`, add the new `Mark All as Done`
    button.
  - Checklist item row (`2271-2288`): replace the `Circle`/`Clock`/`CheckCircle2` icon with the new
    square checkbox, add the hover tooltip around the label text.
  - New handler (near `handleMarkAllDone`, `1653-1670`) to compute this step's incomplete items and
    open `showIncompleteModal`, reusing existing state (`incompleteItems`, `showIncompleteModal`).
  - Call site at `2262` (`owner={step.owner}`) — drop if the prop is removed.

## Code Context

### `WizardDeliverableRow` owner pill — current (`_onboarding-wizard.tsx:4636-4645`)
```tsx
<div className="shrink-0 mt-0.5">{toggling ? <span className={cn("text-[11px]", textMuted)}>…</span> : c.icon}</div>
<div className="flex-1 min-w-0">
  <div className="flex items-center gap-2 flex-wrap">
    <span className={cn("text-[13px] font-medium", status === "done" ? cn(textMuted, "line-through") : textPrimary)}>{label}</span>
    <span className={cn("text-[10px] rounded px-1.5 py-px", isDark ? "bg-white/[0.06] text-slate-400" : "bg-slate-100 text-slate-500")}>{owner}</span>
  </div>
  <div className={cn("text-[11px] mt-0.5", textMuted)}>{description}</div>
</div>
<span className={cn("text-[11px] font-medium shrink-0 mt-0.5", status === "done" ? "text-green-500" : textMuted)}>{c.label}</span>
```
The `<span>{owner}</span>` line is the one to remove.

### Checklist section — current (`_onboarding-wizard.tsx:2259-2294`)
```tsx
<div className={cn("rounded-lg border p-3", isDark ? "border-white/[0.08]" : "border-slate-200")}>
  <WizardDeliverableRow
    name={step.name} description={step.description} owner={step.owner}
    status={stepStatus} isDark={isDark} toggling={togglingKey === step.key}
    onClick={stepInternal.length > 0 ? undefined : () => setDeliverableStatus(step.key, cycle(stepStatus))}
  />
  {stepInternal.length > 0 && (
    <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 flex flex-col gap-1.5">
      <div className={cn("text-[10.5px] font-semibold uppercase tracking-wide flex items-center gap-1.5", textMuted)}>
        <ListChecks size={11} /> Checklist
      </div>
      {stepInternal.map((id) => {
        const row = localInternal.find((r) => r.deliverable_key === id.key);
        const iStatus = row?.status ?? "pending";
        return (
          <button
            key={id.key}
            onClick={() => handleValidatedInternalToggle(id.key, iStatus)}
            disabled={togglingKey === `internal-${id.key}` || !canEditChecklist}
            className={cn(
              "w-full flex items-center gap-2 py-1 bg-transparent border-none text-left disabled:opacity-60",
              canEditChecklist ? "cursor-pointer" : "cursor-default"
            )}
          >
            {iStatus === "done" ? <CheckCircle2 size={13} className="text-green-500" /> : iStatus === "in_progress" ? <Clock size={13} className="text-blue-500" /> : <Circle size={13} className={textMuted} />}
            <span className={cn("text-[12px]", iStatus === "done" ? cn(textMuted, "line-through") : textPrimary)}>{id.name}</span>
          </button>
        );
      })}
      {checklistValidationError && (
        <p className="text-[11px] text-red-500 mt-1">{checklistValidationError}</p>
      )}
    </div>
  )}
</div>
```

### Existing "mark all as done" flow to reuse (`_onboarding-wizard.tsx:1638-1670`, `2346-2380`)
```tsx
const finalizeMarkAllDone = async (items: InternalDeliverableConfig[]) => {
  await Promise.all(items.map((item) => setInternalStatus(item.key, "done")));
  setShowIncompleteModal(false);
  setShowForceConfirmModal(false);
  setIncompleteItems([]);
  setChecklistValidationError(null);
  setContactsFieldError(false);
  setBusinessFactsFieldError(false);
  if (isLastStep) {
    await completePhase();
  } else {
    setStepIdx((s) => s + 1);
  }
};

const handleMarkAllDone = () => {
  const hasFailing = incompleteItems.some(
    (item) =>
      (item.key === "kickoff-contacts-confirmed" && !isContactsValid) ||
      (item.key === "kickoff-goals-timeline-filed" && !isBusinessFactsFilled) ||
      (item.key === "html-md-files" && !isHtmlMockupFilled) ||
      (item.key === "signoff-agreement-filed" && !isSignoffFilled)
  );
  if (hasFailing) {
    setShowForceConfirmModal(true);
    return;
  }
  finalizeMarkAllDone(incompleteItems);
};
```
`finalizeMarkAllDone`'s `if (isLastStep) { await completePhase(); } else { setStepIdx((s) => s + 1); }`
tail is specific to the *incomplete-items-gate* callers (`handleContinueClick`/`handleComplete`).
The new top-right button is not one of those callers — it just needs the validation +
`showIncompleteModal` open behavior; whether the resulting "advance/complete" side effect firing on
a manual `Mark All as Done` click is acceptable or needs a variant that skips it is an implementation
call (see Implementation Steps).

### Existing hover-reveal pattern to mirror (`_task-drawer.tsx:218`)
```tsx
<button onClick={() => deleteSubtask(s.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 hover:text-red-500 cursor-pointer transition-opacity">
  <Trash2 size={13} />
</button>
```

### `canEditChecklist` (`_onboarding-wizard.tsx:552`)
```tsx
const canEditChecklist = !isPM && isPhaseActive;
```

## Implementation Steps

1. Remove the `owner` pill from `WizardDeliverableRow` (`4640`); drop the now-unused `owner` prop
   from the component's type/destructure and its call site (`2262`) if that doesn't ripple further.
2. Redesign the checklist item row (`2271-2288`): replace the icon ternary with a small square
   checkbox (`rounded-lg`, bordered/muted when unchecked, `bg-green-500` + white `Check` when
   `done`), keeping the existing `toggling`/`disabled`/`canEditChecklist` behavior untouched.
3. Wrap the item's label `<span>` in a `relative` inline element and add a sibling tooltip `<span>`
   (`absolute left-full`, `opacity-0 group-hover:opacity-100 transition-opacity`, small dark pill,
   isDark-aware) reading `"Uncheck"` or `"Mark as Done"` based on `iStatus`; suppress it when
   `!canEditChecklist`.
4. Turn the checklist header (`2268-2270`) into a `flex items-center justify-between` row; add the
   `Mark All as Done` button on the right, gated on `stepInternal.length > 0`, disabled when all
   items are already done or `!canEditChecklist`.
5. Wire the button's `onClick` to compute this step's incomplete items (same filter as
   `handleContinueClick`/`handleComplete`) and call `setIncompleteItems(...)` +
   `setShowIncompleteModal(true)` — confirm in-app that the resulting modal's "Mark all as done"
   click, and the `finalizeMarkAllDone`'s `isLastStep`/`setStepIdx` tail, produce sensible behavior
   for a manual top-of-checklist trigger (not just the Continue-gate's original use case); if the
   auto-advance is surprising for this new entry point, add a lightweight variant/flag rather than
   changing `finalizeMarkAllDone`'s existing callers.
6. Manually verify in-browser (dark and light mode) on the Kickoff step and at least one other step
   with an internal checklist (e.g. `html-mockup` or `client-signoff`, which has field-gated items)
   to confirm both the plain-toggle and force-confirm-bypass paths still work.

## Acceptance Criteria

- [ ] The "Bert" owner pill no longer renders anywhere in the Wizard's step header.
- [ ] Every checklist item shows an outlined `rounded-lg` square when unchecked and a green-filled
      `rounded-lg` square with a white check when checked — no circles remain in this list.
- [ ] Hovering a checklist item's label shows a tooltip to its right reading "Mark as Done" or
      "Uncheck" as appropriate; no tooltip appears when the checklist is read-only.
- [ ] A "Mark All as Done" button is visible at the top-right of the Checklist header on any step
      that has an internal checklist, is disabled once everything is already done or when
      read-only, and marks all items for that step done when clicked (going through the existing
      validation/force-confirm modal when a gated item isn't actually satisfied).
- [ ] Field-gated items (contacts, business facts, html mockup files, signoff agreement) cannot be
      silently marked done via the new button without surfacing the same "Missing required fields"
      confirmation the existing flow already shows.
- [ ] No regressions to the per-step status derivation, Continue-button gating, or Phase 1
      completion flow.
- [ ] Dark and light mode both look correct (isDark-prop pattern, no `dark:` classes introduced).

## Verification

- `npx tsc --noEmit` — no new type errors.
- `pnpm lint` — no new lint errors.
- Browser walkthrough on `/onboarding/[projectId]`'s Wizard, Kickoff step: confirm no "Bert" text,
  new checkbox styling, tooltip on hover (checked + unchecked), and "Mark All as Done" button
  behavior (including the force-confirm path by leaving Contacts/Business Facts empty first).
- Repeat the checklist-only checks (checkbox styling, tooltip, Mark All as Done) on one non-Kickoff
  step with an internal checklist to confirm the change isn't Kickoff-specific.
- Confirm the pm role (read-only) still sees the checklist as non-interactive, with no tooltip and
  the new button disabled/hidden.

## Compatibility Touchpoints

None — this is an isolated client-component UI change with no API, schema, or route changes.

## Implementation Notes

### What Changed
- Removed the static `owner` pill (`"Bert"`/`"PM + Bert"`) from `WizardDeliverableRow` — dropped the
  `owner` prop from its type, destructure, and the one call site.
- Replaced the internal-checklist item's `Circle`/`Clock`/`CheckCircle2` icon with a custom
  checkbox: unchecked = outlined rounded square (border + subtle bg, isDark-aware), checked =
  `bg-green-500` rounded square with a white `Check` mark. Added a `hover:bg-…` row background and
  `transition-colors` per the style guide's "every interactive element needs a visible hover state."
- Added a right-of-text hover tooltip ("Mark as Done" / "Uncheck") using the codebase's existing
  `group`/`group-hover:opacity-100` reveal pattern (named group `group/item` scoped per row),
  suppressed when `!canEditChecklist`.
- Turned the checklist header into a `justify-between` row and added a `Mark All as Done` button,
  shown only when there's an incomplete item and the checklist is editable. It reuses the existing
  `incompleteItems`/`showIncompleteModal` state and the modal's own `handleMarkAllDone` (validation)
  → `finalizeMarkAllDone` (apply) flow — no duplicated validation logic.
- Added a `markAllAdvance` state flag (default `true`) so `finalizeMarkAllDone` only advances
  `stepIdx`/completes the phase when triggered from the Continue/Complete gate (unchanged existing
  behavior); the new inline button sets it `false` before opening the modal so it only marks items
  done and leaves the user on the current step, per the task doc's Implementation Step 5 guidance.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — all four changes above
  (`WizardDeliverableRow`, the checklist header/item render block, the new `markAllAdvance` state,
  `finalizeMarkAllDone`, and the new `handleMarkAllChecklistDone` handler).

### Deviations From Plan
- The task doc's Code Context specified `rounded-lg` for the checkbox. Live-testing in-browser
  showed this project's `--radius-lg` design token is `0.75rem` (12px — see `globals.css:44`), which
  fully rounds a small `h-4 w-4` (16px) box into a circle, directly contradicting the goal of moving
  away from circular checkboxes. Switched to the bare `rounded` utility (this project's unmodified
  4px default, not overridden by the `--radius-*` scale) at `h-5 w-5` (20px), which renders as a
  clearly rounded square — confirmed visually via screenshot zoom in-browser before/after the fix.
  The literal class name differs from the doc; the visual acceptance criterion ("rounded square, not
  a circle") is met.
- Everything else matches the plan as written (owner removal, tooltip mechanism, button placement,
  reused validation/force-confirm flow, `markAllAdvance` no-auto-advance behavior).

### Verification Run
- `npx tsc --noEmit` — PASS (no errors)
- `pnpm lint` — PASS (no errors)
- Browser walkthrough (Super Admin role, ABC Test Company Website project, `/v2/onboarding/[id]`
  Wizard):
  - Kickoff step: confirmed no "Bert" text anywhere in the step header; checklist items render as
    outlined/filled rounded squares (zoomed screenshot confirms square, not circular); hovering an
    unchecked item shows "Mark as Done" to the right of its text, hovering a checked item shows
    "Uncheck".
  - Clicked "Mark All as Done" with 2 field-gated items still empty (Contacts, Business Facts) →
    "Incomplete checklist items" modal opened with the correct 2 items → clicked "Mark all as done"
    → "Missing required fields" force-confirm modal appeared (validation preserved) → clicked "Yes,
    proceed" → all 3 items marked done, step card flipped to "Done", **stayed on Step 1 of 7** (no
    unwanted auto-advance).
  - Repeated on the Outcome target step (single, non-field-gated item): "Mark All as Done" → modal
    with the one incomplete item → "Mark all as done" → item marked done directly (no force-confirm,
    as expected since this item isn't in the gated-key list) → stayed on Step 2 of 7.
  - No console errors during the session (`read_console_messages`, `onlyErrors: true`).
  - Dark-mode toggle: no in-app theme switch is currently exposed in this build (`/v2/settings` and
    the settings sidebar link are stubs), so the dark-mode branch of every new `cn()` ternary was
    verified by code review (paired light/dark classes on every new element, matching the existing
    isDark-prop pattern) rather than a live dark-mode screenshot.
  - PM read-only behavior (`canEditChecklist` gating the tooltip and the new button) was verified by
    code review only — no PM-role test account was available in this session; the gating reuses the
    same `canEditChecklist` variable that already gated the per-item toggle before this change.

### Follow-up: Swapped the custom hover tooltip for the shadcn Tooltip primitive
Requested after the above was already in Testing: use the real shadcn/Base UI Tooltip component
instead of the hand-rolled `group-hover:opacity-100` reveal, per a reference screenshot of the
standard shadcn tooltip look (dark pill, white text, small arrow, positioned beside the trigger).

- Ran `npx shadcn@latest add tooltip` (per project convention — `npx`, not `pnpm dlx`) — added
  `src/components/ui/tooltip.tsx` (Base UI-backed, matching this project's `components.json` style
  `"base-nova"`) and the `@base-ui/react` dependency to `package.json`.
- Wrapped the root layout's `{children}` in `TooltipProvider` (`src/app/layout.tsx`) per shadcn's own
  post-install instructions — required once, globally, for any `Tooltip` usage anywhere in the app.
- In `_onboarding-wizard.tsx`'s checklist item row, replaced the manual `group/item` +
  `group-hover/item:opacity-100` absolutely-positioned span with `<Tooltip><TooltipTrigger
  render={itemLabel} /><TooltipContent side="right">…</TooltipContent></Tooltip>`, using Base UI's
  `render` prop to compose the trigger onto the existing label `<span>` (not the full-width row
  `<button>` — anchoring to the row would have positioned the tooltip off past the row's right edge
  instead of beside the short item text). Still conditionally rendered only when `canEditChecklist`,
  same as before.
- **Deviation, discovered live in-browser:** the generated `TooltipContent` uses shadcn's standard
  `bg-foreground`/`text-background` tokens, which read from this project's `.dark`-class CSS
  variables. `src/app/layout.tsx:30` hardcodes `className="dark"` on `<html>` app-wide, but v2 pages
  separately theme themselves via a JS `isDark` prop (`usePMSettings()`, **default `"light"`** —
  `src/hooks/use-pm-settings.ts:11`) that never touches the document's class list. Net effect: the
  token-based tooltip rendered as a near-white, low-contrast pill on the (default) light-mode v2
  page — confirmed by an in-browser hover screenshot showing "Uncheck" barely legible. Fixed by
  hardcoding `TooltipContent`'s Popup and Arrow to `bg-slate-900`/`text-white`/`fill-slate-900`
  instead of the theme tokens, in the shared `src/components/ui/tooltip.tsx` (a project-wide default
  for this newly-added component, not a per-call-site override), so it renders as a solid dark pill
  regardless of the token/isDark mismatch — confirmed via a follow-up hover screenshot matching the
  reference image. This is a pre-existing app-wide theming quirk (permanent `.dark` class vs.
  independent per-page `isDark` state), not something this task introduced or attempted to fix more
  broadly — out of scope beyond keeping the one new component legible.
- Verification: `npx tsc --noEmit` PASS, `pnpm lint` PASS, browser hover re-check on the Kickoff
  checklist confirmed the tooltip now renders as a solid dark pill with white text and the pointer
  arrow, positioned to the right of the item text, matching the provided reference screenshot. No
  console errors.

### Follow-up: shadcn Tooltip on the Steps indicator + every icon-only button in the Wizard
Requested next: apply the same shadcn Tooltip to the step-indicator circles (bottom placement) and
to every icon-only Add/Remove/X/View/Edit button across the Onboarding Wizard (`_onboarding-wizard.tsx`
— the file covers all 7 steps plus the Storage/KB file explorer, access-management panel, and every
modal in the flow), replacing reliance on the native `title` attribute.

- Added a small local `IconTip({ label, side, children })` helper (composes `Tooltip` +
  `TooltipTrigger` (via Base UI's `render` prop, onto the caller's own element — no wrapping
  `<button>` duplication) + `TooltipContent`) right after the file's existing utility functions, per
  "page-scoped UI" convention — not a new file, since it's only used within this one component file.
- Step indicator (each of the 7 circles): wrapped with `IconTip label={s.name} side="bottom"` —
  shows the step's full name on hover, useful since the label under each circle is truncated
  (`max-w-16 truncate`) for longer names like "90-day content map".
- Replaced `title="…"` with `IconTip` (keeping the existing `aria-label` for a11y) on every icon-only
  button found via a full-file `title=`/`aria-label=` sweep: access-management panel's Close/Transfer
  ownership/Remove-member buttons; credential-link Remove; the incomplete-checklist modal's Close;
  `TagField`'s Add/Remove (competitor URLs) and `ContactsField`'s Add contact (both `side="bottom"`,
  matching the two reference screenshots exactly); the rich-text toolbar's Bold/Italic/Underline/
  Bullet List buttons (`side="bottom"`, since they sit right below the field label with little room
  above); `FileUploadBox`'s View/Remove; the "Share with specific people" chip's Remove; both
  Permissions panels' Close (`side="bottom"`); the file-menu "Actions" trigger, the bulk-selection
  toolbar's Clear selection/Share/Move to folder/Delete, the Grid/List view toggle, the per-folder
  "Actions" trigger, and the folder-menu "Delete" item (kept its dynamic disabled-reason text —
  "System folders can't be deleted" / "Folder is not empty" — as the tooltip label, since that's
  genuinely useful info not shown anywhere else); the "Add credential/link" modal's Close
  (`side="bottom"`), its per-field Sensitive switch and Remove-field (×) button, and its own
  "Share with specific people" chip Remove; the file-preview modal's Close (`side="bottom"`); the
  HTML-mockup file list's View/Edit/Remove; and the HTML editor modal's Close (`side="bottom"`).
- **Deliberately left untouched** (native `title`, not converted): the four `<iframe title={fileName}>`
  /`"Live preview"`/`"Markdown preview"` attributes — those are the iframe's accessible name for its
  embedded document, not a hover tooltip on a button. The device-size switcher buttons in the HTML
  editor (`title={s.label}`) and `WizardDeliverableRow`'s readOnly explanation — both already show
  their label as visible text next to the icon, so a tooltip would be redundant, not clarifying.
  The grid/list file "cards" in the Storage/KB explorer (`aria-label={`Select ${f.file_name}`}`) —
  these are large, fully-labelled clickable cards (filename + icon + badge all visible), not
  ambiguous icon-only affordances, and wrapping a whole card in a tooltip risked exactly the
  "covering important text" problem this request explicitly warned against.
- Side placement was chosen per surrounding layout, not uniformly: `bottom` for anything sitting at
  the top of a panel/modal or directly above more content (Steps indicator, Add contact, Add URL,
  rich-text toolbar, every modal/panel Close button); default `top` everywhere else (small inline
  Remove/✕ icons in pill rows and lists, which have room above them).
- Verification: `npx tsc --noEmit` PASS, `pnpm lint` PASS. Browser spot-checks (Kickoff step):
  Steps indicator circle 1 ("Kickoff") and circle 4 ("90-day content map", confirming the tooltip
  shows the untruncated name) both render correctly below the circle; "Add contact" and the
  competitor-URL "Add" tooltips render exactly matching the two reference screenshots (dark pill
  below the button, small gap before the field label underneath, no overlap); the competitor-URL
  tag's "Remove" tooltip renders above the tag. No console errors. Did not individually re-verify
  every one of the ~25 converted buttons live (all use the identical, already-verified `IconTip`
  composition) — deeper Storage/KB-explorer-specific buttons (Actions menu, Grid/List toggle, bulk
  toolbar) were reviewed in code but not clicked through live in this session.

### Follow-up: Steps indicator ring clipping + CSV/Excel preview overflow, both fixed

Two visual bugs reported after the tooltip sweep above, both in `_onboarding-wizard.tsx`, unrelated
to each other beyond sharing a root cause pattern (CSS overflow interactions with flex layout).

**1 — Active step's `ring-4` glow clipped at the top.** The step-indicator row
(`overflow-x-auto px-1 -mx-1`) only padded the horizontal axis (its own comment said so: "px-1
keeps the active step's ring-4 glow from being clipped by the scroll container's edge on the
first/last circle"). Setting `overflow-x: auto` forces the browser to also compute `overflow-y` as
non-visible per the CSS spec (you can't have one axis `visible` and the other not), so the ring's
vertical bleed was being clipped by the container's own top/bottom edge on every circle, not just
the first/last — visible as the glow's top arc being flattened/cut off in the screenshots. Fixed by
changing `px-1 -mx-1` to `p-1 -m-1`, giving the ring clearance on all four sides while keeping the
row's visual position unchanged (the negative margin cancels the added padding).

**2 — CSV/Excel preview: extra columns unreachable, no scrollbar.** `CsvFilePreview`'s own root div
already had `overflow-auto`, so in isolation it should scroll — but it lived inside
`FileViewerModal`'s `<div className="flex-1 min-h-0 relative bg-slate-100">`, a flex item of the
modal's `flex flex-col overflow-hidden` card. That div had `min-h-0` (for the *main* axis, vertical,
matching the flex-col direction) but no `min-w-0` for the *cross* axis. Flex items default to
`min-width: auto`, which lets an item grow past its container's width to fit an unconstrained-width
descendant (here, `CsvFilePreview`'s `<table>` — no column-width caps, `whitespace-nowrap` cells) —
so the flex item silently grew wider than the modal instead of the inner `overflow-auto` div ever
registering an overflow condition to scroll, and the modal card's `overflow-hidden` just hard-clipped
the excess with no way to reach it. This is the exact same class of bug `min-h-0` was already added
to prevent, just on the other axis. Fixed by adding `min-w-0` alongside the existing `min-h-0`.
Confirmed this is a general fix (not CSV-specific) — the same wrapper also hosts the image, PDF,
HTML, Markdown, and Office (`view.officeapps.live.com`-embedded xlsx/docx) preview branches in
`FilePreview`, all of which benefit from the same properly-constrained container width.

- Verification: `npx tsc --noEmit` PASS, `pnpm lint` PASS. Live browser check on the Kickoff step:
  ring glow now renders as a full, symmetric halo around the active circle (zoomed screenshot
  comparison, no top clipping). For the CSV fix, uploaded a synthetic wide CSV (11 columns) to the
  Business Facts file box, opened its preview, and confirmed scrolling right reveals every column
  through "Notes" that was previously unreachable — the fix works via functional scroll (macOS hides
  the scrollbar chrome until interaction, which is expected/unrelated). Removed the test file after
  verifying, leaving no test data behind. No console errors.

### Follow-up: make the CSV/Excel preview's scrollbar actually visible at rest

The previous entry's "macOS hides the scrollbar chrome until interaction, which is expected" was
**wrong** — re-investigated after the user pointed out the scrollbar still wasn't visible without
using the keyboard. Root cause: my earlier fix added `[&::-webkit-scrollbar-thumb]:bg-slate-300`
etc. (Tailwind arbitrary-variant bracket syntax) to `CsvFilePreview`'s root div, but Tailwind v4
never generates any CSS for that selector — confirmed by dumping every `document.styleSheets` rule
containing `webkit-scrollbar` in the live page: only the three *global* rules from `globals.css`
were present (`::-webkit-scrollbar`, `-track`, `-thumb`), none scoped to the bracket selector. So
the override silently did nothing, and the global thumb color — `oklch(1 0 0 / 12%)`, a translucent
**white** tuned for the Hub's permanently-dark surfaces — was rendering white-on-white against this
preview's `bg-white`, i.e. really-there but invisible at any opacity a human would call "visible".
Confirmed via `getBoundingClientRect()`/`scrollWidth` vs `clientWidth` that the browser *was*
reserving the 5px scrollbar track the whole time (classic, non-overlay, per the global
`::-webkit-scrollbar { height: 5px }` rule) — this was purely a contrast bug, not a missing-scrollbar
or OS-overlay-hiding bug as first assumed.

- Fix: added a `.scrollbar-light` class in `globals.css` (plain CSS, targeting
  `::-webkit-scrollbar-track`/`-thumb`/`-thumb:hover` directly with slate-100/300/400 hex values) —
  written as raw CSS specifically because Tailwind can't reach these pseudo-elements via arbitrary
  variants, matching how the *existing* app-wide scrollbar rule is already hand-written raw CSS in
  the same file, not a Tailwind utility. Applied `scrollbar-light` as a plain class string alongside
  the Tailwind classes on `CsvFilePreview`'s root div, replacing the non-functional bracket syntax.
- Verification: `npx tsc --noEmit` PASS, `pnpm lint` PASS. Confirmed the new rules compile
  (`document.styleSheets` now shows `.scrollbar-light::-webkit-scrollbar-track { background:
  rgb(241,245,249) }` etc.) and, live, the horizontal scrollbar now renders as a visible gray bar at
  the bottom of the CSV preview **without any interaction** — no hover, no scroll, no keyboard —
  immediately signalling there's more content, which is what was actually being asked for. No
  console errors. Test file removed again after verifying.

### Follow-up: Steps indicator made clickable, gated on current-step completion

Requested: let the 7 step circles jump directly to any step, but restricted to "completed/previous
steps" — clicking ahead to an unreached step should be blocked with an explanatory alert unless the
currently-viewed step is done or overdue.

- Added `handleStepIndicatorClick(i)`: `i === stepIdx` no-ops; `i < stepIdx` (already-reached
  steps) or `isPM` (mirrors `handleContinueClick`'s own unconditional pm bypass — pm's view is
  read-only, nothing at risk in letting them jump anywhere) always navigates immediately via
  `setStepIdx(i)`. For `i > stepIdx` (an unreached step), navigation is only allowed when
  `stepStatus === "done"` (the real, DB-derived status of the step currently being viewed — not the
  indicator's own `i < stepIdx` checkmark convention, which marks any passed index regardless of
  true completion) or `currentDay > step.dayEnd` (the current step's overdue check, `step`/
  `currentDay` already in scope). Otherwise sets `stepGateAlert` to `"{step.name}" needs to be
  completed first before continuing to the other step.` and blocks the jump.
- Turned each step circle's `IconTip`-wrapped `<div>` into a `<button>` (`aria-label`, `cursor-
  pointer`, `hover:opacity-80` per the style guide's visible-hover-state rule) calling the new
  handler — Base UI's `TooltipTrigger` `render` composition merges its own hover/focus wiring onto
  the button without touching the click handler, same pattern already used elsewhere in this file.
- Added a `stepGateAlert: string | null` state and a small modal (visually identical to the
  existing "Missing required fields" force-confirm modal — `AlertTriangle` icon, title, message,
  single primary "OK" button) rather than a native `window.alert()`, matching this file's
  established custom-modal convention instead of a jarring, unstyled browser dialog.
- Verification: `npx tsc --noEmit` PASS, `pnpm lint` PASS. Live browser test: from Kickoff (done),
  clicking ahead to "90-day content map" (step 4, unreached) navigated immediately — current step
  was done, so the jump was allowed. Navigated back to Migration checklist (step 3, genuinely
  "Pending", not done) and clicked ahead to "Storage folder + KB" (step 6) — the alert modal
  appeared reading exactly `"Migration checklist" needs to be completed first before continuing to
  the other step.`; clicking OK closed it and left the wizard on Migration checklist, unchanged.
  Backward navigation (step 3 → step 1) still worked normally throughout. No console errors. Did
  not live-test the overdue bypass (`currentDay > step.dayEnd`) or the pm-role bypass — both were
  code-reviewed against the exact same `currentDay`/`step.dayEnd`/`isPM` values already used
  elsewhere in this file (the outcome-target auto-progress effect and `handleContinueClick`
  respectively), not independently re-derived.

### Follow-up: restored missing field validation on the Outcome Target checklist item

User caught a real gap while re-testing: checking "Agreed measurable outcomes for the 120-day
programme filed" succeeded with the Outcome Target text/file field still completely empty, no
error shown — unlike Kickoff's two gated items, which correctly block. Traced this to
`handleValidatedInternalToggle` (`_onboarding-wizard.tsx`): it only ever validated four of the five
field-backed checklist keys (`kickoff-contacts-confirmed`, `kickoff-goals-timeline-filed`,
`html-md-files`, `signoff-agreement-filed`) — `outcome-target-filed` was never in that list, so it
fell through to the function's own documented "no-op passthrough for any key it doesn't
specifically validate" behavior. This predates this session entirely (confirmed by reading the
function's pre-existing comment, never touched by any earlier round here) — not a regression from
the checklist redesign — but the user asked for it fixed now, matching the established pattern.

- Added a `key === "outcome-target-filed" && !isOutcomeFilled` branch to
  `handleValidatedInternalToggle`, alongside the four existing ones — `isOutcomeFilled` (`stripHtml
  (outcomeText).length > 0 || outcomeFiles.length > 0`) already existed and already gated the
  Continue button for this same step, just was never wired into the checkbox's own click handler.
  Sets `checklistValidationError` + `setOutcomeFieldError(true)` (the same flag that highlights the
  text field red), mirroring the Kickoff-fields pattern exactly.
- Added the same key/check to `handleMarkAllDone`'s `hasFailing` list, so the checklist's "Mark All
  as Done" button (and the Continue-gate's own incomplete-items modal) now correctly routes through
  the "Missing required fields" force-confirm modal for this item too, instead of silently marking
  it done — this was the same underlying gap, just reached through a different entry point.
- Added `if (!isOutcomeFilled) setOutcomeFieldError(true);` to `handleReview`, matching the two
  existing Kickoff-field lines, so choosing "Review" from the force-confirm modal also highlights
  the empty Outcome Target field, not just Kickoff's.
- Verification: `npx tsc --noEmit` PASS, `pnpm lint` PASS. Live browser test on a fresh Outcome
  Target step (field empty, item unchecked): clicking the checkbox directly left it unchecked and
  showed "Fill in the agreed measurable outcomes — text or an attached document — before marking
  this done." under the item, plus the existing red field-highlight/error text on the text area
  itself. Clicking "Mark All as Done" opened the incomplete-items modal → its own "Mark all as
  done" now correctly opened the "Missing required fields" force-confirm modal (previously it
  would have silently completed). No console errors.
