# 429: Programme-Engine Cutover — Move the StackShift Timeline, APIs and Crons Onto `project_phases`/`project_deliverables`

**Created:** 2026-10-05
**Priority:** MEDIUM
**Type:** refactor / cutover (largest task; may split by group)
**Recommended Tier:** deep
**Status:** Planned — detailed plan written and signed off 2026-10-05; ready to implement from WP1
**Depends on:** 428 applied and verified
**Parent:** task 423 (approved design: `_docs/task/423-unify-phases-deliverables-investigation.md`)

---

## Overview

Step 3 of the approved plan (groups A–D of the 423 inventory): switch every programme-engine reader and writer from `customer_phases`/`customer_deliverables` to the unified tables in **one coordinated change** (no dual-write). `customer_*` become frozen read-only snapshots until task 431. Behaviour must not change — this swaps the data source, not the visuals.

## Requirements

- [ ] **Group A — programme APIs** (`src/app/api/projects/[projectId]/programme/**`: `route`, `start`, `phase`, `generic-phase`, `complete-phase`, `wizard-data`, `deliverables/[key]` + `/schedule`, `internal-deliverables/[key]`, `phases/[n]/note`, `phases/[n]/members`) read/write `project_phases`/`project_deliverables`/`phase_programme_state`. `complete-phase` keeps its domain side effects (Phase 1 handover of project visibility, contacts creation via `adminClient`, Cliq notifications, auto-advance) — they stay in the API layer keyed on `source='programme'`.
- [ ] **Group B — onboarding/portfolio + crons:** `api/onboarding/projects` (+ `status-report`, `qstash-start`), `scheduled-autostart`, `programme/reminders`, `stackshift-orders/[orderId]/convert`.
- [ ] **Group C — `lib/programme/*` + config:** `seed.ts` (writes unified rows; `seedPhase2to5Links` becomes part of the single seed — no more second set of rows), `seed-custom-phases.ts`, `phase-plan-draft.ts`, `phase-membership.ts`, `status-report.ts`, `lib/stackshift-orders/*`.
- [ ] **Group D — UI:** Timeline loader (`_load-detail-data.ts`) produces one data shape for both engines; `_onboarding-detail.tsx`/`_swimlane.tsx` and the generic view read it; listing (`_v2-listing/*`), dashboards (`pm-dashboard.tsx`, `_use-active-phase.ts`), `customers/[id]/_programme-tab.tsx`, project header, New Project intake. Deliverable cards use **task-derived progress when the linked deliverable has tasks**, else the manual status (resolves audit U15).
- [ ] **Realtime:** the existing `customer_*` channel becomes `project_phases`/`project_deliverables` (publication membership verified after 424/427).
- [ ] Keep `phase_number` as the stable key for `phase_members`, `customer_assets`, reminders `notification_key`; add `phase_id` lookups where convenient.
- [ ] First step: read every file in the inventory and classify read vs write (the 423 grep counts are estimates); record the list in Implementation Notes.
- [ ] Writes to `customer_*` are removed everywhere (grep proves it); a guard (trigger or revoked privilege, on the branch first) makes accidental writes fail loudly.

## Out of Scope

- Merging the two swimlane *components* visually (separate polish task); Tasks-tab/MCP renames (430); dropping `customer_*` (431).

## Acceptance Criteria

- [ ] Parity check on all 29 programme projects: phase statuses, active phase, every deliverable's status and displayed dates identical before/after (scripted comparison).
- [ ] End-to-end on a test programme project: Start, Jump to phase, complete Phase 1 (side effects fire), schedule drag/keyboard nudge, wizard save, member add/remove, reminder cron dry-run, StackShift order convert.
- [ ] Generic projects' Timeline/Milestones/Tasks unchanged.
- [ ] No reference to `customer_phases`/`customer_deliverables` remains outside migrations/rollbacks and the frozen-snapshot guard.
- [ ] `tsc`/lint clean.

## Rollback

Revert the app deploy (reads/writes return to `customer_*`, which are still intact and frozen at cutover time — any programme edits made after cutover would need replaying, so keep the window short and announce it).

## Risks

RLS regressions (marketing vs PM write boundaries) — run the 427 policy tests against the real API paths; large diff — split into one PR per group if needed, but all merged before the cutover deploy.


## Added from the task-427 spike (2026-10-05)
- **Realtime subscriptions must be renamed to the real tables** (`project_phases`, `project_deliverables`, and `tasks` unchanged): compat views cannot be published, and a channel with a single non-published binding fails **entirely**. This covers the StackShift `v2_onboarding_*` channel and task 422's `useGenericRealtime` (currently `milestones`/`tasklists`).
- `src/types/database.ts` needs the new table shapes (preview: `_docs/task/427-spike/types-preview.txt`); keep `milestones`/`tasklists` type aliases pointing at the new **table** Row types, not the all-nullable view types.
- Programme-tagged rows are writable only by admin/super_admin/marketing under the 427 RLS (pending decision D1 in task 427) — the programme APIs already use that role set.


---

# Detailed Plan (2026-10-05, after tasks 424–428)

## 1. Verified inventory (replaces the grep estimate; classified by reading each `.from(...)` chain)

**Only `customer_phases` and `customer_deliverables` are being replaced.** `phase_members` (keyed by project + `phase_number`, all Phase 1) and `onboarding_internal_deliverables` (Phase 1 checklist, keyed by project + `deliverable_key`) keep their tables and are **not** touched by this task.

| Group | File | customer_phases | customer_deliverables | Notes |
|---|---|---|---|---|
| **Reads** | `api/projects/[pid]/programme/route.ts` (GET) | R | R | also reads `onboarding_internal_deliverables`; contains the read-side `seedPhase2to5Links` backfill (delete) |
| | `api/projects/[pid]/programme/start/route.ts` | R | R | calls the seed |
| | `api/onboarding/projects/route.ts` | R | — | listing + `POST` creates projects (seed) |
| | `api/onboarding/projects/status-report/route.ts` + `lib/programme/status-report.ts` | R | R | computes from reference days, never compresses (pre-existing approximation) |
| | `api/programme/reminders/route.ts` (cron) | R | R | scales reference days; never skip-compressed |
| | `(hub)/projects/_v2-listing/_load-list-data.ts` | R | — | listing cards (active phase, day) |
| | `(hub)/dashboard/_components/pm-dashboard.tsx` | — | R | + `onboarding_internal_deliverables` |
| | `(hub)/stackshift-orders/[orderId]/page.tsx` | R | — | |
| **Writes** | `…/programme/complete-phase/route.ts` | **W update** | — | Phase 1 hand-over side effects (visibility, contacts via `adminClient`, Cliq) stay in the route |
| | `…/programme/phase/route.ts` (Jump to phase) | **W update** | R | re-statuses + backdates `programme_started_at` (dates must be re-materialised, see D-B) |
| | `…/programme/phases/[n]/note/route.ts` | **W update** | — | delay note → `phase_programme_state` |
| | `…/programme/wizard-data/route.ts` | **W update** | — | wizard data → `phase_programme_state` |
| | `…/programme/deliverables/[key]/route.ts` | — | **W update** | manual deliverable status |
| | `…/programme/deliverables/[key]/schedule/route.ts` | R | **W update** | drag/nudge; bound check (task 432) |
| | `…/programme/internal-deliverables/[key]/route.ts` | — | **W update** | + upserts the checklist table (unchanged) |
| | `lib/programme/seed.ts` | **W insert** | **W insert** | also `phase_members`, `onboarding_internal_deliverables`, and **`seedPhase2to5Links` writes milestones/tasklists** — becomes one seed |
| **Unaffected direct users** | `phase-membership.ts`, `lib/users/deactivate.ts`, `…/phases/[n]/members/route.ts`, `_load-detail-data.ts` (members only) | | | `phase_members` stays |
| **Indirect (row types / realtime string / embeds)** | `_onboarding-detail.tsx` (realtime channel on both tables), `_swimlane.tsx`, `_deliverable-card(.popovers).tsx`, `_timeline-stats.ts`, `_use-programme-progress.ts`, `_onboarding-wizard.tsx`, `_use-active-phase.ts`, `customers/[id]/_programme-tab.tsx`, `config/customer-phases.ts` (resolvers/embeds), `_onboarding-list.tsx`, `new/_new-project-types.ts`, `stackshift-orders/service-map.ts` | | | ~15 files; mostly type changes |
| **Generic engine (milestones/tasklists)** | 25 files read, 9 write (3 are the frozen Zoho routes) | | | **Keep working through the compat views (verified incl. `ON CONFLICT` upserts)** → task 430 is cleanup, not a blocker. Remaining writers: `generic-phase` route, `v2/milestones/[id]`, `v2/projects/[pid]/{milestones,tasklists}`, `seed-custom-phases.ts`, `seed.ts` |

**Size:** 16 direct files (8 write), ~15 indirect, plus the generic Timeline hook (already moved to the real table names).

## 2. Design decisions (recommendations; need the user's sign-off)

- **D-A Data access layer.** One server-side module `src/lib/programme/store.ts` (load a project's programme from the unified tables; save phase/deliverable/state changes) used by every route above, instead of 16 files each hand-writing queries. Types for the unified rows come from `database.ts` (new shapes: `_docs/task/427-spike/types-preview.txt`). No adapter that fakes the old `CustomerPhaseRow` shape: its scheduling fields (`day_*_override`, compressed scale) don't map back losslessly (display-scale rounding at non-120 durations), so the UI consumes the new shape.
- **D-B Stored days are the source of truth; dates are derived.** The unified rows hold **display-scale** `day_start`/`day_end` (what the Timeline renders and drag/nudge edits write, with no scale conversion), and `start_date`/`due_date` are materialised from `programme_started_at` + those days. Whenever `programme_started_at` changes (Jump to phase backdates it, Start sets it) the dates of all programme rows of that project are **re-materialised in the same transaction** (`materialiseProgrammeDates`). Consequence: the Timeline stops running the 4-scale pipeline for stored data — `compressPhases`/`referenceSpansOf` are only needed to *seed* (config → days) and the backfill; the skip/duration/override ambiguities (tasks 425/432) disappear for reads. The status report and reminders cron get the same, now skip-correct, days.
- **D-C Status vocabulary in the UI.** `planned | active | completed | skipped | bypassed`; helpers map to the existing badge/progress logic (`isComplete` = last non-skipped phase `completed`, active = the one `active`).
- **D-D Realtime.** The StackShift channel subscribes to `project_phases` + `project_deliverables` (project filter) — not the compat views; `phase_programme_state` changes are not subscribed (wizard data is edited in one place).
- **D-E Permissions.** Programme structure/status/schedule writes use the signed-in user's session and RLS (`source='programme'` ⇒ admin/super_admin/marketing, same set as today's `WRITE_ROLES`); `phase_programme_state` writes the same; PMs read. `complete-phase` keeps `adminClient` only for its existing contact-creation side effect.
- **D-F Seed.** `seed.ts` writes unified rows + `phase_programme_state` directly (replacing the `customer_*` inserts **and** `seedPhase2to5Links`, so the duplicate milestone/tasklist rows stop being created); custom phases (`seed-custom-phases.ts`, non-StackShift-I engines) keep writing `milestones`/`tasklists` through the compat views until task 430 renames them.
- **D-G Engine flag.** `projects.uses_customer_phases_engine` stays for UI selection (wizard/programme experience vs generic view); both now read `project_phases`.
- **D-H Cutover.** Single coordinated deploy (decision from 423): (1) re-run the backfill dry-run + SQL immediately before (idempotent, brings unified rows current); (2) deploy; (3) parity check; (4) freeze `customer_*` (a trigger that raises on write — drafted in task 431's prep, applied only after parity is confirmed). Rollback = revert the deploy; `customer_*` are untouched and frozen at the cutover snapshot (edits made after the deploy would need replaying — keep the window short).

## 3. Work packages (all merged before the one deploy; each reviewable on its own)
1. **WP1 — foundations:** `database.ts` types (new tables; `milestones`/`tasklists` aliases to the *table* Rows), `store.ts`, pure mappers (status maps, row shapes) + checks, `materialiseProgrammeDates` + checks (reuses the 425 calendar). *No behaviour change.*
2. **WP2 — seed:** rewrite `seed.ts` (one seed, no `seedPhase2to5Links`), `start` route, onboarding project create / scheduled-autostart / qstash-start / stackshift-order convert paths.
3. **WP3 — reads:** `programme` GET, status-report route + lib, reminders cron, listing loader, PM dashboard, order page, `_use-active-phase`, customers programme tab.
4. **WP4 — writes:** complete-phase, phase (Jump), note, wizard-data, deliverable status, schedule (incl. the 432 bound → now plain display-day bound), internal-deliverables, generic-phase.
5. **WP5 — UI:** `_load-detail-data`, `_onboarding-detail` (+ swimlane/card/popovers/stats/progress/wizard) consuming the new shape, StackShift realtime channel on the real tables, pipeline calls removed from the render path.
6. **WP6 — cutover tooling:** golden-snapshot script (capture each programme project's rendered numbers *before* the deploy: phase windows, statuses, active phase, day, deliverable windows/status; compare after), the cutover runbook, the freeze trigger.

## 4. Verification strategy
- **Golden parity:** a script (like task 425's `legacy-vs-calendar.ts`) that, for all 29 programme projects, compares what the *current* API/UI computes with what the new store returns — phase status/active phase/day/windows/deliverable windows+status. Any non-zero diff blocks the deploy (the known intentional diffs: Baoase and the deleted test project after task 432).
- **Local rehearsal** on the disposable DB (the 427/428 harness): snapshot → backfill → run the app against the local stack for a project of each shape (default, permanent skip, custom duration, not started, completed) incl. Start, Jump, complete-phase, drag/nudge, wizard save, member add.
- **Role matrix** through the real API paths (marketing writes; pm denied on programme rows with a readable message; developer read-only).
- **Realtime:** two-window check on the StackShift Timeline (after the warm-up delay noted in task 424).

## 5. Open decisions for the user
1. D-B: stored display-scale days as the truth + derived dates (recommended) vs keeping the compressed-override model.
2. After cutover, may PMs still *see* programme phases in the Milestones/Tasks tabs as read-only (current plan), or should those rows be hidden there too?
3. Should the freeze trigger on `customer_*` be applied at cutover (recommended, after parity) or only at task 431?


## 6. Decisions (user, 2026-10-05)
1. **D-B approved:** stored display-scale days are the source of truth; dates are derived and re-materialised whenever `programme_started_at` changes.
2. **PM visibility approved:** programme phases/deliverables stay **visible but read-only** in the Milestones/Tasks tabs (clearly marked programme-owned; PMs keep editing the tasks inside them; Phase 1 stays hidden from those tabs). Implementation note: the UI must show an explicit read-only state instead of a generic permission error (see also task 430).
3. **Freeze trigger approved:** applied at cutover, **after** the parity check passes (drafted as a migration in WP6; dropped again on rollback).
All other design decisions (D-A, D-C…D-H) stand as recommended.


---

# WP1 — foundations: DONE (2026-10-05) — no behaviour change; nothing in the running app uses the new code yet

## What was added
- **`src/types/database.ts`:** `project_phases`, `project_deliverables`, `phase_programme_state` table types (Row/Insert/Update/Relationships, `status`/`source` as literal unions) + `ProjectPhaseRow` / `ProjectDeliverableRow` / `PhaseProgrammeStateRow` exports. The existing `milestones`/`tasklists` entries are unchanged (they describe the compat views for legacy code).
- **`src/lib/programme/programme-status.ts`:** pure status helpers over unified rows — `inProgrammeOrder`, `activePhase`, `isProgrammeComplete` (last phase completed — the pre-unification rule), `countedPhases` (permanent skips excluded), `isPermanentlySkipped`.
- **`src/lib/programme/programme-dates.ts`:** `materialiseDates` — pure; derives `start_date`/`due_date` from stored display-scale `day_start`/`day_end` + `programme_started_at` (decision D-B), returns only rows whose dates change, no dates for permanently skipped phases or their deliverables, clears dates when not started.
- **`src/lib/programme/store.ts`:** the data-access module (decision D-A) — `loadProgramme(client, projectId)` (programme phases + state + ordered deliverables; pure `assembleProgramme` is exported for tests) and `rematerialiseProgrammeDates(client, projectId, startedAt)`. The client is a parameter (user session ⇒ RLS; `adminClient` only for session-less paths). WP3/WP4 extend it as routes are converted.
- **`calendar.ts`:** new `displayDayToYmd` (shared by the backfill planner and the runtime so the two can't diverge); `backfill-plan.ts` now uses it.

## Verification
- `npx tsc --noEmit` and eslint (incl. `_docs/task/429-wp1`) clean; **`pnpm check:logic` 63/63** (10 new `programme` checks: status rules, order, completion, the Day-1 = start-date arithmetic, idempotent second pass, Jump-style start-date shift, skipped vs bypassed dates, not-started, missing offsets, store assembly; the 15 backfill checks still pass after the formatter change).
- **Integration on the local disposable DB with the backfilled live copy** (`_docs/task/429-wp1/store-integration.ts`, refuses non-local targets): `loadProgramme` for Hello Homes → P1 bypassed (7 deliverables), P2 active (7), P3 (5), P4 (4), P5 (4), 5 state rows, active = Phase 2, not complete; `rematerialiseProgrammeDates` with the same start date → **0 rows changed**; with the start 10 days earlier (a Jump-style backdate) → **32 rows changed**, Phase 2 moves Aug 21–Sep 4 → Aug 11–25; restoring → 32 changed, a second restore → 0.
- The live database was not touched.

## Next
WP2 — seed (`seed.ts` rewrite, `start` route, project-create / scheduled-autostart / qstash-start / stackshift-order convert) using `store.ts` + `materialiseDates`.


---

# WP2 — seed: DONE (2026-10-05) — behaviour change, but NOT deployable on its own (it ships only in the single cutover deploy)

## What changed (`src/lib/programme/seed.ts`)
- **One seed.** `seedAndStartProgramme` and `seedProgrammeAtPhase` keep their signatures, status cascade, plan-override logic, members, Cliq message and the internal-checklist seeding — but the rows they used to insert into `customer_phases` / `customer_deliverables` are now fed through the **same planner the task-428 backfill uses** (`planBackfill`, with no existing rows) via the new internal `insertUnifiedProgramme`. The planner resolves names/owners/statuses, **display-scale** `day_start`/`day_end` and derived `start_date`/`due_date`; the result is written to `project_phases` → (`phase_programme_state` ‖ `project_deliverables` ‖ `onboarding_internal_deliverables`). A freshly seeded project and a backfilled one are therefore identical by construction.
- **Duplicate rows gone.** `seedAndStartProgramme` no longer calls `seedPhase2to5Links` (a Phase 2–5 deliverable *is* the tasklist now). The function stays exported only because `GET …/programme` still calls its read-side backfill until WP3 deletes both.
- **Status vocabulary.** Phases bypassed by a time-based start-at-phase/Jump are `bypassed` (was `skipped`); only `draft_skip_phase_numbers` phases are `skipped` (no dates, no deliverables) — the split decided in task 423.
- Callers (`start` route, project create, scheduled-autostart, qstash-start, stackshift-order convert, CSV import via `seedProgrammeAtPhase`) are unchanged. Generic-engine seeding (`seed-custom-phases.ts`) is untouched.

## Verification
- `tsc`, eslint clean; `pnpm check:logic` 63/63 (the planner's own checks cover the shared logic).
- **End-to-end on the local disposable DB with the REAL seed functions** (`_docs/task/429-wp2/seed-integration.ts`; refuses non-local targets; run without `.env`, so Cliq is not configured and stays silent). Five scenarios, all passing:
  - **A start at Phase 1 (120 days):** P1 active Oct 5–19 (Day 1 = start date), P2–P5 planned; 27 deliverables (7/7/5/4/4); `kickoff` `in_progress`; Phase 1 `day_end` 15.
  - **B permanent skip [1]:** P1 `skipped` — no dates, no deliverables; P2 active from Day 1 (skip-compressed).
  - **C start at Phase 3 with a start date 30 days ago + note:** P1, P2 `bypassed` (with dates), P3 active starting today, `is_manual_override` + `override_note` in `phase_programme_state`.
  - **D 60-day programme:** Phase 2 stored as display days 8–15.
  - **E custom phase 6 after Phase 5:** 6 phases, the custom phase and its deliverable seeded with their own names/number.
  - **Invariants in every scenario:** ≤ 1 active phase; every phase has its state row; `source='programme'` and scoped `external_id`s; no duplicate `(phase, key)`; the internal checklist seeded; `rematerialiseProgrammeDates` changes **0** rows (dates already consistent); **nothing written to `customer_phases`**; no duplicate milestone rows; the legacy `milestones` view shows 4 of the 5 phases (Phase 1 hidden).
- The live database was not touched.

## Notes
- Because the old read paths still query `customer_*`, WP2 must not be deployed before WP3–WP5 — all work packages merge before the one cutover deploy (decision D-H).
- Remaining writers of the old tables after WP2: only the already-started branches of the programme routes (WP4) and `phase`/`complete-phase`/`note`/`wizard-data`/deliverable routes.

## Next
WP3 — reads: `programme` GET (+ delete the read-side `seedPhase2to5Links` backfill), `start` route, status-report route + lib, reminders cron, listing loader, PM dashboard, order page, `_use-active-phase`, customers programme tab.

---

# WP3 — reads (server side): DONE (2026-10-05) — UI consumers deferred to WP5; NOT deployable on its own

## What changed
- **`store.ts`** gained `loadProgrammeSummaries(client, projectIds)` — a paginated (`.range` + stable `.order`, ID-chunked `.in()`) multi-project read returning, per project, programme-order `PhaseSummary[]` (state `delay_note` folded in) and slim `DeliverableSummary[]`. Used by every portfolio-style reader below.
- **`GET …/programme`** now returns the unified shape: `phases` (unified row + `state`), `deliverables` (flat unified rows, each with its own `id`/`phase_id`), `internal_deliverables`. `phase_tasklists` and the read-side `seedPhase2to5Links` self-heal are **deleted** (a programme deliverable is the tasklist). **`POST …/programme/start`** returns the same shape after seeding.
- **Status report** (`lib/programme/status-report.ts` + route): `CustomerPhaseRow` → `StatusPhaseRow` (unified columns). Days are the stored **display-scale, skip-compressed** values, so `totalProgrammeDays`, allotted days and overdue now respect permanent skips and the duration scale (identical for default 120-day projects). `bypassed` reports as `skipped`, as before.
- **Reminders cron:** reads the unified tables; phase-late checks use stored display `day_end`; Phase 1 deliverable due/overdue use the stored `day_end` (static fallback if null); `bypassed` is treated like `skipped`.
- **Listing loader, `GET /api/onboarding/projects`, StackShift order page, PM dashboard** read `project_phases`/`project_deliverables` (programme rows). Order page bug fixed in passing: it compared old `customer_phases` statuses to `in_progress`/`pending` (never matched); it now uses `active`/`planned`.

## Verification
- `tsc` clean, eslint clean on every touched path, `pnpm check:logic` 63/63.
- **Not yet verified against a database:** the local disposable stack was not running, so these query paths are only type-checked (the generated `Database` types cover the unified tables). Live-shaped verification happens in WP6's golden parity script (old reads vs new reads per project) and the pre-cutover local run.

## Remaining read consumers (WP5 — they parse the *client-side* shape)
`_onboarding-detail.tsx`, `_use-programme-progress.ts`, `_use-active-phase.ts`, `_programme-tab.tsx` (customers), `_use-generic-realtime`-adjacent hooks — they still expect legacy `customer_*` row shapes from `GET …/programme` and are rewritten in WP5. Until then the Timeline UI is knowingly inconsistent with the API; all WPs merge before the single cutover deploy (D-H).

## Next
WP4 — writes: `phase`, `complete-phase`, `wizard-data`, `phases/[n]/note`, `deliverables/[key]` (+ `schedule`), `internal-deliverables` routes onto the store/unified tables.

---

# WP4 — writes: DONE (2026-10-05) — NOT deployable on its own

## What changed
`store.ts` gained `getProgrammePhase`, `getProgrammeDeliverable` (resolved via phase + `deliverable_key`) and `upsertPhaseState`. After this WP **no server code writes `customer_phases` / `customer_deliverables`** (grep: only the Timeline's client-side realtime subscriptions remain — WP5).
- **`phases/[n]/note`** → `phase_programme_state.delay_note` (upsert).
- **`wizard-data`** → merges into `phase_programme_state.wizard_data` of Phase 1 (404 if the project has no Phase 1 row).
- **`deliverables/[key]`** → `project_deliverables.status`/`completed_at`; the done-notification now uses the row's own `name`.
- **`deliverables/[key]/schedule`** → body days are now **display-scale** (what the Timeline shows) and stored as-is; the bound is the owning phase's stored `day_start/day_end`; `start_date`/`due_date` are re-derived from `programme_started_at`. The task-432 compress/scale bound logic is gone (the stored scale *is* the display scale — decision D-B). **WP5 contract:** the drag hook must send display days, no un-scaling.
- **`internal-deliverables/[key]`** → the derived Phase 1 parent status is written to `project_deliverables`.
- **`complete-phase`** → reads/writes `project_phases`; the "next phase" is the next phase in `position` order that is **not permanently skipped** (the old code could activate a `skipped` phase); wizard contacts hand-off reads `phase_programme_state`.
- **`phase` (Jump)** → cascade rewritten: target `active` (+ state `is_manual_override`/note), earlier phases `bypassed`, later ones `planned` (override reset), permanently skipped (this call's skip list ∪ rows already `skipped`) stay `skipped`; completed phases untouched. Non-targets are written **before** the target (one-active-phase unique index). After backdating `programme_started_at` it calls `rematerialiseProgrammeDates` so every row's dates follow.
- `generic-phase` is untouched on purpose: it writes the generic-model plan through the compat views `milestones`/`tasklists`, which stay until task 431.

## Verification
`tsc` + eslint clean, `pnpm check:logic` 63/63. Like WP3, not yet exercised against a database (local stack down) — covered by the WP6 parity script and the pre-cutover local run.

## Next
WP5 — UI + realtime: Timeline detail/hooks onto the new API shape and `project_phases`/`project_deliverables` subscriptions; drag sends display days; remove the client-side compression/scale pipeline.

---

# WP5 — UI + realtime: DONE (2026-10-05) — NOT deployable on its own

## What changed
- **`src/lib/programme/view-model.ts` (new, pure):** `ProgrammePhaseRow` (unified phase + flattened state columns `wizard_data`/`is_manual_override`/`override_note`/`delay_note`), `ProgrammeDeliverableRow` (unified row + `phase_number`), `toWire()` (server flattening, used by `GET …/programme`, `start`, `phase`, `complete-phase`), `uiPhaseStatus()` (planned→not_started, bypassed→skipped — the legacy vocabulary the Swimlane/toolbar speak) and `buildDisplayPhases()` which builds render-ready `PhaseConfig`s straight from the stored **display-scale** days.
- **Timeline (`_onboarding-detail.tsx`):** the whole reference → compressed → display pipeline (`resolveEffectivePhase`, `ProgrammeCalendar.compressPhases/toDisplayPhases`, `gridDays`) is replaced by `buildDisplayPhases`; the grid length is the last planned display day excluding permanently skipped phases. `handleScheduleChange` sends/stores display days with no conversion. Realtime now subscribes to `project_phases` / `project_deliverables` (programme rows only; payloads merge over the held row so flattened state survives; a new deliverable's `phase_number` is derived from its phase). Deliverable cards deep-link with the deliverable row's own `id` (it *is* the tasklist) — `phase_tasklists` state is gone.
- **`_timeline-reminders.tsx`:** takes display-scale phases directly (no compressed→display conversion — that would have double-scaled).
- **Overview card (`_use-programme-progress.ts`), header pill (`_use-active-phase.ts`), customer Programme tab:** read the new shape; the header pill now shows custom phase names too (the row carries its own name).
- **Wizard:** `deliverables`/`onDeliverableChange` retyped (the API returns the bare row; callers merge it over the row they hold).
- **Checks:** `view-model.check.ts` (+4) → `pnpm check:logic` 67/67.

## Verification
`tsc` clean; eslint clean on every touched file (3 pre-existing unused-import warnings remain in untouched workspace files). **Browser acceptance not run yet** — the dev UI will not work end-to-end until the unified tables are backfilled in whatever DB it points at; the cutover rehearsal (WP6) covers it against the local backfilled copy.

## Next
WP6 — golden parity script (old vs new reads per project), cutover runbook (re-run backfill dry-run + SQL, deploy order), and the freeze-trigger migration for the legacy tables.

---

# WP6 — cutover tooling: DONE (2026-10-05) — rehearsed on a fresh local copy of live data

## Deliverables (`_docs/task/429-wp6/`)
- **`parity.ts`** — read-only golden check: old pipeline (`resolveEffectivePhase` + calendar compress/scale from `customer_*`) vs new path (`loadProgramme` + `toWire` + `buildDisplayPhases` from the unified tables) per project: phase order, active phase, programme-complete, per-phase status (old `skipped` accepts `skipped|bypassed`), actual dates, wizard data, delay/override notes, phase + deliverable windows, names/owners, deliverable keys and statuses. Writes the git-ignored `out/parity.json`; exits non-zero on any unexpected diff.
- **`cutover-runbook.md`** — ordered operator steps, smoke-test list, rollback paths.
- **`162_freeze_customer_phases_deliverables.sql`** (+ `supabase/rollbacks/162_…_down.sql`) — BEFORE INSERT/UPDATE triggers that raise on `customer_phases`/`customer_deliverables`. DELETE stays allowed (project/customer `ON DELETE CASCADE` must keep working). Deliberately kept **outside** `supabase/migrations/` so a routine `supabase db push` before the cutover cannot apply it.
- **`429-wp3/reads-integration.ts`** — exercises the new read queries (summaries loader, status-report breakdown, dashboard embedded join) against the local DB.

## Rehearsal (disposable local Postgres, fresh `db reset` of all 161 migrations + a fresh read-only snapshot of live: 146/751/695/1,571 rows)
- Backfill dry run → applied the generated SQL (committed; all drift/reconcile guards passed) → **parity: 29 projects, 3,517 fields, 0 unexpected diffs.**
- Against live *before* the backfill the same script reports 2,773 diffs (legacy-tagged rows) — i.e. it correctly refuses to bless an un-backfilled database.
- Known, reported-not-failed: 3 projects with a permanent skip + stored overrides (task 432: windows differ by design), and 2 phases with **no** `customer_deliverables` rows (the old UI showed static phantom cards on them; they are jumped-past phases that render as skipped, so nothing user-visible is lost).
- Reads integration: 29 projects with programmes, all with an active phase, 751 deliverables; dashboard join returns programme rows.
- Freeze: UPDATE/INSERT on `customer_*` rejected with the explanatory error; deleting a project (cascade) still works; the down script restores writes.

## Not verified (honest gaps)
- The programme **write routes** (WP4) and the Timeline UI (WP5) have not been exercised against a running app — only type-checked + the pure checks. Cutover step 5 (browser smoke test) and a pre-deploy browser acceptance run on the local stack are the remaining gate.
- Concurrent edits during the apply window.

## Status
All six work packages are implemented. Task 429 stays **In Progress** until the browser acceptance run and the live cutover; tasks 430/431 follow.

---

# Browser acceptance (2026-10-05) — local disposable stack, signed in as a local admin

**Setup:** fresh `db reset` + read-only live snapshot + backfill applied (WP6 rehearsal), app on port 3100 with env pointed at the local stack (mail/QStash/push blanked; Cliq is hard-disabled in code), local admin test user (`make-local-user.ts`; the device-verification OTP was seeded locally because mail is blanked). The snapshot omitted `projects.uses_customer_phases_engine` (true for all 29 on live) — set locally for the run; **fix `snapshot-to-local.ts` to include it before reusing**.

**Verified in the browser/DB (project *Hello Homes GR*):**
- Timeline renders from the unified tables: phase pill, Onboard shown as skipped (`bypassed`), Phase 2 D16–30 with the right dates (Aug 21–Sep 4), cards with correct windows, overdue reminders computed from stored display days; card popover shows the right date range; card click deep-links to Tasks with the deliverable row's own id (`?tasklist=<id>` resolved to the task list page).
- **Writes** (same session/handlers, DB checked after): deliverable → done (`completed_at` set); schedule PATCH within the phase window saved and `start_date`/`due_date` re-derived (D17 → Aug 22); out-of-window and unknown-key requests rejected with 400; delay note saved in `phase_programme_state`; **Jump to phase 3** → P3 active from today with `is_manual_override`+note, P1/P2 `bypassed`, `programme_started_at` backdated (Day 1 = Sep 5, Day 31 = today) and every programme row's dates re-derived; **Complete phase 3** → P4 active, header pill/reminder/swimlane updated after reload.
- Overview card (Day 31 of 120, Day 1 Sep 5, 1 phase done) and the Status Report page (22 projects, phase bars, current phase, used/allotted, health) render from the new reads.
- Server log: no errors; the only 4xx were my two deliberate negative tests.

**Not exercised:** Realtime (service excluded locally — the subscription code is type-checked only), drag-to-reschedule via the mouse (the route it calls was exercised directly; the hook now sends display days), Start programme on a draft project (the seed itself was verified end-to-end in WP2), Wizard saves, complete-phase on Phase 1 (contacts hand-off). Cutover smoke-test step 5 should cover these on the deployed app.

Local stack, dev server and temp credentials were removed afterwards.
