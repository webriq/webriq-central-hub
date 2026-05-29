---
id: 034
title: "Execution Engine — DB Write Error Visibility + Circuit Breaker Threshold"
type: patch
priority: HIGH
status: testing
created: 2026-05-29
completed: 2026-05-29
---

> **Status:** TESTING
> **Implementation Notes:** All changes in `src/app/api/execution/route.ts` only. Bugs 1 and 2 (sanity/index.ts, revert/route.ts) were already fixed in the working tree — no changes made to those files. TypeScript check passes clean.

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-29

### What was built
Both execution paths (GitHub and Sanity) now surface DB write failures that were previously silent:
- If `execution_records.update(COMPLETED)` fails, the error throws into the existing `catch` block, which marks the record `FAILED` and fires the circuit breaker — no more permanent `RUNNING` limbo
- If secondary updates (`implementation_plans → COMPLETE`, `classification_records → closed`) fail, the success response now includes a `warnings` array so the orchestration UI can surface the partial failure to the PM
- Circuit breaker now fires on the very first failure for new customers (`>= 1` instead of requiring 3 prior records)

### How to access for testing
- **API:** `POST /api/execution` (from the orchestration UI, approve a plan and click Execute)
- **Circuit breaker:** Trigger 1 execution failure on a customer with no prior executions — `customers.automation_paused` should be `true` after
- **Warnings path:** Requires a Supabase constraint violation or RLS error on `implementation_plans` or `classification_records` to reproduce naturally; otherwise testable via mocking

### Deviations from plan
- Variable names `completedErrGh`/`completedErrSanity` and `ghWarnings`/`sanityWarnings` (task doc showed `completedErr`/`warnings`). Minor style deviation — each is in its own function scope; no ambiguity or conflict.

### Standards check
Pass — no `console.log`, no `any` types, `throw` correctly routes to existing `catch`, object spread of `false` evaluates to `{}` (valid JS/TS pattern).

### Convention check
Pass — `adminClient` used for server-side mutations only, `console.error` on error paths, no RLS bypass for reads.

> **Recommended Model:** haiku
> **Sprint:** Sprint 5 exit — AC3 blocker

## Objective

Fix two remaining confirmed bugs in the execution engine that block Sprint 5 from exiting Testing and AC3 sign-off. Bugs 1 and 2 from `_docs/STATUS-REPORT.md` are already addressed in the working tree; this task covers Bugs 3 and 4.

## Background

`_docs/STATUS-REPORT.md` (generated 2026-05-27) catalogued 7 bugs against the execution engine. The working tree already contains fixes for:

- **Bug 1** — `src/lib/sanity/index.ts`: `pre_action_states` now indexed by `doc._id` not position — correct.
- **Bug 2** — `src/app/api/execution/[id]/revert/route.ts`: Properly returns 500 if DB status update fails after Sanity/GitHub revert — correct.

The two remaining open bugs are:

**Bug 3** — `src/app/api/execution/route.ts`: Two issues in the success path of both `executeGitHub` and `executeSanity`:
1. `execution_records.update({ status: "COMPLETED" })` is `await`-ed but its error is never checked. If the write fails, the record stays at `"RUNNING"` indefinitely with no alert.
2. `Promise.all([plan update, classification update])` errors are logged via `console.error` but the route still returns `{ ok: true }`. The PM receives a false success signal with no way to know secondary state updates failed.

**Bug 4** — `src/app/api/execution/route.ts` (`applyCircuitBreaker`): The guard `last3.length >= 3` means a customer who has had 0 or 1 prior executions can never trip the circuit breaker, even if every execution for that customer has failed.

## Acceptance Criteria

- [ ] If `execution_records.update(COMPLETED)` fails, execution falls into the `catch` block (sets status `FAILED`) rather than continuing silently
- [ ] Success response includes a `warnings` array when `planUpdate.error` or `classUpdate.error` — route still returns 200 (content was applied; these are secondary state updates)
- [ ] Circuit breaker fires when `last3.length >= 1` and all entries are `"FAILED"` (handles new customers with 1 or 2 total executions)
- [ ] Both `executeGitHub` and `executeSanity` paths fixed identically
- [ ] `npx tsc --noEmit` passes clean

## File Changes

| File | Action | What |
|------|--------|------|
| `src/app/api/execution/route.ts` | Modify | Fix both execution paths (Bug 3) + circuit breaker (Bug 4) |

## Code Context

### Bug 3a — `execution_records.update(COMPLETED)` unchecked

**GitHub path (lines 136–148):**

```typescript
// CURRENT — error not checked, silent failure leaves record at "RUNNING":
await adminClient
  .from("execution_records")
  .update({
    status: "COMPLETED",
    outcome: "SUCCESS",
    pre_action_states: result.pre_action_states as unknown as Json,
    post_action_states: result.post_action_states as unknown as Json,
    what_was_done: result.what_was_done,
    what_was_skipped: result.what_was_skipped,
    github_pr_url: result.github_pr_url,
    completed_at: new Date().toISOString(),
  })
  .eq("id", execution.id);
```

**Sanity path (lines 242–253) — same pattern, no `github_pr_url`.**

**Fix for both:** Destructure `{ error: completedErr }` and throw so the existing `catch` block handles it:

```typescript
const { error: completedErr } = await adminClient
  .from("execution_records")
  .update({ status: "COMPLETED", ... })
  .eq("id", execution.id);
if (completedErr) {
  throw new Error(`Failed to mark execution COMPLETED: ${completedErr.message}`);
}
```

Throwing routes into the existing `catch` block which sets status → `FAILED` — no new code path needed.

### Bug 3b — Promise.all errors swallowed, response always `{ ok: true }`

**GitHub path (lines 150–181):**

```typescript
// CURRENT — errors logged, success returned regardless:
const [planUpdate, classUpdate] = await Promise.all([
  adminClient.from("implementation_plans").update({ status: "COMPLETE" }).eq("id", planId),
  adminClient.from("classification_records").update({ status: "closed" }).eq("id", classificationId),
]);
if (planUpdate.error) {
  console.error("[execution/github] plan update failed", { planId }, planUpdate.error);
}
if (classUpdate.error) {
  console.error("[execution/github] classification update failed", { classificationId }, classUpdate.error);
}
// ... Cliq + reply draft ...
return NextResponse.json({ ok: true, executionId: execution.id, prUrl: result.github_pr_url });
```

**Sanity path (lines 255–283) — same pattern, no `prUrl` in return.**

**Fix for both:** Add `warnings` to the response when secondary DB updates fail:

```typescript
const warnings = [
  ...(planUpdate.error ? ["plan status not updated"] : []),
  ...(classUpdate.error ? ["classification status not updated"] : []),
];
// GitHub return:
return NextResponse.json({
  ok: true,
  executionId: execution.id,
  prUrl: result.github_pr_url,
  ...(warnings.length > 0 && { warnings }),
});
// Sanity return (no prUrl):
return NextResponse.json({
  ok: true,
  executionId: execution.id,
  ...(warnings.length > 0 && { warnings }),
});
```

### Bug 4 — Circuit breaker threshold (lines 318–320)

```typescript
// CURRENT — never fires for customers with < 2 prior executions:
const last3 = ["FAILED", ...(recent?.map((e) => e.status) ?? [])];
if (last3.length >= 3 && last3.every((s) => s === "FAILED")) {

// FIX — fires on any consecutive all-FAILED run (1, 2, or 3+ records):
const last3 = ["FAILED", ...(recent?.map((e) => e.status) ?? [])];
if (last3.length >= 1 && last3.every((s) => s === "FAILED")) {
```

## Implementation Steps

1. **`executeGitHub` — Bug 3a (lines 136–148):** Destructure `{ error: completedErr }` from the `execution_records.update(COMPLETED)` call; throw if `completedErr` is truthy
2. **`executeGitHub` — Bug 3b (line 181):** Build `warnings` array from `planUpdate.error` and `classUpdate.error`; spread into the `NextResponse.json()` return
3. **`executeSanity` — Bug 3a (lines 242–253):** Same as step 1
4. **`executeSanity` — Bug 3b (line 283):** Same as step 2 (omit `prUrl`)
5. **`applyCircuitBreaker` — Bug 4 (line 320):** Change `>= 3` → `>= 1`
6. Run `npx tsc --noEmit` — must pass clean

## Notes for Implementation Agent

- This is a companion fix to tasks [027] (Execution Engine) and [031] (GitHub PR Mode) — both in Testing. These fixes unblock them from exiting Testing.
- The `execution_records.update(COMPLETED)` must **throw** (not `return NextResponse`) so the existing `catch` block handles the failure path uniformly. Do not add a new return branch inside the success block.
- The `warnings` field in the response is intentionally non-breaking (spread-if-nonempty). The orchestration UI (`src/app/(hub)/orchestration/page.tsx`) does not require changes — `warnings` is informational for future debugging.
- Bug 4 threshold `>= 1` is intentional: a brand-new customer whose first execution fails should have automation paused immediately rather than requiring 3 failures to accumulate.
- Do **not** modify `src/lib/sanity/index.ts` or `src/app/api/execution/[id]/revert/route.ts` — Bugs 1 and 2 are already correctly fixed in those files.
