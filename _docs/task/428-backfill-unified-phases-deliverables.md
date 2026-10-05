# 428: Backfill — Merge `customer_phases`/`customer_deliverables` into `project_phases`/`project_deliverables` (+ `phase_programme_state`)

**Created:** 2026-10-05
**Priority:** MEDIUM
**Type:** data migration script (dry-run first)
**Recommended Tier:** deep
**Status:** Testing — planner, dry-run and SQL built; applied + verified on a local copy of the live data; **live apply awaits the operator** (after migration 161)
**Depends on:** 425 (calendar), **432 (override-scale fix — overrides must be on one scale before dates are materialised)**, 427 applied on a branch/production as agreed
**Parent:** task 423 (approved design: `_docs/task/423-unify-phases-deliverables-investigation.md`)

---

## Overview

Step 2 of the approved plan: one idempotent backfill with a mandatory **dry-run report** and **abort on ambiguity**. Volumes are tiny (146 phase rows, 751 deliverable rows, 29 programme projects), so a single transaction is appropriate. Mapping is by exact `external_id` or `project_id` + number; the 2026-10-05 investigation found no row matching two candidates.

## Requirements (bucket policies — final counts come from the dry run, not from this doc)

- [ ] **Phase 2–5 with a scoped milestone** (104 in the snapshot): update the existing row in place (keep UUID): `source='programme'`, `phase_number`, status from `customer_phases` (the milestones are stale — all `planned` today), `actual_*` dates, name/owner from config + `custom_name`; copy `wizard_data`/override/delay fields into `phase_programme_state`.
- [ ] **Phase 1** (29): insert new rows (`source='programme'`, `phase_number=1`) + state rows; **182 Phase 1 deliverables** get new `project_deliverables` rows (decision Q6).
- [ ] **Projects with no programme milestones** (3 projects: 12 phase rows, 60 deliverables in the snapshot): create from config. **Legacy-unscoped milestones** (`programme-phase-2…5`, one project, plus ~20 legacy-format tasklists): attach by `project_id` + number, rewrite `external_id` to the scoped form, then treat as matched.
- [ ] **Custom phase** (`phase_number` 6, 1 row): create row + its deliverables.
- [ ] **Orphan programme tasklists** (31 in the snapshot; 2 have tasks): keep as `source='manual'` deliverables, flag `needs_review` in the report; never delete (decision Q7).
- [ ] **Status mapping:** `not_started→planned`, `active→active`, `completed→completed`; `skipped` → `skipped` if the phase number is in `projects.draft_skip_phase_numbers`, else `bypassed` (4 vs 22 in the snapshot; decision Q5). Deliverables keep `pending|in_progress|done` + `completed_at`.
- [ ] **Dates:** (task 432 decision: stored `day_*_override` values are already skip-compressed "display-intent"; static defaults are reference — materialise with `override ?? compress(default)`, i.e. the calendar's `compressPhases`/`toDisplayPhases` over `referenceSpansOf(...)`) materialise `start_date`/`due_date` (+ `day_start/day_end`) from config + `day_*_override` + `programme_started_at` via task 425's `ProgrammeCalendar`; where `programme_started_at` is null, leave dates null and keep offsets.
- [ ] **Source tagging for non-programme rows:** `external_id` null → `manual`; any other non-programme `external_id` → `zoho_import`.
- [ ] Modes: `--dry-run` (default; prints per-bucket counts, unmatched, ambiguous, orphans, and a per-project diff sample) and `--apply`; `--apply` refuses to run if the dry run reports any ambiguous match or if row counts drift from the last dry run.
- [ ] Reconciliation queries run before/after: totals preserved (`milestones` 695 + created = `project_phases`; `tasklists` 1,571 + created = `project_deliverables`; tasks 7,632 and every `milestone_id`/`tasklist_id` still resolves).

## Out of Scope

- Any app-code change; dropping `customer_*`; Zoho-imported rows other than tagging `source`.

## Acceptance Criteria

- [ ] Dry-run report reviewed and approved by the user before `--apply`.
- [ ] After apply (on the branch first): per-bucket counts match the report; programme-phase one-active constraint holds; every `customer_phases` row has exactly one `project_phases` row (and vice versa for `source='programme'`); every `customer_deliverables` row has exactly one `project_deliverables` row; FK integrity query returns zero orphans.
- [ ] Re-running `--apply` is a no-op.

## Rollback

Take a verified backup/snapshot immediately before `--apply`; rollback = restore (the script itself is not reversible once rows are merged). The 427 rollback remains valid only before this runs.

## Risks

No test runner (use the scripted checks from 425's pattern); the database is shared by dev and prod — run on a branch/dump first.


---

# Implementation Notes (2026-10-05)

## What was built
- **`src/lib/programme/backfill-plan.ts`** — pure planner (`planBackfill`, `summarisePlan`): matches `customer_phases`/`customer_deliverables` to existing `project_phases`/`project_deliverables` (already-merged → scoped external_id → legacy-unscoped by `project_id` + number/key), plans insert / update / unchanged, maps statuses (not_started→planned; permanent skip → `skipped`, time-bypass → `bypassed`), materialises dates through the task-425 calendar with the task-432 override rule, moves wizard data/notes to `phase_programme_state`, keeps orphan programme-tagged deliverables as `manual`, and **reports ambiguity instead of guessing** (a project/phase with 2 candidate rows, or a row claimed twice, is skipped and listed).
- **`src/lib/programme/backfill-sql.ts`** — turns a plan into ONE transactional script with drift guards (row counts must equal the snapshot; migrations 160 **and 161** must be present), updates, inserts, state upserts, orphan re-tagging (never a delete) and reconciliation assertions that roll the whole thing back if the result is not exactly what the plan says.
- **Checks:** 15 new pure-logic checks (`pnpm check:logic` → **53/53**): scoped + legacy matching, Phase 1 creation, repeated keys across phases, status mapping, skipped vs bypassed, dates, null start date, the 432 compressed-override rule, other-project legacy ids never stolen, orphans, ambiguity, state rows, **idempotence**, SQL guards/quoting.
- **Scripts (`_docs/task/428-backfill/`)**: `dry-run.ts` (read-only; writes the git-ignored `out/plan.json` + `out/backfill.sql`), `snapshot-to-local.ts` (read-only on live → `out/snapshot.sql` for the local disposable DB). `out/` is git-ignored because the SQL embeds wizard data.
- **Migration 161** (`supabase/migrations/161_fix_project_deliverables_key_unique.sql` + rollback; written, **not applied**): found while building the planner — migration 160's `unique (project_id, deliverable_key)` would have rejected the backfill because the same key repeats across phases of one project (56 project/key pairs, e.g. `updated-publishing-plan` in Phases 4 and 5). Replaced by `unique (phase_id, deliverable_key)`.

## Dry-run report (live data, read-only, 2026-10-05)
| | Result |
|---|---|
| Inputs | 270 projects · 146 `customer_phases` · 751 `customer_deliverables` · 695 `project_phases` · 1,571 `project_deliverables` |
| **Phases (146)** | **update 108** = 94 scoped + 8 scoped/time-bypassed + 2 scoped/permanent-skip + 4 legacy-unscoped (rewritten to scoped ids) · **insert 38** = 29 Phase 1 + 8 for projects with no programme milestones + 1 custom phase |
| Phase statuses | active 29 (one per project) · planned 90 · bypassed 22 · skipped 4 · completed 1 — exactly the 4 permanent / 22 time-bypassed split found in task 423 |
| Phase dates | 142 with dates (`start_date`/`due_date` + display-scale `day_start`/`day_end`); 4 permanently skipped have none |
| **Deliverables (751)** | **update 529** = 509 scoped + 20 legacy-format · **insert 222** = 182 Phase 1 (workspace items) + 40 for the projects with no programme milestones; all 751 get dates |
| Deliverable statuses | pending 694 · in_progress 23 · done 34 (copied) |
| **Orphans kept as `manual`** | **11 deliverables**, 2 with tasks, all under *permanently skipped* phases (7 under Baoase's skipped Phase 2, 4 under another project's skipped Phase 4) — their tasklists were seeded for every phase, but `customer_deliverables` has no rows for skipped phases. Never deleted. |
| Ambiguities | **0** |
| `phase_programme_state` rows | 146 (one per phase) |
| Planned-data invariants | 0 projects with >1 active programme phase · 0 duplicate `(phase_id, key)` · 0 duplicate `(project, phase_number)` · 0 duplicate planned `external_id`s |
| Spot checks | Hello Homes GR: Day 1 = Aug 6 → P2 Aug 21–Sep 4 (D16–30), P1 `bypassed`, Phase 1 deliverables carry their `done`/`in_progress`; Baoase (permanent skip [2]): P3 **Sep 29–Oct 28 (D16–45)**, P4 D46–75, P5 D76–120 (the task-432 plan), P2 `skipped` without dates |

## Local apply test (disposable Postgres 17.6 with a copy of the live rows; the live database was only read)
Fresh `supabase db reset` (all 161 migrations) → loaded the snapshot (same counts as live) → applied **the exact live-targeted `backfill-live.sql`** (it committed, so every drift guard and reconciliation assertion passed):
- project_phases **695 → 733**, project_deliverables **1,571 → 1,793**; tags: phases programme 146 / zoho 567 / manual 20; deliverables programme 751 / zoho 985 / manual **57 (46 + the 11 orphans)**; `phase_programme_state` 146.
- Independent checks: every `customer_phases` row has exactly one programme phase and every `customer_deliverables` row exactly one deliverable; 0 broken task→phase / task→deliverable links; 0 duplicate phase numbers; 0 projects with >1 active phase; compat views show **704 / 1,611** rows (= 733−29 and 1,793−182: Phase 1 programme rows are hidden from legacy code).
- **Idempotence:** a fresh dry run after applying → phases `unchanged 146`, deliverables `unchanged 751`, orphans 0, ambiguities 0.
- **Drift guard:** applying the same script a second time is refused (`DRIFT: project_phases count changed since the plan was generated`).
- Legacy UI safety: the Milestones components fall back to the `planned` style for unknown statuses (`M_STATUS_STYLE[m.status] ?? …`), so `bypassed`/`skipped` render (with their own label) instead of crashing; PMs cannot edit programme-tagged rows (task 427 decision D1).

## Live runbook (operator — nothing below has been run against the shared database)
1. ~~Apply migration 161~~ — **done and verified 2026-10-05** (see the section below). The backfill script refuses to run without it.
2. **Regenerate the plan right before applying** (the saved `out/backfill-live.sql` is from today's snapshot and the plan has fixed UUIDs): run `dry-run.ts` (read-only) → review the report above against the new numbers → it writes `out/backfill.sql`.
3. **Back up**, then run `out/backfill.sql` in the Supabase SQL editor (superuser, single transaction; any guard failure rolls everything back).
4. **Verify (I run these read-only):** counts 733 / 1,793, tag counts, 146 state rows, link integrity, compat-view counts 704 / 1,611, and a re-run of the dry run → all `unchanged`.
5. **The backfill is idempotent — re-run it at cutover.** Until task 429 moves the app onto the unified tables, programme edits keep landing in `customer_*`, so the unified rows will drift; re-running the dry run + SQL immediately before the 429 cutover brings them current (updates only, no duplicates). Because of that, applying now is optional — it mainly de-risks the cutover.
6. **Rollback:** restore from the backup taken in step 3 (the script itself is not reversible once rows are merged); migration 160's rollback is no longer valid after this runs.

## Deviations / notes
- The planner preserves an existing tasklist's/milestone's *name* for matched rows (user renames survive) unless `customer_phases.custom_name` is set.
- `day_start`/`day_end` on the unified rows are **display-scale** days (what the generic Timeline reads), alongside the materialised dates; both come from the same calendar pipeline.
- First local run of the dry run failed on missing local `service_role` grants (CLI default-privilege difference); fixed in the harness only. The SQL applied locally was therefore the live-generated one — the stronger test.
- Not run: the live apply. Not covered: concurrent programme edits during the apply window (mitigated by the short transaction + re-running at cutover).


## Migration 161 applied + verified live (2026-10-05)
Operator ran `supabase db push` (161 only). Verified: catalog query returned exactly one `%key_uq` index on `project_deliverables` — `project_deliverables_phase_key_uq … (phase_id, deliverable_key) WHERE (deliverable_key IS NOT NULL AND phase_id IS NOT NULL)`; the old `project_deliverables_project_key_uq` is gone. Read-only data check (service key): project_phases 695, project_deliverables 1,571, tasks 7,632, customer_phases 146, customer_deliverables 751 — all unchanged; 0 deliverables with a `deliverable_key`, 0 phases with a `phase_number`, `phase_programme_state` 0 rows (the swap was lossless; the backfill has not run). **The backfill's prerequisite check (migrations 160 + 161) now passes on live.** Rollback for 161 remains valid until the backfill runs.
