# Test Report — 196: Import Project Duplicate-Name Guard

**Date:** 2026-07-29
**Task doc:** `_docs/task/196-import-project-duplicate-name-guard.md`
**Quality gate:** PASS (see task doc's Quality Gate Notes)

## Environment

- `pnpm dev` (Turbopack), `http://localhost:3000`
- Chrome, existing authenticated Super Admin session (Danessa)
- Verified via direct `fetch()` calls to `POST /api/onboarding/projects/import` from the browser console (same authenticated session), rather than the Import page's file-upload UI — this exercises the exact same route/payload the UI sends, with precise control over row content for each scenario.

## Static Checks

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS (re-confirmed at implement stage) |
| `pnpm lint` | PASS (re-confirmed at implement stage) |

## Functional Verification

### 1. Same-batch duplicate rows (scenario 1 from task doc)
One request, two rows, identical `account`/`type`:
```json
{"rows":[{"account":"ZZTEST-196 Batch QA","type":"StackShift I"},{"account":"ZZTEST-196 Batch QA","type":"StackShift I"}]}
```
**Result:** PASS — `200 { "imported": 1, "errors": [{ "row": 2, "error": "A project with this name already exists" }] }`. Only one project created (`BA5CB1DE-PROJ-01`); row 2 correctly rejected instead of silently creating a duplicate. Confirms the guard sees row 1's already-committed insert when checking row 2, within the same request.

### 2. Re-running an already-imported file (scenario 2 from task doc)
Same single-row payload re-submitted as a second, separate request:
```json
{"rows":[{"account":"ZZTEST-196 Batch QA","type":"StackShift I"}]}
```
**Result:** PASS — `200 { "imported": 0, "errors": [{ "row": 1, "error": "A project with this name already exists" }] }`. No new project created.

### 3. Normal distinct-row import (regression)
```json
{"rows":[{"account":"ZZTEST-196 Regression QA","type":"StackShift I"}]}
```
**Result:** PASS — `200 { "imported": 1, "errors": [] }`. Project `823727BD-PROJ-01` created normally, confirming the guard doesn't false-positive on a genuinely new name.

## Acceptance Criteria

| Criterion | Result |
|---|---|
| Two rows, same batch, same Account+Type → one project created, second row reports the duplicate error | PASS (test 1) |
| Re-uploading an already-imported file → every row reports the duplicate error, no new projects | PASS (test 2 — single-row case; see Not Covered for multi-row re-upload) |
| Normal import of distinct rows unaffected | PASS (test 3) |
| `npx tsc --noEmit` passes | PASS |

## Not Covered

- Re-uploading a *multi-row* file where every row was previously imported (tested only the single-row re-run case in test 2) — same code path per row, low risk, but not separately observed.
- The Import page's own file-upload UI (CSV/Excel parsing → this same API) was not driven through the browser; verification hit the API directly with equivalent payloads. The parsing/upload UI itself is unchanged by this task.

## Test Data Created (needs cleanup)

Two test customer/project pairs, created via direct API calls (both went through `seedProgrammeAtPhase`, since this route always seeds a phase on import regardless of mode):

| customer_id | project id (UUID) | project_id | name |
|---|---|---|---|
| `WRQ-CUST-BA5CB1DE` | `13b21926-4474-40ec-aa9f-1e37a05b5ff6` | `BA5CB1DE-PROJ-01` | ZZTEST-196 Batch QA Website |
| `WRQ-CUST-823727BD` | `bead8882-fef4-4804-9dca-3ca6a407b848` | `823727BD-PROJ-01` | ZZTEST-196 Regression QA Website |

Cleanup SQL (same pattern as the earlier live-data incident cleanup — each is the sole project for its customer; the defensive `customer_asset_folders` step covers the non-cascading FK gotcha documented in task 195's incident record):

```sql
delete from customer_asset_folders where customer_id in ('WRQ-CUST-BA5CB1DE', 'WRQ-CUST-823727BD'); -- defensive no-op
delete from customers where customer_id in ('WRQ-CUST-BA5CB1DE', 'WRQ-CUST-823727BD');
```

## Result

**PASS.** Both duplicate scenarios from the task doc confirmed rejected; normal import unaffected. No blocking issues found.
