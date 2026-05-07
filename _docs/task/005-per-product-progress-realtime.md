# Task 005 — Per-Product Progress Bars (Real-Time) on PM Dashboard

> **Type:** enhancement
> **Version Impact:** patch
> **Priority:** NORMAL
> **Status:** TESTING
> **Completed:** 2026-05-07
> **Implementation Notes:** Migration 006 must be applied in Supabase before deploying. No backfill needed — DEFAULT 0 covers existing rows. Realtime subscription uses empty deps array (intentional — setCustomers is stable). TypeScript clean, build passes.
> **Recommended Model:** sonnet
> **Depends On:** Task 003 (Sprint 1 — Customer & Onboarding) ✅

---

## Summary

Upgrade the PM dashboard Progress column from a single aggregate "% of products complete" bar to **per-product real-time progress bars**. Each product a customer has subscribed to gets its own bar driven by `completed_percentage` stored in the DB on every auto-save. The PM sees live progress updates as the customer fills out the onboarding form — no page refresh required.

This also closes Task 15 from the Sprint 1 SCRUM tracker (missing fields indicator at the product level).

---

## Requirements

### 1. DB Migration — Add `completed_percentage` column

Add a numeric percentage column to `customer_products` so the actual field-level completion (0–100) is persisted alongside the binary `onboarding_complete` flag.

**New migration:** `supabase/migrations/006_product_completion_percentage.sql`

```sql
-- Add completed_percentage to store real field-completion progress
ALTER TABLE customer_products
  ADD COLUMN IF NOT EXISTS completed_percentage numeric(5,2) NOT NULL DEFAULT 0
    CHECK (completed_percentage >= 0 AND completed_percentage <= 100);

-- Enable Supabase Realtime for the PM dashboard live-update subscription
ALTER PUBLICATION supabase_realtime ADD TABLE customer_products;
```

### 2. PATCH API — Persist `completed_percentage`

`src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts`

Add `completed_percentage` to the `UPDATE` call. The value comes from `completedPercentage` in the request body (already sent by `useAutoSave`).

```typescript
const { data, error } = await adminClient
  .from("customer_products")
  .update({
    onboarding_data: onboardingData,
    onboarding_complete: isComplete,
    completed_percentage: completedPercentage ?? 0,  // ← ADD THIS
  })
  ...
```

### 3. TypeScript Type — `CustomerProductRow`

`src/types/database.ts` — add `completed_percentage: number` to the `customer_products` Row, Insert, and Update type shapes.

### 4. PM Dashboard — Per-Product Progress Bars

`src/app/(hub)/pm/page.tsx`

#### 4a. Progress column redesign

Replace the current single aggregate bar (`getProgressPct()` counts `onboarding_complete` booleans) with a **stacked set of mini-bars**, one per product, showing real field-level completion:

```
Progress column cell (per customer row):

  StackShift      ████████░░  82%
  PublishForge    ██░░░░░░░░  22%
```

- Bar color: green (`#22C55E`) when `completed_percentage === 100`, brand blue (`#3358F4`) otherwise
- Product name truncated to ~10 chars if needed; use abbreviated first letter + name: `SS`, `PF`, `CF`, `PF`
- Cell height grows to fit multiple bars; use `align-middle` with `py-2`

#### 4b. Remove `getProgressPct` aggregate helper

Delete the function entirely. The aggregate bar had no field-level meaning.

#### 4c. Supabase Realtime subscription

Add a subscription in the `PMDashboardPage` component that patches `customers` state in-place whenever a `customer_products` row is updated — without re-fetching the full list.

```typescript
// Inside PMDashboardPage, after initial fetch
useEffect(() => {
  const supabase = createClient(); // from @/lib/supabase/client
  const channel = supabase
    .channel("pm_product_progress")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "customer_products" },
      (payload) => {
        const updated = payload.new as CustomerProductRow;
        setCustomers((prev) =>
          prev.map((c) => ({
            ...c,
            customer_products: c.customer_products.map((p) =>
              p.id === updated.id ? { ...p, ...updated } : p
            ),
          }))
        );
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []); // only mount/unmount — no deps needed, closure over setCustomers is stable
```

### 5. Customer Profile — Upgrade Progress Bar

`src/app/(hub)/customers/[customerId]/client.tsx`

The product card already has a progress bar but hardcodes `30%` for in-progress products. Replace with `product.completed_percentage`:

```tsx
// BEFORE
width: isComplete ? "100%" : "30%",

// AFTER
width: `${product.completed_percentage ?? 0}%`,
```

Also update the text label from `"In progress"` to `"${product.completed_percentage}%"`.

---

## File Changes

| File | Change |
|------|--------|
| `supabase/migrations/006_product_completion_percentage.sql` | **CREATE** — add column + enable Realtime |
| `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` | **MODIFY** — include `completed_percentage` in `UPDATE` |
| `src/types/database.ts` | **MODIFY** — add `completed_percentage: number` to `CustomerProductRow` |
| `src/app/(hub)/pm/page.tsx` | **MODIFY** — per-product mini-bars + Supabase Realtime subscription |
| `src/app/(hub)/customers/[customerId]/client.tsx` | **MODIFY** — real `completed_percentage` in product card progress bar |

---

## Code Context

### `customer_products` table (current shape)
```sql
-- supabase/migrations/001_initial_schema.sql
create table if not exists customer_products (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         text not null references customers (customer_id) on delete cascade,
  product_name        text not null check (product_name in ('StackShift', 'PublishForge', 'CiteForge', 'PipelineForge')),
  onboarding_complete boolean not null default false,
  onboarding_data     jsonb not null default '{}',
  -- ... other columns
);
-- completed_percentage does NOT exist yet — migration 006 adds it
```

### PATCH API (current — onboarding/route.ts)
```typescript
const { data, error } = await adminClient
  .from("customer_products")
  .update({
    onboarding_data: onboardingData,
    onboarding_complete: isComplete,
    // ← completed_percentage NOT saved yet
  })
  .eq("customer_id", customerId)
  .eq("product_name", productName)
  .select()
  .single();
```

### useAutoSave already sends completedPercentage (src/hooks/use-auto-save.ts:44)
```typescript
body: JSON.stringify({ data, completedPercentage: completionPercentage }),
// completionPercentage is derived from useOnboardingForm.getCompletionPercentage()
// which counts required fields filled ÷ total required fields × 100
// The value is already being sent — the API just doesn't persist it yet
```

### PM dashboard Progress column (current — pm/page.tsx)
```typescript
// Current aggregate helper — DELETE THIS
const getProgressPct = (products: CustomerProductRow[] | undefined) => {
  if (!products || products.length === 0) return 0;
  return Math.round((products.filter((p) => p.onboarding_complete).length / products.length) * 100);
};

// Current Progress cell render — REPLACE THIS
<td className="p-2 align-middle">
  <div className="flex items-center gap-1.5">
    <div className="flex-1 h-[5px] bg-slate-100 rounded-full overflow-hidden min-w-[48px]">
      <div
        className="h-full rounded-full transition-[width] duration-200"
        style={{ width: `${pct}%`, background: getProgressColor(pct) }}
      />
    </div>
    <span className="text-[11px] text-slate-400 min-w-[28px]">{pct}%</span>
  </div>
</td>
```

### Customer profile progress bar (current — client.tsx:153–159)
```typescript
// Hardcoded 30% — REPLACE with product.completed_percentage
<div
  className="h-full rounded-full"
  style={{
    width: isComplete ? "100%" : "30%",   // ← fix this
    background: isComplete ? "#22C55E" : color,
  }}
/>
// Also update the label below:
<span className="text-[11px] text-slate-400">
  {isComplete ? "100%" : "In progress"}  // ← change "In progress" to the actual %
</span>
```

---

## Notes for Implementation Agent

- **Why sonnet:** Cross-cutting change — DB migration + API + type system + two UI pages + Supabase Realtime wiring. The realtime subscription has non-obvious cleanup/teardown requirements.

- **Migration order matters:** Run `006_product_completion_percentage.sql` in Supabase before deploying code changes. The new column has `DEFAULT 0` so existing rows are safe; no backfill needed.

- **Supabase Realtime publication:** `ALTER PUBLICATION supabase_realtime ADD TABLE customer_products` only needs to run once. If the table is already in the publication, Postgres will error — wrap with a `DO $$ BEGIN ... EXCEPTION WHEN ... END $$` block if idempotency is a concern, or just run it once.

- **Realtime client import:** Use `createClient` from `@/lib/supabase/client` (browser singleton) — NOT from `@/lib/supabase/server`. The PM dashboard is a Client Component (`"use client"`).

- **Realtime cleanup:** The `useEffect` return must call `supabase.removeChannel(channel)` — Supabase channels leak if not removed on unmount.

- **Empty deps array is intentional:** `setCustomers` from `useState` is stable across renders (React guarantees this). Adding it to deps would re-subscribe on every render.

- **Do NOT re-fetch on realtime event.** Patch the existing `customers` state in-place using the `payload.new` object. Re-fetching on every update defeats the purpose of realtime and causes visual flicker.

- **`completed_percentage` in `CustomerProductRow` type:** Add to `Row`, `Insert` (optional, has default), and `Update` (optional). Keep `completed_percentage: number` (not nullable — DB default is 0).

- **Product abbreviations in PM table:** Use a lookup map for display:
  ```typescript
  const PRODUCT_ABBREV: Record<string, string> = {
    StackShift: "SS", PublishForge: "PF", CiteForge: "CF", PipelineForge: "PpF",
  };
  ```
  Show full name on hover via `title` attribute.

- **Progress bar width in customer profile:** `product.completed_percentage` may be `0` if no saves have happened yet (fresh product association). This is correct — it shows an empty bar until the customer starts filling.

---

## Acceptance Criteria

1. PM dashboard Progress column shows one mini-bar per product (not one aggregate bar)
2. Each mini-bar label shows the product abbreviation and `%` value
3. When a customer fills a form field and 2s debounce fires, the PM dashboard updates the affected bar **without a page refresh**
4. A 100% completed product bar turns green; in-progress bars are brand blue
5. Customer profile product cards show actual `completed_percentage` instead of hardcoded 30%
6. No TypeScript errors (`npx tsc --noEmit` passes)
7. No regression on the onboarding auto-save flow
