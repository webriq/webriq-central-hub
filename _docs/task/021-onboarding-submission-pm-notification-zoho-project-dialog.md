# 021: Onboarding Submission Flow — PM Notification, Zoho Project Dialog & Status Transitions

**Created:** 2026-05-22
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-05-22

> **Recommended Model:** sonnet — cross-cutting change spanning DB migration, 2 API routes, Zoho lib, form engine (public), and customer profile UI (hub). Introduces a new intermediate status, a PM-facing creation dialog with name generation, and removes a live DB column used by the webhook route.

---

## Overview

Re-design the onboarding completion flow to separate **client submission** from **Zoho project creation**, giving the PM full control over project naming before anything is created in Zoho.

**Current (broken) flow:**
- Client clicks "Complete Onboarding" → `completedPercentage: 100` PATCH → auto-transitions customer to `active` + auto-creates Zoho project with a hardcoded name.

**Target flow:**
1. Client clicks **"Submit"** → PATCH with `completedPercentage: 100` → customer transitions to `completed_onboarding`, Cliq notification fires.
2. PM sees the customer flagged in the Hub, opens the customer profile, reviews submissions.
3. PM clicks **"Create Zoho Projects"** → dialog opens with one name field per product. PM enters or generates project names. Clicking "Create Project(s)" calls the new API.
4. API creates N Zoho projects (skipping blanks), stores `zoho_project_id` per product row, transitions customer to `active`.
5. Customer profile now shows clickable Zoho project links under each product.

Also: remove `zoho_account_id` from the `customers` table (no Zoho customer accounts exist — the Hub uses its own OAuth identity).

---

## Requirements

### 1. Form Engine — Button Rename
- [ ] Change `"Complete Onboarding ✓"` → `"Submit ✓"` in the bottom-nav button (`form-engine.tsx:205`)
- [ ] Change the completion-screen heading from `"Onboarding Complete"` → `"Form Submitted"` (`form-engine.tsx:113`)

### 2. DB Migration — New Status + Drop Column
- [ ] New migration `010_completed_onboarding_status.sql`:
  - Drop existing `customers_status_check` constraint
  - Add new constraint: `CHECK (status in ('active', 'inactive', 'onboarding', 'completed_onboarding'))`
  - `ALTER TABLE customers DROP COLUMN zoho_account_id;`

### 3. Type Updates
- [ ] `src/types/hub.ts` — add `"completed_onboarding"` to `CustomerStatus`
- [ ] `src/types/database.ts` — update `customers` Row/Insert/Update types to add `completed_onboarding` to the status union and remove `zoho_account_id`

### 4. Onboarding PATCH Route — New Completion Trigger
- [ ] When all products are `onboarding_complete`, transition customer to `"completed_onboarding"` (not `"active"`)
- [ ] Remove automatic `createZohoProject()` call from this route
- [ ] Fire `sendCliqNotification()` with message: `"✅ {company_name} has completed all onboarding forms. Ready for Zoho project creation."`
- [ ] Entire block is non-fatal — catch errors, log them, never fail the PATCH response

### 5. New API Route — PM-Initiated Zoho Project Creation
- [ ] `POST /api/customers/[customerId]/zoho-projects`
- [ ] Body: `{ projects: Record<string, string> }` — product name → project name (empty string = skip)
- [ ] Validate: if all values are empty strings → `400 { error: "At least one project name is required" }`
- [ ] For each non-empty entry: call `createZohoProject(customerId, projectName)` and store returned ID in `customer_products.zoho_project_id` for that product
- [ ] After all projects created: update `customers.status = "active"`
- [ ] Return `{ created: Record<string, string> }` — product name → zoho project ID (only successfully created ones)
- [ ] Uses `adminClient` — no session (hub server route calling Zoho on behalf of PM)

### 6. Customer Profile UI
- [ ] **Status badge**: add `completed_onboarding` → `bg-amber-50 text-amber-600` with label `"Completed Onboarding"` in `statusClass` map
- [ ] **Status dropdown** in Edit modal: add `"completed_onboarding"` option with label `"Completed Onboarding"`
- [ ] **"Create Zoho Projects" button**: render in the header action row when `status === "completed_onboarding"`. Style: `bg-green-500 text-white` rounded-full, next to the existing "Edit" button
- [ ] **Zoho Project Creation dialog** (inline modal, same pattern as existing modals):
  - Header: "Create Zoho Projects for {company_name}"
  - Body: one row per product. Each row has:
    - Product name label (with product color dot)
    - Text input for project name (placeholder: `e.g. Acme Content Site`)
    - **"Generate" button** (small, ghost) that auto-fills the input with the predefined default name (client-side only, no API call). See name generation rules below.
  - **"Generate All"** button above the fields — fills all empty inputs with defaults
  - Error message area (shown when all fields are empty on submit)
  - Footer: "Cancel" + **"Create Project(s)"** button (disabled while loading)
- [ ] **Project name generation rules** (client-side):
  - StackShift → `"{company_name} App"`
  - PublishForge → `"{company_name} Content Site"`
  - PipelineForge → `"{company_name} Pipeline"`
- [ ] **Zoho project link**: in each product card, replace the raw ID display with a clickable external link:
  ```
  <a href={`https://projects.zoho.com/portal/${portalId}/projects/${product.zoho_project_id}/`} target="_blank">
    Zoho Project →
  </a>
  ```
  Since `ZOHO_PORTAL_ID` is server-side only, render the link via `zoho_project_id` with a static base URL passed as a prop from the server component — or simply link to `https://projects.zoho.com` with a note when `ZOHO_PORTAL_ID` is unknown client-side (see Notes).
- [ ] **Remove `"Zoho Account ID"` row** from the Contact Information section (`client.tsx:629`)

### 7. Webhook Route — Remove zoho_account_id Lookup
- [ ] In `resolveCustomerId()`, remove the `zoho_desk` branch that queries `customers.zoho_account_id` — the column no longer exists. Replace with a `return null` or log a note that Zoho Desk → customer linking via account ID is no longer supported.

### 8. PM Dashboard — Completed Onboarding Indicator
- [ ] In the customers list/tab, customers with `status === "completed_onboarding"` should be visually distinct (amber badge consistent with the profile page). The existing status badge rendering already defers to `statusClass` — so updating `hub.ts` and `client.tsx` propagates automatically if the same mapping is reused. Confirm the PM customers tab uses the same status styling.

---

## Implementation Notes

### Zoho project link — portal ID client-side
`ZOHO_PORTAL_ID` is a server-only env var. Two options:
1. **Pass from server component** — `page.tsx` already fetches the customer; add `process.env.ZOHO_PORTAL_ID ?? ""` to the props passed to `CustomerProfileClient`. Preferred.
2. **Fallback** — if empty, still render the project ID as plain text (current behavior).

Go with option 1: add `zohoPortalId: string` prop to `CustomerProfileClientProps`, pass from `page.tsx`.

### DB CHECK constraint alteration (PostgreSQL)
PostgreSQL doesn't allow `ALTER CONSTRAINT` to change the check expression. Use:
```sql
ALTER TABLE customers DROP CONSTRAINT customers_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_status_check
  CHECK (status in ('active', 'inactive', 'onboarding', 'completed_onboarding'));
```
The constraint name in migration 001 is implicitly `customers_status_check` (Postgres auto-names it). Verify exact name first with: `\d customers` or query `pg_constraint`.

### Webhook route impact
The `zoho_desk` lookup path in `webhooks/route.ts:25–31` will throw a PostgREST error once `zoho_account_id` is dropped. Update the `if (source === "zoho_desk" ...)` branch to `return null` immediately (Zoho Desk ticket → customer resolution is not currently in use since no customers have `zoho_account_id` populated).

### Cliq notification timing
`sendCliqNotification()` is already implemented in `src/lib/zoho/index.ts:73–89`. It silently no-ops if `ZOHO_CLIQ_WEBHOOK_URL`/`ZOHO_CLIQ_WEBHOOK_TOKEN` are unset. Call it inside the existing try/catch in the onboarding PATCH route (same non-fatal block).

### "Create Zoho Projects" dialog — state pattern
Follow the same inline modal pattern used throughout `client.tsx` (no external dialog library needed). State variables:
```ts
const [zohoDialogOpen, setZohoDialogOpen] = useState(false);
const [zohoProjectNames, setZohoProjectNames] = useState<Record<string, string>>({});
const [zohoCreating, setZohoCreating] = useState(false);
const [zohoError, setZohoError] = useState<string | null>(null);
const [zohoSuccess, setZohoSuccess] = useState(false);
```
On success, close the dialog and call `router.refresh()` — the page will reload with updated product `zoho_project_id` values and `status === "active"`.

### Customer status in Edit modal
The existing status dropdown in the Edit Customer modal currently has 3 options (`onboarding`, `active`, `inactive`). Add `completed_onboarding` as a 4th option so PMs can manually set/revert it.

---

## Out of Scope / Must-Not-Change

- Do not add a full in-app notification inbox (toast/bell icon system) — Cliq notification is sufficient for Sprint 2
- Do not change the `createZohoProject()` function signature in `src/lib/zoho/index.ts`
- Do not modify any other API routes beyond the two listed
- Do not git commit — user manages version control

---

## Proposed File Changes

| File | Action | Purpose |
|------|---------|---------|
| `supabase/migrations/010_completed_onboarding_status.sql` | Create | Add `completed_onboarding` to status CHECK; drop `zoho_account_id` column |
| `src/types/hub.ts` | Modify | Add `"completed_onboarding"` to `CustomerStatus` |
| `src/types/database.ts` | Modify | Sync `customers` Row/Insert/Update types with schema changes |
| `src/components/onboarding/form-engine.tsx` | Modify | Rename button "Submit ✓", rename completion heading "Form Submitted" |
| `src/app/api/customers/[customerId]/products/[productName]/onboarding/route.ts` | Modify | Transition to `completed_onboarding` + Cliq notification; remove auto Zoho creation |
| `src/app/api/customers/[customerId]/zoho-projects/route.ts` | Create | PM-triggered bulk Zoho project creation endpoint |
| `src/app/(hub)/customers/[customerId]/page.tsx` | Modify | Pass `zohoPortalId` prop to client component |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | New status badge, Create Zoho Projects button + dialog, project links, remove `zoho_account_id` display |
| `src/app/api/webhooks/route.ts` | Modify | Remove `zoho_account_id` lookup from `resolveCustomerId()` |

---

## Code Context

### `form-engine.tsx:198–211` — button to rename

```tsx
<button
  onClick={handleNext}
  className={cn(
    "font-[inherit] py-2.5 px-5 text-white text-[13px] font-semibold border-none rounded-full cursor-pointer transition-opacity hover:opacity-90",
    isLastSection ? "bg-brand-orange" : "bg-brand"
  )}
>
  {isLastSection ? "Complete Onboarding ✓" : "Continue →"}  {/* → "Submit ✓" */}
</button>
```

### `form-engine.tsx:105–118` — completion screen heading to rename

```tsx
if (isCompleted) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
      ...
      <h2 className="text-2xl font-bold text-slate-900 mb-3 text-center">Onboarding Complete</h2>
      {/* → "Form Submitted" */}
      ...
    </div>
  );
}
```

### `onboarding/route.ts:49–89` — full completion trigger block to replace

```ts
if (isComplete) {
  try {
    const { data: allProducts } = await adminClient
      .from("customer_products")
      .select("onboarding_complete, zoho_project_id")
      .eq("customer_id", customerId);

    const allDone = allProducts?.every(p => p.onboarding_complete) ?? false;

    if (allDone) {
      await adminClient
        .from("customers")
        .update({ status: "active" })            // → "completed_onboarding"
        .eq("customer_id", customerId);

      // Remove entire Zoho project creation block
      if (!data.zoho_project_id) { ... }

      // Add: sendCliqNotification(...)
    }
  } catch (completionErr) {
    console.error("PATCH onboarding completion trigger error:", completionErr);
  }
}
```

**Replace with:**
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
        .select("company_name")
        .eq("customer_id", customerId)
        .single();

      await adminClient
        .from("customers")
        .update({ status: "completed_onboarding" })
        .eq("customer_id", customerId);

      const { sendCliqNotification } = await import("@/lib/zoho");
      await sendCliqNotification(
        `✅ ${customer?.company_name ?? customerId} has completed all onboarding forms. Ready for Zoho project creation.`
      );
    }
  } catch (completionErr) {
    console.error("PATCH onboarding completion trigger error:", completionErr);
  }
}
```

### `client.tsx:17–24` — statusClass map to extend

```ts
const statusClass = (status: string) => {
  const map: Record<string, string> = {
    onboarding: "bg-[#FFF4EC] text-orange-500",
    active: "bg-green-50 text-green-600",
    inactive: "bg-slate-100 text-slate-500",
    // Add:
    completed_onboarding: "bg-amber-50 text-amber-600",
  };
  return map[status] ?? "bg-slate-100 text-slate-500";
};
```

### `client.tsx:629` — Contact Information row to remove

```tsx
{ label: "Zoho Account ID", value: customer.zoho_account_id || "—", mono: true },
// Remove this entry entirely
```

### `client.tsx:597–619` — Header action buttons — where to inject "Create Zoho Projects"

```tsx
<div className="flex gap-2.5 flex-wrap">
  <button onClick={handleOpenEdit} ...>Edit</button>
  {/* Add here when status === "completed_onboarding": */}
  {status === "completed_onboarding" && (
    <button
      onClick={() => setZohoDialogOpen(true)}
      className="font-[inherit] py-2 px-4 bg-green-500 text-white text-xs font-semibold border-none rounded-full cursor-pointer hover:opacity-90 transition-opacity"
    >
      Create Zoho Projects
    </button>
  )}
  <button onClick={handleCopyLink} ...>Copy Onboarding Link</button>
</div>
```

### `webhooks/route.ts:25–31` — lookup to remove

```ts
if (source === "zoho_desk" && payload.accountId) {
  const { data } = await adminClient
    .from("customers")
    .select("customer_id")
    .eq("zoho_account_id", payload.accountId)   // column dropped
    .maybeSingle();
  return data?.customer_id ?? null;
}
// Replace with:
if (source === "zoho_desk") {
  return null; // zoho_account_id column removed — Desk ticket linking not yet implemented
}
```

### New API route skeleton — `zoho-projects/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createZohoProject } from "@/lib/zoho";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params;
  const body = await request.json();
  const projects: Record<string, string> = body.projects ?? {};

  const entries = Object.entries(projects).filter(([, name]) => name.trim() !== "");
  if (entries.length === 0) {
    return NextResponse.json({ error: "At least one project name is required" }, { status: 400 });
  }

  const created: Record<string, string> = {};
  for (const [productName, projectName] of entries) {
    const zohoId = await createZohoProject(customerId, projectName.trim());
    if (zohoId) {
      await adminClient
        .from("customer_products")
        .update({ zoho_project_id: zohoId })
        .eq("customer_id", customerId)
        .eq("product_name", productName);
      created[productName] = zohoId;
    }
  }

  await adminClient
    .from("customers")
    .update({ status: "active" })
    .eq("customer_id", customerId);

  return NextResponse.json({ created });
}
```

---

## Implementation Steps

1. **Migration** — create `supabase/migrations/010_completed_onboarding_status.sql`. Drop old status CHECK, add new one with `completed_onboarding`. Drop `zoho_account_id` column.

2. **Types** — update `hub.ts` (`CustomerStatus`) and `database.ts` (customers Row/Insert/Update).

3. **Form engine** — rename button text and completion heading in `form-engine.tsx`.

4. **Onboarding PATCH route** — replace the `if (isComplete)` completion block to transition to `completed_onboarding` and fire Cliq notification. Remove Zoho project creation from this route.

5. **Webhook route** — replace the `zoho_desk` lookup block with `return null`.

6. **New API route** — create `src/app/api/customers/[customerId]/zoho-projects/route.ts` using the skeleton above.

7. **Server component** — in `page.tsx`, pass `zohoPortalId={process.env.ZOHO_PORTAL_ID ?? ""}` as a prop to `CustomerProfileClient`.

8. **Client UI** — update `client.tsx`:
   - Add `zohoPortalId: string` to `CustomerProfileClientProps`
   - Add `completed_onboarding` to `statusClass` map
   - Add `completed_onboarding` option to the Edit modal status dropdown
   - Add Zoho dialog state variables
   - Add "Create Zoho Projects" button in the header (conditional on status)
   - Add the Zoho Project Creation dialog modal (with per-product name inputs, generate buttons, generate-all, validation, submit handler)
   - In each product card, replace raw `zoho_project_id` text with a clickable Zoho link when `zohoPortalId` is non-empty
   - Remove the `"Zoho Account ID"` entry from the Contact Information section
