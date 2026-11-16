# 475: Sync programme kickoffs and active phases to the PM tracker (Oct 15)

**Created:** 2026-11-16
**Priority:** HIGH
**Type:** chore (data correction: dry-run → operator-applied SQL)
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

The PM tracker `Tracker vs. Hub.xlsx`, sheet "Status tracker as of Oct. 15", is the source of truth for
StackShift I kickoff dates and current phases. An audit on 2026-11-16 (live DB, confirmed on the local
Status Report page) found:

- **10 kickoff dates differ.** `projects.programme_started_at` is 9–61 days later than the tracker's kickoff.
- **3 projects are in the wrong active phase:** Veteran, Black Barn and RCB.
- **1 phase status is wrong:** Saginaw's Migrate & Rebrand is `bypassed`, so it shows as "Skipped". The tracker says it was handed over.

Task 455 (Approved) already wrote a read-only kickoff dry run for this same tracker
(`_docs/task/455-kickoff-rebaseline/dry-run.ts`). **It was never run**: no `out/` folder exists, and every
kickoff still differs. Two of its mappings are also stale now:
- Greydog points at `82ACEB0F-PROJ-02`, which has since been merged into `82ACEB0F-PROJ-03` and archived (tasks 468/472).
- Maxton points at `BD64C367-PROJ-01`; the live programme is `BD64C367-PROJ-02`.

This task reuses that script for kickoffs and adds a small phase-sync dry run for the active phase and
status changes. Both scripts follow the same pattern: plan.md, apply.sql and rollback.sql, applied by the
operator. The agent never writes to the database.

### Evidence (re-verify before implementing)

```sql
select p.project_id, p.name, p.status, p.programme_started_at::date,
       ph.phase_number, ph.name, ph.status, ph.actual_start_date::date, ph.actual_completed_date::date
from projects p join project_phases ph on ph.project_id = p.id and ph.source = 'programme'
where p.project_id in ('DDF84B09-PROJ-02','C30DE6A5-PROJ-03','09A80681-PROJ-02','C74DEA31-PROJ-02',
  '2CDA5C64-PROJ-02','82ACEB0F-PROJ-03','8978E416-PROJ-02','5EBACF20-PROJ-01','D0A5D523-PROJ-04',
  'FC6D83AB-PROJ-01','D45CA759-PROJ-01','82159826-PROJ-01','BD64C367-PROJ-02')
order by p.project_id, ph.position;
```

The tracker uses DD-MM-YYYY dates. The values below were taken on 2026-11-16.

| # | Account | project_id | Tracker kickoff | Hub start | Tracker phase | Hub active phase | Action |
|---|---|---|---|---|---|---|---|
| 01 | Retail Sign Systems | DDF84B09-PROJ-02 | 2026-06-23 | 2026-08-02 | Publish | Publish | kickoff |
| 03 | Saginaw CFC | C30DE6A5-PROJ-03 | 2026-07-23 | 2026-08-10 | Publish | Publish | kickoff + P2 `bypassed`→`completed` (D3) |
| 05 | WMI Home Solutions | 09A80681-PROJ-02 | 2026-08-17 | 2026-08-31 | Onboard | Onboard | kickoff |
| 06 | Veteran Roofing | C74DEA31-PROJ-02 | 2026-06-22 ✓ | 2026-06-22 | Publish | **AI Visibility** | phase → P3 |
| 07 | Black Barn Dumpsters | 2CDA5C64-PROJ-02 | 2026-08-14 | 2026-08-25 | Onboard | **Migrate & Rebrand** | kickoff + phase → P1 |
| 08 | Greydog Security | **82ACEB0F-PROJ-03** | 2026-06-29 | 2026-07-22 | Publish | Publish | kickoff (D1) |
| 09 | Studio Belmont | 8978E416-PROJ-02 | 2026-07-23 | 2026-09-22 | Onboard | Onboard | kickoff |
| 10 | RCB & Associates | 5EBACF20-PROJ-01 | 2026-07-08 | 2026-08-02 | Migrate & Rebrand | **Publish** | kickoff + phase → P2 |
| 12 | M&I Interiors | D0A5D523-PROJ-04 | 2026-07-14 | 2026-07-28 | Migrate & Rebrand | Migrate & Rebrand | kickoff |
| 13 | Royal Thumper | FC6D83AB-PROJ-01 | 2026-08-06 ✓ | 2026-08-06 | M&R | Publish (since **2026-11-10**) | **none**: Hub is newer (resolved decision) → PM confirms |
| 14 | Hello Homes GR | D45CA759-PROJ-01 | 2026-07-28 | 2026-08-06 | Migrate & Rebrand | Migrate & Rebrand | kickoff |
| 15 | AB Lekdetectie | 82159826-PROJ-01 | 2026-09-30 ✓ | 2026-09-30 | Onboard | Onboard | none |
| 16 | Maxton | **BD64C367-PROJ-02** | 2026-10-08 | 2026-10-22 | Onboard | Onboard | kickoff (D2) |
| 17 | Grand River Realty | (none) | 2026-10-12 | (not in Hub) | Onboard | (none) | out of scope (operator: intake) |

Current phase rows for the three phase moves (actual_start_date):
- **Veteran:** P1/P2/P3 `bypassed` (P3 started 2026-08-21), P4 `active` (started 2026-08-27).
- **Black Barn:** P1 `bypassed` (started 2026-08-21), P2 `active` (started 2026-09-09).
- **RCB:** P1/P2 `bypassed` (P2 started 2026-08-05), P3 `active` (started 2026-09-01).
- **Saginaw:** P2 `bypassed` (started 2026-08-21), P3 `active` (started 2026-09-09).

## Requirements

- [ ] **Kickoffs:** the 10 projects marked "kickoff" get `programme_started_at` = tracker kickoff, and their phase and deliverable `start_date`/`due_date` are re-derived (`materialiseDates`, same as the Kickoff editor).
- [ ] **Active phase:** Veteran → P3 Publish, Black Barn → P1 Onboard, RCB → P2 Migrate & Rebrand.
  - Earlier non-completed phases become `bypassed`, keeping their actual dates.
  - The target becomes `active`.
  - Later phases become `planned` with `actual_start_date = null`.
  - This is the same cascade as `PATCH .../programme/phase`.
- [ ] **Target start date (resolved):** keep the target phase's existing `actual_start_date`. If it has none, use its re-derived `start_date`. Never "today".
- [ ] **Saginaw P2 (D3):** set to `completed`, with `actual_completed_date` = P3's `actual_start_date` (2026-09-09).
- [ ] The target's `phase_programme_state` row gets `is_manual_override = true` and `override_note = 'Task 475: aligned to PM tracker (Oct 15)'`. Phases reset to `planned` get `is_manual_override = false` and `override_note = null`, same as the route.
- [ ] Every apply block first checks that the row still matches what the dry run read. If a project's kickoff, or its active phase id and status, changed since the dry run, the whole transaction aborts.
- [ ] `rollback.sql` restores every value the dry run read, including the cleared `actual_start_date`s.
- [ ] Hub-newer data wins (resolved): Royal Thumper's phase is not touched. It's listed under "PM to confirm".

## Out of Scope / Must-Not-Change

- Delay notes and project notes. The PMs' existing notes stay as they are (resolved: phase statuses only).
- `projects.status`, so no archiving, on-hold or completed changes.
- Royal Thumper's phase, AB Lekdetectie, and any project not in the table (e.g. Trident, Baoase, Summit).
- Retail Sign's and Veteran's other bypassed phases. The tracker didn't flag them.
- M&I "open Publish". The tracker's current phase is still M&R, so its own "Hub updates" column contradicts it. Listed for the PM.
- Creating Grand River Realty. That needs intake; it's already an operator action in 455's runbook.
- No app code, no migrations, no change to `src/`.
- No Cliq notifications. The SQL path doesn't send them; that's intended for a backfill.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `_docs/task/455-kickoff-rebaseline/dry-run.ts` | Modify | `MAPPINGS`: Greydog → `82ACEB0F-PROJ-03`, Maxton → `BD64C367-PROJ-02`. Drop the now-stale PROJ-03 "duplicate" entry from `STATIC_OPERATOR_ACTIONS` and add one for PROJ-02 (merged and archived, not touched). |
| `_docs/task/455-kickoff-rebaseline/README.md` | Modify | Update the Maxton and Greydog operator lines to match. |
| `_docs/task/475-phase-sync/plan.ts` | Create | Pure planner `planPhaseSync(rows, { targetPhase, complete? })` that returns the status and date updates. No DB access. |
| `_docs/task/475-phase-sync/dry-run.ts` | Create | Reads the live rows (read-only), calls `planPhaseSync`, and writes `out/plan.md`, `out/apply.sql` and `out/rollback.sql`. Same shape as 455's script. |
| `_docs/task/475-phase-sync.check.ts` | Create | Assert-based self-check of `planPhaseSync` on fixtures copied from the evidence rows. |
| `_docs/task/475-phase-sync/README.md` | Create | Short runbook covering order, apply, verify and rollback. |

`out/` folders are already git-ignored (`.gitignore:60 _docs/task/*/out/`). Never commit them; they contain real customer data.

## Code Context

### Kickoff dry run (reuse as is): `_docs/task/455-kickoff-rebaseline/dry-run.ts`
- `MAPPINGS` (lines ~24-38) is the only data to change.
- It already guards with "abort if `programme_started_at` changed" and writes plan, apply and rollback files.
- Run it with `npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/455-kickoff-rebaseline/dry-run.ts`.

### Phase cascade to mirror: `src/app/api/projects/[projectId]/programme/phase/route.ts` (already-started branch)

```ts
const nextStatus = (p) =>
  (permanentSkipSet.has(p.phase_number)) || isPermanentlySkipped(p.status) ? "skipped"
  : (p.position ?? 0) < targetPosition ? "bypassed" : "planned";
// Others first, target last: a partial unique index allows only ONE `active` programme phase per project.
others (status !== "completed") → update(status === "planned" ? { status, actual_start_date: null } : { status })
target → update({ status: "active", actual_start_date: today })   // ← this task: keep existing / start_date instead of today
phase_programme_state upsert: target {is_manual_override: true, override_note}, planned others {false, null}
```

- Reuse `inProgrammeOrder` and `isPermanentlySkipped` from `src/lib/programme/programme-status.ts`. Don't reimplement them.
- `skipped` (permanent) phases stay `skipped`, and `completed` phases are never touched. Neither appears in the evidence rows, but the planner must handle both.
- In the SQL, order the updates so the old `active` row is demoted before the target is promoted. Otherwise the unique index fails mid-transaction.
- The Status Report maps `bypassed` and `skipped` to "Skipped" (`derivePhaseStatus` in `src/lib/programme/status-report.ts`). That's why Saginaw P2 needs `completed`.

## Implementation Steps

1. Edit the 455 `MAPPINGS`, operator actions and README as listed. Run the 455 dry run against LIVE (read-only). `plan.md` must list exactly the 10 "kickoff" rows and 3 "already matching" (Veteran, Royal Thumper, AB Lekdetectie).
2. Write `475-phase-sync/plan.ts` and `475-phase-sync.check.ts`. Run `npx tsx _docs/task/475-phase-sync.check.ts` until it passes. Fixtures: the Veteran, Black Barn, RCB and Saginaw rows above, plus a no-op case (target already active) and a case with a permanently `skipped` phase.
3. Write `475-phase-sync/dry-run.ts`.
   - Keep the moves in a `MOVES` list keyed by `project_id`: Veteran→3, Black Barn→1, RCB→2, Saginaw complete P2.
   - Add `PM_CONFIRM` notes for Royal Thumper and M&I.
   - Guard each project block on its current active phase id and status.
   - Run it against LIVE (read-only) and check that `plan.md` shows exactly the 3 moves and 1 completion.
4. Write `475-phase-sync/README.md` with the order:
   1. Confirm that task 455's code is deployed.
   2. Kickoff dry run → review → apply.
   3. Phase-sync dry run (after the kickoffs are applied, so the `start_date` fallback uses the new kickoff) → review → apply.
   4. Re-run both dry runs to verify.
5. `npx tsc --noEmit`.

## Acceptance Criteria

- [ ] **Pre-merge:** `npx tsx _docs/task/475-phase-sync.check.ts` exits 0. Asserts cover:
  - RCB → P2 `active` keeping start 2026-08-05; P3 `planned` with null start.
  - Veteran → P3 active keeping 2026-08-21; P4 `planned` with null start; P1/P2 still `bypassed`.
  - Black Barn → P1 active keeping 2026-08-21; P2 `planned`.
  - Saginaw P2 `completed` on 2026-09-09.
  - A permanently `skipped` phase stays `skipped`.
  - The no-op case returns no updates.
- [ ] **Pre-merge:** the 455 dry run against LIVE (read-only) lists exactly 10 re-baselines (the table's "kickoff" rows, Greydog as PROJ-03 and Maxton as PROJ-02) and 3 already matching. Nothing is written to the DB.
- [ ] **Pre-merge:** the 475 phase-sync dry run against LIVE (read-only) lists exactly 3 phase moves and 1 completion, plus Royal Thumper and M&I under "PM to confirm".
- [ ] **Pre-merge:** each generated `apply.sql` contains exactly one `begin;`/`commit;` pair and one guard `do $$` block per project. Check with grep counts.
- [ ] **Pre-merge:** `npx tsc --noEmit` passes.
- [ ] **Post-apply (operator):** re-running both dry runs shows every mapped project as "already matching", with 0 planned changes.
- [ ] **Post-apply, browser:** the Status Report shows Veteran on Publish, Black Barn on Onboard and RCB on Migrate & Rebrand. Saginaw's phase dots show P2 as completed, not skipped. Retail Sign's Day N = today − 2026-06-23 + 1.
- [ ] **Post-apply, no-regression:** Royal Thumper is still on "Publish, In progress". Trident Roof Solutions Website, Baoase and Summit show the same current phase and used/allotted figures as before apply. Take a screenshot or text snapshot of the Status Report before running `apply.sql`.
- [ ] **Post-apply, rollback check (manual):** `rollback.sql` is generated and reviewed, but not executed unless needed. It can't be tested without a second apply, so it's marked manual.

## Verification

```bash
npx tsc --noEmit
npx tsx _docs/task/475-phase-sync.check.ts
npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/455-kickoff-rebaseline/dry-run.ts
npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/475-phase-sync/dry-run.ts
grep -c '^begin;' _docs/task/475-phase-sync/out/apply.sql   # 1
```

## Coordination

- **455 (Approved):** this task edits its `dry-run.ts` `MAPPINGS` and README, and runs its runbook. Nobody has claimed it, so the edit is safe. 455's Operator Steps 1–2 (migration 177, code deploy) are prerequisites. Migration 177 looks applied, since project notes render on the Status Report. Whether 455's code is deployed is unconfirmed (see Operator Steps).
- **468 / 472 (Testing / Completed):** they archived and hid `82ACEB0F-PROJ-02`, which is why Greydog now maps to PROJ-03.
- **429 (In Progress, programme-engine cutover):** this task only *imports* `src/lib/programme/programme-status.ts` and `programme-dates.ts`; it doesn't edit them. If 429 renames either export, update the imports.
- **474 (Completed):** moved the Status Report UI under `src/app/(hub)/projects/_status-report/`. This affects browser-check URLs only.

## Open Decisions

- **Freshness: RESOLVED (2026-11-16).** Where the Hub is newer than Oct 15, the Hub wins (Royal Thumper's phase stays put). Otherwise the tracker wins.
- **Statuses scope: RESOLVED (2026-11-16).** Phase statuses and active phase only; no delay notes, no `projects.status`.
- **Mechanism: RESOLVED (2026-11-16).** Dry-run → SQL, applied by the operator.
- **Moved phase start: RESOLVED (2026-11-16).** Keep the existing `actual_start_date`, otherwise use the re-derived `start_date`. Never today.
- **D1 (NON-BLOCKING): Greydog target.** Default: re-baseline `82ACEB0F-PROJ-03` (the live programme PROJ-02 was merged into) to kickoff 2026-06-29. Alternative: leave Greydog out.
- **D2 (NON-BLOCKING): Maxton kickoff.** Default: set 2026-10-08 (the kickoff is a past fact the tracker records; the Hub's 2026-10-22 is just when the programme was started in the Hub). Alternative: keep 2026-10-22.
- **D3 (NON-BLOCKING): Saginaw M&R.** Default: `completed`, completed on 2026-09-09 (the day Publish started), because the tracker says it was handed over. Alternative: leave it `bypassed`.

## Operator Steps

1. **Confirm task 455's code is deployed** to the environment you're about to apply on. That means `PATCH .../programme/phase` no longer backdates `programme_started_at`. Otherwise the next phase move undoes the kickoffs.
   - How I found this: 455's README step 2.
   - The route comment "Task 455 … no longer backdated" is present in the working tree; check that the deployed build includes it.
2. Snapshot the Status Report (text or screenshot) for the no-regression check.
3. Run the kickoff dry run, review `455-kickoff-rebaseline/out/plan.md` with the PMs, then run its `apply.sql` in the Supabase SQL editor.
4. Run the phase-sync dry run (after step 3), review `475-phase-sync/out/plan.md`, then run its `apply.sql`.
5. Re-run both dry runs and confirm 0 planned changes. Then do the post-apply browser checks.
6. Ask the PMs to confirm Royal Thumper's phase and M&I's "open Publish". Create Grand River Realty via intake.

Deploys: none. The scripts run locally, and nothing under `src/` changes.

## Compatibility Touchpoints

- None. No app code, no MCP tools (`_docs/mcp-tools.md` unaffected), no packaging.

## Baseline

- Kickoff dry run with the unchanged task 455 `MAPPINGS` (LIVE, read-only, 2026-11-16): **9** re-baselines, one of them the archived `82ACEB0F-PROJ-02`; Maxton reported as "`BD64C367-PROJ-01` has no started programme". This fails the 10-row criterion.
- Phase-sync dry run: didn't exist, so the baseline is a fail by absence.
- `npx tsc --noEmit`: 24 errors before any change, all in `.next/types/validator.ts`. They're stale generated route types pointing at `src/app/(hub)/projects/v2/...` files that task 474 moved. They're regenerated by `next dev`/`build`.

## Implementation Notes

### What Changed
- Task 455's kickoff dry run now targets Greydog `82ACEB0F-PROJ-03` and Maxton `BD64C367-PROJ-02` (D1, D2 defaults). Its operator note and README now say that PROJ-02 was merged and archived.
- New pure planner `planPhaseSync` mirrors the phase route's already-started cascade. Two differences: the target keeps its `actual_start_date` (falling back to `start_date`, never today), and there's an optional `completePhase` dated to the next phase's actual start.
- New read-only phase-sync dry run that writes plan, apply and rollback files. Each project is guarded by a snapshot of its phase ids and statuses. Demotions come before the promotion (one-active unique index), and rollback runs in reverse order.

### Files Changed
- `_docs/task/455-kickoff-rebaseline/dry-run.ts`: MAPPINGS lines 08 and 16, plus the Greydog operator note.
- `_docs/task/455-kickoff-rebaseline/README.md`: dropped the stale Maxton line and rewrote the Greydog line.
- `_docs/task/475-phase-sync/plan.ts`: planner (reuses `inProgrammeOrder` and `isPermanentlySkipped`).
- `_docs/task/475-phase-sync/dry-run.ts`: SQL generator.
- `_docs/task/475-phase-sync.check.ts`: assert-based self-check (8 cases).
- `_docs/task/475-phase-sync/README.md`: runbook.

### Deviations From Plan
- Minor: the runbook lives in `475-phase-sync/README.md` and covers both scripts, rather than being split.
- Minor: the planner refuses to activate a `skipped` or `completed` target (throws). This guard wasn't in the plan; it's covered by the check.
- `git fetch` was skipped because CLAUDE.md forbids git commands; worked from the local task doc.
- Observed, not changed: the target phases all already have an `actual_start_date`, so the `start_date` fallback isn't used in this run. Running the phase sync before or after the kickoff apply gives the same SQL today. The runbook still says "after", to be safe.

### Verification Run
- `npx tsx _docs/task/475-phase-sync.check.ts`: PASS ("all checks passed")
- 455 kickoff dry run (LIVE, read-only): PASS (baseline 9 re-baselines incl. archived PROJ-02 → now **10**: Retail, Saginaw, WMI, Black Barn, Greydog PROJ-03, Belmont, RCB, M&I, Hello Homes, Maxton PROJ-02; 3 already matching: Veteran, Royal Thumper, AB Lekdetectie)
- 475 phase-sync dry run (LIVE, read-only): PASS (3 moves: Veteran P4→P3, Black Barn P2→P1, RCB P3→P2; 1 completion: Saginaw P2 on 2026-09-09; 0 problems; Royal Thumper and M&I under "PM to confirm")
- `apply.sql` structure: PASS (`begin;` ×1, `commit;` ×1, guard `do $$` ×4, one per project)
- `npx tsc --noEmit`: PASS for source and `_docs` (0 errors outside `.next/`). The 24 stale `.next/types` errors are unchanged from the baseline and pre-existing (task 474 route move).
- Post-apply checks: NOT RUN. They're operator-run after applying the SQL.

### Attempts That Failed
- A standalone `tsc` on just the 475 files (no project config) failed on the `@/types/database` alias. That was the wrong invocation, not a code fault; the project-config `tsc` covers `_docs/**/*.ts` and is clean.

### Operator Steps
1. Confirm task 455's code (no kickoff backdating on phase moves) is deployed to the target environment.
2. Snapshot the Status Report.
3. Run the 455 kickoff dry run → review → run `455-kickoff-rebaseline/out/apply.sql`.
4. Run the 475 phase-sync dry run → review → run `475-phase-sync/out/apply.sql`.
5. Re-run both dry runs (expect 0 changes) and do the post-apply browser checks.
6. PMs: confirm Royal Thumper and M&I; create Grand River Realty.
- Deploys: none. Nothing under `src/` changed.

## Quality Gate Notes

### Result
PASS (after one fix made during the gate, described below)

### Standards Review
- **Fixed during the gate (correctness):** the `apply.sql` guard compares a JS-built snapshot (`localeCompare` sort) against Postgres `string_agg(... order by id::text)` under the DB's default collation. ICU and libc collations can order hyphenated UUIDs differently from each other, which would make the guard falsely abort a valid apply. Both sides now use byte order: JS `<` and SQL `collate "C"`. I regenerated `out/`. All 4 emitted snapshots verified as byte-sorted (`LC_ALL=C sort` diff), and the plan is unchanged (4 projects, 0 problems).
- Planner (`plan.ts`) is pure, has one job, and reuses `inProgrammeOrder`/`isPermanentlySkipped` instead of reimplementing them. It throws on impossible targets rather than silently skipping them.
- Check file asserts on behaviour (the update sets, ordering, rollback `from` values and state rows), not on source text. 8 cases, including no-op and refusal.
- No secrets. The scripts read `.env` keys at runtime only, and `out/` is git-ignored (`.gitignore:60`). No debug logging beyond the intended plan output.
- Writes are confined to generated SQL; neither script calls insert, update or delete on the DB (checked by reading: only `.select` is used).
- Minor typing: `diff()` uses `Record<string, unknown>` casts to copy keyed fields. Acceptable for a one-off script and kept local.
- Acceptance criteria: the pre-merge ones are each backed by a failing-capable check (the kickoff baseline showed 9 → now 10; the phase-sync dry run failed by absence before). Post-apply checks are operator-run; the rollback check is explicitly `manual`.

### Deviations
- Minor: the guard's sort-order fix was made in the gate rather than sent back to implement (two-token change; re-verified above).
- Minor (from implement): the planner refuses `skipped`/`completed` targets; there's one runbook for both scripts.
- Minor: changed files were taken from Implementation Notes, not `git diff` (CLAUDE.md forbids git commands).
- Pre-existing, not this task: 24 stale `.next/types` tsc errors (task 474 route move); 0 errors in source or `_docs`.

### Required Fixes
- None outstanding.

## Post-Apply Verification (2026-11-16, operator-applied on LIVE)

- 455 kickoff `apply.sql` was applied. A re-run of the dry run shows **Re-baseline (0), Already matching (13)**: PASS.
  - ⚠️ The verification re-run overwrote `out/rollback.sql` before it was saved. There is no SQL rollback for the kickoffs. To undo one, set its old start in the Timeline **Kickoff** editor: Retail 08-02, Saginaw 08-10, WMI 08-31, Black Barn 08-25, Greydog PROJ-03 07-22, Belmont 09-22, RCB 08-02, M&I 07-28, Hello Homes 08-06, Maxton 10-22. The runbook now says to copy the rollback before verifying.
- 475 phase-sync `apply.sql` was applied, after saving `out/rollback-applied.sql`. A re-run shows **Changes (0), Already matching (4), problems 0**: PASS.
- Browser, Status Report (now `/projects/stackshift-i/status-report` after task 474; 18 StackShift I projects): PASS
  - Veteran: Publish 88/30d, 0d left. Black Barn: Onboard 88/15d, 25d left. RCB: Migrate & Rebrand 104/15d, 0d left.
  - Day/days left follow the new kickoffs: Retail 0d, Greydog 0d, M&I 0d, Saginaw 3d, Belmont 3d, Hello Homes 8d, WMI 28d, Maxton 80d.
  - No regression: Royal Thumper is still "Publish, In progress 7/30d, On track". Trident Website (Publish 88/30d, 2d left), Trident App (M&R 104/15d, 1d left) and Glorias (M&R 64/15d, 41d left) are unchanged.
  - Summit and Baoase aren't StackShift I, so they aren't on this filtered page. They weren't in any plan, so they're untouched by construction.
- Saginaw P2 `completed` is confirmed by the dry run ("already matches" with `completePhase: 2`). The phase dot wasn't inspected visually.
