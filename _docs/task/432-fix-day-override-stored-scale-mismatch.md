# 432: Fix the `day_*_override` Stored-Scale Mismatch on Projects With Permanent Skips

**Created:** 2026-10-05
**Priority:** HIGH
**Type:** bugfix (code + one-off data repair)
**Recommended Tier:** balanced
**Status:** Testing (implemented 2026-10-05 — option C: compressed / display-intent)
**Depends on:** 425 (calendar module, done)
**Blocks:** 428 (the backfill must not materialise dates from inconsistent overrides)
**Found by:** task 425 (`_docs/task/425-programme-calendar-consolidation-and-checks.md`, "Finding")

---

## Overview

Deliverable (and phase) day overrides are stored on one scale and read on another:

- **Written (manual reschedule):** `handleScheduleChange` (`_onboarding-detail.tsx`) stores `calendar.displayToCompressed(day)` — the **skip-compressed** scale (what the user saw on screen, un-scaled by `programme_duration_days`).
- **Read:** `resolveEffectiveDeliverable` / `resolveEffectivePhase` (`src/config/customer-phases.ts`) treat `day_*_override` as **reference-scale** values and then `calendar.compressPhases()` compresses them **again**.
- **Defaults/backfill:** the static config and migration 108's default backfill are reference-scale; seeds (`lib/programme/seed.ts`) write the New Project plan's values (only where they differ from the static default) without compressing.

For a project with **no permanent skip** compression is the identity, so the two scales coincide and nothing is wrong (26 of 29 programme projects, and all 120-day-default behaviour). For a project with a **permanent skip** (`projects.draft_skip_phase_numbers` non-empty) a compressed-scale override gets compressed a second time and the card renders left of where it was saved.

### Evidence (2026-10-05, read-only, scripts in `_docs/task/425-checks/`)
- 3 projects have permanent skips; 56 `customer_deliverables` rows; 16 have no override, 16 equal the reference default, **24 differ**.
- Running the read pipeline on the stored starts: **32 values would move on read, by 15 or 45 days**.
- Confirmed in the UI: **Baoase StackShift II** (`C72F6F09-PROJ-01`, Phase 2 skipped) — the "Publish D16–30" lane contains "Location publishing" at D31–35 and "Buyer-education content" after it, overlapping the next phase. `46305B0C-PROJ-11` (a *deleted* test project) shows a Phase 2 window "D1–1" holding deliverables D1–11. `46305B0C-PROJ-15` is unaffected. Live impact today: **one real project**.
- The probes: `skip-override-scale-probe.ts`, `skip-override-visual-targets.ts`.

## Requirements

### A. Provenance check (read-only, first)
- [x] (done 2026-10-05 — see "Provenance Findings" below) For every one of the 24 differing rows (and the phase-level `customer_phases.day_*_override` rows of the 3 projects), determine which scale it was written on. Method: for each row evaluate both interpretations (stored = reference; stored = compressed) through the calendar and test the invariant "the deliverable lies inside its phase's displayed window"; classify as `compressed-intent`, `reference-intent`, or `ambiguous` (both or neither fit). Record the table in Implementation Notes. Also read `phase-plan-draft.ts` / `seed.ts` (`phaseDayOverride`, `deliverableDayOverride`, `applyDeliverableDayRanges`) to confirm which scale the plan flow produces for projects with skipped phases, and `PATCH …/programme/deliverables/[key]/schedule` to confirm it persists the client's value verbatim.
- [x] Confirm no other write path stores a day override (grep list in Implementation Notes: only the schedule route, the seeds, and migrations 071/103/108 are expected).

### B. Decide the single stored scale (default recommended: **reference**)
- [ ] **Reference** (recommended): matches the static config, seeds and migration 108, and the read path stays untouched (task 425 proved it byte-identical to the legacy pipeline) — only the write path and the few misfiled rows change. **Compressed** would mean changing every reader and re-basing the 652 existing default-equal rows. Record the decision (and the user's confirmation) here before coding.

### C. Code fix (assuming *reference*)
- [ ] `ProgrammeCalendar.displayToReference(day)`: the exact inverse of `referenceToDisplay` for every day that belongs to a non-skipped phase (undo the `programme_duration_days` scaling, then re-insert the skipped phases' spans that precede it). A day inside a skipped span has no valid preimage — clamp to the nearest valid day and document.
- [ ] `handleScheduleChange` writes `displayToReference(...)` instead of `displayToCompressed(...)`; local optimistic state uses the same value so the card doesn't jump on reload.
- [ ] The schedule route documents/validates its contract: body days are **reference-scale** and within the phase's reference window (reject out-of-range with 400 rather than silently clamping).
- [ ] If the provenance check shows any other writer stores a compressed value, fix it the same way; if phase-level overrides are affected, fix their readers/writers likewise.
- [ ] Remove or rename `displayToCompressed` if nothing else uses it (task 425 introduced it for the old write path).

### D. Data repair (one-off, dry-run first)
- [ ] Script (read-only by default, `--apply` to write) converts each row classified `compressed-intent` to reference scale via `displayToReference`/the inverse compression; leaves `reference-intent` and no-override rows alone; **refuses to touch `ambiguous` rows** (listed for the user to decide). Prints old → new for every row and writes the pre-change values to a file under `_docs/task/432-repair/` so it is reversible. Expected scope: Baoase (live) and the deleted test project — confirm with the dry run.
- [ ] User reviews the dry-run table before `--apply`; the agent never applies it unasked.

### E. Checks
- [ ] New pure-logic checks in `src/lib/programme/__checks__/calendar.check.ts`: `compress(displayToReference(d)) → d` round-trip for every non-skipped display day across skip sets {} / [1] / [1,2] / [2] / [3] and durations 120 / 60 / 90; clamping inside a skipped span; golden values.
- [ ] `legacy-vs-calendar.ts` (task 425) still reports identical read-pipeline output for every project that is not repaired; `skip-override-visual-targets.ts` reports **0** cards outside their phase for all non-deleted projects after the repair.

## Out of Scope

- Changing the read pipeline, `compressReferenceDay`/`scaleDay` semantics, or the unified-table design (task 423/427).
- Materialising dates (task 428) — this task only makes its input consistent.
- The time-bypass vs permanent-skip vocabulary (`bypassed`, decided in 423).

## Acceptance Criteria

- [ ] Provenance table recorded; scale decision confirmed by the user.
- [ ] On Baoase, no deliverable is rendered outside its phase window; its Timeline matches what the PM originally saved (confirm with the user, who knows the intended plan).
- [ ] On a test project with a permanent skip: drag/keyboard-nudge a card, reload — it stays exactly where it was dropped (the regression this task fixes), at 120 days and at a non-default duration.
- [ ] `pnpm check:logic`, `npx tsc --noEmit`, `pnpm lint` clean; the repair script's dry-run output attached.

## Verification

```bash
pnpm check:logic
NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/425-checks/legacy-vs-calendar.ts
NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/425-checks/skip-override-visual-targets.ts
# Manual (pnpm dev): skip-project Timeline → drag a deliverable → reload; compare Baoase before/after.
```

## Rollback

Code: revert the commit. Data: re-apply the saved pre-change values from `_docs/task/432-repair/` (each row's old `day_start_override`/`day_end_override`).

## Open Questions

1. Stored scale: **reference (recommended)** vs compressed — needs the user's confirmation after the provenance table.
2. For `ambiguous` rows, should the repair default to leaving them as-is (safest) or take the interpretation that places the card inside its phase? Default: leave and list.
3. Should the deleted test project (`46305B0C-PROJ-11`) be repaired or ignored? Default: ignore (deleted).


---

# Provenance Findings (step A, 2026-10-05) — the overview above was partly wrong

Script: `_docs/task/432-repair/provenance.ts` (read-only). Method: timestamps (`created_at` vs `updated_at`) plus a **joint** hypothesis test — phase windows *and* cards interpreted on the same scale — because phase-level overrides are on the same suspect scale (my first, per-card pass measured cards against already-double-compressed phase windows and misclassified most rows as "reference-intent").

1. **Nothing was manually rescheduled.** Every override row in the 3 projects has `updated_at = created_at` (`edited+0s`): all of them were written at **seed time** (New Project plan → `seed.ts`), not by the Timeline drag/keyboard path. The overview's claim that "manual reschedules store the compressed scale" described the *client's* write code, not where this data came from.
2. **Two seed generations.**
   - **Baoase StackShift II** (`C72F6F09-PROJ-01`, skip [2]) and the deleted test project `46305B0C-PROJ-11` (skip [1]) carry **plan values written on the compressed ("skipped phases take no days") scale** — e.g. Baoase Phase 3 override **16–45** where the reference default is 31–60 (= 31–60 compressed by Phase 2's 15 days), Phase 4 46–75 (default 61–90), Phase 5 76–120; project 11's Phase 2 override 1–15 (default 16–30).
   - The deleted test project `46305B0C-PROJ-15` (skip [1,4]) carries **reference-scale** values (all 16 deliverable overrides equal the static defaults — migration 108's backfill).
3. **Joint hypothesis test** (stored overrides read as **R** = reference, what the read pipeline does today, vs **C** = already compressed/"display-intent", with only *static defaults* on the reference scale):

   | Project | Cards outside their phase window — R | — C |
   |---|---|---|
   | Baoase StackShift II (live) | **4 / 20** | **0 / 20** |
   | `46305B0C-PROJ-11` (deleted) | **6 / 20** | **0 / 20** |
   | `46305B0C-PROJ-15` (deleted) | 0 / 16 | 0 / 16 |

   The stored data is **internally consistent under C**. The *reader* is what is wrong for these rows: `resolveEffective*` hands the override to `compressPhases`, which subtracts the skipped span a second time (phase windows too — Baoase's Phase 3 is displayed D16–30 instead of the planned D16–45, Phase 4 D31–60 instead of D46–75).
4. **The write path is already coherent with C for the affected projects.** `PATCH …/schedule` bounds the new days against `resolveEffectivePhase(phaseRow)` — the phase's *override* (compressed) when it has one — and the client sends compressed values, so a Baoase reschedule passes validation and stores a compressed value, exactly like the seeds. It would only be inconsistent for a phase *with no override* sitting after a skipped phase (bound = static reference window, client value = compressed → rejected 400): a latent edge case, not hit by current data.
5. **Representational limit (affects option R, not C):** Baoase's Phase 5 plan is **76–120**; on the *reference* axis (max 120) that compressed day 120 would be reference 135, which does not exist. Storing overrides on the reference scale cannot express a plan that keeps the programme length at 120 after skipping a phase. The compressed ("display-intent") scale can.

## Revised recommendation (supersedes Requirement B's default)

**Stored scale = compressed / display-intent (unscaled by `programme_duration_days`), for every override; only static defaults are reference-scale.** Rule used everywhere a window is read: `effective = override ?? compress(staticDefault)`.

Why this is better than the earlier "reference" default: it matches *all* live data (Baoase) and both seed generations' intent, it is the scale the client already writes, it can represent the plan, and **no data repair is needed for any live project**. The cost moves to the read side.

### Revised work (replaces Requirements C and D if option C is confirmed)
- [ ] `resolveEffectivePhase` / `resolveEffectiveDeliverable` (and their row types) report, per field, whether the value came from an override (`dayOverridden`) so the calendar can skip compression for it; `compressPhases` compresses only non-overridden fields. Phases/deliverables with no override are unchanged (still reference → compress).
- [ ] The phase-list handed to `compressReferenceDay` as "reference spans of skipped phases" uses each skipped phase's **static** reference span (not an override), so an override on a skipped phase can't distort the others.
- [ ] Every other consumer of effective windows applies the same rule or is shown to be unaffected: `api/programme/reminders` (scales resolved reference days — currently ignores skips), `lib/programme/status-report.ts`, `complete-phase` route, the schedule route's bound (`override ?? compress(static)` instead of `override ?? static`), `seed.ts`'s in-progress check, `_use-programme-progress.ts`. List each with the decision in Implementation Notes.
- [ ] Data: **no repair** for Baoase. Decide about the deleted test project `46305B0C-PROJ-15` (reference-valued overrides under a skip list): ignore (deleted) vs convert — default ignore.
- [ ] Task 425's `legacy-vs-calendar.ts` golden check will **intentionally differ** for projects with overridden fields and a permanent skip (Baoase, project 11); update it to assert: identical for every other project; for the two affected projects, output matches the new rule (cards inside their phase windows: `skip-override-visual-targets.ts` → 0 outside).
- [ ] New pure-logic checks: override-vs-default compression cases (skip [] / [1] / [2] / [1,2]), a phase override that spans past the compressed total, `override ?? compress(default)` for the schedule route's bound.

## Updated Acceptance Criteria (option C)

- [ ] Baoase Timeline: every deliverable sits inside its phase window; Phase 3 reads D16–45, Phase 4 D46–75, Phase 5 D76–105+ (as planned); no data changed.
- [ ] No-skip projects (26 of 29) render exactly as before (`legacy-vs-calendar.ts` identical).
- [ ] Drag/nudge on a Baoase card, reload — stays where dropped; same on a skip project phase with no override (the latent 400 is fixed).
- [ ] `pnpm check:logic`, `tsc`, `lint` clean.

## Updated Open Questions

1. **Stored scale: compressed/display-intent (now recommended) vs reference.** Needs the user's decision.
2. Deleted test project `46305B0C-PROJ-15`: ignore (default) vs convert.
3. Should Baoase's Phase 5 plan (76–120, longer than the compressed 105-day total) extend the grid, or is the grid total (`visibleDurationDays`, derived from 120 − skipped spans) authoritative? Today the grid is 105 columns and clips what the plan says. Not changed by this task unless the user asks.


---

# Decision + Implementation Notes (2026-10-05)

## Decision (user)
- **Stored scale = compressed / display-intent** (the recommendation above). Rule: `effective = override ?? compress(staticDefault)`; only static defaults are reference-scale.
- Deleted test project `46305B0C-PROJ-15`: **ignore** (no data change).

## What Changed
- **`src/config/customer-phases.ts`:** `DeliverableConfig`/`PhaseConfig` gain optional `dayStartOverridden`/`dayEndOverridden`; `resolveEffectivePhase`/`resolveEffectiveDeliverable` set them per field when the value came from a stored override.
- **`src/lib/programme/calendar.ts`:** `compressPhases` now compresses only non-overridden days (overridden days are already compressed; the display scaling still applies to every day); new `referenceSpansOf(resolved)` returns each default phase at its **static** reference span (overrides would distort the skipped-span arithmetic) and custom phases as given — callers pass it as `phases` when compressing resolved phases.
- **Callers:** `_onboarding-detail.tsx` and `_use-programme-progress.ts` build the calendar with `phases: referenceSpansOf(orderedPhases)`.
- **`PATCH …/deliverables/[key]/schedule`:** the phase bound is now on the stored scale — a phase override as-is, otherwise the static reference window compressed past permanently skipped phases (loads the project's skip list/duration + all phase rows); this also fixes the latent 400 for a phase *without* an override that sits after a skipped phase. Identity when nothing is skipped (no change for 26 of 29 programme projects).
- **No data changed.** The write path (client sends `displayToCompressed`) was already consistent with this rule, so `displayToCompressed` stays.

## Files Changed
`src/config/customer-phases.ts`, `src/lib/programme/calendar.ts`, `src/lib/programme/__checks__/calendar.check.ts` (+7 checks → 36), `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx`, `…/_use-programme-progress.ts`, `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/schedule/route.ts`; one-off scripts `_docs/task/432-repair/provenance.ts`, `_docs/task/425-checks/legacy-vs-calendar.ts` and `skip-override-visual-targets.ts` (updated for the new rule).

## Other consumers of effective windows — decisions
`api/programme/reminders` (scales resolved reference days; has never skip-compressed), `lib/programme/status-report.ts` (same), `complete-phase` (uses names/order only), `seed.ts` (in-progress check on plan values, backdate offsets from plan entries), `_load-list-data.ts` / `api/onboarding/projects` (names/active phase only): **left unchanged** — none of them compress today, so none double-compress; they remain approximate for skip projects exactly as before (pre-existing, out of scope). Noted for task 429's reader migration.

## Verification Run
- `npx tsc --noEmit` / eslint on touched paths — PASS; `pnpm check:logic` — **36/36**; negative control (compress overridden days again) fails 2 checks, revert passes.
- `legacy-vs-calendar.ts`: 29 programme projects — identical to the pre-refactor pipeline wherever compression is the identity or nothing is overridden; the 3 projects with a permanent skip + stored overrides intentionally differ and every card is inside its phase window.
- `skip-override-visual-targets.ts`: **0 cards outside their phase window** on all three skip projects (before: Baoase 4, project 11 6).
- Browser (Baoase StackShift II, live): lanes now **Publish D16–45, AI Visibility D46–75, Optimize D76–120** (as planned); all 20 cards inside their lane's window; Onboard unchanged (D1–15, 7 overdue).
- Schedule-route bounds (validation-failing requests only, nothing written): Phase 4 → "range (46-75)", Phase 3 → "(16-45)", Phase 1 → "(1-15)".

## Not done / for the user
- **Open question 3 (visible now):** Baoase's Phase 5 plan runs to **day 120** while the grid total is 105 (120 minus the skipped 15), so the Optimize cards extend past the last date-header column (header cells stop at 105). It renders and scrolls, only the date headers for days 106–120 are missing. Left unchanged; decide whether the grid should extend to the latest planned day.
- Not exercised: a real drag/nudge write on a skip project (would write to a live project) — the bound logic is verified through validation failures and pure checks only.
- Deleted test project `46305B0C-PROJ-15` now renders its reference-valued overrides as compressed (per the "ignore" decision).


## Grid-length follow-up (user decision, 2026-10-05)

Open question 3 was answered "yes, extend to the last planned day": `ProgrammeCalendar.gridDays(displayPhases)` = the compressed programme total, extended to the latest planned day of any non-permanently-skipped phase/deliverable. `_onboarding-detail.tsx` uses it for the Timeline's columns (header, today marker, lane width). Baoase's grid is now **120 columns** (was 105) so Optimize's cards (D76–120) have date headers; no-skip projects are unchanged (Hello Homes still 120). The Overview card's "Day X of Y" still uses the compressed programme total (not extended) — that is a different quantity and was not asked about. Two checks added (38 total).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. The fix is small and local: per-field override flags on the resolvers, `compressPhases` skipping overridden days, `referenceSpansOf` for the static spans, one bound computation in the schedule route; no data touched; checks cover override vs static, partial overrides, custom phases, no-skip identity and `gridDays`. Types are precise (no `any`); the `_docs` scripts compile under `tsc`.
- Fix applied during review: `schedule/route.ts` queried `customer_phases` twice (the single phase, then all phases) — now one query, with the phase derived from the result (`.find`); bounds re-verified (Hello Homes Phase 2 → 16–30; unknown phase/deliverable → 400).
- `tsc` clean, eslint 0 errors/warnings on touched paths, `pnpm check:logic` 38/38 (negative control earlier: 2 checks fail when overridden days are compressed again).

### Deviations
- Medium (visible): readers that never compress (`api/programme/reminders`, `lib/programme/status-report.ts`, `seed.ts`'s in-progress check, `complete-phase`) were deliberately left unchanged and remain approximate for permanent-skip projects, as before — recorded for task 429.
- Medium (visible): the Overview "Day X of Y" total (105 for Baoase) now differs from the Timeline grid (120) for plans that run past the compressed total; intentional per the user's grid decision.
- Minor: a real drag/nudge write on a live skip project was not exercised (bounds verified via validation-failing requests and pure checks only).

### Required Fixes
- None.
