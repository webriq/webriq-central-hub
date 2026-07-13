# 132: Onboarding Wizard — 90-Day Content Map Step (Rich Text + Optional File Attachment)

**Created:** 2026-07-13
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The `content-map` sub-phase step ("Topics, clusters, and publishing schedule
through Day 90.", Day 10–11, owner Bert) currently renders no data-entry
fields — it falls through to the generic `WizardDeliverableRow` plus its two
mapped internal-deliverable checklist items (`cluster-topics-schedules`,
`publishing-plan`).

Per the user's direction, this step is redesigned with the exact same
approach as `outcome-target` (task 130) and `migration-checklist` (task
131): a `RichTextField` for Bert to type the content clusters/topics/
publishing schedule directly, plus an either/or file attachment (e.g. a
content calendar spreadsheet), autosaved, with a `SaveIndicator`, a
required-before-continue gate, and an in-app file viewer. No new components.

## Requirements

- [ ] `content-map` step renders a `RichTextField` ("Content clusters &
      90-day publishing schedule") and an "Or" divider + file-upload column
      ("Upload a document instead"), styled identically to Outcome
      Target's/Migration Checklist's shipped layout.
- [ ] Content autosaves (2s debounce, skip-if-unchanged) to
      `wizard_data["content-map"].contentMapText` via the existing generic
      wizard-data PATCH route — no route changes needed.
- [ ] A `SaveIndicator` (idle/saving/saved/error) shows in the step heading.
- [ ] File uploads reuse the two-call `assets/upload` → `assets` flow,
      tagged `phase_number: 1`, `project_id: project.id`, `label: "Content
      Map"`.
- [ ] An `Eye`-icon in-app viewer (reusing the shared viewer state) lets Bert
      open an uploaded file without leaving the wizard.
- [ ] Continuing past this step is blocked unless the rich text has content
      OR at least one file is attached (`isContentMapFilled`), matching the
      established hard-gate pattern.
- [ ] Both fields load previously-saved data on mount from
      `wizardData["content-map"]`.

## Out of Scope / Must-Not-Change

- No changes to the `cluster-topics-schedules`/`publishing-plan` internal
  checklist items or their existing soft-gate modal behavior.
- No AI/LLM generation, no new "view container" elsewhere in the app.
- `kickoff`, `outcome-target`, `migration-checklist`, `storage-kb`,
  `html-mockup`, `client-signoff` are untouched.
- No DB schema/migration changes.
- No new npm/pnpm packages.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add `content-map` state, autosave effect, upload/remove/view handlers, required-field gate, and render block. |

## Code Context

Same copy-and-rename approach as task 131, sourced from Outcome Target's
shipped shape in `_onboarding-wizard.tsx`:

- `outcomeText` → `contentMapText`, seeded from `contentMapData.contentMapText`.
- `outcomeFiles`/`uploadingOutcomeFile`/`outcomeUploadError` →
  `contentMapFiles`/`uploadingContentMapFile`/`contentMapUploadError`.
- `outcomeSaveStatus`/`outcomeLastSavedAt`/`outcomeSaveError` →
  `contentMapSaveStatus`/`contentMapLastSavedAt`/`contentMapSaveError`, with
  `lastContentMapSavedRef` + `contentMapSaveRef`.
- Handlers → `handleContentMapUpload`/`handleRemoveContentMapFile`/
  `handleViewContentMapFile` (label `"Content Map"`; reuse the shared
  `viewerFile`/`viewerUrl`/`viewerLoading`/`viewerError` state).
- `isOutcomeFilled` → `isContentMapFilled = stripHtml(contentMapText).length > 0 || contentMapFiles.length > 0`.
- `outcomeFieldError` → `contentMapFieldError`; extend `handleContinueClick`.
- Render block placed after task 131's `migration-checklist` block, guarded
  by `step.key === "content-map"`.
- Extend the `SaveIndicator` heading condition with a fourth block for
  `step.key === "content-map"`.

If task 131 has already landed by the time this is implemented, follow its
exact naming/structure convention rather than Outcome Target's directly, to
keep the three near-identical blocks visually and structurally consistent
in the file.

## Implementation Steps

1. Derive `contentMapData` from `wizardData["content-map"]`.
2. Add state, refs, and the debounced autosave `useEffect` for `contentMapText`.
3. Add `handleContentMapUpload`/`handleRemoveContentMapFile`/`handleViewContentMapFile`.
4. Extend the heading `SaveIndicator` condition and `handleContinueClick`'s required-field gate.
5. Add the `step.key === "content-map"` render block.
6. `npx tsc --noEmit` and `pnpm lint`.
7. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] The "90-day content map" step (Step 4 of 7) shows a rich text field and an either/or file-upload column, styled identically to the other redesigned steps.
- [ ] Typing triggers autosave with correct `SaveIndicator` transitions and no flash on load.
- [ ] Reloading re-populates the field from `wizard_data["content-map"].contentMapText`.
- [ ] Uploading a file succeeds, appears with view/remove buttons, and appears in the Assets tab tagged Phase 1, label "Content Map".
- [ ] Clicking "Continue" with both fields empty is blocked with an inline error; filling either one advances.
- [ ] The existing `cluster-topics-schedules`/`publishing-plan` checklist items still work unchanged.
- [ ] All other steps are unchanged.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new packages added.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000:
#   - Navigate to "90-day content map" (Step 4)
#   - Type content -> confirm autosave indicator transitions correctly
#   - Reload -> confirm persistence
#   - Upload a file -> confirm it appears in the box AND Assets tab (Phase 1, "Content Map")
#   - Clear both, click Continue -> confirm blocked; fill one -> confirm it advances
```

## Compatibility Touchpoints

- None — no DB migration, no API contract change, no new packages.

## Implementation Notes

### What Changed
- Added a `content-map` sub-phase step to the onboarding wizard, a byte-for-byte structural copy of Outcome Target's/Migration Checklist's shipped shape: a `RichTextField` ("Content clusters & 90-day publishing schedule") autosaved (2s debounce, skip-if-unchanged) into `customer_phases.wizard_data["content-map"].contentMapText`, an either/or `FileUploadBox` ("Upload a document instead", label `"Content Map"`) with an in-app `Eye` viewer reusing the shared `viewerFile`/`viewerUrl`/`viewerLoading`/`viewerError` state, a `SaveIndicator` in the step heading, and a required-before-continue gate (`isContentMapFilled`) added to `handleContinueClick`.
- Task 131 (Migration Checklist) had already landed in this file by the time this was implemented, so the new block was placed immediately after Migration Checklist's, following its exact naming/structure convention for consistency (per the task doc's own instruction).
- No new components, no API/DB changes — same reasoning as task 131.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — added `contentMapData` derivation; `contentMapText`/`contentMapFiles`/`uploadingContentMapFile`/`contentMapUploadError`/`viewingContentMapFileId`/`contentMapFieldError`/`contentMapSaveStatus`/`contentMapLastSavedAt`/`contentMapSaveError` state; `lastContentMapSavedRef` + `contentMapSaveRef` refs; `isContentMapFilled` derived check; a debounced autosave `useEffect` for `content-map`; `handleContentMapUpload`/`handleRemoveContentMapFile`/`handleViewContentMapFile` handlers; the `handleContinueClick` gate extension; the `SaveIndicator` heading condition extension; and the `step.key === "content-map"` render block, placed directly after the `migration-checklist` block. Only file touched, per the task's scope.

### Deviations From Plan
- None — implementation matched the task document's Code Context and Implementation Steps exactly.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- Manual browser verification — **SKIPPED**, same reason and same user decision as task 131 (recorded once in this session): live verification requires a logged-in Hub session, and entering the user's password to authenticate is a prohibited action regardless of authorization; the user chose to skip live testing in favor of code-review confirmation for this batch of near-identical steps.
- Code-review verification in place of live testing: the new block is structurally identical to Migration Checklist's (task 131) and Outcome Target's (task 130, browser-verified) already-proven implementations, with only variable names, the `subPhaseKey`/`label` strings, and copy text changed. No new logic paths introduced.
