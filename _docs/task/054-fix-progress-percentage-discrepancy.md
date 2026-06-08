# Task 054 — Fix Progress Percentage Discrepancy (Product Forms vs Customers Table)

> **Priority:** HIGH
> **Type:** patch
> **Recommended Model:** haiku
> **Status:** TESTING
> **Completed:** 2026-06-04
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Goal

Eliminate the discrepancy between the progress `%` shown in the Customers table and the actual completion state of onboarding forms. There are currently three divergent implementations that compute "completion" from the same schema + data; unify them into a single pure utility and ensure every display site uses it consistently.

---

## Background

Three separate functions compute form completion — `getCompletionPercentage` (hook), `getMissingFields` (clients-tab), and `getIncompleteSections` (onboarding-schemas) — each with slightly different logic. The Customers table `%` bar reads the stale `completed_percentage` DB column, while the "⚠ N fields missing" count re-derives from `onboarding_data` live, so they can disagree by the 2-second auto-save debounce or by conditional-field state changes. Additionally, `getIncompleteSections` uses raw `!==` for condition comparisons while the other two use `String()` coercion.

**Decisions made during planning:**
1. Utility location: `onboarding-schemas.ts` (pure function, usable anywhere)
2. Customers table `%` bar: re-compute live from `onboarding_data` (same source as missing-fields count) — DB column is write-cache only for this view
3. Explicit submit hardcodes 100%: keep as-is (intentional declaration)

---

## Requirements

1. Extract a pure `computeCompletionPercentage(schema: FormSchema, data: Record<string, unknown>): number` function into `src/config/onboarding-schemas.ts` — copy the logic from `getCompletionPercentage` in `use-onboarding-form.ts` (uses `String()` coercion for conditions).
2. Update `getIncompleteSections` in `onboarding-schemas.ts` (lines 615–632) to use `String()` coercion for condition comparisons, matching the hook's logic.
3. Update `use-onboarding-form.ts` — replace the inline `getCompletionPercentage` implementation with a call to the new shared utility.
4. Update `clients-tab.tsx` — replace `avgPct` (which reads `completed_percentage` from DB) with a live-computed average using `computeCompletionPercentage` over each product's `onboarding_data`. The local `getMissingFields` function can remain or be unified — out of scope, but the `%` bar must use the new utility.
5. No change to `form-engine.tsx` — `completedPercentage: 100` on explicit submit is intentional.

---

## File Changes

| File | Action | Detail |
|------|--------|--------|
| `src/config/onboarding-schemas.ts` | Modify | Add `computeCompletionPercentage(schema, data)` export; fix `String()` coercion in `getIncompleteSections` |
| `src/hooks/use-onboarding-form.ts` | Modify | Replace inline `getCompletionPercentage` body with call to `computeCompletionPercentage(schema, data)` |
| `src/components/hub/pm-tabs/clients-tab.tsx` | Modify | Replace `avgPct` DB-read with live `computeCompletionPercentage` per product, averaged |

---

## Code Context

### 1. `getCompletionPercentage` — current implementation (to extract as pure function)

`src/hooks/use-onboarding-form.ts:35–74`

```ts
const getCompletionPercentage = useCallback((): number => {
  const requiredFields: FormField[] = [];
  for (const section of schema.sections) {
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
  if (requiredFields.length === 0) return 100;
  let completed = 0;
  for (const field of requiredFields) {
    const value = data[field.name];
    if (value !== undefined && value !== null && value !== "") {
      if (Array.isArray(value) && value.length === 0) continue;
      completed++;
    }
  }
  return (completed / requiredFields.length) * 100;
}, [data, schema.sections]);
```

Extract the body as a pure function — takes `schema: FormSchema` and `data: Record<string, unknown>`, returns `number`. Hook calls `getCompletionPercentage = useCallback(() => computeCompletionPercentage(schema, data), [data, schema])`.

### 2. `getIncompleteSections` — current implementation (needs String() coercion fix)

`src/config/onboarding-schemas.ts:615–633`

```ts
export function getIncompleteSections(productName: string, onboardingData: Record<string, unknown>): string[] {
  const schema = getOnboardingSchema(productName);
  if (!schema) return [];
  return schema.sections
    .filter((section) => {
      if (section.condition) {
        // BUG: raw !== instead of String() coercion
        if (onboardingData[section.condition.field] !== section.condition.value) return false;
      }
      return section.fields.some((field) => {
        if (!field.required) return false;
        if (field.condition) {
          // BUG: raw !== instead of String() coercion
          if (onboardingData[field.condition.field] !== field.condition.value) return false;
        }
        const v = onboardingData[field.name];
        return !v || (typeof v === "string" && v.trim() === "");
      });
    })
    .map((s) => s.title);
}
```

Fix lines 621 and 626: change `!==` to `String(x) !== String(y)` to match hook behavior.

### 3. `avgPct` in Customers table — current DB-cached read (to replace with live compute)

`src/components/hub/pm-tabs/clients-tab.tsx:106–108`

```ts
const avgPct = prods.length > 0
  ? Math.round(prods.reduce((sum, p) => sum + (p.completed_percentage ?? 0), 0) / prods.length)
  : 0;
```

Replace with:
```ts
const avgPct = prods.length > 0
  ? Math.round(
      prods.reduce((sum, p) => {
        const schema = getOnboardingSchema(p.product_name);
        if (!schema) return sum + (p.completed_percentage ?? 0);
        return sum + computeCompletionPercentage(schema, (p.onboarding_data as Record<string, unknown>) ?? {});
      }, 0) / prods.length
    )
  : 0;
```

`getOnboardingSchema` is already imported at line 9.

### 4. `form-engine.tsx` — hardcoded 100 on submit (do NOT change)

`src/components/onboarding/form-engine.tsx:76`

```ts
body: JSON.stringify({ data, completedPercentage: 100, explicitSubmit: true }),
```

Intentional — explicit submit is treated as a declaration of completeness.

---

## Implementation Steps

1. **`onboarding-schemas.ts`** — Add `computeCompletionPercentage` export above `getIncompleteSections`:
   - Pure function with signature `(schema: FormSchema, data: Record<string, unknown>): number`
   - Body is the extracted logic from the hook (no `useCallback`, no closure over state)
   - Import `FormSchema` and `FormField` types if not already in scope (they live in this same file or `src/types/onboarding.ts`)

2. **`onboarding-schemas.ts`** — Fix `getIncompleteSections` condition comparisons:
   - Line 621: `if (String(onboardingData[section.condition.field]) !== String(section.condition.value)) return false;`
   - Line 626: `if (String(onboardingData[field.condition.field]) !== String(field.condition.value)) return false;`

3. **`use-onboarding-form.ts`** — Update import and usage:
   - Add `computeCompletionPercentage` to the import from `@/config/onboarding-schemas`
   - Replace the `getCompletionPercentage` body with: `return computeCompletionPercentage(schema, data);`
   - Keep the `useCallback` wrapper for memoization

4. **`clients-tab.tsx`** — Update `avgPct` to live-compute:
   - Add `computeCompletionPercentage` to the import from `@/config/onboarding-schemas`
   - Replace the `avgPct` computation per the snippet in Code Context §3 above

5. **Verify** — TypeScript check: `npx tsc --noEmit`. No new type errors expected.

---

## Notes for Implementation Agent

- `computeCompletionPercentage` must be a pure function (no React hooks, no closures). The hook wrapper remains for memoization only.
- The `FormSchema` and `FormField` types are already imported/defined in `onboarding-schemas.ts` — no new imports needed for the extracted function.
- `clients-tab.tsx` already imports `getOnboardingSchema` (line 9) — just add `computeCompletionPercentage` to the same import.
- If `getOnboardingSchema` returns `null` for an unknown product name, fall back to `p.completed_percentage ?? 0` in the `avgPct` reducer (as shown in the Code Context snippet) — this is a safe no-op fallback.
- Do NOT touch `form-engine.tsx` — the hardcoded 100 on explicit submit is intentional.
- Do NOT change the `getMissingFields` local function in `clients-tab.tsx` — out of scope.
- This task does NOT require a database migration. `completed_percentage` column remains; it is just no longer used as the source for the `%` bar in `clients-tab.tsx`.
