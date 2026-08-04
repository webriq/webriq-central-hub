# 200: Onboarding Wizard — Checklist-Based Step Navigation + Step-Gate Alert Redesign

**Created:** 2026-08-03
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Completed (2026-08-03)

---

## Overview

The Onboarding Wizard's step indicator (`src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx`) lets a PM/Bert/admin click any of the 7 Phase 1 step circles (Kickoff → Outcome target → Migration checklist → Content map → HTML mockup → Storage folder + KB → Client sign-off) to jump to that step. Two related bugs live in `handleStepIndicatorClick` and its neighboring render code:

1. **Forward-jump gate ignores actual completion.** `handleStepIndicatorClick` (`_onboarding-wizard.tsx:2012-2028`) blocks *any* forward click that isn't to `stepIdx + 1` with `"Complete '{current step}' first — steps can only be advanced one at a time."` — before ever checking whether the intervening steps are done. A user on "HTML mockup" (step 5) who has already completed "Storage folder + KB" (step 6) cannot click "Client sign-off" (step 7); the block fires purely because `i !== stepIdx + 1`, never consulting `localDeliverables` status for step 6. Reported case: HTML mockup → Client sign-off, skipping the already-completed Storage folder + KB step.
2. **Step-indicator "done" checkmark is position-based, not status-based.** The circle rendering (`_onboarding-wizard.tsx:2172-2181`) marks a step "done" (blue fill + check icon, and the blue connector line after it) purely from `i < stepIdx` — whichever step you're currently *viewing*, not whether that step's checklist is actually complete. Navigating back to an earlier step, or having completed a later step out of view, does not update the checkmarks correctly: a step you've merely scrolled past shows checked even if incomplete, and a step you've completed but are "before" in `stepIdx` terms shows unchecked.
3. **Step-gate alert popup needs a design pass.** The blocking popup (`_onboarding-wizard.tsx:2921-2941`, screenshot below) is functional but was flagged for a redesign against `_final_design/guide/central-hub-design-system.md` — bare icon with no container, generic "OK" button that doesn't name an outcome (guide §6: "Buttons name outcomes... never 'Submit'"). Since the fix to #1 identifies exactly *which* step is blocking, the redesigned popup should also let the user jump straight to that blocking step instead of just dismissing.

Per-step completion status already exists and is already live-synced regardless of which step is currently being viewed: `localDeliverables` (seeded from the `deliverables` prop, updated via `setInternalStatus`'s PATCH response at line 971) holds a `status` (`"pending" | "in_progress" | "done"`) row per step, keyed by `deliverable_key`, independent of `stepIdx`. The fix is to make both the gate and the indicator read from that per-step status instead of from the `stepIdx` position — no new data plumbing needed.

## Requirements

- [x] Clicking a step indicator ahead of the current step succeeds if every step from the current step up to (but not including) the target is cleared — "cleared" meaning that step's `localDeliverables` status is `"done"`, OR that step is overdue (`currentDay > step.dayEnd`, the same bypass `handleContinueClick`'s adjacent-step check already uses). This replaces the old "only `stepIdx + 1`" cap. **Superseded by Post-Gate Follow-Up #2**: the overdue bypass described here turned out to be based on a false premise (`handleContinueClick` never actually had one) and let overdue-but-incomplete steps be skipped silently, so it was removed — "cleared" now means `status === "done"` only, on both navigation paths.
- [x] When a forward jump is blocked, the alert names the *specific* blocking step (the first non-cleared step in the chain), not just "the current step." Refined further by **Follow-Up #3**: when that blocking step is the one currently on screen, the user now sees the same field-level validation Continue shows (red field + inline message, or the incomplete-items modal) instead of only a popup naming it.
- [x] Backward jumps (`i < stepIdx`) and the PM read-only bypass (`isPM`) keep working exactly as today — unchanged.
- [x] Step-indicator circles show the done checkmark (blue fill + `<Check>`) for any step whose `localDeliverables` status is `"done"`, regardless of `stepIdx` — not merely `i < stepIdx`. The connector line segment after a step follows the same per-step done check. Refined by **Follow-Up #1**: the active step (`i === stepIdx`) always shows its number, never the checkmark, even when done — only non-active completed steps show the check.
- [x] The currently-viewed step (`i === stepIdx`) keeps its distinct active ring treatment (`ring-4 ring-[#007BFF]/15`) even when that step is also done — active-state styling must not be silently lost to the "done" branch.
- [x] Step-gate alert popup is redesigned per `_final_design/guide/central-hub-design-system.md`: warning icon sits in a `--warn-bg` (`#FFF3D6`) tinted circle container (icon-container convention, design system §1/§4), consistent spacing/typography already established by the sibling "Missing required fields" modal in the same file.
- [x] Redesigned popup offers two actions: a ghost "Stay here" dismiss (matching the sibling modal's "Review" ghost-button styling) and a primary blue "Go to '{blocking step name}'" button that jumps straight to the identified blocking step and closes the popup — outcome-named per design system §6, not a generic "OK". Button tokens themselves were further corrected in **Follow-Up #2** (pill radius + bordered ghost + `--blue-700` hover, matching the guide instead of the file's original non-compliant `rounded-lg`/opacity-hover pattern).
- [x] Escape-key dismissal and click-outside-to-dismiss keep working (both already wired at the `stepGateAlert` truthy check in the `useEffect` at line 445-455).

## Out of Scope / Must-Not-Change

- No change to `handleContinueClick`'s own adjacent-step gate logic (Continue button, lines 1893-1928) — only the step-indicator's own click gate (`handleStepIndicatorClick`) and its checkmark rendering are in scope.
- No change to the "Missing required fields" force-confirm modal or the "incomplete checklist items" modal — only the step-gate (`stepGateAlert`) modal is redesigned.
- No change to `localDeliverables`/`localInternal` data flow, the `setInternalStatus` PATCH endpoint, or any server-side route — this is a client-side read/render/gating fix using data that's already fetched and already live-synced.
- No change to any other onboarding wizard step's field validation, autosave, or file-upload logic.
- Do not touch Phase 2+ (StackShift I implementation) navigation — this wizard only covers Phase 1 (`WIZARD_PHASE_NUMBER = 1` in `_wizard-step-params.ts`).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` | Modify | Add a per-step `isStepCleared`/`isStepDone` helper; rewrite `handleStepIndicatorClick`'s forward-jump branch to walk the intervening steps instead of capping at `stepIdx + 1`; change `stepGateAlert` state shape from `string \| null` to `{ message: string; targetIdx: number } \| null`; fix the step-indicator circle/connector "done" check to use per-step status instead of `i < stepIdx`; redesign the `stepGateAlert` modal JSX (icon container + two-action footer). |

## Code Context

### `_onboarding-wizard.tsx:248` — STEPS source (7 Phase 1 deliverables, in day order)

```tsx
const STEPS = phase1.deliverables; // 7 sub-phases, in day order
```

Keys in order: `kickoff`, `outcome-target`, `migration-checklist`, `content-map`, `html-mockup`, `storage-kb`, `client-signoff` (from `src/config/customer-phases.ts`).

### `_onboarding-wizard.tsx:442` — alert state (needs shape change)

```tsx
const [stepGateAlert, setStepGateAlert] = useState<string | null>(null);
```

### `_onboarding-wizard.tsx:692-694` — per-step status is already looked up by `deliverable_key`, not position

```tsx
const step = STEPS[stepIdx];
const stepRow = localDeliverables.find((r) => r.deliverable_key === step.key);
const stepStatus = stepRow?.status ?? "pending";
```

Generalize this lookup pattern (`localDeliverables.find((r) => r.deliverable_key === STEPS[j].key)?.status ?? "pending"`) into a helper usable for arbitrary `j`, not just the current `stepIdx`.

### `_onboarding-wizard.tsx:2005-2028` — the buggy gate (full current logic)

```tsx
// Steps indicator — clicking a circle jumps straight to that step. Already-reached steps
// (i <= stepIdx) are always open to revisit. Jumping forward is capped to exactly the next
// step (i === stepIdx + 1) — never further ahead, even past-overdue or already-done steps
// can't be skipped over — and only once the *currently viewed* step is done, or that step is
// overdue (today's programme day is past its own dayEnd), matching Continue's own gate. PM
// mirrors handleContinueClick's own pm bypass (read-only viewing, no data at risk) — never
// gated, can jump anywhere.
const handleStepIndicatorClick = (i: number) => {
  if (i === stepIdx) return;
  if (i < stepIdx || isPM) {
    setStepIdx(i);
    return;
  }
  if (i !== stepIdx + 1) {
    setStepGateAlert(`Complete "${step.name}" first — steps can only be advanced one at a time.`);
    return;
  }
  const isCurrentOverdue = currentDay > step.dayEnd;
  if (stepStatus === "done" || isCurrentOverdue) {
    setStepIdx(i);
    return;
  }
  setStepGateAlert(`"${step.name}" needs to be completed first before continuing to the other step.`);
};
```

Replace with a loop that finds the first non-cleared step in `[stepIdx, i)`:

```tsx
const isStepCleared = (j: number): boolean => {
  const status = localDeliverables.find((r) => r.deliverable_key === STEPS[j].key)?.status ?? "pending";
  return status === "done" || currentDay > STEPS[j].dayEnd;
};

const handleStepIndicatorClick = (i: number) => {
  if (i === stepIdx) return;
  if (i < stepIdx || isPM) {
    setStepIdx(i);
    return;
  }
  let blockingIdx: number | null = null;
  for (let j = stepIdx; j < i; j++) {
    if (!isStepCleared(j)) { blockingIdx = j; break; }
  }
  if (blockingIdx === null) {
    setStepIdx(i);
    return;
  }
  setStepGateAlert({
    message: `Complete "${STEPS[blockingIdx].name}" first before jumping ahead — steps must be cleared in order.`,
    targetIdx: blockingIdx,
  });
};
```

(Exact variable names/wording are implementation's call — the requirement is the chain-walk behavior and that the message names the actual blocking step.)

### `_onboarding-wizard.tsx:2162-2184` — step-indicator render (position-based checkmark bug)

```tsx
<div className="flex items-center gap-1 overflow-x-auto p-1 -m-1">
  {STEPS.map((s, i) => (
    <div key={s.key} className="flex items-center flex-1 last:flex-none min-w-8">
      <IconTip label={`${s.name} · Day ${s.dayStart === s.dayEnd ? s.dayStart : `${s.dayStart}–${s.dayEnd}`}`} side="bottom">
        <button
          type="button"
          onClick={() => handleStepIndicatorClick(i)}
          aria-label={`Go to ${s.name}`}
          className="flex flex-col items-center gap-1 bg-transparent border-none p-0 cursor-pointer transition-opacity hover:opacity-80"
        >
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
            i < stepIdx ? "bg-[#007BFF] text-white" : i === stepIdx ? "bg-[#007BFF] text-white ring-4 ring-[#007BFF]/15" : "bg-[#EDF0F7] text-[#5F6A88]"
          )}>
            {i < stepIdx ? <Check size={11} /> : i + 1}
          </div>
          <span className={cn("text-[9px] whitespace-nowrap max-w-16 truncate", i === stepIdx ? cn("font-semibold", textPrimary) : textMuted)}>{s.name}</span>
        </button>
      </IconTip>
      {i < STEPS.length - 1 && <div className={cn("flex-1 h-0.5 mx-1.5 -mt-4", i < stepIdx ? "bg-[#007BFF]" : "bg-[#E2E7F2]")} />}
    </div>
  ))}
</div>
```

Needs `i < stepIdx` replaced with an actual-done check for both the circle fill/checkmark and the connector, while keeping `i === stepIdx` (active ring) taking precedence in the ternary ordering so an active step that's also done still shows its ring:

```tsx
{STEPS.map((s, i) => {
  const done = (localDeliverables.find((r) => r.deliverable_key === s.key)?.status ?? "pending") === "done";
  return (
    <div key={s.key} className="flex items-center flex-1 last:flex-none min-w-8">
      <IconTip label={`${s.name} · Day ${s.dayStart === s.dayEnd ? s.dayStart : `${s.dayStart}–${s.dayEnd}`}`} side="bottom">
        <button type="button" onClick={() => handleStepIndicatorClick(i)} aria-label={`Go to ${s.name}`} className="...">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
            i === stepIdx ? "bg-[#007BFF] text-white ring-4 ring-[#007BFF]/15" : done ? "bg-[#007BFF] text-white" : "bg-[#EDF0F7] text-[#5F6A88]"
          )}>
            {done ? <Check size={11} /> : i + 1}
          </div>
          <span className={cn("text-[9px] whitespace-nowrap max-w-16 truncate", i === stepIdx ? cn("font-semibold", textPrimary) : textMuted)}>{s.name}</span>
        </button>
      </IconTip>
      {i < STEPS.length - 1 && <div className={cn("flex-1 h-0.5 mx-1.5 -mt-4", done ? "bg-[#007BFF]" : "bg-[#E2E7F2]")} />}
    </div>
  );
})}
```

### `_onboarding-wizard.tsx:2921-2941` — current step-gate popup (redesign target)

```tsx
{stepGateAlert && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/40 p-4" onClick={() => setStepGateAlert(null)}>
    <div role="dialog" aria-modal="true" aria-labelledby="step-gate-title" className={cn(cardCls, "w-full max-w-sm shadow-xl overflow-hidden")} onClick={(e) => e.stopPropagation()}>
      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-[#8A5A00] shrink-0" />
          <h2 id="step-gate-title" className={cn("text-[15px] font-semibold", textPrimary)}>Step not available yet</h2>
        </div>
        <p className={cn("text-[13px]", textMuted)}>{stepGateAlert}</p>
      </div>
      <div className={cn("flex items-center justify-end gap-2 px-5 py-4 border-t", "border-[#EDF0F7] bg-[#F4F6FB]")}>
        <button onClick={() => setStepGateAlert(null)} className="px-4 py-2 rounded-lg bg-[#007BFF] text-white text-[13px] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity">
          OK
        </button>
      </div>
    </div>
  </div>
)}
```

Reference for the two-action footer styling to reuse (sibling "Missing required fields" modal, `_onboarding-wizard.tsx:2903-2916`):

```tsx
<div className={cn("flex items-center justify-end gap-2 px-5 py-4 border-t", "border-[#EDF0F7] bg-[#F4F6FB]")}>
  <button onClick={handleReview} className={cn("px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border-none bg-transparent", "text-[#3A4565] hover:bg-[#EDF0F7]")}>
    Review
  </button>
  <button onClick={handleForceProceed} className="px-4 py-2 rounded-lg bg-[#007BFF] text-white text-[13px] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity">
    Yes, proceed
  </button>
</div>
```

Redesigned popup should combine: icon-in-tinted-circle (design system icon-container convention, `--warn-bg: #FFF3D6` / `--warn: #8A5A00`) + the ghost/primary two-button footer pattern above, with the primary button reading `Go to "{STEPS[stepGateAlert.targetIdx].name}"` and calling `setStepIdx(stepGateAlert.targetIdx)` before closing.

### Design tokens in play (`_final_design/guide/central-hub-design-system.md`)

```
--warn: #8A5A00;  --warn-bg: #FFF3D6;   /* Due soon, Blocked, Sign-off due */
--blue: #007BFF;  --blue-700: #0063D6;  /* PRIMARY interactive */
--r-lg: 14px  /* panels, tiles */
```
§6 Voice & tone: "Buttons name outcomes... never 'Submit'." §1: icon-container backgrounds use tint colors (e.g. `--blue-100` for blue icon containers) — apply the same convention with `--warn-bg` for this warning icon.

## Implementation Steps

1. Change `stepGateAlert` state type to `{ message: string; targetIdx: number } | null` (line 442) and update its two consumers (the modal at ~2921-2941 and the `useEffect` truthy check at ~445-455, which only needs the truthy check and stays otherwise unchanged).
2. Add an `isStepCleared(j: number)` helper (or inline equivalent) near `handleStepIndicatorClick` that reads `localDeliverables` by `STEPS[j].key`, matching the existing `stepRow`/`stepStatus` lookup pattern at line 693-694.
3. Rewrite `handleStepIndicatorClick`'s forward-jump branch to walk `j` from `stepIdx` to `i - 1`, find the first `j` that isn't cleared, and either advance (`setStepIdx(i)`) if none found or set the new `stepGateAlert` object naming that step.
4. Fix the step-indicator circle/connector render (~2162-2184) to compute a per-step `done` boolean from `localDeliverables` instead of `i < stepIdx`, keeping `i === stepIdx` as the first ternary branch so the active ring isn't lost when the active step is also done.
5. Redesign the `stepGateAlert` modal (~2921-2941): warning icon in a `--warn-bg` tinted circle, message from `stepGateAlert.message`, ghost "Stay here" button (dismiss) + primary blue "Go to '{name}'" button (`setStepIdx(stepGateAlert.targetIdx)` then dismiss), matching the sibling force-confirm modal's footer button styling for visual consistency within the same file.
6. Manually verify in-browser: from HTML mockup (step 5) with Storage folder + KB (step 6) already checked off, click Client sign-off (step 7) — should navigate directly, no alert. Then from an earlier step with a genuinely incomplete later step in between, confirm the alert names the correct blocking step and its "Go to" button lands there. Then navigate backward and confirm checkmarks reflect real per-step completion regardless of `stepIdx`.

## Acceptance Criteria

- [x] From "HTML mockup", clicking "Client sign-off" succeeds without any alert when "Storage folder + KB" (the only step in between) is already done — reproduces and fixes the reported bug exactly.
- [x] From any step, clicking a step 2+ positions ahead is blocked only if a real intervening step is incomplete — note: "not overdue" no longer applies as an auto-clear condition post Follow-Up #2; overdue alone no longer clears a step, only actual completion does. The alert names the specific blocking step.
- [x] Step-indicator checkmarks reflect actual `localDeliverables` status after navigating backward and forward — a completed step out of `stepIdx` order shows checked; an incomplete step never shows checked regardless of position; the active step shows its number rather than a check even when done (Follow-Up #1).
- [x] The currently active step's ring highlight still renders even when that step is also marked done.
- [x] Redesigned step-gate popup matches the design system's icon-container + outcome-named-button + pill-button-token conventions and offers a working "Go to '{step}'" shortcut.
- [x] `isPM` and backward-click behavior are unchanged (confirmed by inspection across all four rounds — that branch was never touched).
- [x] `npx tsc --noEmit` passes with no new errors (re-verified after every round, including the final follow-up).

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser-based acceptance testing (per CLAUDE.md — no test runner configured): reproduce the exact reported scenario (HTML mockup → attempt Client sign-off with Storage folder + KB already complete) in the running dev server, plus the backward-navigation checkmark check.

## Compatibility Touchpoints

- No packaging, docs (outside this task doc), adapter, or install-surface impact — single client component file, no schema/API changes.

## Implementation Notes

### What Changed
- `stepGateAlert` state widened from `string | null` to `{ message: string; targetIdx: number } | null` so the alert can carry which specific step is blocking, not just prose.
- Added an `isStepCleared(j)` helper (done status OR overdue, by `STEPS[j].key` against `localDeliverables`) and rewrote `handleStepIndicatorClick`'s forward branch to walk every step from `stepIdx` up to (not including) the target, only blocking when a real incomplete step is found in that range — replaces the old hard cap at `stepIdx + 1`.
- Step-indicator circle fill/checkmark and connector line now derive `done` per-step from `localDeliverables` status (matched by `deliverable_key`) instead of `i < stepIdx`; the active-step ring (`i === stepIdx`) still takes precedence in the ternary so a done-and-active step keeps its ring.
- Redesigned the step-gate popup: warning icon now sits in a `#FFF3D6` (`--warn-bg`) tinted circle instead of a bare icon; footer replaced the single generic "OK" button with a ghost "Stay here" dismiss + primary blue `Go to "{step name}"` button that jumps straight to the identified blocking step, mirroring the sibling "Missing required fields" modal's ghost/primary footer pattern already in this file.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — all four changes above (state shape, gating logic, indicator render, popup redesign).

### Deviations From Plan
- None. Implementation follows the task document's proposed code changes as written (variable names/wording matched the suggested implementation almost verbatim).

### Verification Run
- `npx tsc --noEmit` - PASS (no output, no new errors)
- `pnpm lint` - PASS (no output)
- Manual in-browser reproduction of the reported scenario (HTML mockup → Client sign-off with Storage folder + KB already done) - SKIPPED (not run in this pass; flagged for the `test` stage / manual QA, per task's own Verification section which calls for browser-based acceptance testing)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code introduced — `stepStatus` (the pre-existing current-step-only status var) stays referenced elsewhere (header chip, deadline badge at lines ~700, 724, 2236) and wasn't touched; the new `isStepCleared` helper is a distinct, intentional generalization for arbitrary step indices, not a duplicate.
- No `any`/untyped escape hatches; `blockingIdx: number | null` with a plain guard-clause loop keeps the gating logic flat and readable, matching the task doc's suggested implementation.
- Naming (`isStepCleared`, `handleStepIndicatorClick`, `blockingIdx`, `done`) accurately describes behavior.
- Redesigned popup reuses the sibling "Missing required fields" modal's exact ghost/primary button classes — no new visual pattern introduced into the file.
- Accessibility preserved: `role="dialog"`, `aria-modal`, `aria-labelledby="step-gate-title"` and the `<h2 id="step-gate-title">` pairing all still present after the JSX restructure.

### Deviations
- Minor: when the identified blocking step is the current step itself (adjacent-step case, i.e. `blockingIdx === stepIdx`), the popup's primary button reads `Go to "{current step name}"` and clicking it is a no-op (`setStepIdx` to the index already active) — it just closes the popup. Functionally harmless and still satisfies the requirement that the button "jumps straight to the identified blocking step," but the copy is slightly redundant in that one case. Not required to fix; flagged for awareness, not blocking.

### Required Fixes
- None.

### Post-Gate Follow-Up (user feedback, same session)
- User requested the active step's circle always show its step number, never a checkmark, even when that step is done — checkmarks should only appear on non-active completed steps. Changed the circle content ternary from `done ? <Check size={11} /> : i + 1` to `done && i !== stepIdx ? <Check size={11} /> : i + 1` (`_onboarding-wizard.tsx` step-indicator render). `npx tsc --noEmit` re-run clean after the change.

### Post-Gate Follow-Up #2 (live QA bug + design token gap, same session)
- **New bug found via manual QA**: an overdue-but-incomplete step (e.g. "Outcome target", due Day 4, viewed on Day 7, no file/text, checklist unchecked) could still be jumped past via the step indicator straight to the next step, while the same step's own "Continue" button correctly hard-blocked with the "Incomplete checklist items" modal. Root cause: `isStepCleared` (added in the original task 200 pass) treated a step as cleared if it was `"done"` **or** overdue (`currentDay > STEPS[j].dayEnd`) — that overdue bypass was carried over from the pre-task-200 code's single-adjacent-step check, whose comment claimed it "matched Continue's own gate," but `handleContinueClick` never actually had an overdue bypass — only its own hard block + an explicit "force proceed anyway" modal. The two gates disagreeing was the bug. Fix: `isStepCleared` now only checks `status === "done"` — the overdue auto-bypass is removed entirely. Forward navigation via the step indicator now requires the same real completion as Continue; the only sanctioned way past incomplete data on either path is the existing force-confirm modal.
- **Design-system button-token audit**: user flagged that `stepGateAlert` and "Incomplete checklist items" popups don't follow `_final_design/guide/central-hub-design-system.md`'s documented button component (`rounded-full` pill, `--blue-700` hover, bordered ghost). Checked other portfolio-tracker files already redesigned to v2.0 tokens (`_onboarding-detail.tsx`, `portfolio-tracker/new/_content.tsx`, `portfolio-tracker/import/_content.tsx`) — all use `rounded-full` + bordered ghost (`border-[#E2E7F2]` → hover `border-[#A8C6F5]`) + blue primary hover `#0063D6`, confirming the wizard's three modals (`showIncompleteModal`, `showForceConfirmModal`, `stepGateAlert`) were the actual outliers (still `rounded-lg` + borderless ghost + `hover:opacity-90`), not the other way around — the earlier "match the sibling force-confirm modal in this file" reasoning from the original task 200 pass turned out to be matching an already-noncompliant pattern. All three modals' footer buttons (Cancel/Stay here/Review = bordered ghost pill; Mark all as done/Go to "X"/Yes, proceed = blue pill with `hover:bg-[#0063D6]` + brand shadow) updated to the guide-compliant recipe.
- **Checklist item icon**: "Incomplete checklist items" modal rendered each unchecked item with a bare `<Circle>` icon (reads as an empty radio button). Replaced with the same 17px/5px-radius empty checkbox square already used by the live checklist rows elsewhere in this file (`_onboarding-wizard.tsx:~2771`), for visual consistency between "here's what's unchecked" (the modal) and "check it here" (the real checklist).
- Files changed: `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` only (same file as the original task).
- Verification: `npx tsc --noEmit` - PASS; `pnpm lint` - PASS. Manual in-browser re-verification of the reported Outcome-target overdue-skip scenario not re-run in this pass — flagged for QA same as the original task's Verification section.

### Post-Gate Follow-Up #3 (user feedback, same session)
- User asked that clicking a step-indicator item also run the same field-level validation Continue does (red field border + inline error message) instead of just popping the generic "Step not available yet" alert, when the block is on the step currently being viewed.
- Refactored `handleContinueClick`'s validation body (own-field checks for outcome-target/migration-checklist/content-map + the incomplete-checklist-items gate + the force-confirm fallback) out into a new `validateCurrentStepForAdvance(): boolean` — pure extraction, identical branching/early-returns, so Continue's behavior is unchanged (verified by inspection: every prior early `return` now maps 1:1 to `return false`, and the prior fallthrough to `setStepIdx(s => s + 1)` now maps to `return true` + the same `setStepIdx` call in the thin `handleContinueClick` wrapper).
- `handleStepIndicatorClick`: when the multi-step chain-walk finds the blocking step is the one currently on screen (`blockingIdx === stepIdx` — always true for a click on the immediate next step, and possibly true for a farther jump too), it now calls `validateCurrentStepForAdvance()` instead of opening the generic `stepGateAlert` popup; only advances (`setStepIdx(i)`) if that returns true. When the blocker is a *different*, not-currently-rendered step further down the chain (`blockingIdx !== stepIdx`), the `stepGateAlert` popup with its "Go to" shortcut is unchanged — there's no field UI to highlight for a step that isn't on screen.
- Files changed: `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` only.
- Verification: `npx tsc --noEmit` - PASS; `pnpm lint` - PASS. Manual in-browser re-verification (Outcome target incomplete → click "Migration checklist" nav item → expect red dropzone/inline error and/or Incomplete-checklist-items modal, matching Continue) not re-run in this pass — flagged for QA.

## Completion Summary

Closed after four rounds in one session — the original reported bug plus three rounds of live user QA feedback, all in `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` only:

1. **Original fix**: `handleStepIndicatorClick` used to hard-cap forward jumps at exactly `stepIdx + 1`, ignoring whether intervening steps were actually done — fixed to walk the full chain from `stepIdx` to the target and only block on a genuinely incomplete step, naming the specific blocker. Step-indicator checkmarks were fixed from position-based (`i < stepIdx`) to real per-step completion. The step-gate popup was redesigned with a tinted warning-icon container and an outcome-named "Go to" action.
2. **Follow-up #1**: the active step's circle now always shows its number rather than a checkmark, even when that step is done — checkmarks are reserved for non-active completed steps.
3. **Follow-up #2**: live QA surfaced a second, related navigation bug — an overdue-but-incomplete step could still be skipped past via the step indicator (an inherited-but-never-actually-matching "matches Continue's gate" overdue bypass), while Continue on that same step correctly hard-blocked. Removed the overdue bypass so both navigation paths require real completion. Also audited and fixed all three wizard modals' button styling against the design guide — the wizard's modals turned out to be the outliers (`rounded-lg`/opacity-hover/borderless-ghost) versus the guide-compliant `rounded-full`/`hover:bg-[#0063D6]`/bordered-ghost pattern already shipped elsewhere in the same feature area (`_onboarding-detail.tsx`, `portfolio-tracker/new` and `import` wizards) — and swapped a stray `Circle` (radio-like) icon for the real checkbox-square used by the live checklist.
4. **Follow-up #3**: clicking a step-indicator item blocked by the currently-viewed step now runs the same field-level validation Continue uses (red field border + inline message, or the Incomplete-checklist-items modal) instead of only a generic popup — achieved via a non-behavior-changing extraction of Continue's validation logic into `validateCurrentStepForAdvance()`, shared by both entry points.

`npx tsc --noEmit` and `pnpm lint` passed clean after every round. Full manual browser re-verification of all four rounds together (the original repro, overdue-skip fix, button redesign, and inline field-validation-on-nav-click) has not been run end-to-end in this session — recommended before/as part of the next live QA pass on this wizard.
