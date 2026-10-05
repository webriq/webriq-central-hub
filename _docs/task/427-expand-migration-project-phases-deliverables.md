# 427: Expand Migration — Rename `milestones`/`tasklists` In Place into `project_phases`/`project_deliverables`, Add Programme Columns, Side Table, RLS

**Created:** 2026-10-05
**Priority:** MEDIUM
**Type:** database migration (written-not-applied)
**Recommended Tier:** deep
**Status:** Testing — migrations 159 + 160 APPLIED to the shared database by the operator (2026-10-05); live verification passed; realtime-hook rename done
**Depends on:** 426 (Zoho frozen); spike on a Supabase branch before writing the final SQL
**Parent:** task 423 (approved design: `_docs/task/423-unify-phases-deliverables-investigation.md`)

---

## Overview

Step 1 (expand) of the approved task-423 plan. Rename in place so every UUID, the 3 foreign keys (`tasks.milestone_id`, `tasks.tasklist_id`, `tasklists.milestone_id`), the unique `external_id` constraint and the 7,632 task links survive. **Written, not applied** by the agent (repo convention); the operator applies it after a spike on a database branch/dump — there is no separate dev database.

## Requirements

- [ ] **Spike first (423 Q1):** on a Supabase branch or restored dump, run the rename and record what breaks (policy/index/trigger names, `touch_updated_at`, views, generated types) in Implementation Notes before the final SQL is written.
- [ ] `ALTER TABLE milestones RENAME TO project_phases`; `tasklists` → `project_deliverables`; rename stale constraint/index/policy names.
- [ ] `project_phases` adds: `phase_number smallint null`, `owner_label text`, `actual_start_date date`, `actual_completed_date date`, `source text not null default 'manual' check (source in ('manual','programme','zoho_import'))`; widen `status` check to `planned|active|completed|skipped|bypassed`. Existing `position, name, description, start_date, due_date, day_start, day_end, external_id (unique), created_by, created_at, updated_at` stay.
- [ ] `project_deliverables` adds: `deliverable_key text null`, `phase_id` (= existing `milestone_id` renamed via `ALTER … RENAME COLUMN`), `description`, `owner_label`, `start_date`, `due_date`, `status text default 'pending' check in (pending,in_progress,done)`, `completed_at`, `source` (same check). `is_default`, `day_start/day_end`, `position`, `external_id` stay.
- [ ] Indexes/constraints: `unique (project_id, phase_number) where phase_number is not null`; `unique (project_id, deliverable_key) where deliverable_key is not null`; **partial unique one-active-phase** `unique (project_id) where source='programme' and status='active'` (130 projects have several active milestones, so it cannot be global); `(project_id, position)` and `(phase_id, position)` indexes.
- [ ] `phase_programme_state(phase_id uuid pk references project_phases on delete cascade, wizard_data jsonb not null default '{}', is_manual_override boolean not null default false, override_note text, delay_note text, created_at, updated_at)`.
- [ ] RLS (using `get_my_role()`; never inline): `project_phases`/`project_deliverables` read = admin, super_admin, marketing, pm, developer; write = admin, super_admin, pm for `source <> 'programme'`; admin, super_admin, marketing for `source = 'programme'`. `phase_programme_state` read as above, write admin/super_admin/marketing only. Replaces `milestones_*`/`tasklists_*`/`customer_*` policies *for the new tables* (old `customer_*` policies untouched until 431).
- [ ] **Compat views** `milestones` and `tasklists` (auto-updatable, same column names as before, excluding Phase 1 programme rows so legacy Tasks/Milestones UIs don't change yet); no view for `tasks` (its FK column names stay until 430).
- [ ] Re-add Realtime membership if the rename dropped it (publication follows the table OID — verify in the spike); regenerate `src/types/database.ts` and keep legacy aliases (`MilestoneRow = ProjectPhaseRow`).
- [ ] Rollback script in `supabase/rollbacks/` that restores names, drops added columns/constraints/views/side table (only valid before 428 runs).

## Out of Scope

- Moving data in from `customer_*` (428), changing app code beyond type aliases/compat (429/430), renaming `tasks` columns (430), dropping anything (431).

## Acceptance Criteria

- [ ] On the branch: all existing app flows (Milestones tab CRUD, Tasks tab, generic Timeline, StackShift Timeline) behave identically through the compat views; `tasks` links intact (count unchanged: 7,632).
- [ ] Policy tests with one user per role (admin, super_admin, marketing, pm, developer, client) match the table above; marketing can write a `programme` row and cannot write a `manual` one; pm the reverse.
- [ ] Inserting a second `active` programme phase for a project is rejected; two active `manual` phases are still allowed.
- [ ] `tsc`/lint clean; migration + rollback reviewed by the user before apply.

## Rollback

`supabase/rollbacks/427_…_down.sql` (pre-backfill only). After 428 runs, rollback = restore from the pre-428 backup.

## Open Questions

1. Compat-view filter: hide only Phase 1 programme rows, or all `source='programme'` rows until 430? Default: hide Phase 1 only (matches decision Q6 — Tasks tab must not show task-less Phase 1 deliverables).


---

# Spike Plan (prep, 2026-10-05) — nothing here touches the live database

## Why a spike first
The rename is cheap on paper (only 3 foreign keys), but "what breaks" must be observed on a real Postgres with the real migration history before the final SQL is written. The live database is shared by dev and prod; there is no copy, so the spike needs its own.

## Known objects touching `milestones` / `tasklists` (from migrations 033–159; verify on the spike)

| Object | Source | Rename behaviour to confirm |
|---|---|---|
| `tasks.milestone_id → milestones(id) on delete set null` | 033 | FK follows the table; constraint *name* keeps `tasks_milestone_id_fkey` |
| `tasks.tasklist_id → tasklists(id) on delete set null` | 035 | same |
| `tasklists.milestone_id → milestones(id) on delete set null` | 037 | becomes `project_deliverables.phase_id` via `RENAME COLUMN`; FK follows |
| `milestones.project_id`, `tasklists.project_id → projects(id) on delete cascade` | 033/035 | project-delete cascade keeps working (081 documents the cascade flows) |
| `milestones.external_id text unique` + partial index `milestones_external_id_idx` | 037 | the upsert conflict key the seeds rely on (`onConflict: "external_id"`) |
| `tasklists.external_id text unique` | 035 | same |
| CHECK `milestones.status in (planned,active,completed)` | 033 | must be replaced (adds `skipped`, `bypassed`) |
| CHECK `milestones_day_range_check`, `tasklists_day_range_check` | 107 | names are cosmetic after rename |
| Indexes `milestones_project_id_idx`, `tasklists_project_id_idx`, `tasklists_milestone_id_idx` | 033/035/037 | keep names unless renamed |
| RLS enabled + policies `milestones_staff_read`/`milestones_pm_write`, `tasklists_staff_read`/`tasklists_pm_write` (048 version: read admin/super_admin/pm/developer; write admin/super_admin/pm) | 033/035/048 | policies stay bound to the table OID after rename; names/expressions need rewriting for the unified rules |
| `replica identity full` + Realtime publication | 159 (pending, task 424) | membership follows the table OID; confirm after rename |
| **No** `updated_at` trigger on either table (app sets it) | grep of migrations | decide whether unified tables get one (none today) |
| **No** database functions/views/RPCs reference them; **no** PostgREST embeds (`milestones(…)`/`tasklists(…)` inside a `select`) anywhere in `src/` | grep | compat views only need to serve plain table reads/writes |

## Spike environment — options (needs the user's pick)

| Option | Needs | Pros / cons |
|---|---|---|
| **A. Local Supabase (Docker)** — `supabase init` (creates `supabase/config.toml`) + `supabase start` + `supabase db reset` to replay all 159 migrations; optional data via `supabase db dump --data-only --db-url <pooler URL>` | Docker Desktop running (the daemon is **not** running on this machine now), a pooler connection string | Free, disposable, exact Postgres/PostgREST/Realtime versions; replaying 159 migrations may need small fixes for vault/pg_cron/extension steps (a finding in itself). Direct host `db.<ref>.supabase.co` did not resolve from here (IPv6-only) — use the pooler URL. |
| **B. Second hosted Supabase project** (empty) — push the migrations with `supabase db push`, restore data from a dump | A new project (free tier works) + its DB password | No Docker; closest to prod incl. Realtime; costs a project and an extra secrets set. |
| **C. Supabase Branching** (preview branch of the live project) | Pro plan + branching enabled | Real data copy, but availability/plan unknown. |

Recommendation: **A** for the rename/RLS/view spike (schema is what matters), plus a data dump only when 428's dry run needs real rows.

## What the spike must verify (record results in Implementation Notes)

1. **Replay:** all 159 migrations apply cleanly on a fresh DB (note every failure and fix).
2. **Rename:** `alter table milestones rename to project_phases` / `tasklists → project_deliverables`; `alter table project_deliverables rename column milestone_id to phase_id`. Confirm FKs from `tasks` still resolve, `external_id` upserts (`on conflict (external_id)`) still work, cascades from `projects` still fire, indexes/policies are intact. List what needs cosmetic renaming (`pg_constraint`, `pg_indexes`, `pg_policies`).
3. **New columns/constraints:** status check widened (`skipped`, `bypassed`); partial unique indexes (`(project_id, phase_number)`, `(project_id, deliverable_key)`, one-active-programme-phase); `phase_programme_state`. Insert second `active` programme phase → rejected; two active `manual` phases → allowed.
4. **Compat views `milestones` / `tasklists`:** auto-updatable (single table, plain columns) — verify `insert`/`update`/`delete` through PostgREST (`supabase-js`) work and that **`WITH (security_invoker = true)`** is set, otherwise the view runs as its owner and **bypasses RLS** (a security regression). Confirm the filter that hides Phase 1 programme rows works for inserts (`WITH CHECK OPTION` / defaults).
5. **RLS matrix:** one test user per role (admin, super_admin, marketing, pm, developer, client) × {select, insert, update, delete} × {`source='manual'`, `source='programme'`} on both tables + `phase_programme_state`; compare against the table in the task above. Include `get_my_role()` behaviour.
6. **Realtime:** table in `supabase_realtime` after rename; a `postgres_changes` subscription with `project_id=eq.…` receives insert/update, and delete (with `replica identity full`).
7. **Generated types:** `supabase gen types` against the branch to preview `database.ts` changes; list the TypeScript fallout (`tsc` error count) with the compat aliases in place.
8. **Rollback script:** apply 427, then `supabase/rollbacks/427_…_down.sql`, then re-diff the schema — must return to the pre-427 state (apply on the disposable DB only).
9. **Performance sanity:** `explain` on the Tasks tab's main queries (project + milestone/tasklist filters) before/after; index usage unchanged.

## Deliverables of the spike
- Filled-in verification table above (pass/fail + notes), list of migration-replay fixes, the final `427_…sql` and `427_…_down.sql` drafts, the policy-test script (written, runnable against any disposable DB), and the regenerated-types diff summary.
- **Stop point:** the user reviews the SQL and the results before anything is applied to the shared database.

## Decision + setup (2026-10-05)
- **Environment chosen by the user: A — local Supabase via Docker.** (Correction recorded: Supabase preview Branching builds from migrations and does **not** copy production data, so option C offered little over B and was dropped.)
- **Done so far:** `supabase init` run (creates `supabase/config.toml`; `project_id = "WebriQ-Central-Hub"`, local Postgres `major_version = 17`). The CLI is **not linked** to the live project (no `supabase link`), so `supabase db push` has no live target; every spike command must name the local stack (`supabase start` / `supabase db reset`, or an explicit local `--db-url`). A guard script will refuse any spike step whose URL host matches the live project ref.
- **Blocked on:** Docker Desktop is installed but its daemon is not running (`docker info` fails); free disk 23 GB (enough for the Supabase images, ~5–8 GB). Local `major_version` should match production's Postgres major version — **production's Postgres version is unconfirmed** — the dashboard does not show it to the user, and the `14.5` returned by the REST root is PostgREST's version, not Postgres's. **Confirmed 2026-10-05 by the user: `PostgreSQL 17.6 on aarch64-unknown-linux-gnu`** — matches the local `major_version = 17`, no config change. (Original assumption: 17, CLI default; everything the spike checks, incl. `security_invoker` views, needs ≥ 15). To confirm later, run `select version();` in the Supabase SQL editor and record the result here; if it is not 17, set `major_version` in `supabase/config.toml` and re-run the spike.
- **Next, once Docker is up:** `supabase start` → `supabase db reset` (replays 159 migrations; record every failure) → run the verification list above → draft `427_…sql` and the rollback → stop for the user's review.


---

# Spike Results (2026-10-05, local Docker, Postgres 17.6 — the live database was not touched)

Tooling: `_docs/task/427-spike/` — `spike.sh` (refuses non-loopback / live-ref targets), `01-catalog-probe.sql`, `02-fixture.sql`, `02b-emulate-prod-grants.sql`, `03-expand-draft.sql` (+`-down`), `04-verify.sql`, `types-preview.txt`. Outputs of the runs are summarised here. Final SQL: **`supabase/migrations/160_expand_project_phases_deliverables.sql`** and **`supabase/rollbacks/160_expand_project_phases_deliverables_down.sql`** (written, not applied).

| # | Check | Result |
|---|---|---|
| 1 | Replay all migrations on a fresh DB | **PASS** — 159/159 applied, 0 errors, twice (first `supabase start`, then `db reset`); migration 159 included |
| 2 | Rename in place: FKs, `external_id` upsert, cascades | **PASS** — all 3 inbound FKs resolve (tasks→phases 2/2, tasks→deliverables 2/2, deliverables→phases 3/3); `on conflict (external_id)` upsert works; deleting a project cascades phases/deliverables/tasks; deleting a phase nulls `tasks.milestone_id` / `deliverables.phase_id` |
| 3 | New constraints | **PASS** — `skipped`/`bypassed` accepted, junk rejected; second `active` *programme* phase in a project rejected, several active *manual/Zoho* phases allowed (the fixture has 3 in one project, mirroring the 130 live ones); duplicate `(project, phase_number)` rejected; source tagging exact (phases programme 2 / manual 1 / zoho 2; deliverables 1/1/1) |
| 4 | Compat views `milestones`/`tasklists` | **PASS after one fix** — auto-updatable; PM insert/update/delete through them works; a developer insert is rejected by RLS on the underlying table (**proves `security_invoker`**); Phase-1 programme rows hidden; `WITH CHECK OPTION` active |
| 5 | RLS matrix (6 roles × 16 operations incl. escalate/demote across `source`) | **PASS — 96/96 cells match the design table** |
| 6 | Realtime after rename | **PASS** — renamed tables stay in the publication, replica identity `full` preserved, filtered insert/update/delete all delivered (see finding 3) |
| 7 | Generated types preview | **PASS** — shapes in `types-preview.txt`; FK names preserved (`tasks_milestone_id_fkey` now → `project_phases`); the views' Row types are all-nullable (expected for views) so the app's `milestones`/`tasklists` type aliases must point at the new *table* Rows, not the views |
| 8 | Rollback | **PASS** — after apply + rollback the `public` schema `pg_dump` is identical to the pre-expand dump (6,305 lines; only pg_dump's random restrict tokens differ); data survives |
| 9 | Performance | **Not meaningful** on an empty DB; all existing indexes are retained (only the duplicate dropped), plus two small new ones. Re-check `explain` on the Tasks tab queries after the 428 backfill. |
| 10 | Migration 159 (task 424) on a fresh DB | **PASS** — applies, rollback script reverts publication + replica identity exactly, re-apply is idempotent |
| 11 | Live-data safety for the new unique index | **PASS** (read-only check) — all 108 programme-tagged milestones are `planned`, 0 projects with >1 active programme milestone; tag counts: programme 108 / 540, Zoho 567 / 985, manual 20 / 46 |
| 12 | App call shapes through the compat views (PostgREST) | **PASS** — `upsert(…, { onConflict: "external_id", ignoreDuplicates: true })` (do-nothing, new + conflict) and the do-update variant on `milestones`; array `upsert` on `tasklists` including the legacy `milestone_id` column (alias of `phase_id`); `insert(…).select("id").single()` (seed-custom-phases shape); `tasks` inserts referencing view ids; `order`/`count`/`.in()`/`.like()` reads. The conflict key `external_id` resolves through the view to the underlying unique index. |

## Findings (things the spike caught — all reflected in migration 160 unless noted)
1. **View NULL-logic bug (draft):** `where not (source='programme' and phase_number = 1)` silently dropped programme rows whose `phase_number` is still NULL (2 of 5 fixture rows). Fixed with `is not distinct from 1`.
2. **Grants:** in the local stack (CLI 2.107) the `authenticated` role has **no** table privileges at all — newer Supabase projects/CLIs no longer auto-grant on `public`. The renamed tables keep their grants, but the **new table and both views do not inherit any**, so the migration now grants explicitly (`select, insert, update, delete … to authenticated, service_role`). Production is probably older-style (auto-grant), but the explicit grants are harmless and make it independent of that. RLS still gates every row.
3. **Realtime and the compat views (affects tasks 429/430):** views cannot be published, and a channel containing **one** binding to a non-published relation fails **entirely** (`Unable to subscribe to changes…`). So every Realtime subscription must be renamed to `project_phases`/`project_deliverables` — including task 422's `useGenericRealtime` (subscribes to `milestones`/`tasklists`) and the StackShift channel. The compat views do **not** keep live updates working for legacy subscribers. (Realtime also needs a few seconds after `SUBSCRIBED` before the first events flow — a test-timing note, not a product issue.)
4. **Redundant index dropped:** `milestones_external_id_idx` duplicated the unique index behind `milestones_external_id_key`.
5. **Behaviour change to confirm (decision below):** under the design RLS, rows tagged `source='programme'` (108 phases + 540 deliverables on live) are writable only by admin/super_admin/**marketing** — **PMs lose the ability to rename/edit those rows** in the Milestones/Tasks tabs (tasks *inside* them stay PM-editable; manual/Zoho rows are unchanged). Reading is unchanged for everyone.
6. No `updated_at` trigger exists on either table (the app sets it) and none was added; `src/types/database.ts` is the app's own file — it needs the new shapes (preview in `types-preview.txt`) in tasks 429/430, with `milestones`/`tasklists` aliases to the new Row types.

## Decisions needed before anyone applies 160
- **D1 (finding 5) — DECIDED 2026-10-05: no.** Marketing/admin own programme structure; PMs read programme rows and edit the tasks inside them (UI should show those rows read-only). Original question: may PMs edit `source='programme'` phases/deliverables? Design default: **no** (marketing/admin own programme structure). Alternative: allow `pm` on programme rows too (then the policy is simply "admin/super_admin/pm/marketing can write everything"; the marketing-only protection survives only on `phase_programme_state`).
- **D2:** apply order relative to 159 (independent; either order works) and who applies — you, after reading `160`.

## How to re-run the spike
`supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector` (Docker Desktop running; ~4 GB RAM is tight) → `supabase db reset` → `_docs/task/427-spike/spike.sh -f …/02-fixture.sql` → `…/02b-emulate-prod-grants.sql` → `…/03-expand-draft.sql` (or `160`) → `…/04-verify.sql`. `supabase stop` when done.


## Apply + verify runbook (for the operator; nothing below has been run against the shared database)
1. **Backup first.** Confirm a recent backup exists (dashboard → Database → Backups) or take one (`pg_dump` via the pooler URL). Migration 160 is reversible only before task 428 runs.
2. **Link + dry run.** `supabase link --project-ref tgjpkyiywktjktbsxcyr` (asks for the DB password) → `supabase migration list` (remote history must match local through 158) → `supabase db push --dry-run` — it must list **exactly** `159_…` and `160_…`. Stop and ask if it lists anything else.
3. **Apply.** `supabase db push`. Both run in order (159 publication + replica identity, then 160 rename in one transaction — the compat views take the old names inside the same transaction, so table-name queries never see a gap).
4. **Verify (read-only, I can run these):** the catalog probe equivalents against the live DB via the service key (`project_phases`/`project_deliverables` row counts equal the old 695/1,571; tasks 7,632 with every `milestone_id`/`tasklist_id` resolving; `source` tag counts programme 108/540, Zoho 567/985, manual 20/46); the controlled Realtime probe (`_docs/task/423-investigation-queries/`) for the five tables and the new names.
5. **App smoke test:** Milestones tab, Tasks tab, both Timelines, New Project intake, a programme "Jump to phase" on a test project.
6. **Immediately after (small code change):** point the generic Timeline's realtime hook at the real tables — `src/app/(hub)/projects/v2/[projectId]/_use-generic-realtime.ts`: `table: "milestones"` → `"project_phases"` and `table: "tasklists"` → `"project_deliverables"`. Until that ships, the generic Timeline shows "Live updates paused" (a channel with a non-published binding fails entirely — spike finding 3). The StackShift channel (`customer_phases`/`customer_deliverables`) is unaffected until task 429.
7. **If anything looks wrong before 428:** run `supabase/rollbacks/160_expand_project_phases_deliverables_down.sql` in the SQL editor (schema returns to the pre-160 state; verified identical on the spike DB).


---

# Applied + Live Verification (2026-10-05)

**Applied by the operator** with `supabase db push` (dry run listed exactly `159_realtime_timeline_tables.sql` and `160_expand_project_phases_deliverables.sql`; both applied, "Finished supabase db push"). The agent ran only read-only checks afterwards.

| Check (live database, read-only, service key) | Result |
|---|---|
| Row counts | **project_phases 695, project_deliverables 1,571, tasks 7,632** — identical to before; compat views `milestones` 695 / `tasklists` 1,571; `phase_programme_state` exists, 0 rows |
| Link integrity | tasks→phases 4,357/4,357 resolve; tasks→deliverables 6,220/6,220; deliverables→phases 1,284/1,284 |
| Source tags | phases programme 108 / zoho_import 567 / manual 20; deliverables programme 540 / zoho_import 985 / manual 46 — exactly the pre-migration counts |
| Phase status distribution | active 554 / planned 126 / completed 15 — unchanged |
| Realtime publication (controlled probe: `customer_products` positive, nonexistent-table negative) | **IN:** `project_phases`, `project_deliverables`, `tasks`, `customer_phases`, `customer_deliverables`. **Not in (as predicted):** the views `milestones`, `tasklists` |
| App smoke test (dev server on the live DB) | Hello Homes Timeline (7 cards, "7 overdue"), UFP generic Timeline (phase + 22-day progress, **no "Live updates paused"**), UFP Milestones tab, Baoase Tasks tab (programme tasklists via the views) — all load without errors |

- **Code change done after applying:** `src/app/(hub)/projects/v2/[projectId]/_use-generic-realtime.ts` now subscribes to `project_phases` / `project_deliverables` (was the legacy view names). `tsc` + eslint clean.
- **Noted during the smoke test (not caused by the migration):** a freshly started `next dev` first returned 404 for every project detail page while the project listing and APIs worked; a clean restart of the dev server fixed it (stale dev-server state). Worth remembering if it recurs.
- **End-to-end write test: done** — see "Live end-to-end Realtime check" below (UPDATE delivered after a 25 s warm-up).
- **Rollback status:** still available **until the task-428 backfill runs** (`supabase/rollbacks/160_expand_project_phases_deliverables_down.sql`; verified identical on the spike DB).


## Live end-to-end Realtime check (2026-10-05, operator-approved single no-op write)
A test client subscribed exactly as the generic Timeline's hook does (`project_phases`, filter `project_id=eq.<UFP International>`) and one **no-op** `update project_phases set name = <same name>` was run on UFP's single phase (name/status/`updated_at` verified unchanged afterwards).
- **Attempt 1 (7 s after `SUBSCRIBED`, 4 s observation): no event** — subscription reported `ok`; inconclusive (warm-up).
- **Attempt 2 (25 s warm-up, 10 s observation): the `UPDATE` event for the correct row id and name arrived within about a second of the write.** Live delivery on the renamed table with the project filter is confirmed.
- **Caveat (product-level, not a defect of the migration):** a new Realtime subscription needs more than ~7 s before it reliably receives events (also seen locally with <2 s). The Timeline hook subscribes on page load, so a change made by someone else within the first several seconds of opening the page may not appear live; it would show on the next load. If that matters, a one-time refetch after `SUBSCRIBED` (+ a few seconds) closes the gap — not done here.
- Not exercised live (needs destructive writes, deliberately not done): INSERT and DELETE delivery on the live tables — covered by the local spike (all six event types incl. DELETE with `replica identity full`) and by the controlled publication probe.


## Defect found afterwards (task 428 prep) — fixed by migration 161
Migration 160's `project_deliverables_project_key_uq` is `unique (project_id, deliverable_key)`, but the same key repeats across phases of one project in the real data (`updated-publishing-plan`, `gap-publishing` in Phases 4 and 5 of 28 projects = 56 project/key pairs); the spike fixture had no repeated key, so it was not caught. Harmless until the backfill sets `deliverable_key` (no row has one yet), but it would reject the backfill. **`supabase/migrations/161_fix_project_deliverables_key_unique.sql`** (written, not applied) replaces it with `unique (phase_id, deliverable_key)`. Apply 161 before running the 428 backfill. Lesson for the spike checklist: test uniqueness rules against *real* key distributions, not a hand-made fixture.


## Migration 161 applied + verified live (2026-10-05)
Operator ran `supabase db push` (161 only). Verified: catalog query returned exactly one `%key_uq` index on `project_deliverables` — `project_deliverables_phase_key_uq … (phase_id, deliverable_key) WHERE (deliverable_key IS NOT NULL AND phase_id IS NOT NULL)`; the old `project_deliverables_project_key_uq` is gone. Read-only data check (service key): project_phases 695, project_deliverables 1,571, tasks 7,632, customer_phases 146, customer_deliverables 751 — all unchanged; 0 deliverables with a `deliverable_key`, 0 phases with a `phase_number`, `phase_programme_state` 0 rows (the swap was lossless; the backfill has not run). **The backfill's prerequisite check (migrations 160 + 161) now passes on live.** Rollback for 161 remains valid until the backfill runs.
