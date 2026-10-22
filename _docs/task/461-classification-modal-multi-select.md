# 461: Classification modal — multi-select editing of `customer_products.classifications`

**Created:** 2026-10-22
**Priority:** HIGH
**Type:** bug fix (with UI change)
**Recommended Tier:** balanced
**Status:** Implemented — not browser-verified

---

## Overview

The "Update classification" card-menu action (task 268) wrote a single value into
`customer_products.classification` and let `mergeClassificationUpdate()` (task 361) infer the
`classifications` array. Because that merge can only ever **add** a non-variant primary, a project
edited from "StackShift I" to "Discrete Development" ended up as
`["Discrete Development", "StackShift I"]`. Two consequences:

1. The projects listing tabs filter on the **union** of the column and the array
   (`_v2-listing/_load-list-data.ts` → `classification.eq.X OR classifications.cs.{X}`), so the card
   stayed under StackShift I *and* appeared under Discrete Development — contradicting task 361's
   acceptance criterion ("leaves the old tab").
2. The app's primary-derivation rule (`find(variant) ?? [0]`) still resolved **StackShift I**, while
   the `classification` column read "Discrete Development" — the two columns disagreed.

Root cause is structural: a single-select editor was writing into a set-valued field. Fix chosen
with the user (2026-10-22): **make the modal multi-select** so the PM edits the whole array, and let
the route derive the primary column from it (the inverse of the old flow).

## Requirements

- [x] R1: The modal lists all six `CLASSIFICATIONS` as checkboxes, pre-checked from the project's
      existing `classifications` array (falling back to `[classification]` for pre-task-157 rows
      that have an empty array and only the primary column).
- [x] R2: At most one StackShift variant can be checked — checking another silently replaces the
      current one, mirroring the intake wizard's `isValidClassificationCombo` rule.
- [x] R3: Save is disabled when nothing is selected or the selection is unchanged.
- [x] R4: `PATCH /api/v2/projects/[projectId]/classification` accepts `{ classifications: string[] }`,
      validates every entry against the catalog, enforces the one-variant rule server-side, stores
      the array in catalog order, and writes `classification` = `derivePrimaryClassification(array)`.
- [x] R5: The legacy single-value body `{ classification: string }` still works (old
      `mergeClassificationUpdate` path) so nothing outside this modal breaks.
- [x] R6: All three card menus (v2 listing, `_legacy-listing`, `projects-old`) pass the array.

## Files Changed

- `src/config/customer-phases.ts` — added `derivePrimaryClassification()` (extracted from the inline
  `find(c => STACKSHIFT_VARIANTS.includes(c)) ?? [0]` duplicated at three call sites); updated
  `mergeClassificationUpdate()`'s doc comment to mark it as the legacy single-select path only.
- `src/components/projects/update-classification-modal.tsx` — `<select>` → checkbox list; prop
  `currentClassification: string | null` → `currentClassifications: string[]`; posts the array.
- `src/app/api/v2/projects/[projectId]/classification/route.ts` — dual-path body handling (array vs
  legacy single), catalog-order canonicalization, server-side combo validation, derived primary.
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` — added `classifications: string[]` to
  `OnboardingProjectListItem`.
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` — select `customer_products(classification,
  classifications)`, build the fallback array, map it into the list item.
- `src/app/(hub)/projects/_v2-listing/_project-card.tsx`, `_portfolio-card-menu.tsx` — prop rename.
- `src/app/(hub)/projects/_legacy-listing/` — `_projects-index.tsx` (type),
  `_load-list-data.ts` (embed + fallback array), `_project-grid-view.tsx`, `_project-card-menu.tsx`.
- `src/app/(hub)/projects-old/` — same four files as the legacy listing.

## Verification Run

- `npx tsc --noEmit` — PASS
- `npx eslint` on every touched file — PASS
- Browser acceptance test — **NOT RUN**. Manual steps:
  1. Open Projects → change a project's classification from StackShift I to Discrete Development.
  2. Confirm the card leaves the StackShift I tab and appears only under Discrete Development.
  3. Reopen the modal; confirm only Discrete Development is checked.
  4. On a project with `["StackShift I","PipelineForge"]`, check PipelineForge stays ticked when
     switching the variant, and that unchecking it persists.
  5. Check a pre-task-157 project (empty array, primary column only) opens with that value checked.

## Pending — found during this pass, not fixed

Recorded so they are not lost. Severity order matches the code-review run.

| # | Where | Issue |
|---|---|---|
| 1 | `src/app/api/projects/[projectId]/programme/phase/route.ts:130`, `src/lib/programme/seed.ts:303` | Jump-to-phase backdate re-compresses days the wizard already skip-compressed (`compressReferenceDay(16,[1])` → 1), so a skipped-Phase-1 project isn't actually backdated; every phase date, the progress bar and reminders shift by the skipped span. |
| 2 | `src/lib/programme/seed.ts:105` | Wizard phase days are on the `programme_duration_days` axis but persisted as 120-relative overrides, then scaled again by `durationDays/120`. A 90-day project's Phase 5 (73–90) becomes 55–68; the timeline reports 68 days while the column says 90. |
| 3 | `src/app/api/projects/[projectId]/programme/phase/route.ts:203` | The already-started branch of the jump override activates a permanently-skipped phase; the not-started branch correctly resolves to the next non-skipped phase. |
| 4 | `src/lib/programme/seed.ts:477` | "Which sub-phase is in_progress" uses scale-only `referenceToDisplay` while the same rows are stored skip-compressed (`compressPhases` + `toDisplayPhases`), so skip projects seed every deliverable `pending`. |
| 5 | `src/lib/programme/phase-plan-draft.ts:193` | Free-form plans can place deliverable ranges outside their phase (Days 1–2 with 5 deliverables → Days 3–5); the step-3 gate only validates fixed-phases mode. |
| 6 | `src/app/api/onboarding/projects/import/route.ts:66` | CSV kickoff dates use `new Date('YYYY-MM-DD')` (UTC midnight) while programme helpers work in local midnight — west of UTC every imported date lands a day early. |
| 7 | `src/lib/programme/backfill-plan.ts:85` | `phaseByExt`/`deliverableByExt` keyed on `external_id` alone collide on legacy unscoped ids, so one project's legacy rows never match and get duplicated. |
| 8 | `src/app/(hub)/projects/v2/[projectId]/_use-programme-progress.ts:63` | `totalDeliverables` excludes time-bypassed phases but `doneDeliverables` counts them, so the Overview card can render "12/9". |

Items 7–8 are lower confidence (legacy / uncommon data paths). No browser testing or live-DB check
was done for any of them.

## Known limits of this change

- The route now treats an array body as the **complete** set (full replace), not a delta. Any future
  caller must send every value it wants to keep.
- Ordering is canonicalized to `CLASSIFICATIONS` order, so the derived primary is deterministic
  (`variant ?? first`). A project with no StackShift variant derives its first catalog entry — e.g.
  `["Discrete Development","PipelineForge"]` → primary `PipelineForge` (catalog index 4).
- `mergeClassificationUpdate()` is kept only for the legacy single-value body; it is no longer
  called by the modal.

## Related

- Task 268 (`_docs/task/268-listings-view-rename-owner-classification-actions-task-issue-links.md`) —
  introduced the modal and the route.
- Task 361 — introduced `mergeClassificationUpdate()` and the union tab filter; this task supersedes
  its single-select assumption.
