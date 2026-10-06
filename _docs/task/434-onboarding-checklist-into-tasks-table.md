# 434: Move the StackShift I Onboarding Checklist Into the `tasks` Table

**Created:** 2026-10-06
**Priority:** MEDIUM
**Type:** data-model change + migration (written-not-applied) + cutover
**Recommended Tier:** deep (data model, RLS/visibility, backfill, 45-file blast radius)
**Status:** Planned
**Depends on:** 429 (programme-engine cutover, in progress), 430 (tasks column rename — this doc writes `milestone_id`/`tasklist_id` and notes the post-430 names `phase_id`/`deliverable_id`)
**Parent:** task 423 unification; enables the shared Timeline deliverable card (follow-up task — see "Why now")

---

## Overview

The product mapping the user confirmed:

| StackShift I | Generic engine | Same thing |
|---|---|---|
| Phase | Milestone | phase lane |
| Deliverable | Tasklist | card |
| **Onboarding checklist item** | **Task** | **the card's progress** |

Phases and deliverables are already unified (423–429: `project_phases` / `project_deliverables`). **Checklist items are not.** Today they live in a StackShift-only side table:

- **What they are:** the 14 items in `INTERNAL_DELIVERABLES` (`src/config/customer-phases.ts:342`), each mapped to a Phase 1 sub-phase (`subPhaseKey`: kickoff 3, outcome-target 1, client-signoff 2, migration-checklist 1, html-mockup 1, storage-kb 4, content-map 2).
- **Where they live:** `onboarding_internal_deliverables (project_id, deliverable_key, status pending|in_progress|done)`, upserted by `PATCH /api/projects/[id]/programme/internal-deliverables/[key]`, which also auto-derives the parent Phase 1 deliverable's status from its siblings. Seeded unconditionally by `seedAndStartProgramme` (`seed.ts:161`) and backfilled by migrations 062/063/069.
- **Why it matters:** the StackShift I card computes progress from them (`stackshiftFacts` → `progressPercentage`), the generic card computes progress from `tasks` counts (`buildTaskCounts`). Until both read the same table, the two Timelines cannot share one card, and Phase 1 work is invisible to anything that queries `tasks` (counts, MCP tools, ops-chat, dashboards).

Goal: represent each checklist item as a real `tasks` row under the Phase 1 phase (milestone) and its sub-phase deliverable (tasklist), flagged so it is **not listed** on the Tasks listing, with progress/status read from `tasks`. The Phases 2–5 deliverables already have tasklists, and generic/custom-phase projects already get tasks from `seedCustomPhases` — only the Phase 1 internal checklist needs moving.

## Decisions needed before implementation (blocking — answer in review)

1. **Who may see checklist rows?** Today the checklist is **marketing/admin-only and "never shown to PM/developer/hr"** (route comment; `WRITE_ROLES = admin, super_admin, marketing`). The `tasks` table is the opposite: `tasks_staff_read` = admin/super_admin/pm/developer, `tasks_pm_write` = admin/super_admin/pm, and **marketing has no tasks policy at all** (migrations 026/048/092/111). Options:
   - **A (recommended, preserves today's behaviour):** add `tasks.kind` and RLS that keeps checklist rows admin/super_admin/marketing-only — a *restrictive* policy hides `kind='checklist'` from pm/developer, plus permissive marketing read/write limited to `kind='checklist'`.
   - **B:** let PM/developer read them too (matches "should be in the tasks table", simplest RLS) — changes who sees internal work; needs product sign-off.
   "Not listing on the task listing" is satisfied by the listing filter either way; this question is about RLS.
2. **Status mapping:** `pending → open`, `in_progress → in_progress`, `done → closed` (`is_completed=true`, `completed_on` set; `tasks.status` check is the Zoho vocabulary, migration 034). Confirm, in particular that no new status is wanted.
3. **Projects with no Phase 1** (Phase 1 excluded via `skip_phase_numbers`, or no Phase 1 `project_deliverables` row): `seed.ts` inserts internal rows for them anyway. Recommend: no task rows (nothing to attach to), report them in the dry-run, leave legacy rows untouched.
4. **StackShift I fixed-phases mode checklist** (`DeliverableDraft.checklist` in the Phase Builder): `seedCustomPhases` turns these into tasks, but the StackShift I seed path does not. Out of scope here unless you want PM-authored checklist items on Phase 2–5 StackShift I deliverables seeded as `kind='task'` too — confirm.

## Requirements

- [ ] **Migration NNN (written-not-applied, + rollback in `supabase/rollbacks/`):** `tasks.kind text not null default 'task' check (kind in ('task','checklist'))`; `tasks.checklist_key text null`; partial unique index `(project_id, checklist_key) where checklist_key is not null` (mirrors today's `onConflict: "project_id,deliverable_key"`); RLS per decision 1; `generate_task_display_id()` skips `kind='checklist'` (no `T####` numbers burned on hidden rows — verify the trigger body first, `089_task_issue_display_id.sql:27`).
- [ ] **Backfill script (dry-run first, abort on ambiguity, idempotent upsert on `(project_id, checklist_key)`)** — pattern of task 428. Per project with `onboarding_internal_deliverables` rows and a Phase 1 programme phase: one `tasks` row per `INTERNAL_DELIVERABLES` item (existing status mapped; missing rows → `open`), `milestone_id` = the Phase 1 phase id, `tasklist_id` = the Phase 1 deliverable whose `deliverable_key = subPhaseKey`, `title`/`description` from config, `position` = config order within the sub-phase, `kind='checklist'`, `checklist_key`, `created_by` null. Report: projects skipped (no Phase 1), items whose `subPhaseKey` has no deliverable row, unknown `deliverable_key`s in the legacy table, count reconciliation (legacy rows vs tasks created/updated/unchanged).
- [ ] **Seed:** `seedAndStartProgramme` / `seedProgrammeAtPhase` (and the New Project/StackShift-order paths that call them) create the checklist `tasks` rows instead of `onboarding_internal_deliverables`; **dual-write during the soak** so a rollback needs no data work.
- [ ] **Write path:** `PATCH .../internal-deliverables/[deliverableKey]` upserts the `tasks` row (by `checklist_key`), keeps `WRITE_ROLES`, keeps the sibling-derived parent-status update and the notification behaviour, and keeps its response shape.
- [ ] **Read path:** `GET .../programme` and the loaders return `internal_deliverables` in the same `{deliverable_key, status}` shape (adapter: `closed→done`, `open→pending`) so `_deliverable-card`, `_onboarding-wizard(-v2)`, `stackshiftFacts`, `_use-programme-progress` and the PM dashboard work unchanged; then (follow-up task) the shared card reads task counts directly.
- [ ] **Listing exclusion:** every user-facing task *listing* filters `kind='task'` — Tasks tab (`_get-project-detail-data.ts:69`, v2/legacy/old copies), board/calendar, project task counts shown as "tasks", MCP tools (`lib/mcp/tools/*`), `lib/ai/ops-chat-tools`, dashboards, time-log pickers, notification fan-out. Each of the **45** files importing `from("tasks")` is classified listing / count / write / unrelated in the inventory step; counts that are meant to include checklist progress (the Timeline's) deliberately do not filter.
- [ ] **Realtime:** `tasks` is already in the publication (task 424 / migration 159); confirm checklist toggles reach both Timelines.
- [ ] Contract step (drop `onboarding_internal_deliverables`) is **not** in this task — separate task after the soak.

## Out of Scope / Must-Not-Change

- `phase_programme_state.wizard_data` (customer-facing wizard free text, Kickoff/Storage-KB fields) and the Onboarding Workspace tabs — they are form state, not checklist items.
- The shared Timeline card, generic drag-reschedule, and visual restyle (follow-up task, depends on this one).
- Dropping `onboarding_internal_deliverables`; renaming `tasks` columns (430).
- Applying migrations or running the backfill against any DB (written-not-applied convention; operator runs it).
- Changing who can *write* checklist items (stays admin/super_admin/marketing) or the auto-derived parent status rule.
- Phase 2–5 deliverables/tasklists (already exist) and generic/custom-phase seeding.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/NNN_tasks_checklist_kind.sql` + `supabase/rollbacks/NNN_*_down.sql` | Create | `kind`, `checklist_key`, unique index, RLS, display-id trigger guard |
| `src/lib/programme/checklist-tasks.ts` | Create | Pure mapping (status ↔ task status, config → task row, sibling-status derivation) + the legacy-row adapter |
| `src/lib/programme/__checks__/checklist-tasks.check.ts` (+ `run.ts`) | Create/Modify | Pure checks for the mapping, derivation, adapter |
| `src/lib/programme/checklist-backfill.ts` + `scripts/` or admin route per the 428 pattern | Create | Plan builder + dry-run report + SQL/apply, idempotent |
| `src/lib/programme/seed.ts` | Modify | Seed checklist tasks (dual-write) |
| `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts` | Modify | Write `tasks`; keep response/derivation |
| `src/app/api/projects/[projectId]/programme/route.ts`, `src/lib/programme/store.ts` | Modify | Read checklist from `tasks` via the adapter |
| Task listing readers (Tasks tab loaders v2/legacy/old, MCP tools, ops-chat, dashboards — per inventory) | Modify | `kind='task'` filter |
| `src/types/database.ts` | Modify | `tasks.kind`, `tasks.checklist_key` |
| `_docs/mcp-tools.md`, `CLAUDE.md` | Modify | Tool output change (if any), the `kind`/RLS convention |

## Code Context

### Today's write path — `internal-deliverables/[deliverableKey]/route.ts`
Upserts `onboarding_internal_deliverables` `{project_id, deliverable_key, status}` with `onConflict: "project_id,deliverable_key"`, then recomputes the parent deliverable (`getProgrammeDeliverable(supabase, projectId, 1, subPhaseKey)`) from all sibling statuses: all `done` → `done`, any non-`pending` → `in_progress`, else `pending`.

### Today's read of progress — `_timeline-stats.ts`
```ts
const items = phaseNumber === 1 ? internalDeliverablesForSubPhase(d.key) : [];
const percentage = progressPercentage(status, items.map((i) => internalByKey.get(i.key)?.status ?? "pending"));
```
Generic engine: `buildTaskCounts(tasks)` counts `status === "closed"` per `milestone_id`/`tasklist_id`.

### Why the compat views matter
Migration 160's `milestones`/`tasklists` compat views **exclude Phase 1 programme rows**, so Phase 1 tasks attached to Phase 1 (a `project_phases` row) will not surface through any code still reading the views — consistent with "hidden from the Tasks tab", but reads must go through `project_phases`/`project_deliverables` (or the adapter) once 429/430 land. `tasks.milestone_id`'s FK targets the renamed table, so inserting a Phase 1 id is valid at the table level.

### RLS facts verified (read before implementing)
- `supabase/migrations/026_rls_policies_v2.sql:88-103`, `048_super_admin_rls.sql:36-46`: tasks read = admin/super_admin/pm/developer; write = admin/super_admin/pm. `092`/`111`: developer insert/update/delete on assigned tasks. **No marketing policy.** Re-grep migrations after 111 and check live `pg_policies` before writing the new policies.
- Triggers on `tasks`: only `trg_generate_task_display_id` found in the migrations; confirm against the live DB (`pg_trigger`) for completion/roll-up triggers (`completion_percentage`, `is_completed`, `depth`).

### Read before implementing
`seed.ts` (~lines 140–175, 266–420), `programme/route.ts` GET (internal_deliverables), `_onboarding-wizard.tsx` / `onboarding-workspace/_onboarding-wizard-v2.tsx` (how they read/toggle checklist items), `pm-dashboard.tsx` (uses the table), `backfill-plan.ts` + `backfill-sql.ts` (428 pattern to copy), migrations 060/062/063/069 (legacy seeding), `lib/mcp/tools/*`, `lib/ai/ops-chat-tools*`.

## Implementation Steps

1. **Verify and inventory (no code):** live `pg_policies`/`pg_trigger` for `tasks`; classify all 45 `from("tasks")` call sites (+ MCP/ops-chat/view-based readers) as listing/count/write/unrelated; record the table in this doc. Resolve the four decisions above.
2. Pure module `checklist-tasks.ts` + checks (`pnpm check:logic` / `npx tsx src/lib/programme/__checks__/run.ts`).
3. Migration + rollback (written-not-applied); update `database.ts`.
4. Backfill plan builder + dry-run report; run the dry run against a copy/branch and attach counts here.
5. Seed dual-write.
6. Write path (internal-deliverables PATCH) and read path (programme GET + adapter) — UI components unchanged.
7. Listing-exclusion filters, per the inventory.
8. Browser verification (below) on a StackShift I project; regression pass on a generic project (its tasks must be unaffected).
9. Document: CLAUDE.md note on `tasks.kind`/checklist convention; `_docs/mcp-tools.md` if tool outputs changed.

## Acceptance Criteria

- [ ] Dry-run report reconciles: legacy row count = tasks created + updated + unchanged + explicitly skipped (each skip reason listed); zero silent drops; ambiguity aborts.
- [ ] Toggling a checklist item in the wizard/Timeline updates `tasks`, the item's `status` round-trips (`pending/in_progress/done` ↔ `open/in_progress/closed`), the parent Phase 1 deliverable status still derives correctly, and the Timeline card progress is identical to before for the same data (before/after snapshot of a few projects).
- [ ] Checklist items never appear in the Tasks tab, board, calendar, MCP `list` tools, ops-chat results or task counts shown as "tasks"; real tasks are unchanged (counts match a before snapshot).
- [ ] Visibility matches decision 1 (verified per role: marketing can toggle; pm/developer cannot see them under option A).
- [ ] No `T####` display ids consumed by checklist rows; existing task numbering unaffected.
- [ ] Re-running the backfill and the seed is a no-op (idempotent); a rollback to reading the legacy table works because of the dual-write.
- [ ] `npx tsc --noEmit`, `pnpm lint`, and `npx tsx src/lib/programme/__checks__/run.ts` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx src/lib/programme/__checks__/run.ts
# Backfill dry run on a branch/copy (never prod): script from step 4 with --dry-run, attach the report
# Browser (StackShift I project): toggle each checklist item as marketing/admin; confirm card %, parent status, Tasks tab unchanged;
#   as pm and developer: confirm checklist rows are not visible (option A); regression on a generic project
```

## Compatibility Touchpoints

- **RLS/visibility:** the central risk (decision 1). A restrictive policy on `tasks` touches the most-queried table — measure query plans on the policy and keep it index-friendly (`kind` is low-cardinality; evaluate a partial index or `using (kind <> 'checklist' or …)` ordering).
- **External clients:** MCP tools and ops-chat read `tasks`; they must keep returning only real tasks (add to `_docs/mcp-tools.md` if behaviour is documented).
- **Realtime:** `tasks` already published; `REPLICA IDENTITY` for update payloads — confirm toggles carry enough columns for the generic hook's merge.
- **Sequencing:** land after 429 (programme APIs/loaders move) and coordinate with 430 (column rename) so this is written once. The shared Timeline card / generic drag-reschedule task depends on this one; contract (drop the legacy table) follows after a soak.
- **Docs:** CLAUDE.md (`tasks.kind`, checklist convention, updated `internal-deliverables` description); task 423's doc cross-reference.

## Why now

The user wants one deliverable card for every classification. The card's progress source is the only structural difference left between the two Timelines, and it is a data-model difference — fixing it in the UI alone would hard-code two data sources into the "shared" card.

## Decisions (answered 2026-10-06)

1. Visibility — chosen: "Admin/super_admin/marketing only, preserves today's behaviour". **Correction found during implementation:** today's behaviour is *not* admin/marketing-only — migration 070 gives **pm and developer read access** to `onboarding_internal_deliverables` (the PM dashboard's Intake checklist card and the Timeline cards read it). Only *writes* are admin/super_admin/marketing. The migration therefore preserves the real behaviour (read: all staff, write: admin/super_admin/marketing); the stricter variant is a one-line extra restrictive `for select` policy (comment in migration 163). **Please confirm this reading.**
2. Status mapping: `pending→open`, `in_progress→in_progress`, `done→closed` (+ `is_completed`, `completed_on`, `completion_percentage`). Confirmed.
3. No Phase 1 / no Phase 1 deliverables: no task rows, reported in the dry run, legacy rows untouched. Confirmed.
4. Phase 2–5 checklist items on StackShift I: out of scope. Confirmed.

## Implementation Notes

### What Changed
- Migration 163 (+ rollback, written-not-applied): `tasks.kind` / `checklist_key`, check constraints, partial unique index `(project_id, checklist_key)`, RLS (restrictive insert/update/delete + marketing checklist policies), display-id trigger skips `kind='checklist'`.
- Pure mapping/adapter/row builder (`checklist-tasks.ts`), data access with legacy fallback (`checklist-store.ts`), backfill planner + SQL generator + read-only dry-run script.
- Seed dual-writes the checklist tasks (`insertUnifiedProgramme`); `PATCH .../internal-deliverables/[key]` dual-writes (update-only) and derives the parent status via the shared `deriveSubPhaseStatus`; `GET .../programme` reads `tasks` when present, else legacy (`internal_deliverables` shape unchanged, so no UI changes).
- Listing exclusion via `excludingChecklist()` at: ops-chat `list_tasks`, MCP `list_tasks` + `list_open_tasks`, `GET /api/v2/projects/[id]/tasks`, `GET /api/v2/projects/[id]`, `/dashboard/tasks`, the shared and legacy project detail loaders, and the deleted-project summary count.
- CLAUDE.md convention note.

### Files Changed
- `supabase/migrations/163_tasks_checklist_kind.sql`, `supabase/rollbacks/163_tasks_checklist_kind_down.sql`
- `src/types/database.ts` (tasks `kind`, `checklist_key`)
- `src/lib/programme/checklist-tasks.ts`, `checklist-store.ts`, `checklist-backfill.ts`, `checklist-backfill-sql.ts`
- `src/lib/programme/__checks__/checklist-tasks.check.ts`, `checklist-backfill.check.ts`, `run.ts`
- `_docs/task/434-backfill/dry-run.ts`
- `src/lib/tasks/exclude-checklist.ts`
- `src/lib/programme/seed.ts`; `src/app/api/projects/[projectId]/programme/route.ts`, `.../internal-deliverables/[deliverableKey]/route.ts`
- Listing sites: `src/lib/ai/ops-chat-tools.ts`, `src/lib/mcp/tools/list-tasks.ts`, `list-open-tasks.ts`, `src/app/api/v2/projects/[projectId]/tasks/route.ts`, `.../[projectId]/route.ts`, `src/app/(hub)/dashboard/tasks/page.tsx`, `projects/_shared/_get-project-detail-data.ts`, `projects-old/[projectId]/_get-project-detail-data.ts`, `projects/_shared/_get-deleted-project-summary.ts`
- `CLAUDE.md`

### Deviations From Plan
- **Migration number 163**, not "NNN": 160/161 exist and a 162 rollback (task 426) is present.
- **RLS preserves the real legacy access (pm/developer read-only)** rather than the literal "admin/marketing only" answer — see Decision 1 correction.
- **`excludingChecklist()` fallback** (not in the plan): the `kind` filter would break every task list in an environment that gets ahead of migration 163, so it retries unfiltered on `42703`.
- **Dual-write is stricter than planned about reads:** `syncChecklistTask` is update-only; reads prefer `tasks` only when the project has checklist rows, else the legacy table — so a partially migrated project never shows partial data.
- **Not changed (inventory result):** `_load-dev-dashboard.ts` (assignee-scoped; checklist rows have no assignees), v2 `_load-detail-data.ts` `genericTasks` (generic-engine projects only — no checklist rows), single-task endpoints (by id), time-log/timer/touch-project lookups (by id), Zoho import routes and `seed-custom-phases.ts` (insert real tasks). The PM dashboard's `onboarding_internal_deliverables` read stays on the legacy table (authoritative during the soak) — migrating it is part of the contract task.
- Dry run and backfill were **not run** against any database (no approval to touch the shared DB; migration 163 is unapplied).

### Verification Run
- `npx tsc --noEmit` - PASS for `src/` (only the pre-existing generated `.next/dev/types/routes.d.ts` errors)
- `npx eslint` on all changed `src` files - PASS
- `npx tsx src/lib/programme/__checks__/run.ts` - PASS (89/89, incl. 16 new checks)
- Dry-run script against a DB - SKIPPED (needs credentials + unapplied migration; run after review)
- Browser/role verification (checklist toggle, pm/developer read-only, Tasks tab unchanged) - SKIPPED (needs migration 163 applied; Testing stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Fixed during review (correctness):** `loadInternalDeliverables` switched to `tasks` wholesale once a project had *any* checklist task, so a project missing some sub-phase deliverable (the planner skips those items) would have read the un-migrated items as `pending` even when the legacy table said `done`. It now reads both and merges per key (`mergeInternalRows`: task rows win, legacy fills gaps; only the legacy read's error is surfaced). Covered by a new check (90/90 pass).
- **Fixed during review:** the dry-run script's `(q: any)` filter replaced by a typed `[column, value]` equality tuple.
- No dead code, no debug logging; errors are intentional (seed/sync paths log and degrade, listing helper only swallows Postgres `42703` mentioning `kind`). File sizes are within the best-practices guide (largest new file ≈ 100 lines).
- Minor repetition: the `exclude ? q.eq("kind","task") : q` line appears at 8 listing sites. Left as-is — extracting it would need a generic over PostgREST builder types for no behavioural gain; the shared helper (`excludingChecklist`) already centralises the fallback logic.
- Migration SQL is syntax-reviewed only (no local Postgres/Supabase available to apply it); restrictive-policy syntax follows the `CREATE POLICY … AS RESTRICTIVE FOR insert|update|delete` form. First real validation is the operator's apply + the Testing stage.

### Deviations
- **Medium (user-visible, already reported):** RLS preserves the *actual* legacy access (pm/developer read-only) instead of the literal "admin/marketing only" answer, because the stricter reading would break the PM dashboard's Intake checklist card (migration 070). Needs the user's confirmation.
- Minor: migration numbered 163; `excludingChecklist()` fallback added; dual-write reads merge per key; several readers deliberately untouched (see Implementation Notes).
- Not run: dry run / backfill / browser+role verification (require migration 163 applied).

### Required Fixes
- None.
