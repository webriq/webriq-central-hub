# Test Report — 195: New Project Form Duplicate Submission Guard

**Date:** 2026-07-29
**Task doc:** `_docs/task/195-new-project-form-duplicate-submission-guard.md`
**Quality gate:** PASS (see task doc's Quality Gate Notes)

## Environment

- `pnpm dev` (Turbopack), `http://localhost:3000`
- Chrome, existing authenticated Super Admin session (Danessa)

## Static Checks

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS (re-confirmed at implement stage) |
| `pnpm lint` | PASS (re-confirmed at implement stage) |

## Functional Verification

### 1. Normal single submission still works (regression)
Walked the full wizard: `/v2/portfolio-tracker/new` → Step 1 "New company" `ZZTEST-195 Duplicate Guard QA` → Step 2 classification `StackShift I`, auto-derived project name `ZZTEST-195 Duplicate Guard QA Website` → Step 3 "Just save".
**Result:** PASS — success screen rendered (`"ZZTEST-195 Duplicate Guard QA Website is ready"`), customer `WRQ-CUST-342E0616` created, project `342E0616-PROJ-01` created.

### 2. Client-side re-entrancy lock (`submitLockRef`)
On the same Step 3 screen, double-clicked "Just save" (`computer.double_click`, two rapid click events on the same element).
**Result:** PASS — exactly one success screen rendered, no error, no crash, no second project created (confirmed via the same-name row check in test 3 below, and via the full project list in the cleanup step showing only one `342E0616-PROJ-01` row). Consistent with the lock discarding the second invocation before any second `fetch` fired.

### 3. Server-side duplicate-name guard, in isolation
Bypassed the wizard entirely — direct `fetch('/api/onboarding/projects', { method: 'POST', ... })` from the browser console (same authenticated session) with `project_name: "ZZTEST-195 Duplicate Guard QA Website"` (identical to the project just created) and `customer.existing_customer_id: "WRQ-CUST-342E0616"`.
**Result:** PASS — `409 { "error": "A project with this name already exists" }`. No project row created. This isolates and directly confirms the actual server-side fix (task doc Requirement 1), independent of any client-side behavior.

### 4. Step 2 → 3 `check-name` pre-check unchanged
Observed during test 1 — the "Continue" button showed "Checking…" at the Step 1 → 2 transition (company-name check) and the Step 2 → 3 transition proceeded normally for the unique name. No regression observed.

## Acceptance Criteria

| Criterion | Result |
|---|---|
| Repeat submission with unchanged name results in exactly one `projects` row; second attempt shows the duplicate-name error | PASS (verified via direct API call, test 3) |
| Single normal submission succeeds unchanged (all four modes) | PASS for `save` (test 1); `save_scheduled`/`start` modes share the same guard code path and were not separately walked through the UI — see Not Covered |
| Step 2 → 3 `check-name` UX unchanged | PASS (test 4) |
| `npx tsc --noEmit` passes | PASS |

## Not Covered

- `save_scheduled` and "Start Phase N Now" modes were not individually walked through the UI (the duplicate-name guard runs identically for every mode, before the mode branch, so this is low-risk, but it's not the same as having watched each success path render).
- The `startAtPhase()` client-side lock (as opposed to `submit()`'s, tested above) was not separately double-click-tested.

## Test Data Created (needs cleanup)

One test customer/project pair, created via the UI:

| customer_id | project id (UUID) | project_id | name |
|---|---|---|---|
| `WRQ-CUST-342E0616` | `a6c24c9a-cf3b-407c-a6bb-7663361db469` | `342E0616-PROJ-01` | ZZTEST-195 Duplicate Guard QA Website |

Cleanup SQL (same pattern as the earlier live-data incident cleanup — this is the sole project for this customer, `mode: "save"` so no programme was seeded, only the creator's `project_members` ownership row is attached, which cascades):

```sql
delete from customer_asset_folders where customer_id in ('WRQ-CUST-342E0616'); -- defensive no-op
delete from customers where customer_id in ('WRQ-CUST-342E0616');
```

## Result

**PASS.** Both the client-side lock and the server-side guard confirmed working as designed. No blocking issues found.
