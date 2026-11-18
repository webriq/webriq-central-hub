# Test Report: Legacy projects listing — row-card List view (default), kebab, List-first toggle, no-freeze navigation

> **Task ID:** 485
> **Status:** PASS (with skips listed below)
> **Tested:** 2026-11-18
> **Task Doc:** [_docs/task/485-legacy-listing-list-view-default.md](../task/485-legacy-listing-list-view-default.md)

## Summary

Every behaviour check that ran passed: List is the default, the switch is List then Grid and needs no server request, every kebab item works from a list row, and the skeletons appear within about 100 ms (legacy tabs were a 6.6 s freeze before). Two checks were not run (tag removal, which edits real data, and a true 390 px width), and one no-regression check on the classification side was inconclusive.

## Test Environment

- Platform: web
- Runtime: local `next dev` on :3000, logged in as a Super Admin (existing session)
- Tools: `tsc`, `eslint`, Claude in Chrome (DOM timing scripts + screenshots)
- Base URL: http://localhost:3000/projects/legacy

## Verification Commands

| Command | Result | Notes |
|---------|--------|-------|
| `npx tsc --noEmit` | PASS | 1 error, the same pre-existing one as the baseline (`.next/types/app/(hub)/dashboard/users/page.ts` ROLE_OPTIONS); 0 new |
| `pnpm exec eslint "src/app/(hub)/projects/_legacy-listing" "src/app/(hub)/projects/legacy"` | PASS | no output |

## Acceptance Criteria Results

| # | Criterion | Check run | Baseline | Result | Status | Evidence |
|---|-----------|-----------|----------|--------|--------|----------|
| 1 | tsc | as above | 1 pre-existing error | same 1, 0 new | PASS | output |
| 2 | eslint | as above | — | clean | PASS | output |
| 3 | Bare URL = List, toggle List→Grid | load `/projects/legacy`, screenshot + `aria-pressed` | Grid default, Grid first | rows, List pressed, List first | PASS | behaviour |
| 4 | Instant toggle | click Grid then List, count `_rsc`/legacy resource entries | server navigation | `?view=grid` → bare URL, 15 cards ↔ rows, **0** requests | PASS | behaviour |
| 5 | `?view=list` | load it | — | 15 rows, List pressed | PASS | behaviour |
| 6 | Kebab in list row | click each item | no kebab in list | menu drawn over later rows; Rename → input focused, stayed on listing (Esc); Set Project Owner + Manage Collaborators dialogs open, closed with X (nothing chosen); Copy Link → "Copied!"; Delete → confirm dialog, **Cancel**; View Project → `/projects/legacy/<id>/tasks`. Classification item not shown for the tested project (no product), so not exercised | PASS | behaviour |
| 7 | Row click | click `a[aria-label="View JVPC"]`, time | `router.push`, no prefetch | skeleton 105 ms, href `/tasks`, no redirect request | PASS | behaviour |
| 8 | Stats / tag remove | click tickets stat in row | — | → `/projects/legacy/<id>/tickets`. Tag remove **not run**: it PATCHes real project tags | PASS (stats) / SKIPPED (tag) | behaviour |
| 9 | Route skeleton = rows | first load screenshot | card grid | row skeletons | PASS | behaviour |
| 10 | isPending skeleton per view | type "JVPC" in search (List) | — | row skeleton at 301 ms (300 ms debounce), 1 result, `view` kept | PASS | behaviour |
| 11 | Clear filters in Grid | Grid + search, click Clear filters | went to bare URL | URL params = `view` only (`view=grid`), 15 cards, search emptied | PASS | behaviour |
| 12 | Legacy tab switch | click tab links, time skeleton, count `h1` | 6643 ms freeze, doubled header | files 85 ms, tickets 48 ms, tasks 43 ms; 1 `h1` while loading. First visit to a not-yet-compiled route in dev ~1.5 s (tickets, milestones) | PASS | behaviour |
| 13 | Project → listing | sidebar Legacy; browser Back | — | sidebar: skeleton 42 ms; Back: painted 29 ms | PASS | behaviour |
| 14 | Narrow width | window resized (Chrome min 606 px; main ≈ 350 px) | — | rows wrap, kebab reachable, rows don't overflow; `main` scrolls sideways due to **pre-existing** pagination controls | PARTIAL | behaviour |
| 15 | No regression: Grid | Grid view, open card kebab | — | 15 cards; kebab opens with all items | PASS | behaviour |
| 16 | No regression: classification listing | load `/projects/stackshift-i` | — | List first + pressed, 15 kebabs. Its project open/tab timing was **inconclusive** (wait timed out on a persistent pulse element on Timeline; Files click didn't fire); no v2 files were changed | PASS (listing) / INCONCLUSIVE (project timing) | behaviour |

## Post-Deploy Checks

None needed. A production build check of prefetch timing is still blocked by the pre-existing `dashboard/users` build error (same as 484).

## Notes / Follow-ups

- Pre-existing: the listing toolbar's pagination controls overflow horizontally at phone widths (both listings share the pattern). Not caused by 485.
- My first scripted attempts at #12 and #6 used wrong selectors (sidebar Desk link; portal menu). They were re-run with the correct ones and aren't counted.
