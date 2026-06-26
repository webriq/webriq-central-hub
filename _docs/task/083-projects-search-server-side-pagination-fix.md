# Task 083 — Projects Search: Server-Side Filtering + Real Pagination Total

> **Type:** bugfix / patch
> **Priority:** HIGH
> **Recommended Model:** haiku
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Completed:** 2026-06-26
> **Implementation Notes:** Two files changed. `page.tsx` now accepts `search` and `status` URL params and applies server-side Supabase filters; two-step company-name lookup resolves to `customer_id`s before the main query so `name.ilike` and `customer_id.in.(...)` can be combined via `.or()`. The `customer` filter that was previously declared but ignored is now applied. `paginationMeta.total` comes from `count: "exact"` on the filtered query. Client component removes `filtered` useMemo, replaces `search`/`status` state with URL reads, adds 300 ms debounced `router.push` for search and immediate `router.push` for status buttons.

---

## Problem

Search, status filter, and customer filter are all client-side and scoped to the current page only. Typing "Amsterdam" on page 1 will never return a project that lives on page 2 because the server only fetched the first 15 records. The pagination total (`paginationMeta.total`) is always the unfiltered DB count, so the range display, `hasNext`, and the project count subtitle are all wrong when any filter is active.

Root cause: all four filtering dimensions (search, status, customer, total count) live in React state (`useState`) rather than URL search params consumed by the server component.

---

## Expected Behavior

- Typing in the search box (after a 300 ms debounce) navigates to `?search=q&page=1` — the server queries all projects matching the term across all pages.
- Clicking a status filter button navigates to `?status=active&page=1`.
- Both search and status can be combined.
- The customer filter (`?customer=WRQ-CUST-XXXX`) is applied server-side (it was declared but never used in the DB query).
- `paginationMeta.total` reflects the filtered row count, so the subtitle, range display, `hasNext`, and last-page calculations are all accurate.
- Page resets to 1 whenever search, status, or customer filter changes.

---

## File Changes

| File | Change |
|------|--------|
| `src/app/v2/(hub)/projects/page.tsx` | Add `search` and `status` to `searchParams` type. Apply server-side filters to the Supabase query: two-step lookup for search (company name → customer_ids, then `.or()` for project name + `.in()` for customer_ids), `.eq("status", ...)` for status filter, `.eq("customer_id", ...)` for customer filter (already declared, never used). `count: "exact"` on the filtered query automatically returns the filtered total. |
| `src/app/v2/(hub)/projects/_projects-index.tsx` | Wire search `<input>` to `router.push(buildUrl({ search: e.target.value, page: 1 }))` with 300 ms debounce using `useRef` for the timer. Wire status buttons to `router.push(buildUrl({ status: s === "all" ? null : s, page: 1 }))`. Read initial search/status values from `useSearchParams()` for controlled inputs. Remove the `filtered` useMemo entirely — `projects` prop is already the server-filtered slice. Update `showPagination`, `hasNext`, `hasPrev`, pagination range, and project count subtitle to use `total` from `paginationMeta` (which is now the filtered count). |

---

## Implementation Steps

### Step 1 — Server: add `search` and `status` to `searchParams` and apply filters

In `page.tsx`, update the `searchParams` type to include `search` and `status`:

```ts
searchParams: Promise<{ customer?: string; page?: string; pageSize?: string; view?: string; search?: string; status?: string }>;
```

Before the parallel `Promise.all`, resolve company-name search into `customer_id`s (two-step lookup):

```ts
const searchQ = params.search?.trim() ?? "";
const statusFilter = params.status ?? "";
const customerFilter = params.customer ?? "";

let searchCustomerIds: string[] | null = null;
if (searchQ) {
  const { data: matchedCustomers } = await supabase
    .from("customers")
    .select("customer_id")
    .ilike("company_name", `%${searchQ}%`);
  searchCustomerIds = (matchedCustomers ?? []).map((c) => c.customer_id);
}
```

Then build the projects query with filters before `.range()`:

```ts
let projectsQuery = supabase
  .from("projects")
  .select("id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at", { count: "exact" })
  .order("updated_at", { ascending: false });

if (customerFilter) {
  projectsQuery = projectsQuery.eq("customer_id", customerFilter);
}
if (statusFilter) {
  projectsQuery = projectsQuery.eq("status", statusFilter);
}
if (searchQ) {
  // Match project name OR company name (via pre-resolved customer_ids)
  const customerIdFilter = searchCustomerIds && searchCustomerIds.length > 0
    ? `customer_id.in.(${searchCustomerIds.join(",")})`
    : "";
  const orFilter = customerIdFilter
    ? `name.ilike.%${searchQ}%,${customerIdFilter}`
    : `name.ilike.%${searchQ}%`;
  projectsQuery = projectsQuery.or(orFilter);
}

projectsQuery = projectsQuery.range(from, to);
```

Replace the `projectsRes` entry in `Promise.all` with `projectsQuery`.

Pass `search` and `status` through to `ProjectsIndex` as props (or they can be read from URL on the client via `useSearchParams` — client read is fine since they're already in the URL).

### Step 2 — Client: replace client-side filtering with URL-driven navigation

**Remove:**
- `const [search, setSearch] = useState("")` (line 72)
- `const [status, setStatus] = useState<...>("all")` (line 73)
- The `filtered` useMemo block (lines 90–98)
- All references to `filtered` — replace with `projects` directly

**Add:**
- Read controlled input values from URL: `const searchValue = searchParams.get("search") ?? ""` and `const statusValue = (searchParams.get("status") ?? "all") as ...`
- A `debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)` for the search timer
- Search `onChange` handler:
  ```ts
  onChange={(e) => {
    const q = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.push(buildUrl({ search: q || null, page: 1 }));
    }, 300);
  }}
  ```
  Keep `value` as a local `useState` for the input display (so typing feels instant), but push to URL after 300 ms:
  ```ts
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  // onChange: setSearchInput(q) immediately, then debounce router.push
  ```
- Status button `onClick`:
  ```ts
  onClick={() => router.push(buildUrl({ status: s === "all" ? null : s, page: 1 }))}
  ```
- Active state for status buttons: compare against `statusValue` (from URL), not local state

**Update pagination / count display:**
- `showPagination`: change from `filtered.length > 0` → `total > 0` (uses the server filtered total)
- `hasNext`: already uses `total` — remains correct after the fix
- Project count subtitle: `{total} project{total === 1 ? "" : "s"}` — already uses `total`, will be correct once `total` is the filtered count

### Step 3 — Verify

- TypeScript check: `npx tsc --noEmit`
- Browser test: search "Amsterdam" on page 1 → should find projects across all pages
- Browser test: select "On Hold" status → correct filtered count in subtitle and pagination
- Browser test: customer filter link from a customer profile → should show only that customer's projects with correct count
- Edge case: search term matches company name but not project name (two-step lookup path)
- Edge case: search term with no matches → 0 projects, pagination hidden

---

## Code Context

### `_projects-index.tsx:72–98` — state and filtered memo being replaced

```ts
const [search, setSearch] = useState("");
const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
// ...
const { page, pageSize, total } = paginationMeta;
const from = (page - 1) * pageSize;

const filtered = useMemo(() => {
  const q = search.trim().toLowerCase();
  return projects.filter((p) => {
    if (customerFilter && p.customer_id !== customerFilter) return false;
    if (status !== "all" && p.status !== status) return false;
    if (q && !p.name.toLowerCase().includes(q) && !p.company_name.toLowerCase().includes(q)) return false;
    return true;
  });
}, [projects, search, status, customerFilter]);
```

### `_projects-index.tsx:116–127` — `buildUrl` + `handleViewChange` pattern to follow for search/status

```ts
function buildUrl(overrides: Record<string, string | number | null>) {
  const p = new URLSearchParams(searchParams.toString());
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) { p.delete(k); } else { p.set(k, String(v)); }
  }
  return `${V2_ROUTES.PROJECTS}?${p.toString()}`;
}

function handleViewChange(next: "grid" | "list") {
  setView(next);
  router.push(buildUrl({ view: next, pageSize: next === "grid" ? 15 : 20, page: 1 }));
}
```

### `page.tsx:28–36` — current Supabase query (filters go here)

```ts
const [projectsRes, customersRes, taskCountRes] = await Promise.all([
  supabase
    .from("projects")
    .select("id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to),
  supabase.from("customers").select("customer_id,company_name").order("company_name"),
  supabase.from("tasks").select("project_id,status").is("parent_task_id", null),
]);
```

### `page.tsx:68–72` — `paginationMeta` construction (total comes from `projectsRes.count`)

```ts
const paginationMeta: PaginationMeta = {
  page,
  pageSize,
  total: projectsRes.count ?? 0,
};
```

After the fix, `projectsRes.count` will be the filtered count because filters are applied to the same query that sets `count: "exact"`.

---

## Notes for Implementation Agent

- **Customer filter bug**: `params.customer` is already declared in `searchParams` (page.tsx line 9) and read by the client (line 70), but `.eq("customer_id", params.customer)` is never applied to the DB query. Adding this guard is a one-liner fix for that dimension.
- **Company-name is not on `projects`**: It is joined in memory after the query. Server-side search on company name requires the two-step lookup: fetch matching `customer_id`s from `customers` first, then use `.or("name.ilike.%q%,customer_id.in.(...)")` on projects. If `searchCustomerIds` is an empty array (no matching companies), the `.in()` arm would match nothing — use only the `.ilike` on `name` in that case (see Step 1 logic).
- **PostgREST `.or()` with `.in()`**: The syntax for Supabase JS `or()` with an `in` clause is `customer_id.in.(id1,id2,id3)` — note the parentheses inside the filter string, not brackets.
- **`searchInput` local state**: Keep a `useState` for the raw text input so the field feels instant to type in, and only push to the URL after the 300 ms debounce fires. Sync the initial value from `searchParams.get("search") ?? ""` on mount.
- **Reset `page` to `1`**: Every `buildUrl` call for search and status changes must include `page: 1` in the overrides — same as `handleViewChange` already does.
- **`showPagination`**: currently checks `filtered.length > 0`. After removing `filtered`, check `total > 0` instead (total from `paginationMeta`, which is now the filtered server count).
- **`hasPrev` and `hasNext`**: Already computed from `paginationMeta.page`/`total` — no change needed once `total` is the filtered count.
- **The `customersRes` parallel query** can remain unchanged — it's used to populate the customer filter dropdown and for the `nameMap` lookup, both of which still need all customers.
- **Model rationale**: haiku — two-file change following an established URL-push pattern already present in the same file; no new architecture or schema changes.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Company-name search strategy | Two-step lookup (fetch matching customer_ids from `customers`, then `.or()` on projects) |
| Debounce delay | 300 ms |
| Client-side `filtered` useMemo | Remove entirely — URL is the single source of truth |
