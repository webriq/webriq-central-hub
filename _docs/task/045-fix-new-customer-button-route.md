# Task 045 — Fix "+ New Customer" Button Route

> **Status:** TESTING
> **Completed:** 2026-06-02
> **Type:** bugfix
> **Priority:** high
> **Version Impact:** patch
> **Recommended Model:** haiku

## Problem

The "+ New Customer" button in the Customers tab redirects to `/onboarding`, which does not exist in the `(hub)` route group, producing a 404. The correct destination is `/customers/new`, which exists and has proper role protection.

## Expected Behavior

Clicking "+ New Customer" navigates to `/customers/new` (the `NewCustomerPage` with `requireRole` guard).

## Implementation Steps

1. Open `src/components/hub/pm-tabs/clients-tab.tsx`
2. On line 219, change `router.push("/onboarding")` → `router.push("/customers/new")`
3. Optionally import `ROUTES` from `@/config/constants` and use `ROUTES.CUSTOMERS_NEW` for consistency — only if `ROUTES` is not already imported; do not add an import just for this one constant if it would be the only usage.

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/components/hub/pm-tabs/clients-tab.tsx` | Modify | Line 219: fix route from `/onboarding` → `/customers/new` |

## Code Context

```tsx
// src/components/hub/pm-tabs/clients-tab.tsx  (lines 218–223)
<button
  onClick={() => router.push("/onboarding")}   // ← BUG: should be "/customers/new"
  className="text-xs font-semibold text-white bg-(--c-orange) rounded-[9px] px-4.5 py-2.25 cursor-pointer border-0"
>
  + New Customer
</button>
```

Destination page exists and is correctly protected:
```ts
// src/app/(hub)/customers/new/page.tsx
export default async function NewCustomerPage() {
  await requireRole("/customers/new");   // role-access: allowed: ["pm", "admin"]
  return <NewCustomerContent />;
}
```

Route constant for reference:
```ts
// src/config/constants.ts line 11
CUSTOMERS_NEW: "/customers/new",
```

## Notes for Implementation Agent

- Single-line fix. No new imports needed — `router` is already wired.
- Do not touch any other routing logic or the `requireRole` call in the page.
- Verify the fix visually by confirming the button click lands on `/customers/new` and not a 404.
