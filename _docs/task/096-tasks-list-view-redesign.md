# 096: Tasks List View Redesign — Zoho-style table with inline pickers, timer, and real name chips

**Created:** 2026-06-30
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** DONE
**Completed:** 2026-06-30

## Implementation Notes

### Post-implementation fix: Zoho owner → assignees backfill

After the list view shipped, tasks showed no assignees because the Zoho import did not populate `tasks.assignees`. Zoho stores owners in `owners_and_work.owners[].email` per task.

**Fix:** `supabase/migrations/046_backfill_task_assignees_from_zoho.sql`

- Reads 5,723 `(zoho_task_id, email)` pairs from all `_from_zoho/tasks-*.json` files
- Joins `tasks.external_id → auth.users.email → auth.users.id` (uuid)
- `array_agg(u.id ORDER BY u.email)` produces a `uuid[]` matching the `tasks.assignees` column type (initial attempt used `::text` cast which caused a type mismatch — fixed by removing the cast)
- Only updates rows where `assignees IS NULL OR assignees = '{}'`
- Coverage: 5,422 tasks assigned; 227 have multiple owners (2–7); 1,524 with "Unassigned User" skipped

**Additional file created:** `src/app/api/v2/projects/[projectId]/members/route.ts` and `src/app/api/v2/tasks/[taskId]/timelog/route.ts` (new API routes per original spec).

> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Overview

Redesign the tasks list view in `/v2/projects/[projectId]` to be a Zoho-inspired, slick table with:
- Inline status picker (already exists, needs visual polish)
- Assignee picker popup (new) showing real names
- Timer button (new) — visible only when the task is assigned to the current user
- Hours logged column (new) — sum from `time_logs` per task
- `ResolvedAssigneeChip` (new) — shows real initials from `full_name` instead of UUID characters

Aesthetic goal: compact, modern, non-AI-looking — subtle hover states, smooth transitions, data-dense without feeling cluttered.

---

## Requirements

- [ ] Column order: `[checkbox | task name | status | assignee | due date | priority | hours | timer]`
- [ ] Status column: keep inline `<select>` styled with existing `STATUS_STYLE` tokens; ensure visual polish (pill shape, correct colors)
- [ ] Assignee column: shows `ResolvedAssigneeChip` stacked avatars with real initials from `full_name`; click opens a popup picker following `ViewDropdown` pattern
- [ ] Assignee picker: lists all profiles WHERE `role IN ('developer', 'pm', 'admin')` from new `GET /api/v2/projects/[projectId]/members` endpoint; selecting a user toggles them in `task.assignees`; calls `onUpdate(id, { assignees: [...] })`
- [ ] Hours column: shows total logged hours for that task (sum from `time_logs`), formatted to 1 decimal (e.g. `2.5h`); shows `—` if zero
- [ ] Timer button: rendered only when `task.assignees?.includes(currentUserId)`; play icon → starts timer (stores `Date.now()` in local state); pause icon + elapsed time (MM:SS) while running → stop sends `POST /api/v2/tasks/[taskId]/timelog` with computed hours; optimistically increments hours column
- [ ] Timer is ephemeral — resets on page refresh; no DB column needed
- [ ] `ResolvedAssigneeChip`: new component in `_list-view.tsx` (not in `_pm-shared.tsx`); takes `id`, `idx`, `name?: string`; derives initials from name (`full_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()`); falls back to `id.replace(/-/g,'').slice(0,2).toUpperCase()` if no name
- [ ] `currentUserId` resolved server-side in `page.tsx` via `supabase.auth.getClaims()` and passed as prop
- [ ] `profilesById: Record<string, { full_name: string; avatar_url: string | null }>` built server-side and passed as prop
- [ ] `hoursById: Record<string, number>` built from a single `time_logs` aggregate query and passed as prop
- [ ] New API: `GET /api/v2/projects/[projectId]/members` — returns profiles for assignee picker; any authenticated session (no admin gate)
- [ ] New API: `POST /api/v2/tasks/[taskId]/timelog` — creates `time_logs` row; `employee_id` = current user id

---

## Out of Scope / Must-Not-Change

- `AssigneeChip` in `_pm-shared.tsx` — do not modify; board/calendar views must remain unchanged
- Board view, calendar view, milestone panel, task detail page, subtasks
- `_project-detail.tsx` internals beyond threading the two new props (`currentUserId`, `profilesById`, `hoursById`) and adding `hoursById` state update on timer stop
- No DB migrations — timer is purely client-state; `time_logs` table already exists

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/page.tsx` | Modify | Add `currentUserId`, `profilesById`, `hoursById` to server data fetch |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Accept + thread `currentUserId`, `profilesById`, `hoursById` props down to `ListView` |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Modify | Full redesign: new grid layout, `ResolvedAssigneeChip`, assignee picker popup, timer button, hours column |
| `src/app/api/v2/projects/[projectId]/members/route.ts` | Create | `GET` — returns profiles for assignee picker dropdown |
| `src/app/api/v2/tasks/[taskId]/timelog/route.ts` | Create | `POST` — creates `time_logs` row on timer stop |

---

## Code Context

### Current `Row` component — `_list-view.tsx:234-292`

```tsx
function Row({
  task, selected, onToggle, onOpen, onUpdate,
}: {
  task: Task;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
}) {
  const norm = normalizeStatus(task.status);
  const ss = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
  const ps = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE["normal"];
  const due = formatDueDate(task.due_date);
  const dueColor = getDueColor(task.due_date);

  return (
    <div className={`grid grid-cols-[32px_1fr_148px_116px_108px_80px] items-center gap-3 pl-4 pr-4 py-2.5 border-b border-slate-50 last:border-0 transition-colors ${selected ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} ... />
      <button onClick={onOpen} className="text-left min-w-0 cursor-pointer pl-6">
        <span className="text-[13px] text-slate-800 truncate block hover:text-blue-600">{task.title}</span>
      </button>
      <select
        value={norm}
        onChange={(e) => onUpdate(task.id, { status: e.target.value as TaskStatus })}
        className="text-[11px] font-medium rounded-full border px-2 py-0.5 outline-none cursor-pointer appearance-none"
        style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
      >
        {STATUS_OPTS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <span style={{ color: ps.text }}><span style={{ background: ps.dot }} />{ps.label}</span>
      <span className={`text-[12px] font-medium ${dueColor}`}>{due ?? "—"}</span>
      <div className="flex items-center">
        {(task.assignees ?? []).slice(0, 3).map((a, i) => (
          <div key={a} style={{ marginLeft: i > 0 ? -8 : 0 }}>
            <AssigneeChip id={a} idx={i} />  {/* ← uses UUID chars as initials */}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Current grid: `[32px_1fr_148px_116px_108px_80px]` — 6 columns. New grid adds hours + timer: `[32px_1fr_148px_120px_108px_80px_64px_48px]`.

### Current `AssigneeChip` — `_pm-shared.tsx:278-289` (DO NOT MODIFY)

```tsx
export function AssigneeChip({ id, idx }: { id: string; idx: number }) {
  const initials = id.replace(/-/g, "").slice(0, 2).toUpperCase(); // UUID-based
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white"
      style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
      title={id}
    >
      {initials}
    </div>
  );
}
```

### `ViewDropdown` popup pattern — `_project-detail.tsx:257-289`

```tsx
function ViewDropdown({ view, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} ...>{/* trigger */}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
            {items.map((v) => (
              <button key={v} onClick={() => { onChange(v); setOpen(false); }} ...>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

Assignee picker must follow this exact pattern (local `open` state, `fixed inset-0 z-10` backdrop, absolute panel).

### `time_logs` Row type — `database.ts:933-949`

```ts
time_logs: {
  Row: {
    id: string;
    task_id: string | null;
    project_id: string;
    employee_id: string | null;
    date_logged: string;
    hours: number;
    billable: boolean;
    note: string | null;
    source: "timer" | "manual";
    timesheet_id: string | null;
    external_id: string | null;
    owner_name: string | null;
    owner_email: string | null;
    created_at: string;
  };
  // Insert requires: project_id, date_logged, hours; source defaults to "manual"
};
```

### Optimistic update pattern — `_project-detail.tsx:93-105`

```tsx
const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
  const snapshot = tasks;
  setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const res = await fetch(`/api/v2/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) { setTasks(snapshot); return false; }
  const updated: Task = await res.json();
  setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  return true;
}, [tasks]);
```

Timer stop should call `onTimerStop(taskId, hours)` back to `_project-detail.tsx` which optimistically increments `hoursById` before the POST resolves.

### `page.tsx` server fetch pattern (current)

```tsx
const [milestonesRes, tasklistsRes, tasksRes, customerRes] = await Promise.all([...]);

return (
  <ProjectDetail
    project={project}
    companyName={customerRes.data?.company_name ?? project.customer_id}
    initialMilestones={milestonesRes.data ?? []}
    initialTasklists={tasklistsRes.data ?? []}
    initialTasks={tasksRes.data ?? []}
  />
);
```

Add to this `Promise.all`:
- `supabase.auth.getClaims()` → `currentUserId = data.claims.sub`
- `supabase.from("profiles").select("id, full_name, avatar_url").in("role", ["developer", "pm", "admin"])` → build `profilesById`
- `supabase.from("time_logs").select("task_id, hours").eq("project_id", projectId)` → build `hoursById` (sum hours per task_id)

### `getClaims` pattern — v2 hub layout

```tsx
const { data } = await supabase.auth.getClaims();
if (!data?.claims) { redirect(...); }
const userId = data.claims.sub as string;
```

---

## Implementation Steps

1. **`page.tsx`** — Add 3 parallel queries to `Promise.all`: `getClaims` for `currentUserId`, profiles query for `profilesById`, time_logs query for `hoursById`. Pass all three as new props to `<ProjectDetail />`.

2. **`GET /api/v2/projects/[projectId]/members/route.ts`** — Create route. Verify authenticated session via `createClient()` + `getClaims`. Query `profiles WHERE role IN ('developer', 'pm', 'admin')`. Return `{ id, full_name, avatar_url, role }[]`. No admin gate required.

3. **`POST /api/v2/tasks/[taskId]/timelog/route.ts`** — Create route. Verify auth, read `{ hours, project_id }` from request body. Insert into `time_logs` with `source: "timer"`, `employee_id: userId`, `date_logged: new Date().toISOString().slice(0, 10)`. Return created row.

4. **`_project-detail.tsx`** — Accept new props: `currentUserId: string`, `profilesById: Record<string, {full_name: string; avatar_url: string | null}>`, `initialHoursById: Record<string, number>`. Add `hoursById` state (initialized from prop). Add `onTimerStop(taskId, hours)` callback: optimistically updates `hoursById`, POSTs to `/api/v2/tasks/${taskId}/timelog`. Pass `currentUserId`, `profilesById`, `hoursById`, `onTimerStop` down to `ListView`.

5. **`_list-view.tsx`** — Full redesign:
   - Update `ListView` props to accept `currentUserId`, `profilesById`, `hoursById`, `onTimerStop`
   - Add `ResolvedAssigneeChip` component (local, not exported): accepts `id`, `idx`, `name?: string`; derives initials from name; same AVATAR_COLORS as `AssigneeChip`
   - Add `AssigneePicker` component (local): popup following `ViewDropdown` pattern; fetches `GET /api/v2/projects/[projectId]/members` on first open (lazy, cached in ref); toggles assignee UUIDs; calls `onUpdate(id, { assignees })` on change
   - Update `Row` grid to `[32px_1fr_148px_120px_108px_80px_64px_48px]`
   - Replace `AssigneeChip` usages with `ResolvedAssigneeChip` (passing `name` from `profilesById`)
   - Add hours cell: `hoursById[task.id]` formatted as `${h.toFixed(1)}h` or `—`
   - Add timer cell: only renders `<TimerButton>` if `task.assignees?.includes(currentUserId)`; local `useState<number | null>` for start timestamp; shows play icon when idle, MM:SS elapsed + pause icon when running; on stop calls `onTimerStop(task.id, hours)`
   - Polish: `border-b border-slate-100`, row hover `bg-slate-50/40`, task name `hover:text-blue-600 transition-colors`, timer button `text-slate-400 hover:text-blue-600`

---

## Acceptance Criteria

- [ ] Table renders columns: checkbox, name, status, assignee, due date, priority, hours, timer — in that order
- [ ] Assignee chips show real name initials (e.g. "BD" for "Brandon Dwite") not UUID characters
- [ ] Clicking assignee chip area opens picker popup with list of all hub users (developer/pm/admin)
- [ ] Selecting a user in picker calls PATCH and updates the chip immediately (optimistic)
- [ ] Timer button only appears on rows where the current user is an assignee
- [ ] Start timer → button shows elapsed time (MM:SS); stop → POST to timelog endpoint; hours column increments
- [ ] Hours column shows formatted total (e.g. `3.5h`) or `—`
- [ ] Board and calendar views unaffected (AssigneeChip in _pm-shared.tsx unchanged)
- [ ] `npx tsc --noEmit` passes with no errors

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Then browser-test at http://localhost:3000/v2/projects/{projectId}
# 1. Confirm columns render correctly
# 2. Click assignee → picker opens with real names
# 3. Toggle an assignee → chip updates optimistically
# 4. Start timer on a task assigned to you → see MM:SS
# 5. Stop timer → hours column increments
# 6. Switch to Board view → verify AssigneeChip still shows old UUID-based initials (unchanged)
```

---

## Notes for Implementation Agent

- **Sonnet rationale:** 5 files modified/created across DB → API → UI layers; new endpoints; complex interactive state (timer, assignee picker); cross-cutting props threading.
- `currentUserId` must come from server-side `getClaims()` in `page.tsx` — never call `createClient()` client-side for identity.
- `hoursById` is built by reducing the flat `time_logs` rows: `rows.reduce((acc, r) => { if (r.task_id) acc[r.task_id] = (acc[r.task_id] ?? 0) + r.hours; return acc; }, {} as Record<string, number>)`.
- Assignee picker fetches lazily (on first open) and caches result in a `useRef` — do not re-fetch on every open.
- Timer elapsed display: `useEffect` with `setInterval(1000)` only when `startedAt !== null`; clean up interval on unmount or stop.
- `style={{}}` remains correct for status/priority color tokens per CLAUDE.md — do not convert to Tailwind arbitrary values.
- `ResolvedAssigneeChip` lives in `_list-view.tsx` only — do not export it or place it in `_pm-shared.tsx`.
- The `members` endpoint does not need `[projectId]` from the path for filtering (no project-member table) — the param is in the URL for logical grouping only; query all profiles with hub roles.
- `POST /api/v2/tasks/[taskId]/timelog` must read `project_id` from the request body (client sends it); do not look it up from the DB in this route to keep it simple.

## Compatibility Touchpoints

- Board view and calendar view use `AssigneeChip` from `_pm-shared.tsx` — must remain untouched.
- Realtime subscription in `_project-detail.tsx` already handles task updates; no changes needed for timer-driven `hoursById` (it's client-local state, not a realtime table subscription).
