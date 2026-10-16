# Test Report: 455, programme kickoff re-baseline + PM-editable delay notes

**Date:** 2026-10-16
**Task doc:** `_docs/task/455-programme-kickoff-rebaseline-and-delay-notes.md`
**Quality gate:** PASS (see the task doc's Quality Gate Notes)
**Overall result:** **PASS.** Automated, static and API checks 24/24 (2 skipped: no `marketing` users exist), plus a browser UI walkthrough (U01–U09) in the user's Chrome session (Super Admin) against the test project. The first browser attempt failed; on the user-requested retry the walkthrough ran on `localhost:3001` (see Environment).

## Environment

- Local checkout, Node 24, `pnpm`, Next.js 16.2.11. `.env` points at the **live** Supabase project; there is no local database.
- **Migration 177 was applied by the user** before testing. Verified: `projects.delay_note` and `phase_programme_state.delay_note_updated_at` exist.
- **Write scope (user-approved):** writes went only to the test project **ABC Test Company Website** (`46305B0C-PROJ-01`, `f54f7836-…`). Its programme (project start, all 5 phases, 27 deliverables, 5 state rows) was snapshotted first and restored afterwards; the harness checked **RESTORE OK**. Real customer projects were only read; a dry run after testing shows all 10 still at their original start dates.
- Snapshot, harness and logs live in the session scratchpad, not the repo.
- **Dev servers:** stopping the first background `pnpm dev` didn't kill its Node child, which kept holding port 3000 (one cause of the failed first browser attempt). The retry server came up on **3001**. Both servers were stopped afterwards (the orphan was confirmed to be this session's own `next dev` before stopping).

## Static & automated checks

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `pnpm lint` | PASS: 0 errors (3 pre-existing warnings in untouched `onboarding-workspace/_checklist-tab.tsx`, `_files-tab.tsx`) |
| `pnpm check:logic` | PASS: 95/95, incl. 5 new `note-rules` checks (role sets, note trim/clear/1000 cap, kickoff date validation, noon-UTC = Day 1) |
| `pnpm build` (webpack) | PASS: exit 0; `/api/projects/[projectId]/programme/kickoff` and `/programme/note` compiled. The first attempt failed on a truncated generated `.next/dev/types/routes.d.ts` left by stopping the dev server; after deleting `.next/dev` (build artifact) it passed. Not a code issue. |
| `npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/455-kickoff-rebaseline/dry-run.ts` (read-only, live) | PASS: 10 re-baselines, 2 already matching, 3 operator actions. Day-after values match the tracker (e.g. Retail Sign Day 116). Output in git-ignored `out/`. |

## API checks: route handlers with a stubbed session

**Method:** the real route handlers were imported and called directly (`NextRequest` in, `Response` out). Only `@/lib/supabase/server` was replaced, via a test-only tsconfig path, with a service-role client whose `auth.getUser()` returns a chosen real user id. Role checks read the real `profiles` row; writes use the real `adminClient`. **Limit:** RLS is not exercised on the routes' user-client reads (the stub is service-role). The task's writes all go through `adminClient` after the role check by design, and migration 177 left the RLS policies unchanged.

Unauthenticated HTTP against the running dev server was also checked: `/programme/kickoff` → 401, `/programme/note` → 401, status report → 401. `/programme/phases/1/note` returned a Next 404 page when signed out, as do the untouched siblings `/phases/1/members` and `/deliverables/x`. That is pre-existing dev behaviour for unauthenticated nested API paths, not task 455; the same route returns 401 when invoked directly (T01).

| # | Check | Result |
|---|---|---|
| T01 | Phase note, signed out → 401 | PASS |
| T02 | Phase note, developer → 403 | PASS |
| T03 | Project note, developer → 403 | PASS |
| T04 | Kickoff, developer → 403 | PASS |
| T05 | Kickoff, marketing → 403 | SKIPPED: no `marketing` user exists (covered by `note-rules` check) |
| T06 | Phase note, 1,001 chars → 400 | PASS |
| T07 | Project note, 1,001 chars → 400 | PASS |
| T08 | Phase note, unknown phase → 404 | PASS |
| T09 | Kickoff, future date → 400 "Kickoff date cannot be in the future" | PASS |
| T10 | Kickoff, impossible date (2026-02-30) → 400 | PASS |
| T11 | Phase note as **pm** → 200; trimmed; `delay_note_updated_by` = pm; `_at` set; response `updatedBy` = pm's name | PASS |
| T12 | Phase-note write leaves `wizard_data` untouched | PASS |
| T13 | Phase note as marketing → 200 | SKIPPED: no `marketing` user exists (covered by `note-rules` check) |
| T14 | Project note as **pm** → 200; audit = pm | PASS |
| T15 | DB constraint `projects_delay_note_length` rejects 1,001 chars | PASS |
| T16 | Kickoff as **pm** → 200; stored `2026-07-10T12:00:00+00:00` | PASS |
| T17 | Kickoff re-derives phase dates (Phase 1 `start_date` = 2026-07-10) | PASS |
| T18 | Kickoff leaves phase `status` / `actual_start_date` unchanged | PASS |
| T19 | Status report as pm: `canEditNotes` and `canEditKickoff` true | PASS |
| T20 | Status report `projectNote` has text, author name and date | PASS |
| T21 | Status report phase note has `delayNoteUpdatedBy` + `delayNoteUpdatedAt` | PASS |
| T22 | Status report Day N follows the new kickoff (99 = 99) | PASS |
| T23 | Status report as developer: both flags false | PASS |
| T24 | Whitespace note clears to `null` (response `updatedBy` null) | PASS |
| T25 | Phase tagging as pm still 403 (route roles unchanged) | PASS |
| T26 | Phase tagging (admin) on a **started** programme: Phase 2 becomes active, **`programme_started_at` unchanged** | PASS |

## Browser UI walkthrough (U01–U09)

Chrome (Claude in Chrome), user's own session (**Super Admin**), `http://localhost:3001`, test project only. A hydration warning about `fdprocessedid` attributes was present on every page; those are injected by a browser extension, so it is unrelated to this task.

| # | Check | Result |
|---|---|---|
| U01 | Timeline shows the notes bar under the action row: **Kickoff** (Jul 17, 2026 · Day 92/120 · 28d left, edit pencil), **Project note**, **Onboard note** (existing "Testing only") | PASS |
| U02 | Overdue project with no note shows the red dashed **Add reason** button | PASS |
| U03 | Project-note editor: textarea, save/cancel buttons, live **43/1000** counter; save shows the note + "— Danessa helpdesk@webriq.us, Oct 16" | PASS |
| U04 | Kickoff editor: date input pre-filled (17/07/2026), helper text "Moves Day N and phase due dates. Phase status is unchanged."; save button shows a spinner while saving | PASS |
| U05 | Saving kickoff 2026-07-10 → **Jul 10, 2026 · Day 99/120 · 21d left**; the Phase 1 reminder also updates to "Day 99"; the timeline grid re-renders | PASS |
| U06 | Status Summary drawer: header Day 99/120 · 21 days left; **Project note** card with author above the phase cards; phase-note pencils always visible | PASS |
| U07 | Status Report collapsed row shows the note hint ("[task 455 UI test] Client slow on approvals") and "21d left" | PASS |
| U08 | Expanded row: **Project note** card above the phase table; pencils always visible (not hover-only) | PASS |
| U09 | Edit the Onboard phase note in the Status Report → saves and shows "— Danessa helpdesk@webriq.us, Oct 16" | PASS |

Not exercised in the UI: the inline save-error message (would need a forced server failure; the error path is covered by the API's 400/403/503 responses), and the phase-level "Add reason". The test project's only overdue phase already had a note; the same `DelayNoteEditor` branch rendered for the project note in U02.

After the walkthrough, ABC Test Company was restored again: **RESTORE OK** (start `2026-07-17T03:49:38.814+00:00`, project note null, Onboard note "Testing only", all phase and deliverable dates matching the snapshot).

## Acceptance criteria

| Criterion | Status |
|---|---|
| Dry run plans the 10 re-baselines, skips the 2 matching ones, lists Maxton / Grand River / Greydog duplicate | PASS |
| After apply, Day N = (today − kickoff) + 1 | PASS (via the kickoff route on the test project, T16/T22). `apply.sql` itself is operator-run and not applied. |
| After apply, phase/deliverable dates match `rematerialiseProgrammeDates()`; a second dry run shows 0 changes | PARTIAL: same function proven via T17; the post-apply re-run waits for the operator |
| `rollback.sql` restores pre-apply values | NOT RUN: `apply.sql` not applied (operator step) |
| Phase tagging a started project doesn't change the kickoff | PASS (T26) |
| Kickoff editor updates Day N / phase dates; developer/hr can't | PASS (API: T04, T16–T18, T22, T23; UI: U04, U05) |
| pm can add/edit/clear phase + project notes; developer/hr read-only | PASS (API: T02, T03, T11, T14, T24). Per D5, pm is not membership-gated. |
| pm still cannot write `wizard_data`/`override_note` | PASS (T12; RLS policy unchanged in migration 177) |
| Notes show author + date; "Add reason" on overdue; inline error on failed save | PASS: author/date (T20/T21, U03, U09), Add reason (U02); inline error not forced in the UI |
| Project note visible in Status Report (collapsed + detail), drawer, Timeline | PASS (U01, U03, U06, U07, U08) |
| Pages still work pre-migration; project-note save returns "pending migration" | NOT RUN: the user applied 177 before testing. The fallback paths are code-reviewed only. |

## Not run / follow-ups

- **Pre-migration fallback** (42703 paths): not testable now that migration 177 is applied; code-reviewed only.
- **Production rollout steps** (`apply.sql` / `rollback.sql`, post-apply dry run shows 0 changes): operator steps, not run.
- **Notes from the user's own admin account show no name:** that profile has no `full_name`, so its notes show only the date.
- **No `marketing` users exist:** T05/T13 are covered only by the pure `note-rules` checks.
