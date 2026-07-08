# 120: v2 Customer Profile — Select/Deselect Primary Contact from Desk Contacts + Back-to-List Link

**Created:** 2026-07-08
**Priority:** NORMAL
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Task 119 added a read-only "Desk Contacts" list to the customer profile's Contact tab. Right now the separate "Primary Contact" block above it (`customers.contact_name`/`contact_email`) is blank for almost every customer (see screenshots — "AGL Co" shows "—"/"—" for Primary Contact but has 4 real Desk Contacts underneath), and the v2 Customers list's "Contact" column is blank for the same reason. This task lets a PM pick one Desk Contact as "the" primary contact for a customer directly from the Desk Contacts list, and makes sure that choice shows up everywhere Primary Contact is already displayed.

**Key design decision, resolved by research (not by asking):** "selecting a primary contact" writes into the *existing* `customers.contact_name`/`contact_email` columns — it does **not** introduce a new `is_primary` flag or any schema change. Reasoning: `customers.contact_name` is already read by `src/lib/ai/reply.ts` to personalize AI-generated reply text (`customer?.contact_name ?? "there"`), and `contact_name`/`contact_email` are already the fields shown/edited everywhere (list Contact column, profile Primary Contact block, the existing "Edit" modal, `validateCustomerUpdate`). Introducing a second, parallel "primary" concept on the `contacts` table would fork the source of truth and require updating `reply.ts` and every other consumer for no benefit — "selecting" a Desk contact as primary is just a fast, guided way to fill in fields that were always freely editable. This also means **the v2 Customers list requirement is already satisfied by task 119's existing query** (`page.tsx` already selects `contact_name, contact_email`) — no list-page code changes needed, just confirm it in Acceptance Criteria.

**Real bug found during research, must be fixed for this task to work at all:** `src/lib/customers/validate.ts:72` — `if (body.contact_email !== undefined && body.contact_email.trim())`. When `body.contact_email` is `null` (not `undefined`), this throws `TypeError: Cannot read properties of null (reading 'trim')`. This is not a hypothetical edge case — the *existing* "Edit" modal's save handler already sends exactly this (`contact_email: form.contact_email || null` in `client.tsx`'s `handleSave`, line ~451) whenever a PM saves with the email field blank, which today is true for the vast majority of customers (per the screenshot, ~200/203 show no contact info). "Deselect primary contact" in this task needs to send `contact_email: null` explicitly, so this bug must be fixed first or the deselect action will 500.

## Requirements

- [ ] **Fix `validateCustomerUpdate`** (`src/lib/customers/validate.ts`) so `contact_email: null` (and `contact_name: null`) doesn't throw — treat `null` the same as `undefined`/empty (skip format validation, since an explicit `null` means "clear this field," not "please validate an email").
- [ ] Each row in the profile page's "Desk Contacts" list (task 119) gets a control to set it as the customer's primary contact.
- [ ] The Desk Contact currently matching `customers.contact_email` (case-insensitive) is visually marked as primary, and its control instead offers to *remove* primary status.
- [ ] Setting a contact as primary: `PATCH /api/customers/[customerId]` with `contact_name` = that contact's `first_name + last_name` (trimmed, joined) and `contact_email` = that contact's `email`. Refresh the page data (`router.refresh()`, matching every other save handler already in this file) so Primary Contact section + list (on next visit) reflect it immediately.
- [ ] Removing primary status: same PATCH with both fields set to `null`.
- [ ] **Align the information**: when the current `contact_email` matches a Desk contact, the "Primary Contact" block additionally shows that contact's phone/mobile and title as read-only supplementary fields (resolved client-side from the already-fetched Desk Contacts list — no new column, no extra fetch). When there's no match (manually-typed contact, or none at all), the block behaves exactly as it does today (Name + Email only).
- [ ] Add a "← Back to Customers" link/button at the top of the customer profile page (above the header card), navigating to `/v2/customers` — so a PM doesn't have to use the sidebar nav to leave the profile page.
- [ ] Confirm (no code change expected) that the v2 Customers list's Contact column shows the newly-set primary contact's name/email after the change, since it already reads `customers.contact_name`/`contact_email`.

## Out of Scope / Must-Not-Change

- v1 customer profile page (`src/app/(hub)/customers/[customerId]/client.tsx`) — untouched, matching task 119's established v2-only scope for this thread of work.
- Any schema change — no new columns, no new tables. `contacts` table (task 117) is read-only here, exactly as task 119 left it.
- The 1,427 unmatched Desk contacts (`contacts.customer_id is null`) — still not browsable/assignable from any UI. Separate future task.
- Selecting *multiple* simultaneous primary contacts — only one at a time, matching the existing singular "Primary Contact" concept.
- Any write-back to Zoho Desk itself.
- `src/lib/ai/reply.ts` — reads `contact_name` already; not modified, but its behavior (and any other consumer of `customers.contact_name`/`contact_email`) benefits automatically once this feature starts populating those fields for more customers.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/customers/validate.ts` | Modify | Fix `validateCustomerUpdate`'s `contact_email` check to not crash on explicit `null` (bug found during research, blocks "remove primary"). |
| `src/app/v2/(hub)/customers/[customerId]/client.tsx` | Modify | Add `handleSetPrimaryContact(contact)` / `handleRemovePrimaryContact()` handlers + button UI on each Desk Contacts row; add an `isPrimaryContact(contact)` helper; extend the "Primary Contact" block to show phone/title when matched; add the "← Back to Customers" link above the header card. |

## Code Context

### The bug (`src/lib/customers/validate.ts:71-77`, current)

```ts
// contact_email
if (body.contact_email !== undefined && body.contact_email.trim()) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.contact_email.trim())) {
    errors.contact_email = "Invalid email format";
  }
}
```

Fix — guard against `null` explicitly (the type signature already says `contact_email?: string`, but the real caller sends `string | null`, so treat the runtime reality, not just the stale type):

```ts
// contact_email
if (body.contact_email !== undefined && body.contact_email !== null && body.contact_email.trim()) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.contact_email.trim())) {
    errors.contact_email = "Invalid email format";
  }
}
```

Also update the function's parameter type (`contact_email?: string` → `contact_email?: string | null`) so this matches what's actually sent and TypeScript would have caught it.

### Existing save pattern to model the new handlers on (`client.tsx:437-470`, `handleSave` — do not modify this function, just mirror its shape)

```ts
const handleSave = async () => {
  // ...
  try {
    const res = await fetch(`/api/customers/${customer.customer_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ /* ...fields... */ }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Save failed");
    }
    router.refresh();
  } catch (err) {
    setSaveError(err instanceof Error ? err.message : "Save failed");
  } finally {
    setSaving(false);
  }
};
```

### New handlers (add near the other handlers, e.g. after `handleSave`)

```ts
const [primaryContactSavingId, setPrimaryContactSavingId] = useState<string | null>(null);
const [primaryContactError, setPrimaryContactError] = useState<string | null>(null);

function isPrimaryContact(contact: CustomerDeskContact): boolean {
  return !!customer.contact_email && !!contact.email &&
    customer.contact_email.trim().toLowerCase() === contact.email.trim().toLowerCase();
}

async function patchPrimaryContact(contactName: string | null, contactEmail: string | null) {
  try {
    const res = await fetch(`/api/customers/${customer.customer_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_name: contactName, contact_email: contactEmail }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to update primary contact");
    }
    router.refresh();
  } catch (err) {
    setPrimaryContactError(err instanceof Error ? err.message : "Failed to update primary contact");
  }
}

const handleSetPrimaryContact = async (contact: CustomerDeskContact) => {
  setPrimaryContactSavingId(contact.id);
  setPrimaryContactError(null);
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null;
  await patchPrimaryContact(fullName, contact.email ?? null);
  setPrimaryContactSavingId(null);
};

const handleRemovePrimaryContact = async (contactId: string) => {
  setPrimaryContactSavingId(contactId);
  setPrimaryContactError(null);
  await patchPrimaryContact(null, null);
  setPrimaryContactSavingId(null);
};
```

### Desk Contacts row — add the control (extends task 119's block, `client.tsx`, inside the `deskContacts.map(...)` from the "Desk Contacts" section)

```tsx
{deskContacts.map((c) => {
  const primary = isPrimaryContact(c);
  return (
    <div key={c.id} className={cn("flex items-center gap-3 py-2.5 px-3 rounded-lg border", isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-slate-100 bg-slate-50/50")}>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[13px] font-medium flex items-center gap-1.5", textPrimary)}>
          {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
          {primary && <span className="text-[10px] font-semibold text-brand border border-brand/30 rounded-full px-1.5 py-px">Primary</span>}
        </div>
        {c.title && <div className="text-[11px] text-slate-400 truncate">{c.title}</div>}
      </div>
      <div className="text-[12px] text-slate-500 truncate min-w-0 flex-1">{c.email ?? "—"}</div>
      <div className="text-[12px] text-slate-500 shrink-0">{c.phone ?? c.mobile ?? "—"}</div>
      <button
        onClick={() => (primary ? handleRemovePrimaryContact(c.id) : handleSetPrimaryContact(c))}
        disabled={primaryContactSavingId === c.id}
        className={cn(
          "shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border cursor-pointer transition-colors disabled:opacity-50",
          primary
            ? "text-slate-400 border-slate-200 hover:border-red-300 hover:text-red-500 bg-transparent"
            : "text-brand border-brand/30 hover:bg-brand/5 bg-transparent"
        )}
      >
        {primaryContactSavingId === c.id ? "…" : primary ? "Remove Primary" : "Set as Primary"}
      </button>
    </div>
  );
})}
{primaryContactError && (
  <p className="text-[11px] text-red-500 mt-1.5">{primaryContactError}</p>
)}
```

### Primary Contact block — show phone/title when matched (extends `client.tsx:1735-1750`, the existing `activeSection === "contact"` "Primary Contact" block)

```tsx
{/* Primary Contact */}
{activeSection === "contact" && (
  <div className={sectionCls}>
    <div className={sectionTitleCls}>Primary Contact</div>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-6 gap-y-3">
      {(() => {
        const matched = deskContacts.find((c) => isPrimaryContact(c));
        const fields = [
          { label: "Contact Name", value: customer.contact_name || "—" },
          { label: "Email", value: customer.contact_email || "—" },
        ];
        if (matched) {
          fields.push(
            { label: "Phone", value: matched.phone ?? matched.mobile ?? "—" },
            { label: "Title", value: matched.title ?? "—" },
          );
        }
        return fields.map(({ label, value }) => (
          <div key={label}>
            <div className="text-[11px] text-slate-400 mb-0.5">{label}</div>
            <div className={cn("text-[13px] font-medium", textPrimary)}>{value}</div>
          </div>
        ));
      })()}
    </div>
  </div>
)}
```

Note: this reads `deskContacts`, which is only populated once the tab has been opened (task 119's lazy-fetch) — on first render before the fetch resolves, `matched` will simply be `undefined` and the block falls back to today's Name/Email-only display, which is correct (no flash of wrong data).

### Back-to-Customers link (`client.tsx`, right after the opening of "Page content", before "Header card")

```tsx
{/* Page content */}
<div className="p-6 max-w-5xl mx-auto">
  <button
    onClick={() => router.push(V2_ROUTES.CUSTOMERS)}
    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 hover:text-brand transition-colors bg-transparent border-none cursor-pointer mb-3 p-0"
  >
    <ArrowLeft size={14} /> Back to Customers
  </button>
  {/* Header card — always visible */}
  ...
```

Needs two new imports: `ArrowLeft` from `lucide-react` (join the existing `import { AlertTriangle, Archive } from "lucide-react";`), and `V2_ROUTES` from `@/config/constants` (`V2_ROUTES.CUSTOMERS === "/v2/customers"`, confirmed in `src/config/constants.ts:42`).

## Implementation Steps

1. Fix `src/lib/customers/validate.ts`'s `validateCustomerUpdate` null-handling bug (and its type signature).
2. In `client.tsx`: add `isPrimaryContact()`, `patchPrimaryContact()`, `handleSetPrimaryContact()`, `handleRemovePrimaryContact()`, plus `primaryContactSavingId`/`primaryContactError` state.
3. Add the Set/Remove Primary button to each Desk Contacts row (task 119's block).
4. Extend the Primary Contact block to show phone/title when matched.
5. Add the "← Back to Customers" link + its two imports.
6. `npx tsc --noEmit` and `pnpm lint`.
7. Manual verification per Acceptance Criteria.

## Acceptance Criteria

- [ ] On a customer with Desk Contacts and no current primary, each contact shows "Set as Primary"; clicking one sets `contact_name`/`contact_email`, the page refreshes, and that contact now shows a "Primary" badge and a "Remove Primary" button.
- [ ] Clicking "Remove Primary" clears both fields; the badge disappears and all contacts show "Set as Primary" again. This must not 500 (validates the validate.ts fix).
- [ ] Primary Contact block shows Phone and Title in addition to Name/Email when the current contact_email matches a Desk contact; shows only Name/Email (as today) when it doesn't (manually-typed or empty).
- [ ] Switching to a *different* contact as primary correctly moves the "Primary" badge and updates the Primary Contact block — no stale state.
- [ ] The v2 Customers list (`/v2/customers`) shows the new primary contact's name/email in the Contact column for that customer after the change (confirm via reload — the list is a server component, always fresh).
- [ ] "← Back to Customers" link is visible at the top of every customer profile page and navigates to `/v2/customers`.
- [ ] The existing "Edit" modal's manual Contact Name/Email fields still work exactly as before (this task doesn't change that flow, only adds a faster path to the same fields) — including saving with the email field left blank (this is the exact path the validate.ts bug blocked; must now succeed).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual: localhost:3000/v2/customers/WRQ-CUST-3691 (AGL Co, 4 Desk Contacts per the screenshots)
#   - Set one contact as Primary, confirm badge + Primary Contact block update, confirm Phone/Title appear
#   - Switch primary to a different contact, confirm it moves correctly
#   - Remove primary, confirm it clears without error
#   - Confirm the existing Edit modal still saves fine with contact email blank
#   - Click "Back to Customers", confirm it navigates to /v2/customers
#   - Reload /v2/customers, confirm the Contact column shows the set primary contact's name/email
```

## Compatibility Touchpoints

- None for packaging/docs/install surface — v2 app-route-only UI change plus one validation bugfix, no schema changes.

## Implementation Notes

### What Changed
- `validateCustomerUpdate` (`src/lib/customers/validate.ts`) no longer crashes on explicit `null` for `contact_email` — added a `!== null` guard before `.trim()`, and widened `contact_name`/`contact_email` parameter types to `string | null` to match what's actually sent.
- `client.tsx` gained `isPrimaryContact()`, `patchPrimaryContact()`, `handleSetPrimaryContact()`, `handleRemovePrimaryContact()`, and `primaryContactSavingId`/`primaryContactError` state — all reuse the existing `PATCH /api/customers/[customerId]` route and the same `router.refresh()` pattern every other save handler in this file already uses.
- Each Desk Contacts row (task 119) now shows a "Primary" badge when it matches `customer.contact_email` (case-insensitive), and a "Set as Primary"/"Remove Primary" button that writes the contact's full name + email (or nulls, to remove) into `customers.contact_name`/`contact_email`.
- Primary Contact block now additionally shows Phone and Title, resolved client-side from the matched Desk contact (no new column, no extra fetch — reuses task 119's already-fetched `deskContacts` array).
- Added a "← Back to Customers" link above the header card, using the existing `useRouter`/`router.push` pattern and `V2_ROUTES.CUSTOMERS`.

### Files Changed
- `src/lib/customers/validate.ts` — null-handling bugfix in `validateCustomerUpdate`.
- `src/app/v2/(hub)/customers/[customerId]/client.tsx` — new imports (`ArrowLeft`, `V2_ROUTES`), primary-contact state/handlers, Desk Contacts row button + badge, extended Primary Contact block, Back-to-Customers link.

### Deviations From Plan
- None. Implemented exactly as specced.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS for both changed files (0 new errors/warnings). The 3 pre-existing warnings in `client.tsx` (`AlertTriangle` unused, `zohoPortalId` unused, one `no-unused-expressions`) appear at shifted line numbers only, same as after task 119 — confirmed nothing new by diffing against the untouched v1 copy of the same file.
- Manual/browser verification — CONFIRMED by user: set/remove primary contact works, Primary Contact block reflects phone/title when matched, Back-to-Customers link navigates correctly, and the previously-crashing "clear email" path (the validate.ts bugfix) no longer errors.
