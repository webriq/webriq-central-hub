# Sprint 5 Bug Fixes — Design Spec

**Date:** 2026-05-28
**Scope:** 7 confirmed/plausible bugs from STATUS-REPORT.md + 1 TypeScript config fix
**Pre-requisite for:** Sprint 5 exit from Testing

---

## Overview

Seven implementation tasks covering 8 issues (STATUS-REPORT findings #4 and #5 are combined into one fix) across three API routes, one library file, one client component, and one config file. No new abstractions, no schema changes. All fixes are surgical — the minimum code change that closes each finding.

Approach: flat list, one implementation task per fix, executed in order.

---

## Task 1 — Fix pre-action state map to key by `_id`

**File:** `src/lib/sanity/index.ts:91–94`
**Severity:** 🔴 Confirmed — corrupts CMS rollback on Sanity document order mismatch

**Problem:** `client.getDocuments(ids)` does not guarantee returned documents are in the same order as the input `ids` array. The current code maps `pre_action_states[allDocIds[i]] = preDocs[i]`, which silently mis-maps states when the API reorders results (e.g. cache hits). When revert is triggered, the wrong pre-state is applied to each document.

**Fix:** Replace index-based loop with `_id`-keyed assignment, then fill missing IDs with `null`:

```ts
// Replace lines 92–94:
preDocs.forEach((doc) => {
  if (doc?._id) pre_action_states[doc._id] = doc;
});
allDocIds.forEach((id) => {
  if (!(id in pre_action_states)) pre_action_states[id] = null;
});
```

**Invariant preserved:** Documents that don't exist in Sanity yet (new creates) still receive `null` as their pre-state, which causes `revertSanityExecution` to delete them on rollback — correct behaviour.

---

## Task 2 — Check DB writes after Sanity revert

**File:** `src/app/api/execution/[id]/revert/route.ts:56–65`
**Severity:** 🔴 Confirmed — Sanity reverted but Hub DB permanently shows COMPLETED on write failure

**Problem:** After `revertSanityExecution()` succeeds (CMS content is already rolled back), the `Promise.all` that marks `execution_records` as `REVERTED` and `implementation_plans` as `APPROVED` discards both results. A Supabase write failure leaves the Hub DB showing the execution as `COMPLETED`, making the revert invisible to the UI and preventing a second revert attempt.

**Fix:** Destructure results and return 500 with a distinguishing message if either write fails:

```ts
// Replace the bare await Promise.all([...]) block:
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

---

## Task 3 — Log errors on post-execution status updates

**File:** `src/app/api/execution/route.ts:117–126`
**Severity:** 🔴 Confirmed — plan stuck at APPROVED after successful execution; PM may re-trigger

**Problem:** After `executeSanityPlan()` succeeds, the `Promise.all` that flips `implementation_plans` to `COMPLETE` and `classification_records` to `closed` discards both results. If either write fails, the route still returns `{ ok: true }`, the plan appears stuck in `APPROVED`, and the PM may re-trigger execution causing duplicate Sanity mutations.

**Fix:** Destructure and log — but do NOT fail the response (the execution genuinely succeeded):

```ts
// Replace the bare await Promise.all([...]) block:
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

The response continues to `{ ok: true, executionId: execution.id }`. The console error surfaces in Vercel logs for manual follow-up without breaking the client.

---

## Task 4 — Fix circuit breaker threshold and race condition

**File:** `src/app/api/execution/route.ts:159–172`
**Severity:** 🔴 Confirmed (#4) + 🟠 Plausible (#5) — circuit breaker never fires for new customers; race with just-inserted FAILED record

**Problems:**
1. `recent?.length === 3` strict equality means a customer with only 1 or 2 total executions (all FAILED) never gets automation paused.
2. The circuit breaker query runs immediately after updating the current record to `FAILED`. Under replica lag, the just-inserted row may not be visible, returning only 2 records — `length !== 3` → breaker never trips.

**Fix:** Exclude the current execution from the DB query (fetch the 2 *prior* records instead), then prepend the known-FAILED current execution from code before applying the threshold check:

```ts
// Replace the circuit breaker block (lines 159–172):
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
```

**Threshold preserved:** Strict 3-consecutive requirement is maintained — `last3.length === 3` requires exactly 2 prior records in DB plus the current one. New customers with fewer than 3 total executions do not trigger the breaker.

---

## Task 5 — Add `"node"` to tsconfig compiler types

**File:** `tsconfig.json`
**Severity:** TypeScript check fix — `npx tsc --noEmit` currently fails with 12 errors

**Problem:** `proxy.ts` and `src/lib/zoho/index.ts` live outside Next.js's compilation boundary and don't inherit Node globals automatically. `@types/node` is already in `devDependencies` but not listed in `compilerOptions.types`, so `process` is undefined to the type-checker.

**Fix:** Add `"types": ["node"]` to `compilerOptions` in `tsconfig.json`. No code changes.

---

## Task 6 — Guard Cliq notification behind confirmed DB write

**File:** `src/app/api/reply/[id]/send/route.ts:50–64`
**Severity:** 🟠 Plausible — duplicate Cliq message to client on concurrent double-submit

**Problem:** An upfront `status !== "DRAFT"` check exists, but there is a race window between the read and the update (PM double-submits rapidly). The UPDATE does not filter by `status`, so a second concurrent request can slip through the check and fire `sendCliqNotification` a second time even if the first request already claimed the row.

**Fix:** Add `.eq("status", "DRAFT")` to the UPDATE clause and verify a row was actually updated before proceeding. The Cliq call only fires if the update claimed the row atomically:

```ts
// Replace the bare update + sendCliqNotification block:
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
  return NextResponse.json({ error: "Draft already sent or not found" }, { status: 409 });
}

sendCliqNotification(content, "pm").catch((err) =>
  console.error("[reply/send] Cliq notification failed:", err)
);

return NextResponse.json({ ok: true });
```

---

## Task 7 — Change `.single()` to `.maybeSingle()` after execution trigger

**File:** `src/app/(hub)/orchestration/page.tsx:478–482`
**Severity:** 🟠 Plausible — generic error shown to PM on Supabase replica lag after execution

**Problem:** After `POST /api/execution` returns `executionId`, the client fetches the new execution record with `.single()`. If Supabase read-replica lag means the just-inserted row isn't immediately visible, PostgREST throws a "JSON object requested, multiple (or no) rows returned" error, which surfaces to the PM as a generic failure even though execution succeeded.

**Fix:** Switch to `.maybeSingle()`. The existing `if (exec) onExecuted(...)` guard already handles the `null` case — spinner stops cleanly with no crash or misleading error:

```ts
// Replace .single() with .maybeSingle():
const { data: exec } = await supabase
  .from("execution_records")
  .select("*")
  .eq("id", data.executionId)
  .maybeSingle();
if (exec) onExecuted(exec as ExecutionRecordRow);
```

---

## Execution Order

| # | File | Change |
|---|------|--------|
| 1 | `src/lib/sanity/index.ts` | Pre-state map: index → `_id` key |
| 2 | `src/app/api/execution/[id]/revert/route.ts` | Check `Promise.all` results post-revert |
| 3 | `src/app/api/execution/route.ts` | Log errors on post-execution status updates |
| 4 | `src/app/api/execution/route.ts` | Fix circuit breaker threshold + race |
| 5 | `tsconfig.json` | Add `"node"` to compiler types |
| 6 | `src/app/api/reply/[id]/send/route.ts` | Atomic guard on reply send |
| 7 | `src/app/(hub)/orchestration/page.tsx` | `.single()` → `.maybeSingle()` |

No database migrations required. No new dependencies. No new files.

---

## Success Criteria

- `npx tsc --noEmit` passes with 0 errors
- All 7 bug locations patched as described
- `pnpm build` continues to pass
