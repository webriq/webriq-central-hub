# 020: Auto-Transition Customer to Active + Create Zoho Project on Full Onboarding Completion

**Created:** 2026-05-21
**Priority:** HIGH
**Type:** feature
**Recommended Model:** haiku
**Status:** COMPLETE
**Completed:** 2026-05-21

> **Recommended Model:** haiku — single API route change following established patterns; `createZohoProject()` is already implemented in `src/lib/zoho/index.ts`.

---

## Overview

When a customer completes onboarding for all their products (every `customer_products.onboarding_complete = true`), two things should happen automatically:

1. **Customer status → `active`** — `customers.status` is updated from `"onboarding"` to `"active"`
2. **Zoho project created** — `createZohoProject()` is called with the customer's company name; the returned `zoho_project_id` is written back to the triggering product's `customer_products` row

Both are triggered inside the existing `PATCH /api/customers/[customerId]/products/[productName]/onboarding` route, immediately after a successful update, when `isComplete === true`.

---

## Requirements

- [x] After any product's onboarding PATCH succeeds with `completedPercentage >= 100`, check if ALL `customer_products` rows for that customer have `onboarding_complete = true`
- [x] If all complete: update `customers.status = 'active'` using `adminClient`
- [x] If all complete AND `zoho_project_id` is not already set on the triggering product row: call `createZohoProject(customerId, companyName)` and write the returned ID to `customer_products.zoho_project_id` for the triggering product
- [x] If Zoho returns an empty string (env vars missing or API error), skip silently — do not fail the PATCH response
- [x] The PATCH response is unchanged — still returns the updated `customer_products` row

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-21

### What was built
When any product's onboarding PATCH completes at 100%, the route now:
1. Queries all `customer_products` for that customer to check if all are `onboarding_complete`
2. If all done: updates `customers.status = 'active'`
3. If `zoho_project_id` not already set on the triggering product: dynamically imports `createZohoProject`, calls it with the company name, writes the returned ID back to `customer_products`
4. The entire block is non-fatal — a `try/catch` ensures completion errors never fail the save response

### How to access for testing
- Complete all products for a test customer (set `completedPercentage: 100` via the onboarding form or direct API call)
- Check `customers.status` in Supabase — should flip to `'active'`
- Check `customer_products.zoho_project_id` — should be populated if `ZOHO_PORTAL_ID` and OAuth env vars are configured
- PM Dashboard customers table should show customer as "Active" after refresh

### Setup required for Zoho
Env vars needed in `.env.local`: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_PORTAL_ID`. Without them, `createZohoProject()` skips silently — status flip still works.

### Post-implementation fixes (verified working)
Two bugs discovered during live testing and fixed in `src/lib/zoho/index.ts`:

1. **Wrong Content-Type** — original implementation sent `application/json`. Zoho Projects API requires `application/x-www-form-urlencoded`. Fixed by switching to `URLSearchParams` + `Content-Type: application/x-www-form-urlencoded`.

2. **Invalid `owner` field** — adding `owner` (email string) caused Zoho error 6831 then 403 `FIELDS_VALIDATION_ERROR: Data type mismatch`. Zoho expects a numeric user ID, not an email. Removed the field entirely — Zoho defaults the owner to the authenticated OAuth user, which is correct for server-to-server use.

### Deviations from plan
None in logic. `src/lib/zoho/index.ts` also modified (not listed in original File Changes) to fix the API call format — should be noted as an additional file changed.

### Standards check
Pass — dynamic import keeps Zoho out of non-completion requests, `console.error` (not `console.log`) in catch block, idempotency guard prevents duplicate Zoho projects.

### Convention check
Pass — `adminClient` server-only usage, no RLS bypass for reads.

---

## Out of Scope / Must-Not-Change

- Do not modify any other API routes
- Do not modify any UI components (the customer details page already displays `zoho_project_id` when set)
- Do not add Zoho project creation for customers that already have a `zoho_project_id` (idempotent guard)
- Do not git commit — user manages version control

---

## Proposed File Changes

| File | Action | Purpose |
|------|---------|---------|
| `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` | Modify | Add all-complete check → status flip + Zoho project creation |

---

## Code Context

### Current route (`onboarding/route.ts`) — full file

```ts
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductName } from "@/types/hub";

const VALID_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "PipelineForge"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string; productName: string }> }
) {
  try {
    const { customerId, productName } = await params;

    if (!VALID_PRODUCTS.includes(productName as ProductName)) {
      return NextResponse.json({ error: "Invalid product name" }, { status: 400 });
    }

    const body = await request.json();
    const { data: onboardingData, completedPercentage } = body;

    if (onboardingData === undefined) {
      return NextResponse.json({ error: "data field is required" }, { status: 400 });
    }

    const isComplete = completedPercentage !== undefined && completedPercentage >= 100;

    const { data, error } = await adminClient
      .from("customer_products")
      .update({
        onboarding_data: onboardingData,
        onboarding_complete: isComplete,
        completed_percentage: completedPercentage ?? 0,
      })
      .eq("customer_id", customerId)
      .eq("product_name", productName)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Product association not found" }, { status: 404 });
      }
      console.error("PATCH onboarding error:", error);
      return NextResponse.json({ error: "Failed to save onboarding data" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH onboarding unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### `src/lib/zoho/index.ts:33–62` — existing stub (already implemented)

```ts
export async function createZohoProject(customerId: string, projectName: string): Promise<string> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) {
    console.warn("[zoho] ZOHO_PORTAL_ID not configured — skipping project creation for", customerId);
    return "";
  }
  const token = await getZohoAccessToken();
  if (!token) return "";
  // ... POSTs to Zoho Projects API ...
  return (json?.projects?.[0]?.id_string as string) ?? "";
}
```

---

## Implementation Steps

After `const { data, error } = await adminClient...` succeeds and before `return NextResponse.json(data)`, add:

```ts
// When this product is now complete, check if all products for this customer are done
if (isComplete) {
  const { data: allProducts } = await adminClient
    .from("customer_products")
    .select("onboarding_complete, zoho_project_id")
    .eq("customer_id", customerId);

  const allDone = allProducts?.every(p => p.onboarding_complete) ?? false;

  if (allDone) {
    // Transition customer to active
    await adminClient
      .from("customers")
      .update({ status: "active" })
      .eq("customer_id", customerId);

    // Create Zoho project if not already set on this product row
    if (!data.zoho_project_id) {
      const { data: customer } = await adminClient
        .from("customers")
        .select("company_name")
        .eq("customer_id", customerId)
        .single();

      if (customer?.company_name) {
        const { createZohoProject } = await import("@/lib/zoho");
        const zohoId = await createZohoProject(customerId, customer.company_name);
        if (zohoId) {
          await adminClient
            .from("customer_products")
            .update({ zoho_project_id: zohoId })
            .eq("customer_id", customerId)
            .eq("product_name", productName);
        }
      }
    }
  }
}
```

**Import:** Add `createZohoProject` as a dynamic import inside the `if (allDone)` block (as shown above) to avoid loading Zoho on every request. Alternatively, add a static import at the top of the file — both work; dynamic import is preferred since Zoho is only called on completion.

---

## Notes for Implementation Agent

- Use `await import("@/lib/zoho")` (dynamic) rather than a static top-level import — keeps the Zoho module out of every auto-save request (which fires every 2s during form fill).
- The `status: "active"` string matches the `CustomerStatus` type in `hub.ts` — no cast needed.
- Both the status update and Zoho project creation are fire-and-forget within the `if (allDone)` block — log errors but don't let them fail the PATCH response.
- The idempotency guard `!data.zoho_project_id` uses `data` (the updated product row just returned by the `.select().single()`) — this is already in scope.
- Env vars required in `.env.local` before Zoho creation will fire: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_PORTAL_ID`. If missing, `createZohoProject()` skips silently — no code change needed for missing env vars.
