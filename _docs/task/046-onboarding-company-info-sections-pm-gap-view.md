# Task 046 — Onboarding: Company Info Sections + PM Section-Gap View

> **Type:** minor
> **Priority:** HIGH
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Goal

Align the onboarding form and PM customer profile with the spec:

1. **Customer-facing Company Info + Contacts sections** — add shared sections to StackShift and PublishForge onboarding forms, pre-populated with PM-entered values so customers can review/complete them.
2. **PM section-gap display** — replace the bare % bar on the customer profile product card with a "Missing: Section A, Section B" indicator so PMs can see exactly what's incomplete.

Industry and region are captured inside the Company Info section (stored in `onboarding_data` JSONB — no migration needed).

---

## Decisions Made

| Question | Answer |
|----------|--------|
| Company Info in customer-facing form? | Yes — pre-filled from PM-entered values, customer can complete/edit |
| CiteForge standalone product? | No — keep as StackShift add-on (no change) |
| Link delivery mechanism | Manual copy-paste (no change) |
| PM missing-fields granularity | Section-level (e.g. "Missing: Company Info, Assets") |
| Industry/region storage | JSONB in `onboarding_data` via Company Info section fields |

---

## Acceptance Criteria

- [ ] StackShift and PublishForge onboarding forms have a **Company Info** section as their first section, with fields: Company Name, Website, Industry (select), Region (select), Company Size (select)
- [ ] StackShift and PublishForge onboarding forms have a **Contacts & Stakeholders** section as their second section, with fields: Primary Contact Name, Primary Contact Email, Primary Contact Phone, Primary Contact Role
- [ ] Company Name, Primary Contact Name, and Primary Contact Email are **pre-populated** from the customer record (PM-entered values) when the customer opens the form — but only if those fields aren't already saved in `onboarding_data`
- [ ] PipelineForge onboarding form is **unchanged** — its existing `client-details` section already covers company info and contacts
- [ ] PM customer profile product cards show **"Missing: [Section Name], [Section Name]"** for any incomplete section, below the % bar, when `onboarding_complete` is false
- [ ] Complete product cards show no missing-section text
- [ ] `getIncompleteSections(productName, onboardingData)` is exported from `onboarding-schemas.ts` and reusable

---

## File Changes

| File | Action | Why |
|------|--------|-----|
| `src/config/onboarding-schemas.ts` | Modify | Add `companyInfoSection`, `stakeholdersSection` shared section defs; prepend to StackShift + PublishForge sections; export `getIncompleteSections()` |
| `src/app/(public)/onboard/[customerId]/[productSlug]/page.tsx` | Modify | Merge customer record fields into `initialData` before passing to `FormEngine` (pre-fill without overwriting saved data) |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | Import `getIncompleteSections`, render "Missing: …" below the % bar in product card |

---

## Implementation Steps

### Step 1 — Add shared sections to `onboarding-schemas.ts`

Add two shared `FormSection` constants near the top of the file (before the product-specific sections):

```typescript
const companyInfoSection: FormSection = {
  id: "company-info",
  title: "Company Info",
  description: "Tell us about your company.",
  fields: [
    { name: "companyName", label: "Company Name", type: "text", required: true, placeholder: "Acme Corp" },
    { name: "website", label: "Website", type: "url", placeholder: "https://acme.com" },
    {
      name: "industry",
      label: "Industry",
      type: "select",
      options: ["Technology", "E-commerce", "Healthcare", "Finance", "Education", "Media & Publishing", "Marketing & Advertising", "Non-profit", "Other"],
    },
    {
      name: "region",
      label: "Region",
      type: "select",
      options: ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East & Africa", "Global"],
    },
    {
      name: "companySize",
      label: "Company Size",
      type: "select",
      options: ["1–10", "11–50", "51–200", "201–1000", "1000+"],
    },
  ],
};

const stakeholdersSection: FormSection = {
  id: "stakeholders",
  title: "Contacts & Stakeholders",
  description: "Who are the key people we'll be working with?",
  fields: [
    { name: "primaryContactName", label: "Primary Contact Name", type: "text", required: true },
    { name: "primaryContactEmail", label: "Primary Contact Email", type: "email", required: true },
    { name: "primaryContactPhone", label: "Primary Contact Phone", type: "text" },
    { name: "primaryContactRole", label: "Primary Contact Role", type: "text", placeholder: "e.g. CTO, Marketing Manager" },
  ],
};
```

Prepend both to `stackShiftSections` and `publishForgeSections` arrays:
```typescript
const stackShiftSections: FormSection[] = [companyInfoSection, stakeholdersSection, /* existing sections */];
const publishForgeSections: FormSection[] = [companyInfoSection, stakeholdersSection, /* existing sections */];
```

Do NOT touch `pipelineForgeSections`.

Add the exported utility function at the bottom of the file (before `export default schemas`):

```typescript
export function getIncompleteSections(productName: string, onboardingData: Record<string, unknown>): string[] {
  const schema = getOnboardingSchema(productName);
  if (!schema) return [];
  return schema.sections
    .filter((section) => {
      if (section.condition) {
        if (onboardingData[section.condition.field] !== section.condition.value) return false;
      }
      return section.fields.some((field) => {
        if (!field.required) return false;
        if (field.condition) {
          if (onboardingData[field.condition.field] !== field.condition.value) return false;
        }
        const v = onboardingData[field.name];
        return !v || (typeof v === "string" && v.trim() === "");
      });
    })
    .map((s) => s.title);
}
```

### Step 2 — Pre-fill customer data in `[productSlug]/page.tsx`

After confirming the `productRow` exists, build a `mergedInitialData` object before passing to `FormEngine`. Customer record fields are seeds — saved `onboarding_data` takes precedence:

```typescript
const mergedInitialData: Record<string, unknown> = {
  companyName: customer.company_name ?? "",
  primaryContactName: customer.contact_name ?? "",
  primaryContactEmail: customer.contact_email ?? "",
  ...((productRow.onboarding_data as Record<string, unknown>) ?? {}),
};

return (
  <FormEngine
    productName={productName}
    customerId={customerId}
    initialData={mergedInitialData}
  />
);
```

The `customer` variable already has `company_name`, `contact_name`, `contact_email` from the existing `select("*, customer_products(*)")` query — no extra DB call needed.

### Step 3 — Section-gap display in `client.tsx`

Import `getIncompleteSections`:
```typescript
import { getIncompleteSections } from "@/config/onboarding-schemas";
```

Inside the product card loop (after the `%` span, before the metadata lines at ~line 960), add:

```tsx
{!isComplete && (() => {
  const missing = getIncompleteSections(
    product.product_name,
    (product.onboarding_data as Record<string, unknown>) ?? {}
  );
  return missing.length > 0 ? (
    <div className="text-[11px] text-orange-400 mt-0.5">
      Missing: {missing.join(", ")}
    </div>
  ) : null;
})()}
```

---

## Code Context

### `FormSection` and `FormField` types — `src/types/onboarding.ts:16-40`

```typescript
export interface FormField {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  hint?: string;
  condition?: { field: string; value: string | boolean; };
  span?: "full" | "half";
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  condition?: { field: string; value: string | boolean; };
}
```

### `schemas` Record and `getOnboardingSchema` — `src/config/onboarding-schemas.ts:542-565`

```typescript
const schemas: Record<ProductName, FormSchema> = {
  StackShift: { productName: "StackShift", sections: stackShiftSections },
  PublishForge: { productName: "PublishForge", sections: publishForgeSections },
  PipelineForge: { productName: "PipelineForge", sections: pipelineForgeSections },
};

export function getOnboardingSchema(productName: string): FormSchema | null {
  if (productName in schemas) return schemas[productName as ProductName];
  return null;
}
```

### `FormEngine` props — `src/components/onboarding/form-engine.tsx:14-20`

```typescript
interface FormEngineProps {
  productName: string;
  customerId: string;
  initialData?: OnboardingData;
}

export default function FormEngine({ productName, customerId, initialData }: FormEngineProps) {
  const schema = getOnboardingSchema(productName);
  // ...
  return <FormEngineInner schema={schema} customerId={customerId} initialData={initialData} />;
}
```

FormEngine does **not** need to change — pre-fill is handled by merging into `initialData` at the page level.

### `SLUG_TO_PRODUCT` — `src/app/(public)/onboard/[customerId]/[productSlug]/page.tsx:5-9`

```typescript
const SLUG_TO_PRODUCT: Record<string, string> = {
  stackshift: "StackShift",
  publishforge: "PublishForge",
  pipelineforge: "PipelineForge",
};
```

### Product card progress bar area — `client.tsx:944-958`

```tsx
<div className="flex items-center gap-2 mb-3">
  <div className="flex-1 h-1.25 bg-slate-100 rounded-full overflow-hidden">
    <div
      className={cn("h-full rounded-full transition-[width] duration-300",
        isComplete ? "bg-green-500" : (PRODUCT_BAR_CLASSES[product.product_name] ?? "bg-slate-400")
      )}
      style={{ width: `${product.completed_percentage ?? 0}%` }}
    />
  </div>
  <span className="text-[11px] text-slate-400">
    {Math.round(product.completed_percentage ?? 0)}%
  </span>
</div>
// ← INSERT MISSING SECTIONS HERE
```

---

## Notes for Implementation Agent

- **Sonnet rationale:** Cross-cutting change spanning public form schema, server component data-fetching, and PM profile UI — requires judgment on the conditional field system.
- **PipelineForge is explicitly excluded** from shared sections. Its `client-details` section already captures company info and contacts — duplicating the shared sections would create redundant fields.
- **Spread order matters in Step 2:** `onboarding_data` must spread LAST so customer edits to Company Info are not overwritten by PM-entered values on revisit.
- **`getIncompleteSections` condition matching:** The function checks `section.condition` to skip sections the customer hasn't opted into (e.g. CiteForge). This must mirror the same logic used in `FormEngineInner.visibleSections` — both compare strict equality `value !== condition.value`.
- **`client.tsx` imports `getOnboardingSchema` indirectly** via `getIncompleteSections` — the import is from `@/config/onboarding-schemas`, a server-safe module. No issues importing in a Client Component (it's pure data, no server-only imports).
- **No DB migration needed** — all new fields (industry, region, companySize, stakeholders) are stored in the existing `customer_products.onboarding_data` JSONB column.
- **`adminClient` pattern is already in place** in `[productSlug]/page.tsx` — do not change it, just extend the existing data-merge step.
- **Do not use `style={{}}`** — the progress bar uses it legitimately for dynamic width, but new elements must use Tailwind classes.

---

## Implementation Notes

> **Status:** TESTING
> **Completed:** 2026-06-02

### What was built

- `companyInfoSection` and `stakeholdersSection` constants added to `onboarding-schemas.ts`, prepended to StackShift and PublishForge section arrays. PipelineForge unchanged.
- `getIncompleteSections(productName, onboardingData)` exported from `onboarding-schemas.ts` — returns section titles where any required field is missing, respecting `section.condition` and `field.condition` gates.
- `[productSlug]/page.tsx` now seeds `companyName`, `primaryContactName`, `primaryContactEmail` from the customer record into `mergedInitialData` before passing to `FormEngine`. Saved `onboarding_data` spreads last so customer edits are never overwritten.
- PM customer profile product card: `missingSections` computed per-product in the map callback; renders `"Missing: Section A, Section B"` in orange below the % bar when `onboarding_complete` is false and sections are incomplete.

### How to access for testing

- Customer-facing form: `/onboard/<customer_id>/stackshift` or `/onboard/<customer_id>/publishforge` — Company Info and Contacts sections should appear first, pre-populated if PM entered company/contact info at creation
- PM profile: `/dashboard/customers/<customer_id>` — product cards for incomplete products should show "Missing: …" below the progress bar
- PipelineForge form: `/onboard/<customer_id>/pipelineforge` — should be unchanged (no new sections)

### Deviations from plan

- The task doc suggested an IIFE pattern for the missing-sections render. Replaced with a pre-computed `const missingSections` variable in the map callback body (before the return) and a ternary in JSX — cleaner and aligns with `vercel-react-best-practices` (`rendering-conditional-render`, `rerender-no-inline-components`).

### Standards check

Pass — TypeScript check (`npx tsc --noEmit`) returns no errors.

### Convention check

Pass — Tailwind classes only (no `style={{}}`), direct import from `@/config/onboarding-schemas` (no barrel), ternary used instead of `&&` for conditional render.
