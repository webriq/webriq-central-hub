# Task 027 — Sprint 5: Execution Engine (M6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Sanity API execution for approved plans (M6).

**Architecture:** The execution engine reads an approved plan's steps, calls Claude Sonnet (`execution` layer) to translate them into specific Sanity mutations, applies them with pre-state capture, then stores an execution record. On success, a non-blocking call to the reply API triggers Task 028 (reply draft generation).

**Tech Stack:** `@sanity/client`, Vercel AI SDK `generateObject`, Zod, Supabase `adminClient`, Zoho Cliq webhook

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/014_sprint5_execution.sql` | Create | Add `automation_paused` to customers + status constraint on execution_records |
| `src/lib/sanity/index.ts` | Modify | Wire up Sanity client, mutation executor, reverter |
| `src/app/api/execution/route.ts` | Create | POST — trigger execution for an approved plan |
| `src/app/api/execution/[id]/revert/route.ts` | Create | POST — revert a COMPLETED/PARTIAL execution |
| `src/types/database.ts` | Modify | Add `automation_paused` to customers Row/Insert/Update |
| `src/app/(hub)/orchestration/page.tsx` | Modify | Add Execution section to task detail panel; automation-paused banner |

> **No test runner is configured.** Each task validates with `npx tsc --noEmit` plus the browser acceptance test in the final task.

---

## Pre-Sprint: Close Testing Tasks

### Task 0: Mark tasks 021–026 complete in TASKS.md

**Files:**
- Modify: `TASKS.md`

- [ ] **Step 1: Move rows 021–026 from Testing to Completed**

In `TASKS.md`, find the Testing section. Move these six rows to the Completed section, appending `(completed: 2026-05-27)` to each:

```
- [026] Sprint 4 Part 2 — Full Zoho Sync (M7 complete)
- [025] Sprint 4 — Plan Generation (M5)
- [024] Sprint 3 Digest Gaps — Clarification Flag, Automation Queue, Unassigned Tasks
- [023] Dev Digest — Type-Aware Queries, Dev Prompt & Cliq Dev Channel
- [022] Sprint 3 — Requirements Assessment (M3) + Daily Digest (M4)
- [021] Onboarding Submission Flow — PM Notification, Zoho Project Dialog & Status Transitions
```

- [ ] **Step 2: Verify Testing section is now empty**

---

## Part 1: Task 027 — Execution Engine (M6)

### Task 1: Install @sanity/client

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install the dependency**

```bash
pnpm add @sanity/client
```

Expected: `+ @sanity/client X.X.X` added to `package.json` and `pnpm-lock.yaml`.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

---

### Task 2: Migration 014 — automation_paused + execution status constraint

**Files:**
- Create: `supabase/migrations/014_sprint5_execution.sql`

- [ ] **Step 1: Create the migration file with this exact content**

```sql
-- WebriQ Central Hub — Sprint 5
-- Migration 014: Execution engine additions

-- Circuit breaker: tripped when 3 consecutive executions fail for a customer
alter table customers
  add column if not exists automation_paused boolean not null default false;

-- Constrain execution_records.status to valid pipeline values
alter table execution_records
  add constraint execution_records_status_check
    check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_EXECUTION', 'FAILED', 'REVERTED'));
```

- [ ] **Step 2: Apply in Supabase Dashboard**

Go to Supabase Dashboard → SQL Editor. Paste and run the migration. Verify: no errors, and the `automation_paused` column appears on the `customers` table in Table Editor.

---

### Task 3: Update database types — automation_paused on customers

**Files:**
- Modify: `src/types/database.ts`

The `customers` Row/Insert/Update blocks need the new column. Find each block by searching for `daily_token_budget`.

- [ ] **Step 1: Add to customers Row** (after `daily_token_budget: number | null;`):

```typescript
          automation_paused: boolean;
```

- [ ] **Step 2: Add to customers Insert** (after `daily_token_budget?: number | null;`):

```typescript
          automation_paused?: boolean;
```

- [ ] **Step 3: Add to customers Update** (after `daily_token_budget?: number | null;`):

```typescript
          automation_paused?: boolean;
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

---

### Task 4: Wire Sanity adapter

**Files:**
- Modify: `src/lib/sanity/index.ts`

Replace the entire stub file with this implementation:

- [ ] **Step 1: Replace src/lib/sanity/index.ts**

```typescript
import { createClient, type SanityClient } from "@sanity/client";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/model-config";
import type { Json } from "@/types/database";

export interface SanityExecutionResult {
  pre_action_states: Record<string, unknown>;
  post_action_states: Record<string, unknown>;
  what_was_done: string;
  what_was_skipped: string | null;
}

export interface PlanStep {
  order: number;
  title: string;
  description: string;
  estimated_hours?: number;
}

const SanityMutationSchema = z.object({
  mutations: z.array(
    z.object({
      action: z.enum(["create", "patch", "delete", "publish"]),
      documentId: z.string(),
      document: z.record(z.unknown()).optional(),
      patch: z
        .object({
          set: z.record(z.unknown()).optional(),
          unset: z.array(z.string()).optional(),
        })
        .optional(),
    })
  ),
  what_was_done: z.string(),
  what_was_skipped: z.string().nullable(),
});

export function getSanityClient(projectId: string): SanityClient {
  const token = process.env.SANITY_API_TOKEN;
  if (!token) throw new Error("SANITY_API_TOKEN is not set");
  return createClient({
    projectId,
    dataset: "production",
    apiVersion: "2024-01-01",
    token,
    useCdn: false,
  });
}

export async function executeSanityPlan(
  projectId: string,
  steps: PlanStep[],
  contextChain: string
): Promise<SanityExecutionResult> {
  const client = getSanityClient(projectId);
  const model = await getModel("execution");

  const { object: plan } = await generateObject({
    model,
    schema: SanityMutationSchema,
    prompt: [
      "You are executing an approved implementation plan against a Sanity CMS project.",
      "Translate the following plan steps into specific Sanity API mutations.",
      "Only produce mutations you are confident about. List anything you skip.",
      "",
      "Context:",
      contextChain,
      "",
      "Plan steps:",
      steps.map((s) => `${s.order}. ${s.title}: ${s.description}`).join("\n"),
    ].join("\n"),
  });

  // Capture pre-states for all documents we will touch
  const pre_action_states: Record<string, unknown> = {};
  for (const m of plan.mutations) {
    if (["patch", "delete", "publish"].includes(m.action)) {
      const doc = await client.getDocument(m.documentId).catch(() => null);
      pre_action_states[m.documentId] = doc ?? null;
    }
  }

  // Execute content mutations in a single transaction
  const tx = client.transaction();
  for (const m of plan.mutations) {
    if (m.action === "create" && m.document) {
      tx.create({ _id: m.documentId, ...m.document } as Parameters<typeof tx.create>[0]);
    } else if (m.action === "patch" && m.patch) {
      tx.patch(m.documentId, (p) => {
        if (m.patch!.set) p.set(m.patch!.set!);
        if (m.patch!.unset) p.unset(m.patch!.unset!);
        return p;
      });
    } else if (m.action === "delete") {
      tx.delete(m.documentId);
    }
  }
  await tx.commit();

  // Publish mutations run separately (they operate on draft → published pairs)
  for (const m of plan.mutations.filter((m) => m.action === "publish")) {
    await client.request({
      uri: `/v2024-01-01/data/mutate/production`,
      method: "POST",
      body: { mutations: [{ publish: { id: m.documentId } }] },
    });
  }

  // Capture post-states
  const post_action_states: Record<string, unknown> = {};
  for (const m of plan.mutations) {
    const doc = await client.getDocument(m.documentId).catch(() => null);
    post_action_states[m.documentId] = doc ?? null;
  }

  return {
    pre_action_states,
    post_action_states,
    what_was_done: plan.what_was_done,
    what_was_skipped: plan.what_was_skipped,
  };
}

export async function revertSanityExecution(
  projectId: string,
  preActionStates: Json
): Promise<void> {
  const client = getSanityClient(projectId);
  const states = preActionStates as Record<string, unknown>;
  const tx = client.transaction();

  for (const [docId, doc] of Object.entries(states)) {
    if (doc === null) {
      tx.delete(docId);
    } else {
      tx.createOrReplace({
        ...(doc as Record<string, unknown>),
        _id: docId,
      } as Parameters<typeof tx.createOrReplace>[0]);
    }
  }

  await tx.commit();
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors before continuing. Common issues: `@sanity/client` patch API types — if the callback form causes errors, use the object form: `tx.patch(m.documentId, { set: m.patch.set ?? {}, unset: m.patch.unset ?? [] })`.

---

### Task 5: Execution API — POST /api/execution

**Files:**
- Create: `src/app/api/execution/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { executeSanityPlan, type PlanStep } from "@/lib/sanity";
import { buildContextChain } from "@/lib/ai/context-chain";
import { sendCliqNotification } from "@/lib/zoho";

const PostSchema = z.object({
  planId: z.string().uuid(),
  customerId: z.string().min(1),
  classificationId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { planId, customerId, classificationId } = parsed.data;

  // Validate plan is approved
  const { data: plan } = await adminClient
    .from("implementation_plans")
    .select("id, steps")
    .eq("id", planId)
    .eq("status", "APPROVED")
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found or not approved" }, { status: 404 });
  }

  // Check circuit breaker
  const { data: customer } = await adminClient
    .from("customers")
    .select("automation_paused")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (customer?.automation_paused) {
    return NextResponse.json(
      { error: "Automation is paused for this customer due to consecutive failures" },
      { status: 409 }
    );
  }

  // Get Sanity project ID from customer_products
  const { data: product } = await adminClient
    .from("customer_products")
    .select("sanity_project_id")
    .eq("customer_id", customerId)
    .not("sanity_project_id", "is", null)
    .maybeSingle();

  if (!product?.sanity_project_id) {
    return NextResponse.json(
      { error: "No Sanity project configured for this customer" },
      { status: 422 }
    );
  }

  // Create execution record
  const { data: execution, error: insertError } = await adminClient
    .from("execution_records")
    .insert({
      plan_id: planId,
      customer_id: customerId,
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !execution) {
    return NextResponse.json({ error: "Failed to create execution record" }, { status: 500 });
  }

  const steps = (plan.steps as PlanStep[]) ?? [];

  try {
    const contextChain = await buildContextChain(classificationId);
    const result = await executeSanityPlan(
      product.sanity_project_id,
      steps,
      contextChain
    );

    await adminClient
      .from("execution_records")
      .update({
        status: "COMPLETED",
        outcome: "SUCCESS",
        pre_action_states: result.pre_action_states,
        post_action_states: result.post_action_states,
        what_was_done: result.what_was_done,
        what_was_skipped: result.what_was_skipped,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    await Promise.all([
      adminClient
        .from("implementation_plans")
        .update({ status: "COMPLETE" })
        .eq("id", planId),
      adminClient
        .from("classification_records")
        .update({ status: "closed" })
        .eq("id", classificationId),
    ]);

    // Non-blocking: Cliq notification and reply generation
    sendCliqNotification(
      `✅ Execution complete for ${customerId}: ${result.what_was_done}`
    ).catch(() => {});

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    fetch(`${appUrl}/api/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classificationId,
        customerId,
        executionRecordId: execution.id,
        whatWasDone: result.what_was_done,
      }),
    }).catch(() => {});

    return NextResponse.json({ ok: true, executionId: execution.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isPartial = message.toLowerCase().includes("partial");
    const newStatus = isPartial ? "PARTIAL_EXECUTION" : "FAILED";

    await adminClient
      .from("execution_records")
      .update({
        status: newStatus,
        outcome: isPartial ? "PARTIAL" : "FAILED",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    if (!isPartial) {
      // Circuit breaker: pause automation if last 3 executions for this customer all failed
      const { data: recent } = await adminClient
        .from("execution_records")
        .select("status")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (recent?.length === 3 && recent.every((e) => e.status === "FAILED")) {
        await adminClient
          .from("customers")
          .update({ automation_paused: true })
          .eq("customer_id", customerId);
      }
    }

    return NextResponse.json({ error: message, status: newStatus }, { status: 500 });
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any errors.

---

### Task 6: Revert API — POST /api/execution/[id]/revert

**Files:**
- Create: `src/app/api/execution/[id]/revert/route.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "src/app/api/execution/[id]/revert"
```

Then create `src/app/api/execution/[id]/revert/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { revertSanityExecution } from "@/lib/sanity";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: execution } = await adminClient
    .from("execution_records")
    .select("id, plan_id, customer_id, status, pre_action_states")
    .eq("id", id)
    .maybeSingle();

  if (!execution) {
    return NextResponse.json({ error: "Execution record not found" }, { status: 404 });
  }

  if (!["COMPLETED", "PARTIAL_EXECUTION"].includes(execution.status)) {
    return NextResponse.json(
      { error: "Only COMPLETED or PARTIAL_EXECUTION records can be reverted" },
      { status: 409 }
    );
  }

  const { data: product } = await adminClient
    .from("customer_products")
    .select("sanity_project_id")
    .eq("customer_id", execution.customer_id)
    .not("sanity_project_id", "is", null)
    .maybeSingle();

  if (!product?.sanity_project_id) {
    return NextResponse.json({ error: "No Sanity project configured" }, { status: 422 });
  }

  await revertSanityExecution(product.sanity_project_id, execution.pre_action_states);

  await Promise.all([
    adminClient
      .from("execution_records")
      .update({ status: "REVERTED" })
      .eq("id", id),
    adminClient
      .from("implementation_plans")
      .update({ status: "APPROVED" })
      .eq("id", execution.plan_id),
  ]);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

---

### Task 7: Orchestration page — Execution section

**Files:**
- Modify: `src/app/(hub)/orchestration/page.tsx`

This task adds four things: (a) `ExecutionRecordRow` type, (b) execution + paused state, (c) `ExecutionSection` component, (d) the "Execute Plan" button and banner wired through `PlanRow`/`PlanResult`.

- [ ] **Step 1: Add ExecutionRecordRow type import**

After the line `type ImplementationPlanRow = Database["public"]["Tables"]["implementation_plans"]["Row"];`, add:

```typescript
type ExecutionRecordRow = Database["public"]["Tables"]["execution_records"]["Row"];
```

- [ ] **Step 2: Add state to OrchestrationPage**

Inside `OrchestrationPage`, after `const [plans, setPlans] = useState...`, add:

```typescript
const [executions, setExecutions] = useState<Record<string, ExecutionRecordRow>>({});
const [customerPaused, setCustomerPaused] = useState<Record<string, boolean>>({});
```

- [ ] **Step 3: Load executions + paused state in the useEffect**

Extend the `Promise.all` in `load()` with two more queries (add after the existing four):

```typescript
supabase
  .from("execution_records")
  .select("*")
  .order("created_at", { ascending: false }),
supabase
  .from("customers")
  .select("customer_id, automation_paused")
  .eq("automation_paused", true),
```

After `setPlans(latestByAssessment);`, add:

```typescript
const latestByPlan: Record<string, ExecutionRecordRow> = {};
for (const e of (executionsResult.data ?? []) as ExecutionRecordRow[]) {
  if (!latestByPlan[e.plan_id]) latestByPlan[e.plan_id] = e;
}
setExecutions(latestByPlan);

const paused: Record<string, boolean> = {};
for (const c of (pausedResult.data ?? []) as Array<{
  customer_id: string;
  automation_paused: boolean;
}>) {
  paused[c.customer_id] = true;
}
setCustomerPaused(paused);
```

- [ ] **Step 4: Add automation-paused banner**

At the start of the return JSX in `OrchestrationPage` (before the heading `div`), add:

```tsx
{Object.keys(customerPaused).length > 0 && (
  <div className="mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-[13px]">
    ⚠️ Automation paused for{" "}
    <span className="font-mono">{Object.keys(customerPaused).join(", ")}</span>
    {" "}— 3 consecutive execution failures. Reset via customer settings.
  </div>
)}
```

- [ ] **Step 5: Add ExecutionSection component**

Add this new component after the closing `}` of `PlanResult`:

```tsx
function ExecutionSection({
  plan,
  execution,
  classificationId,
  customerId,
  isPaused,
  onExecuted,
}: {
  plan: ImplementationPlanRow;
  execution: ExecutionRecordRow | null;
  classificationId: string;
  customerId: string;
  isPaused: boolean;
  onExecuted: (execution: ExecutionRecordRow) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExecute() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, customerId, classificationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Execution failed");
      } else {
        const supabase = createClient();
        const { data: exec } = await supabase
          .from("execution_records")
          .select("*")
          .eq("id", data.executionId)
          .single();
        if (exec) onExecuted(exec as ExecutionRecordRow);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevert() {
    if (!execution) return;
    setLoading(true);
    try {
      await fetch(`/api/execution/${execution.id}/revert`, { method: "POST" });
      onExecuted({ ...execution, status: "REVERTED" });
    } finally {
      setLoading(false);
    }
  }

  const statusColorClass: Record<string, string> = {
    RUNNING: "text-blue-600",
    COMPLETED: "text-green-600",
    PARTIAL_EXECUTION: "text-yellow-700",
    FAILED: "text-red-600",
    REVERTED: "text-slate-400",
  };

  return (
    <div className="mt-4 border-t border-black/5 pt-4">
      <div className="text-[12px] font-semibold text-slate-700 mb-2">Execution</div>

      {!execution && plan.status === "APPROVED" && (
        <button
          onClick={handleExecute}
          disabled={loading || isPaused}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
            isPaused
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          )}
        >
          {loading ? "Executing…" : isPaused ? "Automation Paused" : "Execute Plan"}
        </button>
      )}

      {execution && (
        <div className="space-y-1.5">
          <div
            className={cn(
              "text-[12px] font-semibold",
              statusColorClass[execution.status] ?? "text-slate-600"
            )}
          >
            {execution.status === "RUNNING"
              ? "⏳ Running…"
              : execution.status.replace(/_/g, " ")}
          </div>
          {execution.what_was_done && (
            <p className="text-[12px] text-slate-600">{execution.what_was_done}</p>
          )}
          {execution.what_was_skipped && (
            <p className="text-[12px] text-slate-400">
              Skipped: {execution.what_was_skipped}
            </p>
          )}
          {execution.error_message && (
            <p className="text-[12px] text-red-600">{execution.error_message}</p>
          )}
          {["COMPLETED", "PARTIAL_EXECUTION"].includes(execution.status) && (
            <button
              onClick={handleRevert}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              {loading ? "Reverting…" : "Revert"}
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Thread execution props through PlanRow and PlanResult**

**6a. Extend PlanRow props** — find the `PlanRow` function signature and add these three props:

```typescript
execution: ExecutionRecordRow | null;
isPaused: boolean;
onExecuted: (e: ExecutionRecordRow) => void;
```

**6b. Pass them down to PlanResult** — inside `PlanRow`, where it renders `<PlanResult ...>`, pass:

```tsx
execution={execution}
isPaused={isPaused}
onExecuted={onExecuted}
```

**6c. Extend PlanResult props** — add to the `PlanResult` function signature:

```typescript
execution: ExecutionRecordRow | null;
isPaused: boolean;
onExecuted: (e: ExecutionRecordRow) => void;
```

**6d. Render ExecutionSection at the bottom of PlanResult's JSX** (after the PM actions section, before the closing `</div>`):

```tsx
<ExecutionSection
  plan={plan}
  execution={execution}
  classificationId={record.id}
  customerId={record.customer_id}
  isPaused={isPaused}
  onExecuted={onExecuted}
/>
```

Note: `PlanResult` currently receives `plan` and needs `record` (the classification record) for `classificationId` and `customer_id`. If `record` is not already a prop, add it:

```typescript
record: ClassificationRecordRow;
```

And pass `record={record}` from `PlanRow` where it renders `<PlanResult>`.

**6e. Update planTasks.map in OrchestrationPage** — add the new props to each `<PlanRow>`:

```tsx
execution={plan ? (executions[plan.id] ?? null) : null}
isPaused={customerPaused[task.customer_id] ?? false}
onExecuted={(exec) =>
  setExecutions((prev) => ({ ...prev, [exec.plan_id]: exec }))
}
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```

Work through any type errors. Common issues: `record` prop missing on `PlanResult`; destructor mismatch between `PlanRow` and `PlanResult`.
