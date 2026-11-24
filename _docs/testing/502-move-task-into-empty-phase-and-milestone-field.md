# Test Report: Move a task into a phase with no task list + task "Milestone" field moves the task

**Task:** 502 · **Date:** 2026-11-24 · **Result:** **PASS, with two gaps** (AC4 UI drag not performed; AC8 needs a
developer account). Run 2 below; run 1 was BLOCKED (browser couldn't load the app).

## Summary

The root cause is confirmed on Valli's real data (read-only). On a test project, the reported flow now works end to end:
an empty phase can be picked in the Move dialog, a phase-named list is created and then reused, the task's subtask
moves with it, and the task page's Milestone field moves the task and always shows its list's phase.

## Test Environment

- Dev server `http://localhost:3000` (an existing `next dev`, PID 9384). Claude in Chrome, single local browser.
  Session: a **Super Admin** who is a **Test User**.
- Run 1's "browser-internal URL" failures were a stale tab. A fresh tab (`tabs_context_mcp createIfEmpty`) loaded the
  app normally.
- **Writes only on test project** `E4D31095-PROJ-01` "Salas Ayala Associates Website" (`is_test: true`, confirmed via
  `GET /api/v2/projects/E4D31095-PROJ-01`), as agreed with the user. It has phase 1 "Test" (list "Testing"), phase 2
  "Test 2" (**no list**), and "General" (no phase).
- Valli Website (`EC921137-PROJ-01`): **read-only** GETs only.

### Test data created (left in place on the test project)

| Item | Notes |
|---|---|
| `E4D3109501-T0001` "502 QA - move to empty phase" | General → (dialog) Test 2 |
| `E4D3109501-T0004` "502 QA - child of move task" | subtask of T0001 |
| `E4D3109501-T0002` "502 QA - out of sync (milestone Test, list General)" | created with `milestone_id` = Test in General, which reproduces Valli's state |
| `E4D3109501-T0003` "502 QA - milestone field" | Milestone field checks, then a list-to-list move to Testing |
| Task list "Test 2" (`5116632f…`, phase Test 2) | created by the feature (AC2) |

## Verification Commands

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS (0 output lines) |
| `npx tsx _docs/task/487-move-rules.check.ts` | PASS, including the 502 empty-phase cases |
| `npx eslint` on the 9 changed source files | PASS (0 output lines) |

## Root cause on real data (read-only)

`EC921137-PROJ-01` Valli Website: milestones **"Splash page: 0 lists"** and **"Build Phase: 0 lists"**; the only list is
**General [no phase]**; "Post-live feedback" sits in **General** with its own `milestone_id` = **Splash page**. This
matches the task doc's diagnosis (empty optgroups plus a Milestone field the tree ignores).

## Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Empty phases selectable in the Move dialog | **PASS** | Options: `Test > Testing`, `Test 2 > Test 2 (new list)` (value `newlist:113f9446…`, not disabled), `General`. Selected by keyboard (ArrowUp); Parent select became disabled; Move task enabled, no alert |
| 2 | Phase-named list created; task + subtasks land there | **PASS** | Loading toast "Moving …" → tree shows Phase 2 › list **Test 2** › T0001 › T0004. API: list `Test 2 [ms 113f9446]` created; T0001 `list=5116632f ms=113f9446`; T0004's page shows Milestone "Test 2" |
| 3 | A second move into the same phase reuses the list | **PASS** | T0003 via the Milestone field → `list=5116632f` (same id); the project still has **3** lists |
| 4 | Drag onto an empty phase band | **PARTIAL** | Not performed in the UI (no empty phase left on the project after AC2). Drop resolution is covered by the check file (`kind: "phase"` on an empty phase → `PhaseMove`), and drop and dialog share `resolveTaskMove` → `moveTask` |
| 5 | Milestone field moves the task; "None" → General | **PASS** | T0003: None → Test 2 showed "Moving…", then the field = Test 2, DB list `5116632f`. Test 2 → None: field = None, DB `list=7c29fe55` (General), `ms=none` |
| 6 | Subtask: field disabled + "Follows the parent task" | **PASS** | T0004: `disabled: true`, caption present (zoom screenshot) |
| 7 | Out-of-sync task shows its list's phase | **PASS** | T0002 (milestone Test, list General) shows **None**, which matches the tree's "No phase" (before this change it showed "Test") |
| 8 | Non-PM editor gets the PM-only error | **NOT RUN** | Needs a developer account that can edit the task. The server path is the explicit `LIST_CREATE_ROLES` check before the insert |
| 9 | Regressions | **PASS (list-to-list)** | Dialog: T0003 General → Testing; `list=1a6a5f7e`, `ms=36425df0` (follows the list), no list created; "Test 2" now listed as a normal option (no "(new list)"). Reorder / nest / 503 not exercised in the UI (unchanged code paths; nest and reorder covered by the check file) |

## Follow-ups

- AC8: run with a developer account before closing the task, or accept on review of the role check.
- Valli: once this is deployed, re-pick Splash page on "Post-live feedback" (it isn't backfilled).
- The QA tasks and the "Test 2" list remain on the test project. Delete them if you don't want them there.

## Result

PASS for every criterion that ran (1, 2, 3, 5, 6, 7, 9). AC4 is partial and AC8 wasn't run. Task 502 stays in **Testing**
until the user approves.

**Approval:** user approved on 2026-11-24 with AC4 (logic-only) and AC8 (not run) accepted. Moved to **Approved**.
