# 502: Move a task into a phase with no task list + make the task "Milestone" field move the task

**Created:** 2026-11-24
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Reported on **Valli Website** (StackShift II): a PM tried to move tasks (e.g. "Post-live feedback")
into the **Splash page** phase. In the Move task dialog, "Splash page" and "Build Phase" couldn't be
selected; only "General" could. Setting the task's **Milestone** field to "Splash page" on the task
page saved, but the Tasks tab still showed the task under General.

### Root cause (code-confirmed; Valli's data still to be confirmed, see Verification)

The Tasks tab tree (task 487, `_task-tree.ts`) is **Phase (milestone) › Group (task list) › task**.
A task's phase is derived only from its task list: `tasks.tasklist_id → tasklists.milestone_id`.
`tasks.milestone_id` is never read for grouping.

1. **Empty phases can't be picked in the Move dialog.** `MoveTaskDialog` renders each phase as an
   `<optgroup label={milestone.name}>` holding that phase's task lists. Splash page and Build Phase
   have **no task lists**, so they render as empty `<optgroup>` labels. Browsers don't let you
   select those. Drag-and-drop fails the same way: `resolveTaskMove` drops onto a phase via
   `phase.groups[0]`, which is `undefined` for an empty phase, so it returns `null`.
2. **The task page's Milestone field is disconnected from the tree.** It PATCHes
   `tasks.milestone_id` directly (`_task-detail.tsx:314` → `api/v2/tasks/[taskId]/route.ts:60`).
   The tree ignores that column, and the next `move_task` overwrites it with the list's milestone
   (migration 184, lines 111/118). So the field shows "Splash page" while the task sits in General.
3. **There's no in-app way to put a task list under a phase that has none.** `POST
   /api/v2/projects/[projectId]/tasklists` ignores `milestone_id` (it's only used by the New Task
   modal's "create list"). The only path is dragging an existing list onto the phase band.

### Decisions (confirmed with user 2026-11-24)

- **D1 — Auto-create a list.** The Move dialog (and drag-drop onto an empty phase band) offers each
  empty phase as a target. Choosing it creates a task list **named after the phase** (e.g.
  "Splash page") under that phase, then moves the task into it.
- **D2 — The Milestone field moves the task.** Changing Milestone on the task page moves the task
  (and its subtree) into that phase's **first** task list by position, auto-creating one (D1) if the
  phase has none. "None" moves it to the project's General list. The field and the Tasks tab then
  always agree.

## Requirements

- [ ] **R1 — Server: move by phase.** `POST /api/v2/tasks/[taskId]/move` also accepts
      `{ milestone_id: <uuid> | null }` **instead of** `tasklist_id` (exactly one of the two keys).
      The route resolves the target list:
      - `milestone_id` = uuid → the milestone must belong to the task's project (else 400). Pick its
        first task list (`order by position nulls last, created_at`), excluding `source = 'programme'`
        lists only if the tree also excludes them (check `tasklists` view columns). If there is none,
        **create** one: `{ project_id, name: milestone.name, milestone_id, position: max+1 }`.
      - `milestone_id` = null → the project's General list (`generalTasklistId` rules: name
        "general", no phase first). Migration 183 guarantees one exists; if it doesn't, 409
        `"This project has no General list"`.
      Then call `move_task` with `parent_task_id = null`, `before_id = null`, `after_id = null`
      (append to the end of the list). Response: `{ tasks: Task[], tasklist: Tasklist | null }`
      (`tasklist` is the created list, or null). The existing `tasklist_id` request and response
      shapes are unchanged.
- [ ] **R2 — Who can auto-create.** The list insert uses the **session** client (`tasklists_pm_write`
      RLS: admin, super_admin, pm). If the insert is denied, return 403 `"Only a PM can add this phase's
      first task list"`. Moving into a phase that already has a list keeps the current
      `canEditDetails` rule.
- [ ] **R3 — Move dialog.** For a phase with no task lists, render one selectable option inside its
      optgroup: `"<Phase name> (new list)"` (value `phase:<milestoneId>`). Selecting it clears the parent
      and disables the Parent task select (an empty list has no parents). "Move task" then sends
      `milestone_id`.
- [ ] **R4 — Drag-drop onto an empty phase band** (`zone: "into"`) resolves to the same phase move
      instead of `null`.
- [ ] **R5 — Client move handler.** `useTaskMoves.moveTask` handles a phase move with no optimistic
      placement (the list may not exist yet). It shows a loading toast, and on success merges the
      returned tasks and adds the returned `tasklist` to `tasklists` state. On failure it shows an
      error toast; there's nothing to revert.
- [ ] **R6 — Task page Milestone field** (v2 `_task-detail.tsx` and legacy `legacy/.../_task-detail.tsx`):
      `onChange` calls `POST /api/v2/tasks/[taskId]/move` with `{ milestone_id }` instead of
      PATCHing `milestone_id`. It shows the field's existing saving state and reverts on error with a
      toast. No request if the value didn't change.
- [ ] **R7 — Subtasks.** For a subtask (`parent_task_id` set), the Milestone field is **disabled** and
      captioned "Follows the parent task". Subtasks share their root's list (task 487 invariant), and
      moving one by phase would detach it.
- [ ] **R8 — The Milestone field reflects the list.** The field's value is the task's list's
      milestone (`tasklists.milestone_id` of `task.tasklist_id`). It falls back to `task.milestone_id`
      only if the list isn't loaded, so rows already out of sync display what the Tasks tab shows.

## Out of Scope / Must-Not-Change

- No migration. `move_task` (migration 184) is unchanged. A phase move only picks or creates the list
  and then reuses it.
- No "+ Add task list" button on phase bands (D1 picked auto-create only).
- No backfill of existing rows where `tasks.milestone_id` disagrees with the list's milestone. Valli's
  "Post-live feedback" is fixed by re-picking Splash page after this ships. A read-only diagnostic
  query is below.
- `PATCH /api/v2/tasks/[taskId]` still accepts `milestone_id` (MCP and other callers). Retiring it is
  a follow-up.
- The New Task modal, the `POST .../tasklists` route, and phase/list reordering are unchanged.
- The MCP route is unchanged, so `_docs/mcp-tools.md` stays as is.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/tasks/phase-tasklist.ts` | Create | `resolvePhaseTasklist(supabase, projectUuid, milestoneId \| null)` → `{ tasklistId, created: Tasklist \| null } \| { error, status }` (R1/R2) |
| `src/app/api/v2/tasks/[taskId]/move/route.ts` | Modify | Accept `milestone_id`; resolve via helper; new response shape for that path |
| `src/app/(hub)/projects/_shared/_tasks/_move-rules.ts` | Modify | `TaskMove` gains a phase variant; `resolveTaskMove` returns it for an empty phase (dialog + drop) |
| `src/app/(hub)/projects/_shared/_tasks/_move-task-dialog.tsx` | Modify | R3 option, parent select disabled for it |
| `src/app/(hub)/projects/_shared/_tasks/_use-task-moves.ts` | Modify | R5 |
| `src/app/(hub)/projects/[classification]/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | R6–R8 |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | R6–R8 (same field) |
| `_docs/task/487-move-rules.check.ts` | Modify | Cases: empty-phase drop/dialog → phase move; non-empty phase unchanged |

## Code Context

### `_move-task-dialog.tsx` — why the phases can't be selected

```tsx
{ctx.phases.map((p) => {
  const opts = p.groups.filter((g) => g.id !== NO_LIST).map((g) => <option key={g.id} value={g.id}>…</option>);
  const label = (p.milestone as { name?: string } | null)?.name;
  return label ? <optgroup key={p.key} label={…label}>{opts}</optgroup> : opts;   // empty phase → empty optgroup
})}
const move = resolveTaskMove(ctx, task.id, parentId ? { kind: "task", id: parentId, zone: "nest" } : { kind: "group", id: groupId, zone: "into" }, anywhere);
```

### `_move-rules.ts`

```ts
export type TaskMove = { taskId; tasklistId; parentId; beforeId; afterId; depth };
// phase target: const gid = … ctx.phases.find((p) => p.key === target.id)?.groups[0]?.id;  if (!gid) return null;  ← empty phase
const sameSlot = …; if (!anywhere && !sameSlot) return null;
```

Suggested shape: `TaskMove = ListMove | PhaseMove`, where
`PhaseMove = { kind: "phase"; taskId; milestoneId: string; depth: 0 }`. Return it when the target
phase has `milestone` set and `groups.length === 0`. It needs `anywhere` (a list change), and
`subtreeHeight <= MAX_DEPTH` is trivially true at depth 0. The dialog encodes it as group id
`phase:<milestoneId>`. Keep the file free of React imports (the `.check.ts` runs it under tsx).

### `_use-task-moves.ts` — current list move (keep as is for `ListMove`)

```ts
const milestoneId = tasklists.find((l) => l.id === m.tasklistId)?.milestone_id ?? null;  // optimistic
… fetch(`/api/v2/tasks/${m.taskId}/move`, { method: "POST", ...json({ tasklist_id, parent_task_id, before_id, after_id }) });
if (res.status === 503) setCrossDisabled(true) …   // migration 184 missing — same handling for phase moves
const rows = new Map((Array.isArray(body) ? body : [body]).map(…));
```

### `api/v2/tasks/[taskId]/move/route.ts`

Validates `tasklist_id` as a required UUID; reads the task with the **session** client (RLS 404);
gates with `getTaskEditPermission` (a list change needs `canEditDetails`); calls
`(adminClient as any).rpc("move_task", …)` (documented exception); maps `42883`/`PGRST202` to 503
and `23514` to 400; `touchProject` when not same-slot. Add the `milestone_id` branch **after** the
permission check: list changes already require `canEditDetails`, so resolve the list only then.

### `tasklists` facts

- `tasklists` is a compat **view** over `project_deliverables` (migration 160). `POST
  .../tasklists` inserts through it today, so an insert with `milestone_id` should work too. Verify the
  view exposes `milestone_id` as insertable (it's updatable: `moveGroup` PATCHes it).
- RLS `tasklists_pm_write` (048): `for all … get_my_role() in ('admin','super_admin','pm')`.
- Migration 183: every project has a "General" list (a trigger creates it on demand); it can't be
  renamed or deleted.
- `generalTasklistId()` in `_task-tree.ts` holds the "General" pick rule. The server helper should
  use the same rule; the module is pure, so import it or copy the one-liner with a comment.

### `_task-detail.tsx` (v2; legacy is the same at lines 116/312)

```tsx
const [milestoneId, setMilestoneId] = useState(task.milestone_id ?? "");   // line 118
<Meta label="Milestone"><select value={milestoneId} onChange={(e) => { …; void saveField({ milestone_id: next || null }); }}
  disabled={!perm.canEditDetails} …>
  <option value="">None</option>{milestones.map(…)}</select></Meta>
```

Check what tasklist data the page already has for R8 (props at lines ~74–84). If none, add
`milestone_id` of the task's list to the page's server load. It's a single row.

### Diagnostic (read-only, for the operator; not part of the code)

```sql
-- Tasks whose own milestone disagrees with their list's phase (what the Tasks tab shows).
select t.display_id, t.title, m1.name as task_milestone, m2.name as list_phase, tl.name as list
from tasks t
join tasklists tl on tl.id = t.tasklist_id
left join milestones m1 on m1.id = t.milestone_id
left join milestones m2 on m2.id = tl.milestone_id
join projects p on p.id = t.project_id
where p.name = 'Valli Website' and t.milestone_id is distinct from tl.milestone_id;
```

## Implementation Steps

1. `src/lib/tasks/phase-tasklist.ts` helper (pick-or-create; General for null).
2. Move route: `milestone_id` branch → helper → `move_task` → `{ tasks, tasklist }`.
3. `_move-rules.ts`: `PhaseMove` variant and empty-phase resolution. Extend `487-move-rules.check.ts`
   and run it.
4. Dialog option (R3) and `useTaskMoves` phase path (R5); wire drag-drop (R4).
5. Task detail Milestone field (v2 + legacy): R6–R8.
6. `npx tsc --noEmit`, `npx tsx _docs/task/487-move-rules.check.ts`, browser checks.

## Acceptance Criteria

- [ ] On Valli Website, the Move dialog lists "Splash page (new list)" and "Build Phase (new list)",
      and both can be selected.
- [ ] Moving "Post-live feedback" to "Splash page (new list)" creates a "Splash page" list under the
      Splash page phase. The task (with any subtasks) appears there; General no longer shows it.
- [ ] A second move into Splash page reuses that list (no second list is created).
- [ ] Dragging a task onto an empty phase band does the same as the dialog.
- [ ] On the task page, changing Milestone to Build Phase moves the task under Build Phase on the
      Tasks tab. "None" moves it to General.
- [ ] The Milestone field on a subtask is disabled with "Follows the parent task".
- [ ] A task whose `milestone_id` disagrees with its list shows the list's phase in the Milestone field.
- [ ] A non-PM editor moving into an empty phase gets "Only a PM can add this phase's first task list".
      Moving into a phase that already has a list still works for them.
- [ ] Existing list-to-list moves, reorders, subtask nesting, and the 503 "needs migration 184" path
      are unchanged.

## Verification

```bash
npx tsc --noEmit
npx tsx _docs/task/487-move-rules.check.ts
npx eslint <changed files>
```

- First, confirm Valli's data matches the root cause: Splash page and Build Phase are milestones with
  zero task lists, and "Post-live feedback" has `tasklist_id` = General with `milestone_id` = Splash
  page (diagnostic query above, or the Tasks tab showing the phase bands empty).
- Browser (PM): acceptance criteria 1–7 on Valli Website, or on a test project with an empty phase.
- Browser (developer editor): criterion 8.
- Regression: drag between two existing lists, reorder within a list, nest as a subtask.

## Compatibility Touchpoints

- No migration and no env vars. Needs migration 184 (`move_task`), the same as every cross-list move
  today. Without it, a phase move returns the existing 503.
- The move route's `milestone_id` path returns an object (`{ tasks, tasklist }`), not an array. Only
  the new client path reads it.
- `_docs/context/programme.md` / `projects.md`: at the document stage, note that a task's phase comes
  from its list and that the Milestone field moves the task.

## Implementation Notes

### What Changed
- New server helper `resolvePhaseTasklist()` picks the phase's first list, or creates one named after the phase (PM roles only). `null` resolves to General.
- `POST /api/v2/tasks/[taskId]/move` accepts `{ milestone_id }` instead of `tasklist_id`. It requires `canEditDetails`, resolves the list, then runs `move_task` as a top-level append. Response: `{ tasks, tasklist }`. If the task is already a top-level task in that list, it returns `{ tasks: [], tasklist: null }` without reordering.
- `_move-rules.ts`: new `PhaseMove` / `AnyTaskMove` / `isPhaseMove`. `resolveTaskMove` returns a `PhaseMove` for a phase with a milestone and no lists (needs `anywhere`). This covers the Move dialog and drag-drop onto an empty phase band (R4 needed no drag-hook changes: `_use-list-dnd.ts` already goes through `resolveTaskMove`).
- Move dialog: an empty phase shows `"<phase> (new list)"`; picking it disables the Parent select.
- `useTaskMoves.moveTask` sends a phase move non-optimistically: a loading toast becomes success or error, the returned rows are merged and the new list is added to state. A 503 also flips `crossDisabled`.
- Task page (v2 and legacy): the Milestone field calls the move route (`changePhase`). It reverts with an error toast on failure, shows "Moving…" with a spinner, and calls `router.refresh()` on success. It's disabled with "Follows the parent task" on subtasks. Its initial value is the task list's phase (R8), which the server page now loads alongside the parent breadcrumb.

### Files Changed
- `src/lib/tasks/phase-tasklist.ts` - new (R1/R2)
- `src/app/api/v2/tasks/[taskId]/move/route.ts` - `milestone_id` branch
- `src/app/(hub)/projects/_shared/_tasks/_move-rules.ts` - phase-move variant
- `src/app/(hub)/projects/_shared/_tasks/_move-task-dialog.tsx` - R3
- `src/app/(hub)/projects/_shared/_tasks/_use-task-moves.ts` - R5
- `src/app/(hub)/projects/[classification]/[projectId]/tasks/[taskId]/page.tsx` + `_task-detail.tsx` - R6–R8
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/page.tsx` + `_task-detail.tsx` - R6–R8
- `_docs/task/487-move-rules.check.ts` - empty-phase cases; existing `.tasklistId` assertion adapted to the union type

### Deviations From Plan
- Server pages (`page.tsx`, both variants) changed for R8; the doc had said "check if the page has list data". It didn't, so one `tasklists.milestone_id` read was added, run in parallel with the existing parent-task read.
- R2: an explicit role check (`LIST_CREATE_ROLES`, which mirrors `tasklists_pm_write`) runs before the insert. The RLS `42501` mapping stays as a backstop, because the insert goes through the `tasklists` compat view and an RLS denial's error code there isn't guaranteed.
- R1: no `source = 'programme'` filter when picking the phase's first list. The `tasklists` view has no `source` column, and the tree doesn't filter by source either, so the pick matches what the Tasks tab shows.
- `phase-tasklist.ts` (in `src/lib`) imports `generalTasklistId` from the pure `_task-tree.ts` module, so General has one rule shared by client and server.

### Known limitation
- If the list is created but `move_task` then fails (e.g. migration 184 missing → 503), the new empty list stays. It's reused by the next move into that phase.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx tsx _docs/task/487-move-rules.check.ts` - PASS
- `npx eslint` on the 9 changed source files - PASS
- Valli data confirmation + browser acceptance checks 1–9 - SKIPPED (pending the test stage; needs PM and developer accounts)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during the gate: after a Milestone change, the task page kept the picked value even when the task landed in a list under a different phase (e.g. "None" → a General list that sits under a phase, as with some Zoho imports). The value doesn't resync on `router.refresh()`, because `useState` reads its initial value once. `changePhase` now sets the field from the returned row's `milestone_id`. Applied to both v2 and legacy.
- Fixed during the gate: removed a non-null assertion (`body.tasklist!`) inside a state-updater closure in `useTaskMoves`.
- After the fixes: `npx tsc --noEmit`, `npx tsx _docs/task/487-move-rules.check.ts`, and eslint on the touched files all PASS.
- Route: the `milestone_id` branch is permission-checked (`canEditDetails`) before any list lookup or create. Invalid ids → 400 via the existing `idOrNull`. A no-op returns early without reordering. The legacy `tasklist_id` path and its array response are unchanged.
- The only `any` is the pre-existing, commented `adminClient.rpc("move_task")` escape hatch (generated types lag). No new ones.
- `v2/_task-detail.tsx` and `legacy/_task-detail.tsx` both get the same `changePhase`. That duplication already existed between the two files and wasn't consolidated here, because it's out of scope.

### Deviations
- Minor (from Implementation Notes): the server pages load the list's phase; an explicit `LIST_CREATE_ROLES` check runs before the insert; no `programme` source filter; `src/lib/tasks/phase-tasklist.ts` imports the pure `generalTasklistId` from `_task-tree.ts`, so lib depends on an app-folder module. That's acceptable for one shared rule; move it to `src/lib/tasks/` if more callers appear.
- Minor (known limitations, accepted): (a) if `move_task` fails after the list is created, an empty list remains and is reused on the next move; (b) two simultaneous first moves into the same empty phase can create two lists. Both are rare and visible, and neither loses data.

### Required Fixes
- None.
