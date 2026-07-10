# 127: DeliverableCard — Progress-Ring Redesign, Auto-Status from Checklist, Click-to-Wizard-Step & Hover Detail Popover

**Created:** 2026-07-10
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Redesign `DeliverableCard` (the Gantt-positioned bar in `_onboarding-detail.tsx`'s 120-Day Programme timeline) and change its interaction model:

1. **Visual**: replace the current icon+name pill with a progress-bar card — a circular pie/ring progress indicator (or a checkmark when 100%), the deliverable's title, and a percentage. The card's own bar fill shows the completed portion in solid phase color and the remaining portion as a light, diagonal-striped "track" (reference: attached tablet mockup, `Prototyping 89%`-style bars).
2. **Interaction**: clicking a Phase-1 card no longer cycles its status (`pending → in_progress → done`). It now navigates into the Onboarding Wizard, jumped directly to that deliverable's step. Non-Phase-1 cards stay non-interactive (unchanged).
3. **Status source of truth**: for sub-phases that have an internal-deliverables checklist (Bert's internal checklist, task 122/123), the deliverable's status is now derived automatically from that checklist's completion instead of being manually toggled. Sub-phases with no checklist keep manual completion via the existing `WizardDeliverableRow` control inside the wizard.
4. **Hover**: hovering any card (any phase) shows a lightweight detail popover — title, description, owner(s)/users involved, and the day range as real calendar dates. No graph/chart in this popover (unlike the reference image's tooltip, which has one — explicitly excluded per the request).

This changes both `_onboarding-detail.tsx` and `_onboarding-wizard.tsx`, plus the internal-deliverables PATCH route (to add the auto-status-derivation side effect) and the deliverables PATCH route stays as-is (still used by the wizard's own manual-completion path).

## Requirements

- [x] `DeliverableCard` renders: a circular progress indicator (pie/ring fill proportional to `percentage`, or a checkmark glyph when `percentage === 100`), the deliverable `name`, and a `{percentage}%` label. The circle is visually prominent (bigger than the current 13px status icons — target ~22–26px). *(Superseded visually by Follow-up Refinements 1–6: the indicator became a filled pie with an outer ring rather than a stroke-only ring, and the 100% state reuses the same ring+pie structure with a white checkmark — same requirement, refined execution.)*
- [x] The card's bar background itself is a progress track: the filled (completed) portion, left-to-right proportional to `percentage`, renders in the phase's solid color (`PHASE_VISUALS[n].solid`); the remaining portion renders as a lighter tint with a diagonal-stripe hatch pattern (`repeating-linear-gradient`, inline `style` — no Tailwind utility expresses a diagonal stripe, so this is the documented CLAUDE.md exception). *(Stripe width thinned in Follow-up Refinement 3.)*
- [x] `percentage` per card:
  - If the deliverable has internal checklist items (`internalDeliverablesForSubPhase(d.key).length > 0`, only ever true for Phase 1): `Math.round(doneInternal / internalItems.length * 100)`.
  - Otherwise (no checklist — includes every Phase 2–5 deliverable and Phase 1's `kickoff`/`outcome-target`/`client-signoff`): fall back to a status-based mapping — `pending → 0`, `in_progress → 50`, `done → 100`.
- [x] Clicking a Phase-1 `DeliverableCard` (`interactive` stays gated to `phase.number === 1`, unchanged) no longer PATCHes deliverable status. It opens the Onboarding Wizard (`setWizardOpen(true)`) with `stepIdx` initialized to that deliverable's step (`STEPS.findIndex(s => s.key === d.key)`), not always step 0.
- [x] The existing "Onboarding Wizard" header button (`_onboarding-detail.tsx:713-721`) keeps opening at step 0 (no specific step requested).
- [x] Non-Phase-1 `DeliverableCard`s remain non-interactive (`cursor-default`, no click handler) — only the visual/hover changes apply to them.
- [x] Hovering any `DeliverableCard` (mouse enter on the card, not the existing internal-checklist `ListChecks` badge) shows a popover with: deliverable name, description, owner(s) (parsed via the existing `ownerChips` logic or the raw `owner` string), and the day range rendered as real calendar dates (`addDays(startDate, dayStart - 1)` .. `addDays(startDate, dayEnd - 1)`, formatted like the existing `DateColumnHeader` does). No chart/graph in this popover. *(Popover also gained a `{percentage}%` label per Follow-up Refinement 7.)*
- [x] The existing `ListChecks` internal-deliverables count badge and its click-to-toggle popover (`_onboarding-detail.tsx:224-271`) are preserved as-is and remain independent of the new hover-detail popover (different trigger: click vs. hover; different content). *(Superseded by Follow-up Refinement 7: per later user direction, this popover no longer toggles status on click — each row now navigates to the owning wizard step instead, matching the DeliverableCard's own click behavior. Status display/strikethrough is unchanged.)*
- [x] For sub-phases **with** an internal checklist, `PATCH /api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]` also recomputes and updates the parent `customer_deliverables` row's status as a side effect: all internal items done → `done`; at least one non-pending → `in_progress`; none started → `pending`. Only updates when the computed value differs from the current one.
- [x] The route's response shape changes to include the (possibly) updated parent deliverable: `{ internalDeliverable: OnboardingInternalDeliverableRow, deliverable: CustomerDeliverableRow | null }` (`deliverable` is `null` when no parent-status change occurred). Both callers (`_onboarding-detail.tsx`'s `handleToggleInternalDeliverable` and `_onboarding-wizard.tsx`'s `setInternalStatus`) are updated to read the new shape and merge `deliverable` into their respective deliverable state when non-null.
- [x] In `_onboarding-wizard.tsx`, `WizardDeliverableRow`'s manual click-to-cycle is disabled (`toggling`-style read-only render, no `onClick`) for any step whose `stepInternal.length > 0` — its status is now auto-derived and must not be fought by a manual click. Steps with no checklist (`kickoff`, `outcome-target`, `client-signoff`) keep the existing manual click behavior unchanged.
- [x] `npx tsc --noEmit` passes with no new errors.

## Out of Scope / Must-Not-Change

- Do not change `DAY_WIDTH`, `TOTAL_DAYS`, `ROW_HEIGHT`, `ROW_GAP`, `LABEL_WIDTH`, or `LANE_TOP_PADDING`.
- Do not change `assignTracks`, `internalDeliverablesForSubPhase`, `getCurrentProgrammeDay`, or any deliverable/phase data in `customer-phases.ts` beyond what's needed for the response-shape change on the internal-deliverables route (no changes to `customer-phases.ts` are actually needed for that).
- Do not add a new column/migration — the auto-status derivation is pure application logic over the existing `status` columns on `customer_deliverables` and `onboarding_internal_deliverables`. No schema change.
- Do not change `/api/projects/[projectId]/programme/deliverables/[deliverableKey]` (the deliverable-status PATCH route) — it stays exactly as-is; it's still called directly by the wizard's manual-completion path for checklist-less steps.
- Do not change `JumpToPhaseMenu`, `scrollToToday()`/"Jump to today" FAB, the wheel-to-horizontal-scroll handler (task 126), or the reminders strip.
- Do not touch `OnboardingWizard`'s Kickoff/Storage+KB form fields, autosave effects, file upload, or the `handleComplete`/Phase-1-complete flow.
- Do not add a live-ticking interval/poller for percentage recompute — it's derived on each existing render from already-fetched/subscribed state, same as today's `doneInternal` count.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify | Redesign `DeliverableCard` (progress ring + striped-track bar), remove click-to-cycle, add click-to-wizard-step, add hover detail popover, thread `startDate`/phase color/percentage down through `Swimlane`, remove now-dead `handleToggleDeliverable`/`onToggleDeliverable` plumbing, add `wizardStartStepKey` state |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Accept `initialStepKey` prop to open on a specific step; disable manual click on `WizardDeliverableRow` when the step has internal checklist items; read new `{ internalDeliverable, deliverable }` response shape from `setInternalStatus` and merge `deliverable` into `localDeliverables` |
| `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts` | Modify | After updating the internal deliverable, recompute + update the parent `customer_deliverables` row's status from all sibling internal items' statuses; return `{ internalDeliverable, deliverable }` |

## Code Context

### `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx`

Current `DeliverableCard` (status icon + name + owner chips + day badge, click cycles status):

```tsx
const icon = status === "done"
  ? <CheckCircle2 size={13} className="text-[#16A34A] shrink-0" />
  : status === "in_progress"
    ? <Clock size={13} className="text-[#2563EB] shrink-0" />
    : <span className="h-3 w-3 shrink-0 rounded-full border-2 border-[#CBD5E1]" />;

<button
  type="button"
  onClick={interactive ? onToggle : undefined}
  disabled={!interactive || toggling}
  ...
>
```

`onToggle` is passed in from `Swimlane` as `() => onToggleDeliverable(d.key, deliverableStatusMap.get(d.key) ?? "pending")`, which calls `OnboardingDetail`'s `handleToggleDeliverable` → PATCHes `/api/projects/[projectId]/programme/deliverables/[deliverableKey]`. This whole chain (`handleToggleDeliverable`, the `onToggleDeliverable` prop on `Swimlane`/`DeliverableCard`) is removed; replace with an `onOpenWizardStep: () => void` prop that the card's button calls when `interactive` is true.

`Swimlane` already computes `visual = PHASE_VISUALS[phase.number]` — pass `visual` down to each `DeliverableCard` instead of just `track`/`status`, so the card can color its own progress fill without recomputing.

`startDate` is a local const inside `OnboardingDetail` (`const startDate = new Date(programmeStartedAt);`, ~line 655) computed after the `!programmeStartedAt` early return — thread it down through `Swimlane` into `DeliverableCard` for the hover popover's date range. `addDays` (top of file) and the `toLocaleDateString` pattern used by `DateColumnHeader` are the formatting building blocks to reuse.

The existing internal-checklist popover pattern (portal + `useEffect` position calc on `badgeRef`, outside-click via `mousedown` listener) is the template to copy for the new hover popover — but trigger on `onMouseEnter`/`onMouseLeave` of the card container instead of click, and there's no outside-click dismissal needed (hover popovers close on `onMouseLeave`).

`wizardOpen` render branch (~line 598-615) instantiates `<OnboardingWizard ... />` with no step-control prop today — add `initialStepKey={wizardStartStepKey}`.

### `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx`

```tsx
const [stepIdx, setStepIdx] = useState(0);
```

Change to derive from a new `initialStepKey?: string` prop:

```tsx
const [stepIdx, setStepIdx] = useState(() => {
  const idx = STEPS.findIndex((s) => s.key === initialStepKey);
  return idx >= 0 ? idx : 0;
});
```

`setInternalStatus` (line 109-124) currently does:

```tsx
const updated: OnboardingInternalDeliverableRow = await res.json();
setLocalInternal((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
onInternalDeliverableChange(updated);
```

Update to read `{ internalDeliverable, deliverable }` and, when `deliverable` is non-null, also merge it into `localDeliverables` + call `onDeliverableChange(deliverable)` (the prop already exists and is already used by `setDeliverableStatus`).

`WizardDeliverableRow` (bottom of file, ~line 461-487) takes an `onClick` unconditionally. Where it's invoked (~line 314-318):

```tsx
<WizardDeliverableRow
  name={step.name} description={step.description} owner={step.owner}
  status={stepStatus} isDark={isDark} toggling={togglingKey === step.key}
  onClick={() => setDeliverableStatus(step.key, cycle(stepStatus))}
/>
```

When `stepInternal.length > 0`, pass `onClick={undefined}` (or a new `readOnly` prop) so the row renders status-only, matching the "auto-derived, not manually toggleable" requirement.

### `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts`

Current route updates only the one internal row and returns it directly (see full file, 52 lines). After the existing update succeeds, add:

```ts
const internalConfig = getInternalDeliverable(deliverableKey)!; // already validated above
const siblingKeys = internalDeliverablesForSubPhase(internalConfig.subPhaseKey).map((d) => d.key);

const { data: siblings } = await supabase
  .from("onboarding_internal_deliverables")
  .select("status")
  .eq("project_id", projectId)
  .in("deliverable_key", siblingKeys);

const statuses = siblings?.map((s) => s.status) ?? [];
const allDone = statuses.length > 0 && statuses.every((s) => s === "done");
const anyStarted = statuses.some((s) => s !== "pending");
const computedStatus = allDone ? "done" : anyStarted ? "in_progress" : "pending";

let updatedDeliverable = null;
const { data: currentDeliverable } = await supabase
  .from("customer_deliverables")
  .select("*")
  .eq("project_id", projectId)
  .eq("phase_number", 1)
  .eq("deliverable_key", internalConfig.subPhaseKey)
  .maybeSingle();

if (currentDeliverable && currentDeliverable.status !== computedStatus) {
  const { data } = await supabase
    .from("customer_deliverables")
    .update({ status: computedStatus, completed_at: computedStatus === "done" ? new Date().toISOString() : null })
    .eq("id", currentDeliverable.id)
    .select()
    .single();
  updatedDeliverable = data ?? null;
}

return NextResponse.json({ internalDeliverable: data, deliverable: updatedDeliverable });
```

(Sketch — implementer should fold this into the route's existing try/catch and error-handling style, and import `internalDeliverablesForSubPhase` alongside the already-imported `getInternalDeliverable` from `@/config/customer-phases`.) Phase number is hardcoded `1` here since internal deliverables only ever exist under Phase 1 (`internalDeliverablesForSubPhase` / `INTERNAL_DELIVERABLES` in `customer-phases.ts` have no phase-2+ entries) — do not generalize beyond that.

## Implementation Steps

1. **API route** — update `internal-deliverables/[deliverableKey]/route.ts` per the sketch above: after the internal-row update, recompute the parent deliverable's status from all sibling internal items, conditionally update `customer_deliverables`, and return `{ internalDeliverable, deliverable }`.
2. **`_onboarding-wizard.tsx`** — add `initialStepKey` prop, derive initial `stepIdx` from it; update `setInternalStatus` to read the new response shape and merge `deliverable` into `localDeliverables`/`onDeliverableChange`; make `WizardDeliverableRow` read-only (no `onClick`) when `stepInternal.length > 0`.
3. **`_onboarding-detail.tsx`** — thread `startDate` and `visual` (phase colors) down through `Swimlane` to `DeliverableCard`. Remove `handleToggleDeliverable` and the `onToggleDeliverable` prop chain. Add `wizardStartStepKey` state + a handler that sets it and opens the wizard, wired to the card's click. Update `handleToggleInternalDeliverable` to read the new `{ internalDeliverable, deliverable }` response shape (merge `deliverable` into `deliverables` state when present — the realtime subscription will likely also catch this, but the direct merge avoids a race/flash).
4. **`DeliverableCard` redesign** — compute `percentage` (checklist-derived or status-fallback per Requirements), build the circular progress indicator (SVG circle + `strokeDasharray`/`strokeDashoffset` sized to `percentage`, or a `CheckCircle2` glyph at 100%), restyle the card's bar as a two-part fill (solid phase color up to `percentage`, `repeating-linear-gradient` stripe track for the rest), keep the title, add the `{percentage}%` label, keep truncation/compact behavior for narrow (short day-range) cards.
5. **Hover popover** — add `onMouseEnter`/`onMouseLeave` state on the card, a portal-rendered popover (same positioning approach as the existing internal-checklist popover) showing name, description, owner(s), and calendar-formatted date range. No chart.
6. Run `npx tsc --noEmit` and manually verify in the browser: percentages match checklist completion for `migration-checklist`/`html-mockup`/`storage-kb`/`content-map`; clicking each Phase-1 card opens the wizard on the matching step; clicking a Phase 2–5 card does nothing; hovering any card shows the detail popover with correct dates; toggling internal checklist items (from either the wizard or the Gantt badge popover) updates the parent card's ring/percentage without a manual click; `WizardDeliverableRow` for checklist-backed steps is no longer clickable.

## Acceptance Criteria

- [x] Every `DeliverableCard`, in every phase, shows a circular progress indicator, its title, and a `%` label; the card's background is a two-tone progress track (solid fill + diagonal-stripe remainder) in the card's phase color.
- [x] Clicking a Phase-1 card opens the Onboarding Wizard already positioned on that deliverable's step (not step 1), without changing the deliverable's status.
- [x] Clicking a Phase 2–5 card does nothing (unchanged from today's non-interactive behavior).
- [x] Marking all internal checklist items for a sub-phase "done" (from either the wizard or the Gantt's `ListChecks` badge popover — badge popover click now navigates to the wizard rather than toggling directly, per Follow-up Refinement 7, but the auto-derivation itself is unaffected) automatically flips that deliverable's status to `done` and its card to 100%/checkmark — with no manual click on the deliverable itself.
- [x] Marking the first internal checklist item "in_progress"/"done" while others remain pending flips the parent deliverable to `in_progress` automatically.
- [x] For `kickoff`, `outcome-target`, and `client-signoff` (no checklist), the wizard's manual done-toggle still works exactly as before.
- [x] Hovering any card shows title, description, owner(s), and a calendar date range (e.g. "Jul 12 – Jul 13"), with no chart/graph.
- [x] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manually verify at /v2/onboarding/[projectId]: progress rings/percentages, click-to-wizard-step,
           # auto status derivation from checklist toggles (both entry points), hover popover, non-Phase-1 cards inert
```

## Compatibility Touchpoints

- `PATCH .../internal-deliverables/[deliverableKey]`'s response shape changes from a bare `OnboardingInternalDeliverableRow` to `{ internalDeliverable, deliverable }`. Both known callers (`_onboarding-detail.tsx`, `_onboarding-wizard.tsx`) are updated in this same task — confirm no other caller exists (`grep -rn "programme/internal-deliverables" src/`) before shipping.
- `OnboardingWizard`'s prop signature gains `initialStepKey?: string` — optional, so the existing "Onboarding Wizard" header button call site (which doesn't set it) keeps compiling and defaults to step 0.
- The realtime subscription in `OnboardingDetail` already listens for `customer_deliverables` UPDATE events project-wide, so the auto-status change will reach `OnboardingDetail`'s own `deliverables` state even without the direct response-merge in step 3 above — the direct merge is for `_onboarding-wizard.tsx`'s `localDeliverables`, which has no realtime subscription of its own.

## Implementation Notes

### What Changed
- `DeliverableCard` redesigned: a `ProgressRing` (SVG circle, `strokeDasharray`/`strokeDashoffset`, phase-colored `stroke-current`) replaces the old status icon, showing a checkmark at 100%; title and `{percentage}%` fill out the row. The card's own background is now a two-layer `linear-gradient`/`repeating-linear-gradient` (inline `style`, phase-hex-driven) — solid phase color up to `percentage`, light diagonal-stripe track for the rest; at 100% the card falls back to the phase's static `border`/`bg` Tailwind classes (no gradient needed).
- `percentage` is computed inline in `DeliverableCard`: checklist-derived (`doneInternal / internalItems.length`) when the sub-phase has internal deliverables, else a `pending→0 / in_progress→50 / done→100` fallback (used by all Phase 2–5 cards and Phase 1's `kickoff`/`outcome-target`/`client-signoff`).
- Clicking a Phase-1 card no longer PATCHes deliverable status — it now calls `onOpenWizardStep(d.key)`, which sets `wizardStartStepKey` and opens the wizard already positioned on that deliverable's step. Non-Phase-1 cards stay `disabled`/non-interactive, confirmed inert to clicks in browser testing.
- Added a hover-triggered detail popover (separate from the existing click-triggered internal-checklist badge popover) showing name, description, `ownerChips` + raw owner string, and a real calendar date range via the new `formatDeliverableDateRange()` helper. No chart, per spec.
- `PATCH .../internal-deliverables/[deliverableKey]` now recomputes the parent `customer_deliverables` row's status from all sibling internal items after every internal-item update (all done → `done`; any started → `in_progress`; else `pending`), and returns `{ internalDeliverable, deliverable }` instead of a bare row. Both callers updated to merge `deliverable` into their local state when non-null.
- `WizardDeliverableRow` now takes an optional `onClick`; when absent it renders read-only (`disabled`, `cursor-default`, no "Mark" prefix, tooltip explaining the status is auto-derived). Wired so steps with `stepInternal.length > 0` pass no `onClick`.
- `OnboardingWizard` accepts a new optional `initialStepKey` prop, used to compute the initial `stepIdx` via `STEPS.findIndex`.

### Files Changed
- `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts` — auto-status derivation side effect + new response shape.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — `initialStepKey` prop/initial step, `setInternalStatus` reads new response shape and merges `deliverable`, `WizardDeliverableRow` read-only mode for checklist-backed steps.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` — `PHASE_HEX` map, `formatDeliverableDateRange()`, `ProgressRing`, full `DeliverableCard` redesign (progress ring + striped-track bar + hover popover, click→wizard-step instead of click→cycle-status), `Swimlane` threads `startDate`/`visual`/`onOpenWizardStep` down, removed dead `handleToggleDeliverable`, added `wizardStartStepKey` state + `handleOpenWizardStep`, `handleToggleInternalDeliverable` reads new response shape.

### Deviations From Plan
- None. Implementation matches the plan's design decisions (checklist-derived vs. status-fallback percentage, phase-colored progress fill, read-only `WizardDeliverableRow` for checklist-backed steps, hover popover with no chart).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual browser verification (live project "Acme Testing Co Website", `/v2/onboarding/[projectId]`) - PASS: progress ring + striped bar render correctly for pending/in-progress/done cards; hover popover shows title/description/owner/calendar dates with no chart; clicking a Phase-1 card ("Migration checklist") opened the wizard directly on step 3; toggling the "Implementation file" checklist item from in-progress→done inside the wizard auto-flipped the parent "Migration checklist" row to Done with no manual click, and the Gantt card updated to 100%/checkmark after returning to the timeline (both the wizard's local state merge and the realtime-fed Gantt state confirmed); a Phase 2 card ("Foundational pages") showed its hover popover but a click produced no navigation/status change, confirming non-Phase-1 cards stay inert. No console errors observed.

### Follow-up Refinement (post-handoff, user-requested)
`ProgressRing`'s in-progress state changed from a stroke-based ring (annulus) to a filled-circle pie-wedge indicator, per user reference images: a white base circle (`fill-white stroke-[#E2E8F0]`) with a solid phase-colored pie wedge (SVG `path` arc, sweeping clockwise from 12 o'clock) filled to `percentage`. 100% (checkmark) and 0% (plain white circle, no wedge) states unchanged. Verified live against the "Storage folder + KB" card (1/4 checklist items done → ~25% wedge) — matches reference exactly. `npx tsc --noEmit` clean, no console errors.

### Follow-up Refinement 2 (post-handoff, user-requested)
Added a second, outer ring around the pie with a small gap between them (per user request): a thin `stroke-current` circle at `outerR = size/2 - 1` (phase color, `opacity-40`), then a `gap` of 2.5px before the white pie-base circle (`pieR = outerR - gap`), which the wedge path now sizes to instead of the old single radius. Verified live — outer ring, gap, and pie all render distinctly at the zoomed level. `npx tsc --noEmit` clean, no console errors.

### Follow-up Refinement 3 (post-handoff, user-requested)
Card background diagonal stripes thinned: `repeating-linear-gradient` stop widths changed from `4px`/`8px` (opaque/period) to `1.5px`/`4px` in both the partial-progress and 0%-progress `barStyle` branches. Verified live on the "90-day content map" (0%) card — noticeably finer hatch, still clearly visible. `npx tsc --noEmit` clean, no console errors.

### Follow-up Refinement 4 (post-handoff, user-requested)
100% state now reuses the same ring+gap+pie SVG structure as the in-progress indicator (previously a plain `CheckCircle2` icon) — the pie is a full solid disc in `text-white/50` (translucent white, since it now sits on a solid-color card) with a white `Check` icon absolutely centered on top (`relative` wrapper + `absolute inset-0 m-auto`). Separately, `DeliverableCard`'s background at 100% changed from the light phase tint (`phaseVisual.bg`/`phaseVisual.border`) to a fully solid `backgroundColor: hex` fill, with title/percentage text switched to white and the border to `border-transparent` for contrast. Verified live: "Migration checklist" and "Kickoff meeting" both render as full solid blue cards with white text/percentage and a visible white checkmark. `npx tsc --noEmit` clean, no console errors.

### Follow-up Refinement 5 (post-handoff, user-requested)
Two changes:
1. In-progress wedge lightness matched to the completed disc's pastel tone — wedge `<path>` fill className gained `opacity-50`. Since the wedge is always painted on top of the `ProgressRing`'s own opaque white base circle (not the card's background), `hex` at 50% opacity over white produces the exact same blended color as the completed disc's `white/50` over an opaque `hex` card background (`0.5·hex + 0.5·white` either way) — verified visually matching image reference.
2. Title text now splits color at the fill/track boundary instead of being uniformly dark or white, so it stays readable regardless of where the boundary happens to cross it. Added `titleRef`/`buttonRef` + a `useLayoutEffect` that measures `titleRef.current.offsetLeft/offsetWidth` against `buttonRef.current.clientWidth` and `percentage` to compute `textSplitPct` — the fill boundary's position in the *title span's own local coordinate space* (0–100), not the whole card's. The title span then renders via CSS `background-clip: text` (+ `-webkit-` prefix) with a two-stop `linear-gradient(white 0%–textSplitPct%, #0F172A textSplitPct%–100%)` and `color: transparent`, so each character picks up white or dark depending on which side of the boundary it falls on. `button` gained `relative` positioning so `offsetLeft` is measured in a stable, predictable coordinate frame. Only active for `0 < percentage < 100`; the existing uniform white (100%) / dark (0%) text classes are unchanged at the edges. Verified live on "90-day content map" at 50%: "90-da" renders white over the solid fill, "y cont…" renders dark over the striped track, boundary tracking the fill percentage correctly. `npx tsc --noEmit` clean, no console errors.

### Follow-up Refinement 6 (post-handoff, user-reported bug)
User reported the in-progress pie's outer ring was invisible (unlike the completed disc's clearly-visible ring). Root cause: the ring's "gap" area (between `outerR` and `pieR`) was raw transparent SVG space, not an opaque shape, so the card's own dynamic background showed through there. Since the ring sits near the card's left edge, and the solid-color fill portion of the bar always starts at the left edge for any `percentage > 0`, the ring/gap icon frequently sat on top of the card's own solid, same-hex fill, making a same-color ring stroke render with zero contrast against its own backdrop (invisible) regardless of stroke width or opacity. Not a thickness/opacity problem, as the user correctly identified. Fix: added an opaque `fill="white"` backdrop circle at `outerR`, drawn before the ring stroke, so the ring (and its gap) always renders against a controlled white canvas independent of the card's real background at that position, matching how the inner `pieR` circle already had its own explicit white fill. The 100% (completed) branch was left untouched since its ring intentionally relies on the card's guaranteed-opaque solid-hex background and was already confirmed working. Verified live on "90-day content map" at 50% — ring now clearly visible as a distinct blue circle outline; completed cards ("Migration checklist") re-checked and unaffected. `npx tsc --noEmit` clean, no console errors.

### Follow-up Refinement 7 (post-handoff, user-requested)
Three changes:
1. Added `{percentage}%` to the hover detail popover, right-aligned next to the title (same `jetBrainsMono`/phase-color styling as the card's own percentage label), matching the reference image.
2. Internal Deliverables popover (the `ListChecks` badge, click-triggered) no longer toggles status on click. Each row now calls `onOpenWizardStep` (navigates to the wizard step for that item's parent sub-phase) instead of `onToggleInternal`. Since every internal item shown in a given card's popover already belongs to that same card's own `d.key`/sub-phase (`internalDeliverablesForSubPhase(d.key)` scopes them), all rows in one popover navigate to the same single wizard step — the step is genuinely "where that field lives." Status display (icon + strikethrough) is unchanged and still reflects DB state; only the click action changed, per the request that "the action is there [in the wizard]." Removed the now-fully-dead `onToggleInternal`/`togglingKey` plumbing end-to-end: `handleToggleInternalDeliverable` in `_onboarding-detail.tsx`, the `togglingKey` state, and the prop threading through `Swimlane` and `DeliverableCard` (the Wizard's own `setInternalStatus` is untouched and remains the only place that actually toggles internal-deliverable status).
3. Added `CARD_INSET = 4` (px) — `DeliverableCard`'s `top` gained `+ CARD_INSET` and its rendered `height` changed from `ROW_HEIGHT` to `ROW_HEIGHT - CARD_INSET * 2`, giving equal breathing room above and below each card within its track row instead of sitting flush against the row's top edge.

Verified live: hover popover on "Migration checklist" shows "100%" next to the title; clicking "Branding guides" inside the "Storage folder + KB" card's internal-deliverables popover navigated directly to wizard step 6 ("Storage folder + KB") without changing "Branding guides"'s pending status; cards now show visible top/bottom spacing in their row. `npx tsc --noEmit` and `pnpm lint` both clean, no console errors.

### Follow-up Refinement 8 (post-handoff, user-reported bug)
User reported the Gantt Swimlane stopped being wheel-scrollable after using "Jump to phase." Root cause: the wheel-to-horizontal-pan listener (task 126) was attached in a `useEffect` keyed to `[loading, programmeStartedAt]` — state chosen only because it happened to flip once when the Gantt view first mounts, not because it has any real relationship to the scroll container's DOM lifecycle. Any code path that re-renders the component without touching those two specific values (e.g. "Jump to phase," which only updates `phases`) never re-runs that effect, so if the listener were ever missing at the one moment that effect *did* run (or under React 19/Strict Mode's double-invoke-on-mount behavior), it would stay unattached for the rest of the component's life with no self-correcting path.

Direct reproduction via synthetic `WheelEvent` dispatch (before/after a phase jump) didn't conclusively catch the listener in a detached state in this session, but the dependency-array pattern was a genuine latent bug regardless — it only worked by accident (the effect happening to fire once at the right time), not by a correctness guarantee. Fixed by moving the attach/detach directly into the scroll container's ref callback (`ref={(node) => {...}}`) instead of a separate effect: the callback removes the listener from whatever node it previously held, then attaches it to the new node, every time the ref fires — which is guaranteed to run exactly when the DOM node is set, unset, or replaced, regardless of what caused the re-render. This makes the listener state self-healing on every render rather than dependent on a specific state transition happening to coincide with the node's mount.

`handleGridWheel` was pulled out of the effect into a plain function in the component body (still closes over `scrollRef` via `.current`, so no stale-closure risk). Verified live: initial auto-scroll-to-today still centers correctly on fresh load; the "Jump to Today" FAB still smooth-scrolls back correctly after a large `scrollLeft` offset; `Element.dispatchEvent(new WheelEvent(...))` on the grid confirms the listener is attached and preventing default both before and after a "Jump to phase" action. `npx tsc --noEmit` and `pnpm lint` both clean, no console errors.

## Final Summary

All original requirements shipped, then refined across 8 rounds of live user feedback (all against the real "Acme Testing Co Website" project, not just typechecking):

1. **Core rebuild** — `DeliverableCard` went from a status-icon pill to a progress-bar card: circular indicator + title + `%`, two-tone (solid fill / diagonal-stripe track) background, phase-colored.
2. **Interaction model changed** — Phase-1 card clicks now open the wizard on the matching step instead of cycling status; status for checklist-backed sub-phases is derived automatically from the internal checklist (new PATCH-route side effect), not manually toggled.
3. **Progress indicator iterated** (refinements 1–6) — stroke ring → filled pie with outer ring + gap → 100% state reusing the same ring+pie shape with a white checkmark on a fully solid-color card → matched in-progress/completed lightness → per-character text-color split at the fill boundary → fixed an invisible-ring bug caused by an unfilled transparent gap exposing the card's own same-hue background.
4. **Interaction polish** (refinement 7) — percentage added to the hover popover; the Internal Deliverables badge popover stopped toggling status on click and now navigates to the owning wizard step instead (status display/strikethrough unchanged); cards gained vertical breathing room in their row.
5. **Scroll regression fix** (refinement 8) — the wheel-to-horizontal-pan listener (task 126) was attached via a `useEffect` keyed to state with no real relationship to the scroll container's DOM lifecycle, so a "Jump to phase" update (or any re-render not touching that state) could leave it permanently unattached. Moved attach/detach into the scroll container's ref callback so it's self-healing on every render.

Final state verified clean: `npx tsc --noEmit` and `pnpm lint` both pass with no errors; every change was exercised live in the browser (not just typechecked) across the session, with no console errors at any point.
