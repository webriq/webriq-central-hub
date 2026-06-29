# Task 092 — Task Detail Page (`/v2/projects/[projectId]/tasks/[taskId]`)

> **Type:** feature
> **Priority:** HIGH
> **Version bump:** minor
> **Recommended Model:** haiku
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Completed:** 2026-06-29

---

## Goal

Create a full-page task detail view at `/v2/projects/[projectId]/tasks/[taskId]` that replaces the current right-side drawer. Clicking a task row in list or board view navigates to this page instead of opening the drawer. The page follows the same header + content card design system as `_project-detail.tsx` and surfaces all task fields from the DB row, including labels, assignees, start date, and estimate hours — which no current task UI exposes.

---

## User Stories

- As a PM, I want to click a task and see its full detail in a dedicated page so I can edit all fields without the constraints of a narrow drawer.
- As a developer, I want to see start date, estimate hours, and labels on a task so I can plan my work.
- As any user, I want a back link to the project page so navigation is clear.

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` | **Create** | Server component — fetches task + project + milestones, renders `<TaskDetailClient>` |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | **Create** | `"use client"` — full detail page shell with all editable fields |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | **Modify** | Remove `drawerTask` state + `<TaskDrawer>`, wire `onOpen` to `router.push` |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | **Modify** | No prop changes — parent wiring change handles navigation |
| `src/app/v2/(hub)/projects/[projectId]/_task-drawer.tsx` | **Keep** | Leave the file in place; it is simply no longer rendered |

---

## Implementation Steps

### Step 1 — Server component page

Create `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TaskDetailClient from "./_task-detail";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const supabase = await createClient();

  const [{ data: task }, { data: project }, { data: milestones }, { data: tasklists }] =
    await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).single(),
      supabase.from("projects").select("id, name, customer_id").eq("id", projectId).single(),
      supabase.from("milestones").select("*").eq("project_id", projectId).order("position", { ascending: true, nullsFirst: false }),
      supabase.from("tasklists").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
    ]);

  if (!task || !project) notFound();

  return (
    <TaskDetailClient
      task={task}
      project={project}
      milestones={milestones ?? []}
      tasklists={tasklists ?? []}
    />
  );
}
```

### Step 2 — Client detail shell

Create `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx`.

**Import from `../_pm-shared`:**
- `Task`, `Milestone`, `Tasklist`, `TaskStatus`, `TaskPriority`
- `STATUS_LABEL`, `STATUS_STYLE`, `PRIORITY_STYLE`
- `TagChip`, `AssigneeChip`
- `STATUS_OPTS` and `PRIORITY_OPTS` are local consts (same as in the drawer)

**Local state (mirrors drawer pattern):**
```ts
const [title, setTitle]             = useState(task.title);
const [description, setDescription] = useState(task.description ?? "");
const [labels, setLabels]           = useState<string[]>(task.labels ?? []);
const [newLabel, setNewLabel]       = useState("");
const [subtasks, setSubtasks]       = useState<Task[]>([]);
const [loadingSubs, setLoadingSubs] = useState(true);
const [newSub, setNewSub]           = useState("");
const [addingSub, setAddingSub]     = useState(false);
```

**Save helpers — all PATCH to `/api/v2/tasks/${task.id}`:**
- `saveTitle()`: onBlur on title textarea
- `saveDescription()`: onBlur on description textarea
- `saveField(patch: Partial<Task>)`: generic field save for select/input changes

**Subtask load + CRUD:** lift verbatim from `_task-drawer.tsx:37–88` — same `useEffect`, `addSubtask`, `toggleSubtask`, `deleteSubtask` logic.

**Labels add/remove:**
```ts
async function addLabel() {
  const trimmed = newLabel.trim();
  if (!trimmed || labels.includes(trimmed)) return;
  const next = [...labels, trimmed];
  setLabels(next);
  setNewLabel("");
  await saveField({ labels: next });
}
async function removeLabel(tag: string) {
  const next = labels.filter((l) => l !== tag);
  setLabels(next);
  await saveField({ labels: next });
}
```

**Delete task:**
```ts
async function handleDelete() {
  if (!confirm("Delete this task and all its subtasks?")) return;
  await fetch(`/api/v2/tasks/${task.id}`, { method: "DELETE" });
  router.push(`/v2/projects/${project.id}`);
}
```

**Page layout — follow `_project-detail.tsx:141–170` header pattern:**

```
<div className="flex flex-col h-full min-h-0">
  {/* Header — px-8 pt-6 pb-0 bg-white shrink-0 */}
  <div className="px-8 pt-6 pb-4 bg-white border-b border-slate-100 shrink-0">
    <Link back to project>   ← {project.name}          (text-[12px] text-slate-500)
    <div flex items-start justify-between>
      <div>
        <div flex items-center gap-3>
          <span mono chip>  TASK · {task.id.slice(0,8).toUpperCase()}  </span>
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
        </div>
        <textarea  ← editable title, text-[22px] font-bold, onBlur save
      </div>
      <button delete>  (trash icon, red hover)
    </div>
  </div>

  {/* Content — bg-slate-50 flex-1 overflow-y-auto p-8 */}
  <div className="bg-slate-50 flex-1 overflow-y-auto p-8">
    <div className="flex gap-8 max-w-5xl">

      {/* Left main — flex-1 */}
      <div className="flex-1 flex flex-col gap-5">
        {/* Description card */}
        <Card title="Description">
          <textarea onBlur={saveDescription} ... />
        </Card>

        {/* Labels card */}
        <Card title="Labels">
          <div flex flex-wrap gap-1.5>
            {labels.map(tag => <TagChip tag={tag} canRemove onRemove={() => removeLabel(tag)} />)}
          </div>
          <input + add button (Enter or click)>
        </Card>

        {/* Subtasks card */}
        <Card title="Subtasks" count={`${doneCount}/${subtasks.length}`}>
          {subtasks.map(...)  ← same pattern as drawer}
          <add row input + button>
        </Card>
      </div>

      {/* Right sidebar — w-72 shrink-0 */}
      <div className="w-72 shrink-0">
        <Card title="Details">
          <Meta label="Status">    <select> </Meta>
          <Meta label="Priority">  <select> </Meta>
          <Meta label="Milestone"> <select> </Meta>
          <Meta label="Due date">  <input type="date"> </Meta>
          <Meta label="Start date"><input type="date"> </Meta>
          <Meta label="Estimate">  <input type="number" placeholder="hours"> </Meta>
          {task.assignees?.length && (
            <Meta label="Assignees">
              <div flex gap-1>
                {task.assignees.map((id,i) => <AssigneeChip key={id} id={id} idx={i} />)}
              </div>
            </Meta>
          )}
          {(task.github_pr_url || task.preview_url) && (
            <Meta label="Links">  ← same anchor tags as drawer  </Meta>
          )}
        </Card>
      </div>

    </div>
  </div>
</div>
```

**Card helper** (local, not exported):
```tsx
function Card({ title, count, children }: { title: string; count?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <span className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">{title}</span>
        {count && <span className="text-[11px] font-mono text-slate-400">{count}</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
```

**Meta helper** (same as drawer, local):
```tsx
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-slate-600">{label}</span>
      {children}
    </div>
  );
}
```

All `<select>` and `<input>` `onChange` calls should call `saveField({ fieldName: value })` directly (no onBlur needed for selects/dates).

### Step 3 — Update `_project-detail.tsx`

Three changes:

**A. Remove drawer state and render:**
```diff
- const [drawerTask, setDrawerTask] = useState<Task | null>(null);
```
Remove the `setDrawerTask` calls inside `updateTask` and `deleteTask`. Remove the `<TaskDrawer ... />` render block. Remove `TaskDrawer` import.

**B. Change `onOpen` wiring for `ListView`:**
```diff
- onOpen={(task) => setDrawerTask(task)}
+ onOpen={(task) => router.push(`/v2/projects/${project.id}/tasks/${task.id}`)}
```

**C. Same for `BoardView` — find its `onOpen` or `onClick` prop and apply the same `router.push`.**

The realtime subscription's `setDrawerTask` calls can simply be deleted — the detail page fetches its own data via server component and will be stale once navigated away from anyway.

---

## Code Context

### `_project-detail.tsx:141–170` — Header + wrapper pattern
```tsx
<div className="flex flex-col h-full min-h-0">
  <div className="px-8 pt-6 pb-0 bg-white shrink-0">
    <button onClick={() => router.push(V2_ROUTES.PROJECTS)}
      className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 mb-3 cursor-pointer">
      <ArrowLeft size={14} /> All projects
    </button>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em] truncate">
            {project.name}
          </h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="text-[13px] text-slate-500 mt-0.5">{companyName} · {project.project_type}</p>
      </div>
      <button onClick={...} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium ...">
        <Plus size={16} /> New Task
      </button>
    </div>
  </div>
```

### `_task-drawer.tsx:37–88` — Subtask CRUD (lift verbatim)
```tsx
useEffect(() => {
  const ctrl = new AbortController();
  fetch(`/api/v2/tasks/${task.id}/subtasks`, { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : []))
    .then((data: Task[]) => setSubtasks(data))
    .catch(() => {})
    .finally(() => setLoadingSubs(false));
  return () => ctrl.abort();
}, [task.id]);

async function addSubtask() { ... POST /api/v2/tasks/${task.id}/subtasks ... }
async function toggleSubtask(sub: Task) { ... PATCH /api/v2/tasks/${sub.id} ... }
async function deleteSubtask(id: string) { ... DELETE /api/v2/tasks/${id} ... }
```

### `_pm-shared.tsx:102–123` — StatusBadge + PriorityBadge
```tsx
export function StatusBadge({ status }: { status: TaskStatus }) {
  const norm = normalizeStatus(status);
  const c = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
  return (
    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}>
      {STATUS_LABEL[norm] ?? norm}
    </span>
  );
}
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE["normal"];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: p.text }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.dot }} />
      {p.label}
    </span>
  );
}
```

### `_pm-shared.tsx:174–211` — TagChip (with `canRemove` + `onRemove`)
```tsx
export function TagChip({ tag, idx = 0, canRemove, onRemove }) { ... }
// Usage: <TagChip tag={tag} canRemove onRemove={() => removeLabel(tag)} />
```

### `_pm-shared.tsx:278–288` — AssigneeChip
```tsx
export function AssigneeChip({ id, idx }: { id: string; idx: number }) {
  const initials = id.replace(/-/g, "").slice(0, 2).toUpperCase();
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white"
      style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }} title={id}>
      {initials}
    </div>
  );
}
```

### `database.ts:679–710` — Task Row type (key fields)
```ts
tasks.Row: {
  id: string; project_id: string; parent_task_id: string | null;
  milestone_id: string | null; tasklist_id: string | null;
  title: string; description: string | null;
  priority: "low" | "normal" | "high" | "critical"; status: string;
  assignees: string[] | null; due_date: string | null; start_date: string | null;
  estimate_hours: number | null; labels: string[] | null;
  github_pr_url: string | null; preview_url: string | null;
  completion_percentage: number; is_completed: boolean;
  created_at: string; updated_at: string;
}
```

### `projects/[projectId]/page.tsx:1–52` — Server component fetch pattern
```tsx
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (!project) notFound();
  const [milestonesRes, ...] = await Promise.all([...]);
  return <ClientComponent ... />;
}
```

---

## Notes for Implementation Agent

- **No GET route exists** for a single task — query Supabase directly in the server component (`supabase.from("tasks").select("*").eq("id", taskId).single()`). No API route needed.
- **`export const dynamic = "force-dynamic"`** is required on the server component page (same as project detail page).
- **All shared components** (`StatusBadge`, `PriorityBadge`, `TagChip`, `AssigneeChip`) live in `../_pm-shared.tsx` — import from there, do not recreate.
- **`labels: string[] | null`** — use `TagChip` with `canRemove` prop. Save the full updated array on each add/remove via `PATCH /api/v2/tasks/${task.id}`.
- **`assignees` are read-only on this page** (display-only with `AssigneeChip`) — no edit UI for assignees is in scope.
- **`_task-drawer.tsx` is not deleted** — it stays in place; it is simply no longer rendered anywhere. The import is removed from `_project-detail.tsx`.
- **BoardView** likely has its own `onOpen` or `onClick` prop — check `_board-view.tsx` and apply the same `router.push` pattern as ListView.
- **Back link** on the detail page: use `router.push(\`/v2/projects/${project.id}\`)` via `useRouter()`. Do not use `router.back()` since the user may have arrived from a deep link.
- **Page wrapper must be** `<div className="flex flex-col h-full min-h-0">` — this is the established full-height pattern in the (hub) layout.
- **Content area background** is `bg-slate-50` with `p-8` — matches project detail's content area.
- **`params` in Next.js 16 is a `Promise`** — must `await params` before destructuring (see server component pattern above).
- **Do not add `style={{}}`** for spacing/colors that can be expressed as Tailwind classes. The `style` prop is only for dynamic computed values like status/priority colors from the token maps.

---

## Acceptance Criteria

- [ ] Clicking any task row in list view navigates to `/v2/projects/{id}/tasks/{taskId}` (no drawer opens)
- [ ] Back link returns to `/v2/projects/{projectId}`
- [ ] Task title is editable (textarea, onBlur save)
- [ ] Status, Priority, Milestone, Due date, Start date, Estimate hours all save on change
- [ ] Labels section: existing labels shown as TagChips with remove × button; add new label via input + Enter
- [ ] Assignees shown as AssigneeChips (read-only display)
- [ ] GitHub PR URL and Preview URL shown as read-only links if set
- [ ] Subtasks: load, check/uncheck, add, delete — same as drawer behavior
- [ ] Delete button on header deletes task and navigates back to project
- [ ] `notFound()` if task ID doesn't exist
- [ ] TypeScript compiles with `npx tsc --noEmit`
