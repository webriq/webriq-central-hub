# Task 091 — List View: Status Normalization, Priority Fix & Zoho-Style UI Overhaul

> **Status:** COMPLETED
> **Completed:** 2026-06-29
> **Type:** patch + enhancement
> **Priority:** HIGH
> **Version Impact:** patch
> **Recommended Model:** haiku

---

## Problem

Three separate issues with the Project Detail list view:

1. **Status crash / wrong mapping** — The Zoho import route (`zoho-import/tasks/route.ts:157`) stores raw Zoho status names (`"Open"`, `"In Progress"`) directly into `tasks.status`. The `STATUS_STYLE` / `STATUS_LABEL` maps in `_pm-shared.tsx` use normalized keys (`"open"`, `"in_progress"`). Lookups miss → `ss` is `undefined` → `Cannot read properties of undefined (reading 'text')` crash. A `mapTaskStatus()` helper already exists in `zoho-import.ts` but is not called. Existing DB rows also have the wrong format so the display layer also needs a normalizer.

2. **Priority "None" mismatch** — Zoho sends `"none"` for tasks with no priority. `mapPriority()` converts this to `"normal"`, which displays as "Normal" (blue). Zoho shows "None" (with an `!` indicator). Users see all tasks as "Normal" even if they had no priority in Zoho.

3. **UI lacks hierarchy / multi-select** — No checkboxes, tasklist groups blend into task rows making it hard to tell what belongs where, no indentation or left accent on task rows.

---

## Requirements

### Status Fix (import + display)
- In `zoho-import/tasks/route.ts`, replace `t.status?.name ?? "Open"` with `mapTaskStatus(t.status?.name ?? "", t.is_completed ?? false)`. Import `mapTaskStatus` from `@/lib/migrate/zoho-import`.
- Add a `normalizeStatus(s: string): TaskStatus` helper to `_pm-shared.tsx` that handles both formats at render time (for existing DB rows):
  - Maps `"Open"` → `"open"`, `"In Progress"` → `"in_progress"`, `"Ready for QA/QC"` → `"ready_for_qa"`, `"Testing Completed"` → `"testing_completed"`, `"For Client Approval"` → `"for_client_approval"`, `"Ready to Merge"` → `"ready_to_merge"`, `"Post-live QA/QC"` / `"Post Live QA"` → `"post_live_qa"`, `"Closed"` / `"closed"` → `"closed"`
  - Any unknown value → `"open"` (fallback)
- In `_list-view.tsx` Row: use `normalizeStatus(task.status)` instead of `task.status` for all style/label lookups. Keep the `?? STATUS_STYLE["open"]` safety fallback.
- In `_pm-shared.tsx` `StatusBadge`: wrap with `normalizeStatus(status)` for the style lookup.

### Priority "None" Display
- Add a `"none"` entry to `PRIORITY_STYLE` in `_pm-shared.tsx`:
  ```
  none: { label: "None", text: "#94A3B8", dot: "#94A3B8" }
  ```
- Update `mapPriority()` in `zoho-import.ts`: if the zoho value is empty string or `"none"`, return `"none"` (not `"normal"`).
- Update `TaskPriority` alias and all maps to include `"none"`. The DB column is `"low" | "normal" | "high" | "critical"` — the "none" will only exist as a display concept for `mapPriority` returning it; update the import route `priority` type to also accept `"none"` string (it's stored as a string in the `tasks` table anyway since status is `string`, but priority is typed — so actually just add `"none"` to the union in the import `TaskRow` type and in the DB row type if needed, OR keep mapPriority returning `"normal"` and add a `"none"` display-only path).

  **Simpler approach**: keep `mapPriority` returning `"normal"` for `"none"` input (the DB schema enforces `"low"|"normal"|"high"|"critical"`). Instead, add a `PRIORITY_STYLE` entry for `"none"` as a display-only fallback: `PRIORITY_STYLE["none"] = { label: "—", text: "#94A3B8", dot: "#94A3B8" }`. In `_list-view.tsx` Row, look for `PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE["none"]` — the existing fallback we added covers this. Update `PriorityBadge` in `_pm-shared.tsx` similarly.

  **Keep DB clean**: do NOT change `mapPriority` return type. "none" display entry is only a safety label shown when the DB has an unexpected value.

### UI Overhaul (list view)
Zoho reference (Image #7): checkboxes on left, tasklist header row has expand/collapse chevron + task list name + count, task rows indented with checkbox, columns: Task Name | Due Date | Priority | Created By | Completion%.

Our target (not a copy, but inspired): 
- **Checkbox column**: leftmost column, 32px wide. Checkbox per task row + header checkbox (select all visible). Use `useState<Set<string>>` for `selected` IDs. Show a slim action bar above the table when `selected.size > 0` (e.g. "X selected — [Clear]").
- **Column layout**: `[32px checkbox] [1fr title] [140px status] [120px priority] [110px due] [80px assignees]`
- **Tasklist group header**: left accent bar (3px, slate-400 color), bold name + count pill, chevron for collapse. The header row should visually stand out from task rows — slightly darker background (`bg-slate-100`), not the same `bg-slate-50/80`.
- **Task row indentation**: `pl-10` (instead of `pl-4`) so tasks are visually under the tasklist header. Add a subtle left border on task rows (`border-l-2 border-slate-100 ml-4`) to show nesting.
- **Status select**: keep the colored pill select but use `normalizeStatus` for accurate colors.
- **Priority display**: show as plain text with colored dot (current `PriorityBadge` style), not a select — priority changes are less common. Use `PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE["normal"]`.
- **Due date**: show overdue in red (`text-red-500`) when `due_date < today`, upcoming in orange within 7 days, else slate.
- **Column headers**: add checkbox in header (select-all). Remove the separate "Assignees" label, replace with an icon.

---

## File Changes

| File | Change |
|------|--------|
| `src/app/api/admin/zoho-import/tasks/route.ts` | Import and call `mapTaskStatus()` at line 157 |
| `src/lib/migrate/zoho-import.ts` | No change needed (mapTaskStatus already correct) |
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Add `normalizeStatus()`, add `"none"` to `PRIORITY_STYLE`, update `StatusBadge` + `PriorityBadge` |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Full UI overhaul — checkbox multi-select, column grid, tasklist header, row indentation, due date coloring |

---

## Code Context

### zoho-import/tasks/route.ts line 156-157 (current)
```ts
priority: mapPriority(t.priority ?? ""),
status: t.status?.name ?? "Open",   // BUG: stores raw Zoho name, not normalized key
```

### zoho-import/tasks/route.ts line 156-157 (fix)
```ts
priority: mapPriority(t.priority ?? ""),
status: mapTaskStatus(t.status?.name ?? "", t.is_completed ?? false),
```
Also add `mapTaskStatus` to the import at line 7:
```ts
import { mapPriority, mapTaskStatus, adminClient } from "@/lib/migrate/zoho-import";
```

### mapTaskStatus in zoho-import.ts (already correct, lines 23-36)
```ts
export function mapTaskStatus(zohoStatusName: string, isCompleted: boolean) {
  if (isCompleted) return "closed";
  const s = (zohoStatusName ?? "").toLowerCase();
  if (s.includes("progress")) return "in_progress";
  if (s.includes("qa") || s.includes("testing")) return "ready_for_qa";
  if (s.includes("client approval")) return "for_client_approval";
  if (s.includes("merge")) return "ready_to_merge";
  if (s.includes("post live") || s.includes("post_live")) return "post_live_qa";
  if (s.includes("closed") || s.includes("complete") || s.includes("done")) return "closed";
  return "open";
}
```

### normalizeStatus to add to _pm-shared.tsx
```ts
const STATUS_NORMALIZE: Record<string, TaskStatus> = {
  "open": "open", "in_progress": "in_progress", "ready_for_qa": "ready_for_qa",
  "testing_completed": "testing_completed", "for_client_approval": "for_client_approval",
  "ready_to_merge": "ready_to_merge", "post_live_qa": "post_live_qa", "closed": "closed",
  // Raw Zoho display names
  "Open": "open", "In Progress": "in_progress", "Ready for QA/QC": "ready_for_qa",
  "Testing Completed": "testing_completed", "For Client Approval": "for_client_approval",
  "Ready to Merge": "ready_to_merge", "Post-live QA/QC": "post_live_qa",
  "Post Live QA": "post_live_qa", "Closed": "closed",
};
export function normalizeStatus(s: string): TaskStatus {
  return STATUS_NORMALIZE[s] ?? "open";
}
```

### Current _list-view.tsx column grid (lines 104, 175)
```ts
// headers
"grid grid-cols-[1fr_140px_120px_110px_100px]"
// row
"grid grid-cols-[1fr_140px_120px_110px_100px]"
```

### Target column grid
```ts
"grid grid-cols-[32px_1fr_140px_120px_110px_80px]"
```

### Current tasklist group header (lines 117-126)
```tsx
<button onClick={() => toggleGroup(g.id)}
  className="w-full flex items-center gap-2 px-4 py-2 bg-slate-50/80 border-b border-slate-100 hover:bg-slate-100 cursor-pointer"
>
  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
  <span className="text-[12px] font-semibold text-slate-700">{g.name}</span>
  <span className="text-[11px] text-slate-400">({g.tasks.length})</span>
</button>
```

### Target tasklist group header
```tsx
<div className="flex items-center border-b border-slate-200 bg-slate-100">
  {/* 32px checkbox spacer */}
  <div className="w-8 shrink-0" />
  {/* left accent bar */}
  <div className="w-0.5 h-6 bg-slate-400 rounded-full mr-2 shrink-0" />
  <button onClick={() => toggleGroup(g.id)}
    className="flex items-center gap-2 flex-1 py-2 pr-4 cursor-pointer hover:opacity-80"
  >
    {isCollapsed ? <ChevronRight size={13} className="text-slate-500 shrink-0" />
                 : <ChevronDown size={13} className="text-slate-500 shrink-0" />}
    <span className="text-[12px] font-bold text-slate-700">{g.name}</span>
    <span className="text-[10px] font-medium text-slate-500 bg-slate-200 rounded-full px-1.5 py-0.5">{g.tasks.length}</span>
  </button>
</div>
```

### Target Row structure (abbreviated)
```tsx
function Row({ task, selected, onToggle, onOpen, onUpdate }) {
  const norm = normalizeStatus(task.status);
  const ss = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
  const ps = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE["normal"];
  const due = formatDueDate(task.due_date);
  const dueColor = getDueColor(task.due_date); // "text-red-500" | "text-orange-500" | "text-slate-500"

  return (
    <div className="grid grid-cols-[32px_1fr_140px_120px_110px_80px] items-center gap-3 pl-10 pr-4 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors group">
      <input type="checkbox" checked={selected} onChange={onToggle} className="rounded border-slate-300 cursor-pointer" />
      <button onClick={onOpen} ...>{task.title}</button>
      <select value={norm} onChange=... style={{ color: ss.text, ... }}> ... </select>
      <span style={{ color: ps.text }}>● {ps.label}</span>
      <span className={dueColor}>{due}</span>
      <AssigneeChip assignees={task.assignees} />
    </div>
  );
}
```

### Multi-select state in ListView
```tsx
const [selected, setSelected] = useState<Set<string>>(new Set());
function toggleRow(id: string) {
  setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
}
function toggleAll(ids: string[]) {
  setSelected(prev => ids.every(id => prev.has(id)) ? new Set() : new Set(ids));
}
```

### Due date color helper
```ts
function getDueColor(due: string | null): string {
  if (!due) return "text-slate-400";
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-red-500";
  if (days <= 7) return "text-orange-500";
  return "text-slate-500";
}
```

---

## Implementation Steps

1. **Fix import route** (`zoho-import/tasks/route.ts`):
   - Add `mapTaskStatus` to the import from `@/lib/migrate/zoho-import`
   - Replace `t.status?.name ?? "Open"` with `mapTaskStatus(t.status?.name ?? "", t.is_completed ?? false)`

2. **Add `normalizeStatus` to `_pm-shared.tsx`**:
   - Add `STATUS_NORMALIZE` lookup and `normalizeStatus()` export
   - Add `"none"` safety entry to `PRIORITY_STYLE` with label `"—"` and slate color
   - Update `StatusBadge` to call `normalizeStatus(status)` before style lookup
   - Update `PriorityBadge` to use `PRIORITY_STYLE[priority] ?? PRIORITY_STYLE["normal"]`

3. **Overhaul `_list-view.tsx`**:
   - Add `selected: Set<string>` state + `toggleRow` + `toggleAll` helpers
   - Add `getDueColor(due: string | null)` helper
   - Update column grid to `[32px_1fr_140px_120px_110px_80px]` everywhere (headers + rows)
   - Update header row: add checkbox (select-all for visible group tasks), update col labels
   - Update tasklist group header: left accent bar, `bg-slate-100`, bold + count pill
   - Add selection action bar above the table when `selected.size > 0`
   - Update `Row`: add checkbox prop, use `normalizeStatus`, add `pl-10` indentation, due date color, priority as text+dot (not select)
   - Import `normalizeStatus` from `../_pm-shared`

4. **TypeScript check**: run `npx tsc --noEmit` — fix any type errors (especially around the `"none"` priority entry since DB type is the union).

---

## Notes for Implementation Agent

- `task.status` in the DB is typed as `string` (not a union) — `normalizeStatus` return type should be `TaskStatus` which resolves to `string` too. This is fine. No DB type changes needed.
- `task.priority` is typed as `"low" | "normal" | "high" | "critical"` in the DB. Adding `"none"` to `PRIORITY_STYLE` as a `Record<string, ...>` (or just widening the key type) avoids TS errors. Use `as Record<string, typeof PRIORITY_STYLE[keyof typeof PRIORITY_STYLE]>` if needed.
- Do NOT change the `mapPriority` return type — it must stay within the DB-valid `"low"|"normal"|"high"|"critical"` values.
- The action bar for multi-select should be minimal: just a count + "Clear selection" link. No bulk-action buttons for now (those are a future feature).
- `AssigneeChip` is imported from `../_pm-shared` — keep using it.
- Priority is shown as read-only text (not a select) in the new design. Status remains a select since that's the primary action in the list.

---

## Implementation Notes

### What was built

**`src/app/api/admin/zoho-import/tasks/route.ts`**
- Added `mapTaskStatus` to the import from `@/lib/migrate/zoho-import`
- Replaced `t.status?.name ?? "Open"` with `mapTaskStatus(t.status?.name ?? "", t.is_completed ?? false)` — future imports now store normalized keys (`"open"`, `"in_progress"`, etc.) instead of raw Zoho display names

**`src/app/v2/(hub)/projects/_pm-shared.tsx`**
- Added `STATUS_NORMALIZE` lookup table and exported `normalizeStatus(s: string): string` — maps both raw Zoho names (`"Open"`, `"In Progress"`) and already-normalized keys to the correct style map key; existing DB rows with wrong format are fixed at render time
- Widened `PRIORITY_STYLE` key type to `Record<string, ...>` and added `"none"` entry (`label: "—"`, slate color) as a safe fallback for unmapped priority values
- `StatusBadge` now calls `normalizeStatus()` before style lookup + uses `?? STATUS_STYLE["open"]` safety fallback
- `PriorityBadge` now uses `PRIORITY_STYLE[priority] ?? PRIORITY_STYLE["normal"]`

**`src/app/v2/(hub)/projects/[projectId]/_list-view.tsx`** — full overhaul
- Column grid: `[32px_1fr_148px_116px_108px_80px]` with checkbox column
- Multi-select: `selected: Set<string>` state, per-row checkboxes, group-level select-all, `toggleRow` / `toggleGroup` helpers
- Selection action bar: flat amber bar (`bg-amber-50 border-b border-amber-200`) sits **outside** the scroll container (above it, `shrink-0`), shows count + X dismiss + "Trash" button (no functionality yet)
- Tasklist group header: `bg-slate-100`, left accent bar (3px slate-400), bold name + count pill, clearly distinguished from task rows
- Task rows: `normalizeStatus()` for status lookup, priority as read-only text+dot, due date color (red = overdue, orange ≤7 days, slate otherwise)
- Scroll fix: outer div is `h-full flex flex-col min-h-0`; scroll container is `flex-1 min-h-0 overflow-y-auto` (inner div) — separating layout from scroll prevented the `flex flex-col` breaking scroll behavior

### Deviations from spec
- Selection bar action chips: shipped only "Trash" (no functionality) per user request. "Status", "Priority", "Due Date" chips removed.
- `normalizeStatus` return type is `string` (not `TaskStatus`) since `TaskStatus = string` from the DB — no narrowing needed.

### TypeScript
- `npx tsc --noEmit` passes clean with zero errors.
