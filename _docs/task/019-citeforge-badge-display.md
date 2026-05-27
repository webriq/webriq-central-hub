# 019: CiteForge Badge — Customers Table + Customer Details Add-On Card

**Created:** 2026-05-21
**Priority:** HIGH
**Type:** enhancement
**Recommended Model:** haiku
**Status:** TESTING
**Completed:** 2026-05-21

---

## Overview

CiteForge is a StackShift add-on — opted in via `onboarding_data.includeCiteForge === "Yes"` on the StackShift `customer_products` row. It has no separate DB row. Currently the PM dashboard customers table and the customer details Products section have no way to see that CiteForge is active.

This task makes CiteForge visible in two places:
1. **Customers table**: a "Ci" badge appears alongside "SS" when a customer has CiteForge opted in
2. **Customer details Products section**: a read-only CiteForge add-on card renders below StackShift — no Edit, Remove, or Status controls

---

## Requirements

- [x] `PRODUCT_ABBREV` and `PRODUCT_COLORS` in `shared.tsx` gain a `CiteForge` entry (`"Ci"`, color `#0EA5E9`)
- [x] Customers table (`clients-tab.tsx`): for each customer, check if any `customer_products` row has `product_name === "StackShift"` and `onboarding_data.includeCiteForge === "Yes"` — if so, render a `<ProductBadge name="CiteForge" />` immediately after the SS badge
- [x] Customer details (`client.tsx`): after the StackShift product card, if `onboarding_data.includeCiteForge === "Yes"`, render a read-only CiteForge card — same visual style but no Edit/Remove buttons and no Status badge. Add-on label: "Add-on to StackShift"
- [x] CiteForge card in customer details shows the same progress bar at 100% (it's complete when StackShift is complete)
- [x] "View Onboarding Form →" link at the bottom of each product card (currently `/onboarding/${customerId}`) should point to the product-specific slug route from task 018 (e.g., `/onboarding/${customerId}/stackshift`)

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-21

### What was built
- PM customers table now shows a "Ci" badge next to "SS" when a customer's StackShift `onboarding_data.includeCiteForge === "Yes"`
- Customer details Products section renders a read-only sky-blue CiteForge add-on card (no Edit/Remove/Status) below the products grid when opted in, showing 100% completion
- "View Onboarding Form →" links on each product card now route to the product-specific slug (e.g. `/onboarding/WRQ-CLIENT-XXXX/stackshift`)

### How to access for testing
- PM Dashboard → Customers tab — look for "Ci" badge alongside "SS" on a customer with CiteForge opted in
- Customer Details page → Products section — read-only CiteForge add-on card appears below StackShift card

### Deviations from plan
Minor: CiteForge card uses `h-[5px]` for the progress bar while existing product cards use `h-1.25`. Both resolve to 5px in Tailwind v4 — no visual difference.

### Standards check
Pass — no `any` types, no unused imports, proper null coalescing, no `console.log` in production paths.

### Convention check
Pass — `adminClient` not used in client components, no "use server" on utility modules.

---

## Out of Scope / Must-Not-Change

- Do not add a `customer_products` row for CiteForge — data lives in StackShift's `onboarding_data`
- Do not modify any API routes or schemas
- Do not modify the public onboarding form
- Do not git commit — user manages version control

---

## Proposed File Changes

| File | Action | Purpose |
|------|---------|---------|
| `src/components/hub/pm-tabs/shared.tsx` | Modify | Add `CiteForge` to `PRODUCT_ABBREV` and `PRODUCT_COLORS` |
| `src/components/hub/pm-tabs/clients-tab.tsx` | Modify | Inject synthetic CiteForge badge when opted in |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | Read-only CiteForge add-on card + fix onboarding link slugs |

---

## Code Context

### `shared.tsx:31–36` — badge maps to modify

```ts
export const PRODUCT_ABBREV: Record<string, string> = {
  StackShift: "SS", PublishForge: "PF", PipelineForge: "PpF",
};
export const PRODUCT_COLORS: Record<string, string> = {
  StackShift: "#3358F4", PublishForge: "#7C3AED", PipelineForge: "#F97316",
};
```

**Add CiteForge:**
```ts
export const PRODUCT_ABBREV: Record<string, string> = {
  StackShift: "SS", PublishForge: "PF", PipelineForge: "PpF", CiteForge: "Ci",
};
export const PRODUCT_COLORS: Record<string, string> = {
  StackShift: "#3358F4", PublishForge: "#7C3AED", PipelineForge: "#F97316", CiteForge: "#0EA5E9",
};
```

### `clients-tab.tsx:119–145` — badge rendering per customer row

```tsx
{data.map((c, i) => {
  const prods = c.customer_products ?? [];
  // ...avgPct, allMissing...
  return (
    <tr ...>
      ...
      <td className="py-[13px] px-4">
        <div className="flex gap-1 flex-wrap">
          {prods.map(p => <ProductBadge key={p.id} name={p.product_name} />)}
        </div>
      </td>
```

**Modification:** After mapping `prods`, check for CiteForge opt-in and inject a synthetic badge:

```tsx
const hasCiteForge = prods.some(
  p => p.product_name === "StackShift" &&
  (p.onboarding_data as Record<string, unknown>)?.includeCiteForge === "Yes"
);

// in the JSX:
{prods.map(p => <ProductBadge key={p.id} name={p.product_name} />)}
{hasCiteForge && <ProductBadge key="citeforge-addon" name="CiteForge" />}
```

### `client.tsx` — product card rendering (current)

Product colors are defined as two separate lookup maps (not the `PRODUCT_COLORS` constant from the task spec):
```tsx
const PRODUCT_ICON_CLASSES: Record<string, string> = {
  StackShift:    "text-[#3358F4] bg-[#3358F418]",
  PublishForge:  "text-[#7C3AED] bg-[#7C3AED18]",
  PipelineForge: "text-[#F97316] bg-[#F9731618]",
  CiteForge:     "text-[#0EA5E9] bg-[#0EA5E918]",
};

const PRODUCT_BAR_CLASSES: Record<string, string> = {
  StackShift:    "bg-[#3358F4]",
  PublishForge:  "bg-[#7C3AED]",
  PipelineForge: "bg-[#F97316]",
  CiteForge:     "bg-[#0EA5E9]",
};
```

Onboarding link uses product slug (task 018):
```tsx
const slug = product.product_name.toLowerCase().replace(/\s+/g, "");
<a href={`/onboarding/${customer.customer_id}/${slug}`}>View Onboarding Form →</a>
```

After the `products.map(...)` block, check StackShift for CiteForge opt-in and render a read-only add-on card:

```tsx
{(() => {
  const stackshift = products.find(p => p.product_name === "StackShift");
  const hasCiteForge =
    (stackshift?.onboarding_data as Record<string, unknown>)?.includeCiteForge === "Yes";
  if (!hasCiteForge) return null;
  return (
    <div className="rounded-[10px] p-4 border border-sky-100 bg-sky-50/20">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          {/* Tailwind inline hex classes — no style={} needed */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold bg-[#0EA5E918] text-[#0EA5E9]">
            Ci
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900">CiteForge</span>
            <span className="ml-2 text-[10px] text-slate-400 font-medium">Add-on to StackShift</span>
          </div>
        </div>
        {/* No Edit / Remove / Status controls */}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.25 bg-slate-100 rounded-full overflow-hidden">
          {/* w-full as Tailwind class — no style={{ width: "100%" }} */}
          <div className="h-full rounded-full bg-green-500 w-full" />
        </div>
        <span className="text-[11px] text-slate-400">100%</span>
      </div>
    </div>
  );
})()}
```

Note: `client.tsx` color lookups use `PRODUCT_ICON_CLASSES` (`text-[#hex] bg-[#hex18]`) and `PRODUCT_BAR_CLASSES` (`bg-[#hex]`) maps — not a single `PRODUCT_COLORS` constant.

---

## Implementation Steps

1. **`shared.tsx`** — Add `CiteForge: "Ci"` to `PRODUCT_ABBREV` and `CiteForge: "#0EA5E9"` to `PRODUCT_COLORS`
2. **`clients-tab.tsx`** — Compute `hasCiteForge` from the prods array; render extra `<ProductBadge>` after the mapped badges
3. **`client.tsx`**:
   - Add `CiteForge: "#0EA5E9"` to the local `PRODUCT_COLORS` constant
   - Fix the `View Onboarding Form →` link to use slug sub-routes
   - Add the read-only CiteForge add-on card after the products grid

---

## Notes for Implementation Agent

- `client.tsx` has its own local `PRODUCT_COLORS` constant (not imported from shared). Both need to be updated independently.
- The CiteForge card's progress shows 100% because CiteForge completion is implicit when StackShift is complete — no separate percentage is tracked.
- `hasCiteForge` must be derived at render time from `onboarding_data` — it is not a column in the DB. Cast `onboarding_data` as `Record<string, unknown>` before reading it.
- Use an IIFE (`(() => { ... })()`) to keep the CiteForge card logic self-contained after the products map, avoiding extracting a new component.
