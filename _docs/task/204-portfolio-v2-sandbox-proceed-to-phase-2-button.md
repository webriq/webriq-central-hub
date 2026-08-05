# 204: Portfolio Tracker v2 Sandbox — "Proceed to Phase 2" Button on Checklist Completion

**Created:** 2026-08-04
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Testing (2026-08-04)

---

## Overview

`/v2/portfolio-tracker/[projectId]/v2` is the task-202 tabbed sandbox redesign of the Phase 1 Onboarding Wizard (`OnboardingWizardV2` in `_onboarding-wizard-v2.tsx`), with a "Checklist" tab (`ChecklistTab`) that shows Phase 1's 7 sub-phase deliverables and their internal completion-gating checkboxes. Today the sandbox has no way to actually finish Phase 1 — there is no completion action anywhere on the page.

The shipping (non-sandbox) Onboarding Wizard at `../_onboarding-wizard.tsx` already has this exact capability: a "Complete Phase 1 & notify PM" CTA that POSTs `/api/projects/[projectId]/programme/complete-phase`, plays an animated "wrapping up" transition, then shows a completion summary. That API route already advances the project to Phase 2 and calls `notifyProjectMembers()`, which notifies every row in `project_members` for the project — including a PM added as a collaborator — with zero extra code required.

This task adds the equivalent trigger to the v2 sandbox: once every Phase 1 deliverable is checked off, a "Proceed to Phase 2" button appears in the top-right corner of the page header. Clicking it runs the same completion flow (same API call, same animated transition, same notify-on-completion behavior) as the existing Onboarding Wizard — reusing the endpoint's existing notification behavior rather than building anything new.

## Requirements

- [ ] Compute an `allDeliverablesDone` flag in `OnboardingWizardV2`: true when every Phase 1 deliverable config key (`getPhaseByNumber(1).deliverables`, 7 keys: `kickoff`, `outcome-target`, `migration-checklist`, `content-map`, `html-mockup`, `storage-kb`, `client-signoff`) has a matching row in the `deliverables` state array with `status === "done"`. This mirrors exactly what the Checklist tab already renders — deliverable status is auto-derived server-side from internal checklist items (`internal-deliverables/[deliverableKey]/route.ts:54-104`), so "all checked" in the Checklist tab and `allDeliverablesDone === true` are the same condition.
- [ ] When `allDeliverablesDone && isWriteRole && isPhaseActive`, render a "Proceed to Phase 2" button in the very top-right corner of the page header (the `flex items-start justify-between` row at `_onboarding-wizard-v2.tsx:239-248`, which currently has an empty right side).
  - `isWriteRole` (existing: `admin`/`super_admin`/`marketing`) and `isPhaseActive` are already computed in this component — reuse them, don't recompute. This matches the shipping wizard's rule that only Marketing/Admin/Super Admin can complete Phase 1, and an inactive (already-advanced-past) phase can't be re-completed (task 160 precedent).
  - PM/no-write-role users simply never see the button (no placeholder/disabled state needed — scope this to what was asked, the shipping wizard's own "Only Marketing/Admin can complete Phase 1" messaging lives in a different UI surface not present here).
- [ ] Clicking the button calls the same existing endpoint the shipping wizard uses: `POST /api/projects/${project.id}/programme/complete-phase` with body `{ phase_number: 1 }`. No new or modified API route.
- [ ] While the request is in flight, replace the page body with an animated "wrapping up" transition screen, adapted from `PhaseCompletionTransition` (`../_onboarding-wizard.tsx:6118-6177`) — duplicated into `_onboarding-wizard-v2.tsx`, not imported, per task 202's binding "zero edits to / no imports from the existing wizard file" constraint (see `_wizard-v2-types.ts:1-4`).
- [ ] On success, show a "Phase 1 complete" summary screen (adapted from the shipping wizard's `done` state, `../_onboarding-wizard.tsx:2145-2169`) with a count of deliverables/internal deliverables marked done and a button back to the project (reuse the existing back-navigation target already used elsewhere in this file: `project.project_id ? \`${V2_ROUTES.PORTFOLIO_TRACKER}/${project.project_id}\` : V2_ROUTES.PORTFOLIO_TRACKER`).
- [ ] On failure, show an inline error message and leave the button clickable again for retry (mirrors `completeError`/`completing` in the shipping wizard) — do not leave the user stuck on the transition screen.
- [ ] PM notification: **no new notification code.** `complete-phase`'s existing `notifyProjectMembers()` call (`src/app/api/projects/[projectId]/programme/complete-phase/route.ts:137-143`) already notifies every `project_members` row for the project on advance, which includes a PM added as a collaborator. Verify this behavior manually rather than re-implementing it.

## Out of Scope / Must-Not-Change

- `../_onboarding-wizard.tsx` (the shipping wizard) — zero edits, per task 202's carried-forward constraint. Do not import from it either; duplicate the small pieces of UI needed (transition screen, done screen) into the v2 file instead, matching how this sandbox already duplicates types in `_wizard-v2-types.ts` rather than importing them.
- `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` — reused as-is. No modification, no new route.
- Notification recipients/content — unchanged from what `complete-phase` already sends (`programme_phase_complete` / `programme_complete` event types via `notifyProjectMembers`). This task does not add a separate "notify the PM specifically" code path.
- `ChecklistTab` / `_checklist-tab.tsx` and how internal items are toggled — no changes.
- Phase 2+ UI — there is no v2 sandbox page for Phase 2; the completion screen routes back to the project's Portfolio Tracker detail page, same as the shipping wizard's "Back to Onboarding Timeline" target.
- `_bulk-toolbar.tsx`, `_access-tab.tsx`, `_files-tab.tsx`, `_business-info-tab.tsx`, `_permission-picker.tsx`, `_rename-move-modals.tsx`, `_file-tile.tsx`, `_file-previews.tsx` — unrelated to this change.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/v2/_onboarding-wizard-v2.tsx` | Modify | Add `allDeliverablesDone` computation, top-right "Proceed to Phase 2" button, completion request handler, animated transition + done screens |

## Code Context

### File: `_onboarding-wizard-v2.tsx` — current imports (lines 1-14)

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentProgrammeDay } from "@/config/customer-phases";
import { V2_ROUTES } from "@/config/constants";
import { AssetRow, AssetFolder, DeliverableRow, InternalDeliverableRow, StaffPerson, WizardV2Project, WizardTabKey } from "./_wizard-v2-types";
import { textPrimary, textMuted, PillTabs } from "./_shared-ui";
import { BusinessInfoTab } from "./_business-info-tab";
import { FilesTab } from "./_files-tab";
import { AccessTab } from "./_access-tab";
import { ChecklistTab } from "./_checklist-tab";
```

Needs: `motion` from `framer-motion`; `Sparkles`, `CheckCircle2`, `Check` added to the `lucide-react` import; `getPhaseByNumber` added to the `@/config/customer-phases` import; `cardCls` added to the `_shared-ui` import.

### `_checklist-tab.tsx:9` — the exact deliverable-config list to mirror

```tsx
const DELIVERABLES = getPhaseByNumber(1).deliverables;
```

Add the same module-level constant to `_onboarding-wizard-v2.tsx` and use it to compute the gate:

```tsx
const allDeliverablesDone = deliverables.length > 0
  && DELIVERABLES.every((cfg) => deliverables.find((d) => d.deliverable_key === cfg.key)?.status === "done");
```

### Existing role/permission booleans already in the component (lines 85-89) — reuse, don't recompute

```tsx
const isPM = role === "pm";
const isWriteRole = !!role && WRITE_ROLES.includes(role);
const canEditFiles = (isWriteRole || isPM) && isPhaseActive;
const canEditBusinessInfo = isWriteRole && isPhaseActive;
const canEditChecklist = isWriteRole && isPhaseActive;
```

### Header row to add the button to (lines 239-248)

```tsx
<div className="flex items-start justify-between gap-4 mb-1">
  <div>
    <h1 className={cn("text-[22px] font-bold tracking-[-0.015em]", textPrimary)} style={{ fontFamily: "var(--font-space-grotesk, inherit)" }}>
      {project.company_name} — Onboarding workspace
    </h1>
    <p className={cn("text-[13px] mt-1", textMuted)}>
      Sandbox preview (task 202) — file-management-first redesign of Phase 1. No step order required.
    </p>
  </div>
</div>
```

Add the button as a sibling of the title `div` inside this same flex row, so it lands in the top-right corner:

```tsx
{allDeliverablesDone && isWriteRole && isPhaseActive && (
  <button
    type="button"
    onClick={handleCompletePhase}
    disabled={completingPhase}
    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#471F02] rounded-full px-4 py-2 border-none cursor-pointer disabled:opacity-45 bg-[#FB914E] hover:bg-[#E2762F] hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-[#007BFF] focus-visible:outline-offset-2 shrink-0"
  >
    {completingPhase ? "Completing…" : <><Check size={14} strokeWidth={2.5} /> Proceed to Phase 2</>}
  </button>
)}
```

(CTA color `#FB914E`/`#471F02` matches the shipping wizard's own "Complete Phase 1 & notify PM" button, `../_onboarding-wizard.tsx:2906-2912` — same visual role, one CTA per screen per the v2.0 design convention already documented in that file's comments.)

### Completion handler + request (mirrors `../_onboarding-wizard.tsx:2088-2106`)

```tsx
const handleCompletePhase = async () => {
  setCompletingPhase(true);
  setCompletePhaseError(null);
  setPhaseTransition(true);
  try {
    const res = await fetch(`/api/projects/${project.id}/programme/complete-phase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase_number: 1 }),
    });
    if (!res.ok) throw new Error();
    setPhaseDone(true);
  } catch {
    setCompletePhaseError("Failed to complete Phase 1 — please try again.");
    setPhaseTransition(false);
  } finally {
    setCompletingPhase(false);
  }
};
```

### Transition + done screens (adapted from `../_onboarding-wizard.tsx:6123-6177` and `2141-2169`)

Place before the existing `role === "developer"` / `!role || !WIZARD_ROLES.includes(role)` guard returns, or right after them — whichever reads cleaner given `phaseTransition`/`phaseDone` should only ever be reachable by a role that already passed the write-role gate to trigger them:

```tsx
if (phaseTransition && !phaseDone) {
  return (
    <div className={cn(cardCls, "max-w-lg mx-auto p-8 mt-8")}>
      <div className="text-center mb-6">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="w-14 h-14 rounded-full bg-[#E5F1FF] flex items-center justify-center mx-auto mb-4"
        >
          <Sparkles size={24} className="text-[#007BFF]" />
        </motion.div>
        <div className={cn("text-lg font-bold mb-1 font-heading", textPrimary)}>Wrapping up Phase 1…</div>
        <p className={cn("text-[13px]", textMuted)}>Preparing the project view and handing over to the PM.</p>
      </div>
      {completePhaseError && <p className="text-[12px] text-[#C0392B] text-center">{completePhaseError}</p>}
    </div>
  );
}

if (phaseDone) {
  const doneDeliverables = deliverables.filter((d) => d.status === "done").length;
  const doneInternal = internalDeliverables.filter((d) => d.status === "done").length;
  return (
    <div className={cn(cardCls, "max-w-lg mx-auto p-8 text-center mt-8")}>
      <div className="w-16 h-16 rounded-full bg-[#177E48] flex items-center justify-center mx-auto mb-5">
        <Check size={30} className="text-white" strokeWidth={2.5} />
      </div>
      <div className={cn("text-lg font-bold mb-1.5 font-heading", textPrimary)}>Phase 1 complete</div>
      <p className={cn("text-[13px] mb-5", textMuted)}>{project.company_name} has been handed over to the PM — the project is now visible in Customers/Projects.</p>
      <div className="flex flex-col gap-2 mb-5 text-left">
        {[
          `${doneDeliverables} of ${deliverables.length} deliverables marked done`,
          `${doneInternal} of ${internalDeliverables.length} internal deliverables marked done`,
          `PM notified — Phase 2 begins`,
        ].map((label, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-[12px] font-medium border-[#177E48]/25 bg-[#E3F5EA] text-[#0B1533]">
            <CheckCircle2 size={14} className="text-[#177E48] shrink-0" /> {label}
          </div>
        ))}
      </div>
      <button
        onClick={() => router.push(project.project_id ? `${V2_ROUTES.PORTFOLIO_TRACKER}/${project.project_id}` : V2_ROUTES.PORTFOLIO_TRACKER)}
        className="w-full text-[13px] font-semibold text-white bg-[#007BFF] rounded-lg py-2.5 hover:opacity-90 transition-opacity border-none cursor-pointer"
      >
        Back to Onboarding Timeline
      </button>
    </div>
  );
}
```

Simplified relative to the shipping wizard's version: no `uploadedFiles.length` line (no equivalent file-count tracking surfaced at this point in the v2 sandbox's state — omit rather than fabricate) and no `PHASE1_COMPLETION_CRITERIA` fixed-6-item list in the transition screen (that list is explicitly documented in the shipping wizard as "not derived from actual per-item status" filler; skip it here rather than duplicate non-data-driven copy — the spinner + heading is enough given the transition is brief).

## Implementation Steps

1. In `_onboarding-wizard-v2.tsx`, add imports: `motion` from `"framer-motion"`; `Sparkles`, `CheckCircle2`, `Check` to the existing `lucide-react` import; `getPhaseByNumber` to the existing `@/config/customer-phases` import; `cardCls` to the existing `./_shared-ui` import.
2. Add `const DELIVERABLES = getPhaseByNumber(1).deliverables;` at module scope (mirrors `_checklist-tab.tsx:9`).
3. Add component state: `completingPhase`, `completePhaseError`, `phaseTransition`, `phaseDone` (all local `useState`, no new props).
4. Add the `allDeliverablesDone` computation and `handleCompletePhase` function as shown in Code Context.
5. Insert the `phaseTransition`/`phaseDone` early-return render blocks after the existing role-guard early returns (`role === "developer"` / unauthorized) so they still respect access control, but before the main tabbed-page `return`.
6. Add the "Proceed to Phase 2" button to the header row (lines 239-248), conditioned on `allDeliverablesDone && isWriteRole && isPhaseActive`.
7. Manually verify in the browser as a `marketing` or `admin` user: with Phase 1 active and some deliverables incomplete, confirm the button is absent; check off every internal checklist item across all 7 sub-phases in the Checklist tab; confirm the button appears top-right without a page reload (state-driven, not a refetch); click it and confirm the transition screen appears, then the "Phase 1 complete" screen, and that the project's Phase advances to 2 (check via the project's Portfolio Tracker detail page / `customer_phases` row) and a PM who is a project member receives a notification in the bell dropdown.
8. Confirm a `pm`-role user viewing the same fully-checked page never sees the button.

## Acceptance Criteria

- [ ] "Proceed to Phase 2" button is not rendered while any Phase 1 deliverable is not yet `done`.
- [ ] Button appears in the top-right corner of the page header the moment the last checklist item is checked, for `admin`/`super_admin`/`marketing` roles, without a page refresh.
- [ ] Button is never shown to `pm` (or any non-write role), and never shown when `isPhaseActive` is `false`.
- [ ] Clicking the button calls `POST /api/projects/[projectId]/programme/complete-phase` with `{ phase_number: 1 }` — the same request the shipping Onboarding Wizard makes — and no new API route is created.
- [ ] A transition screen shows while the request is in flight; a "Phase 1 complete" summary screen shows on success with a working "Back to Onboarding Timeline" button.
- [ ] On request failure, an inline error is shown and the user can retry (the button becomes clickable again, no stuck transition screen).
- [ ] Every project member row in `project_members` for the project — including a PM added as a collaborator — receives an in-app (and best-effort push) notification via the untouched `notifyProjectMembers()` call already inside `complete-phase`.
- [ ] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser verification (no test runner configured): exercise the full flow described in Implementation Step 7 at `/v2/portfolio-tracker/[projectId]/v2` using a project with Phase 1 active, as both a write-role user (to trigger completion) and separately confirm the PM-role view (button absent) and a PM's notification bell (receives the notification) using a second seeded account.

## Compatibility Touchpoints

- No migration, no new env vars, no MCP tool inventory changes.
- No API contract changes — `complete-phase` is called with the same shape the shipping wizard already sends it.

## Implementation Notes

### What Changed
- Added `DELIVERABLES` module constant (`getPhaseByNumber(1).deliverables`) and an `allDeliverablesDone` computation in `OnboardingWizardV2` — true when every Phase 1 deliverable key has a `deliverables` row with `status === "done"`.
- Added a "Proceed to Phase 2" button to the top-right of the page header, gated on `allDeliverablesDone && isWriteRole && isPhaseActive` (reusing the component's existing role/phase booleans, no new permission logic).
- Added `handleCompletePhase`, which POSTs `{ phase_number: 1 }` to the existing `/api/projects/[projectId]/programme/complete-phase` route — the same endpoint and payload the shipping Onboarding Wizard already uses. No API route changes; the route's existing `notifyProjectMembers()` call is what delivers the PM notification, unmodified.
- Added `phaseTransition` (animated "Wrapping up Phase 1…" screen, adapted from `PhaseCompletionTransition` in `../_onboarding-wizard.tsx`) and `phaseDone` (adapted "Phase 1 complete" summary screen) early-return render states, duplicated locally rather than imported — per task 202's binding "no edits to / no imports from the shipping wizard file" constraint.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/v2/_onboarding-wizard-v2.tsx` — all changes described above; single file, as scoped in the task document.

### Deviations From Plan
- None. Implementation followed the task document's Code Context snippets as written, including the two deliberate simplifications the plan already called out relative to the shipping wizard's version (no `uploadedFiles.length` line in the done summary, no fixed `PHASE1_COMPLETION_CRITERIA` list in the transition screen).

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (no warnings or errors)
- Manual/browser verification (Implementation Step 7/8) - SKIPPED (deferred to the `test` stage per the implement skill's workflow — this stage runs typecheck/lint only; no dev server was started during implementation)

### Notes for Reviewers
- The `impeccable` design-lint hook flagged literal font-size Tailwind classes (`text-lg`, `text-[13px]`, `text-[12px]`, etc.) on the new lines as "outside DESIGN.md's type ramp." Reviewed and left as-is: these exact values match the pre-existing convention used throughout this same file and the shipping wizard file being adapted from (e.g. the file's own header title already uses `text-[22px]`, its subtitle `text-[13px]`) — this codebase deliberately uses arbitrary pixel-based Tailwind classes rather than a formal type ramp (see CLAUDE.md's "UI Polish Conventions" — hand-rolled patterns are the established convention, not a shadcn/formal design-token system). No change made; classifying as a false positive relative to this project's actual conventions.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, no `any`/untyped escape hatches, no deep nesting, no secrets/debug logging.
- New state/handler names (`allDeliverablesDone`, `handleCompletePhase`, `phaseTransition`, `phaseDone`, `completingPhase`, `completePhaseError`) accurately describe their behavior and follow the file's existing naming conventions.
- Styling stays Tailwind-only (no `style={{}}`), reuses `cardCls`/`textPrimary`/`textMuted` from `_shared-ui.tsx` rather than inventing new tokens, and matches the CTA color/role convention already established by the shipping wizard's own "Complete Phase 1 & notify PM" button.
- `impeccable` design-lint flagged literal font sizes on both new and touched pre-existing lines — reviewed and confirmed as false positives (documented in Implementation Notes' "Notes for Reviewers"): this codebase's actual, established convention is arbitrary pixel-based Tailwind classes throughout this exact file, not a formal type ramp. No change made.

### Deviations
- **Major → fixed during this quality gate pass:** the task document's own Code Context snippet (and the resulting first-pass implementation) rendered `completePhaseError` only inside the `phaseTransition` overlay block. Because the failure `catch` handler sets `completePhaseError` and `setPhaseTransition(false)` in the same synchronous update, React batches them — the overlay (the only place the error could render) unmounts in the same render pass the error is set, so the error was never actually painted to the DOM. This violated Requirement bullet 5 ("On failure, show an inline error message...") and the corresponding Acceptance Criterion. Root cause: the port deviated from the shipping wizard's actual pattern, which renders `completeError` on the persistent main page (`../_onboarding-wizard.tsx:2878`), not inside its transient transition overlay (which has no error slot at all). Fixed by moving the error `<p>` out of the transition block and into the main page's header area, directly under the "Proceed to Phase 2" button (wrapped in a `flex flex-col items-end` container so button + error stack correctly in the top-right corner). Re-verified with `npx tsc --noEmit` and `pnpm lint` — both still PASS after the fix.
- No other deviations. Scope matches the task document's Proposed File Changes exactly (`git status` confirms only `_onboarding-wizard-v2.tsx` and `TASKS.md` touched, plus the new task doc itself); no edits to `../_onboarding-wizard.tsx`, `complete-phase/route.ts`, or `_checklist-tab.tsx`, per the Out of Scope boundaries.
