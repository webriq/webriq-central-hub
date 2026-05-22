# 016: M1 Onboarding Completion — Missing Fields View, Product Metadata Edit, Add Product to Existing Customer

**Created:** 2026-05-21
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-05-21

> **Recommended Model:** sonnet — cross-cutting: new API route + two modal UIs + client-side schema computation across customer profile and PM dashboard files.

---

## Overview

M1 (Customer & Onboarding) was declared complete, but code inspection reveals three gaps between the acceptance criteria and what's actually shipped:

1. **PM dashboard: missing fields** — The clients table and home-tab Client Health widget show `completed_percentage` as a progress bar, but no UI surface tells a PM *which specific required fields are unfilled*. PMs can't know whether to nudge a customer on infrastructure or design questions.
2. **Customer profile: product metadata is read-only** — Each product card displays `product_instance_id`, `zoho_project_id`, `sanity_project_id`, `github_repo` but there is no edit control. PMs have no way to set or update these from the Hub.
3. **Customer profile: no way to add a product to an existing customer** — The products section shows a hardcoded link to `/onboarding` which creates a new customer, not adds a product to the current one.

This task closes all three gaps, completing M1.

---

## Requirements

- [ ] PM customers list (`/pm/customers`): hovering the progress bar or clicking "View →" for a customer with `completed_percentage < 100` shows a popover/tooltip listing the names of all unfilled required form fields (across all products), grouped by product and section.
- [ ] Customer profile (`/customers/[customerId]`): each product card has an "Edit" icon/button that opens a modal to update `product_instance_id`, `zoho_project_id`, `sanity_project_id`, and `github_repo`.
- [ ] Customer profile: the Products section header has an "+ Add Product" button. Clicking it opens a modal that lets the PM pick a product name (excluding already-assigned products) and optionally fill in metadata. On confirm, calls `POST /api/customers/[customerId]/products`.
- [ ] New API route: `PATCH /api/customers/[customerId]/products/[productName]` — updates metadata fields only (`product_instance_id`, `zoho_project_id`, `sanity_project_id`, `github_repo`). Does not touch `onboarding_data` or `completed_percentage`.
- [ ] Missing fields computation runs entirely client-side using `getOnboardingSchema()` + `customer_products.onboarding_data` — no new DB query needed.
- [ ] Customer profile: each product card has a "Remove" button that opens a confirmation modal before calling `DELETE /api/customers/[customerId]/products?product_name=...`. The modal displays the product name and customer name and warns the action is permanent.

---

## Out of Scope / Must-Not-Change

- Do not modify `onboarding-schemas.ts` or any form field definitions.
- Do not touch `use-auto-save.ts`, `use-onboarding-form.ts`, or the public onboarding form.
- Do not add pagination or filtering to the missing fields view.
- Do not modify the `PATCH /api/customers/[customerId]/products/[productName]/onboarding` route (that's the data-save endpoint, untouched).
- Do not git commit — user manages version control.

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/customers/[customerId]/products/[productName]/route.ts` | Create | `PATCH` endpoint for product metadata |
| `src/components/hub/pm-tabs/clients-tab.tsx` | Modify | Missing fields popover on progress cell |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | Edit product metadata modal + Add Product modal + Remove Product confirmation |

---

## Code Context

### Missing fields calculation (client-side)

`getOnboardingSchema(productName)` returns a `FormSchema` with `sections[].fields[]`. Filter `field.required === true` and for conditional fields check `onboarding_data[field.condition.field] === field.condition.value`. A field is "missing" if its value in `onboarding_data` is `undefined`, `null`, `""`, or an empty array.

```ts
// Pattern to use:
import { getOnboardingSchema } from "@/config/onboarding-schemas";

function getMissingFields(productName: string, onboardingData: Record<string, unknown>) {
  const schema = getOnboardingSchema(productName);
  if (!schema) return [];
  const missing: { section: string; field: string }[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (!field.required) continue;
      if (field.condition) {
        const cv = onboardingData[field.condition.field];
        if (String(cv) !== String(field.condition.value)) continue;
      }
      const v = onboardingData[field.name];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) missing.push({ section: section.title, field: field.label });
    }
  }
  return missing;
}
```

### `clients-tab.tsx` progress cell (current, lines ~121–124)

```tsx
<td className="py-[13px] px-4 min-w-[160px]">
  {prods.length === 0
    ? <span className="text-[11px] text-[var(--c-muted)]">—</span>
    : <ProgressBar pct={avgPct} color={avgPct >= 100 ? "var(--c-green)" : "var(--c-blue)"} />}
</td>
```

Wrap the `ProgressBar` in a `<div className="relative group">`. Compute missing fields per product; if any, render a hidden tooltip (`group-hover:block`) listing them in compact form.

`onboarding_data` is already returned by `GET /api/customers?limit=100` via `select("*, customer_products(*)")`.

### `customers/[customerId]/client.tsx` product card (current, lines ~308–400)

Each product card is inside `products.map((product) => ...)`. The card already shows `product_instance_id`, `zoho_project_id`, `sanity_project_id`, `github_repo` as read-only text. Add an edit button at the top-right of the card header (next to the status badge) that opens an inline modal for those four fields.

The `handleSave` pattern (fetch → PATCH → `router.refresh()`) already exists in this file for the customer edit modal. Follow the same pattern for the product edit modal.

### New PATCH route skeleton

```ts
// src/app/api/customers/[customerId]/products/[productName]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string; productName: string }> }
) {
  const supabase = await createClient();
  const { customerId, productName } = await params;
  const body = await request.json();
  const allowed = ["product_instance_id", "zoho_project_id", "sanity_project_id", "github_repo"];
  const update: Record<string, string | null> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key] ?? null;
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  const { data, error } = await supabase
    .from("customer_products")
    .update(update)
    .eq("customer_id", customerId)
    .eq("product_name", productName)
    .select()
    .single();
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json(data);
}
```

Note: use `createClient()` (auth-gated, not adminClient) for this route — it's called from authenticated hub pages only.

### Add Product modal

The existing `POST /api/customers/[customerId]/products` route (lines 8–83 of that file) already handles adding a product. The modal needs only a product name picker (filter out already-assigned products using `products.map(p => p.product_name)`) and optional metadata fields. On success, call `router.refresh()`.

---

## Implementation Steps

1. **Create `PATCH /api/customers/[customerId]/products/[productName]/route.ts`** — allow-list the four metadata fields, use `createClient()` (auth-gated), update and return the row.

2. **Add missing-fields popover to `clients-tab.tsx`**:
   - Import `getOnboardingSchema` from `@/config/onboarding-schemas`
   - Write the `getMissingFields()` helper (see Code Context above)
   - In the progress cell, compute missing fields for each product; aggregate by product name
   - Wrap the `ProgressBar` in a `relative group` container; render the popover (absolute, group-hover visible) listing missing fields by product name and field label
   - Cap the list at ~8 items with "…and N more" if longer

3. **Add "Edit product metadata" modal to `customers/[customerId]/client.tsx`**:
   - Add state: `editProduct: CustomerProductRow | null`
   - Add a small edit icon button to each product card header (visible on hover)
   - Modal fields: Product Instance ID, Zoho Project ID, Sanity Project ID, GitHub Repo (all text/url inputs)
   - On save: `PATCH /api/customers/[customerId]/products/[productName]` → `router.refresh()`

4. **Add "+ Add Product" modal to `customers/[customerId]/client.tsx`**:
   - Add state: `addProductOpen: boolean`
   - Products section header gains an "+ Add Product" button (visible only if fewer than 4 products assigned)
   - Modal: `<select>` of products not yet assigned; optional metadata fields
   - On confirm: `POST /api/customers/${customerId}/products` with `{ product_name, ... }` → `router.refresh()`
   - Disable the confirm button if no product selected

5. **Add "Remove Product" confirmation to `customers/[customerId]/client.tsx`**:
   - Add state: `removeProduct: CustomerProductRow | null`
   - Add a "Remove" button to each product card header (muted, turns red on hover)
   - Confirmation modal: displays product name + customer name, warns action is permanent, red "Remove Product" CTA
   - On confirm: `DELETE /api/customers/${customerId}/products?product_name=${productName}` → `router.refresh()`
   - The existing `DELETE /api/customers/[customerId]/products` route already handles this — no new API needed

6. **TypeScript check**: `npx tsc --noEmit` — fix any errors before done.

---

## Acceptance Criteria

- [ ] `/pm/customers` — hovering the progress bar for a customer with `completed_percentage < 100` shows which required form fields are missing
- [ ] `/customers/[customerId]` — each product card has an edit button; the modal saves and product card reflects updated metadata after refresh
- [ ] `/customers/[customerId]` — "+ Add Product" button opens modal; selecting an unassigned product and confirming adds it to the customer's product list
- [ ] `/customers/[customerId]` — each product card has a "Remove" button; clicking it opens a confirmation modal; confirming removes the product and refreshes the page
- [ ] `PATCH /api/customers/[customerId]/products/[productName]` returns 200 with updated row; returns 400 for empty body
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `pnpm lint` passes with zero errors

---

## Credentials Required (Zoho Project Auto-Creation)

The code in `POST /api/customers/[customerId]/products` already calls `createZohoProject()` after inserting the product row. It is fully implemented but env-gated — it silently no-ops if the following vars are absent from `.env.local`:

| Env Var | Where to get it |
|---------|-----------------|
| `ZOHO_CLIENT_ID` | Zoho Developer Console → OAuth Apps → your app |
| `ZOHO_CLIENT_SECRET` | Same app, "Client Secret" field |
| `ZOHO_REFRESH_TOKEN` | Run the OAuth flow once (use Zoho's token endpoint with `access_type=offline`) |
| `ZOHO_PORTAL_ID` | Zoho Projects → Settings → API → Portal ID |

These are **not** needed for the three gaps in this task. They are only needed to auto-create a Zoho project when a product is added. Once added, `zoho_project_id` can also be set manually via the new edit modal in this task.

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then open /pm/customers and /customers/[any-id] in browser
```

Browser checks:
1. Hover a customer's progress bar in `/pm/customers` — popover lists missing fields
2. Open a customer profile — each product card has an edit button; modal saves correctly
3. Open a customer profile with < 4 products — "+ Add Product" button visible; adds product on confirm
4. Click "Remove" on a product card — confirmation modal appears with product + customer name; confirming removes the product; cancelling leaves it intact

---

## Compatibility Touchpoints

- No DB schema changes — uses existing `customer_products` columns
- No new npm packages
- No changes to public routes or auth flow

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-21

### What was built

- **PM Customers list** (`/pm/customers`): progress cell now shows a clickable "⚠ N fields missing" toggle beneath the progress bar when required onboarding fields are unfilled. Expanding it lists section + field names (capped at 8, with "…and N more" overflow). Computed client-side from `getOnboardingSchema()` + `customer_products.onboarding_data`.
- **Customer profile** (`/customers/[customerId]`): each product card gains **Edit** and **Remove** buttons in the card header. Edit opens a modal for `product_instance_id`, `zoho_project_id`, `sanity_project_id`, `github_repo`. Remove opens a confirmation modal that names the product and customer and warns the action is permanent.
- **Add Product**: Products section header has a "+ Add Product" button when fewer than 4 products are assigned. Opens a modal with a product picker (excludes already-assigned products) and optional metadata fields.
- **New API route**: `PATCH /api/customers/[customerId]/products/[productName]` — allow-listed metadata update using auth-gated `createClient()`.

### How to access for testing

- PM customers: `/pm/customers` → look for a customer with onboarding in progress
- Customer profile: `/customers/[any-id]` → product card Edit / Remove / "+ Add Product" buttons
- API: `PATCH /api/customers/{id}/products/{name}` with `{ zoho_project_id: "..." }` body

### Deviations from plan

- **Minor:** Tooltip replaced with `<details>` expand-in-place instead of an absolute-positioned hover popover. The table card has `overflow-hidden` (required for border-radius), which clips absolute-positioned children. `<details>` avoids the clipping issue with no JS overhead and still surfaces all missing field names on click.
- **Minor:** The `"Remove"` text button uses a muted-to-red hover transition instead of a trash icon, keeping the card header uncluttered. The confirmation modal is where destructive intent is confirmed.

### Standards check

Pass. No `any` types, no unused variables, no `console.log` in new code. All handlers follow the existing `fetch → setState → router.refresh()` pattern in the file. Functions are single-responsibility and under 30 lines.

### Convention check

- **SVG icons replaced with lucide-react** (simplify pass): `AlertTriangle` in the Remove confirmation modal (`client.tsx`); `Search` in the Filters component (`clients-tab.tsx`). Both now import from `lucide-react` per CLAUDE.md convention.
- All Tailwind utilities used — no new inline `style` attributes on static values. Pre-existing dynamic inline styles (hex color with alpha `${color}18`) were left untouched as they cannot be expressed statically.
- `createClient()` (auth-gated) used in the new PATCH route — not `adminClient`. Correct per CLAUDE.md: "Never bypass RLS with adminClient for regular reads/writes from hub pages."
