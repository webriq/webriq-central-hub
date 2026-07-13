# 135: Onboarding Wizard — Client Call, Sign-Off Step (Meeting Notes + Agreement Upload)

**Created:** 2026-07-13
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** fast

---

## Overview

The `client-signoff` sub-phase step ("Scope, mockup, and migration plan
approved. PM joins for handover.", Day 15, owner "PM + Bert") is the **last**
of the 7 Phase 1 steps and currently renders no data-entry fields — it falls
through to the generic `WizardDeliverableRow`, with **no** mapped
internal-deliverable checklist items today (unlike every other step in this
redesign batch).

Per the user's direction: "same as Kick-off there will be a meeting and an
upload of the agreement." This mirrors Kickoff's own shape — a
`RichTextField` for meeting notes (the sign-off call: what was
discussed/approved) plus a `FileUploadBox` for the signed agreement — with
autosave, a `SaveIndicator`, and new internal-deliverable checklist items
(mirroring how Kickoff itself got its 3-item checklist in task 129, and
Outcome Target got its 1-item checklist in task 130's follow-up 6).

Because this is the *last* step, "Continue" doesn't exist here — the
primary action is "Complete Phase 1 & notify PM" (`handleComplete`,
`_onboarding-wizard.tsx:565-581`), which today has **no field-validation
gate at all**. This task adds one, consistent with every other redesigned
step's required-before-proceeding pattern.

## Requirements

- [ ] `client-signoff` step renders a `RichTextField` ("Sign-off call notes")
      and an either/or file-upload column ("Upload the signed agreement
      instead") — same visual pattern as Outcome Target/Migration
      Checklist/Content Map (`grid grid-cols-1 lg:grid-cols-[1fr_auto_280px]`).
- [ ] Content autosaves (2s debounce, skip-if-unchanged) to
      `wizard_data["client-signoff"].signoffNotes` via the existing generic
      wizard-data PATCH route.
- [ ] A `SaveIndicator` shows in the step heading.
- [ ] File uploads reuse the two-call `assets/upload` → `assets` flow,
      tagged `phase_number: 1`, `project_id: project.id`, `label:
      "Signed Agreement"`.
- [ ] An `Eye`-icon in-app viewer lets Bert/PM open the uploaded agreement
      without leaving the wizard.
- [ ] Two new internal-deliverable checklist items are added to
      `INTERNAL_DELIVERABLES` (`src/config/customer-phases.ts`), mapped to
      `subPhaseKey: "client-signoff"`: `"signoff-call-held"` ("Sign-off call
      held with the client, PM joining for handover") and
      `"signoff-agreement-filed"` ("Scope, mockup, and migration plan
      approval recorded — notes or signed agreement"). This gives the step
      the same checklist-driven status derivation every other
      checklist-bearing step already has (per this file's established
      convention — see task 130's "Side effect of adding a checklist item").
- [ ] A backfill migration (mirroring task 129's `062_...sql` and task 130's
      `063_...sql`) inserts `onboarding_internal_deliverables` rows for
      these two new keys into any project already mid-programme.
- [ ] `handleComplete` is gated: if `isSignoffFilled` (notes text or an
      attached file) is false, block completion, show an inline error, and
      do not call the `complete-phase` API — mirroring Outcome Target's
      `handleContinueClick` gate, adapted to the completion action since
      this is the last step.
- [ ] The field loads previously-saved data on mount from
      `wizardData["client-signoff"]`.

## Out of Scope / Must-Not-Change

- No changes to the "Mark Phase 1 complete" notification/visibility/Day-16
  side effects in `complete-phase` — only a client-side gate in front of the
  existing call, per the literal ask (a meeting + an upload, not a rework of
  what completion does).
- No video-call integration (e.g. embedding a real meeting link/scheduler) —
  "there will be a meeting" is recorded as notes after the fact, exactly
  like Kickoff's own meeting is (Kickoff has no calendar integration either,
  just a `kickoff-meeting-held` checklist item that's manually marked).
- No AI/LLM generation.
- `kickoff`, `outcome-target`, `migration-checklist`, `content-map`,
  `html-mockup`, `storage-kb` are untouched.
- No changes to the `showIncompleteModal`/`showForceConfirmModal` flow — the
  new gate on `handleComplete` is a **separate, harder** block (like Outcome
  Target's own field gate), not routed through the existing soft-gate modal
  (which is designed around "Continue", not the terminal "Complete" action).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/config/customer-phases.ts` | Modify | Add `signoff-call-held` and `signoff-agreement-filed` to `INTERNAL_DELIVERABLES`, mapped to `subPhaseKey: "client-signoff"`. |
| `supabase/migrations/0NN_backfill_client_signoff_internal_deliverables.sql` | Create | Backfill the two new checklist rows for in-progress projects (next available migration number at implementation time). |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add `client-signoff` state, autosave effect, upload/remove/view handlers, the `handleComplete` gate, and the render block. |

## Code Context

### `INTERNAL_DELIVERABLES` — pattern to follow (`src/config/customer-phases.ts:156-163`)

```ts
// Kickoff completion checklist (task 129)...
{ key: "kickoff-meeting-held", name: "Kickoff meeting held", description: "A structured kickoff call took place with the client.", subPhaseKey: "kickoff" },
// ...
// Outcome Target completion checklist (task 130)...
{ key: "outcome-target-filed", name: "Agreed measurable outcomes for the 120-day programme filed", description: "Recorded as text or an attached document.", subPhaseKey: "outcome-target" },
```

Append, following the same comment convention:

```ts
// Client sign-off completion checklist (task 135) — gates the sub-phase's own status via the
// same auto-derive-from-siblings logic used above; not part of the original QBR table.
{ key: "signoff-call-held", name: "Sign-off call held with the client, PM joining for handover", description: "A structured sign-off call took place.", subPhaseKey: "client-signoff" },
{ key: "signoff-agreement-filed", name: "Scope, mockup, and migration plan approval recorded", description: "Recorded as notes or a signed agreement.", subPhaseKey: "client-signoff" },
```

### Backfill migration pattern (task 130's `063_backfill_outcome_target_internal_deliverable.sql`)

```sql
insert into onboarding_internal_deliverables (project_id, deliverable_key, status)
select cp.project_id, v.key, 'pending'
from customer_phases cp
cross join (values ('signoff-call-held'), ('signoff-agreement-filed')) as v(key)
where cp.phase_number = 1
on conflict (project_id, deliverable_key) do nothing;
```

(Confirm the exact source table/column names against the live schema at
implementation time — task 130's migration is the canonical example to copy
verbatim, not re-derive.)

### Outcome Target's shipped shape — the structural template (`_onboarding-wizard.tsx`, see task 130 and its Follow-up Changes)

Same rename-and-copy approach as tasks 131/132:
`outcomeText` → `signoffNotes`; `outcomeFiles`/etc. → `signoffFiles`/
`uploadingSignoffFile`/`signoffUploadError`; save-status state →
`signoffSaveStatus`/`signoffLastSavedAt`/`signoffSaveError` +
`lastSignoffSavedRef`/`signoffSaveRef`; handlers →
`handleSignoffUpload`/`handleRemoveSignoffFile`/`handleViewSignoffFile`
(label `"Signed Agreement"`, reusing the shared viewer state).
`isSignoffFilled = stripHtml(signoffNotes).length > 0 || signoffFiles.length > 0`.

### `handleComplete` — where the new gate goes (`_onboarding-wizard.tsx:565-581`)

```tsx
const handleComplete = async () => {
  if (step.key === "client-signoff" && !isSignoffFilled) {   // new
    setSignoffFieldError(true);                               // new
    return;                                                   // new
  }
  setCompleting(true);
  // ...unchanged...
};
```

Since `client-signoff` is by definition the last step whenever this function
is reachable (the "Complete Phase 1" button only renders when `isLastStep`,
`_onboarding-wizard.tsx:868-874`), `step.key === "client-signoff"` will
always be true here in practice — the explicit check is defensive/
self-documenting rather than strictly load-bearing, matching this file's
existing style of guarding by `step.key` rather than by position.

## Implementation Steps

1. Add the two new entries to `INTERNAL_DELIVERABLES` in `customer-phases.ts`.
2. Create and apply the backfill migration (mirror task 130's `063_...sql` exactly in structure).
3. In `_onboarding-wizard.tsx`, derive `clientSignoffData` from `wizardData["client-signoff"]`.
4. Add state, refs, and the debounced autosave `useEffect` for `signoffNotes`.
5. Add `handleSignoffUpload`/`handleRemoveSignoffFile`/`handleViewSignoffFile`.
6. Add `isSignoffFilled` and the `handleComplete` gate (with `signoffFieldError` state and an inline error message under the field, matching Outcome Target's wording pattern).
7. Extend the heading `SaveIndicator` condition.
8. Add the `step.key === "client-signoff"` render block, placed where the generic fallback currently sits for this step.
9. `npx tsc --noEmit` and `pnpm lint`.
10. Manually verify per Acceptance Criteria, including the backfill migration against a real in-progress test project.

## Acceptance Criteria

- [ ] The "Client call — sign-off" step (Step 7 of 7) shows a rich text field for sign-off notes and an either/or file-upload column for the signed agreement.
- [ ] Typing triggers autosave with correct `SaveIndicator` transitions.
- [ ] Reloading re-populates the field from `wizard_data["client-signoff"].signoffNotes`.
- [ ] Uploading a file succeeds, appears with view/remove buttons, and appears in the Assets tab tagged Phase 1, label "Signed Agreement".
- [ ] The two new checklist items ("Sign-off call held…", "Scope, mockup, and migration plan approval recorded…") render under "Internal deliverables" for this step and can be manually marked done.
- [ ] Clicking "Complete Phase 1 & notify PM" with both the notes and file empty is blocked with an inline error and does **not** call the complete-phase API; filling either one allows completion to proceed as before.
- [ ] An already-in-progress test project picks up the two new checklist items after the backfill migration runs (not just newly-started projects).
- [ ] All other steps are unchanged.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new packages added.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Apply the backfill migration against the linked Supabase project (mirroring task 130's `supabase db push --linked` step), then:
pnpm dev
# Manual, localhost:3000, a Phase 1 project already on Step 7:
#   - Confirm the two new checklist items appear (post-backfill) for an already-in-progress test project
#   - Type sign-off notes -> confirm autosave indicator transitions correctly; reload -> confirm persistence
#   - Upload an agreement file -> confirm it appears in the box AND Assets tab (Phase 1, "Signed Agreement")
#   - Clear both fields, click "Complete Phase 1 & notify PM" -> confirm blocked with inline error
#   - Fill one field, click again -> confirm Phase 1 completes normally (PM notified, project visible in Customers/Projects, Day 16 tracking starts) exactly as it did before this change
```

## Compatibility Touchpoints

- New Supabase migration (additive `INSERT ... ON CONFLICT DO NOTHING` backfill, no schema change) — apply via `supabase db push --linked` per this repo's established pattern for this exact kind of backfill (tasks 129/130).
- No API contract changes, no new packages.
