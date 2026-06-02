# Task 048 — Onboarding: Submit-Only Cliq Notification, Form Lock After Submit, PM Responses View & Reopen

> **Type:** minor
> **Priority:** HIGH
> **Recommended Model:** sonnet

---

## Goal

Four related onboarding fixes that should ship together:

1. **Cliq fires multiple times** — notification is triggered by auto-save whenever `completedPercentage >= 100`, causing duplicate messages. Fix: only fire on explicit Submit button click, and guard against re-firing if already `completed_onboarding`.
2. **Form not locked after submit** — revisiting the onboarding URL after completing it re-shows the editable form. Fix: lock the public form when `onboarding_complete = true`, show a "You've already submitted" screen.
3. **PM has no readable view of onboarding answers** — PMs can only see a % bar + "Missing" label. Fix: add a "View Responses" modal per product in the customer profile Products tab, rendering each answer against its schema label.
4. **Onboarding link always copyable** — PMs should not be able to share an onboarding link after submission. Fix: hide "Copy Onboarding Link" when `status === 'completed_onboarding'`; replace with a "Reopen for Update" button that resets the submission state.

---

## Decisions Made

| Question | Answer |
|----------|--------|
| What gates `onboarding_complete = true`? | Only `explicitSubmit: true` in the PATCH body — auto-save never sets it |
| What prevents duplicate Cliq? | API checks `customer.status !== 'completed_onboarding'` before firing; also only fires on `explicitSubmit` |
| What locks the public form? | `productRow.onboarding_complete === true` in the server component — renders "Already Submitted" instead of `FormEngine` |
| Lock granularity | Per-product (each product form is individually locked on submit); multi-product picker shows completed products as locked |
| PM responses view | Modal in `client.tsx` — renders `onboarding_data` by section using `getOnboardingSchema` labels |
| Reopen scope | Resets `customer.status → 'onboarding'` AND all products `onboarding_complete → false` |
| Reopen auth | Auth-gated: uses `createClient()` (hub user session) — not accessible via public routes |
| Migration needed? | No — `onboarding_complete` already exists in `customer_products` |

---

## Acceptance Criteria

- [ ] Submitting a product form sends **exactly one** Cliq notification per "all products complete" event, regardless of how many auto-saves fired while the form was at 100%
- [ ] Re-saving an already-complete customer (e.g. PM triggers some update) does **not** re-fire the Cliq notification
- [ ] Revisiting `/onboard/[customerId]/[productSlug]` after submission shows a "You've already submitted" page — form is not rendered
- [ ] Multi-product picker (`/onboard/[customerId]`) marks completed products as locked; if ALL products are submitted, shows "All forms submitted" instead of the picker
- [ ] PM customer profile Products tab: each product card has a "View Responses" button that opens a modal showing all field labels + saved values organized by section
- [ ] "Copy Onboarding Link" button is hidden when `customer.status === 'completed_onboarding'`
- [ ] "Reopen for Update" button appears instead, and when clicked resets the customer status + all products' `onboarding_complete` to false
- [ ] After reopen, the public form URL becomes live again (product pages no longer show "Already Submitted")

---

## File Changes

| File | Action | Why |
|------|--------|-----|
| `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` | Modify | Change `isComplete` to gate on `explicitSubmit`; add idempotency guard; keep `completedPercentage` save unchanged |
| `src/components/onboarding/form-engine.tsx` | Modify | Pass `explicitSubmit: true` in `handleComplete` fetch body |
| `src/app/(public)/onboard/[customerId]/[productSlug]/page.tsx` | Modify | Check `productRow.onboarding_complete` — render "Already Submitted" screen if true |
| `src/app/(public)/onboard/[customerId]/page.tsx` | Modify | Pass `onboarding_complete` to client; show "All Done" if all complete |
| `src/app/(public)/onboard/[customerId]/client.tsx` | Modify | Accept `onboarding_complete` per product; mark completed products; show "All Done" if all submitted |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | Add "View Responses" modal state + handler; swap Copy/Reopen button; add reopen fetch handler |
| `src/app/api/customers/[customerId]/reopen-onboarding/route.ts` | Create | `POST` — authenticated; resets customer status + all products `onboarding_complete = false` |

---

## Implementation Steps

### Step 1 — Fix the onboarding PATCH API

**File:** `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts`

Change `isComplete` to only be true when `explicitSubmit` is explicitly sent:

```ts
const { data: onboardingData, completedPercentage, explicitSubmit } = body;
const isComplete = explicitSubmit === true;
```

The `update` payload should only set `onboarding_complete: true` when explicitly submitted:

```ts
const updatePayload: {
  onboarding_data: unknown;
  completed_percentage: number;
  onboarding_complete?: boolean;
} = {
  onboarding_data: onboardingData,
  completed_percentage: completedPercentage ?? 0,
};
if (isComplete) {
  updatePayload.onboarding_complete = true;
}
```

Add idempotency guard before the Cliq call — fetch customer status first and bail if already done:

```ts
if (isComplete) {
  try {
    const { data: allProducts } = await adminClient
      .from("customer_products")
      .select("onboarding_complete")
      .eq("customer_id", customerId);

    const allDone = allProducts?.every(p => p.onboarding_complete) ?? false;

    if (allDone) {
      const { data: customer } = await adminClient
        .from("customers")
        .select("company_name, status")
        .eq("customer_id", customerId)
        .single();

      // Idempotency guard — skip if already transitioned
      if (customer?.status !== "completed_onboarding") {
        await adminClient
          .from("customers")
          .update({ status: "completed_onboarding" })
          .eq("customer_id", customerId);

        const { sendCliqNotification } = await import("@/lib/zoho");
        await sendCliqNotification(
          `✅ ${customer?.company_name ?? customerId} has completed all onboarding forms. Ready for Zoho project creation.`
        );
      }
    }
  } catch (completionErr) {
    console.error("PATCH onboarding completion trigger error:", completionErr);
  }
}
```

### Step 2 — Pass `explicitSubmit: true` from `handleComplete`

**File:** `src/components/onboarding/form-engine.tsx`

In `handleComplete` (around line 72–82), add `explicitSubmit: true` to the fetch body:

```ts
body: JSON.stringify({ data, completedPercentage: 100, explicitSubmit: true }),
```

The auto-save hook (`useAutoSave`) never passes `explicitSubmit` and stays unchanged. Its `completedPercentage` saves progress tracking only.

### Step 3 — Lock public product form page

**File:** `src/app/(public)/onboard/[customerId]/[productSlug]/page.tsx`

After the `productRow` lookup (around line 78), extend the type to include `onboarding_complete` and check it:

```ts
const productRow = (customer.customer_products as Array<{
  id: string;
  product_name: string;
  onboarding_data: Record<string, unknown>;
  onboarding_complete: boolean;
}>)?.find((p) => p.product_name === productName);

if (!productRow) { /* existing not-found block */ }

// Lock: form already submitted
if (productRow.onboarding_complete) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-3 text-center">Already Submitted</h2>
      <p className="text-sm text-slate-500 leading-relaxed text-center max-w-110">
        You have already submitted the {productName} onboarding form. Your project manager has been notified and will be in touch shortly.
      </p>
      <a
        href={`/onboard/${customerId}`}
        className="mt-8 inline-block py-2.5 px-5.5 bg-brand text-white text-[13px] font-semibold rounded-full no-underline font-[inherit] hover:opacity-90 transition-opacity"
      >
        ← Back
      </a>
    </div>
  );
}
```

### Step 4 — Update multi-product picker server page + client

**File:** `src/app/(public)/onboard/[customerId]/page.tsx`

Extend the products filter to also include `onboarding_complete` in the type. Check if all non-CiteForge products are complete; if so, render an "All Done" screen instead of the client:

```ts
const products = ((...) ?? []).filter(p => p.product_name !== "CiteForge") as Array<{
  id: string;
  product_name: string;
  onboarding_data: Record<string, unknown>;
  onboarding_complete: boolean;
}>;

// All products submitted — show completion screen
if (products.length > 0 && products.every(p => p.onboarding_complete)) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-3 text-center">All Forms Submitted</h2>
      <p className="text-sm text-slate-500 leading-relaxed text-center max-w-110">
        Thank you, {customer.company_name}. All onboarding forms have been submitted. Your project manager will be in touch shortly.
      </p>
    </div>
  );
}
```

For single-product redirect: only redirect if product is NOT yet complete (if complete, fall through to show the picker/done screen).

Pass `onboarding_complete` to `OnboardingFormClient`:

```ts
return (
  <OnboardingFormClient
    customerId={customerId}
    companyName={customer.company_name}
    products={products}
  />
);
```

**File:** `src/app/(public)/onboard/[customerId]/client.tsx`

Update `ProductInfo` interface:
```ts
interface ProductInfo {
  id: string;
  product_name: string;
  onboarding_data: Record<string, unknown>;
  onboarding_complete: boolean;
}
```

In the product cards map, show completed products differently:
```tsx
{products.map((product) => {
  const slug = product.product_name.toLowerCase().replace(/\s+/g, "");
  if (product.onboarding_complete) {
    return (
      <div
        key={product.id}
        className="flex items-center justify-between py-4 px-5 bg-green-50 border border-green-200 rounded-xl"
      >
        <div>
          <div className="text-[15px] font-bold text-slate-900">{product.product_name}</div>
          <div className="text-xs text-green-600 font-semibold mt-0.5">✓ Submitted</div>
        </div>
        <span className="text-green-600 font-semibold">✓</span>
      </div>
    );
  }
  return (
    <a key={product.id} href={`/onboard/${customerId}/${slug}`} ...>
      {/* existing card content */}
    </a>
  );
})}
```

### Step 5 — PM "View Responses" modal

**File:** `src/app/(hub)/customers/[customerId]/client.tsx`

Add state for the view-responses modal at the top of the component (alongside existing modal states):
```ts
const [viewResponsesProduct, setViewResponsesProduct] = useState<CustomerProductRow | null>(null);
```

Add modal JSX (before the page content div, same pattern as other modals):
```tsx
{viewResponsesProduct && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
        <div>
          <h2 className="text-base font-bold text-slate-900">Onboarding Responses</h2>
          <p className="text-xs text-slate-400 mt-0.5">{viewResponsesProduct.product_name}</p>
        </div>
        <button
          onClick={() => setViewResponsesProduct(null)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        <ResponsesView product={viewResponsesProduct} />
      </div>
    </div>
  </div>
)}
```

Add a `ResponsesView` function (inline in the same file — not exported):
```tsx
function ResponsesView({ product }: { product: CustomerProductRow }) {
  const schema = getOnboardingSchema(product.product_name);
  const data = (product.onboarding_data as Record<string, unknown>) ?? {};

  if (!schema) {
    return <p className="text-[13px] text-slate-400">No schema found for {product.product_name}.</p>;
  }

  const visibleSections = schema.sections.filter(s => {
    if (!s.condition) return true;
    return String(data[s.condition.field]) === String(s.condition.value);
  });

  if (Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[13px] text-slate-400">No responses saved yet.</p>
      </div>
    );
  }

  return (
    <>
      {visibleSections.map(section => (
        <div key={section.id}>
          <div className="text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-3">
            {section.title}
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {section.fields
              .filter(field => {
                if (!field.condition) return true;
                return String(data[field.condition.field]) === String(field.condition.value);
              })
              .map(field => {
                const value = data[field.name];
                const displayValue = value === undefined || value === null || value === ""
                  ? "—"
                  : typeof value === "boolean"
                    ? (value ? "Yes" : "No")
                    : String(value);
                return (
                  <div key={field.name} className="flex gap-3 py-2 border-b border-slate-50 last:border-0">
                    <span className="text-[11px] text-slate-400 w-44 shrink-0">{field.label}</span>
                    <span className="text-[13px] text-slate-800 font-medium flex-1 break-words">{displayValue}</span>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </>
  );
}
```

Add import at the top:
```ts
import { getOnboardingSchema } from "@/config/onboarding-schemas";
```

In the product card, add a "View Responses" button next to the existing "Edit" button:
```tsx
<button
  onClick={() => setViewResponsesProduct(product)}
  className="text-[11px] font-medium text-slate-400 hover:text-brand transition-colors px-1.5 py-0.5 rounded bg-transparent border-none cursor-pointer"
  title="View onboarding responses"
>
  Responses
</button>
```

### Step 6 — PM profile: Copy Link lock + Reopen button

**File:** `src/app/(hub)/customers/[customerId]/client.tsx`

Add reopen handler (alongside other handlers):
```ts
const [reopening, setReopening] = useState(false);
const [reopenError, setReopenError] = useState<string | null>(null);

const handleReopen = async () => {
  setReopening(true);
  setReopenError(null);
  try {
    const res = await fetch(`/api/customers/${customer.customer_id}/reopen-onboarding`, {
      method: "POST",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to reopen onboarding");
    }
    router.refresh();
  } catch (err) {
    setReopenError(err instanceof Error ? err.message : "Failed to reopen onboarding");
  } finally {
    setReopening(false);
  }
};
```

In the header button group, conditionally render Copy vs Reopen based on status:
```tsx
{status === "completed_onboarding" ? (
  <button
    onClick={handleReopen}
    disabled={reopening}
    className="font-[inherit] py-2 px-4 bg-slate-600 text-white text-xs font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
  >
    {reopening ? "Reopening…" : "Reopen for Update"}
  </button>
) : (
  <button
    onClick={handleCopyLink}
    className={cn(
      "font-[inherit] py-2 px-4 text-white text-xs font-semibold border-none rounded-full cursor-pointer transition-colors duration-200",
      copied ? "bg-green-500" : "bg-brand-orange"
    )}
  >
    {copied ? "Copied! ✓" : "Copy Onboarding Link"}
  </button>
)}
```

If `reopenError` is set, display it briefly — add a small inline error near the header (or just log it; a full error display is optional given the low frequency of this action).

### Step 7 — Create reopen-onboarding API endpoint

**File:** `src/app/api/customers/[customerId]/reopen-onboarding/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    // Auth guard — hub users only
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { customerId } = await params;

    // Reset customer status
    const { error: customerError } = await adminClient
      .from("customers")
      .update({ status: "onboarding" })
      .eq("customer_id", customerId);

    if (customerError) {
      console.error("reopen-onboarding customer update error:", customerError);
      return NextResponse.json({ error: "Failed to reopen onboarding" }, { status: 500 });
    }

    // Reset all products' onboarding_complete
    const { error: productsError } = await adminClient
      .from("customer_products")
      .update({ onboarding_complete: false })
      .eq("customer_id", customerId);

    if (productsError) {
      console.error("reopen-onboarding products update error:", productsError);
      return NextResponse.json({ error: "Failed to reset product submission status" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("reopen-onboarding unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

---

## Code Context

### Current onboarding PATCH route — `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts`

Full file is 87 lines. Key change area:
```ts
// LINE 25 — CURRENT (change this)
const isComplete = completedPercentage !== undefined && completedPercentage >= 100;

// LINE 27-37 — CURRENT update block (change to conditional onboarding_complete)
const { data, error } = await adminClient
  .from("customer_products")
  .update({
    onboarding_data: onboardingData,
    onboarding_complete: isComplete,   // ← only set when explicitSubmit
    completed_percentage: completedPercentage ?? 0,
  })
  // ...

// LINE 59-74 — CURRENT completion trigger (add idempotency guard via customer.status check)
if (allDone) {
  const { data: customer } = await adminClient
    .from("customers")
    .select("company_name")    // ← also select "status"
    .eq("customer_id", customerId)
    .single();

  await adminClient
    .from("customers")
    .update({ status: "completed_onboarding" })
    .eq("customer_id", customerId);

  // ADD: if (customer?.status !== "completed_onboarding") { ... }
```

### `handleComplete` in FormEngine — `src/components/onboarding/form-engine.tsx:71-82`

```ts
const handleComplete = useCallback(async () => {
  try {
    await fetch(`/api/customers/${customerId}/products/${schema.productName}/onboarding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, completedPercentage: 100 }),  // ← add explicitSubmit: true
    });
  } catch {
    // best-effort
  }
  setIsCompleted(true);
}, [customerId, schema.productName, data]);
```

### Product slug page — `src/app/(public)/onboard/[customerId]/[productSlug]/page.tsx:78-116`

```ts
const productRow = (customer.customer_products as Array<{
  id: string;
  product_name: string;
  onboarding_data: Record<string, unknown>;
  // ← add: onboarding_complete: boolean;
}>)?.find((p) => p.product_name === productName);
// ← INSERT: if (productRow.onboarding_complete) { return "Already Submitted" }
```

### Customer profile header button area — `client.tsx:1012-1037`

```tsx
<button onClick={handleCopyLink} ...>
  {copied ? "Copied! ✓" : "Copy Onboarding Link"}
</button>
// ← replace with conditional Copy/Reopen based on status === "completed_onboarding"
```

### Product card button row — `client.tsx:1157-1171`

```tsx
<button onClick={() => handleOpenEditProduct(product)} ...>Edit</button>
<button onClick={() => { ... setRemoveProduct(product); }} ...>Remove</button>
// ← Add "Responses" button before these, triggers setViewResponsesProduct(product)
```

---

## Notes for Implementation Agent

- **Sonnet rationale:** Cross-cutting change across public routes, API semantics, form engine, PM profile, and a new endpoint. The `explicitSubmit` semantics change is a subtle decoupling that requires consistent application across all call sites.
- **`onboarding_complete` semantics change:** Before this task, auto-save could set `onboarding_complete = true`. After this task, only explicit submit does. This changes observable behavior: a customer at 100% who hasn't clicked Submit will no longer appear as `onboarding_complete = true` to the system. That is intentional and correct.
- **Auto-save hook stays unchanged** — it never sends `explicitSubmit`, so it will never set `onboarding_complete`. No changes needed in `use-auto-save.ts`.
- **`completed_percentage` still saved on every auto-save** — the progress ring still reflects real-time completion. Only `onboarding_complete` is gated behind explicit submit.
- **`ResponsesView` is an inline function in `client.tsx`** — not a separate file. It's only used in one place (the modal). Keep it co-located.
- **Import `getOnboardingSchema`** — already re-exported from `@/config/onboarding-schemas`. The import from client components is safe (the schema config has no server-only imports).
- **Multi-product picker single-product redirect** — Currently `page.tsx` redirects immediately for single-product customers. After this change, if the single product is already submitted, the redirect should not happen (it would send the user to the "Already Submitted" page on the product route, which is fine). No special handling needed — the redirect still works; the product page handles the lock.
- **Reopen API uses `createClient()` for auth** — This is the correct pattern for authenticated hub routes. Do not use `adminClient` alone for auth checks.
- **Reopen does not reset `completed_percentage`** — we preserve the progress data so PMs can still see historical answers. Only `onboarding_complete` is cleared to unlock the form.
- **`adminClient` exception in reopen route** — the reopen updates use `adminClient` after the auth check (same pattern as other hub admin routes that need to bypass RLS for writes). Document with inline comment.
- **`reopenError` display** — can simply be a `console.error` + a brief inline error below the button, or match the style of `saveError` in the edit modal. Keep it simple; this is a low-frequency action.

---

## Implementation Notes

> **Status:** TESTING
> **Completed:** 2026-06-02

