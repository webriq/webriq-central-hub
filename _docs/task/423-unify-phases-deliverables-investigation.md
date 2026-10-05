# 423: Unify Phases/Milestones and Deliverables/Tasklists — Investigation + Migration Design

**Created:** 2026-10-05
**Priority:** MEDIUM
**Type:** investigation / design (no production code or data changes in this task)
**Recommended Tier:** deep
**Status:** Investigation complete — schema + strategy APPROVED (2026-10-05); follow-up tasks 424–431 written

---

## Overview

Today the same real-world things exist in two shapes:

| Concept | Programme engine (StackShift I) | Work-breakdown engine (generic + Tasks) |
|---|---|---|
| Phase | `customer_phases` (state/overrides over the static `PROGRAMME_PHASES` config) | `milestones` (DB-authored) |
| Deliverable | `customer_deliverables` (state/overrides over config) | `tasklists` (DB-authored; tasks hang off it) |

For StackShift I, Phases 2–5 are **already written twice**: `seedPhase2to5Links()` (`src/lib/programme/seed.ts`) creates a milestone per phase and a tasklist per deliverable, linked to `customer_*` only by an `external_id` string convention (`programme-phase-{project}-{n}`, `programme-deliverable-{project}-{n}-{key}`). Phase 1 has no milestone/tasklist at all. Names are copied at seed time and nothing keeps status/dates in sync. This causes drift, the guessed 50% progress on Phase 2–5 cards (audit U15), two Timeline engines, and a split-brain Milestones tab vs Timeline.

**Goal of this task:** produce a reviewed design and an ordered, reversible migration plan to unify them into `project_phases` and `project_deliverables` (plus a 1:1 programme-state side table) — **not** to run the migration. Output is this document's completed sections plus follow-up implementation task docs.

## Decisions Already Made (user, 2026-10-05)

1. **Names:** `project_phases` + `project_deliverables`. Tasks point at them via `tasks.phase_id` / `tasks.deliverable_id` (replacing `milestone_id` / `tasklist_id`); compatibility views named `milestones` / `tasklists` during the transition.
2. **`skipped`** is a phase status for **all** projects. Vocabulary becomes `planned | active | completed | skipped` (`customer_phases.not_started` → `planned`). Generic Jump-to-phase may then skip phases.
3. **Deliverable status:** manual `pending | in_progress | done` is kept **and** task-derived progress is shown beside it; the Timeline card percentage uses task progress when tasks exist (resolves audit U15).
4. **Programme-only state** lives in a 1:1 side table `phase_programme_state(phase_id pk, wizard_data jsonb, is_manual_override, override_note, delay_note)` so marketing/admin-only writes keep their own RLS policy, separate from PM/dev-editable structure.

## Target Schema (proposed — to be validated by this investigation)

**`project_phases`** — `id uuid pk`, `project_id uuid fk projects`, `phase_number smallint null` (stable programme ordinal; unique per project when set), `position int`, `name text`, `description text`, `owner_label text`, `start_date date`, `due_date date`, `day_start smallint`, `day_end smallint` (legacy offset fallback), `status text` (`planned|active|completed|skipped`), `actual_start_date date`, `actual_completed_date date`, `source text` (`manual|programme|zoho_import`), `external_id text unique when set`, `created_by`, `created_at`, `updated_at`.

**`project_deliverables`** — `id uuid pk`, `project_id uuid fk`, `phase_id uuid fk project_phases null`, `deliverable_key text null` (unique per project when set), `position int`, `name`, `description`, `owner_label`, `start_date`, `due_date`, `day_start`, `day_end`, `status text` (`pending|in_progress|done`), `completed_at timestamptz`, `is_default boolean`, `source`, `external_id unique when set`, `created_at`, `updated_at`.

**`phase_programme_state`** — as in Decision 4.

Dropped by materialising config defaults into rows: `day_start_override`, `day_end_override`, `custom_name`, `custom_description`, `custom_owner` (no more "reset to default" — defaults remain in `src/config/customer-phases.ts` only to seed new projects). `customer_id` is not copied (derive via `projects`).

## Investigation Questions (this task must answer each, with evidence)

1. **In place vs new tables.** *Approach A:* `ALTER TABLE milestones RENAME TO project_phases` (+ add columns, widen the status check), same for `tasklists`; preserves UUIDs, task FKs, URLs (`/milestones/[milestoneId]`), grants, RLS policy names and Realtime membership for free; merge `customer_*` rows *into* them. *Approach B:* new tables + copy + repoint FKs. Spike A on a DB branch/copy and record what breaks (policy names, triggers like `touch_updated_at`, index names, the `external_id` unique conflict key the Zoho import uses). Recommendation going in: A.
2. **Backfill mapping.** For every existing project: how many `customer_phases` rows match a milestone via `programme-phase-{project}-{n}`; how many Phase 2–5 milestones are missing (pre-fix projects, the collision bug noted in `seed.ts`); Phase 1 (no milestone) and custom phases (6+, `seed-custom-phases.ts`); skipped vs time-bypassed `skipped` (permanent skip is `projects.draft_skip_phase_numbers`, the DB status conflates both). Produce counts and an unmatched-rows report from a read-only query set (checked in under `_docs/`, not applied).
3. **Status semantics.** Define the exact mapping and who may transition what, for both phase (`active` uniqueness: StackShift one active phase; generic `generic-phase` route re-statuses by position) and deliverable (manual status vs derived progress display; where "done" gating applies, e.g. `complete-phase` route).
4. **RLS.** Today `customer_phases/deliverables` writes are marketing/admin only (migrations 070/071) and PM/dev are read-only; `milestones/tasklists` have PM/dev write policies (033/048). Specify the unified policies (using `get_my_role()` / `get_my_customer_id()` per CLAUDE.md) and which columns/tables remain marketing-only (`phase_programme_state`, Phase 1 wizard, schedule edits — task 148).
5. **Day/date model.** Materialising overrides into `day_start/day_end` + `start_date/due_date`: how do the StackShift display-scaled day math (`scaleDay/unscaleDay/compressReferenceDay`, `programme_duration_days`, skip-compression) and task 420's `buildTimeline` coexist? Decide the single stored representation (dates vs offsets) and whether the programme-start-relative offsets stay.
6. **Zoho coupling.** `milestones`/`tasklists` are written by `zoho-import/{milestones,tasklists,tasks}` and `zoho-sync/tasklists` keyed by `external_id`. With Zoho being decommissioned: are these imports still live? If frozen, mark them read-only/legacy rather than migrating them.
7. **Blast radius.** Confirm the consumer inventory below by actually reading each (grep counts are name matches, not verified usage), classify each as read/write, and size the change.

## Consumer Inventory (from name-grep over `src/`, to be verified)

| Group | Files (approx.) | Notes |
|---|---|---|
| **A. Programme engine APIs** — `api/projects/[projectId]/programme/**` (`route`, `start`, `phase`, `generic-phase`, `complete-phase`, `wizard-data`, `deliverables/[key]` + `/schedule`, `internal-deliverables/[key]`, `phases/[n]/note`, `phases/[n]/members`) | ~11 | Core read/write of `customer_*`; `generic-phase` already writes `milestones`. |
| **B. Onboarding/portfolio APIs + crons** — `api/onboarding/projects` (+ `status-report`, `qstash-start`), `api/onboarding/scheduled-autostart`, `api/programme/reminders`, `api/stackshift-orders/[orderId]/convert` | ~7 | Cron/session-less (`adminClient`); reminders dedupe keyed by phase number. |
| **C. `lib/programme/**` + config** — `seed.ts`, `seed-custom-phases.ts`, `phase-plan-draft.ts`, `phase-membership.ts`, `status-report.ts`, `lib/stackshift-orders/*`, `config/customer-phases.ts` | ~8 | `seedPhase2to5Links` and its upsert-by-`external_id` become the unified seed. |
| **D. UI (StackShift side)** — Timeline (`v2/[projectId]/_onboarding-detail`, `_load-detail-data`, `_use-programme-progress`, wizard, workspace), listing (`_v2-listing/*`), dashboards, `customers/[id]/_programme-tab`, `_use-active-phase`, project header, New Project intake | ~20 | |
| **E. Work breakdown** — Milestones/Tasks pages & CRUD (`api/v2/milestones`, `projects/[id]/milestones`, `tasklists`, `tasks`, `subtasks`), `_shared/_milestone-*`, create-task modal, legacy `projects/legacy` + `projects-old` copies, MCP `lib/mcp/tools/{create-task,update-task}`, `lib/ai/ops-chat-tools` | `milestone_id` ~32, `tasklist_id` ~13 | Rename of FK columns is the widest change; compat views + dual column names bridge it. Update `_docs/mcp-tools.md` in the same change per CLAUDE.md. |
| **F. Zoho import/sync** — `api/admin/zoho-import/{milestones,tasklists,tasks}`, `zoho-sync/tasklists`, `lib/migrate/zoho-import.ts` | ~6 | See Question 6. |
| **G. Keyed by `phase_number`** — `phase_members`, `customer_assets.phase_number` (+ folders), `wizard_data`, reminders `notification_key` | ~45 files mention `phase_number` | Decide: keep `phase_number` as the stable key and add `phase_id`, or migrate to `phase_id`. |
| **H. Database** — migrations 033, 038, 048, 059, 060, 070, 071, 081, 103, 104, 107, 108 (tables/RLS), Realtime publication (membership **unverified**, see tasks 422), `src/types/database.ts` | — | Next free migration number is 159. |

## Proposed Migration Strategy (expand → migrate → contract; each step independently shippable and reversible)

1. **Expand (additive, no behaviour change):** create/alter tables (Approach A or B per Q1), `phase_programme_state`, indexes, unified RLS (written, **not applied by the agent** — repo convention for migrations), regenerate `types/database.ts`.
2. **Backfill:** idempotent script/migration matching `customer_*` ↔ milestones/tasklists via the `external_id` convention; create missing Phase 1 / unmatched rows; reuse existing UUIDs; produce a reconciliation report; **abort on any ambiguous match** (never guess).
3. **Dual-write window:** engine APIs (group A/B) write both shapes (or a trigger mirrors `customer_*` → unified) while readers are moved; verify parity with a diff query run on a schedule.
4. **Migrate readers by group** (D then A/B/C, then E): one task per group, each leaving the app working. Timeline becomes a single code path (one engine reading `project_phases/project_deliverables`; StackShift-specific behaviour keyed off `source = 'programme'` / presence of `phase_programme_state`).
5. **Contract:** drop `customer_phases/customer_deliverables` (or leave read-only views), drop `milestone_id/tasklist_id` aliases and compat views, retire `seedPhase2to5Links`.
6. **Rollback:** every step before 5 is reversible by reverting app code (old tables untouched until contract). Contract step requires a verified backup and at least one release of clean parity.

## Risk Register (initial)

- Silent data divergence during dual-write → mitigated by parity diff + abort-on-ambiguity backfill.
- Wide FK rename (`tasks.milestone_id/tasklist_id`) across 45+ files incl. MCP tools used by external clients → keep old column names working via views until clients are updated.
- RLS regression (marketing-only writes becoming PM-writable) → policy tests on a DB branch with one user per role before enabling.
- Day-scale math regressions (skip-compression, custom duration) → needs the calendar consolidation + unit tests from the audit's P2 group **before** the date-model change; treat as a prerequisite.
- No test runner in the repo → introduce throwaway/CI-less verification scripts for backfill and parity (checked into `_docs/`).
- Realtime publication membership unknown for all five tables → verify first (affects tasks 422 too).
- Zoho import paths may silently break on the rename → decide Q6 early.

## Deliverables of This Task

- [ ] Answers to Investigation Questions 1–7, each with evidence (queries run read-only against a copy/branch, or code excerpts), appended to this doc.
- [ ] Verified consumer inventory (read vs write, per file) replacing the grep estimate.
- [ ] Final schema + RLS + backfill mapping, reviewed by the user.
- [ ] A numbered set of follow-up implementation task docs (one per migration step / reader group) with acceptance criteria and rollback notes.
- [ ] Decision on prerequisites: the audit's calendar-consolidation + test work, and Realtime publication verification.

## Out of Scope

- Writing or applying migrations, changing any table, moving any reader, or touching production data (all follow-up tasks).
- UI redesign of the Milestones/Tasks tabs or the Timeline beyond what unification requires.
- Customer-facing onboarding form/wizard behaviour changes.

## Acceptance Criteria

- [ ] The doc contains evidence-backed answers to all seven questions and a recommendation between Approach A and B.
- [ ] The backfill mapping includes counts of matched / unmatched / ambiguous rows from a read-only run, and a stated policy for each bucket.
- [ ] Every consumer group has an owner task and an ordered position in the migration strategy.
- [ ] The user has approved the schema and the strategy before any implementation task is started.

## Verification

```bash
# Read-only, against a copy/branch — nothing here mutates data.
# e.g. match counts: customer_phases vs milestones on external_id = 'programme-phase-' || project_id || '-' || phase_number
# and customer_deliverables vs tasklists on 'programme-deliverable-…'; unmatched/ambiguous reports saved to _docs/.
grep -rlF "customer_phases" src | sort            # re-run to refresh the inventory
grep -rlF "milestone_id" src | sort
```

## Compatibility Touchpoints

- Supabase migrations (written, not applied, per repo convention); `src/types/database.ts`; `_docs/mcp-tools.md` (MCP tool inputs reference `milestone_id`/`tasklist_id`); Zoho import routes; Realtime publication; CLAUDE.md "Key Conventions" entries for `projects`/milestones will need updating once the work lands.
- Related: tasks 420 (generic Timeline dates), 421/422 (Timeline P0/P1 — 422's health/progress logic should switch to task-derived progress once unified), Timeline audit items C3/C10 (calendar consolidation + tests) and U15.

## Open Questions

1. Approach A (rename in place) vs B (new tables) — the spike decides; default A.
2. Keep `phase_number` as the stable cross-reference key for assets/members/reminders, or move those to `phase_id`? Default: keep `phase_number` and add `phase_id` alongside; migrate gradually.
3. Should custom phases (6+) and generic milestones share `position` ordering only, or also get a `phase_number`? Default: custom phases get a number; manual generic milestones keep it null.
4. Is the Zoho import still in use (Question 6)? If not, freeze rather than port.


---

# Investigation Findings (2026-10-05)

Method: read-only queries via the project's own service key against the single hosted database (there is no copy/branch — dev and prod share it; nothing was written), plus code/migration reading. Scripts + method notes: `_docs/task/423-investigation-queries/`. Counts are a point-in-time snapshot.

## Headline numbers

| | Rows |
|---|---|
| projects | 270 (29 on the programme engine, 182 have milestones, 154 are milestones-only i.e. legacy/Zoho/generic) |
| `customer_phases` / `customer_deliverables` | 146 / 751 |
| `milestones` / `tasklists` | 695 / 1,571 |
| `tasks` | 7,632 (4,357 with `milestone_id`, 6,220 with `tasklist_id`, 591 with neither; **0** task↔tasklist milestone mismatches) |
| `phase_members` / `customer_assets` | 22 (all Phase 1) / 1,626 (1,623 Phase 1, 3 null) |

**The whole programme dataset is tiny** (146 + 751 rows, 29 projects). Data migration risk is low; the real cost is application code (≈100+ files).

## Q1 — In place (A) vs new tables (B): **recommend A**

- Only three foreign keys reference the two tables: `tasks.milestone_id → milestones`, `tasks.tasklist_id → tasklists`, and `tasklists.milestone_id → milestones` (migrations 033/035/037/107). `milestones.external_id` is `unique` (037) — the upsert conflict key the seeds and Zoho import rely on.
- A rename keeps every UUID (so all 7,632 task links, `/milestones/[milestoneId]` URLs and MCP ids stay valid), the unique constraint, indexes and RLS bindings. B would have to remap all of them for no benefit given the volumes.
- Rename leaves policy/index *names* stale (`milestones_pm_write` …) — cosmetic, fixed in the same migration. Compat views `milestones`/`tasklists` (auto-updatable simple views) cover not-yet-migrated code, incl. MCP tools.
- **Not yet spiked on a DB branch** (none exists); the spike remains the first step of the expand task, run on a Supabase branch/dump, not this database.

## Q2 — Backfill mapping (counts)

**Phases** (`customer_phases` 146 rows → by `programme-phase-{project}-{n}` match):

| Bucket | Rows | Policy |
|---|---|---|
| Phase 2–5 with a scoped milestone | 104 (26 projects × 4) | Merge into the existing milestone row (keep its UUID); take `customer_phases` status/dates as truth. |
| Phase 1 (no milestone ever existed) | 29 | Create a `project_phases` row (`source='programme'`, `phase_number=1`). |
| Phase 2–5 with **no** programme milestone | 12 (3 projects × 4) | Create from config (these 3 projects predate `seedPhase2to5Links`; all 60 of their deliverables are likewise unlinked — one clean bucket). |
| Custom phase (`phase_number` 6) | 1 | Create (custom phases on this engine have no milestone today). |
| **Legacy-unscoped milestones** (`programme-phase-2…5`, the pre-fix collision bug) | 4 milestones, **one project** | Deterministic: attach by `project_id` + trailing number, then rewrite `external_id` to the scoped form. Their 20 legacy-format tasklists (`unparseable` ids) follow the same rule. |

**Deliverables** (`customer_deliverables` 751 rows): Phase 2–5 matched to a tasklist **509**; Phase 1 **182** (no tasklist by design — they are workspace/wizard items, create rows); Phase 2–5 unmatched **60** (the same 3 projects). **Orphan programme tasklists** (tasklist exists, no `customer_deliverables` row): **31** — 20 legacy-format, 9 whose key no longer exists in `customer_deliverables`, 2 whose key lives in a different phase; only **2** of the 31 have tasks → keep as `source='manual'` deliverables (never delete), flag for review.
- Ambiguity found: **none** — every match is by exact `external_id` or `project_id`+number; no row matches two candidates. Policy stays "abort on ambiguity" for the real run.

## Q3 — Status semantics (evidence)

- **Programme milestones are stale copies:** of 104 matched pairs, every milestone is `planned` even where the phase is `active` (17) or `skipped` (10). Nothing updates them → they cannot be trusted; for programme-sourced rows `customer_phases.status` wins.
- **`skipped` conflates two meanings:** of 26 `skipped` phase rows only **4** are permanent exclusions (`projects.draft_skip_phase_numbers`); **22 are time-bypassed** by "Jump to phase". → **Decision 2 needs refinement** (see Open Questions: add a distinct `bypassed` value or a `permanent` flag, rather than one `skipped` for both).
- **One-active invariant differs:** `customer_phases` has exactly one `active` phase per project (0 violations); **130 projects have >1 `active` milestone** (Zoho imports mark many active). A unique "one active" constraint can only be a *partial* index `where source='programme'`.
- Deliverables: 694 `pending`, 23 `in_progress`, 34 `done`. **Only 10 of 540 programme tasklists have any tasks** (8 of the matched 509 pairs). So task-derived progress is almost always "no tasks" today → Decision 3 (manual + derived side by side) is the right call, but the U15 payoff is small until Phase 2–5 deliverables actually get tasks.
- `complete-phase` carries **domain side effects** tied to the transition (Phase 1 completion hands over project visibility, creates contacts via `adminClient`, sends Cliq notifications, auto-advances the next phase). These stay in the API layer keyed on `source='programme'`; they are not database logic and not part of the table merge.

## Q4 — RLS (current vs needed)

| Table | Read | Write |
|---|---|---|
| `milestones`, `tasklists` (033/048) | admin, super_admin, pm, developer | admin, super_admin, **pm** |
| `customer_phases`, `customer_deliverables` (070/071) | admin, super_admin, **marketing**, pm, developer | admin, super_admin, **marketing** |

Gaps to design for: marketing has **no** access to milestones/tasklists today; PMs would newly gain write on programme state if tables were naively merged. Proposed: `project_phases/deliverables` read = union of both read sets; write = admin/super_admin/pm for `source<>'programme'`, admin/super_admin/marketing for `source='programme'` structure/schedule; `phase_programme_state` (wizard data, override/delay notes) write = admin/super_admin/marketing only; all via `get_my_role()` (CLAUDE.md). Needs policy tests with one user per role on a DB branch.

## Q5 — Date model

- `customer_deliverables`: **652 / 751** have day overrides; `customer_phases`: 104 / 146. Defaults live in `src/config/customer-phases.ts`. `custom_name` is used on **1** phase and **0** deliverables; `custom_owner` **0** → dropping the `custom_*` columns costs nothing.
- **0 of 104** programme milestones have `start_date`/`due_date` or `day_start`/`day_end`: dates exist *only* in the programme tables/config today → unification must materialise config + overrides into row dates. Manual milestones: 20 (3 with start/due, 7 with day range).
- Recommendation: store real `start_date`/`due_date` for every row (materialised from `programme_started_at` + the scaled offsets at backfill) and keep `day_start/day_end` only as the legacy-offset fallback task 420's `buildTimeline` already supports. **Prerequisite:** the audit's calendar consolidation + tests (C3/C10) before changing how StackShift's skip-compression/`programme_duration_days` math feeds those dates.

## Q6 — Zoho coupling

- 567 milestones and 985 tasklists carry non-programme `external_id`s (Zoho imports); `milestones.external_id` is the import upsert key. `/api/admin/zoho-sync/tasklists` is wired to a pg_cron job (`zoho-tasklists-sync`, migrations 041 → re-pointed to Vault in 078); **whether that job is still scheduled in the live DB could not be checked** (`cron.job` isn't exposed over the API) → confirm and unschedule before the rename if Zoho is decommissioned.
- Recommendation: freeze Zoho import/sync routes (leave them writing through the compat views, or return 410) rather than port them.

## Q7 — Consumer inventory

Name-grep inventory (see table above) stands: `customer_phases` 37 files, `customer_deliverables` 20, `milestones` 23, `tasklists` 11, `milestone_id` 32, `tasklist_id` 13, `phase_members` 14, `phase_number` 45. Not yet read file-by-file; the follow-up reader-migration tasks must classify each (read/write) as their first step. `phase_members` (all Phase 1) and `customer_assets.phase_number` (99.8% Phase 1) can simply keep `phase_number` as their key.

## Cross-cutting finding — Realtime publication (affects task 422 today)

Verified with a positive control (`customer_products` → `Subscribed to PostgreSQL`) and a negative control (nonexistent table → `Unable to subscribe to changes…`): **`customer_phases`, `customer_deliverables`, `milestones`, `tasklists`, `tasks`, `phase_members`, `onboarding_internal_deliverables` are all NOT in the `supabase_realtime` publication.** Consequences: the pre-existing StackShift Timeline channel (`v2_onboarding_*`) has never delivered events, and task 422's generic realtime hook subscribes but receives nothing. (My first probe was naive — `SUBSCRIBED` is returned even for a nonexistent table; the server's `system` message is the real signal.) Fix is a one-line migration per table (`alter publication supabase_realtime add table …`, written-not-applied by convention); under unification, add the two new tables instead.

## Updated recommendations

1. **Approach A (rename in place)**, with `phase_programme_state` side table and compat views, as designed.
2. **Drop the dual-write window.** Data is tiny and programme writes are low-volume (29 projects); do expand → single backfill → cut the programme engine (groups A–D) over in one coordinated change, leave `customer_*` as frozen read-only snapshots until the contract step. (Dual-write only if reader migration is split across releases.)
3. **One-active uniqueness** as a partial unique index on `source='programme'`.
4. **Status vocabulary:** `planned | active | completed | skipped`, plus a way to distinguish permanent skip from time-bypass (Open Question 5).
5. Keep `phase_number` as the stable key for `phase_members`, `customer_assets`, reminders; add `phase_id` alongside.
6. Treat Zoho routes as frozen.

## Proposed follow-up tasks (not yet created)

| # | Task | Notes |
|---|---|---|
| F0 | Add the Realtime-publication migration for the tables the Timeline listens to | Independent, quick win; unblocks 422. Written-not-applied. |
| F1 | Calendar consolidation + unit tests (audit C3/C10) | Prerequisite for the date model. |
| F2 | Confirm/disable `zoho-tasklists-sync` cron + freeze Zoho import routes | Prerequisite for rename. |
| F3 | Expand migration: rename in place, columns, `phase_programme_state`, partial unique index, unified RLS, compat views, rollback script | Spike on a DB branch first. Written-not-applied. |
| F4 | Backfill script + reconciliation report (dry-run mode, abort on ambiguity) | Uses the buckets above. |
| F5 | Programme-engine cutover: groups A–D (APIs, crons, `lib/programme`, Timeline → single engine) | Largest task; may split by group. |
| F6 | Work-breakdown rename: groups E (task FKs, MCP tools, ops-chat, `_docs/mcp-tools.md`) | After F5; compat views keep external MCP clients working. |
| F7 | Contract: drop `customer_*`, retire `seedPhase2to5Links`, drop views | After one release of clean parity. |

## Revised risks

- **Lower:** data volume (tiny), ambiguity (none found), FK blast radius (3 FKs).
- **Unchanged/higher:** RLS regression (marketing vs PM write boundaries), calendar math (prerequisite), unknown live `cron.job` state, 22/26 "skipped" rows being time-bypass (semantic decision), 130 projects with multiple active milestones (no global one-active rule), no test runner.

## Open Questions (new)

5. **`skipped` vs time-bypass:** 22 of 26 existing "skipped" phases are time-bypassed by Jump-to-phase, only 4 are permanent exclusions. Options: (a) add a distinct `bypassed` status; (b) keep `skipped` for permanent only and mark bypassed phases `completed` with `actual_completed_date` null; (c) keep one `skipped` + a `permanent boolean`. Recommend (a).
6. **Phase 1 deliverables:** create `project_deliverables` rows for the 182 Phase 1 deliverables (they have no tasklists, only workspace/wizard + internal checklist)? Recommend yes, so the Timeline reads one table; Tasks tab must then hide or label programme Phase 1 rows with no tasks.
7. **Orphan programme tasklists (31):** keep as manual deliverables (recommended) vs archive.

## Acceptance Criteria status

- [x] Answers to Questions 1–7 with evidence (Q1 spike and Q7 file-by-file reading are explicitly deferred to F3/F5 — recorded above).
- [x] Backfill mapping with matched / unmatched / orphan counts and a policy per bucket.
- [x] Every consumer group has a place in the strategy (F5/F6).
- [ ] User approval of schema + strategy (needed before any implementation task starts) — specifically Open Questions 5–7 and the "no dual-write" recommendation.


---

## Decisions Recorded (user, 2026-10-05, after the investigation)

| Question | Decision |
|---|---|
| Open Q5 — `skipped` vs time-bypass | **Separate `bypassed` status.** Phase status vocabulary: `planned | active | completed | skipped | bypassed`. `skipped` = permanent exclusion (backfill: the 4 rows in `projects.draft_skip_phase_numbers`); `bypassed` = passed over by Jump to phase (the 22 time-bypassed rows). Supersedes Decision 2's single `skipped`. |
| Open Q6 — Phase 1 deliverables | **Create `project_deliverables` rows** for the 182 Phase 1 deliverables so the Timeline reads one table; the Tasks tab must hide/label Phase 1 deliverables that have no tasks. |
| Open Q7 — 31 orphan programme tasklists | **Keep as manual deliverables** (`source='manual'`, flagged for review); nothing deleted, 2 tasks stay linked. |
| Cutover style | **Single coordinated cutover, no dual-write window.** Expand → one backfill → move the programme engine (groups A–D) together; `customer_*` stay frozen read-only snapshots until the contract step. |
| Realtime fix (F0) | **Task doc + migration written** → task **424** (`_docs/task/424-realtime-publication-timeline-tables.md`, migration 159 + rollback; applied by the operator). |

Additional validation of the Realtime finding: the probe agrees with migrations on record — `task_comments` and `attachments` (migration 093) report IN the publication, `customer_products` (006) IN; `tasks`, `issues`, `milestones`, `tasklists`, `customer_phases`, `customer_deliverables` NOT. (So `_project-detail.tsx`'s `tasks`/`issues` subscriptions have also been silent; `tasks` is fixed by 424, `issues` is not in scope there.)

Acceptance status update: the only remaining unchecked item is **final user approval of the schema + strategy** (now with the decisions above) before any implementation task (F1–F7) is created.


## Approval + Follow-up Tasks Created (2026-10-05)

The user approved the schema and strategy (including the recorded decisions and the no-dual-write cutover). Follow-up task docs written:

| F | Task | Doc |
|---|---|---|
| F0 | 424 Realtime publication migration | `_docs/task/424-realtime-publication-timeline-tables.md` |
| F1 | 425 Calendar consolidation + checks (prereq) | `_docs/task/425-programme-calendar-consolidation-and-checks.md` |
| F2 | 426 Freeze Zoho milestone/tasklist sync (prereq) | `_docs/task/426-freeze-zoho-milestone-tasklist-sync.md` |
| F3 | 427 Expand migration (rename in place) | `_docs/task/427-expand-migration-project-phases-deliverables.md` |
| F4 | 428 Backfill | `_docs/task/428-backfill-unified-phases-deliverables.md` |
| F5 | 429 Programme-engine cutover | `_docs/task/429-programme-engine-cutover.md` |
| F6 | 430 Work-breakdown rename | `_docs/task/430-work-breakdown-rename-tasks-mcp.md` |
| F7 | 431 Contract | `_docs/task/431-contract-drop-customer-phase-tables.md` |

Order: 424 ∥ 425 ∥ 426 → 427 (after a branch spike) → 428 → 429 → 430 → 431.

**Added after task 425:** task **432** (`_docs/task/432-fix-day-override-stored-scale-mismatch.md`) must land before 428 — manual reschedules on projects with permanent skips store a different day scale than the read path expects (1 live project affected). Order is now: 424 ∥ 425 ✓ ∥ 426 ✓ ∥ 432 → 427 → 428 → 429 → 430 → 431.
