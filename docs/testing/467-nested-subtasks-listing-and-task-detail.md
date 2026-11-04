# Test Report: Nested Subtasks — Task Detail tab + Tasks listing

> **Task ID:** 467
> **Status:** PARTIAL (static + pure-logic PASS; all browser/API behaviour BLOCKED)
> **Tested:** 2026-11-04
> **Task Doc:** [_docs/task/467-nested-subtasks-listing-and-task-detail.md](../../_docs/task/467-nested-subtasks-listing-and-task-detail.md)

## Summary

Pure tree logic, typecheck and lint pass. Every behavioural criterion (API create/cap, Subtasks tab, listing add, permissions, regressions, cascade) is BLOCKED: no dev server was running, `.env.local` does not exist in the working directory (no Supabase URL/keys), and there are no test credentials for a logged-in session. Nothing was marked PASS from reasoning.

## Test Environment

- Platform: web + api
- Runtime: local (no app server available)
- Tools: tsx, tsc, eslint. Browser automation (Claude in Chrome) loaded but not usable: nothing to point it at.
- Base URL: N/A (`curl http://localhost:3000/login` → 000)

## Verification Commands

| Command | Result | Notes |
|---------|--------|-------|
| `npx tsx _docs/task/467-subtask-tree.check.ts` | PASS | nesting order, orphan/cycle exclusion, descendant rollup, cap constant |
| `npx tsc --noEmit` | PASS for task files | 9 errors total, all in `_mention-extension.tsx` (task 466 deps `@tiptap/extension-mention`/`suggestion` not installed); 0 elsewhere |
| `npx eslint` on all touched files/dirs | PASS | exit 0, no output |

## Acceptance Criteria Results

| # | Criterion | Check run | Baseline | Result | Status | Evidence |
|---|-----------|-----------|----------|--------|--------|----------|
| 1 | Pure logic | `npx tsx …467-subtask-tree.check.ts` | n/a (new) | "subtask-tree OK" | PASS | behaviour |
| 2 | Types | `npx tsc --noEmit` | 9 pre-existing (mention ext.) | same 9, 0 new | PASS | static |
| 3 | API create fields | POST `/api/v2/tasks/{id}/subtasks` | – | not run | BLOCKED | – |
| 4 | API depth cap → 400 | POST at depth 5 | – | not run | BLOCKED | – |
| 5 | Detail-page Subtasks tab, nesting, breadcrumb | browser | – | not run | BLOCKED | – |
| 6 | Listing add-subtask, 3 levels, reload persistence | browser | – | not run | BLOCKED | – |
| 7 | Tasklist grouping (no duplicate root) | browser | – | not run | BLOCKED | – |
| 8 | Rollup updates on close | browser | – | not run | BLOCKED | – |
| 9 | Permissions (read-only user) | browser + curl | – | not run | BLOCKED | – |
| 10 | No-regression: roots/counts, checklist rows | browser + SQL | – | not run | BLOCKED | – |
| 11 | No-regression: drawer, Zoho-imported trees | browser | – | not run | BLOCKED | – |
| 12 | Delete cascade + confirm | browser (manual, destructive) | – | not run | BLOCKED | – |

## Post-Deploy Checks

None (no migration/deploy).

## Issues Found

None observed; behaviour is unverified, not verified-good. Risks worth checking first when run live: (a) the pre-existing `tasks_status_check` accepts `open` for subtasks; (b) RLS lets the intended roles insert child rows; (c) `depth` column present in the target DB (otherwise the 42703 retry path is exercised).

## To unblock

Provide `.env.local` (copy from `env.example`, dev/staging Supabase) and a PM test login, then run `pnpm dev` and execute criteria 3–12 in a browser.
