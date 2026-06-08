---
id: "057"
title: "Enhance Hub Create Task Modal — 2-Step Form with AI Classification"
type: "minor"
priority: "HIGH"
status: "testing"
created: "2026-06-08"
completed: "2026-06-08"
---

> **Recommended Model:** sonnet
> **Status:** TESTING
> **Completed:** 2026-06-08
> **Investigation:** /understand ran before this spec. Findings embedded below.

## Implementation Notes

- Tiptap v3 installed: `@tiptap/react@3.26.0`, `@tiptap/pm@3.26.0`, `@tiptap/starter-kit@3.26.0`, `@tiptap/extension-underline@3.26.0`
- `hub_manual_v2` added to `WebhookSource` union in `src/types/hub.ts`
- `toZohoDate()` helper added as module-private function in `zoho/index.ts`
- `syncTaskAttachments()` exported from `zoho/index.ts` — uploads files to Zoho tasks endpoint
- New route `src/app/api/classification/classify/route.ts` — AI-only endpoint, no DB write, supports AbortController via `req.signal`
- New route `src/app/api/zoho/tasks/[taskId]/attachments/route.ts` — proxy for client-side file uploads
- `CreateTaskModal` in `tasks-tab.tsx` replaced with 2-step version; all existing project/tasklist logic preserved
- Step 1 Priority uses Zoho scale (None/Low/Medium/High) — forwarded directly to Zoho; AI classification Step 2 uses Hub scale (CRITICAL/HIGH/NORMAL/LOW) stored in classification_records
- File attachments held in component state, not uploaded to Supabase — uploaded to Zoho after task creation (non-blocking fire-and-forget)

## Goal

Replace the single-step `CreateTaskModal` in the PM Tasks tab with a 2-step flow:

1. **Task Details** — enriched form (rich text description, drag-and-drop files, owner, dates, priority, billing type)
2. **AI Classification** — run classification engine, display result, allow override, then create the task in Supabase + Zoho

## Requirements

### Step 1 — Task Details Form

- **Project Selection** — existing dropdown (from `/api/projects`)
- **Tasklist Selection** — existing dropdown (from `/api/zoho/tasklists?projectId=...`), auto-selects "General"
- **Task Name** — required text input
- **Description** — collapsible Tiptap rich text editor (`Add Description ↓` toggle); outputs HTML; sent as HTML to Zoho
- **File Attachments** — drag-and-drop drop zone (`Drop files or add attachments here... Maximum 30 files`), stored in component state; NOT uploaded to Supabase — uploaded to Zoho as attachments after task creation
- **Owner / Assignee** — Zoho users dropdown (from `/api/zoho/portal-users`), default label "Unassigned" (no value)
- **Start Date** — date + time input (display format `mm-dd-yyyy hh:mm`, Zoho format `MM-DD-YYYY`)
- **Due Date** — date + time input (display format `mm-dd-yyyy hh:mm`, Zoho format `MM-DD-YYYY`)
- **Priority** — dropdown: None / Low / Medium / High (Zoho scale, matches reference images); color-coded exclamation icons (gray/green/orange/red)
- **Billing Type** — dropdown: None / Billable / Non Billable
- **Buttons**: `Cancel` | `Classify` (disabled until Project + Task Name are filled)

### Step 2 — Classification

**While classifying** (`classifying` sub-state):
- Animated AI/bot icon (framer-motion sparkling loop)
- Subtitle: "Classifying task. Please wait for a while..."
- `Stop` button — aborts the fetch (AbortController); returns to `classified-empty` state
- `Back` and `Create Task` buttons are **disabled** during processing

**After classification** (`classified` sub-state):
- Display AI result:
  - **Task Type** label (e.g. "Bug Report")
  - **Priority** — AI returns Hub scale (CRITICAL/HIGH/NORMAL/LOW); display with Hub label + mapped Zoho equivalent in parentheses
  - **LLM Eligible** — YES → "AI Only" | NO → "AI + Human Required" | HUMAN_ONLY → "Human Only"
  - **Confidence** — score 0–100 shown as `XX%` with a colored badge
  - **Reasoning** — full reasoning string from AI
- User can **edit** task_type, priority (override AI result), llm_eligible via dropdowns
- `Re-run Classification` button — re-triggers classification with current form data
- Buttons: `Back` (preserves all Step 1 form state) | `Create Task`

**On "Create Task":**
1. POST `/api/classification` with `source: "hub_manual_v2"`, all task fields + final classification result
2. API inserts row into `classification_records` (title, description, task_type, priority, llm_eligible, confidence_score only — no start_date/due_date/owner/billing_type; those are Zoho-only)
3. API calls `syncTaskToZoho()` (extended) with start_date, due_date, ownerId, billingType — non-blocking, Zoho failure does not fail DB insert
4. After Zoho returns task ID: POST files to Zoho attachments endpoint — non-blocking, file upload failure does not fail task creation
5. Close modal, refresh tasks list

## Version Impact

`minor` — no DB schema changes; new API route + extended Zoho lib + UI overhaul

## File Changes

| File | Action | Purpose |
|------|---------|---------|
| `src/lib/zoho/index.ts` | MODIFY | Extend `SyncTaskInput` + `syncTaskToZoho()` with new fields, date formatter, file attachments |
| `src/app/api/classification/route.ts` | MODIFY | Add `hub_manual_v2` source path |
| `src/app/api/classification/classify/route.ts` | CREATE | AI-only classify endpoint — no DB write, returns `ClassificationSchema` output |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | MODIFY | Replace `CreateTaskModal` with 2-step version |

## Code Context

### Current `CreateTaskModal` state (tasks-tab.tsx:246–268)

```tsx
function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const [allProjects, setAllProjects] = useState<AllProject[]>([]);
  const [allProjectsLoading, setAllProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [selectedZohoProjectId, setSelectedZohoProjectId] = useState("");
  const [tasklists, setTasklists] = useState<TasklistOption[]>([]);
  const [tasklistsLoading, setTasklistsLoading] = useState(false);
  const [selectedTasklistId, setSelectedTasklistId] = useState("");
  const [showNewTasklist, setShowNewTasklist] = useState(false);
  const [newTasklistName, setNewTasklistName] = useState("");
  const [creatingTasklist, setCreatingTasklist] = useState(false);
  const [tasklistError, setTasklistError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<string>("OTHER");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [llmEligible, setLlmEligible] = useState<string>("NO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectClass = "w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.06em] mb-1";
```

### Current `syncTaskToZoho` signature (zoho/index.ts:161–220)

```ts
type SyncTaskInput = {
  customerId: string;
  title: string;
  description: string;
  zohoProjectId?: string;
  tasklistId?: string;
};

export async function syncTaskToZoho(input: SyncTaskInput): Promise<string> {
  // ...
  body: JSON.stringify({
    name: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.tasklistId ? { tasklist: { id: input.tasklistId } } : {}),
  }),
  // returns zohoTaskId string
}
```

### `classifyTask()` schema (classify.ts:13–31)

```ts
const ClassificationSchema = z.object({
  task_type: z.enum([
    "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
    "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST", "STRATEGIC", "OTHER",
  ]),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
  llm_eligible: z.enum(["YES", "NO", "HUMAN_ONLY"]),
  confidence_score: z.number().min(0).max(100),
  reasoning: z.string(),
});

export type ClassifyInput = {
  customerId: string;
  title: string;
  description?: string | null;
  source: WebhookSource;
  zoho_ticket_id?: string | null;
  zoho_task_id?: string | null;
};
```

### Current `hub_manual` path in classification/route.ts (lines 50–99)

```ts
if (source === "hub_manual") {
  const { task_type, priority, llm_eligible, description, zohoProjectId, tasklistId } = body;
  if (!task_type || !priority || !llm_eligible) {
    return NextResponse.json({ error: "task_type, priority, and llm_eligible are required..." }, { status: 400 });
  }
  const { data: record, error: insertError } = await adminClient
    .from("classification_records")
    .insert({ customer_id: customerId, title, description, source, task_type, priority,
               llm_eligible, status: "reviewed", confidence_score: null, model_used: null })
    .select().single();
  // ... non-blocking Zoho push, returns record
}
```

### `classification_records` Row type (database.ts:186–207)

Existing columns: `id`, `customer_id`, `zoho_ticket_id`, `zoho_task_id`, `source`, `title`, `description`, `task_type`, `priority`, `llm_eligible`, `confidence_score`, `model_used`, `input_tokens`, `output_tokens`, `raw_response`, `status`, `reviewed_by`, `reviewed_at`, `created_at`

**No migration needed.** `start_date`, `due_date`, `owner_id`, and `billing_type` are Zoho-only — collected in the form, forwarded to Zoho at creation time, never written to the local DB.

## Implementation Steps

1. **Install Tiptap**: `pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit`

2. **Create `/api/classification/classify/route.ts`**:
   - Same auth guard (pm/admin only)
   - Accepts `{ customerId, title, description?, source }` body
   - Calls `classifyTask({ customerId, title, description, source: "hub_manual_v2" })`
   - Returns `{ task_type, priority, llm_eligible, confidence_score, reasoning }` — no DB insert, no Zoho push

2. **Extend `zoho/index.ts`**:
   - Add to `SyncTaskInput`: `startDate?: string`, `dueDate?: string`, `ownerId?: string`, `billingType?: string`
   - Add helper `toZohoDate(iso: string): string` — converts ISO/input date to `MM-DD-YYYY`
   - Update the `JSON.stringify` body in `syncTaskToZoho` to include: `start_date`, `end_date` (due), `person_responsible_array` (owner), `billing_type`
   - Add exported `syncTaskAttachments(zohoProjectId, taskId, files: File[]): Promise<void>` — POSTs each file to `POST /projects/{projectId}/tasks/{taskId}/attachments` (multipart/form-data); called from client after task creation

3. **Update `classification/route.ts`**: Add `hub_manual_v2` path (below the `hub_manual` block):
   - Accept `startDate`, `dueDate`, `ownerId`, `billingType`, `zohoProjectId`, `tasklistId`, `task_type`, `priority`, `llm_eligible`, `confidence_score`
   - Insert record into `classification_records` with `status: "reviewed"` (existing columns only — no new columns)
   - Call extended `syncTaskToZoho()` with all Zoho fields — non-blocking
   - Return created record

4. **Replace `CreateTaskModal` in `tasks-tab.tsx`**:
   - Add step state: `"details" | "classifying" | "classified"`
   - Add new state: `descriptionHtml`, `attachedFiles` (File[]), `ownerId`, `startDate`, `dueDate`, `zohoPriority` (None/Low/Medium/High), `billingType`, `classificationResult`, `abortController`
   - Preserve all existing project/tasklist selection logic (handleProjectSelect, handleTasklistsLoad)
   - Add `useEditor` (Tiptap) hook — toolbar: Bold, Italic, Underline, Strike, BulletList, OrderedList
   - Step 1: enriched form (all fields above)
   - On "Classify": step → "classifying", create AbortController, POST to `/api/classification/classify`; on response step → "classified"; on abort step → "details"
   - Step 2 "classifying": framer-motion spinning icon, subtitle, Stop button
   - Step 2 "classified": result panel + editable overrides + Re-run + Back + Create Task
   - On "Create Task": POST to `/api/classification` with `source: "hub_manual_v2"` + all fields; after success, call `syncTaskAttachments()` client-side if files attached (non-blocking); close modal + refresh

## Notes for Implementation Agent

- **Sonnet required**: Cross-cutting (2 API routes, Zoho lib, complex modal UI); multi-step state machine; mistakes affect primary task creation flow.
- **No DB migration** — `start_date`, `due_date`, `owner_id`, `billing_type` are Zoho-only. Do not add them to `classification_records`.
- **Tiptap setup**: `useEditor({ extensions: [StarterKit] })`. Render with `<EditorContent editor={editor} />`. Toolbar buttons call `editor.chain().focus().toggleBold().run()` etc. Read `editor.getHTML()` for description.
- **Tiptap collapsible**: Toggle a `showDescription` boolean; only render the editor when true.
- **Date inputs**: `<input type="datetime-local" />` styled with Tailwind. `toZohoDate()` converts `YYYY-MM-DDTHH:mm` → `MM-DD-YYYY`. Store ISO value in state, convert at API call time.
- **Priority scale**: Step 1 form uses Zoho scale (None/Low/Medium/High). AI returns Hub scale (CRITICAL/HIGH/NORMAL/LOW). For DB `priority` column: if AI ran, use AI's Hub value; if no AI (shouldn't happen in v2 flow), map Zoho→Hub: None→"NORMAL", Low→"LOW", Medium→"NORMAL", High→"HIGH". For Zoho push, pass Zoho scale directly.
- **File attachments**: NOT included in the `/api/classification` POST. After `zoho_task_id` is returned, call `syncTaskAttachments()` from client via a thin proxy route `POST /api/zoho/tasks/[taskId]/attachments` (accepts FormData, forwards to Zoho). Non-blocking.
- **AbortController**: Store in state. Stop button calls `controller.abort()`. Pass `signal` to classify fetch.
- **Non-blocking Zoho**: Never fail DB insert if Zoho fails. Preserve existing `hub_manual` pattern.
- **`labelClass` / `selectClass`** (tasks-tab.tsx:267–268) must remain unchanged.
- **`hub_manual_v2` source**: Add to `WebhookSource` union in `src/types/hub.ts` if needed.
- **Billing Type Zoho param**: `"Billable"`, `"Non Billable"`, or omit if None.
- **Owner Zoho param**: `person_responsible_array: [{ id: ownerId }]`. Omit if Unassigned.
- **Drag-and-drop**: `onDragOver` + `onDrop` on drop zone + `<input type="file" multiple />` fallback. Cap at 30 files.
- **`/api/zoho/portal-users`** exists — fetch on modal open for the owner dropdown.
