# Task 056 — Enhance Hub Create Task Modal: Project + Tasklist Selection

> **Type:** minor
> **Priority:** HIGH
> **Recommended Model:** sonnet
> **Status:** TESTING
> **Completed:** 2026-06-08
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Problem

The Hub `CreateTaskModal` creates tasks without letting the PM choose a project or tasklist. When a customer has multiple Zoho projects the task goes to the first one found (silent ambiguity). Tasklist targeting doesn't exist at all — tasks land in the project root, not the intended list (e.g. "General", "Backlog"). This diverges from the Zoho Projects "New Task" UX (Image #9) that PMs already use.

## Goal

Enhance the existing `CreateTaskModal` (in-place replacement) so that:

1. After selecting a customer, the PM selects which project to target (hidden when only one project exists).
2. After selecting a project, the PM selects which tasklist to use (default: "General").
3. The selected project and tasklist are passed through to Zoho on task creation.
4. A classification record is still written in Hub DB (pipeline preserved).

---

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Tasklist required? | **Required** — tasklist must be selected; default to "General" if that tasklist exists, otherwise first in list |
| 2 | New modal or replace in-place? | **Replace in-place** — `CreateTaskModal` in `tasks-tab.tsx` becomes the enhanced version |
| 3 | Single-project customer — show dropdown? | **Auto-select and hide** — skip the project step visually |
| 4 | Hub DB record? | **Write classification record + push to Zoho** — pipeline preserved |

---

## Requirements

- Customer dropdown unchanged; clears project + tasklist state on change.
- Project dropdown: populated from `GET /api/customers/{customerId}/projects` filtered to rows where `zoho_project_id` is non-null.
- If customer has exactly one valid project, auto-select it and hide the dropdown.
- If customer has zero valid projects (no Zoho project linked), show a warning instead of the project/tasklist dropdowns.
- Tasklist dropdown: populated from new `GET /api/zoho/tasklists?projectId={zohoProjectId}`. Show once a project is selected.
- On tasklist load: auto-select the tasklist named "General" if present; otherwise auto-select the first.
- Tasklist is required to submit.
- Both project and tasklist fetches show a loading state in the dropdown.
- `POST /api/classification` accepts optional `zohoProjectId` + `tasklistId` in the `hub_manual` branch and threads them into `syncTaskToZoho`.
- `syncTaskToZoho` uses the explicit `zohoProjectId` when provided (skips DB lookup). Adds `tasklist: { id: tasklistId }` to the Zoho POST body when `tasklistId` is provided.
- All existing fields (Title, Description, Task Type, Priority, LLM Eligible) remain unchanged.

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/zoho/index.ts` | UPDATE | Add `getZohoProjectTasklists(projectId)` function; extend `SyncTaskInput` + `syncTaskToZoho` with optional `zohoProjectId` + `tasklistId` |
| `src/app/api/zoho/tasklists/route.ts` | CREATE | `GET ?projectId=...` proxy — auth-gated, calls `getZohoProjectTasklists` |
| `src/app/api/classification/route.ts` | UPDATE | Accept + thread `zohoProjectId` + `tasklistId` in hub_manual branch |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | UPDATE | Replace `CreateTaskModal` with enhanced version (project + tasklist selection) |

---

## Implementation Steps

### Step 1 — Extend `src/lib/zoho/index.ts`

**1a. Extend `SyncTaskInput` type (line 161):**

```typescript
type SyncTaskInput = {
  customerId: string;
  title: string;
  description: string;
  zohoProjectId?: string;   // explicit project — skips DB lookup when provided
  tasklistId?: string;       // adds tasklist: { id } to Zoho POST body
};
```

**1b. Update `syncTaskToZoho` (lines 167–213):**

- At the top of the function, if `input.zohoProjectId` is provided, skip the `customer_projects` DB lookup and use it directly.
- In the Zoho POST body, spread `...(input.tasklistId ? { tasklist: { id: input.tasklistId } } : {})`.

```typescript
// Replace the DB-lookup block (lines 175–186) with:
let zohoProjectId = input.zohoProjectId;
if (!zohoProjectId) {
  const { data: product } = await adminClient
    .from("customer_projects")
    .select("zoho_project_id")
    .eq("customer_id", input.customerId)
    .not("zoho_project_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!product?.zoho_project_id) {
    console.warn("[zoho] no zoho_project_id for customer", input.customerId);
    return "";
  }
  zohoProjectId = product.zoho_project_id;
}

// Update the fetch URL and body (lines 191–203):
const res = await fetch(
  `${ZOHO_PROJECTSAPI_BASE}/projects/${zohoProjectId}/tasks`,
  {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.title,
      ...(input.description ? { description: input.description } : {}),
      ...(input.tasklistId ? { tasklist: { id: input.tasklistId } } : {}),
    }),
  }
);
```

**1c. Add `getZohoProjectTasklists` after `syncTaskToZoho`:**

```typescript
export async function getZohoProjectTasklists(
  projectId: string
): Promise<{ id: string; name: string }[]> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return [];
  const token = await getZohoAccessToken();
  if (!token) return [];

  const res = await fetch(
    `${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/tasklists`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  if (!res.ok) {
    console.error("[zoho] tasklist fetch failed:", res.status, await res.text());
    return [];
  }
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json?.tasklists ?? []).map((tl: any) => ({
    id: String(tl.id_string ?? tl.id),
    name: String(tl.name),
  }));
}
```

---

### Step 2 — Create `src/app/api/zoho/tasklists/route.ts`

New file. Auth-gated GET proxy.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoProjectTasklists } from "@/lib/zoho";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const tasklists = await getZohoProjectTasklists(projectId);
  return NextResponse.json({ tasklists });
}
```

---

### Step 3 — Update `src/app/api/classification/route.ts` hub_manual branch

In the `hub_manual` block (lines 48–91), extract and thread the two new optional fields:

```typescript
if (source === "hub_manual") {
  const { task_type, priority, llm_eligible, description, zohoProjectId, tasklistId } = body;
  // ... existing validation unchanged ...

  // ... existing insert unchanged ...

  // Update the syncTaskToZoho call (line 78):
  const zohoTaskId = await syncTaskToZoho({
    customerId,
    title,
    description: description ?? "",
    zohoProjectId: zohoProjectId ?? undefined,
    tasklistId: tasklistId ?? undefined,
  });
  // ... rest unchanged ...
}
```

---

### Step 4 — Enhance `CreateTaskModal` in `src/components/hub/pm-tabs/tasks-tab.tsx`

**Replace the entire `CreateTaskModal` function (lines 244–378).** New state additions on top of existing state:

```typescript
// New state (add after existing state declarations):
const [projects, setProjects] = useState<{ id: string; project_name: string; zoho_project_id: string }[]>([]);
const [projectsLoading, setProjectsLoading] = useState(false);
const [selectedProjectId, setSelectedProjectId] = useState(""); // zoho_project_id value
const [tasklists, setTasklists] = useState<{ id: string; name: string }[]>([]);
const [tasklistsLoading, setTasklistsLoading] = useState(false);
const [selectedTasklistId, setSelectedTasklistId] = useState("");
```

**Customer change handler** — fetch projects on customer select:

```typescript
async function handleCustomerChange(newCustomerId: string) {
  setCustomerId(newCustomerId);
  setSelectedProjectId("");
  setSelectedTasklistId("");
  setTasklists([]);
  if (!newCustomerId) { setProjects([]); return; }

  setProjectsLoading(true);
  try {
    const res = await fetch(`/api/customers/${newCustomerId}/projects`);
    const json = await res.json() as { projects?: { id: string; project_name: string; zoho_project_id: string | null }[] };
    const valid = (json.projects ?? []).filter(p => !!p.zoho_project_id) as { id: string; project_name: string; zoho_project_id: string }[];
    setProjects(valid);
    // Auto-select if only one project
    if (valid.length === 1) handleProjectChange(valid[0].zoho_project_id);
  } finally {
    setProjectsLoading(false);
  }
}
```

**Project change handler** — fetch tasklists on project select:

```typescript
async function handleProjectChange(zohoProjectId: string) {
  setSelectedProjectId(zohoProjectId);
  setSelectedTasklistId("");
  setTasklists([]);
  if (!zohoProjectId) return;

  setTasklistsLoading(true);
  try {
    const res = await fetch(`/api/zoho/tasklists?projectId=${zohoProjectId}`);
    const json = await res.json() as { tasklists?: { id: string; name: string }[] };
    const list = json.tasklists ?? [];
    setTasklists(list);
    // Default to "General" if it exists, otherwise first
    const general = list.find(tl => tl.name === "General");
    setSelectedTasklistId(general?.id ?? list[0]?.id ?? "");
  } finally {
    setTasklistsLoading(false);
  }
}
```

**Validation** — update `handleSubmit` guard:

```typescript
if (!customerId || !title || !selectedProjectId || !selectedTasklistId) {
  setError("Customer, project, tasklist, and title are required");
  return;
}
```

**POST body** — add the two new fields:

```typescript
body: JSON.stringify({
  source: "hub_manual",
  customerId,
  title,
  description: description || null,
  task_type: taskType,
  priority,
  llm_eligible: llmEligible,
  zohoProjectId: selectedProjectId,
  tasklistId: selectedTasklistId,
}),
```

**UI additions** — insert between Customer and Title fields:

```tsx
{/* Project — hidden when auto-selected (single project) */}
{customerId && !projectsLoading && projects.length > 1 && (
  <div>
    <label className={labelClass}>Project</label>
    <select
      value={selectedProjectId}
      onChange={e => handleProjectChange(e.target.value)}
      className={selectClass}
    >
      <option value="">— Select project —</option>
      {projects.map(p => (
        <option key={p.id} value={p.zoho_project_id}>{p.project_name}</option>
      ))}
    </select>
  </div>
)}
{customerId && projectsLoading && (
  <p className="text-[12px] text-gray-400">Loading projects…</p>
)}
{customerId && !projectsLoading && projects.length === 0 && (
  <p className="text-[12px] text-amber-600 dark:text-amber-400">No linked Zoho projects for this customer.</p>
)}

{/* Tasklist */}
{selectedProjectId && (
  <div>
    <label className={labelClass}>Task List</label>
    <select
      value={selectedTasklistId}
      onChange={e => setSelectedTasklistId(e.target.value)}
      className={selectClass}
      disabled={tasklistsLoading}
    >
      {tasklistsLoading
        ? <option>Loading…</option>
        : tasklists.map(tl => (
            <option key={tl.id} value={tl.id}>{tl.name}</option>
          ))
      }
    </select>
  </div>
)}
```

---

## Code Context

### `CreateTaskModal` — current full function (`tasks-tab.tsx:244–378`)

```typescript
function CreateTaskModal({ customers, onClose }: { customers: Customer[]; onClose: () => void }) {
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<string>("OTHER");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [llmEligible, setLlmEligible] = useState<string>("NO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectClass = "w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.06em] mb-1";

  async function handleSubmit() {
    if (!customerId || !title) {
      setError("Customer and title are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/classification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "hub_manual",
          customerId,
          title,
          description: description || null,
          task_type: taskType,
          priority,
          llm_eligible: llmEligible,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, string>;
        setError(json.error ?? "Failed to create task");
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }
  // ... JSX: Customer select, Title input, Description textarea,
  //          Task Type select, Priority select, LLM Eligible select
}
```

### `SyncTaskInput` type + `syncTaskToZoho` — current (`lib/zoho/index.ts:161–213`)

```typescript
type SyncTaskInput = {
  customerId: string;
  title: string;
  description: string;
};

export async function syncTaskToZoho(input: SyncTaskInput): Promise<string> {
  // ... looks up customer_projects to find zoho_project_id ...
  // ... POSTs to /projects/{zohoProjectId}/tasks with { name, description } ...
}
```

### `hub_manual` branch — current (`classification/route.ts:48–91`)

```typescript
if (source === "hub_manual") {
  const { task_type, priority, llm_eligible, description } = body;
  // ... insert classification_record ...
  // Non-blocking Zoho push:
  const zohoTaskId = await syncTaskToZoho({ customerId, title, description: description ?? "" });
  if (zohoTaskId) {
    await adminClient.from("classification_records").update({ zoho_task_id: zohoTaskId }).eq("id", record.id);
    return NextResponse.json({ ...record, zoho_task_id: zohoTaskId }, { status: 201 });
  }
  return NextResponse.json(record, { status: 201 });
}
```

---

## Notes for Implementation Agent

- **Sonnet rationale:** 4 files across UI + lib + 2 API routes; async cascade (customer → projects → tasklists); non-trivial loading state management.
- **Tasklist endpoint (Zoho V3):** `GET ${ZOHO_PROJECTSAPI_BASE}/projects/{projectId}/tasklists` — not yet proxied anywhere in the codebase. Response shape: `{ tasklists: [{ id_string, id, name, ... }] }`. Use `id_string` preferentially (string ID); fall back to `id`.
- **Projects list for a customer:** Already available via `GET /api/customers/{customerId}/projects` — reuse this, no new DB query needed. Filter client-side to rows where `zoho_project_id` is non-null.
- **`syncTaskToZoho` is called in exactly one place** (besides the updated call): `classification/route.ts:78`. Extending with optional params is safe — the existing call site will still work with `zohoProjectId: undefined`.
- **`getZohoProjectTasklists` export:** Add to `src/lib/zoho/index.ts` after `syncTaskToZoho` and export it. The new API route imports it via `@/lib/zoho`.
- **No new DB columns needed** — `zohoProjectId` and `tasklistId` are only threaded through the API and into the Zoho POST body. The `classification_records.zoho_task_id` save logic is unchanged.
- **Warning on zero projects:** If a customer has no linked Zoho projects, show an amber warning and disable the submit button (can still fill in title, etc., but can't submit without a project).
- **TypeScript:** After changing `SyncTaskInput`, run `npx tsc --noEmit` to verify no new errors. The only call site is `classification/route.ts:78`.
- **Zoho tasklist default — "General":** Every Zoho project has a "General" tasklist by default. The auto-select logic looks for `tl.name === "General"` (exact match). If not found, fall back to `list[0]`.
- **`GET /api/customers/{customerId}/projects` response shape:** Returns `{ projects: [{ id, customer_id, project_name, project_type, zoho_project_id, ... }] }`. See `src/app/api/customers/[customerId]/projects/route.ts`.
