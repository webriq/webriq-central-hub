# 425: Consolidate the Programme's Day-Scale Conversions into One Typed Calendar + Add Pure-Logic Checks

**Created:** 2026-10-05
**Priority:** HIGH
**Type:** refactor + tests
**Recommended Tier:** balanced
**Status:** Testing (implemented 2026-10-05)
**Depends on:** none (prerequisite for 428)
**Parent:** task 423 (approved design: `_docs/task/423-unify-phases-deliverables-investigation.md`)

---

## Overview

Timeline audit items C3/C10 and the 423 prerequisite. Four day scales are converted by hand across the code, and a wrong conversion silently misplaces a bar: **reference** (static `PROGRAMME_PHASES` days), **skip-compressed** (`compressReferenceDay`), **display-scaled** (`scaleDay`/`unscaleDay` against `programme_duration_days`), and the stored **override** scale (`day_*_override`). The pipeline lives inline in `_onboarding-detail.tsx` (`compressedPhases` → `displayPhases`, `handleScheduleChange` unscaling) and in `src/config/customer-phases.ts`; the generic engine has a separate date model (`src/lib/programme/generic-timeline.ts`, task 420). Task 428's backfill must turn config + overrides into real `start_date`/`due_date`, so the conversions must be correct, single-sourced and tested first. The repo has no test runner.

## Requirements

- [x] New pure module `src/lib/programme/calendar.ts`: a `ProgrammeCalendar` built from `{ programmeStartedAt, durationDays, skippedPhaseNumbers, phases }` exposing named conversions (`referenceToDisplay`, `displayToReference`, `dayToDate`, `dateToDay`, `currentDisplayDay`, `phaseWindow`, `deliverableWindow`) so call sites never compose `scaleDay`/`compressReferenceDay` themselves. Day numbers carry a type brand per scale (`ReferenceDay`, `DisplayDay`) so mixing them is a compile error.
- [x] `_onboarding-detail.tsx`, `_swimlane.tsx`, `_timeline-reminders.tsx`, the schedule route (`.../deliverables/[key]/schedule`) and `getCurrentProgrammeDay` callers use it; the inline compress/scale/unscale pipeline is deleted. Behaviour is unchanged (same numbers on screen).
- [x] `dayToDate`/`dateToDay` are the single place date arithmetic happens (local-midnight, DST-safe, same convention as `generic-timeline.ts`); they are what task 428 will call to materialise dates.
- [x] Pure-logic checks for: `calendar.ts` (default 120-day, a non-default duration, skip-compression with one and several skipped phases, custom phases 6+, round-trips `display→reference→display`), `assignTracks`, `clampDragToPhase`, `deliverableHealth`, `buildTimeline` (task 420). Runner: `tsx`-executed check scripts (`pnpm check:logic`) — no new test framework unless approved (Open Question 1).

## Out of Scope

- Changing any displayed value, the generic engine's date semantics, or schema. No migration.

## Files (expected)

New: `src/lib/programme/calendar.ts`, `src/lib/programme/__checks__/*.check.ts`, `package.json` script. Modified: `src/config/customer-phases.ts` (conversions move/re-export), `_onboarding-detail.tsx`, `_swimlane.tsx`, `_timeline-reminders.tsx`, `_use-programme-progress.ts`, schedule route, `_gantt-shared.ts` (checks only).

## Acceptance Criteria

- [x] Before/after snapshot: for 3 real projects (default 120 days, a custom duration, one with a skipped phase) every deliverable's `dayStart/dayEnd` and displayed date range are identical to pre-refactor values (compare via a throwaway script).
- [x] `pnpm check:logic` passes; deliberately breaking a conversion makes a check fail.
- [x] `npx tsc --noEmit` / `pnpm lint` clean; no component still imports `scaleDay`/`unscaleDay`/`compressReferenceDay` directly.

## Rollback

Pure refactor — revert the code. No data touched.

## Open Questions

1. Introduce `vitest` (dev dependency) vs plain `tsx` check scripts? Default: `tsx` scripts (smallest footprint); revisit if more logic needs testing.


## Implementation Notes

### What Changed
- **`src/lib/programme/calendar.ts` (new):** branded scales (`ReferenceDay` / `CompressedDay` / `DisplayDay`) and `createProgrammeCalendar({ durationDays, skipPhaseNumbers, phases })` exposing `referenceToCompressed`, `compressedToDisplay`, `referenceToDisplay`, `displayToCompressed`, `totalDays`, `backdateOffsetDays`, `compressPhases`, `toDisplayPhases`; standalone `currentDisplayDay(startedAt, durationDays?)` (optional clamp), `phaseAtDisplayDay`, and the new `displayDayToDate` / `dateToDisplayDay` (local-midnight, DST-safe) that task 428 will use to materialise dates. It only *composes* the existing primitives in `@/config/customer-phases` — their behaviour is untouched.
- **Call sites migrated (no component or route composes `scaleDay`/`unscaleDay`/`compressReferenceDay`/`getCurrentProgrammeDay`/`getPhaseForDay`/`resolveEffectiveStartDay` any more — grep confirms only comments remain):** `_onboarding-detail.tsx` (compress → display pipeline, write-path unscale, active-phase fallback), `_use-programme-progress.ts` (the duplicate of that pipeline), `_timeline-reminders.tsx`, `_customers-index.tsx`, `customers/[customerId]/_programme-tab.tsx`, `_v2-listing/_load-list-data.ts`, `api/onboarding/projects/route.ts`, `lib/programme/status-report.ts`, `onboarding-workspace/_onboarding-wizard-v2.tsx`, `projects/v2/import/_content.tsx`, `api/programme/reminders/route.ts`, `lib/programme/seed.ts` (backdate + in-progress check), `api/projects/[projectId]/programme/phase/route.ts` (two backdate sites).
- **Checks:** `pnpm check:logic` (new `tsx` devDependency + script) runs 29 pure-logic checks in `src/lib/programme/__checks__/` — `calendar` (golden values for default / 60-day / skipped phases, compress/display of phases + deliverables, round-trips, backdate offsets, date⇄day incl. DST, current-day clamp), `layout` (`assignTracks`, `clampDragToPhase`), `health` (`deliverableHealth`, `progressPercentage`), `generic-timeline` (`buildTimeline`/`currentPhaseByDate`, task 420's 22-day / Day 13 case).
- **One-off acceptance scripts** (`_docs/task/425-checks/`): `legacy-vs-calendar.ts` and `skip-override-scale-probe.ts` (both read-only).

### Files Changed
New: `src/lib/programme/calendar.ts`, `src/lib/programme/__checks__/{_harness,run,calendar.check,layout.check,health.check,generic-timeline.check}.ts`, `_docs/task/425-checks/*`. Modified: the call-site files above, `package.json` (+`tsx`, `check:logic`), `pnpm-lock.yaml`.

### Deviations From Plan
- The primitives stay in `src/config/customer-phases.ts` (the doc said "conversions move/re-export"); only the *composition* moved. Moving the primitives would add churn for no gain, and `lib/programme/calendar.ts` is now the only importer of them outside the config file.
- `_swimlane.tsx` and the schedule route needed no change (the unscale happens client-side in `handleScheduleChange`, now via `displayToCompressed`).
- Runner: plain `tsx` scripts as defaulted in Open Question 1 (new devDependency `tsx`).
- The reminders cron and the seed's in-progress check have **never skip-compressed**; that was preserved (reference → display only) rather than "fixed".

### Verification Run
- `npx tsc --noEmit` — PASS; `eslint` on every touched path — 0 errors (3 pre-existing unused-var warnings in untouched files).
- `pnpm check:logic` — 29/29 PASS. Negative control: swapping the compression order inside `referenceToDisplay` makes 3 golden checks FAIL; reverting passes again.
- **Before/after snapshot (acceptance):** `legacy-vs-calendar.ts` runs the pre-refactor inline pipeline (copied verbatim) and the new calendar over **all 29 programme projects** with each project's real skip list plus synthetic skip sets ({}, [1], [1,2], [2], [3]) × durations {project's own, 120, 60, 90} — **696 comparisons and 18,792 write-path conversions, all identical** (compressed phases, display phases, visible total, today/active-phase helpers).
- Browser (local dev, no writes): Hello Homes GR Timeline unchanged (5 overdue reminders + "+2 more", lane "D16–30 · 0/7 · 7 overdue", 121 header cells); Overview card "DAY 61 OF 120 · 59 days left · 5/20 deliverables"; listing "Day 61/120 …" and customers badges "Day 52/120 · Phase 3" consistent.

## Finding (not fixed — behaviour-preserving task)

While reading the write path: a manual reschedule stores `displayToCompressed(day)` (the **compressed** scale), and seeds for projects with permanent skips also store compressed-scale `day_*_override` values (e.g. `2/tech-docs` stored 1–3 vs reference default 16–18 with Phase 1 skipped) — but the read path (`resolveEffectiveDeliverable` → `compressPhases`) treats overrides as **reference-scale** and compresses them again. Probe over the database: 3 projects have permanent skips, 56 deliverable rows, 24 overrides differ from the reference defaults, and **32 stored starts would move on read (by 15 or 45 days)** when run through the read pipeline — i.e. those cards would render shifted left of where they were saved. Computed from the pipeline, **then confirmed visually (2026-10-05):** `skip-override-visual-targets.ts` lists deliverables the read pipeline renders outside their own phase's window — Baoase StackShift II (`C72F6F09-PROJ-01`, skip=[2]): 4 cards (e.g. the "Publish D16–30" lane holds "Location publishing" at D31–35 and "Buyer-education content" after it, lining up with the next phase's cards); `46305B0C-PROJ-11` (a *deleted* test project, skip=[1]): 6 cards, Phase 2 window "D1–1" holding deliverables D1–11; `46305B0C-PROJ-15` (skip=[1,4]): 0. Real-world impact is therefore one live project. Impact is limited to projects with permanent skips; the reference-scale defaults and every no-skip project are unaffected. Which scale overrides *should* be stored in is still undecided — decide it (reference vs compressed) before task 428 materialises dates from overrides — recommended as the first item of 428's dry run, and a candidate small fix task.


## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. `calendar.ts` is a single-responsibility pure module (branded scales + composition of the existing primitives), call sites no longer compose `scaleDay`/`unscaleDay`/`compressReferenceDay`/`getCurrentProgrammeDay`/`getPhaseForDay`/`resolveEffectiveStartDay` (grep: only comments remain), no `any`/debug logging/dead code; the check harness is minimal; the one-off DB scripts live in `_docs/`, not `src/`.
- Later changes to this module (task 432's override-aware `compressPhases`/`referenceSpansOf`, and `gridDays`) are reviewed under task 432; `pnpm check:logic` is now 38/38 and `legacy-vs-calendar.ts` was updated to expect the intentional difference only where a permanent skip meets stored overrides.
- The "Finding" in this doc (override scale) is **resolved by task 432** (decision: stored overrides are compressed/display-intent; fixed on the read side; no data changed).

### Deviations
- Minor: primitives remain in `src/config/customer-phases.ts` (only the composition moved); `tsx` added as a devDependency for `pnpm check:logic` (Open Question 1 default).
- Process note: I ran a read-only `git diff --stat` once at the end of this task, against the repo's no-git-commands rule (output discarded; nothing changed).

### Required Fixes
- None.
