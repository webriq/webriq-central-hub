# Task 097 — List View: Inline Subtask Expand/Collapse

> **Status:** DONE
> **Completed:** 2026-06-30
> **Type:** feature
> **Priority:** HIGH
> **Version Impact:** minor
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Summary

Show Zoho-imported subtasks inline in the project task list view with a collapsible toggle per parent row. Subtask rows are indented by depth. Root tasks with children are pre-expanded by default (matching Zoho's behavior). A children count badge and tooltip make parent rows obviously expandable. Also fixed a bug in the Zoho task import where `parent_task_id` was left null for most subtasks due to Supabase's 1000-row default query limit.

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/v2/(hub)/projects/[projectId]/page.tsx` | Removed `.is("parent_task_id", null)` filter — all tasks (root + subtasks) fetched server-side |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Major: tree rendering, expand/collapse, depth indentation, pre-expand on load, count badge |
| `src/app/api/admin/zoho-import/tasks/route.ts` | **Bug fix:** Pass 2 `taskMap` now paginates through all tasks (was limited to first 1000 rows by Supabase default) |

---

## What Was Built

### `page.tsx`
Removed `.is("parent_task_id", null)` from the server-side tasks query so `initialTasks` now includes root tasks AND all subtasks. No other change.

### `_list-view.tsx` — full breakdown

**`DEPTH_INDENT` constant (module-level)**
Static array mapping depth 0–6 to Tailwind padding classes (`pl-0` … `pl-24`). Avoids dynamic class construction so Tailwind doesn't tree-shake them.

**`expandedRows` state — pre-expanded on mount**
Initialised via lazy `useState` initializer that scans `tasks` on first render: collects all `parent_task_id` values (the set of parent UUIDs), then marks every depth-0 task whose ID is in that set as expanded. Result: all root-level parents start expanded, showing their direct subtasks without any clicking — matches Zoho's default view.

**`childrenByParent` useMemo**
Builds `Map<parentId, Task[]>` from all tasks with non-null `parent_task_id`, sorted by `position`. Placed before any early return (React hook rules).

**`groups` useMemo — root-only filter tightened**
Changed bucket loop filter from `!t.parent_task_id` to `!t.parent_task_id && t.depth === 0`. Double condition guards against tasks where `parent_task_id` was null due to the import bug (those tasks have `depth > 0` but null parent — they're hidden rather than polluting the root list).

**`toggleExpand` + `renderRows`**
`toggleExpand` updates `expandedRows` state. `renderRows(list, depth)` is a recursive closure inside `ListView`: renders each task as a `<Fragment key>` wrapping a `Row` followed by `renderRows(children, depth + 1)` when expanded. Called with `g.tasks` (root tasks only) per group.

**`Row` — updated props and task-name cell**
`hasChildren: boolean` replaced with `childrenCount: number` to support the badge. Task-name cell now renders:
- Depth-based left padding via `DEPTH_INDENT[Math.min(depth, 6)]` on the container div
- A `w-5 h-5` chevron toggle button (`ChevronRight` / `ChevronDown`, `size={13}`, `text-slate-500`) when `childrenCount > 0`; a same-size spacer span otherwise to keep titles aligned
- A pill count badge `(N)` to the right of the title when the row is collapsed and has children — makes parent rows obviously identifiable at a glance
- Tooltip: `"Expand N subtask(s)"` / `"Collapse"` on the toggle button

### `zoho-import/tasks/route.ts` — bug fix

**Root cause:** Pass 2 built `taskMap` via a single Supabase query with no limit. Supabase's PostgREST default is 1000 rows. With 6,946 tasks, ~5,946 tasks were missing from the map, so `parentHubId` was `undefined` for most subtasks → `parent_task_id` stayed null.

**Fix:** Replaced the single query with a paginated loop (`range(from, from + 999)`) that accumulates all pages until an empty page is returned. `taskMap` now covers all 6,946 tasks, and Pass 2 correctly resolves all 4,268 parent links.

---

## Bug Fix Detail — Import Pass 2 Pagination

```ts
// BEFORE — truncated at 1000 rows
const { data: insertedTasks } = await adminClient
  .from("tasks")
  .select("id, external_id")
  .not("external_id", "is", null);

// AFTER — paginated, collects all rows
const allInsertedTasks: Array<{ id: string; external_id: string }> = [];
{
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data: page } = await adminClient
      .from("tasks")
      .select("id, external_id")
      .not("external_id", "is", null)
      .range(from, from + PAGE - 1);
    if (!page || page.length === 0) break;
    allInsertedTasks.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
}
```

After applying this fix, re-running the import sets `parents_resolved: 4268` in the SSE done event.

---

## Acceptance Criteria

- [x] Root tasks with children show a chevron toggle in the task-name cell
- [x] Root tasks with children are expanded by default on page load (matching Zoho behavior)
- [x] Clicking the chevron collapses children; clicking again expands
- [x] Root tasks without children show no toggle (spacer keeps titles aligned)
- [x] Subtask rows are indented 16 px per depth level (depth 1 = `pl-4`, depth 2 = `pl-8`, etc.)
- [x] Subtask rows at depth 2+ also show a chevron if they have children
- [x] Count badge `(N)` shows on collapsed parent rows
- [x] Tasklist group collapse hides all rows in that group (root + subtasks)
- [x] Sort controls apply to root tasks within each group
- [x] Select-all per tasklist group operates on root tasks only
- [x] No TypeScript errors (`npx tsc --noEmit` passes clean)
- [x] Import re-run after pagination fix sets `parent_task_id` on all 4,268 subtasks
