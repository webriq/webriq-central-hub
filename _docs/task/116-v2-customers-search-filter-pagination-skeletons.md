# 116: v2 Customers Listing — Search, Filter, Pagination & Skeletons

**Created:** 2026-07-08
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

`/v2/customers` (`_customers-index.tsx`) currently renders every customer row in one client-fetched, unpaginated list — status filtering and search are client-side only, over whatever rows happened to load. This scales badly as the customer count grows (all rows always render, one long scroll) and has no loading UI beyond a blank flash. `/v2/projects` already solved this exact problem — server-side pagination + filtering driven by URL search params, a debounced search input, page-size controls, and a `loading.tsx` Suspense skeleton. This task ports that same architecture to Customers.

This task builds directly on top of task 115 (`_docs/task/115-v2-customer-management-onboarding-port.md`), which just added the "Onboarding" progress column, the Realtime subscription on `customer_products`, and the "+ New Customer" button to this same file. All three must be preserved — not re-litigated — through this rewrite.

**Bug found and fixed in passing:** task 115's `STATUS_STYLE` map uses `active | onboarding | pending | inactive | churned`. The actual `customers.status` DB constraint (`supabase/migrations/010_completed_onboarding_status.sql:6-7`) only allows `active | inactive | onboarding | completed_onboarding` — `pending`/`churned` can never occur, and `completed_onboarding` (a real, reachable status) has no style entry and silently falls through to the default gray badge. Since this task is rewriting the same status-filter UI anyway, fix the map in the same pass rather than filing it separately.

## Requirements

- [ ] Search (company name, contact name, contact email, or `customer_id`) is server-side and paginated, not a client-side filter over an already-loaded page.
- [ ] Status filter is a fixed set of pills reflecting the real `customers.status` constraint (`active`, `onboarding`, `completed_onboarding`, `inactive`) plus "All" — not derived from whatever statuses happen to be on the current page (that breaks across pages).
- [ ] Pagination: page-size selector + first/prev/next/last controls, URL-driven (`page`, `pageSize` search params), mirroring `/v2/projects`.
- [ ] All filter/search/page state lives in the URL (shareable/bookmarkable links, back-button works), matching the Projects pattern — not local-only React state.
- [ ] A `loading.tsx` at the customers route renders a skeleton (sticky header + toolbar + table-row bones + pagination bones) shown automatically by Next.js while the server component re-fetches, on both the initial load and subsequent filter/page navigations.
- [ ] The existing "Onboarding" progress column, its Realtime subscription on `customer_products`, and the "+ New Customer" button (all from task 115) continue to work unchanged in behavior.
- [ ] `STATUS_STYLE` (and any status label mapping) is corrected to the real 4-value constraint.

## Out of Scope / Must-Not-Change

- The customer profile page (`[customerId]/page.tsx` / `client.tsx`) and onboard wizard (`onboard/page.tsx` / `_content.tsx`) from task 115 — untouched by this task.
- `/v2/projects` itself — read-only reference for the pattern, not modified.
- Introducing a grid/list view toggle for customers — Projects has one because it has two genuinely different card/table layouts; Customers only ever renders as a table, so no view toggle is needed.
- The shared `/api/customers/**` REST layer — this task queries Supabase directly from the server component (`page.tsx`), exactly like `/v2/projects/page.tsx` already does; it does not touch or route through the REST API.
- Re-deriving `completed_percentage` client-side — keep using the stored column, per task 115's existing (unchanged) decision.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/customers/page.tsx` | Modify | Accept `searchParams` (`page`, `pageSize`, `search`, `status`); run a filtered, paginated (`count: "exact"`, `.range()`) query against `customers`; scope the `customer_products`/`projects` lookups to only the current page's `customer_id`s (not the whole table); pass `paginationMeta` through. |
| `src/app/v2/(hub)/customers/_customers-index.tsx` | Modify | Add `useSearchParams`/`buildUrl` URL-driven search + status filter + pagination controls (port the pattern from `_projects-index.tsx`); fix `STATUS_STYLE`/labels to the real 4-value constraint; replace the current `useState(initialCustomers)` full-array fork with a small `productOverrides` map (keyed by `customer_products.id`) for the Realtime patch, matching `_projects-index.tsx`'s existing `tagOverrides` pattern — avoids re-deriving state from props across page/filter navigations. |
| `src/app/v2/(hub)/customers/loading.tsx` | Create | Skeleton for sticky header + toolbar (search/status/pagination bones) + N table-row bones, mirroring `v2/(hub)/projects/loading.tsx`'s `Bone` primitive. |

## Code Context

### Reference: `src/app/v2/(hub)/projects/page.tsx` (pattern to mirror, not to copy verbatim — customers is a single-table query, no two-step name→id lookup needed)

```tsx
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ page?: string; pageSize?: string; search?: string; status?: string }> }) {
  const supabase = await createClient();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "15", 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("projects").select("...", { count: "exact" }).order(...);
  if (statusParam) query = query.eq("status", statusParam);
  if (searchQ) query = query.or(`name.ilike.%${searchQ}%,...`);
  query = query.range(from, to);
  // ...
  const paginationMeta: PaginationMeta = { page, pageSize, total: projectsRes.count ?? 0 };
}
```

For customers, the equivalent is a single `.or()` across `company_name`, `contact_name`, `contact_email`, `customer_id` — no cross-table ID lookup step needed (Projects needs one because it searches by customer *name* against a *project* row; Customers searches its own columns directly):

```ts
if (searchQ) {
  customersQuery = customersQuery.or(
    `company_name.ilike.%${searchQ}%,contact_name.ilike.%${searchQ}%,contact_email.ilike.%${searchQ}%,customer_id.ilike.%${searchQ}%`
  );
}
if (statusParam) customersQuery = customersQuery.eq("status", statusParam);
customersQuery = customersQuery.range(from, to);
```

Then scope the supplementary lookups to just the paginated rows:

```ts
const pageCustomerIds = (customersRes.data ?? []).map((c) => c.customer_id);
const [projectsRes, productsRes] = await Promise.all([
  supabase.from("projects").select("customer_id").in("customer_id", pageCustomerIds),
  supabase.from("customer_products").select("id,customer_id,product_name,completed_percentage").in("customer_id", pageCustomerIds),
]);
```

Default page size: use `LIST_PAGE_SIZES`-equivalent `[20, 50, 100]` (Customers has no grid view, so only one page-size set is needed, unlike Projects' grid/list split).

### Reference: `src/app/v2/(hub)/projects/_projects-index.tsx` (lines 68-267 — full URL-driven toolbar + pagination pattern)

Key pieces to port, adapted (no `view`/`customerFilter`/tag-management pieces apply to Customers):
- `buildUrl(overrides)` helper (line 109-115) — merges current `searchParams` with overrides, `null` deletes a key.
- Debounced search input (lines 154-166) — 300ms `setTimeout` on a `useRef`, pushes `buildUrl({ search: q || null, page: 1 })`.
- Status pills (lines 170-183) — `router.push(buildUrl({ status: s === "all" ? null : s, page: 1 }))`.
- Pagination controls block (lines 216-266) — page-size `<select>`, "`from+1`–`min(from+pageSize,total)` of `total`" label, first/prev/next/last buttons disabled via `hasPrev`/`hasNext`.
- `tagOverrides` pattern (lines 79, 95-107) — the model for this task's `productOverrides`: a small `Record<id, value>` merged at render time via a `getXFor()` helper, populated by the Realtime callback instead of forking the whole list into local state. This sidesteps the `react-hooks/set-state-in-effect` lint rule task 115 already hit once (it removed a resync-effect for exactly this reason) — with pagination now changing the `customers` prop across navigations, a full-array fork would reintroduce that problem; an overlay map does not, because it's keyed by row id and never needs to "catch up" to a changed prop.

### Reference: `src/app/v2/(hub)/projects/loading.tsx` (full file — port the `Bone` primitive, replace `CardSkeleton`/grid with table-row bones)

```tsx
function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className ?? ""}`} />;
}
// ... sticky header skeleton (title + New button), toolbar skeleton (search/status/pagination bones),
// then instead of the 3-col card grid: ~8 rows matching the table's grid-cols, each row a flex of Bone elements
// sized to the Company/Contact/Status/Onboarding/Projects columns.
```

### Current status map to fix (`_customers-index.tsx`, from task 115 — real bug)

```ts
// Current (wrong — pending/churned unreachable, completed_onboarding missing):
const STATUS_STYLE: Record<string, {...}> = {
  active: {...}, onboarding: {...}, pending: {...}, inactive: {...}, churned: {...},
};
// Fix to match supabase/migrations/010_completed_onboarding_status.sql:6-7 —
// check (status in ('active', 'inactive', 'onboarding', 'completed_onboarding'))
```

Reuse the same label wording already established in the ported v1 profile page (`[customerId]/client.tsx`'s `statusLabel`): `onboarding → "Onboarding"`, `active → "Active"`, `inactive → "Inactive"`, `completed_onboarding → "Completed Onboarding"`.

## Implementation Steps

1. Rewrite `page.tsx`: parse `searchParams`, build the filtered/paginated `customers` query (`count: "exact"`, `.range()`), scope `projects`/`customer_products` lookups to the page's `customer_id`s, assemble `PaginationMeta`.
2. Rewrite `_customers-index.tsx`: add `useSearchParams` + `buildUrl`, debounced search input, fixed 4-status filter pills (corrected map), pagination controls block, sticky header wrapper (matching Projects' `sticky top-0` treatment). Replace the `useState(initialCustomers)` fork with a `productOverrides` map fed by the existing Realtime subscription; keep the "+ New Customer" button.
3. Create `loading.tsx` with header/toolbar/table-row/pagination skeleton bones.
4. `npx tsc --noEmit` and `pnpm lint`.
5. Manual verification per Acceptance Criteria.

## Acceptance Criteria

- [ ] Typing in the search box updates the URL (`?search=...`) after a debounce and shows only matching customers, fetched server-side (not filtered from an already-loaded set).
- [ ] Status pills show exactly All / Active / Onboarding / Completed Onboarding / Inactive, and filtering by one updates the URL (`?status=...`) and results correctly, including for `completed_onboarding` customers (previously showed a default gray badge with no filter pill at all).
- [ ] Changing page size or page updates the URL (`?page=...&pageSize=...`) and shows the correct slice; first/prev/next/last buttons disable correctly at the boundaries.
- [ ] Reloading the page or sharing a URL with `?search=`/`?status=`/`?page=` params reproduces the same filtered/paginated view.
- [ ] Navigating to `/v2/customers` (and subsequent filter/page changes) shows the skeleton loading state, not a blank flash.
- [ ] The "Onboarding" progress column still updates live when a `customer_products` row changes in another session/tab.
- [ ] "+ New Customer" still navigates to `/v2/customers/onboard`.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual: localhost:3000/v2/customers — search, status pills, pagination, skeleton on navigation, realtime progress update
```

## Compatibility Touchpoints

- None for packaging/docs/install surface — app-route-only change within the existing v2 parallel build.

## Implementation Notes

### What Changed
- `page.tsx` is now `async` over `searchParams` (`page`, `pageSize`, `search`, `status`), running a filtered, paginated (`count: "exact"`, `.range()`) query directly against `customers` — mirrors `v2/(hub)/projects/page.tsx`. The `projects`/`customer_products` lookups are now scoped to only the current page's `customer_id`s instead of the whole table, guarded by an explicit `if (pageCustomerIds.length > 0)` check before the `.in()` calls (matching the existing defensive pattern in `src/app/api/projects/route.ts`, rather than trusting empty-array `.in()` behavior).
- `_customers-index.tsx` rewritten with the full URL-driven toolbar: debounced (300ms) search input, a fixed 5-item status filter (`all/active/onboarding/completed_onboarding/inactive` — the real DB constraint), and a pagination control block (page-size select `[20, 50, 100]` + first/prev/next/last), all via the same `buildUrl(overrides)` → `router.push` pattern as `_projects-index.tsx`. Sticky header + scroll-shadow behavior ported too.
- Replaced task 115's `useState(initialCustomers)` full-array fork with a `productOverrides: Record<customer_products.id, completed_percentage>` map, merged at render via `getProductsFor(c)`. This is the same shape as `_projects-index.tsx`'s existing `tagOverrides`/`getTagsFor`. It was a required fix, not just a style choice: with pagination now in place, the `customers` prop legitimately changes across page/filter navigations while the component stays mounted, which would have reintroduced the `react-hooks/set-state-in-effect` violation task 115 hit and removed a resync-effect for.
- Fixed `STATUS_STYLE`/labels to the real 4-value `customers.status` constraint (`active`, `onboarding`, `completed_onboarding`, `inactive`) — removed the unreachable `pending`/`churned` entries from task 115 and added the missing `completed_onboarding` style + label (previously fell through to the default gray badge with no filter pill).
- New `loading.tsx`: header/toolbar/table skeleton using the same `Bone` primitive as `v2/(hub)/projects/loading.tsx`, with 8 table-row skeletons sized to the real column widths instead of card skeletons (Customers has no grid view).

### Files Changed
- `src/app/v2/(hub)/customers/page.tsx` — server-side search/filter/pagination query, scoped lookups.
- `src/app/v2/(hub)/customers/_customers-index.tsx` — URL-driven toolbar, pagination controls, `productOverrides` overlay, corrected status map.
- `src/app/v2/(hub)/customers/loading.tsx` — created.

### Deviations From Plan
- None beyond what the task doc already anticipated in its Code Context (the `productOverrides` approach and the status-map fix were both specified there, not discovered mid-implementation).

### Verification Run
- `npx tsc --noEmit` — PASS (clean after clearing stale `.next/` cache, same one-time artifact issue as task 115).
- `pnpm lint` (targeted at the 3 changed files) — PASS, 0 errors, 0 warnings.
- Route smoke test via `curl` (dev server on port 3001, port 3000 already held by another `next-server` process from earlier in this session — left untouched rather than killed, in case it's in active use) — `/v2/customers` and `/v2/customers?search=acme&status=active&page=1&pageSize=50` both return 307 (expected auth redirect, no compile errors in the dev log).
- Full authenticated browser walkthrough of the Acceptance Criteria — SKIPPED, same gap as task 115: the Claude-in-Chrome extension is not connected in this session and no test credentials were available. Nothing exercised the actual toolbar/pagination/skeleton/realtime behavior past the login redirect. Recommend the `/test` stage (or a manual pass) walk through all eight Acceptance Criteria checkboxes above before this is considered done.
