# 478: Move StackShift I programmes to the tracker's Expected phase (Nov 17)

**Created:** 2026-11-17
**Priority:** HIGH
**Type:** chore (data correction: dry-run → operator-applied SQL)
**Status:** Completed (batches 1 and 2 operator-applied on LIVE, 2026-11-17)

---

## Overview

The PM tracker (`Tracker vs. Hub.xlsx`, sheet "Status tracker as of Nov 17", column "Phase: Now ▸ Expected")
is the source for StackShift I phases. **The Hub's active phase must follow the "Expected" phase** (the
120-day calendar phase for the project's current day), not the "Now" phase. Task 477 confirmed that every
Hub active phase matched "Now", so 9 projects sit behind their Expected phase.

### Decisions (user, 2026-11-17)

- **Moved projects:** move each to its Expected phase. Every earlier phase becomes **Completed**, never Skipped/Bypassed.
- **Past Day 120** ("Programme ended <date>"): batch 1 left these alone. The user then decided to set them to **Optimize for now** (batch 2). They may run past 120 days.
- **Included special cases:**
  - Trident (On Hold): moved to Optimize in batch 2, and stays On Hold.
  - Glorias: the tracker says "TBC"; the Hub is on Day 80, so it moves to AI Visibility.
- **Scope:**
  - StackShift I only.
  - Discrete Development projects excluded (Trident App).
  - Shelly Beach House excluded: it is now classified StackShift Access.

## Plan (dry run against LIVE, 2026-11-17)

| # | Account | project_id | Day | Now | Move to |
|---|---|---|---|---|---|
| 03 | Saginaw CFC | C30DE6A5-PROJ-03 | 118 | Publish | Optimize |
| 09 | Studio Belmont | 8978E416-PROJ-02 | 118 | Onboard | Optimize |
| 14 | Hello Homes GR | D45CA759-PROJ-01 | 113 | M&R | Optimize |
| 13 | Royal Thumper | FC6D83AB-PROJ-01 | 104 | Publish | Optimize |
| 07 | Black Barn Dumpsters | 2CDA5C64-PROJ-02 | 96 | Onboard | Optimize |
| 05 | WMI Home Solutions | 09A80681-PROJ-02 | 93 | Onboard | Optimize |
| 18 | Glorias Anzac Biscuits | 3028EE9B-PROJ-02 | 80 | M&R | AI Visibility |
| 15 | AB Lekdetectie | 82159826-PROJ-01 | 49 | Onboard | Publish |
| 16 | Maxton | BD64C367-PROJ-02 | 41 | Onboard | Publish |

### Per-phase rules (`planExpectedPhase`)
- **Earlier phases** (not already completed): `status = completed`. `actual_start_date` = the phase's Day-start date and `actual_completed_date` = its Day-end date, both on the 120-day calendar from the kickoff (the end date never goes past today). Already-completed phases keep their real dates (e.g. Saginaw M&R from task 475).
- **Target phase:** `status = active`; `actual_start_date` = its Day-start date (e.g. Optimize = Day 91), so its used/remaining days follow the calendar. `phase_programme_state.is_manual_override = true` with note "Task 478: aligned to PM tracker Expected phase (Nov 17)".
- **Later phases:** `planned`, with start and completed dates cleared.
- **Update order:** old active row demoted first, target promoted last (one-active partial unique index).
- **Refuses:**
  - custom phases (anything other than phases 1–5)
  - a completed target
  - completed later phases
  - a programme that isn't 120 days long
  - a tracker Expected phase that disagrees with the Hub's own day count

### Not changed
Kickoffs, deliverables, delay/project notes, `projects.status`. No Cliq notifications are sent (direct SQL,
not the Jump-to-phase route).

**Known effect:** deliverables in phases now marked Completed keep their own status. Their overdue
deliverable banners on the Timeline remain until the deliverables are marked done.

## Files

- `_docs/task/478-expected-phase-sync/plan.ts`: pure planner, plus the calendar helpers `dayToYmd`, `dayOf` and `expectedPhaseFor`.
- `_docs/task/478-expected-phase-sync.check.ts`: self-check (`npx tsx _docs/task/478-expected-phase-sync.check.ts`). All assertions pass.
- `_docs/task/478-expected-phase-sync/dry-run.ts`: read-only dry run. It writes `out/plan.md`, `out/apply.sql` and `out/rollback.sql` (git-ignored, real data). Each project block in `apply.sql` aborts the whole transaction if that project's phases changed since the dry run.

## Operator Steps

1. Snapshot the Status Report (`/projects/stackshift-i/status-report`) for the before/after check.
2. Review `_docs/task/478-expected-phase-sync/out/plan.md`.
3. **Copy `out/rollback.sql` somewhere safe** (e.g. `rollback-applied.sql`). Re-running the dry run overwrites it.
4. Run `out/apply.sql` once in the Supabase SQL editor.
5. Verify: re-run the dry run. All 9 should show under "Already matching" with 0 changes. Then check the Status Report: the 9 projects are on Optimize / AI Visibility / Publish.

## Rollback

Run the saved `rollback.sql` from the same dry run that produced the applied `apply.sql`. Batch 2's is `out/ended/rollback.sql`. To undo both, roll back batch 2 first, then batch 1 (`out/rollback.sql`).

## Post-Apply Verification (2026-11-17, operator-applied on LIVE)

Checked through the Status Report API (read-only). The dry run was deliberately **not** re-run, because that would overwrite `out/rollback.sql`.

| Account | Active phase | Earlier phases | Used / allotted | Health |
|---|---|---|---|---|
| Saginaw CFC | Optimize (in progress) | all completed | 28/30d | At risk |
| Studio Belmont | Optimize (in progress) | all completed | 28/30d | At risk |
| Hello Homes GR | Optimize (in progress) | all completed | 23/30d | On track |
| Royal Thumper | Optimize (in progress) | all completed | 14/30d | On track |
| Black Barn Dumpsters | Optimize (in progress) | all completed | 6/30d | On track |
| WMI Home Solutions | Optimize (in progress) | all completed | 3/30d | On track |
| Glorias Anzac Biscuits | AI Visibility (in progress) | all completed | 20/30d | On track |
| AB Lekdetectie | Publish (in progress) | all completed | 19/30d | On track |
| Maxton | Publish (in progress) | all completed | 11/30d | On track |

- All 9 are on their tracker Expected phase, and none is overdue any more.
- Batch 1 left the programmes past Day 120 unchanged; batch 2 (below) later moved them to Optimize.
- Saginaw and Studio Belmont read "At risk": they are 28 of 30 days into Optimize, and their deliverables are not marked done.

## Batch 2: programmes past Day 120 → Optimize (2026-11-17)

**Decision (user):** programmes whose tracker Expected reads "Programme ended <date>" are set to **Optimize for now**. This supersedes the earlier "past Day 120: keep the Now phase" decision for these six.

- **Dry run:** `dry-run.ts --ended` writes to `out/ended/` (still git-ignored), so batch 1's `out/rollback.sql` is not overwritten.
- **Same rules as batch 1:** earlier phases → Completed with calendar dates, and Optimize active from its Day 91 date. For past Day 120 the calendar has no phase, so the script parks these projects on Optimize. It refuses any project still within Day 120.

| # | Account | project_id | Day | Now | Move to |
|---|---|---|---|---|---|
| 02 | Trident Roof Solutions Website | 67CC38C5-PROJ-04 | 154 | M&R | Optimize (stays On Hold) |
| 06 | Veteran Roofing & Exteriors | C74DEA31-PROJ-02 | 149 | Publish | Optimize |
| 01 | Retail Sign Systems | DDF84B09-PROJ-02 | 148 | Publish | Optimize |
| 08 | Greydog Security | 82ACEB0F-PROJ-03 | 142 | Publish | Optimize |
| 10 | RCB & Associates LLC | 5EBACF20-PROJ-01 | 133 | M&R | Optimize |
| 12 | M&I Interiors | D0A5D523-PROJ-04 | 127 | M&R | Optimize |

The dry run (LIVE, read-only) found 6 moves and 0 problems.

**Expected effect:** Optimize counts from Day 91, so all six will read Optimize *overdue* (about 37–64 days used of 30) and "Needs attention". This reflects that their programmes have ended. The exception is Trident, which shows On Hold.

**Operator steps:**
1. Review `out/ended/plan.md`.
2. Save a copy of `out/ended/rollback.sql`.
3. Run `out/ended/apply.sql`.

### Batch 2 Post-Apply Verification (2026-11-17, operator-applied on LIVE)

Checked through the Status Report API (read-only). All six are on Optimize, with every earlier phase completed:

| Account | Optimize used | Overdue | Health |
|---|---|---|---|
| Trident Roof Solutions Website | 64/30d | 34d | On Hold |
| Veteran Roofing | 59/30d | 29d | Needs attention |
| Retail Sign Systems | 58/30d | 28d | Needs attention |
| Greydog Security | 52/30d | 22d | Needs attention |
| RCB & Associates | 43/30d | 13d | Needs attention |
| M&I Interiors | 37/30d | 7d | Needs attention |

All 15 tracker StackShift I projects in the Hub are now on their tracker Expected phase, with no Skipped earlier phases.
