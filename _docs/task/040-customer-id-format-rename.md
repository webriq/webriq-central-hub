# Task 040 — Customer ID Format: WRQ-CLIENT- → WRQ-CUST-

> **Type:** patch
> **Priority:** NORMAL
> **Recommended Model:** haiku
> **Status:** TESTING
> **Completed:** 2026-06-02
> **Implementation Notes:** Two string replacements + JSDoc updated in generate-id.ts. Pre-implementation step (delete 3 test customers in Supabase dashboard) must be done manually before creating new customers — otherwise old WRQ-CLIENT- records coexist with new WRQ-CUST- ones.

## Problem

Customer IDs are currently generated as `WRQ-CLIENT-XXXX` (e.g. `WRQ-CLIENT-0FAA`). Since the app-wide terminology is being standardised to "Customer" (not "Client"), the ID prefix is inconsistent.

This is the right time to fix it — dev phase only, 3 test records, no live data.

## Goal

- Change generated ID format from `WRQ-CLIENT-XXXX` → `WRQ-CUST-XXXX`
- Clear the 3 test customers (and all cascaded child records) before the code change goes in

## Pre-Implementation Step (Manual — do before running /implement)

Delete the 3 test customers directly in the Supabase dashboard (Table Editor → `customers` → delete all rows). The `ON DELETE CASCADE` FK constraints will automatically wipe all child records across:

- `customer_products`
- `classification_records`
- `requirements_assessments`
- `implementation_plans`
- `execution_records`
- `reply_drafts`
- `llm_invocation_logs`
- `digest_logs`

No migration script needed.

## Implementation Steps

### Step 1 — Update generate-id.ts

**File:** `src/lib/customers/generate-id.ts`

Two changes — the prefix string and the fallback:

```ts
// L16: change
const customerId = `WRQ-CLIENT-${suffix}`;
// to:
const customerId = `WRQ-CUST-${suffix}`;

// L41: change
return `WRQ-CLIENT-${suffix}`;
// to:
return `WRQ-CUST-${suffix}`;
```

Also update the JSDoc comment on L4:
```ts
// change:
 * Generates a unique customer ID in WRQ-CLIENT-XXXX format.
// to:
 * Generates a unique customer ID in WRQ-CUST-XXXX format.
```

That's the entire code change.

---

## File Changes

| File | Action |
|------|--------|
| `src/lib/customers/generate-id.ts` | Replace `WRQ-CLIENT-` with `WRQ-CUST-` (2 occurrences + JSDoc) |

---

## Code Context

### generate-id.ts — full file (29 lines)
```ts
import { createClient } from "@/lib/supabase/server";

/**
 * Generates a unique customer ID in WRQ-CLIENT-XXXX format.
 * Uses crypto.randomUUID() → first 4 alphanumeric chars → uppercase.
 * Checks uniqueness against the customers table, retries up to 5 times on collision.
 */
export async function generateCustomerId(): Promise<string> {
  const supabase = await createClient();
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const raw = crypto.randomUUID().replace(/-/g, "");
    const suffix = raw.slice(0, 4).toUpperCase();
    const customerId = `WRQ-CLIENT-${suffix}`;  // ← change to WRQ-CUST-

    const { data, error } = await supabase
      .from("customers")
      .select("customer_id")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (error) { console.error("generateCustomerId: DB check failed", error); continue; }
    if (!data) { return customerId; }
    console.warn(`generateCustomerId: collision on ${customerId}, attempt ${attempt + 1}/${MAX_RETRIES}`);
  }

  const raw = crypto.randomUUID().replace(/-/g, "");
  const suffix = raw.slice(0, 6).toUpperCase();
  return `WRQ-CLIENT-${suffix}`;  // ← change to WRQ-CUST-
}
```

---

## Notes for Implementation Agent

- Haiku: single-file, two string replacements + one JSDoc line.
- The pre-implementation DB wipe is manual (user does it in Supabase dashboard before this task runs). Do NOT add a migration file — Option B was chosen precisely to avoid a 7-table migration.
- After implementing, verify by creating a new test customer and confirming the generated ID starts with `WRQ-CUST-`.
