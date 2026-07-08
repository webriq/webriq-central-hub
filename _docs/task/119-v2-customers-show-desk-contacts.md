# 119: v2 Customers — Show Matched Zoho Desk Contacts (List + Profile)

**Created:** 2026-07-08
**Priority:** NORMAL
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Task 117 built a one-time Zoho Desk contacts import: `contacts` table, matched to `customers` via normalized Desk account name (200 matched, 1,427 unmatched as a review queue), data-only — no UI. This task surfaces the **matched** contacts (`contacts.customer_id is not null`) in the v2 Customers UI:

1. A lightweight count indicator on the v2 Customers list (`/v2/customers`), so a PM can see at a glance which customers have Desk contacts on file.
2. A full "Desk Contacts" list on the customer profile page's existing **Contact** tab, alongside (not replacing) the existing manually-entered Primary Contact fields — Primary Contact and Desk Contacts are different data sources (hand-entered vs. imported-and-matched) and should stay visually distinct.

Decisions made with the user before writing this spec:
- **v2 only.** The v1 Customers list (`src/app/(hub)/dashboard/customers/_content.tsx`) is a structurally different, pre-task-116 component — not a simple mirror like the profile page was for task 118. v1 is untouched by this task, list and profile both.
- **Display-only.** Shows the 200 already-matched contacts. The 1,427 unmatched contacts (`customer_id is null`) stay in the DB as a future follow-up task (a manual-assignment UI) — out of scope here.

## Requirements

- [ ] `/v2/customers` list: each row shows how many matched Desk contacts that customer has (0 shows nothing — no clutter for the common case).
- [ ] Customer profile page (`/v2/customers/[customerId]`), **Contact** tab: a new "Desk Contacts" section lists every matched contact's name, title (if present), email, and phone/mobile — below the existing "Primary Contact" block, not replacing it.
- [ ] Desk Contacts section shows a loading state while fetching and a clear empty state ("No Desk contacts matched to this customer yet.") when there are none — do not show an error for the empty case, it's an expected, common state (only 200 of 203 customers... actually only a subset of the 203 customers have any matched contact at all, since 200 contacts don't map 1:1 to 203 customers).
- [ ] New endpoint respects the same staff-only access as the underlying `contacts` RLS policy (`contacts_staff_read`: admin/super_admin/pm/developer) — no manual role-filtering code needed, unlike the Assets endpoint, since `contacts` already has RLS for this.

## Out of Scope / Must-Not-Change

- v1 Customers pages (list or profile) — untouched.
- The 1,427 unmatched Desk contacts (`contacts.customer_id is null`) — no UI to view, search, or manually assign them. Separate future task.
- Editing, deleting, or re-matching contacts from this UI — display-only, matching task 117's decision.
- The existing "Primary Contact" fields (`customers.contact_name`/`contact_email`) and their edit form — unchanged, untouched, stays the authoritative manually-entered contact.
- `customer_products`/Realtime progress overlay, project count, search/filter/pagination — all already correct from task 116, not touched by this task except to add one more scoped lookup query alongside the existing `projectCount`/`productsByCustomer` ones.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/customers/[customerId]/contacts/route.ts` | Create | `GET` — session-scoped Supabase client (RLS handles staff-only access), returns matched `contacts` rows for this customer. |
| `src/app/v2/(hub)/customers/page.tsx` | Modify | Add a `contacts` count query scoped to the current page's `customer_id`s (same pattern as the existing `projectCount`/`productsByCustomer` lookups), pass `desk_contact_count` through `CustomerListItem`. |
| `src/app/v2/(hub)/customers/_customers-index.tsx` | Modify | Add `desk_contact_count: number` to the `CustomerListItem` type; render a small secondary line under the existing Contact column when `desk_contact_count > 0`. |
| `src/app/v2/(hub)/customers/[customerId]/client.tsx` | Modify | Add `deskContacts`/`deskContactsLoading`/`hasFetchedDeskContactsRef` state (mirrors the existing Assets pattern exactly); lazy-fetch on `activeSection === "contact"`; render a new "Desk Contacts" list block inside the existing `activeSection === "contact"` section, below Primary Contact. |

## Code Context

### `contacts` table shape (post task-117, migration 058 rename — see `src/types/database.ts`'s `contacts` block)

Relevant columns for this task: `id`, `customer_id` (FK to `customers.customer_id`, only non-null rows are shown here), `first_name`, `last_name`, `email`, `secondary_email`, `phone`, `mobile`, `title`. RLS (`supabase/migrations/056_contacts_table.sql`):

```sql
create policy "contacts_staff_read"
  on contacts for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
```

This means a plain session-scoped `createClient()` query against `contacts` already enforces the right access — no manual `allowed_roles`-style filtering like `src/app/api/customers/[customerId]/assets/route.ts` needs (that route filters manually because per-row asset visibility isn't RLS-based, per task 118's explicit decision). This route can be simpler.

### New route: `src/app/api/customers/[customerId]/contacts/route.ts` (model on the Assets route's auth shape, simplify the query)

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  const { data, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, secondary_email, phone, mobile, title")
    .eq("customer_id", customerId)
    .order("last_name");

  if (error) {
    console.error("GET /api/customers/[customerId]/contacts error:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
```

### List page: existing scoped-lookup pattern to extend (`src/app/v2/(hub)/customers/page.tsx:41-59`)

```ts
const projectCount = new Map<string, number>();
const productsByCustomer = new Map<string, CustomerListItem["customer_products"]>();

if (pageCustomerIds.length > 0) {
  const [projectsRes, productsRes] = await Promise.all([
    supabase.from("projects").select("customer_id").in("customer_id", pageCustomerIds),
    supabase.from("customer_products").select("id,customer_id,product_name,completed_percentage").in("customer_id", pageCustomerIds),
  ]);
  // ... populate maps
}
```

Add a third parallel query, same shape:

```ts
const contactCountByCustomer = new Map<string, number>();
// inside the same Promise.all — add:
supabase.from("contacts").select("customer_id").in("customer_id", pageCustomerIds).not("customer_id", "is", null),
// then:
for (const row of contactsRes.data ?? []) {
  contactCountByCustomer.set(row.customer_id, (contactCountByCustomer.get(row.customer_id) ?? 0) + 1);
}
```

Then add `desk_contact_count: contactCountByCustomer.get(c.customer_id) ?? 0` to the `customers` map at `page.tsx:61-69`.

### List row: existing Contact column to extend (`src/app/v2/(hub)/customers/_customers-index.tsx:283-290`)

```tsx
<div className="min-w-0">
  <div className="text-[13px] text-slate-600 truncate">{c.contact_name ?? "—"}</div>
  {c.contact_email && (
    <div className="inline-flex items-center gap-1 text-[11px] text-slate-400 truncate">
      <Mail size={10} /> {c.contact_email}
    </div>
  )}
  {/* ADD: */}
  {c.desk_contact_count > 0 && (
    <div className="text-[11px] text-slate-400 truncate">
      +{c.desk_contact_count} Desk contact{c.desk_contact_count > 1 ? "s" : ""}
    </div>
  )}
</div>
```

Kept as plain text, not a button — clicking the company name already navigates to the profile, where the full Desk Contacts list is visible on the Contact tab. No grid/column restructuring needed (the existing `grid-cols-[1fr_1fr_90px_140px_100px]` template is unchanged).

### Profile page: Assets tab's lazy-fetch pattern to mirror (`src/app/v2/(hub)/customers/[customerId]/client.tsx`, state block ~line 216-220, effect ~line 233-243)

```tsx
// Assets
const [assets, setAssets] = useState<AssetRow[]>([]);
const [assetsLoading, setAssetsLoading] = useState(false);
const hasFetchedAssetsRef = useRef(false);
// ...
useEffect(() => {
  if (activeSection !== "assets" || hasFetchedAssetsRef.current) return;
  hasFetchedAssetsRef.current = true;
  setAssetsLoading(true);
  fetch(`/api/customers/${customer.customer_id}/assets`)
    .then(r => r.json())
    .then((data: unknown) => setAssets(Array.isArray(data) ? (data as AssetRow[]) : []))
    .catch(() => {})
    .finally(() => setAssetsLoading(false));
}, [activeSection, customer.customer_id]);
```

Add an analogous block, gated on `activeSection === "contact"` (the existing tab — no new `NavSection` value, no new nav item needed):

```tsx
type CustomerDeskContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  secondary_email: string | null;
  phone: string | null;
  mobile: string | null;
  title: string | null;
};

const [deskContacts, setDeskContacts] = useState<CustomerDeskContact[]>([]);
const [deskContactsLoading, setDeskContactsLoading] = useState(false);
const hasFetchedDeskContactsRef = useRef(false);

useEffect(() => {
  if (activeSection !== "contact" || hasFetchedDeskContactsRef.current) return;
  hasFetchedDeskContactsRef.current = true;
  setDeskContactsLoading(true);
  fetch(`/api/customers/${customer.customer_id}/contacts`)
    .then(r => r.json())
    .then((data: unknown) => setDeskContacts(Array.isArray(data) ? (data as CustomerDeskContact[]) : []))
    .catch(() => {})
    .finally(() => setDeskContactsLoading(false));
}, [activeSection, customer.customer_id]);
```

### Profile page: existing "Primary Contact" block to extend, not replace (`src/app/v2/(hub)/customers/[customerId]/client.tsx:1715-1730`)

```tsx
{/* Primary Contact */}
{activeSection === "contact" && (
  <div className={sectionCls}>
    <div className={sectionTitleCls}>Primary Contact</div>
    {/* ...existing grid, unchanged... */}
  </div>
)}
```

Add a second block immediately after (still inside the same `activeSection === "contact"` conditional, or as its own sibling `{activeSection === "contact" && (...)}` block — either works, match whichever reads cleaner in context):

```tsx
{activeSection === "contact" && (
  <div className={cn(sectionCls, "mt-4")}>
    <div className={sectionTitleCls}>Desk Contacts {deskContacts.length > 0 && `(${deskContacts.length})`}</div>
    {deskContactsLoading ? (
      <div className="text-[13px] text-slate-400 text-center py-4">Loading…</div>
    ) : deskContacts.length === 0 ? (
      <div className={cn("text-[13px] text-slate-400 text-center py-4 rounded-lg border border-dashed", isDark ? "bg-white/[0.02] border-white/[0.08]" : "bg-slate-50 border-slate-200")}>
        No Desk contacts matched to this customer yet.
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        {deskContacts.map((c) => (
          <div key={c.id} className={cn("flex items-center gap-3 py-2.5 px-3 rounded-lg border", isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-slate-100 bg-slate-50/50")}>
            <div className="min-w-0 flex-1">
              <div className={cn("text-[13px] font-medium", textPrimary)}>
                {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
              </div>
              {c.title && <div className="text-[11px] text-slate-400 truncate">{c.title}</div>}
            </div>
            <div className="text-[12px] text-slate-500 truncate min-w-0 flex-1">{c.email ?? "—"}</div>
            <div className="text-[12px] text-slate-500 shrink-0">{c.phone ?? c.mobile ?? "—"}</div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

Reuses `sectionCls`/`sectionTitleCls`/`textPrimary`/`isDark`/`cn` — all already in scope in this component (same variables the Assets section already uses).

## Implementation Steps

1. Create `src/app/api/customers/[customerId]/contacts/route.ts`.
2. Update `src/app/v2/(hub)/customers/page.tsx`: add the scoped `contacts` count query, thread `desk_contact_count` into the `CustomerListItem` mapping.
3. Update `src/app/v2/(hub)/customers/_customers-index.tsx`: add `desk_contact_count` to the `CustomerListItem` type, render the secondary line in the Contact column.
4. Update `src/app/v2/(hub)/customers/[customerId]/client.tsx`: add state + lazy-fetch effect, add the "Desk Contacts" render block after "Primary Contact" inside the `contact` tab.
5. `npx tsc --noEmit` and `pnpm lint`.
6. Manual verification per Acceptance Criteria.

## Acceptance Criteria

- [ ] `/v2/customers` list shows "+N Desk contact(s)" under a customer's Contact column only when that customer has at least one matched Desk contact; nothing shown for 0.
- [ ] Opening a customer's profile page → Contact tab shows the existing Primary Contact block unchanged, plus a new Desk Contacts block below it.
- [ ] Desk Contacts block shows a loading state on first visit to the tab, then either the list (name, title if present, email, phone/mobile) or the empty-state message.
- [ ] Switching away from and back to the Contact tab does not re-fetch (matches the Assets tab's existing fetch-once-per-mount behavior via the ref guard).
- [ ] A customer with 0 matched contacts shows the empty state, not an error and not a blank section.
- [ ] A non-staff (client-role) session gets an empty/error response from the new endpoint per RLS, not another customer's contacts — not independently re-tested this round (matches existing `contacts_staff_read` policy already verified in task 117).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual: localhost:3000/v2/customers — confirm the count line appears for known-matched customers
#   (e.g. WRQ-CUST-3858, WRQ-CUST-CEEB, WRQ-CUST-6C4C per task 117's spot-checked rows)
# Manual: open one of those customers' profile → Contact tab — confirm Desk Contacts list renders
# Manual: open a customer with 0 matched contacts — confirm empty state, no error
```

## Compatibility Touchpoints

- None for packaging/docs/install surface — v2 app-route-only UI addition plus one new read-only API route, no schema changes (task 117 already created and populated `contacts`).

## Implementation Notes

### What Changed
- New `GET /api/customers/[customerId]/contacts` route — session-scoped `createClient()`, relies entirely on the existing `contacts_staff_read` RLS policy for access control (no manual role-filtering, unlike the Assets route).
- `src/app/v2/(hub)/customers/page.tsx` — added a third parallel query (`contacts`, scoped to `pageCustomerIds`, filtered to non-null `customer_id`) alongside the existing `projects`/`customer_products` lookups; threaded `desk_contact_count` into the `CustomerListItem` mapping.
- `src/app/v2/(hub)/customers/_customers-index.tsx` — added `desk_contact_count: number` to `CustomerListItem`; renders a plain-text "+N Desk contact(s)" line under the existing Contact column when count > 0. No grid/column changes.
- `src/app/v2/(hub)/customers/[customerId]/client.tsx` — added `CustomerDeskContact` type (`Pick` off the `contacts` DB Row type, matching exactly what the new route returns), `deskContacts`/`deskContactsLoading`/`hasFetchedDeskContactsRef` state, and a lazy-fetch `useEffect` gated on `activeSection === "contact"` — mirrors the existing Assets tab's fetch-once pattern exactly. Added a new "Desk Contacts" render block immediately after the existing "Primary Contact" block, inside the same `contact` tab (no new `NavSection` value or nav item needed).

### Files Changed
- `src/app/api/customers/[customerId]/contacts/route.ts` — created.
- `src/app/v2/(hub)/customers/page.tsx` — added scoped contacts-count query.
- `src/app/v2/(hub)/customers/_customers-index.tsx` — added `desk_contact_count` field + render line.
- `src/app/v2/(hub)/customers/[customerId]/client.tsx` — added type, state, effect, render block.

### Deviations From Plan
- None. Implemented exactly as specced — the Code Context snippets in this doc were written closely enough to the actual codebase (verified during planning) that no adjustments were needed during implementation.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS for all 4 changed/created files (0 new errors/warnings). The full lint run's pre-existing warnings in `v2/(hub)/customers/[customerId]/client.tsx` (`AlertTriangle` unused, `zohoPortalId` unused, etc.) appear at shifted line numbers only because new code was inserted above them — confirmed identical warnings exist at the original line numbers in the untouched v1 copy of the same file, i.e. nothing new was introduced.
- Manual/browser verification — CONFIRMED by user: list count line renders per-row (e.g. "AGL Co" showing "+4 Desk contacts", "American Lighting" showing "+3 Desk contacts"), profile Contact tab renders the Desk Contacts list (name, email, phone) below the existing Primary Contact block. Follow-up UX request captured as task 120.
