# Task 059 — Fix Execution Engine 500 Error (Sanity Path)

> **Type:** patch
> **Priority:** HIGH
> **Recommended Model:** haiku
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Completed:** 2026-06-09
> **Implementation Notes:** Fix 3 (maxTokens/temperature passthrough) was not applied — `generateObject` in ai@6.0.168 does not accept those params in its type signature. Fix 1 (empty array guard) and Fix 2 (circuit breaker threshold 1→3) are implemented. Verify `automation_paused` is `false` on the test customer before triggering execution.

---

## Problem

Clicking "Execute Plan" on a Sanity-type task throws a 500. The terminal shows:

```
POST /api/execution 500 in 20.0s
```

The UI shows:

```
GET-request to https://6a50e3ch.api.sanity.io/v2024-01-01/data/doc/production
resulted in HTTP 404 Not Found
```

---

## Root Causes (3, in order of priority)

### 1. `client.getDocuments([])` called with empty array → Sanity 404 (PRIMARY)

**File:** `src/lib/sanity/index.ts:90-91`

When the LLM returns zero mutations (or mutations with no document IDs), `allDocIds` is an empty array. The `@sanity/client` `getDocuments([])` call makes a request to `/data/doc/production` with no `ids` query parameter. Sanity's API returns 404 for this path without IDs.

**Fix:** Guard the `getDocuments` call — skip it when `allDocIds` is empty.

### 2. Circuit breaker fires on the first failure, not after 3 (SECONDARY)

**File:** `src/app/api/execution/route.ts:343`

`applyCircuitBreaker` builds `last3 = ["FAILED", ...last2Recent]`. The condition `last3.length >= 1 && last3.every(s => s === "FAILED")` is true even when `last3 = ["FAILED"]` (only 1 element). This means a single execution failure sets `automation_paused = true`, silently blocking all future executions with 409.

**Fix:** Change `last3.length >= 1` to `last3.length >= 3`.

### 3. `maxTokens`/`temperature` from `llm_config` not passed to `generateObject` (TERTIARY)

**File:** `src/lib/sanity/index.ts:64-78`

`getModelConfig("execution")` is called and the config is fetched, but only `model` is passed to `generateObject`. For execution tasks that produce large Sanity mutation sets, hitting the SDK's default `max_tokens` ceiling causes a parse error → 500.

**Fix:** Pass `maxTokens: config.max_tokens` and `temperature: config.temperature` to the `generateObject` call.

---

## File Changes

| File | Change |
|------|--------|
| `src/lib/sanity/index.ts` | Guard `getDocuments([])` call; pass `maxTokens`/`temperature` to `generateObject` |
| `src/app/api/execution/route.ts` | Fix circuit breaker threshold from `>= 1` to `>= 3` |

---

## Code Context

### `executeSanityPlan` — current `generateObject` call (sanity/index.ts:64-78)

```typescript
const startMs = Date.now();
const { object: plan, usage } = await generateObject({
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
```

→ After fix, add `maxTokens: config.max_tokens ?? undefined` and `temperature: config.temperature ?? undefined`.

### `executeSanityPlan` — current `getDocuments` call (sanity/index.ts:90-94)

```typescript
const allDocIds = [...new Set(plan.mutations.map((m) => m.documentId))];
const preDocs = await client.getDocuments(allDocIds);
preDocs.forEach((doc) => {
  if (doc?._id) pre_action_states[doc._id] = doc;
});
```

→ After fix:

```typescript
const allDocIds = [...new Set(plan.mutations.map((m) => m.documentId))];
if (allDocIds.length > 0) {
  const preDocs = await client.getDocuments(allDocIds);
  preDocs.forEach((doc) => {
    if (doc?._id) pre_action_states[doc._id] = doc;
  });
}
```

### `applyCircuitBreaker` — current condition (route.ts:342-343)

```typescript
const last3 = ["FAILED", ...(recent?.map((e) => e.status) ?? [])];
if (last3.length >= 1 && last3.every((s) => s === "FAILED")) {
```

→ After fix: change `>= 1` to `>= 3`.

---

## Implementation Steps

1. **`src/lib/sanity/index.ts`**
   - In `executeSanityPlan`, add `if (allDocIds.length > 0)` guard around the `getDocuments` call and the `preDocs.forEach` block (lines 91-97). The `pre_action_states` object is already initialized as `{}` above, so it stays empty when there are no mutations — that is correct behavior.
   - On the `generateObject` call (line 64), add `maxTokens: config.max_tokens ?? undefined` and `temperature: config.temperature ?? undefined` to the options object. `config` is already in scope from the `Promise.all` above.

2. **`src/app/api/execution/route.ts`**
   - In `applyCircuitBreaker` (line 343), change `last3.length >= 1` to `last3.length >= 3`.

---

## Notes for Implementation Agent

- **Sonnet rationale:** N/A — haiku is appropriate; all three changes are targeted one-liners with no design decisions.
- **Why the empty-array guard is the primary fix:** The `@sanity/client` `getDocuments` method with an empty array generates a request to `/data/doc/{dataset}` with no `ids` param, which Sanity returns 404 for. This is the direct cause of the 500 shown in the screenshot.
- **Circuit breaker check:** Before testing, verify whether `automation_paused` is already `true` for the affected customer in the DB. If so, it must be manually reset to `false` before the fix can be observed working.
- **`config.max_tokens` type:** `getModelConfig` returns the `llm_config` row; `max_tokens` is an integer column. Pass it as `maxTokens` (camelCase) to the AI SDK `generateObject` options. Use `?? undefined` to avoid passing `null` if the column is unset.
- **Do not change** `revertSanityExecution` — it is separate and unaffected.
- Do not add a guard for empty `plan.mutations` before the `tx.commit()` — that check already exists at line 101 (`if (contentMutations.length > 0)`).
