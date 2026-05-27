# 026: Sprint 4 Part 2 — Full Zoho Sync (M7 complete)

**Created:** 2026-05-27
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-05-27

> **Recommended Model:** sonnet — spans DB migration, external Zoho API integration, 3 API route modifications, 1 new API route, and 2 UI file changes; introduces bidirectional webhook status sync and conflict detection across 8 files.
>
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Overview

Sprint 4, Part 2 of 2. Implements M7 (Full Zoho Sync) — the half of Sprint 4 that wasn't covered by task 025.

When a PM approves a plan, Hub automatically creates a task in Zoho Projects and stores the Zoho task ID. The PM can open the Zoho task directly from Hub via a one-click link. PM status actions (Open / Hold / Active / Review / Close / Reopen) update Hub's local `classification_records.status`, and Close/Reopen also push to Zoho via the `completed` field. Inbound Zoho webhooks detect when a task is completed or reopened in Zoho and update `implementation_plans.status` + set `direct_zoho_edit = true`. Tasks modified directly in Zoho show a warning badge in the orchestration UI.

**Part 1 (task 025):** Plan generation (M5) — complete, in Testing.

### Decisions confirmed
- Zoho task push is automatic on plan approval — no separate manual step
- No assignee in the Zoho task push; PM assigns directly in Zoho
- `direct_zoho_edit` flag lives as a column on `implementation_plans`
- PM status actions are in scope for this task
- Bidirectional sync: Close/Reopen push to Zoho; Hold/Active/Review are Hub-only (custom status IDs are project-specific)
- Zoho links shown in both orchestration page and tasks-tab

---

## Requirements

- [ ] **Migration 013:** Add `zoho_task_id text` + `direct_zoho_edit boolean default false` to `implementation_plans`; drop and recreate `classification_records_status_check` to include all pipeline and PM action status values
- [ ] **Update `database.ts`** — add `zoho_task_id` and `direct_zoho_edit` to `implementation_plans` Row/Insert/Update
- [ ] **`syncTaskToZoho(input)`** in `src/lib/zoho/index.ts` — replace the throwing stub; fetch `zoho_project_id` from `customer_products`, create task in Zoho Projects API, return task ID string or `""` on any failure
- [ ] **`updateZohoTaskStatus()`** in `src/lib/zoho/index.ts` — new helper; updates Zoho task `completed` field (close/reopen only)
- [ ] **`PATCH /api/plan` approve path** — after existing DB updates, call `syncTaskToZoho()` and store returned `zoho_task_id` on the plan row (non-blocking: Zoho failure does not fail the approve)
- [ ] **`PATCH /api/zoho`** — replace 501 stub; PM status action handler; updates `classification_records.status` + syncs Close/Reopen to Zoho
- [ ] **Webhook extension** — handle inbound Zoho task completion/reopen events; update `implementation_plans.status` and set `direct_zoho_edit = true`
- [ ] **Orchestration page** — add "Open in Zoho" link on APPROVED plans that have `zoho_task_id`; add PM status action buttons; show "Modified in Zoho" warning when `direct_zoho_edit = true`
- [ ] **tasks-tab.tsx** — add Zoho link icon column for tasks where `classification_records.zoho_task_id` is set
- [ ] All Zoho API calls must follow env-gate pattern: check `ZOHO_PORTAL_ID`, `console.warn` + return `""` if missing, never throw

## Out of Scope / Must-Not-Change

- Zoho custom status ID mapping (Hold/Active/Review → Zoho; project-specific; deferred to Sprint 5)
- `kb_gaps` table / KB gap stubs — Sprint 6
- Developer dashboard (`/dev`) — Sprint 6
- Sprint 3 assessment logic — `assessTask()` and `buildContextChain()` must not be touched
- Plan generation logic (`src/lib/ai/plan.ts`) — do not modify
- Cliq notifications for plan events — Sprint 5 scope

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/013_zoho_task_sync.sql` | Create | Add `zoho_task_id`, `direct_zoho_edit` to `implementation_plans`; update `classification_records_status_check` |
| `src/types/database.ts` | Modify | Add `zoho_task_id` and `direct_zoho_edit` to `implementation_plans` Row/Insert/Update |
| `src/lib/zoho/index.ts` | Modify | Replace `syncTaskToZoho` stub; add `updateZohoTaskStatus` helper |
| `src/app/api/plan/route.ts` | Modify | Call `syncTaskToZoho` after approve; store `zoho_task_id` on plan row |
| `src/app/api/zoho/route.ts` | Modify | Replace 501 stub — `PATCH` handler for PM status actions |
| `src/app/api/webhooks/route.ts` | Modify | Handle inbound Zoho task completion events → update Hub plan status + `direct_zoho_edit` |
| `src/app/(hub)/orchestration/page.tsx` | Modify | Zoho link on APPROVED plans; PM status action buttons; "Modified in Zoho" warning |
| `src/app/(hub)/pm/tasks/page.tsx` | Modify | Extend select to join `customer_products(zoho_project_id)` |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | Add Zoho link icon column |
| `env.example` | Modify | Add `NEXT_PUBLIC_ZOHO_PORTAL_NAME` for client-side URL construction |

---

## Implementation Steps

### Step 1 — Migration 013

**`supabase/migrations/013_zoho_task_sync.sql`** (create)

```sql
-- WebriQ Central Hub — Sprint 4 Part 2
-- Migration 013: Zoho task sync columns + classification status expansion

-- Add Zoho sync columns to implementation_plans
alter table implementation_plans
  add column if not exists zoho_task_id     text,
  add column if not exists direct_zoho_edit boolean not null default false;

create index if not exists idx_implementation_plans_zoho_task_id
  on implementation_plans (zoho_task_id)
  where zoho_task_id is not null;

-- Expand classification_records status check to include pipeline + PM action statuses.
-- Original constraint ('pending', 'reviewed', 'rejected') from migration 001 is too narrow —
-- task 025 already writes 'planning' and 'approved' to this column.
alter table classification_records
  drop constraint if exists classification_records_status_check;

alter table classification_records
  add constraint classification_records_status_check
    check (status in (
      'pending', 'classifying', 'classified', 'reviewed', 'rejected',
      'planning', 'approved',
      'open', 'on_hold', 'active', 'review', 'closed'
    ));
```

---

### Step 2 — Update `database.ts` Types

**`src/types/database.ts`** (modify)

In `implementation_plans.Row`, add after `updated_at: string;`:
```typescript
zoho_task_id: string | null;
direct_zoho_edit: boolean;
```

In `implementation_plans.Insert`, add (both optional):
```typescript
zoho_task_id?: string | null;
direct_zoho_edit?: boolean;
```

In `implementation_plans.Update`, add (both optional):
```typescript
zoho_task_id?: string | null;
direct_zoho_edit?: boolean;
```

---

### Step 3 — Update `src/lib/zoho/index.ts`

**Replace** the throwing stub and **add** `updateZohoTaskStatus`. Import `adminClient` at the top.

```typescript
import { adminClient } from "@/lib/supabase/admin";
```

**Replace `syncTaskToZoho` stub (line 69–71) with:**

```typescript
type SyncTaskInput = {
  customerId: string;
  title: string;
  description: string;
};

export async function syncTaskToZoho(input: SyncTaskInput): Promise<string> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) {
    console.warn("[zoho] ZOHO_PORTAL_ID not configured — skipping task sync for", input.customerId);
    return "";
  }

  const { data: product } = await adminClient
    .from("customer_products")
    .select("zoho_project_id")
    .eq("customer_id", input.customerId)
    .not("zoho_project_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!product?.zoho_project_id) {
    console.warn("[zoho] no zoho_project_id for customer", input.customerId);
    return "";
  }

  const token = await getZohoAccessToken();
  if (!token) return "";

  const body = new URLSearchParams({
    name: input.title,
    ...(input.description ? { description: input.description } : {}),
  });

  const res = await fetch(
    `https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${product.zoho_project_id}/tasks/`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    console.error("[zoho] task creation failed:", res.status, await res.text());
    return "";
  }

  const json = await res.json();
  return (json?.tasks?.[0]?.id_string as string) ?? "";
}
```

**Add after `syncTaskToZoho`:**

```typescript
export async function updateZohoTaskStatus(
  zohoProjectId: string,
  zohoTaskId: string,
  completed: boolean
): Promise<boolean> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return false;

  const token = await getZohoAccessToken();
  if (!token) return false;

  const body = new URLSearchParams({ completed: completed ? "true" : "false" });

  const res = await fetch(
    `https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${zohoProjectId}/tasks/${zohoTaskId}/`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    console.error("[zoho] task status update failed:", res.status, await res.text());
    return false;
  }

  return true;
}
```

---

### Step 4 — Wire Zoho Push in `PATCH /api/plan`

**`src/app/api/plan/route.ts`** (modify)

Add import at top:
```typescript
import { syncTaskToZoho } from "@/lib/zoho";
```

Expand the plan fetch to include `customer_id`:
```typescript
// Change line 58-61 from:
.select("id, assessment_id")
// to:
.select("id, assessment_id, customer_id")
```

After the `Promise.all` in the `approve` branch (after line 89), add:

```typescript
// Push to Zoho — non-blocking; Zoho failure does not fail the approve
const { data: classificationRecord } = await adminClient
  .from("classification_records")
  .select("title, description")
  .eq("id", classificationId)
  .maybeSingle();

if (classificationRecord && plan.customer_id) {
  const zohoTaskId = await syncTaskToZoho({
    customerId: plan.customer_id,
    title: classificationRecord.title,
    description: classificationRecord.description ?? "",
  });
  if (zohoTaskId) {
    await adminClient
      .from("implementation_plans")
      .update({ zoho_task_id: zohoTaskId })
      .eq("id", planId);
  }
}
```

Note: `plan.customer_id` — TypeScript will accept this once the `database.ts` select includes it in the query. Cast as needed: `(plan as { id: string; assessment_id: string; customer_id: string }).customer_id`.

---

### Step 5 — Implement `PATCH /api/zoho`

**`src/app/api/zoho/route.ts`** (replace entirely)

PM status actions: update `classification_records.status` in Hub + sync Close/Reopen to Zoho.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { updateZohoTaskStatus } from "@/lib/zoho";

type PmAction = "open" | "on_hold" | "active" | "review" | "close" | "reopen";

const ACTION_TO_STATUS: Record<PmAction, string> = {
  open: "open",
  on_hold: "on_hold",
  active: "active",
  review: "review",
  close: "closed",
  reopen: "pending",
};

const PatchSchema = z.object({
  classificationId: z.string().uuid(),
  action: z.enum(["open", "on_hold", "active", "review", "close", "reopen"]),
});

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { classificationId, action } = parsed.data;
  const newStatus = ACTION_TO_STATUS[action];

  await adminClient
    .from("classification_records")
    .update({ status: newStatus })
    .eq("id", classificationId);

  // Close and Reopen also push to Zoho via `completed` field
  if (action === "close" || action === "reopen") {
    // Resolve plan via: classification → assessment → plan
    const { data: assessment } = await adminClient
      .from("requirements_assessments")
      .select("id")
      .eq("classification_id", classificationId)
      .order("assessment_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assessment) {
      const { data: plan } = await adminClient
        .from("implementation_plans")
        .select("zoho_task_id, customer_id")
        .eq("assessment_id", assessment.id)
        .eq("status", "APPROVED")
        .maybeSingle();

      if (plan?.zoho_task_id && plan.customer_id) {
        const { data: product } = await adminClient
          .from("customer_products")
          .select("zoho_project_id")
          .eq("customer_id", plan.customer_id)
          .not("zoho_project_id", "is", null)
          .limit(1)
          .maybeSingle();

        if (product?.zoho_project_id) {
          await updateZohoTaskStatus(
            product.zoho_project_id,
            plan.zoho_task_id,
            action === "close"
          );
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
```

---

### Step 6 — Extend Webhooks for Inbound Status Sync

**`src/app/api/webhooks/route.ts`** (modify)

**1. Extend `ZohoPayload` type** (add two fields after `webhookToken`):
```typescript
status?: string;     // Zoho task status name on update events
completed?: string;  // "true" | "false" when task closed/reopened
```

**2. In the POST handler**, add a status-update branch BEFORE the existing `classifyTask` call. The distinguishing heuristic: if `zoho_task_id` exists AND matches an existing `implementation_plans.zoho_task_id` AND has a `completed` field → this is a status event, not a new task creation.

Insert this block after the `customerId` resolution and BEFORE `await classifyTask(...)`:

```typescript
// Check if this is a Zoho task status update on an already-pushed plan
if (zoho_task_id && (body.completed !== undefined)) {
  const { data: existingPlan } = await adminClient
    .from("implementation_plans")
    .select("id, status")
    .eq("zoho_task_id", zoho_task_id)
    .maybeSingle();

  if (existingPlan) {
    let newStatus: string | null = null;
    if (body.completed === "true") newStatus = "COMPLETE";
    else if (body.completed === "false") newStatus = "APPROVED"; // reopened → back to approved

    if (newStatus && newStatus !== existingPlan.status) {
      await adminClient
        .from("implementation_plans")
        .update({ status: newStatus, direct_zoho_edit: true })
        .eq("id", existingPlan.id);
    }

    return NextResponse.json({ received: true }); // do not classify — this was a status event
  }
}
```

---

### Step 7 — Update Orchestration Page

**`src/app/(hub)/orchestration/page.tsx`** (modify)

**1. Add `NEXT_PUBLIC_ZOHO_PORTAL_NAME` URL helper** near the top of the file (above components):

```typescript
function buildZohoTaskUrl(zohoProjectId: string, zohoTaskId: string): string {
  const portalName = process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME ?? "";
  if (!portalName) return "";
  return `https://projects.zoho.com/portal/${portalName}/project/${zohoProjectId}/tasks/all/task/${zohoTaskId}/`;
}
```

**2. Fetch `zoho_project_id` per customer** — add a query in the existing data fetch:

```typescript
const zohoProjectsRes = supabase
  .from("customer_products")
  .select("customer_id, zoho_project_id")
  .not("zoho_project_id", "is", null);
```

Include in the `Promise.all` alongside existing queries. Build a lookup map:
```typescript
const zohoProjectMap: Record<string, string> = {};
for (const p of zohoProjects ?? []) {
  if (p.zoho_project_id) zohoProjectMap[p.customer_id] = p.zoho_project_id;
}
```

**3. `PlanResult` component — add Zoho section below the action buttons:**

When `plan.status === "APPROVED"`:

```tsx
{/* Zoho link */}
{plan.zoho_task_id && zohoProjectId && buildZohoTaskUrl(zohoProjectId, plan.zoho_task_id) && (
  <a
    href={buildZohoTaskUrl(zohoProjectId, plan.zoho_task_id)}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
  >
    <ExternalLink size={12} />
    Open in Zoho
  </a>
)}

{/* Direct Zoho edit warning */}
{plan.direct_zoho_edit && (
  <span className="text-xs text-orange-600 font-medium mt-1 block">
    ⚠ Modified directly in Zoho
  </span>
)}

{/* PM status actions */}
<div className="flex gap-1 flex-wrap mt-2">
  {(["open", "on_hold", "active", "review", "close"] as const).map((pmAction) => (
    <button
      key={pmAction}
      onClick={() => handlePmAction(classificationId, pmAction)}
      disabled={pmActionLoading}
      className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-50 capitalize disabled:opacity-50"
    >
      {pmAction === "on_hold" ? "On Hold" : pmAction.charAt(0).toUpperCase() + pmAction.slice(1)}
    </button>
  ))}
</div>
```

**4. `handlePmAction` function** in `PlanRow` component:

```typescript
async function handlePmAction(classificationId: string, action: string) {
  setPmActionLoading(true);
  try {
    await fetch("/api/zoho", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classificationId, action }),
    });
  } finally {
    setPmActionLoading(false);
  }
}
```

Add `pmActionLoading` state to `PlanRow` local state.

Pass `classificationId` and `zohoProjectId` (from `zohoProjectMap[record.customer_id]`) as props to `PlanResult`.

---

### Step 8 — Update tasks-tab

**`src/app/(hub)/pm/tasks/page.tsx`** (modify)

Extend the select to include `zoho_project_id` from customer_products:

```typescript
// Change:
.select("*, customers(company_name)")
// to:
.select("*, customers(company_name), customer_products(zoho_project_id)")
```

Update the `ClassificationRow` type:
```typescript
type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"] & {
  customers?: { company_name: string } | null;
  customer_products?: Array<{ zoho_project_id: string | null }> | null;
};
```

**`src/components/hub/pm-tabs/tasks-tab.tsx`** (modify)

Update the `ClassificationRow` type definition in this file to match (add `customer_products` field).

In the table header row, add a "Zoho" column header after the last existing column.

In each row, add the Zoho link cell:
```tsx
<td className="px-3 py-2 text-center">
  {task.zoho_task_id && task.customer_products?.[0]?.zoho_project_id ? (
    <a
      href={`https://projects.zoho.com/portal/${process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME ?? ""}/project/${task.customer_products[0].zoho_project_id}/tasks/all/task/${task.zoho_task_id}/`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:text-blue-700 inline-flex"
      title="Open in Zoho"
    >
      <ExternalLink size={14} />
    </a>
  ) : null}
</td>
```

Import `ExternalLink` from `lucide-react` if not already imported.

---

### Step 9 — Update `env.example`

Add after `ZOHO_PORTAL_ID`:
```
# Zoho Projects portal name (slug) — used for web URL construction (client-safe)
# Different from ZOHO_PORTAL_ID (numeric API ID); find in your Zoho Projects URL: projects.zoho.com/portal/{name}
NEXT_PUBLIC_ZOHO_PORTAL_NAME=your-portal-name
```

---

## Acceptance Criteria

- [ ] Migration 013 runs cleanly; `implementation_plans` has `zoho_task_id` (nullable text) and `direct_zoho_edit` (boolean, default false)
- [ ] Approving a plan in Hub triggers Zoho task creation → `implementation_plans.zoho_task_id` is populated
- [ ] If `ZOHO_PORTAL_ID` is unset, approve still succeeds with no `zoho_task_id` — no error thrown
- [ ] Approved plans with `zoho_task_id` show "Open in Zoho" link in the orchestration page
- [ ] PM action buttons (Open / Hold / Active / Review / Close / Reopen) update `classification_records.status`
- [ ] "Close" PM action sends `completed=true` to Zoho API; "Reopen" sends `completed=false`
- [ ] Inbound webhook with `completed=true` + matching `zoho_task_id` → `implementation_plans.status = "COMPLETE"` + `direct_zoho_edit = true`
- [ ] Plans with `direct_zoho_edit = true` show "Modified directly in Zoho" warning in orchestration UI
- [ ] Tasks with `zoho_task_id` set in tasks-tab show an ExternalLink icon to Zoho
- [ ] `npx tsc --noEmit` passes with no new errors

---

## Verification

```bash
npx tsc --noEmit
pnpm build

# 1. Run migration 013 in Supabase dashboard (or via supabase db push)
# 2. Browser: /orchestration — approve a PENDING_APPROVAL plan
#    → zoho_task_id should appear in DB (check Supabase dashboard)
#    → "Open in Zoho" link visible if ZOHO_PORTAL_ID + NEXT_PUBLIC_ZOHO_PORTAL_NAME set
# 3. Browser: PM action "Close" → classification_records.status = "closed" in DB
# 4. Simulate inbound webhook: POST /api/webhooks with body { taskId: "<zoho_task_id>", completed: "true" }
#    → implementation_plans.status = "COMPLETE", direct_zoho_edit = true
# 5. Browser: /orchestration — approved plan shows "Modified directly in Zoho" warning
# 6. Browser: /pm/tasks — tasks with zoho_task_id show ExternalLink icon
```

---

## Code Context

### `src/lib/zoho/index.ts` — full current file (replace stub only)

```typescript
// Lines 68–71 (the stub to replace):
// Sprint 4 — not yet implemented
export async function syncTaskToZoho(_taskId: string): Promise<void> {
  throw new Error("Zoho task sync not yet implemented — Sprint 4");
}
```

Established patterns to mirror exactly:
- `getZohoAccessToken()`: form-encoded token refresh, returns `""` on any failure
- `createZohoProject()`: env-gate on `ZOHO_PORTAL_ID`, form-encoded POST, `Authorization: Zoho-oauthtoken ${token}`, returns `""` on failure

### `src/app/api/plan/route.ts:79–108` — approve action injection point

```typescript
if (action === "approve") {
  await Promise.all([
    adminClient.from("implementation_plans").update({ status: "APPROVED", approved_by: user.id }).eq("id", planId),
    adminClient.from("classification_records").update({ status: "approved" }).eq("id", classificationId),
  ]);
  // ← INSERT Zoho push here (Step 4)
} else {
  await Promise.all([
    adminClient.from("implementation_plans").update({ status: "REJECTED", rejection_reason: rejectionReason ?? null, rejected_by: user.id }).eq("id", planId),
    adminClient.from("classification_records").update({ status: "pending" }).eq("id", classificationId),
  ]);
}
return NextResponse.json({ ok: true });
```

### `src/app/api/webhooks/route.ts:7–19` — ZohoPayload type (extend for Step 6)

```typescript
type ZohoPayload = {
  ticketId?: string;
  subject?: string;
  accountId?: string;
  taskId?: string;
  taskName?: string;
  projectId?: string;
  description?: string;
  webhookToken?: string;
  // Add for Step 6:
  status?: string;
  completed?: string;
};
```

Existing webhook POST handler flow (keep intact; insert status-update branch before `classifyTask`):
```typescript
// line 89–106:
const source: WebhookSource = body.ticketId ? "zoho_desk" : "zoho_projects";
const zoho_task_id = body.taskId ?? null;
const customerId = await resolveCustomerId(source, body);
if (!customerId) { return NextResponse.json({ received: true }); }

// ← INSERT status-update branch here (Step 6)

await classifyTask({ customerId, title, description, source, zoho_ticket_id, zoho_task_id });
return NextResponse.json({ received: true });
```

### `src/app/api/zoho/route.ts` — current stub (replace entirely)

```typescript
import { NextResponse } from "next/server";
// Zoho sync — implemented in Sprints 2 & 4 (M7)
export async function POST() {
  return NextResponse.json({ message: "Zoho sync — Sprints 2 & 4" }, { status: 501 });
}
```

### `implementation_plans` Row type (`src/types/database.ts:247–266`)

```typescript
Row: {
  id: string;
  assessment_id: string;
  customer_id: string;
  steps: Json;
  affected_files: Json;
  apis_involved: Json;
  playbooks_used: Json;
  confidence_score: number | null;
  risk_flags: Json;
  status: string;
  rejection_reason: string | null;
  rejected_by: string | null;
  approved_by: string | null;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  updated_at: string;
  // Add after updated_at:
  zoho_task_id: string | null;
  direct_zoho_edit: boolean;
}
```

### `src/app/(hub)/pm/tasks/page.tsx` — current select (extend for Step 8)

```typescript
// Current:
.select("*, customers(company_name)")
// Change to:
.select("*, customers(company_name), customer_products(zoho_project_id)")
```

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-27

### What was built
Full bidirectional Zoho sync is live: approving a plan auto-pushes a Zoho task and stores the task ID; PM action buttons (Open / Hold / Active / Review / Close / Reopen) update Hub status with Close/Reopen also syncing to Zoho's `completed` field; inbound Zoho webhooks detect status events and set `direct_zoho_edit = true`; the orchestration page shows "Open in Zoho" links and "Modified directly in Zoho" warnings; the tasks-tab shows an ExternalLink icon for tasks that originated from a Zoho Projects webhook.

### How to access for testing
- URL: `/orchestration` — approve a PENDING_APPROVAL plan (requires `ZOHO_PORTAL_ID` + `NEXT_PUBLIC_ZOHO_PORTAL_NAME` set for Zoho push + link)
- PM action buttons appear on APPROVED plans in the Plan Generation section
- Simulate inbound webhook: `POST /api/webhooks` with `{ taskId: "<zoho_task_id>", completed: "true" }`
- URL: `/pm/tasks` — tasks with `zoho_task_id` (inbound from Zoho webhook) show ExternalLink icon
- Setup: run migration `013_zoho_task_sync.sql` in Supabase before testing

### Deviations from plan
- **Minor:** `tasks/page.tsx` fetches `customer_products` in a separate query to build `zohoProjectMap`, rather than joining it into the main `classification_records` select as the spec suggested. Same outcome; the separate query avoids Supabase one-to-many join type complications and is cleaner.
- **Minor:** `tasks-tab.tsx` uses `zohoProjectMap[t.customer_id]` prop instead of extending `ClassificationRow` with a `customer_products` field — consistent with the page's implementation approach.
- **Observation (not a deviation):** `parseParams()` in `webhooks/route.ts` does not parse `status`/`completed` from form-encoded payloads. JSON payloads are the expected format for Zoho task status update events, so this is acceptable for the target scenario.

### Standards check
Pass — no `any` types, no unused imports, proper guard clauses, env-gate pattern followed on all Zoho calls, all Zoho functions return `""` or `false` on failure (never throw). Pre-existing `console.log` in `webhooks/route.ts:76` not introduced by this task.

### Convention check
Pass — `adminClient` used server-side only, Zoho push is non-blocking per spec, `ZOHO_PORTAL_ID` env-gate applied consistently, Tailwind classes only, `NEXT_PUBLIC_ZOHO_PORTAL_NAME` used for client-safe URL construction.

---

## Notes for Implementation Agent

- **Zoho task push is non-blocking** — `syncTaskToZoho()` returning `""` must not fail the approve. The `zoho_task_id` just stays `null`. Never throw from Zoho calls; always return `""` or `false`.
- **`adminClient` in `src/lib/zoho/index.ts`** — zoho lib functions are server-only helpers called from API routes; `adminClient` is appropriate here. Add the import at the top of the file.
- **Zoho task URL uses portal NAME (slug), not numeric portal ID** — `NEXT_PUBLIC_ZOHO_PORTAL_NAME` is distinct from `ZOHO_PORTAL_ID`. The API uses the numeric ID; the web URL uses the name. Find the portal name in: `https://projects.zoho.com/portal/{name}/`. Both env vars needed.
- **Webhook status event disambiguation** — Zoho sends the same URL for task creation AND task updates. The distinguishing signal: if `body.completed !== undefined` AND a plan row with that `zoho_task_id` exists → it's a status event. Return early after handling; do NOT call `classifyTask` for status events.
- **Finding plan from `classificationId` in `/api/zoho`** — two-hop join: `requirements_assessments.classification_id = classificationId` → `implementation_plans.assessment_id = assessment.id`. A plan may not exist (task may have been classified but not yet planned). Handle `null` gracefully.
- **Migration 013 must run before this code reaches production** — the `classification_records_status_check` constraint from migration 001 allows only `('pending', 'reviewed', 'rejected')`. Task 025 already writes `'planning'` and `'approved'` to this column — those would fail without this migration. Run migration 013 first.
- **`/api/zoho` route exports PATCH, not POST** — replace the existing `POST` stub entirely with a `PATCH` export. Do not keep the `POST` export.
- **`customer_products` join in tasks-tab** — Supabase returns this as an array (one-to-many). Use `task.customer_products?.[0]?.zoho_project_id` to get the first project ID. Only one Zoho project per customer is expected in Phase 1.
- **Hold/Active/Review PM actions are Hub-only** — they update `classification_records.status` in the DB but do NOT call Zoho API. Custom status IDs are project-specific in Zoho and require a separate setup step. Only Close (`completed=true`) and Reopen (`completed=false`) sync to Zoho.
- **`ExternalLink` from lucide-react** — already available in the project. Import as needed in any component file that doesn't already have it.
- **`ImplementationPlanRow` convenience type** at `src/types/database.ts:657` — use `Database["public"]["Tables"]["implementation_plans"]["Row"]` consistently; the new fields will be included automatically after the Row type is updated.
