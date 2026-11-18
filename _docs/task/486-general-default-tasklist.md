# 486 — "General" task list: move every task with no task list into it, and default new tasks to it

**Priority:** MEDIUM · **Type:** enhancement + data backfill (migration, written-not-applied) · **Recommended Tier:** `deep` · **Date:** 2026-11-18
**Status:** Testing — implemented 2026-11-18; migration 183 written, not applied

## Overview

On a project's Tasks tab, tasks with `tasks.tasklist_id IS NULL` land in a synthetic **"No Tasklist"** group
(`src/app/(hub)/projects/_shared/_list-view.tsx:173`). The user wants:

1. Every task across **all** projects that has no task list moved into a real task list named **"General"**
   (one per project), so "No Tasklist" no longer appears.
2. New tasks get **"General"** as their task list by default.

**Where the fix belongs: the database.** Tasks are created by at least six paths, and most never send a
`tasklist_id`:

| Path | File | Sends `tasklist_id`? |
|------|------|------|
| New Task modal → `POST /api/v2/projects/[projectId]/tasks` | `api/v2/projects/[projectId]/tasks/route.ts:87` | only if picked (`body.tasklist_id \|\| null`) |
| Subtask create | `api/v2/tasks/[taskId]/subtasks/route.ts:167` | inherits parent's (null if parent null) |
| MCP `create_task` | `src/lib/mcp/tools/create-task.ts:46` | **never** |
| Ops Chat `create_task` | `src/lib/ai/ops-chat-tools.ts:140` | **never** |
| Ticket → task (task 333) | uses the modal | only if picked |
| Programme seeds | `lib/programme/seed*.ts` | always (real deliverable) |

So the change is one migration (183): a backfill plus a `BEFORE INSERT` trigger on `tasks` that puts a null
`tasklist_id` into the project's General list (creating it if needed). Every path is covered and no API
code changes. The UI changes are small: the modal's placeholder text and the listing's fallback group.

**Schema reminder (migration 160, applied):** `tasklists` is a **compat view** over `project_deliverables`
(`id, project_id, external_id, name, position, is_default, phase_id AS milestone_id, …`). The view hides
deliverables of the StackShift programme Phase 1. `tasks.tasklist_id` references `project_deliverables(id)`,
`on delete set null`. Writes to `project_deliverables` are restricted by RLS to `admin|super_admin|pm` (for
`source <> 'programme'`). A developer creating a subtask therefore **cannot** insert a deliverable, so the
trigger function must be `SECURITY DEFINER`.

## Requirements

- [ ] Migration `183_general_default_tasklist.sql`:
  - [ ] **Pick or create General per project.** Pick the project's existing deliverable named `General`
        (case-insensitive, trimmed, `phase_id IS NULL`, `source <> 'programme'`), oldest first. If none exists,
        insert one: `name='General'`, `source='manual'`, `phase_id NULL`, `is_default=true`, `position` = before
        every existing list (`coalesce(min(position), 0) - 1`).
  - [ ] **D1 (resolved): keep existing defaults.** Set `is_default = true` on General **only** when the project has
        no other `is_default` deliverable. Existing defaults (e.g. Zoho-imported) are left alone. The New Task modal
        (`tasklists.find(tl => tl.is_default)`, `_create-task-modal.tsx:95`) therefore preselects General where it is the
        default, and the existing default elsewhere. An **empty** selection always ends up in General (trigger).
  - [ ] **Backfill:** `update tasks set tasklist_id = <General> where tasklist_id is null and project_id is not null
        and kind is distinct from 'checklist'`. Top-level tasks **and** subtasks are moved (a subtask with a null
        list would otherwise make its General parent's children inconsistent). Checklist rows (`kind='checklist'`)
        are never touched: they are not tasks (CLAUDE.md).
  - [ ] Backfill runs for **every** project (including `is_test` and archived ones), so "across all Projects"
        holds. Pick-or-create runs for every project, even one with no tasks, so the modal always has a default
        to select.
  - [ ] **Trigger** `tasks_default_general_tasklist` (**D2 resolved:** `BEFORE INSERT OR UPDATE OF tasklist_id, project_id
        ON tasks FOR EACH ROW`), function `ensure_general_tasklist(p_project_id uuid) returns uuid` (`SECURITY DEFINER`,
        `set search_path = public`): when `NEW.tasklist_id IS NULL AND NEW.project_id IS NOT NULL AND NEW.kind IS DISTINCT
        FROM 'checklist'`, set `NEW.tasklist_id := ensure_general_tasklist(NEW.project_id)`. This also catches a list
        deleted later (`on delete set null` runs as an UPDATE on `tasks`, and user triggers fire for it), a user clearing
        the field, and the merge wizard's "skip list" path (`merge/execute-tasks.ts`, sets `tasklist_id` null while
        moving tasks to the target project, so they land in the **target's** General). The function takes
        `pg_advisory_xact_lock(hashtext('general_tasklist:' || p_project_id))` before pick-or-create, so two
        concurrent inserts can't create two General lists.
  - [ ] **Project-delete guard (required by D2):** deleting a project cascades to its deliverables (sets tasks' list null →
        trigger) and its tasks. If the project row no longer exists, `ensure_general_tasklist` returns `NULL` and creates
        nothing; otherwise the insert would fail the `project_id` FK and **block the project delete**.
  - [ ] **D3 resolved: protect General.** Trigger `project_deliverables_protect_general` (`BEFORE UPDATE OF name, project_id
        OR DELETE ON project_deliverables`). A row is "General" when `lower(trim(name)) = 'general' and phase_id is null and
        source <> 'programme'`. Raise `'The General task list cannot be renamed or deleted'` (errcode `P0001`) when:
        - DELETE of a General row **and** its project still exists (cascade from a project delete is allowed);
        - UPDATE that renames a General row to a non-General name.
        Moving it to another project (`project_id` change by the merge wizard) is allowed. If a project ends up with two
        General rows (merge "move", or duplicates that existed before), deleting the **extra** one is allowed while another
        General remains in that project.
        No Hub UI or API renames/deletes task lists today (only `GET`/`POST` in
        `api/v2/projects/[projectId]/tasklists/route.ts`), so there is no UI to hide. The DB guard covers direct SQL, MCP,
        and any future route. The frozen Zoho sync (`api/admin/zoho-sync/tasklists`) upserts names by `external_id`; a renamed
        Zoho "General" would now raise there. Accepted, those routes are decommissioned.
  - [ ] The function is the only pick-or-create logic: the backfill calls it too (`select ensure_general_tasklist(id) from projects`), so there's one definition.
  - [ ] `revoke execute … from public, anon`; `grant execute … to authenticated, service_role`.
  - [ ] Idempotent: running it twice creates no second General and moves nothing new.
  - [ ] Rollback file `supabase/rollbacks/183_general_default_tasklist_down.sql`: drop both triggers and functions.
        The data backfill is **not** reverted (document why in the file: you can't tell which tasks were null before).
- [ ] **New Task modal** (`src/app/(hub)/projects/_shared/_create-task-modal.tsx:377`): placeholder `"No task list"` →
      `"General"`. An empty selection ends up in General on the server via the trigger.
- [ ] Pick-or-create runs for every existing project in the migration. A project created **after** 183 gets General on
      its first task with no list (lazy). The modal then shows the "General" placeholder until that list exists.
- [ ] **Tasks listing** (`_shared/_list-view.tsx:153-177`): tasks whose `tasklist_id` is null or not among the
      visible `tasklists` go into the **default list's group** (`tasklists.find(tl => tl.is_default)`, or failing that
      a list named General) when one exists. Only when neither exists does the fallback group show, labelled
      **"General"** (id stays `"__none"`). The "No Tasklist" label is gone.
- [ ] `_shared/_project-detail.tsx:453-460` (`allGroupIds`): only add `"__none"` when the listing would actually render
      that fallback group (same condition), so Collapse/Expand all stays correct.

## Out of Scope / Must Not Change

- No API route changes. `POST …/tasks`, subtasks, MCP and Ops Chat stay as they are; the trigger handles them.
  `_docs/mcp-tools.md` needs no update (no tool schema change).
- Tasks the user puts in another list must stay there: the trigger only acts on a **null** `tasklist_id`.
- Checklist rows (`kind='checklist'`) are never moved or defaulted.
- Programme deliverables (`source='programme'`) are never picked as General, guarded, or re-flagged.
- Existing `is_default` flags are never cleared (D1).
- No new rename/delete UI or API for task lists.
- `projects-old/` (legacy route) modal and list view: unchanged. The trigger still covers their data.
- Zoho import/sync routes (`api/admin/zoho-*`, frozen) unchanged; any tasks they insert with a null list are covered by the trigger.

## Proposed File Changes

| File | Change |
|------|--------|
| `supabase/migrations/183_general_default_tasklist.sql` | **new**: function, trigger, pick-or-create for every project, backfill |
| `supabase/rollbacks/183_general_default_tasklist_down.sql` | **new**: drop both triggers + functions |
| `src/app/(hub)/projects/_shared/_create-task-modal.tsx` | placeholder `"General"` |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | fold orphans into the default/General group; fallback label `"General"` |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | `allGroupIds` matches the new fallback condition |
| `_docs/context/projects.md` | one line: null task list → General (trigger, migration 183) |

## Code Context

`_list-view.tsx:153-177` (current):
```ts
const groups = useMemo(() => {
  const tasklistIds = new Set(tasklists.map((tl) => tl.id));
  ...
  for (const t of tasks.filter((t) => !t.parent_task_id && t.depth === 0)) {
    if (t.tasklist_id && tasklistIds.has(t.tasklist_id)) { /* bucket */ } else { unassigned.push(t); }
  }
  for (const tl of tasklists) out.push({ id: tl.id, name: tl.name, tasks: sortTasks(buckets.get(tl.id) ?? []) });
  if (unassigned.length) out.push({ id: "__none", name: "No Tasklist", tasks: sortTasks(unassigned) });
```
Note `unassigned` also catches tasks whose `tasklist_id` points at a deliverable the view hides (Phase 1 programme).
Folding those into General is acceptable for display only; the backfill does **not** touch them (their `tasklist_id` is not null).

`_create-task-modal.tsx:95`: `useState(() => parent?.tasklist_id ?? tasklists.find((tl) => tl.is_default)?.id ?? "")`
already defaults to the `is_default` list. Line 219 sends `tasklist_id: finalTasklistId || undefined`.

Migration 160 compat view (`160_expand_project_phases_deliverables.sql:125`):
```sql
create view tasklists with (security_invoker = true) as
  select d.id, d.project_id, d.external_id, d.name, d.position, d.is_default, d.phase_id as milestone_id, …
  from project_deliverables d
  where not exists (select 1 from project_phases p where p.id = d.phase_id and p.source = 'programme' and p.phase_number is not distinct from 1)
```
The migration writes `project_deliverables` directly (not the view). RLS for `project_deliverables` is at 160:91-102.
Indexes on deliverables: `project_deliverables_project_key_uq (project_id, deliverable_key) where deliverable_key is not null`.
General has a null `deliverable_key`, so there's no conflict.

Trigger sketch:
```sql
create or replace function ensure_general_tasklist(p_project_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from projects where id = p_project_id) then return null; end if; -- project being deleted
  perform pg_advisory_xact_lock(hashtext('general_tasklist:' || p_project_id));
  select id into v_id from project_deliverables
   where project_id = p_project_id and phase_id is null and source <> 'programme' and lower(trim(name)) = 'general'
   order by created_at limit 1;
  if v_id is null then
    insert into project_deliverables (project_id, name, source, is_default, position)
    select p_project_id, 'General', 'manual', not bool_or(coalesce(is_default, false)) is true, coalesce(min(position), 0) - 1
      from project_deliverables where project_id = p_project_id
    returning id into v_id;
  end if;
  return v_id;
end $$;
```
(The implementer must check the actual NOT NULL columns of `project_deliverables` in `_sql/schema.sql` or
migration 160 §3 (`status`, `source`, day range check) and set any that lack defaults.)

## Implementation Steps

1. Read `160_expand_project_phases_deliverables.sql` §3 and §8 for `project_deliverables` columns/defaults/checks.
2. Write migration 183: `ensure_general_tasklist` → for each project `select ensure_general_tasklist(id)` (also flags
   an existing General as default where the project has no default, D1) → `project_deliverables_protect_general` trigger →
   backfill `update tasks …` → tasks trigger (insert + update). Wrap in `begin; … commit;`.
3. Write the rollback.
4. Modal placeholder.
5. List-view fold + label; `allGroupIds` in `_project-detail.tsx`.
6. `_docs/context/projects.md` line.
7. `npx tsc --noEmit`, eslint on the three files.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` + `pnpm exec eslint` on the 3 TSX files | clean | pre-merge |
| 2 | `grep -rn "No Tasklist" "src/app/(hub)/projects/_shared"` | no hits | pre-merge |
| 3 | Baseline query **before** applying 183: `select count(*) from tasks where tasklist_id is null and project_id is not null and kind is distinct from 'checklist';` | record N (> 0) | pre-apply |
| 4 | Same query **after** applying 183 | `0` | post-apply |
| 5 | `select p.id from projects p where not exists (select 1 from project_deliverables d where d.project_id = p.id and lower(trim(d.name)) = 'general');` | 0 rows | post-apply |
| 5b | **No regression (D1):** snapshot `select id from project_deliverables where is_default` before; after, every snapshot id still has `is_default = true`; new `is_default` rows are only Generals in projects with no prior default | holds | post-apply |
| 6 | `select project_id, count(*) from project_deliverables where lower(trim(name))='general' and source <> 'programme' group by 1 having count(*) > 1;` | 0 rows (duplicates merged by 183, D4); record the pre-apply count as baseline | post-apply |
| 7 | **No regression:** `select count(*) from tasks where kind = 'checklist' and tasklist_id is distinct from <baseline>`: compare checklist rows' `tasklist_id` snapshot before/after | unchanged | post-apply |
| 8 | **No regression:** snapshot `select id, tasklist_id from tasks where tasklist_id is not null` before; diff after | identical | post-apply |
| 9 | Re-run migration 183 body (idempotency) then checks 4–6 | same results, no new rows | post-apply (staging/branch DB) |
| 10 | MCP or Ops Chat `create_task` on a project (no list given) → `select tasklist_id` of the new row | = that project's General id | post-apply |
| 11 | As a **developer** (assignee), create a subtask under a task, via the subtask panel | 201; subtask has the parent's list (General if the parent was moved) | post-apply, browser |
| 12 | Browser: open any project's Tasks tab that had "No Tasklist" before | no "No Tasklist" group; those tasks are under **General** | post-apply |
| 13 | Browser: open New Task on a project | Task List shows **General** pre-selected; picking another list still saves to that list (**no regression**) | post-apply |
| 14 | Browser, **before** applying 183: Tasks tab with null-list tasks | they show in a group labelled "General" (fallback), page doesn't error | pre-merge (degrade path) |
| 15 | New project (created after 183), first task created with no list | General is created on the fly and holds the task | post-apply |
| 16 | D2: in a test project, create list "Tmp" with a task, `delete from project_deliverables where id = <Tmp>` | the task's `tasklist_id` = that project's General | post-apply (test project) |
| 17 | D2: `update tasks set tasklist_id = null where id = <task>` | row's `tasklist_id` = General afterwards | post-apply |
| 18 | D3: `update project_deliverables set name = 'Misc' where id = <General>` / `delete … where id = <General>` | both raise "The General task list cannot be renamed or deleted"; row unchanged | post-apply |
| 19 | **No regression:** delete a whole test project that has General + tasks (`delete from projects where id = <test project>`) | succeeds; no orphan `project_deliverables` row; no FK error | post-apply (test project) |
| 20 | **No regression:** merge wizard (468), when applied, on two test projects that both have General | completes; source tasks under target's General; no guard error | post-apply, if 180 applied |

## Coordination

| Task | Status | Overlap | Rule |
|------|--------|---------|------|
| 470 — Subtasks tab as listing table | Testing | edits `_shared/_list-view.tsx` (extracts `TaskRow`, ≤450 lines) | **land after 470**; reapply the grouping change on 470's version |
| 467 / 469 — nested subtasks, assignee subtasks | Testing | subtask insert path (`subtasks/route.ts`); the trigger runs on those inserts, developer RLS → `SECURITY DEFINER` | no file overlap; check 11 covers it |
| 468 — Project merge wizard (migration 180) | Testing | `merge/execute-tasks.ts` moves tasks/lists between projects. With D2 a "skip list" null lands in the target's General; with D3 moving a General (`project_id` change) is allowed but can leave two Generals in the target | non-blocking; plan.ts already flags same-named lists ("Same task list already exists") → fold. Check 20. Tell 468's tester |
| 429 — Programme-engine cutover | In Progress (tracker) / Planned (doc) | touches `project_deliverables` / seeds | no shared file; trigger excludes nothing programme-specific but seeds always set `tasklist_id`, so it's inert for them |
| 430 — rename `tasks.tasklist_id → deliverable_id` | Planned | trigger/function reference `tasks.tasklist_id` | **430 must update `ensure_general_tasklist` trigger** to the new column; add a note to 430's doc when 486 lands (430 not claimed) |
| 056 — Create Task modal project + tasklist | In Progress (since 2026-06-08) | `_create-task-modal.tsx` | one-line placeholder change; likely stale, check with its owner |
| 476 / 482 | Testing (migrations 181/182 unapplied) | migration numbering | **apply 183 after 181 and 182** |

## Open Decisions

- **D1 — RESOLVED (2026-11-18): keep existing defaults.** General is flagged `is_default` only in projects with no default.
  Projects with a Zoho-imported default keep preselecting it in the modal. Empty selection still goes to General.
- **D2 — RESOLVED (2026-11-18): auto-move.** The trigger also fires on `UPDATE OF tasklist_id, project_id`, so a deleted or
  cleared list moves its tasks to General. Requires the project-delete guard.
- **D4 — RESOLVED (2026-11-18, after test run 1): General under a phase counts; duplicates are merged.** The user asked:
  "If there are duplicate General task list, merge them." General = non-programme list named General, **with or without a phase**
  (Zoho Generals usually sit under a milestone). Per project the migration keeps one (no phase first, then oldest) and moves the
  others' tasks into it. A default flag carries over, and the duplicates are deleted. A kept General stays under its milestone.
  One-time cleanup in the migration only: no ongoing guard against new duplicates (the modal already blocks a same-name list;
  the 468 merge wizard can still move a General into a project that has one).
- **D3 — RESOLVED (2026-11-18): protect General.** DB trigger blocks renaming/deleting General (project cascade delete, and
  deleting an extra duplicate, allowed). No UI exists to hide.

## Operator Steps

1. Run baseline queries 3, 7 (snapshot) and 8 (snapshot) and save them under `_docs/task/486-*/out/` (git-ignored).
2. Apply migrations **181 → 182 → 183** in order to the shared database (183 is written-not-applied on merge).
3. Run post-apply checks 4–6 and 7–8 diffs.
4. Deploy: the Next.js app only (the three TSX files are imported only by the `(hub)/projects` routes; found via
   `grep -rln "_list-view\|_create-task-modal\|_project-detail" src`). No worker or cron changes.

## Baseline

- Check 1 `npx tsc --noEmit`: **1 error, pre-existing and unrelated** (`.next/types/app/(hub)/dashboard/users/page.ts` `ROLE_OPTIONS` export, also noted in 484). eslint not run before the change.
- Check 2 `grep -rn "No Tasklist" "src/app/(hub)/projects/_shared"`: **1 hit** (`_list-view.tsx:173`), so the check fails before the change.
- Checks 3/6/7/8 (live-DB counts and snapshots): **not run**. No DB access from this session; they are operator steps before applying 183.

## Implementation Notes

### What Changed
- Migration 183: `is_general_tasklist()` (one definition of "General"), `ensure_general_tasklist()` (`SECURITY DEFINER`, advisory lock,
  returns NULL when the project is gone, creates General first in position, `is_default` only where the project has none; also flags an
  existing General as default where there is none), backfill (General for every project, null-list non-checklist tasks moved), `tasks`
  trigger (insert + update of `tasklist_id`/`project_id`), `project_deliverables` guard trigger (rename/delete of General). Rollback drops triggers + functions.
- Listing: orphan top-level tasks fold into the General group; the fallback `__none` group (only when no General is visible) is labelled "General".
  `allGroupIds` matches. Modal placeholder "General".

### Files Changed
- `supabase/migrations/183_general_default_tasklist.sql` - new migration
- `supabase/rollbacks/183_general_default_tasklist_down.sql` - rollback (data backfill not reverted, explained in file)
- `src/app/(hub)/projects/_shared/_list-view.tsx` - `generalTasklistId()` export + fold/label
- `src/app/(hub)/projects/_shared/_project-detail.tsx` - `allGroupIds` only adds `__none` when no General list
- `src/app/(hub)/projects/_shared/_create-task-modal.tsx` - placeholder
- `_docs/context/projects.md` - "General" task list paragraph
- `_docs/task/486-general-default-tasklist.sql-check.mjs` - re-runnable PGlite check of migration 183

### Deviations From Plan
- **Listing folds orphans into the list named General, not the `is_default` list.** The plan was written before D1 resolved to "keep
  existing defaults". With D1, the default can be another (Zoho) list while the DB moves nulls to General, so folding by `is_default`
  would show them in the wrong group.
- Added `is_general_tasklist()` SQL helper so the trigger, guard and backfill share one General match (the plan inlined it).
- Backfill runs **before** the triggers are created (bulk update without per-row trigger calls). Same result.
- Coordination: 470 was already in the working tree (`_task-row`, `_task-table-parts` present), so the edit sits on 470's version as required.

### Verification Run
- `npx tsc --noEmit` - PASS relative to baseline (1 → 1 error, the same pre-existing `.next/types/.../dashboard/users` error)
- `pnpm exec eslint` on the 3 TSX files - PASS
- `grep -rn "No Tasklist" "src/app/(hub)/projects/_shared"` - PASS (baseline 1 → now 0)
- Migration 183 on PGlite 0.2.17 (Postgres 16 WASM) with a minimal schema mirroring `projects`/`project_phases`/`project_deliverables`/`tasks`
  (FK cascade/set null as in production), applied **twice** - PASS: null-list count 0 (check 4); one General per project (5, 6);
  Zoho default kept and General not default there, an existing `' general '` list reused and flagged default, programme "General" not picked (5b/D1);
  checklist rows untouched and pre-existing lists unchanged (7, 8); idempotent (9); insert with no list → General, explicit list kept, checklist stays null (10, 13);
  new project lazily gets General (15); deleting a list and clearing a task's list both → General (16, 17); moving a task to another project with null list → target's General;
  rename/delete of General raise, other lists renamable, extra duplicate General deletable, moving General between projects allowed (18);
  deleting a whole project with General + tasks succeeds, as does one holding two Generals (19).
- Rollback on PGlite - PASS (0 functions, 0 triggers left).
- Checks 3, 5–8 on the shared DB, 11, 12, 14, 20 (browser / live) - SKIPPED: migration not applied and no browser run in this stage; for the test stage / operator.
  PGlite doesn't model Supabase RLS, so check 11 (developer subtask via SECURITY DEFINER) is still open.

### Attempts That Failed
- First PGlite run failed with `role "anon" does not exist` (the test schema lacked Supabase roles, not a migration bug). Added the roles to the test schema; passed.

### Operator Steps
1. Before applying: run checks 3, 5b (snapshot), 7 and 8 (snapshots) and 6 (pre-existing duplicate Generals) on the shared DB; save under `_docs/task/486-general-default-tasklist/out/` (git-ignored).
2. Apply migrations **181 → 182 → 183** in order.
3. After: checks 4, 5, 5b, 6, 7, 8 diffs, then 10–20.
4. Deploy: Next.js app only. The three changed TSX files are imported only within `src/app/(hub)/projects/_shared` and the `(hub)/projects` routes
   (`grep -rln "_list-view\|_create-task-modal\|_project-detail" src`). No worker/cron change.
5. Tell task 430's owner that both 183 triggers reference `tasks.tasklist_id` / `project_deliverables` columns, and tell 468's tester about check 20.

## Quality Gate Notes

### Result
PASS (after two fixes made during the gate, below)

### Standards Review
- **Fixed during gate: RPC exposure.** `ensure_general_tasklist()` is `SECURITY DEFINER` and was granted to `authenticated`, so any signed-in
  user (incl. `client`) could call it as a PostgREST RPC and create a General list / set `is_default` in any project, bypassing RLS.
  Now `EXECUTE` is revoked from `public, anon, authenticated`, and `tasks_default_general_tasklist()` is itself `SECURITY DEFINER` (a trigger
  function can't be called as an RPC), so the function is reachable only through the trigger.
- **Fixed during gate: guard bypass.** `project_deliverables_protect_general()` ran with the caller's RLS. A caller who can't see the project
  (e.g. a non-Test User on a test project, migration 181) would look like a cascade delete, so the guard would allow it. Now `SECURITY DEFINER`.
- Re-verified on PGlite: `.sql-check.mjs` ALL CHECKS PASS, rollback PASS, and new `486-general-default-tasklist.priv-check.mjs` PRIV PASS
  (as `authenticated` with no deliverable insert/project read: insert → General; direct `select ensure_general_tasklist(...)` → permission denied;
  delete General → guard error).
- No dead code, no `any`, no debug logging. `generalTasklistId()` is the single UI definition, used by both the listing and `allGroupIds`;
  `is_general_tasklist()` is the single SQL definition.
- Repo conventions: migration in `supabase/migrations/` (can't legitimately abort), rollback in `supabase/rollbacks/`, no hardcoded secrets, Tailwind/UI untouched apart from strings,
  CLAUDE.md "written, not applied": the UI degrades (orphans show in a "General" fallback group until 183 is applied).

### Deviations
- **Minor:** the listing folds into the list named General, not the `is_default` list (forced by D1; recorded in Implementation Notes).
- **Minor:** the UI match (`name` + no `milestone_id`) can't see `source` (the `tasklists` view doesn't expose it). A programme deliverable named
  "General" with a null phase would match the UI but not the DB. Not realistic: programme deliverables always carry a phase.
- **Minor:** the shared `is_general_tasklist()` helper and the backfill running before the triggers were created. Same behaviour as planned.

### Acceptance Criteria Coverage
- 1, 2: run, pass. 4–10, 13 (data), 15–19: proven on PGlite, still to re-run on the shared DB after apply. 11: the privilege side is proven on PGlite
  (priv check); real RLS is still post-apply. 12, 13 (UI), 14, 20: browser/live, pending in test. 3: operator baseline before apply.
- Weak spot: PGlite uses a minimal schema copy, not the real one. Real column defaults/constraints of `project_deliverables` (e.g. the day-range check)
  are only covered by reading migration 160, and get proven when 183 is applied.

### Required Fixes
- None outstanding.

### Revision 2 (2026-11-18): after test FAIL (General under a phase) + D4 (merge duplicates)
- `is_general_tasklist(name, source)`: phase condition dropped (signature changed; 183 was never applied, so no compat needed). Rollback updated.
- `ensure_general_tasklist` picks `order by phase_id is not null, created_at, id` (same keeper order as the merge).
- Backfill step 1 (new): temp table `general_lists` ranks Generals per project. Tasks in duplicates (checklist rows incl.) move to the keeper,
  `is_default` carries over, duplicates are deleted. Only `tasks.tasklist_id` references deliverables (`_sql/schema.sql:7144`; no other
  `*tasklist_id`/`*deliverable_id` column in migrations). Step 3's null backfill now joins the single General directly.
- `generalTasklistId()`: matches by name regardless of `milestone_id`, preferring one without.
- `.sql-check.mjs` gained P7 (General only under a phase: reused, no new list, orphan moved in) and P8 (three Generals, the oldest default
  and phased: merged into the no-phase one, default carried, 2 deleted, all 4 rows incl. checklist in keeper).
- Verification: `.sql-check.mjs` ALL CHECKS PASS, `.priv-check.mjs` PRIV PASS, rollback PASS; tsc 1 error (pre-existing, unchanged); eslint pass;
  browser `7149F820-PROJ-01` (pre-apply) 2 "General" groups (2/12) → **1 group (14)**.
- Acceptance check 6 now means "Generals of any phase": `select project_id, count(*) from project_deliverables where lower(trim(name))='general' and source <> 'programme' group by 1 having count(*) > 1;` → 0 rows post-apply (pre-existing duplicates are merged, no exception).
