# Test Report: "General" task list — move list-less tasks into General, default new tasks to it

**Task:** 486 · **Date:** 2026-11-18 · **Result:** **PASS (pre-merge), run 2.** Run 1 FAILED (below). Fixed in revision 2 + D4 (merge duplicate Generals). Post-apply checks deferred.

## Run 2 (after revision 2): PASS pre-merge

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS: 1 error, pre-existing `.next/types/.../dashboard/users` (unchanged) |
| `pnpm exec eslint` `_list-view.tsx`, `_project-detail.tsx` | PASS |
| `.sql-check.mjs` (now incl. P7 General-under-phase and P8 three-duplicate merge) | PASS `ALL CHECKS PASS` |
| `.priv-check.mjs` / rollback | PASS / PASS |
| Browser `7149F820-PROJ-01` Tasks tab (pre-apply) | PASS: run 1 two "General" groups (2 / 12) → now **one** group (14), 0 "No Tasklist" |

Still deferred (need 183 applied): checks 3–12, 13 (save to another list), 15–20. `F250DE4B-PROJ-01` will still show its two Generals
until 183 merges them (pre-apply the UI can't merge lists; orphans fold into the preferred one).

## Run 1 Summary

The static checks, the migration on PGlite (backfill, idempotency, D1–D3, project delete, privileges) and the pre-apply UI all pass. A read-only
look at real project data (dev server on the shared DB) found a definition bug:

- Zoho-imported "General" task lists usually carry a phase (`tasklists.milestone_id` / `project_deliverables.phase_id` set).
  Migration 183 (`is_general_tasklist`: `phase_id IS NULL`) and the UI (`generalTasklistId`: `!tl.milestone_id`) both **ignore** those.
- In a sample of the 15 projects on `/projects/legacy` page 1: 13 have a "General" list; **5 have it only under a phase** (the migration would
  create a **second** General in each); 2 already have two Generals; **0** have any `is_default` list.
- Visible now on `7149F820-PROJ-01`: **two "General" groups** on the Tasks tab, the real one (phase, 2 tasks) and the fallback (12 orphans).
  After applying 183 it would still show two (the new no-phase General + the old one). That contradicts the request ("move into General").

## Test Environment

- Local dev server `http://localhost:3000` (already running), signed in as an existing super-admin session in Chrome (Claude in Chrome).
- Database: shared Supabase. **Migration 183 not applied**, so this exercises the pre-apply path. All DB access was read-only `GET`s
  (`/api/v2/projects/{pid}/tasks`, `/tasklists`). The New Task modal was opened and **cancelled**; nothing was created.
- PGlite 0.2.17 (Postgres WASM) in the session scratchpad for the migration checks.

## Verification Commands

| Command | Result | Baseline → now |
|---|---|---|
| `npx tsc --noEmit` | PASS (only pre-existing `.next/types/app/(hub)/dashboard/users/page.ts` error) | 1 → 1 |
| `pnpm exec eslint` on `_list-view.tsx`, `_project-detail.tsx`, `_create-task-modal.tsx` | PASS (exit 0) | — |
| `grep -rn "No Tasklist" "src/app/(hub)/projects/_shared" \| wc -l` | PASS | 1 → 0 (weak evidence: source text; backed by browser check 14) |
| `node 486-general-default-tasklist.sql-check.mjs <repo>/supabase/migrations/183_general_default_tasklist.sql` | PASS (`ALL CHECKS PASS`) | — |
| `node 486-general-default-tasklist.priv-check.mjs <same>` | PASS (`PRIV PASS`) | — |
| rollback check (`rb.mjs`, scratchpad) | PASS (`ROLLBACK PASS`) | — |

## Acceptance Criteria Results

| # | Result | Evidence |
|---|---|---|
| 1 | PASS | tsc/eslint above |
| 2 | PASS (weak) | grep 1 → 0 |
| 3 | DEFERRED | operator baseline on the shared DB before applying 183 |
| 4, 5, 5b, 6, 7, 8, 9, 10, 15–19 | PASS on PGlite / DEFERRED on shared DB | sql-check + priv-check. **But check 6 is mis-specified:** it counts only no-phase Generals, so it would pass while 7149F820 gains a duplicate General |
| 11 | PARTIAL | privilege path proven on PGlite (priv-check); real RLS deferred until post-apply |
| 12 | DEFERRED | needs 183 applied |
| 13 (UI) | PASS | `95A10EE3-PROJ-01` New Task modal: "Task list" field shows **General** (no default list exists, so this is the placeholder). Cancelled |
| 13 (no regression: pick another list) | DEFERRED | needs a task to be created; not done on the shared DB |
| 14 | **PASS with defect** | `CAA175BE-PROJ-01` (no-phase General): one "General" group, 14 tasks (12 orphans folded in), 0 "No Tasklist". `95A10EE3-PROJ-01` (no General): fallback group "General" (1 task), 0 "No Tasklist". `F250DE4B-PROJ-01` (two pre-existing Generals): 2 groups (42 / 0). **`7149F820-PROJ-01` (General under a phase only): 2 "General" groups (2 / 12), defect** |
| 20 | DEFERRED | needs 180 + 183 applied |

## Failure Details (for implementation)

Root cause: "General" is defined as `lower(trim(name)) = 'general' AND phase_id IS NULL AND source <> 'programme'`
(`183_general_default_tasklist.sql` `is_general_tasklist`; `_list-view.tsx` `generalTasklistId`). Real data puts General under phases.

Proposed fix (needs user confirmation, because it changes the plan's General definition):
1. `is_general_tasklist(name, source)`: drop the phase condition (keep name + `source <> 'programme'`).
2. `ensure_general_tasklist` pick order: no-phase first, then oldest (`order by phase_id is not null, created_at, id`). Create one only when none exists.
3. Backfill `distinct on` with the same order. `generalTasklistId()`: drop `!tl.milestone_id`, prefer one without a milestone.
4. D3 guard: the "another General remains" exception already covers duplicates. Moving a General between phases (`phase_id` update) is not guarded, which is fine.
5. Fix acceptance check 6 to count Generals regardless of phase. Add a PGlite case: a project whose only General has a phase gets **no** new list.
   Re-run the browser check on `7149F820-PROJ-01` (one General group expected, pre-apply too).

## Post-Deploy Checks

All DEFERRED until migrations 181 → 182 → 183 are applied: 3–10, 11 (RLS), 12, 13 (save to another list), 15–20, per the task doc's Operator Steps.

## Notes / Follow-ups

- No project in the sample has an `is_default` list, so D1 makes no difference there. New tasks will show the "General" placeholder until a General is flagged default.
  The migration flags General as default only where no default exists, which is every project in the sample.
- Two projects already have duplicate "General" lists (`F250DE4B-PROJ-01`, one more). 183 does not merge duplicates. Out of scope; mention to the user.
