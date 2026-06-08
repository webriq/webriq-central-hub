# Task 053 — Onboarding Responses Edit, File URL Fix & Product Archive Tab

> **Priority:** HIGH
> **Type:** minor
> **Recommended Model:** sonnet
> **Status:** TESTING
> **Completed:** 2026-06-04
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Goal

Three interconnected improvements to the customer profile Products section:

1. **Fix `[object Object]`** — file fields in `ResponsesView` render as `[object Object]` instead of a clickable link.
2. **Edit Responses modal** — PMs can edit saved onboarding data (all field types including file re-upload) directly from the hub, without redirecting the customer.
3. **Archive instead of delete + Archived tab** — "Remove Product" becomes "Archive Product" (soft delete, status `'archived'`). A new "Archived" sub-tab lets PMs restore products, preserving all onboarding data.

---

## Requirements

### R1 — File URL fix
- In `ResponsesView`, detect when a field value is an `UploadedFile` object (`{ url, filename, size, mimeType, path }`)
- Render it as a clickable `<a>` link: `href={value.url}`, display text = `value.filename`, `target="_blank"`, `rel="noopener noreferrer"`
- Also handle `Array` values: join with `", "` (covers multi-value text fields like `referenceSites`)
- Change `displayValue` from returning a `string` to returning `React.ReactNode` — update the `<span>` container accordingly

### R2 — Edit Responses modal (active products only)
- Add "Edit Responses →" button below "View Responses →" in each active product card
- Only visible when `product.status !== 'archived'`
- Opens a full-width scrollable modal (same overlay pattern as existing modals)
- Modal renders all fields from the product's `getOnboardingSchema()` — respecting section `condition` and field `condition` for visibility
- Field type rendering:
  - `text`, `url` → `<input type="text">`
  - `textarea` → `<textarea>`
  - `select` → `<select>`
  - `radio` → radio button group
  - `checkbox` → `<input type="checkbox">`
  - `file` → `<FileUpload>` component (from `@/components/onboarding/file-upload`)
- Initialized with current `product.onboarding_data`
- On save: `PATCH /api/customers/{customerId}/products/{productName}/onboarding` with `{ data: editResponsesData }` — no `explicitSubmit` flag (won't retrigger completion flow)
- On success: close modal, `router.refresh()`

### R3 — Archive product (soft delete)
- Replace "Remove" button action: instead of `DELETE`, send `PATCH { status: 'archived' }` to `/api/customers/{customerId}/products/{productName}`
- Update modal: amber icon, title "Archive {productName}?", copy explains data is preserved and product can be restored
- Button: "Archive Product" (amber background, not red)
- The DELETE handler and route can stay; just stop calling it from the UI

### R4 — Archived products sub-tab
- New state: `productTab: "active" | "archived"`, default `"active"`
- Derive `activeProducts = products.filter(p => p.status !== 'archived')` and `archivedProducts = products.filter(p => p.status === 'archived')`
- Tab switcher at top of products panel with two buttons: "Active (N)" and "Archived (N)"
- Active tab: existing product grid using `activeProducts`
- Archived tab: product grid using `archivedProducts`, cards rendered muted (reduced opacity or slate tones), no "Edit" / "Edit Responses" / "Archive" buttons — only a "Restore" button
- `handleRestoreProduct(product)`: PATCH `{ status: 'active' }`, `router.refresh()`
- `totalProductCount` and the nav label count only active products (not archived)
- `availableProducts` filtering: keep filtering against all assigned product names (archived products are still "assigned" — restore them rather than re-adding)

### R5 — API: allow `status` updates on products PATCH route
- `src/app/api/customers/[customerId]/products/[productName]/route.ts` — `ALLOWED_FIELDS` currently only includes metadata fields; add `status` with validation: must be one of `'active' | 'inactive' | 'archived'`

### R6 — DB migration
- New migration `supabase/migrations/023_customer_products_archive_status.sql`
- Drop existing `customer_products_status_check` constraint (currently `('active', 'inactive')`)
- Re-add with `('active', 'inactive', 'archived')`

---

## File Changes

| File | Action | Note |
|------|--------|------|
| `supabase/migrations/023_customer_products_archive_status.sql` | Create | Expand status CHECK constraint |
| `src/app/api/customers/[customerId]/products/[productName]/route.ts` | Modify | Add `status` to ALLOWED_FIELDS with validation |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | All UI changes: fix, new modal, archive, tab |

---

## Code Context

### Bug site — `displayValue` in `ResponsesView` (client.tsx:1659-1665)

```tsx
const value = data[field.name];
const displayValue =
  value === undefined || value === null || value === ""
    ? "—"
    : typeof value === "boolean"
      ? (value ? "Yes" : "No")
      : String(value);  // ← [object Object] when value is UploadedFile
```

Fix: before `String(value)`, add:
```tsx
: Array.isArray(value)
  ? value.join(", ")
  : typeof value === "object" && "url" in (value as object)
    ? <a href={(value as UploadedFile).url} target="_blank" rel="noopener noreferrer"
         className="text-brand underline">{(value as UploadedFile).filename}</a>
    : String(value);
```
Change the `displayValue` variable type to `React.ReactNode`. The `<span>` that renders it (`client.tsx:1669`) already accepts React children.

### Edit modal state pattern — follow `editProduct` (client.tsx:144-285)

```tsx
// New state to add near line 144
const [editResponses, setEditResponses] = useState<CustomerProductRow | null>(null);
const [editResponsesData, setEditResponsesData] = useState<Record<string, unknown>>({});
const [editResponsesSaving, setEditResponsesSaving] = useState(false);
const [editResponsesError, setEditResponsesError] = useState<string | null>(null);
```

Save handler pattern (mirrors `handleSaveProduct` at client.tsx:256-285):
```tsx
const handleSaveResponses = async () => {
  if (!editResponses) return;
  setEditResponsesSaving(true);
  setEditResponsesError(null);
  try {
    const res = await fetch(
      `/api/customers/${customer.customer_id}/products/${editResponses.product_name}/onboarding`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: editResponsesData }),
      }
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Save failed");
    }
    setEditResponses(null);
    router.refresh();
  } catch (err) {
    setEditResponsesError(err instanceof Error ? err.message : "Save failed");
  } finally {
    setEditResponsesSaving(false);
  }
};
```

### Archive state — replaces `removeProduct` (client.tsx:160-163, 352-372)

```tsx
// Rename: removeProduct → archiveProduct, removeProductSaving → archiveProductSaving, etc.
const handleArchiveProduct = async () => {
  if (!archiveProduct) return;
  setArchiveProductSaving(true);
  setArchiveProductError(null);
  try {
    const res = await fetch(
      `/api/customers/${customer.customer_id}/products/${archiveProduct.product_name}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }
    );
    if (!res.ok) { /* same error pattern */ }
    setArchiveProduct(null);
    router.refresh();
  } catch (err) { /* ... */ }
  finally { setArchiveProductSaving(false); }
};
```

### Products derivation (client.tsx:479-486) — split here

```tsx
const products = customer.customer_products ?? [];
// Add after line 479:
const activeProducts = products.filter(p => p.status !== "archived");
const archivedProducts = products.filter(p => p.status === "archived");
// Update line 486:
const totalProductCount = activeProducts.length + (hasCiteForge ? 1 : 0);
```

### "View Responses →" / "Edit Responses →" button location (client.tsx:1360-1376)

```tsx
<div className="flex flex-col gap-1 mt-3">
  {!isComplete && (
    <a href={...} ...>View Onboarding Form →</a>
  )}
  <button onClick={() => setViewingResponsesInline(product)} ...>
    View Responses →
  </button>
  {/* Add "Edit Responses →" here — only for active products */}
  {product.status !== "archived" && (
    <button
      onClick={() => {
        setEditResponsesData((product.onboarding_data as Record<string, unknown>) ?? {});
        setEditResponsesError(null);
        setEditResponses(product);
      }}
      className="text-xs text-slate-500 hover:text-brand font-semibold text-left bg-transparent border-none cursor-pointer p-0"
    >
      Edit Responses →
    </button>
  )}
</div>
```

### Archive modal — replace Remove modal (client.tsx:833-871)

Change: `AlertTriangle` → `Archive` icon (or keep `AlertTriangle` in amber), red → amber styling, copy:
```
Title: "Archive {product.product_name}?"
Body: "This will archive {product.product_name} for {customer.company_name}.
      All onboarding data is preserved and the product can be restored from the Archived tab."
Button: "Archive Product" — bg-amber-500 hover:bg-amber-600
```

### Products PATCH route — add `status` (route.ts:4-5)

```ts
// Current:
const ALLOWED_FIELDS = ["product_instance_id", "zoho_project_id", "sanity_project_id", "github_repo"] as const;

// Change to separate status handling:
const ALLOWED_FIELDS = ["product_instance_id", "zoho_project_id", "sanity_project_id", "github_repo"] as const;
const VALID_STATUSES = ["active", "inactive", "archived"] as const;

// In the handler, after building `update`:
if ("status" in body) {
  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  (update as Record<string, unknown>).status = body.status;
}
```

---

## Implementation Steps

1. **Migration** — create `supabase/migrations/023_customer_products_archive_status.sql`, drop + recreate the CHECK constraint to include `'archived'`

2. **API: products PATCH route** — add `status` field handling with validation per Code Context above

3. **Fix `[object Object]`** — in `ResponsesView.displayValue`, add Array and UploadedFile branches; change type to `React.ReactNode`; import `UploadedFile` from `@/types/onboarding`

4. **Edit Responses modal state** — add 4 state vars near the `editProduct` block (client.tsx ~line 144)

5. **`handleSaveResponses`** — add handler after `handleSaveProduct` (client.tsx ~line 285)

6. **Rename Remove → Archive** — rename all `removeProduct*` state vars to `archiveProduct*`; replace `handleRemoveProduct` with `handleArchiveProduct` (PATCH instead of DELETE)

7. **Products derivation** — split into `activeProducts` / `archivedProducts` at client.tsx:479; update `totalProductCount` to use `activeProducts.length`

8. **Product tab state** — add `productTab` state (default `"active"`); add `handleRestoreProduct` handler

9. **Tab switcher UI** — render tab buttons at top of products section (before the header row); show "Active (N)" and "Archived (N)"

10. **Active tab** — replace `products.map(...)` with `activeProducts.map(...)` in the existing grid

11. **Archived tab** — new grid rendering `archivedProducts` with muted styling and "Restore" button; no Edit/Archive/Edit-Responses actions

12. **"Edit Responses →" button** — add below "View Responses →" in each product card, gated on `product.status !== "archived"`

13. **Edit Responses modal** — add modal JSX below the archive modal; renders schema fields dynamically with appropriate input types; `<FileUpload>` for file fields; save calls `handleSaveResponses`

14. **Update archive modal** — change icon to amber, update copy per Code Context above

---

## Notes for Implementation Agent

- **Sonnet rationale:** cross-cutting change touching a DB migration, 2 API files, and a 1,600+ line client component with a new dynamic form modal (all field types + file upload). Multiple interdependencies and new state management.
- The `PATCH /api/.../products/[productName]/onboarding` endpoint uses `adminClient` — this is the documented exception for public routes, but since we're reusing it for PM hub edits, the admin bypass is acceptable here too (it's a write operation updating `customer_products`, which requires service-level access).
- Do NOT add `explicitSubmit: true` in the PM edit save call — the completion flow must not re-trigger on PM edits.
- `displayValue` changes type from `string` to `React.ReactNode`. The consumer is a `<span>` child at client.tsx:1669 — this is valid in React. No type cast needed.
- For the Edit Responses modal field rendering: check `field.type` against `"file"` to use `<FileUpload>`; `"checkbox"` for booleans; `"select"` and `"radio"` for option lists; everything else as `<input type="text">`. Use `field.options` for `select`/`radio` choices.
- `FileUpload` props: `fieldName={field.name}`, `customerId={customer.customer_id}`, `productName={editResponses.product_name}`, `value={editResponsesData[field.name]}`, `onChange={(file) => setEditResponsesData(prev => ({ ...prev, [field.name]: file }))}`
- The migration needs to handle the case where the constraint may have a different auto-generated name. Use `ALTER TABLE customer_products DROP CONSTRAINT IF EXISTS customer_products_status_check` before adding the new one.
- The archive PATCH calls the existing `PATCH /api/.../products/[productName]` route (the metadata one, NOT the onboarding one). This is the route we're adding `status` to in Step 2.
- `availableProducts` filtering stays as-is — archived products remain in `assignedNames` so they don't reappear in the Add Product dropdown. Restoring them is the correct path.
- Keep `viewingResponsesInline` state unchanged — "View Responses" view still uses `ResponsesView`. The fix to `displayValue` benefits both views automatically.
- Archived product cards in the Archived tab: render the product name + completion badge + highlights in muted tones, plus a single "Restore" button. No progress bar interaction needed.
