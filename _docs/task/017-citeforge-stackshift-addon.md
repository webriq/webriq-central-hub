# 017: CiteForge as StackShift Add-On

**Created:** 2026-05-21
**Priority:** HIGH
**Type:** enhancement
**Recommended Model:** haiku
**Status:** TESTING
**Completed:** 2026-05-21

---

## Overview

CiteForge is not an independent product — it is an optional add-on to StackShift. This task moves the CiteForge onboarding questions into the StackShift form behind an opt-in toggle, and removes CiteForge as a standalone product everywhere it currently appears.

CiteForge data will be saved as part of the StackShift `customer_products.onboarding_data` JSONB (no new DB row, no schema migration required).

---

## Requirements

- [x] StackShift onboarding form includes an "Add-ons" section with a Yes/No toggle for CiteForge
- [x] When Yes, three CiteForge sections appear in the StackShift stepper (Citation Style, Source Types, Output & Integration)
- [x] When No (or unset), CiteForge sections are hidden from the stepper and excluded from the completion % calculation
- [x] CiteForge is removed as a selectable standalone product in the PM product-selector
- [x] CiteForge is removed from `ProductName` TS type
- [x] All helper maps and `VALID_PRODUCTS` arrays that reference CiteForge are updated

---

## Out of Scope / Must-Not-Change

- No DB migration — CiteForge data lives inside StackShift's `onboarding_data` JSONB
- Do not create a new `customer_products` row for CiteForge when opted in
- Do not modify any other product schemas (PublishForge, PipelineForge)
- The `ProgressBar` component does not need changes — it receives the already-filtered `visibleSections` array

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/types/onboarding.ts` | Modify | Add optional `condition` to `FormSection` type |
| `src/types/hub.ts` | Modify | Remove `"CiteForge"` from `ProductName` union |
| `src/config/onboarding-schemas.ts` | Modify | Add Add-ons + CiteForge sections to StackShift; remove CiteForge from schemas map |
| `src/components/onboarding/form-engine.tsx` | Modify | Compute `visibleSections` from conditions; clamp index when sections change |
| `src/hooks/use-onboarding-form.ts` | Modify | Skip hidden sections in `getCompletionPercentage` |
| `src/components/onboarding/product-selector.tsx` | Modify | Remove CiteForge from `PRODUCTS` |
| `src/app/api/customers/[customerId]/products/route.ts` | Modify | Remove `"CiteForge"` from `VALID_PRODUCTS` and error message |
| `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` | Modify | Remove `"CiteForge"` from `VALID_PRODUCTS` |
| `src/components/hub/pm-tabs/shared.tsx` | Modify | Remove CiteForge from `PRODUCT_ABBREV` and `PRODUCT_COLORS` |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | Remove CiteForge from `PRODUCT_COLORS` and `ALL_PRODUCTS` |

---

## Code Context

### File: `src/types/onboarding.ts` — FormSection (lines 31–37)

```ts
export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  // ADD: optional condition — hides entire section from stepper when not met
  condition?: {
    field: string;
    value: string | boolean;
  };
}
```

### File: `src/config/onboarding-schemas.ts` — Add-ons section to append to `stackShiftSections`

```ts
// Append after the existing "seo" section:
{
  id: "addons",
  title: "Add-ons",
  description: "Optional WebriQ products bundled with StackShift",
  fields: [
    {
      name: "includeCiteForge",
      label: "Include CiteForge?",
      type: "radio-group",
      required: true,
      options: ["Yes", "No"],
      hint: "CiteForge adds citation & bibliography management to your StackShift site.",
    },
  ],
},
// Then three CiteForge sections, each with section-level condition:
{
  id: "citeforge-citation-style",
  title: "CiteForge — Citation Style",
  description: "Academic and professional citation requirements",
  condition: { field: "includeCiteForge", value: "Yes" },
  fields: [ /* contents of current citeForgeSections[0].fields */ ],
},
{
  id: "citeforge-source-types",
  title: "CiteForge — Source Types",
  description: "What kinds of sources do you cite?",
  condition: { field: "includeCiteForge", value: "Yes" },
  fields: [ /* contents of current citeForgeSections[1].fields */ ],
},
{
  id: "citeforge-output",
  title: "CiteForge — Output & Integration",
  description: "How do you want to use your citations?",
  condition: { field: "includeCiteForge", value: "Yes" },
  fields: [ /* contents of current citeForgeSections[2].fields */ ],
},
```

Remove the standalone `citeForgeSections` variable and `CiteForge` entry from the `schemas` map.

### File: `src/components/onboarding/form-engine.tsx` — visibleSections (replace lines 58–59)

```tsx
// Replaces: const totalSections = schema.sections.length;
// Replaces: const currentSection = schema.sections[currentSectionIndex];

const visibleSections = schema.sections.filter((s) => {
  if (!s.condition) return true;
  return String(getFieldValue(s.condition.field)) === String(s.condition.value);
});
const totalSections = visibleSections.length;
const currentSection = visibleSections[currentSectionIndex];
```

Add a clamp effect after the `useState(0)` for `currentSectionIndex`:

```tsx
useEffect(() => {
  if (currentSectionIndex >= visibleSections.length) {
    setCurrentSectionIndex(Math.max(0, visibleSections.length - 1));
  }
}, [visibleSections.length, currentSectionIndex]);
```

Also update `ProgressBar` to receive `visibleSections` instead of `schema.sections` (line 135).
Also update the `"Section X of Y"` label to use `visibleSections` index:
```tsx
// The section index in the bottom nav label must re-derive index from visibleSections:
const currentVisibleIndex = visibleSections.findIndex(s => s.id === currentSection?.id);
// Then use: Section {currentVisibleIndex + 1} of {totalSections}
```

### File: `src/hooks/use-onboarding-form.ts` — getCompletionPercentage (lines 35–69)

Add section condition check before iterating fields:

```ts
const getCompletionPercentage = useCallback((): number => {
  const requiredFields: FormField[] = [];
  for (const section of schema.sections) {
    // Skip sections whose condition is not met
    if (section.condition) {
      const conditionValue = data[section.condition.field];
      if (String(conditionValue) !== String(section.condition.value)) continue;
    }
    for (const field of section.fields) {
      if (field.required) {
        if (field.condition) {
          const conditionValue = data[field.condition.field];
          const targetValue = field.condition.value;
          if (String(conditionValue) !== String(targetValue)) continue;
        }
        requiredFields.push(field);
      }
    }
  }
  // ... rest unchanged
}, [data, schema.sections]);
```

### File: `src/types/hub.ts` — ProductName (lines 83–87)

Remove `| "CiteForge"`:
```ts
export type ProductName =
  | "StackShift"
  | "PublishForge"
  | "PipelineForge";
```

### File: `src/components/onboarding/product-selector.tsx` — lines 11–16

Remove the CiteForge entry from `PRODUCTS`:
```ts
const PRODUCTS = [
  { name: "StackShift", label: "StackShift", description: "Headless CMS & website platform", color: "#3358F4" },
  { name: "PublishForge", label: "PublishForge", description: "Content publishing & blog management", color: "#7C3AED" },
  { name: "PipelineForge", label: "PipelineForge", description: "Sales pipeline & outreach automation", color: "#F97316" },
];
```

### File: `src/app/api/customers/[customerId]/products/route.ts` — line 6

```ts
const VALID_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "PipelineForge"];
// Also update the error message at line 19 accordingly
```

### File: `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` — line 5

```ts
const VALID_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "PipelineForge"];
```

### File: `src/components/hub/pm-tabs/shared.tsx` — lines 31–36

```ts
export const PRODUCT_ABBREV: Record<string, string> = {
  StackShift: "SS", PublishForge: "PF", PipelineForge: "PpF",
};
export const PRODUCT_COLORS: Record<string, string> = {
  StackShift: "#3358F4", PublishForge: "#7C3AED", PipelineForge: "#F97316",
};
```

### File: `src/app/(hub)/customers/[customerId]/client.tsx` — lines 29, 33

```ts
// line 29 equivalent — remove CiteForge:
CiteForge: "#22C55E",  // DELETE this line

// line 33 — remove "CiteForge":
const ALL_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "PipelineForge"];
```

---

## Implementation Steps

1. **`src/types/onboarding.ts`**: Add optional `condition` to `FormSection` interface.

2. **`src/types/hub.ts`**: Remove `"CiteForge"` from `ProductName` union.

3. **`src/config/onboarding-schemas.ts`**:
   - Append "Add-ons" section to `stackShiftSections` (before the closing `]`) with `includeCiteForge` radio-group field.
   - Append three CiteForge sections after it, each with `condition: { field: "includeCiteForge", value: "Yes" }`, copying fields from the existing `citeForgeSections` variable.
   - Delete the `citeForgeSections` variable.
   - Remove `CiteForge` from the `schemas` map; update the type to `Record<ProductName, FormSchema>` (no longer includes CiteForge).

4. **`src/hooks/use-onboarding-form.ts`**: In `getCompletionPercentage`, add a section-level condition check before iterating fields (see Code Context above).

5. **`src/components/onboarding/form-engine.tsx`**:
   - Compute `visibleSections` from `schema.sections.filter(...)` using `getFieldValue` (see Code Context).
   - Replace all `schema.sections` references used for navigation/display with `visibleSections`.
   - Add the clamp `useEffect` for index safety.
   - Pass `visibleSections` to `ProgressBar`.
   - Update the bottom nav section label to use visible index.

6. **`src/components/onboarding/product-selector.tsx`**: Remove the CiteForge entry.

7. **`src/app/api/customers/[customerId]/products/route.ts`**: Remove CiteForge from `VALID_PRODUCTS` and update the error message string.

8. **`src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts`**: Remove CiteForge from `VALID_PRODUCTS`.

9. **`src/components/hub/pm-tabs/shared.tsx`**: Remove CiteForge entries from `PRODUCT_ABBREV` and `PRODUCT_COLORS`.

10. **`src/app/(hub)/customers/[customerId]/client.tsx`**: Remove CiteForge from `PRODUCT_COLORS` and `ALL_PRODUCTS`.

11. Run `npx tsc --noEmit` and verify zero TypeScript errors.

---

## Acceptance Criteria

- [ ] StackShift onboarding form shows an "Add-ons" section with "Include CiteForge?" radio (Yes/No)
- [ ] Selecting Yes shows three CiteForge sections in the stepper; selecting No (or unset) hides them completely
- [ ] Completion % does not count CiteForge required fields when `includeCiteForge` is not "Yes"
- [ ] Progress bar and "Section X of Y" label reflect only visible sections
- [ ] Navigating away from the add-ons section never leaves `currentSectionIndex` out of bounds
- [ ] CiteForge is absent from the PM product selector
- [ ] `npx tsc --noEmit` passes with no errors

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Then browser-test the StackShift onboarding form:
1. Navigate through to the "Add-ons" section — CiteForge sections should not appear in the stepper
2. Select "Yes" → CiteForge sections appear in the stepper and can be navigated
3. Go back and switch to "No" → CiteForge sections disappear; stepper index clamps correctly
4. Verify completion % increases only when required fields in visible sections are filled

---

## Compatibility Touchpoints

- **Existing CiteForge DB rows**: Any `customer_products` rows with `product_name = 'CiteForge'` in the DB will no longer have a matching onboarding schema and will show "Product Not Found" on the public onboarding page. These should be removed manually by the PM if they exist, or left in place (they won't appear in the product selector going forward).
- No API breaking changes — the `PATCH /api/customers/.../products/.../onboarding` route still works identically for StackShift.

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-21

### What was built
CiteForge is now an opt-in add-on within the StackShift onboarding form. The stepper shows an "Add-ons" section (section 6) where the customer answers "Include CiteForge? Yes/No". Selecting Yes expands the stepper with three CiteForge-specific sections (Content Inventory, AI Readiness Goals, Launch & Support). Selecting No (or leaving unset) keeps those sections hidden and excludes their required fields from the completion percentage. CiteForge no longer appears anywhere as an independent product.

### How to access for testing
- URL: `/onboarding/[customerId]` — assign a customer with StackShift product, open their onboarding link
- Navigate through to the "Add-ons" section (section 6 of 6 without CiteForge)
- Toggle Yes → three CiteForge sections appear; stepper expands to 9 sections
- Toggle No → CiteForge sections disappear; stepper returns to 6 sections
- Verify completion % only counts CiteForge required fields when opted in

### Deviations from plan
**Minor:** The clamp `useEffect` proposed in the task doc was replaced with a `safeIndex` computed value during render. The `useEffect` pattern triggered `react-hooks/set-state-in-effect` lint error (setState called synchronously in effect body). Using a derived `safeIndex = Math.min(currentSectionIndex, totalSections - 1)` achieves identical clamping behavior without the lint issue and without cascading renders.

The bottom nav label correctly uses `safeIndex + 1` (not `visibleSections.findIndex` as suggested in the task doc, since `safeIndex` already indexes into `visibleSections`).

### Standards check
Pass — no `any` types, no unused vars, no `console.log`, all components have prop types, hooks called before returns. TypeScript: zero errors. Lint: zero errors in task-017 files (pre-existing lint errors in unrelated files are unchanged).

### Convention check
Pass — all CLAUDE.md conventions respected: `pnpm` used, no admin client misuse, no hard-coded model IDs, no `"use server"` on utilities, no middleware.ts, no `window.location` in render.

## Notes for Implementation Agent

- `visibleSections` must be derived inside the render function (or as a `useMemo`) using the current `data` object — it is reactive to the user's `includeCiteForge` selection.
- Do not add `condition` to individual CiteForge fields — section-level condition handles both visibility and completion %; field-level conditions on every CiteForge field would be redundant.
- The `getCompletionPercentage` hook update is critical: without it, CiteForge required fields count against the % even when the section is hidden, which would make 100% completion impossible when CiteForge is not opted in.
