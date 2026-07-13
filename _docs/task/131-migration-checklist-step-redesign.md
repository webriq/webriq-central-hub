# 131: Onboarding Wizard — Migration Checklist Step (Rich Text + Optional File Attachment)

**Created:** 2026-07-13
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The `migration-checklist` sub-phase step ("Full audit of existing site and content
ready for migration.", Day 5–9, owner Bert) currently renders no data-entry
fields at all — it falls through to the generic `WizardDeliverableRow` plus its
one mapped internal-deliverable checklist item (`implementation-file`, "Full
implementation plan document").

Per the user's direction, this step should be redesigned using the exact same
approach already shipped for `outcome-target` (task 130): a `RichTextField`
for Bert to type the migration audit/checklist notes directly, plus an
optional (really either/or) file attachment for cases where the audit lives
in a spreadsheet/document instead of typed notes — autosaved, with a visible
`SaveIndicator`, a required-before-continue gate, and an in-app file viewer.
No new components — `RichTextField`, `FileUploadBox`, `FileViewerModal`, and
`SaveIndicator` are already generic, file-scoped, reusable functions in
`_onboarding-wizard.tsx`.

## Requirements

- [ ] `migration-checklist` step renders a `RichTextField` ("Migration
      checklist / audit notes") and an "Or" divider + file-upload column
      ("Upload a document instead"), styled identically to Outcome Target's
      final shipped layout (`grid grid-cols-1 lg:grid-cols-[1fr_auto_280px]`,
      `min-h-[220px]`/`max-h-[420px]` scrollable editor).
- [ ] Content autosaves (2s debounce, skip-if-unchanged) to
      `wizard_data["migration-checklist"].checklistText` via the existing
      generic `PATCH /api/projects/[projectId]/programme/wizard-data` route
      — no route changes needed.
- [ ] A `SaveIndicator` (idle/saving/saved/error) shows in the step heading
      for this step, matching Kickoff/Outcome Target's pattern.
- [ ] File uploads reuse the two-call `assets/upload` → `assets` flow,
      tagged `phase_number: 1`, `project_id: project.id`, `label: "Migration
      Checklist"`.
- [ ] An `Eye`-icon in-app viewer (reusing the shared `viewerFile`/`viewerUrl`
      /`viewerLoading`/`viewerError` state and `FileViewerModal`) lets Bert
      open an uploaded file without leaving the wizard.
- [ ] Continuing past this step is blocked (mirroring Outcome Target's
      `handleContinueClick` gate) unless the rich text has content OR at
      least one file is attached (`isMigrationChecklistFilled`), with an
      inline red error matching Outcome Target's wording pattern.
- [ ] Both fields load previously-saved data on mount from
      `wizardData["migration-checklist"]`.

## Out of Scope / Must-Not-Change

- No changes to the `implementation-file` internal-deliverable checklist
  item or its existing soft-gate behavior (the "incomplete checklist items"
  modal on Continue) — this task only adds the field-level required check,
  the same way Outcome Target's hard gate coexists with checklist items that
  don't map to it.
- No AI/LLM generation, no new "view container" elsewhere in the app — same
  boundaries as task 130.
- `kickoff`, `outcome-target`, `storage-kb`, and the other three steps are
  untouched.
- No DB schema/migration changes — `wizard_data` is untyped JSONB.
- No new npm/pnpm packages — Tiptap and the existing viewer components are
  already installed/imported in this file.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add `migration-checklist` state, autosave effect, upload/remove/view handlers, required-field gate, and render block. |

## Code Context

This task is a straight copy of Outcome Target's already-shipped shape (task
130's final state, `_onboarding-wizard.tsx`), renaming variables/labels:

- `outcomeText` → `migrationChecklistText`, seeded from
  `migrationChecklistData.checklistText`.
- `outcomeFiles`/`uploadingOutcomeFile`/`outcomeUploadError` →
  `migrationChecklistFiles`/`uploadingMigrationChecklistFile`/
  `migrationChecklistUploadError`.
- `outcomeSaveStatus`/`outcomeLastSavedAt`/`outcomeSaveError` →
  `migrationChecklistSaveStatus`/`migrationChecklistLastSavedAt`/
  `migrationChecklistSaveError`, with `lastMigrationChecklistSavedRef` +
  `migrationChecklistSaveRef` timer ref.
- `handleOutcomeFileUpload`/`handleRemoveOutcomeFile`/`handleViewOutcomeFile`
  → `handleMigrationChecklistUpload`/`handleRemoveMigrationChecklistFile`/
  `handleViewMigrationChecklistFile` (label `"Migration Checklist"`; reuse
  the shared `viewerFile`/`viewerUrl`/`viewerLoading`/`viewerError` state,
  same as Outcome Target does — do not create a second viewer state).
- `isOutcomeFilled` → `isMigrationChecklistFilled = stripHtml(migrationChecklistText).length > 0 || migrationChecklistFiles.length > 0`.
- `outcomeFieldError` → `migrationChecklistFieldError`; extend
  `handleContinueClick` with the same early-return pattern used for
  `step.key === "outcome-target"`.
- Render block placed after the existing `outcome-target` block
  (`_onboarding-wizard.tsx` around line 800), guarded by
  `step.key === "migration-checklist"`.
- Extend the `SaveIndicator` heading condition
  (`_onboarding-wizard.tsx:671-676`) with a third block for
  `step.key === "migration-checklist"`.

### `wizard-data` PATCH route — already generic, confirmed no changes needed

`subPhaseKey: "migration-checklist"` merges through the same generic path
used by `outcome-target` (`src/app/api/projects/[projectId]/programme/wizard-data/route.ts:45-47`).

## Implementation Steps

1. Derive `migrationChecklistData` from `wizardData["migration-checklist"]` alongside the existing derivations.
2. Add state, refs, and the debounced autosave `useEffect` for `checklistText`, modeled exactly on Outcome Target's.
3. Add `handleMigrationChecklistUpload`/`handleRemoveMigrationChecklistFile`/`handleViewMigrationChecklistFile`, mirroring Outcome Target's handlers with the new label/state names.
4. Extend the heading `SaveIndicator` condition and `handleContinueClick`'s required-field gate.
5. Add the `step.key === "migration-checklist"` render block (3-column grid + "Or" divider + `RichTextField` + `FileUploadBox` with `onView`/`viewingId` wired).
6. `npx tsc --noEmit` and `pnpm lint`.
7. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] The "Migration checklist" step (Step 3 of 7) shows a rich text field and an either/or file-upload column, styled identically to Outcome Target's.
- [ ] Typing triggers autosave ~2s after the last keystroke; `SaveIndicator` transitions idle → saving → saved with no flash on load.
- [ ] Reloading re-populates the field from `wizard_data["migration-checklist"].checklistText`.
- [ ] Uploading a file succeeds, appears in the box with view/remove buttons, and appears in the Assets tab tagged Phase 1, label "Migration Checklist".
- [ ] Clicking "Continue" with both the text and file empty shows the required-field error and does not advance; filling either one clears it and advances.
- [ ] The existing `implementation-file` checklist item and its soft-gate modal still work unchanged.
- [ ] `kickoff`, `outcome-target`, `storage-kb`, `content-map`, `html-mockup`, `client-signoff` are unchanged.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new packages added to `package.json`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000, an in-progress Phase 1 project's onboarding wizard:
#   - Navigate to "Migration checklist" (Step 3)
#   - Type notes -> confirm SaveIndicator idle -> saving -> saved
#   - Reload -> confirm text persists
#   - Upload a file -> confirm it appears in the box AND the Assets tab (Phase 1, "Migration Checklist")
#   - Click the Eye icon -> confirm the in-app viewer opens
#   - Clear both fields, click Continue -> confirm blocked with error; fill one -> confirm it advances
```

## Compatibility Touchpoints

- None — no DB migration, no API contract change, no new packages.

## Implementation Notes

### What Changed
- Added a `migration-checklist` sub-phase step to the onboarding wizard, a byte-for-byte structural copy of Outcome Target's shipped shape (task 130): a `RichTextField` ("Migration checklist / audit notes") autosaved (2s debounce, skip-if-unchanged) into `customer_phases.wizard_data["migration-checklist"].checklistText`, an either/or `FileUploadBox` ("Upload a document instead", label `"Migration Checklist"`) with an in-app `Eye` viewer reusing the shared `viewerFile`/`viewerUrl`/`viewerLoading`/`viewerError` state, a `SaveIndicator` in the step heading, and a required-before-continue gate (`isMigrationChecklistFilled`) added to `handleContinueClick`.
- No new components — `RichTextField`, `FileUploadBox`, `FileViewerModal`, and `SaveIndicator` were already generic, file-scoped, reusable functions; called them with new state instead of duplicating.
- No API/DB changes — the `wizard-data` PATCH route already merges arbitrary JSON per `subPhaseKey`, and the assets routes already accept `phase_number`/`label` passthrough generically.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — added `migrationChecklistData` derivation; `migrationChecklistText`/`migrationChecklistFiles`/`uploadingMigrationChecklistFile`/`migrationChecklistUploadError`/`viewingMigrationChecklistFileId`/`migrationChecklistFieldError`/`migrationChecklistSaveStatus`/`migrationChecklistLastSavedAt`/`migrationChecklistSaveError` state; `lastMigrationChecklistSavedRef` + `migrationChecklistSaveRef` refs; `isMigrationChecklistFilled` derived check; a debounced autosave `useEffect` for `migration-checklist`; `handleMigrationChecklistUpload`/`handleRemoveMigrationChecklistFile`/`handleViewMigrationChecklistFile` handlers; the `handleContinueClick` gate extension; the `SaveIndicator` heading condition extension; and the `step.key === "migration-checklist"` render block (3-column grid + "Or" divider, placed directly after the `outcome-target` block). Only file touched, per the task's scope.

### Deviations From Plan
- None — implementation matched the task document's Code Context and Implementation Steps exactly (a direct rename-and-copy of Outcome Target's shipped shape).

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- Manual browser verification — **SKIPPED at the user's explicit choice**: verifying required a logged-in Hub session, and entering a password into the login form to authenticate is a prohibited action for me regardless of authorization. The user was asked and chose to skip live verification in favor of code-review confirmation, the same fallback task 130 used for its one untestable path (live file upload).
- Code-review verification in place of live testing: the new block is structurally identical to Outcome Target's already browser-verified implementation (task 130), with only variable names, the `subPhaseKey`/`label` strings, and copy text changed — same `RichTextField`/`FileUploadBox`/`SaveIndicator` components, same debounce/skip-if-unchanged autosave shape, same two-call upload flow, same shared viewer state, same `handleContinueClick` gate pattern. No new logic paths were introduced that Outcome Target's own verification didn't already exercise.
