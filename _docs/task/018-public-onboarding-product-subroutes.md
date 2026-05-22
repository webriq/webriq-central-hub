# 018: Fix Public Onboarding — CiteForge Filter + Product Sub-Routes

**Created:** 2026-05-21
**Priority:** HIGH
**Type:** enhancement
**Recommended Model:** haiku
**Status:** TESTING
**Completed:** 2026-05-21

---

## Overview

Two bugs in the public onboarding flow at `/onboarding/[customerId]`:

1. **CiteForge shown as standalone product** — Task 017 established CiteForge is an add-on (not a standalone product), but if a customer's `customer_products` table has a row with `product_name = "CiteForge"`, it still appears in the public product picker with no form behind it (FormEngine returns "Product Not Found").

2. **No dedicated routes per product** — Clicking a product button replaces the page content via React state. There is no URL for each form, so customers can't bookmark/share/deep-link directly to a product's form.

Fix both: filter CiteForge out of the public product list, and convert product selection to navigate to specific sub-routes.

---

## Requirements

- [x] CiteForge entries in `customer_products` are filtered out on the public onboarding page — they never appear as selectable products
- [x] Single-product customers are immediately redirected from `/onboarding/[customerId]` to `/onboarding/[customerId]/[productSlug]` (no product selection step)
- [x] Multi-product customers see the product picker at `/onboarding/[customerId]` with buttons that navigate (not replace state) to the product sub-route
- [x] Each product has its own routed page:
  - `/onboarding/[customerId]/stackshift` → StackShift form
  - `/onboarding/[customerId]/publishforge` → PublishForge form
  - `/onboarding/[customerId]/pipelineforge` → PipelineForge form
- [x] The product-specific page fetches its own customer + product data (uses adminClient, same pattern as `[customerId]/page.tsx`)
- [x] If a customer visits a product slug they are not subscribed to, show a "Product Not Available" message
- [x] If a customer visits an unrecognized slug, show a 404-style message

---

## Out of Scope / Must-Not-Change

- Do not modify `onboarding-schemas.ts`, `form-engine.tsx`, or any form field definitions
- Do not modify any API routes
- Do not add authentication — this remains a public (no-session) route
- Do not touch the hub `/onboarding` page (PM customer creation flow)
- Do not git commit — user manages version control

---

## Proposed File Changes

| File | Action | Purpose |
|------|---------|---------|
| `src/app/(public)/onboarding/[customerId]/page.tsx` | Modify | Filter CiteForge, redirect single-product → sub-route, render picker with links for multi-product |
| `src/app/(public)/onboarding/[customerId]/client.tsx` | Modify | Convert product buttons to `<a>` links (or `router.push`) pointing to sub-routes |
| `src/app/(public)/onboarding/[customerId]/[productSlug]/page.tsx` | Create | Server Component — fetch customer + product, map slug → ProductName, render FormEngine |

---

## Code Context

### Slug ↔ ProductName mapping (implement in new page)

```ts
const SLUG_TO_PRODUCT: Record<string, string> = {
  stackshift: "StackShift",
  publishforge: "PublishForge",
  pipelineforge: "PipelineForge",
};
```

Reverse (for the product picker links):
```ts
function toSlug(productName: string): string {
  return productName.toLowerCase().replace(/\s+/g, "");
  // StackShift → stackshift, PublishForge → publishforge, PipelineForge → pipelineforge
}
```

### Current `page.tsx` (server component, lines 29–68)

```tsx
export default async function OnboardingPage({ params }: OnboardingPageProps) {
  const { customerId } = await params;
  // Using adminClient intentionally — see comment in generateMetadata above.
  const { data: customer, error } = await adminClient
    .from("customers")
    .select("*, customer_products(*)")
    .eq("customer_id", customerId)
    .single();

  // ... error handling ...

  const products = (customer.customer_products as Array<{
    id: string;
    product_name: string;
    onboarding_data: Record<string, unknown>;
  }>) ?? [];

  return (
    <OnboardingFormClient
      customerId={customerId}
      companyName={customer.company_name}
      products={products}
    />
  );
}
```

**Modification:** After deriving `products`, filter out CiteForge:
```ts
const products = ((customer.customer_products as Array<{...}>) ?? [])
  .filter((p) => p.product_name !== "CiteForge");
```

Then add single-product redirect using `redirect()` from `next/navigation`:
```ts
import { redirect } from "next/navigation";

if (products.length === 1) {
  const slug = products[0].product_name.toLowerCase().replace(/\s+/g, "");
  redirect(`/onboarding/${customerId}/${slug}`);
}
```

### Current `client.tsx` — product picker buttons (lines 46–59)

```tsx
{products.map((product) => (
  <button
    key={product.id}
    onClick={() => setSelectedProduct(product.product_name as ProductName)}
    className="..."
  >
    ...
  </button>
))}
```

**Modification:** Replace `onClick` + state with anchor links:
```tsx
{products.map((product) => {
  const slug = product.product_name.toLowerCase().replace(/\s+/g, "");
  return (
    <a
      key={product.id}
      href={`/onboarding/${customerId}/${slug}`}
      className="... no-underline ..."
    >
      ...
    </a>
  );
})}
```

Remove `selectedProduct` state entirely since the client file only shows the picker now — FormEngine rendering moves to the sub-route page. The client file may become very simple or unnecessary.

### New `[productSlug]/page.tsx` — pattern to follow

Model this exactly after `src/app/(public)/onboarding/[customerId]/page.tsx` (adminClient pattern, same structure):

```tsx
import { adminClient } from "@/lib/supabase/admin";
import FormEngine from "@/components/onboarding/form-engine";

const SLUG_TO_PRODUCT: Record<string, string> = {
  stackshift: "StackShift",
  publishforge: "PublishForge",
  pipelineforge: "PipelineForge",
};

interface Props {
  params: Promise<{ customerId: string; productSlug: string }>;
}

export default async function ProductOnboardingPage({ params }: Props) {
  const { customerId, productSlug } = await params;
  const productName = SLUG_TO_PRODUCT[productSlug];

  if (!productName) {
    return <div>... unrecognized product ...</div>;
  }

  // Using adminClient intentionally: public route, no customer session
  const { data: customer, error } = await adminClient
    .from("customers")
    .select("*, customer_products(*)")
    .eq("customer_id", customerId)
    .single();

  if (error || !customer) {
    return <div>... customer not found ...</div>;
  }

  const productRow = (customer.customer_products as Array<{
    id: string;
    product_name: string;
    onboarding_data: Record<string, unknown>;
  }>)?.find((p) => p.product_name === productName);

  if (!productRow) {
    return <div>... product not available for this customer ...</div>;
  }

  return (
    <FormEngine
      productName={productName}
      customerId={customerId}
      initialData={productRow.onboarding_data}
    />
  );
}
```

---

## Implementation Steps

1. **Modify `src/app/(public)/onboarding/[customerId]/page.tsx`**
   - Add `import { redirect } from "next/navigation"`
   - Filter `customer_products` to exclude `product_name === "CiteForge"`
   - If `products.length === 0` after filtering → show "not set up yet" (existing empty-product path, but move it here)
   - If `products.length === 1` → `redirect(\`/onboarding/${customerId}/${slug}\`)`
   - If `products.length > 1` → pass to `OnboardingFormClient` (picker UI)

2. **Modify `src/app/(public)/onboarding/[customerId]/client.tsx`**
   - Remove `selectedProduct` state and `FormEngine` render branch entirely — the client only renders the multi-product picker now
   - Convert product `<button onClick>` to `<a href={...}>` pointing to the slug sub-routes
   - The "single product" branch in the client can be removed (server handles it via redirect)
   - Keep the "empty products" fallback in case it's still needed

3. **Create `src/app/(public)/onboarding/[customerId]/[productSlug]/page.tsx`**
   - Server component
   - Slug → ProductName mapping
   - Fetch customer + filter to the specific product
   - Render FormEngine directly (no client wrapper needed — FormEngine is already a client component)
   - Error states: unrecognized slug, customer not found, product not assigned to this customer

---

## Notes for Implementation Agent

- `redirect()` in Next.js 16 App Router (Server Components) is imported from `"next/navigation"` — same as client, but works on server too.
- `adminClient` is already imported in `[customerId]/page.tsx` — copy that exact import into the new `[productSlug]/page.tsx`.
- The `FormEngine` component is `"use client"` — it can be rendered directly from a Server Component without a wrapper.
- Keep styling consistent with the existing `[customerId]/page.tsx` error states (the `<div className="p-12 text-center">` pattern).
- Do NOT add `"use client"` to the new `[productSlug]/page.tsx` — it must stay a Server Component so it can use `adminClient` and `await params`.
- The `client.tsx` file will become much simpler (picker only). If it ends up trivial, it's fine to keep it as a separate file rather than inlining into `page.tsx` — CLAUDE.md only requires inlining for single-page components.
