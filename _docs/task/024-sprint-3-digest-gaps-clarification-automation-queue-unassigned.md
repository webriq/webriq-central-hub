# 024: Sprint 3 Digest Gaps — Clarification Flag, Automation Queue, Unassigned Tasks

**Created:** 2026-05-26
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-05-26

> **Recommended Model:** sonnet — coordinated changes across 3 layers (AI schema + queries + prompts in `digest.ts`, DigestCard UI in `home-tab.tsx`, live query in `pm/page.tsx`). Each change must be consistent with the others; a mistake in one layer silently breaks the render.

---

## Overview

Sprint 3 SCRUM tracker items #6, #13, and #17 were identified as partial/missing after a full status review.

| SCRUM # | Task | Current State |
|---------|------|---------------|
| 6 | CLARIFICATION_NEEDED flag surfaced in digest UI | DigestCard shows AI summary but no indicator for assessments awaiting clarification |
| 13 | PM Digest: automation queue section | DigestSchema has no `automation_queue_count`; prompt doesn't mention it |
| 17 | Dev Digest: team unassigned tasks | DigestSchema has no `unassigned_count`; dev branch has no query for tasks with no assessment yet |

All three are additive — no DB migrations required, no breaking changes. The digest content JSONB column is schema-less (free `Json` type) so adding new fields to `DigestSchema` is backwards-compatible.

---

## Implementation Steps

### Step 1 — Extend DigestSchema in `digest.ts`

**File:** `src/lib/ai/digest.ts`

Add two new fields to `DigestSchema`:

```ts
const DigestSchema = z.object({
  summary: z.string(),
  attention_items: z.array(AttentionItemSchema).max(5),
  stalled_items: z.array(z.string()).max(3),
  ready_to_close: z.number().int().min(0),
  highlights: z.string(),
  // NEW:
  automation_queue_count: z.number().int().min(0),  // PM only; 0 for dev
  unassigned_count: z.number().int().min(0),         // Dev only; 0 for pm
});
```

Both fields are present in both digest types (to satisfy the single schema) but semantically used only in the relevant type. Set the other to `0` in context and prompt.

---

### Step 2 — PM branch: add automation queue query

**File:** `src/lib/ai/digest.ts` — `generateDigest("pm")` branch

Add a 5th parallel query for LLM-eligible pending count:

```ts
const [
  activeCustomersResult,
  completedOnboardingResult,
  pendingClassificationsResult,
  attentionItemsResult,
  automationQueueResult,          // NEW
] = await Promise.all([
  // ... existing 4 queries unchanged ...
  adminClient
    .from("classification_records")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("llm_eligible", "YES"),
]);

const automationQueueCount = automationQueueResult.count ?? 0;
```

Add to `context` string (after the existing sections):
```
Automation Queue (LLM-eligible tasks awaiting assessment): ${automationQueueCount}
```

Add to `fallbackAttentionItems` fallback block: `automation_queue_count: automationQueueCount`.

Update PM prompt `Guidelines` to include:
```
- automation_queue_count: count of LLM-eligible tasks currently sitting in the automated assessment queue
```

---

### Step 3 — Dev branch: add unassigned tasks query

**File:** `src/lib/ai/digest.ts` — `generateDigest("dev")` branch

"Unassigned" = LLM-eligible pending classification records with no corresponding `requirements_assessments` row yet. No `assigned_to` column exists in the schema — this is the correct proxy.

Add two queries, resolve in JS (Supabase client has no LEFT JOIN):

```ts
const [
  clearAssessmentsResult,
  blockedAssessmentsResult,
  oldestPendingResult,
  recentClearedResult,
  allLLMEligibleResult,           // NEW
  allAssessedIdsResult,           // NEW
] = await Promise.all([
  // ... existing 4 queries unchanged ...
  adminClient
    .from("classification_records")
    .select("id")
    .eq("status", "pending")
    .eq("llm_eligible", "YES"),
  adminClient
    .from("requirements_assessments")
    .select("classification_id"),
]);

const assessedIds = new Set(
  (allAssessedIdsResult.data ?? []).map(a => a.classification_id)
);
const unassignedCount = (allLLMEligibleResult.data ?? [])
  .filter(r => !assessedIds.has(r.id)).length;
```

Add to `context` string:
```
Unassigned (LLM-eligible, no assessment started): ${unassignedCount} tasks
```

Update Dev prompt `Guidelines` to include:
```
- unassigned_count: count of LLM-eligible tasks no developer has started an assessment on yet
```

Set `automation_queue_count: 0` in the dev digest insert fallback and prompt guidance.

---

### Step 4 — Update DigestContent type in `home-tab.tsx`

**File:** `src/components/hub/pm-tabs/home-tab.tsx`

Extend the inline `DigestContent` type:

```ts
type DigestContent = {
  summary: string;
  attention_items: Array<{ title: string; customer_id: string; priority: string }>;
  stalled_items: string[];
  ready_to_close: number;
  highlights: string;
  automation_queue_count?: number;  // NEW
  unassigned_count?: number;        // NEW
};
```

---

### Step 5 — Add `clarificationNeededCount` prop to DigestCard and HomeTab

**File:** `src/components/hub/pm-tabs/home-tab.tsx`

Add to `DigestCardProps`:
```ts
interface DigestCardProps {
  attentionCount: number;
  activeCount: number;
  onboardingCount: number;
  digest?: DigestLogRow | null;
  onFeedback?: (id: string, feedback: "useful" | "partial" | "not_useful") => void;
  clarificationNeededCount?: number;  // NEW — live query, not from digest content
}
```

Add to `HomeTabProps`:
```ts
clarificationNeededCount?: number;  // NEW
```

Pass through in `HomeTab` body where `DigestCard` is rendered (both instances):
```tsx
<DigestCard
  attentionCount={attention.length}
  activeCount={activeCount}
  onboardingCount={onboardingCount}
  digest={digest}
  onFeedback={onFeedback}
  clarificationNeededCount={clarificationNeededCount}   // NEW
/>
```

---

### Step 6 — Render all three new signals in DigestCard

**File:** `src/components/hub/pm-tabs/home-tab.tsx` — `DigestCard` component

After the `highlights` paragraph and before the action buttons, add a compact info row:

```tsx
{/* Inline signal pills */}
{(clarificationNeededCount || content?.automation_queue_count || content?.unassigned_count) && (
  <div className="flex gap-2 flex-wrap mb-[12px]">
    {clarificationNeededCount ? (
      <span className="text-[11px] font-semibold text-[#a16207] bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.2)] rounded-lg px-3 py-1">
        {clarificationNeededCount} need clarification
      </span>
    ) : null}
    {content?.automation_queue_count ? (
      <span className="text-[11px] font-semibold text-[var(--c-sky)] bg-[var(--c-sky-tint)] border border-[var(--c-sky-border3)] rounded-lg px-3 py-1">
        {content.automation_queue_count} in automation queue
      </span>
    ) : null}
    {content?.unassigned_count ? (
      <span className="text-[11px] font-semibold text-[var(--c-violet)] bg-[rgba(99,102,241,0.07)] border border-[rgba(99,102,241,0.18)] rounded-lg px-3 py-1">
        {content.unassigned_count} unassigned
      </span>
    ) : null}
  </div>
)}
```

Place this block between the `highlights` paragraph (line ~117) and the action buttons `<div className="flex gap-2 flex-wrap">`.

---

### Step 7 — Query clarification count in `pm/page.tsx`

**File:** `src/app/(hub)/pm/page.tsx`

Add state and query alongside the existing digest fetch (the `useEffect` at line 110):

```ts
const [clarificationNeededCount, setClarificationNeededCount] = useState(0);
```

Add a parallel query inside the same `useEffect` (or a separate one):

```ts
supabase
  .from("requirements_assessments")
  .select("*", { count: "exact", head: true })
  .in("overall_status", ["PARTIAL", "BLOCKED"])
  .then(({ count }) => {
    if (!cancelled) setClarificationNeededCount(count ?? 0);
  });
```

Pass down through `HomeTab`:
```tsx
<HomeTab
  ...
  clarificationNeededCount={clarificationNeededCount}
/>
```

---

## File Changes

| File | Change |
|------|--------|
| `src/lib/ai/digest.ts` | Extend `DigestSchema` with `automation_queue_count` + `unassigned_count`; add PM automation queue query; add Dev unassigned count (two-query + JS set subtraction); update both prompts |
| `src/components/hub/pm-tabs/home-tab.tsx` | Extend `DigestContent` type; add `clarificationNeededCount` to `DigestCardProps` + `HomeTabProps`; render signal pills in `DigestCard` |
| `src/app/(hub)/pm/page.tsx` | Add `clarificationNeededCount` state; add `requirements_assessments` count query; pass to `HomeTab` |

No DB migrations. No new routes. No new components.

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-26

### What was built

Three Sprint 3 digest gaps are now filled:
- **Clarification flag:** PM home page queries `requirements_assessments` for PARTIAL/BLOCKED count on load; an amber pill "X need clarification" appears in DigestCard when non-zero.
- **Automation queue:** PM digest compiles `automation_queue_count` (LLM-eligible pending classification records) into the stored digest content and shows it as a sky pill.
- **Unassigned tasks:** Dev digest computes `unassigned_count` via two parallel queries + JS Set subtraction (LLM-eligible records with no assessment row yet) and shows it as a violet pill.

### How to access for testing

- URL: `/pm` (PM home page)
- Trigger dev-mode digest: click "Trigger Digest (dev)" button on the PM home page
- Pills appear in the AI Daily Digest card when values are non-zero
- Clarification count reflects live DB state (not the compiled digest)

### Deviations from plan

None — implementation matches the task document exactly. One minor cleanup applied during review: `content!.automation_queue_count` and `content!.unassigned_count` (non-null assertions) replaced with `content?.automation_queue_count` / `content?.unassigned_count` (optional chaining) — safer and sufficient since the outer ternary guard guarantees the condition is already true.

### Standards check

Pass — TypeScript clean (`npx tsc --noEmit`), no `any` types, no unused variables, no `console.log` in new code, proper guard clauses, ternary conditionals in JSX (per vercel-react-best-practices `rendering-conditional-render`).

### Convention check

Pass:
- `adminClient` used in server-side `digest.ts` only — not imported in any client component ✓
- `createClient()` from `@/lib/supabase/client` used in `pm/page.tsx` (browser) ✓
- `logLLMInvocation()` called for every LLM invocation in `digest.ts` ✓
- Model config DB-driven via `getModel("digest")` — no hard-coded model IDs ✓
- `async-parallel` rule: all independent queries run in `Promise.all()` ✓
- Hoisted `automationQueueCount` / `unassignedCount` before the if/else block so they're available at the insert fallback — avoids block-scoping bug ✓

---

## Code Context

### DigestSchema (current) — `src/lib/ai/digest.ts:19-25`
```ts
const DigestSchema = z.object({
  summary: z.string(),
  attention_items: z.array(AttentionItemSchema).max(5),
  stalled_items: z.array(z.string()).max(3),
  ready_to_close: z.number().int().min(0),
  highlights: z.string(),
});
```

### DigestCard (current) — `src/components/hub/pm-tabs/home-tab.tsx:81-155`

Key render flow in `DigestCard`:
1. `summaryText` from `content.summary` or fallback (line 86-88)
2. `{content?.highlights}` paragraph (line 115-117)
3. Action buttons row: "View Full Digest" + feedback trio (lines 119-154)

The signal pills slot in between highlights and the button row (after line 117).

### HomeTabProps (current) — `src/components/hub/pm-tabs/home-tab.tsx:184-193`
```ts
interface HomeTabProps {
  customers: CustomerWithProducts[];
  settings: PMSettings;
  displayName?: string | null;
  pendingReviewCount?: number;
  classificationAttentionItems?: ClassificationAttentionItem[];
  openTasksCount?: number;
  inPipelineCount?: number;
  digest?: DigestLogRow | null;
  onFeedback?: (id: string, feedback: "useful" | "partial" | "not_useful") => void;
}
```

### PM Page digest useEffect (current) — `src/app/(hub)/pm/page.tsx:110-126`
```ts
useEffect(() => {
  const supabase = createClient();
  let cancelled = false;
  const today = new Date().toISOString().split("T")[0];
  supabase
    .from("digest_logs")
    .select("*")
    .eq("digest_type", "pm")
    .eq("digest_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(({ data }) => {
      if (!cancelled) setLatestDigest(data ?? null);
    });
  return () => { cancelled = true; };
}, []);
```

Add the `requirements_assessments` count query here alongside the digest fetch (both fire in the same effect, both guarded by `cancelled`).

---

## Notes for Implementation Agent

- **`automation_queue_count` vs `unassigned_count` are type-specific:** The PM digest sets `unassigned_count: 0`; the dev digest sets `automation_queue_count: 0`. Both fields must appear in `DigestSchema` (single schema for both types). Prompts should only reference the relevant field for their type.
- **Clarification count is a live query, not stored in the digest:** `clarificationNeededCount` comes from `pm/page.tsx` directly querying `requirements_assessments` — it reflects current state, not yesterday's compiled digest. This is intentional so the flag stays fresh even if the digest is stale.
- **Unassigned = no assessment started, not a DB column:** There is no `assigned_to` on `classification_records`. The correct proxy is LLM-eligible pending records with no row in `requirements_assessments`. Use the two-query + JS set subtraction pattern from Step 3.
- **DigestContent type is inline in `home-tab.tsx`** (line 65-71), not imported from `@/types`. Extend it there.
- **Signal pills use existing CSS custom property vars** (`--c-sky`, `--c-violet`) that are already set on the parent `div` in `HomeTab`. No new color variables needed.
- **`fallbackAttentionItems` block** in `digest.ts` needs the new fields added too (`automation_queue_count` for PM, `unassigned_count` for dev) so the fallback object still satisfies the schema shape stored in `digest_logs.content`.
