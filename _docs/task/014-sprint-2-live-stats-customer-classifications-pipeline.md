# 014: Sprint 2 — Live Stats, Customer Profile Classifications & Pipeline Classify Column

**Created:** 2026-05-18
**Completed:** 2026-05-18
**Priority:** HIGH
**Type:** feature
**Recommended Model:** haiku
**Status:** TESTING

---

## Overview

Three remaining Sprint 2 UI wire-ups — all read from `classification_records`, no new API routes needed:

1. **Home tab live counts** — replace hardcoded `"8"` (Open Tasks) and `"3"` (In Pipeline) stat cards with real counts from `classification_records`; wire pipeline mini-bar Classify count to live data.
2. **Customer Profile classifications** — replace the "Recent Activity" stub section with a real table of that customer's `classification_records`.
3. **Pipeline tab live Classify column** — wire the Classify kanban column to live `classification_records`; keep Assess / Plan / Execute / Reply as Sprint 3+ stubs (0 items).

---

## Requirements

- [ ] Home tab "Open Tasks" stat card shows count of `classification_records` where `status != 'rejected'`
- [ ] Home tab "In Pipeline" stat card shows count where `llm_eligible = 'YES'` and `status = 'pending'`
- [ ] Pipeline mini-bar "Classify" row reflects the live `pending` count; Assess/Plan/Execute/Reply rows show `0`
- [ ] Customer Profile "Recent Activity" stub is replaced with a "Classifications" section listing that customer's records (title, task_type, priority, confidence_score, status, age)
- [ ] Customer Profile classifications fetched via browser Supabase client inside a `useEffect`; no new API route
- [ ] Pipeline tab Classify column shows live `classification_records` with `status = 'pending'`, ordered by `created_at desc`, limit 20
- [ ] Pipeline tab Assess / Plan / Execute / Reply columns show 0 items and a "Sprint 3+" note — no mock data remains
- [ ] No `style={{}}` attributes on new elements; new elements use Tailwind utility classes only

---

## Out of Scope

- No changes to `tasks-tab.tsx`, `home-tab.tsx` greeting/digest sections, or `clients-tab.tsx`
- No new API routes — all reads use browser Supabase client (`@/lib/supabase/client`)
- Do not add realtime subscriptions to the pipeline page or customer profile — static fetch on mount is sufficient for Sprint 2
- Do not touch `syncTaskToZoho` in `src/lib/zoho/index.ts`

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/pm/page.tsx` | Modify | Extend `fetchClassificationData` to also fetch `openTasksCount` and `inPipelineCount`; pass as new props to `HomeTab` |
| `src/components/hub/pm-tabs/home-tab.tsx` | Modify | Add `openTasksCount` and `inPipelineCount` props; replace hardcoded `"8"` and `"3"`; set Classify pipeline bar to live count, others to 0 |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | Add `useEffect` + `useState` to fetch customer's `classification_records`; replace "Recent Activity" stub with Classifications section |
| `src/app/(hub)/pm/pipeline/page.tsx` | Modify | Fetch pending `classification_records` (limit 20); pass `classifyItems` + `classifyCount` props to `PipelineTab` |
| `src/components/hub/pm-tabs/pipeline-tab.tsx` | Modify | Accept `classifyItems` + `classifyCount` props; replace hardcoded Classify stage items; set other stage items to `[]` with Sprint 3+ note |

---

## Code Context

### `src/app/(hub)/pm/page.tsx` — existing `fetchClassificationData` (lines 48–73)

```ts
async function fetchClassificationData() {
  const [countResult, itemsResult] = await Promise.all([
    supabase
      .from("classification_records")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("classification_records")
      .select("id, title, customer_id, priority, created_at")
      .eq("status", "pending")
      .in("priority", ["CRITICAL", "HIGH"])
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  if (!cancelled) {
    setPendingReviewCount(countResult.count ?? 0);
    setClassificationAttentionItems(
      (itemsResult.data ?? []) as ClassificationAttentionItem[]
    );
  }
}
```

**Extend this** — add two more parallel queries:
```ts
supabase
  .from("classification_records")
  .select("*", { count: "exact", head: true })
  .neq("status", "rejected"),   // openTasksCount

supabase
  .from("classification_records")
  .select("*", { count: "exact", head: true })
  .eq("llm_eligible", "YES")
  .eq("status", "pending"),     // inPipelineCount
```

Then add state + props:
```ts
const [openTasksCount, setOpenTasksCount] = useState(0);
const [inPipelineCount, setInPipelineCount] = useState(0);
```

Pass to `HomeTab`:
```tsx
<HomeTab
  ...
  openTasksCount={openTasksCount}
  inPipelineCount={inPipelineCount}
/>
```

### `src/components/hub/pm-tabs/home-tab.tsx` — hardcoded stats (lines 169–174)

```ts
const stats = [
  { v: String(activeCount), l: "Active Clients", c: C.sky },
  { v: "8", l: "Open Tasks", c: C.orange },        // ← replace "8"
  { v: "3", l: "In Pipeline", c: C.violet },        // ← replace "3"
  { v: String(pendingReviewCount), l: "Pending Review", c: C.amber },
];
```

Add to `HomeTabProps`:
```ts
openTasksCount?: number;
inPipelineCount?: number;
```

Default both to `0` in the destructure. Replace in stats array:
```ts
{ v: String(openTasksCount), l: "Open Tasks", c: C.orange },
{ v: String(inPipelineCount), l: "In Pipeline", c: C.violet },
```

### `src/components/hub/pm-tabs/home-tab.tsx` — pipeline mini-bar (lines 194–200)

```ts
const pipeline = [
  { l: "Classify", n: 5, ck: "violet" },   // ← replace 5 with classifyCount prop
  { l: "Assess",   n: 3, ck: "sky" },      // ← 0
  { l: "Plan",     n: 2, ck: "blue" },     // ← 0
  { l: "Execute",  n: 1, ck: "orange" },   // ← 0
  { l: "Reply",    n: 2, ck: "green" },    // ← 0
];
```

Use `pendingReviewCount` (already a prop) as the Classify count — it represents all pending classification records, which is exactly what is in the Classify stage.

### `src/app/(hub)/customers/[customerId]/client.tsx` — "Recent Activity" stub (lines 389–396)

```tsx
{/* Recent Activity (Stub) */}
<div className={sectionCls}>
  <div className={sectionTitleCls}>Recent Activity</div>
  <div className="text-[13px] text-slate-400 text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
    Activity will appear here once classification is active (Sprint 2)
  </div>
</div>
```

Replace with a Classifications section. The component is a Client Component — add `useEffect` + `useState`:

```ts
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"];

// inside the component:
const [classifications, setClassifications] = useState<ClassificationRow[]>([]);

useEffect(() => {
  const supabase = createClient();
  supabase
    .from("classification_records")
    .select("id, title, task_type, priority, confidence_score, status, created_at")
    .eq("customer_id", customer.customer_id)
    .order("created_at", { ascending: false })
    .limit(10)
    .then(({ data }) => { if (data) setClassifications(data as ClassificationRow[]); });
}, [customer.customer_id]);
```

Display as a compact table (same `sectionCls` pattern as existing sections). Columns: Title, Type, Priority, Confidence, Status, Age.

### `src/app/(hub)/pm/pipeline/page.tsx` — current stub

```tsx
"use client";
import React from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { getTokens } from "@/components/hub/pm-tabs/shared";
import PipelineTab from "@/components/hub/pm-tabs/pipeline-tab";

export default function PMPipelinePage() {
  const { settings } = usePMSettings();
  const C = getTokens(settings);
  return (
    <div className="flex-1 overflow-y-auto py-[26px] px-8 bg-[var(--c-page-bg)]"
      style={{ "--c-page-bg": C.bg } as React.CSSProperties}>
      <PipelineTab settings={settings} />
    </div>
  );
}
```

Add a `useEffect` to fetch pending `classification_records` (with `customers(company_name)` join), pass `classifyItems` and `classifyCount` to `PipelineTab`.

### `src/components/hub/pm-tabs/pipeline-tab.tsx` — current Classify stage items (lines 32–52)

```ts
const stages = [
  { k: "classify", l: "Classify", color: C.violet, items: [
    { id: "T-0092", title: "New support ticket from Acme Corp", customer: "Acme Corp", t: "10m" },
    { id: "T-0091", title: "Staging config request", customer: "Bright Labs", t: "1h" },
  ]},
  { k: "assess", l: "Assess", color: C.sky, items: [
    { id: "T-0090", title: "Blog publishing broken on StackShift", customer: "Acme Corp", status: "CLEAR" },
    // ...
  ]},
  // ...
];
```

Accept new props:
```ts
interface Props {
  settings: PMSettings;
  classifyItems?: { id: string; title: string; customer: string; t: string }[];
  classifyCount?: number;
}
```

Replace hardcoded Classify items with `classifyItems ?? []`. Set all other stage items to `[]`. Add a note in the empty stage cards: "Sprint 3+" placeholder text.

---

## Implementation Steps

### Step 1 — Home tab live counts

1. In `src/app/(hub)/pm/page.tsx`:
   - Add `const [openTasksCount, setOpenTasksCount] = useState(0);` and `const [inPipelineCount, setInPipelineCount] = useState(0);`
   - Inside `fetchClassificationData`, add two more parallel queries (see Code Context above)
   - Set state: `setOpenTasksCount(openResult.count ?? 0)` and `setInPipelineCount(pipelineResult.count ?? 0)`
   - Pass both as props to `HomeTab`

2. In `src/components/hub/pm-tabs/home-tab.tsx`:
   - Add `openTasksCount?: number` and `inPipelineCount?: number` to `HomeTabProps`
   - Default both to `0` in the function signature
   - Replace `"8"` → `String(openTasksCount)` and `"3"` → `String(inPipelineCount)` in the stats array
   - In the `pipeline` array: `{ l: "Classify", n: pendingReviewCount, ck: "violet" }` (use `pendingReviewCount` already in scope); set `n: 0` for all other stages

### Step 2 — Customer Profile classifications

3. In `src/app/(hub)/customers/[customerId]/client.tsx`:
   - Add imports: `useEffect` (already imported via React), `createClient` from `@/lib/supabase/client`, `Database` type from `@/types/database`
   - Add `ClassificationRow` type alias (see Code Context)
   - Add `const [classifications, setClassifications] = useState<ClassificationRow[]>([]);`
   - Add `useEffect` to fetch on mount (see Code Context)
   - Replace the "Recent Activity" stub div with a Classifications section using the existing `sectionCls` and `sectionTitleCls` class constants
   - Show a compact table: columns are Title, Type, Priority, Confidence, Status, Age
   - Use conditional Tailwind for priority color (CRITICAL = red, HIGH = amber, NORMAL = sky, LOW = slate)
   - If `classifications.length === 0`, show an empty state: "No classification records yet."

### Step 3 — Pipeline tab Classify column

4. In `src/app/(hub)/pm/pipeline/page.tsx`:
   - Add `useEffect`, `useState`, `createClient` imports
   - Fetch `classification_records` where `status = 'pending'`, `select("id, title, customer_id, created_at, customers(company_name)")`, order by `created_at desc`, limit 20
   - Map to `{ id, title, customer: data.customers?.company_name ?? data.customer_id, t: formatAge(data.created_at) }`
   - Pass `classifyItems` and `classifyCount` to `PipelineTab`
   - Add `formatAge` helper inline (same logic as in `tasks-tab.tsx` — derive minutes/hours/days)

5. In `src/components/hub/pm-tabs/pipeline-tab.tsx`:
   - Add `classifyItems` and `classifyCount` to `Props` (both optional, default to `[]` / `0`)
   - Replace hardcoded Classify stage `items` with `classifyItems`
   - Set all other stage `items` to `[]`
   - In each empty stage card, show: `<div className="text-[11px] text-[var(--c-muted)] text-center py-3">Sprint 3+</div>`
   - Remove the `statusColor` record entries for non-existing stages (keep the map but no items use them)

---

## Acceptance Criteria

- [ ] `/pm` home tab shows real "Open Tasks" and "In Pipeline" counts (both `0` initially, update when records exist)
- [ ] Pipeline mini-bar Classify count matches `pending` classification count; other bars show `0`
- [ ] `/customers/[customerId]` shows a "Classifications" section with real rows for that customer (or empty state if none)
- [ ] `/pm/pipeline` Classify column shows live pending records; Assess/Plan/Execute/Reply show "Sprint 3+" placeholder
- [ ] No `style={{}}` on any new element
- [ ] `npx tsc --noEmit` passes clean

---

## Notes for Implementation Agent

- **`formatAge` helper:** Don't import from `tasks-tab.tsx` (not exported). Inline a simple version in `pipeline/page.tsx` — same 3-line function already in `tasks-tab.tsx`.
- **`pendingReviewCount` as Classify bar:** The pipeline mini-bar "Classify" stage represents tasks sitting in classification review — this is exactly `pendingReviewCount` (already a prop on `HomeTab`). No new prop needed for the mini-bar.
- **Customer profile uses browser client:** `client.tsx` is already a Client Component. Import `createClient` from `@/lib/supabase/client` (browser singleton). No `adminClient` — the PM has an active session.
- **Pipeline tab prop defaults:** Both `classifyItems` and `classifyCount` are optional with defaults `[]` / `0` so the tab renders correctly even before the fetch resolves.
- **No realtime on pipeline/profile pages:** Static fetch on mount is sufficient for Sprint 2. Realtime is only wired on the tasks page.
