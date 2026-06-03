# 050: PM Create Task from Hub — Manual Task Creation + Immediate Zoho Push

**Created:** 2026-06-03
**Priority:** HIGH
**Type:** feature
**Recommended Model:** haiku
**Status:** TESTING
**Completed:** 2026-06-03

> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Overview

PMs need to create tasks directly from the Hub without waiting for a Zoho webhook. The PM fills in task type, priority, and LLM eligibility manually (no AI classification). The task is pushed to Zoho Projects immediately on creation so the PM can assign a developer right away.

## Requirements

- [ ] "Create Task" button appears in the Task Queue header
- [ ] Clicking opens a modal with: Customer (dropdown), Title, Description (optional), Task Type, Priority, LLM Eligible
- [ ] On submit: inserts into `classification_records` with `source = "hub_manual"`, `status = "reviewed"`, no AI fields
- [ ] Immediately calls `syncTaskToZoho()` and saves the returned `zoho_task_id` on the record
- [ ] On success the task appears in the queue via the existing realtime subscription (no manual refresh)
- [ ] `"hub_manual"` added to `WebhookSource` type

## Out of Scope / Must-Not-Change

- Do not run AI classification on hub-created tasks — PM fields are authoritative
- Do not modify the `classifyTask()` function
- Do not touch dev self-assignment route or the orchestration pipeline
- If Zoho push fails, still create the record (same non-blocking pattern as plan approval)

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/types/hub.ts` | Modify | Add `"hub_manual"` to `WebhookSource` union |
| `src/app/api/classification/route.ts` | Modify | Handle `source = "hub_manual"`: skip classifyTask, insert directly, push to Zoho |
| `src/app/(hub)/dashboard/tasks/page.tsx` | Modify | Fetch `customers` list, pass to `PMTasksContent` |
| `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx` | Modify | Accept and pass `customers` prop to `TasksTab` |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | Add `CreateTaskModal` + "Create Task" button in header |

## Code Context

### `src/types/hub.ts` — WebhookSource (line 104)

```ts
export type WebhookSource = "zoho_desk" | "zoho_projects";
```

Change to:

```ts
export type WebhookSource = "zoho_desk" | "zoho_projects" | "hub_manual";
```

### `src/app/api/classification/route.ts` — full file (current, 40 lines)

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyTask } from "@/lib/ai/classify";
import type { WebhookSource } from "@/types/hub";

type ClassifyBody = {
  customerId: string;
  title: string;
  description?: string | null;
  source: WebhookSource;
  zoho_ticket_id?: string | null;
  zoho_task_id?: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  ...
  const record = await classifyTask(body);
  ...
}
```

For `hub_manual`, branch before calling `classifyTask`. Add `task_type`, `priority`, `llm_eligible` to `ClassifyBody` as optional, required only when `source === "hub_manual"`. Import `adminClient` and `syncTaskToZoho`.

### `src/app/(hub)/dashboard/tasks/page.tsx` — existing fetch pattern (lines 28–32)

```ts
const { data: devUsers } = await adminClient
  .from("hub_users")
  .select("id, display_name, email")
  .eq("role", "dev");

return <PMTasksContent developers={devUsers ?? []} />;
```

Add a parallel fetch for `customers`: `.from("customers").select("customer_id, company_name").eq("status", "active")`.

### `src/components/hub/pm-tabs/tasks-tab.tsx` — TasksTab Props (lines 242–248)

```tsx
interface Props {
  settings: PMSettings;
  tasks: ClassificationRow[];
  zohoProjectMap?: Record<string, string>;
  reviewerMap?: Record<string, string>;
  developers?: Developer[];
}
```

Add `customers?: { customer_id: string; company_name: string }[]`.

### `src/components/hub/pm-tabs/tasks-tab.tsx` — ReclassifyModal (lines 122–240)

The existing `ReclassifyModal` uses the same selects (`TASK_TYPES`, `PRIORITIES`, `llmEligible`) and the same modal shell (`fixed inset-0 z-50 ...`). Model `CreateTaskModal` exactly on this — same CSS classes, same select patterns — but with an extra Customer dropdown and a Title + Description input instead of displaying the existing record title.

### `src/components/hub/pm-tabs/tasks-tab.tsx` — header area (lines 272–298)

```tsx
<div className="flex items-center justify-between mb-5">
  <div>
    <div className="text-[22px] font-bold ...">Task Queue</div>
    <div className="text-xs ...">{displayTasks.length} items</div>
  </div>
  <div className="flex gap-1.5">
    {/* filter tabs */}
  </div>
</div>
```

Add "Create Task" button between the title/count block and the filter tabs, or to the right of the filter tabs row.

### `src/lib/zoho/index.ts` — syncTaskToZoho signature (line 165)

```ts
export async function syncTaskToZoho(input: {
  customerId: string;
  title: string;
  description: string;
}): Promise<string>
```

Call this after inserting the classification record. If it returns a non-empty string, PATCH the record to set `zoho_task_id`.

## Implementation Steps

1. **`src/types/hub.ts`**: Add `"hub_manual"` to `WebhookSource`.

2. **`src/app/api/classification/route.ts`**:
   - Add imports: `adminClient` from `@/lib/supabase/admin`, `syncTaskToZoho` from `@/lib/zoho`
   - Extend `ClassifyBody` with optional `task_type`, `priority`, `llm_eligible`
   - In the POST handler, after auth check: if `body.source === "hub_manual"`:
     - Validate `task_type`, `priority`, `llm_eligible` are present; return 400 if not
     - Insert into `classification_records` via `adminClient` with `status: "reviewed"`, `confidence_score: null`, `model_used: null`
     - If insert fails, return 500
     - Call `syncTaskToZoho({ customerId, title, description: description ?? "" })` — non-blocking; if it fails or returns empty, still continue
     - If `zohoTaskId` returned, PATCH the record to set `zoho_task_id`
     - Return the record (201)
   - Else: fall through to existing `classifyTask(body)` path (no change)

3. **`src/app/(hub)/dashboard/tasks/page.tsx`**:
   - Add `customers` fetch in parallel with `devUsers`: `adminClient.from("customers").select("customer_id, company_name").eq("status", "active").order("company_name")`
   - Pass `customers={customers ?? []}` to `<PMTasksContent />`

4. **`src/app/(hub)/dashboard/tasks/_pm-tasks.tsx`**:
   - Accept `customers: { customer_id: string; company_name: string }[]` prop
   - Pass `customers` down to `<TasksTab />`

5. **`src/components/hub/pm-tabs/tasks-tab.tsx`**:
   - Add `customers` to `Props` interface
   - Add `CreateTaskModal` component (above `TasksTab`):
     - State: `customerId`, `title`, `description`, `taskType`, `priority`, `llmEligible`, `saving`, `error`
     - Fields: Customer `<select>`, Title `<input>`, Description `<textarea>` (optional), Task Type `<select>`, Priority `<select>`, LLM Eligible `<select>`
     - On submit: `POST /api/classification` with `source: "hub_manual"` + all fields
     - On success: close modal (realtime subscription in `_pm-tasks.tsx` will surface the new record automatically)
     - Error: show inline below the form
     - Use same modal shell CSS as `ReclassifyModal` (`fixed inset-0 z-50 flex items-center justify-center bg-black/40`)
   - Add `showCreateModal` state to `TasksTab`
   - Add "Create Task" button to the header (right side, next to filter tabs) — style: `text-xs font-semibold rounded-lg px-3.5 py-1.75 cursor-pointer border bg-(--c-blue) text-white border-(--c-blue)`
   - Render `{showCreateModal && <CreateTaskModal customers={customers} onClose={() => setShowCreateModal(false)} />}`

## Acceptance Criteria

- [ ] "Create Task" button visible in Task Queue header
- [ ] Modal opens with all required fields; Customer dropdown lists active customers
- [ ] Submitting creates a classification record with `source = "hub_manual"` and `status = "reviewed"`
- [ ] New task appears in the queue without a page refresh (realtime)
- [ ] Zoho icon link appears immediately if Zoho push succeeded
- [ ] If Zoho push fails, task still appears (no error shown to user)
- [ ] `npx tsc --noEmit` passes

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual:
- Open Task Queue as PM → "Create Task" button visible
- Create a task → confirm it appears in the queue
- Open Zoho Projects → confirm the new task appears in the customer's project
- Confirm the Zoho icon link in the task row opens the correct Zoho task

## Notes for Implementation Agent

- **haiku is sufficient** — new modal follows `ReclassifyModal` pattern exactly; API branch is a simple if/else; no new auth or schema patterns.
- The `adminClient` import is NOT currently in `src/app/api/classification/route.ts` — add it.
- `syncTaskToZoho` is NOT currently imported in `src/app/api/classification/route.ts` — add it from `@/lib/zoho`.
- Hub-created tasks start as `status: "reviewed"` (PM already specified all fields), NOT `"pending"`. This means they won't appear in the "Needs Review" AI-confidence tab.
- Do NOT call `logLLMInvocation` for hub_manual tasks — no LLM is used.
- Do NOT call `sendCliqNotification` for hub_manual tasks in this task — PM created it themselves.
- The realtime Supabase channel in `_pm-tasks.tsx` already subscribes to all `classification_records` changes — no changes needed there for the new task to appear.
- `customer_status` filter: fetch only `status = "active"` customers for the dropdown (avoids showing archived/inactive customers).
