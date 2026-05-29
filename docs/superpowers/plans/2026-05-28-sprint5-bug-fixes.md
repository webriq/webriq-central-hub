# Sprint 5 Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 confirmed/plausible Sprint 5 bugs and one TypeScript config issue so the execution → revert → reply loop is safe and `npx tsc --noEmit` passes with 0 errors.

**Architecture:** Seven surgical edits to existing files — no new files, no new dependencies, no schema changes. Each task targets one location, can be verified independently with `npx tsc --noEmit`, and does not affect unrelated behaviour.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`adminClient`), `@sanity/client`, Tailwind + shadcn/ui, pnpm

> **No test runner is configured.** Verification for every task is:
> 1. `npx tsc --noEmit` — must still return 0 errors after the change
> 2. Browser acceptance test described per task (where applicable)
>
> **No git commands.** User manages all version control manually.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/sanity/index.ts` | Pre-state map: array-index → `_id` key (Task 1) |
| `src/app/api/execution/[id]/revert/route.ts` | Check `Promise.all` results after Sanity revert (Task 2) |
| `src/app/api/execution/route.ts` | Log errors on post-execution status updates (Task 3) |
| `src/app/api/execution/route.ts` | Fix circuit breaker threshold + race (Task 4) |
| `tsconfig.json` | Add `"types": ["node"]` to `compilerOptions` (Task 5) |
| `src/app/api/reply/[id]/send/route.ts` | Atomic guard on reply send (Task 6) |
| `src/app/(hub)/orchestration/page.tsx` | `.single()` → `.maybeSingle()` after execution trigger (Task 7) |

---

## Task 1: Fix pre-action state map to key by `_id`

**File:** `src/lib/sanity/index.ts:91–94`
**Why:** `client.getDocuments(ids)` does not guarantee returned documents are in the same order as the input array. The current index-based map silently mis-maps states, so revert applies the wrong pre-state to each document.

- [ ] **Step 1: Open `src/lib/sanity/index.ts` and locate lines 91–94**

The current code reads:
```ts
const preDocs = await client.getDocuments(allDocIds);
allDocIds.forEach((id, i) => {
  pre_action_states[id] = preDocs[i] ?? null;
});
```

- [ ] **Step 2: Replace the index-based loop with an `_id`-keyed map**

Replace those 4 lines with:
```ts
const preDocs = await client.getDocuments(allDocIds);
preDocs.forEach((doc) => {
  if (doc?._id) pre_action_states[doc._id] = doc;
});
allDocIds.forEach((id) => {
  if (!(id in pre_action_states)) pre_action_states[id] = null;
});
```

The second `forEach` fills in `null` for any document IDs that Sanity didn't return (i.e. documents that don't exist yet). `revertSanityExecution` already handles `null` by calling `tx.delete(docId)` — correct rollback for newly-created docs.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors (same as before — this change is type-compatible).

---

## Task 2: Check DB writes after Sanity revert

**File:** `src/app/api/execution/[id]/revert/route.ts:56–67`
**Why:** If either Supabase write fails after `revertSanityExecution()` succeeds, Sanity content is already rolled back but the Hub DB permanently shows the execution as `COMPLETED`, making the revert invisible and blocking a second attempt.

- [ ] **Step 1: Open `src/app/api/execution/[id]/revert/route.ts` and locate lines 56–67**

The current code reads:
```ts
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
```

- [ ] **Step 2: Destructure results and return 500 if either write fails**

Replace those 11 lines with:
```ts
  const [execResult, planResult] = await Promise.all([
    adminClient
      .from("execution_records")
      .update({ status: "REVERTED" })
      .eq("id", id),
    adminClient
      .from("implementation_plans")
      .update({ status: "APPROVED" })
      .eq("id", execution.plan_id),
  ]);

  if (execResult.error || planResult.error) {
    console.error(
      "[revert] DB update failed after Sanity revert was applied",
      execResult.error ?? planResult.error
    );
    return NextResponse.json(
      { error: "Revert applied but status update failed — manual review required" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

## Task 3: Log errors on post-execution status updates

**File:** `src/app/api/execution/route.ts:117–126`
**Why:** After `executeSanityPlan()` succeeds, if the `Promise.all` that flips plan to `COMPLETE` and classification to `closed` silently fails, the plan appears stuck at `APPROVED`. The PM may re-trigger execution, causing duplicate Sanity mutations. The route must still return `{ ok: true }` (execution genuinely succeeded), but the error needs to be logged.

- [ ] **Step 1: Open `src/app/api/execution/route.ts` and locate lines 117–126**

The current code reads:
```ts
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
```

- [ ] **Step 2: Destructure results and log on failure — do not fail the response**

Replace those 9 lines with:
```ts
    const [planUpdate, classUpdate] = await Promise.all([
      adminClient
        .from("implementation_plans")
        .update({ status: "COMPLETE" })
        .eq("id", planId),
      adminClient
        .from("classification_records")
        .update({ status: "closed" })
        .eq("id", classificationId),
    ]);

    if (planUpdate.error || classUpdate.error) {
      console.error(
        "[execution] post-execution status update failed",
        planUpdate.error ?? classUpdate.error
      );
    }
```

The function continues to `return NextResponse.json({ ok: true, executionId: execution.id })` — do not add an early return here.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

## Task 4: Fix circuit breaker threshold and race condition

**File:** `src/app/api/execution/route.ts:158–173`
**Why:** Two problems in the same block:
1. `recent?.length === 3` means a customer with only 1–2 total failed executions never gets paused.
2. The query runs immediately after updating the current record's status. Under replica lag, the just-inserted FAILED row may not appear in the query, returning 2 records — `length !== 3` → breaker never trips.

Fix: exclude the current execution from the query (fetch 2 *prior* records), then inject `"FAILED"` for the current execution from code before applying the threshold.

- [ ] **Step 1: Open `src/app/api/execution/route.ts` and locate the circuit breaker block (lines 158–173)**

The current code reads:
```ts
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
```

- [ ] **Step 2: Replace with the race-safe version**

Replace those 13 lines with:
```ts
    if (!isPartial) {
      // Circuit breaker: pause automation if last 3 executions for this customer all failed.
      // Excludes the current record to avoid a read-after-write race; injects "FAILED" manually.
      const { data: recent } = await adminClient
        .from("execution_records")
        .select("status")
        .eq("customer_id", customerId)
        .neq("id", execution.id)
        .order("created_at", { ascending: false })
        .limit(2);

      const last3 = ["FAILED", ...(recent?.map((e) => e.status) ?? [])];
      if (last3.length === 3 && last3.every((s) => s === "FAILED")) {
        await adminClient
          .from("customers")
          .update({ automation_paused: true })
          .eq("customer_id", customerId);
      }
    }
```

`last3.length === 3` requires exactly 2 prior records in DB — new customers with fewer than 3 total executions will not trigger the breaker (strict 3-consecutive threshold preserved).

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

## Task 5: Add `"node"` to tsconfig compiler types

**File:** `tsconfig.json`
**Why:** `npx tsc --noEmit` currently fails with 12 errors. `proxy.ts` and `src/lib/zoho/index.ts` live outside Next.js's compilation boundary and don't inherit Node globals automatically. `@types/node` is in `devDependencies` but not listed in `compilerOptions.types`, so `process` is undefined to the type-checker.

- [ ] **Step 1: Open `tsconfig.json`**

The current `compilerOptions` has no `types` field. The full file is:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Add `"types": ["node"]` inside `compilerOptions`**

Add it after the `"incremental": true` line, before `"plugins"`:
```json
    "incremental": true,
    "types": ["node"],
    "plugins": [
```

The updated `compilerOptions` block will be:
```json
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "types": ["node"],
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
```

- [ ] **Step 3: Run TypeScript check — this is the primary success signal for this task**

```bash
npx tsc --noEmit
```

Expected: **0 errors** (down from 12). If errors remain, they are unrelated to this fix — note them and continue.

---

## Task 6: Atomic guard on reply send

**File:** `src/app/api/reply/[id]/send/route.ts:49–66`
**Why:** An upfront `status !== "DRAFT"` check exists, but there is a race window between the read and the update (PM double-submits rapidly). Adding `.eq("status", "DRAFT")` to the UPDATE clause and checking the returned row makes the guard atomic — `sendCliqNotification` only fires if this request's UPDATE actually claimed the row.

- [ ] **Step 1: Open `src/app/api/reply/[id]/send/route.ts` and locate lines 49–66**

The current code reads:
```ts
  const wasEdited = content !== draft.draft_content;
  await adminClient
    .from("reply_drafts")
    .update({
      status: "SENT",
      sent_at: new Date().toISOString(),
      pm_edited_content: wasEdited ? content : null,
      pm_diff: wasEdited
        ? JSON.stringify({ before: draft.draft_content, after: content })
        : null,
    })
    .eq("id", id);

  sendCliqNotification(content, "pm").catch((err) =>
    console.error("[reply/send] Cliq notification failed:", err)
  );

  return NextResponse.json({ ok: true });
```

- [ ] **Step 2: Add `.eq("status", "DRAFT")` to the update, check the result, guard notification behind it**

Replace those 17 lines with:
```ts
  const wasEdited = content !== draft.draft_content;
  const { data: updated } = await adminClient
    .from("reply_drafts")
    .update({
      status: "SENT",
      sent_at: new Date().toISOString(),
      pm_edited_content: wasEdited ? content : null,
      pm_diff: wasEdited
        ? JSON.stringify({ before: draft.draft_content, after: content })
        : null,
    })
    .eq("id", id)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle();

  if (!updated) {
    return NextResponse.json(
      { error: "Draft already sent or not found" },
      { status: 409 }
    );
  }

  sendCliqNotification(content, "pm").catch((err) =>
    console.error("[reply/send] Cliq notification failed:", err)
  );

  return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

## Task 7: Change `.single()` to `.maybeSingle()` after execution trigger

**File:** `src/app/(hub)/orchestration/page.tsx:478–482`
**Why:** After `POST /api/execution` returns `executionId`, the client fetches the new record with `.single()`. If Supabase read-replica lag means the just-inserted row isn't immediately visible, PostgREST throws — surfacing a misleading "Network error" to the PM even though execution succeeded. `.maybeSingle()` returns `null` instead of throwing; the existing `if (exec) onExecuted(...)` guard handles `null` cleanly.

- [ ] **Step 1: Open `src/app/(hub)/orchestration/page.tsx` and locate lines 478–482**

The current code reads:
```ts
        const { data: exec } = await supabase
          .from("execution_records")
          .select("*")
          .eq("id", data.executionId)
          .single();
        if (exec) onExecuted(exec as ExecutionRecordRow);
```

- [ ] **Step 2: Change `.single()` to `.maybeSingle()`**

Replace those 6 lines with:
```ts
        const { data: exec } = await supabase
          .from("execution_records")
          .select("*")
          .eq("id", data.executionId)
          .maybeSingle();
        if (exec) onExecuted(exec as ExecutionRecordRow);
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Start the dev server and verify execution flow in the browser**

```bash
pnpm dev
```

Navigate to `/orchestration`, open a classification that has an `APPROVED` plan, and click "Execute". Confirm:
- Button shows loading state while execution runs
- On success: execution status renders (`COMPLETED` or `FAILED`) — no generic "Network error"
- On revert: status updates to `REVERTED` in the UI

---

## Final Verification

- [ ] **Run full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: **0 errors**

- [ ] **Run production build**

```bash
pnpm build
```

Expected: Build completes with no type errors or missing module errors.
