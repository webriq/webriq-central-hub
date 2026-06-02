---
id: 037
title: "Code Review Fixes — Security, Performance & Maintenance"
type: patch
priority: HIGH
status: testing
created: 2026-06-02
completed: 2026-06-02
---

> **Status:** TESTING
> **Recommended Model:** haiku
> **Source:** `_docs/status-and-code-review.md` — 9 findings; this task covers the 4 code-only fixes (no schema migrations needed)

## Implementation Notes

All 4 findings fixed. One deviation from plan: `ROUTES.CLASSIFICATION` was also referenced in `src/app/page.tsx` (home page module cards) — that reference was updated to point to `ROUTES.ORCHESTRATION`. The `.next` cache was cleared after deleting the page file to resolve stale type declarations. TypeScript check passes clean.

## Objective

Apply the actionable code-only findings from the automated code review: one security gap, two performance quick-wins, and one dead-code cleanup. No DB migrations required.

## Background

`_docs/status-and-code-review.md` identified 9 findings across security, performance, and maintenance categories. Four can be fixed today without schema changes:

- **F1 (P1 Security):** `/api/classification` accepts unauthenticated POSTs — any caller can trigger classification and fire Cliq notifications.
- **F2 (P2 Performance):** `classify.ts`, `assess.ts`, `plan.ts`, and `digest.ts` all call `getModel()` + `getModelConfig()` in a `Promise.all`. Since `getModel` internally calls `getModelConfig`, a cold cache causes two concurrent reads of the same `llm_config` row.
- **F3 (P2 Performance):** `buildContextChain` fetches classification → customer → assessment sequentially. Customer and assessment fetches are independent once the classification is loaded — they can run in parallel.
- **F4 (P4 Maintenance):** `(hub)/classification/page.tsx` is a 5-line redirect stub to `/pm/tasks`. The `ROUTES.CLASSIFICATION` constant exists but is referenced nowhere in any nav or component.

**Skipped findings (require schema migrations or design decisions):**
- `implementation_plans.classification_id` — column absent from schema/types; would need a migration.
- LLM-failed classification status — needs a new column or status enum value.
- `/api/reply` auth model — intentionally designed as an internal server-to-server route with `x-reply-secret`; acceptable as-is.

## Acceptance Criteria

- [ ] `POST /api/classification` returns `401` when called without a valid session
- [ ] `classify.ts`, `assess.ts`, `plan.ts`, `digest.ts` each call `getModelConfig` once (no `getModel` import)
- [ ] `buildContextChain` runs customer + assessment DB fetches in `Promise.all`
- [ ] `(hub)/classification/page.tsx` deleted; `ROUTES.CLASSIFICATION` removed from `src/config/constants.ts`
- [ ] `npx tsc --noEmit` passes clean

## File Changes

| File | Action | What |
|------|--------|------|
| `src/app/api/classification/route.ts` | Modify | Add session auth guard (same pattern as `/api/assessment`) |
| `src/lib/ai/classify.ts` | Modify | Replace `getModel`+`getModelConfig` double-fetch with single `getModelConfig` call |
| `src/lib/ai/assess.ts` | Modify | Same double-fetch fix |
| `src/lib/ai/plan.ts` | Modify | Same double-fetch fix |
| `src/lib/ai/digest.ts` | Modify | Same double-fetch fix |
| `src/lib/ai/context-chain.ts` | Modify | Parallelize customer + assessment fetches |
| `src/app/(hub)/classification/page.tsx` | Delete | Dead redirect stub |
| `src/config/constants.ts` | Modify | Remove `CLASSIFICATION` from `ROUTES` |

## Code Context

### F1 — `/api/classification/route.ts` (current, no auth)

```typescript
// src/app/api/classification/route.ts — lines 14–33
export async function POST(req: NextRequest) {
  let body: ClassifyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // ... no auth check — any caller can trigger classification
  const record = await classifyTask(body);
  ...
}
```

**Reference pattern** — `/api/assessment/route.ts` lines 11–16:
```typescript
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ...
}
```

---

### F2 — Double-fetch pattern (same in all 4 files)

**classify.ts lines 42–46:**
```typescript
const [model, config] = await Promise.all([
  getModel("classification"),       // internally calls getModelConfig — cache miss race
  getModelConfig("classification"),
]);
modelId = config.model_id;
```

**assess.ts lines 40–44**, **plan.ts lines 69–73**, **digest.ts lines 225–229** — identical pattern with their respective layer strings.

**Fix (same in all 4 files):**
```typescript
// Remove `getModel` from import — only need `getModelConfig`
// Add `getLanguageModel` from "@/lib/ai/providers"
const config = await getModelConfig("classification"); // or "assessment" / "planning" / "digest"
const model = getLanguageModel((config.provider ?? "anthropic") as "anthropic" | "openai", config.model_id);
modelId = config.model_id;
```

`getLanguageModel` is already exported from `src/lib/ai/providers.ts` (line 13).

---

### F3 — `context-chain.ts` sequential fetches (lines 7–62)

```typescript
// CURRENT — 3 sequential awaits; customer and assessment are independent
const classificationResult = await adminClient.from("classification_records")...
const classification = classificationResult.data;
// (uses classification.customer_id)
const customerResult = await adminClient.from("customers")...
// (independent from customerResult)
const assessmentResult = await adminClient.from("requirements_assessments")...
```

**Fix — run customer + assessment in parallel after classification resolves:**
```typescript
const classificationResult = await adminClient
  .from("classification_records")
  .select("*")
  .eq("id", classificationId)
  .maybeSingle();

const classification = classificationResult.data;
if (!classification) {
  return `=== TASK ===\n[Classification record ${classificationId} not found]\n`;
}

const [customerResult, assessmentResult] = await Promise.all([
  adminClient
    .from("customers")
    .select("*, customer_products(*)")
    .eq("customer_id", classification.customer_id)
    .maybeSingle(),
  adminClient
    .from("requirements_assessments")
    .select("overall_status, subtasks, assessment_version")
    .eq("classification_id", classificationId)
    .order("assessment_version", { ascending: false })
    .limit(1)
    .maybeSingle(),
]);
```

Rest of the function (`sections` building) is unchanged.

---

### F4 — Dead route and constant

**`src/app/(hub)/classification/page.tsx`** — entire file (5 lines):
```typescript
import { redirect } from "next/navigation";
export default function ClassificationPage() {
  redirect("/pm/tasks");
}
```

**`src/config/constants.ts` line 6:**
```typescript
export const ROUTES = {
  HOME: "/",
  PM: "/pm",
  DEV: "/dev",
  ONBOARDING: "/onboarding",
  CLASSIFICATION: "/classification",  // ← remove this line
  ORCHESTRATION: "/orchestration",
  KB: "/kb",
} as const;
```

`ROUTES.CLASSIFICATION` is not referenced in any `.tsx` or `.ts` file outside of `constants.ts` itself — confirmed via grep.

## Implementation Steps

1. **`src/app/api/classification/route.ts`** — add auth guard:
   - Add `import { createClient } from "@/lib/supabase/server";` to imports
   - At the top of the `POST` handler (before JSON parsing), add the `supabase.auth.getUser()` check identical to `/api/assessment/route.ts` lines 12–16

2. **`src/lib/ai/classify.ts`** — fix double-fetch:
   - Change import: remove `getModel`, keep `getModelConfig`
   - Add `import { getLanguageModel } from "@/lib/ai/providers";`
   - Replace `Promise.all([getModel(...), getModelConfig(...)])` block with single `getModelConfig` + `getLanguageModel` call (see Code Context above)

3. **`src/lib/ai/assess.ts`** — same fix as step 2, layer string `"assessment"`

4. **`src/lib/ai/plan.ts`** — same fix as step 2, layer string `"planning"`
   - Note: `plan.ts` has a second `Promise.all([getModel, getModelConfig])` block at lines 69–73 (inside the `try` block). Fix that one. The outer `Promise.all` at lines 42–48 (`buildContextChain` + `classificationResult`) is a different pattern and is correct — do not change it.

5. **`src/lib/ai/digest.ts`** — same fix as step 2, layer string `"digest"` (at lines 225–228)

6. **`src/lib/ai/context-chain.ts`** — parallelize fetches:
   - Replace the sequential `customerResult` and `assessmentResult` awaits with a single `Promise.all` (see Code Context above)

7. **Delete `src/app/(hub)/classification/page.tsx`**

8. **`src/config/constants.ts`** — remove the `CLASSIFICATION: "/classification"` line from `ROUTES`

9. Run `npx tsc --noEmit` — must pass clean

## Notes for Implementation Agent

- The auth fix in step 1 must use `createClient()` from `@/lib/supabase/server` (async, uses cookies) — not the browser client or adminClient.
- In the double-fetch fix, `getLanguageModel` expects `(provider, modelId)`. Cast `config.provider` as `"anthropic" | "openai"` using the same pattern already in `model-config.ts` line 37: `(config.provider ?? "anthropic") as "anthropic" | "openai"`.
- `plan.ts` has two `Promise.all` calls. Only the one at ~lines 69–73 (the `getModel`/`getModelConfig` double-fetch inside the `try` block) needs changing. The earlier `Promise.all` at lines 42–48 that runs `buildContextChain` in parallel with a classification query is intentional and correct.
- After deleting the classification page, Next.js will 404 on `/classification` rather than redirect. This is intentional — the route was already broken in UX terms (redirected to tasks). If anything linked to `/classification` it would have been via `ROUTES.CLASSIFICATION`, which grep confirmed is unused outside constants.ts.
- Do not add a new migration or touch any schema files — all fixes are code-only.
