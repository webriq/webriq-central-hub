# Projects Listing — Classification Tabs Replace the V2 Tab + Classification Filter

> **Status:** TESTING
> **Priority:** MEDIUM
> **Type:** enhancement
> **Version Impact:** minor
> **Created:** 2026-09-11
> **Completed:** 2026-09-11
> **Platform:** Web
> **Automation:** manual

## Implementation Notes

### Scope correction — the target was the sidebar, not an in-page tab strip

The plan below built the classification switcher as a tab strip inside `_listing-shell.tsx` (the shared header
for `/projects/v2` and `/projects/legacy`), reading "Replace the V2 Projects tab" as referring to that header's
existing task-279 badge + switch-link. After shipping and running `/simplify` on that version, the user clarified
the actual target was the **sidebar's "Projects" nav group** (`v2-hub-sidebar.tsx`), which today shows "V2
Projects" / "Legacy Projects" as its two children — that IS the "V2 Projects tab" the original request meant.

Corrected shape, confirmed with the user:
- Sidebar "Projects" group expands to 7 links: the six classifications + **Legacy**, replacing the old
  "V2 Projects" / "Legacy Projects" pair — reusing the exact `/projects/v2?tab=<slug>` routes already built.
- The in-page tab strip is **removed**. `_listing-shell.tsx` reverts to title-only; the sidebar is now the sole
  way to switch classifications, and the listing's own toolbar line ("N StackShift I projects") still surfaces
  which one is active.

All of the data-layer work below (the `_classification-tabs.ts` catalog, the `_load-list-data.ts` join filter,
the `?tab=` routing, the PATCH route's `classifications[]` sync) is unaffected by this correction — only the
*presentation* of tab-switching moved from the page header to the sidebar, so none of it needed to be redone.

**New technical issue this surfaced and fixed:** the sidebar's child-link active-state check
(`pathname === child.href`) is pathname-only. All seven new children would share the pathname `/projects/v2`,
differing only by `?tab=`, so without a fix every classification link would render "active" simultaneously.
Fixed with a query-aware `isChildActive()` that resolves the current URL's tab via the same
`parseClassificationTab()` the page itself uses (so a bare `/projects/v2` with no `?tab=` correctly highlights
StackShift I, matching the page's own default) and compares that against the `?tab=` value each href encodes.
Plain-pathname children (Legacy, Tickets, Contacts, …) are unaffected — the query-comparison branch only runs
when the href actually has a `?`.

**Verified this doesn't break the production build:** this sidebar is mounted on every `(hub)` page via
`(hub)/layout.tsx` → `v2-hub-shell.tsx`, so adding `useSearchParams()` to it is exactly the shape Next.js's
"useSearchParams() should be wrapped in a Suspense boundary" build error targets. Ran a full `pnpm build`
(exit 0, all 141 routes generated, no warnings) to confirm it's fine as-is — the `(hub)/layout.tsx`'s use of
`headers()` already forces the whole route group into dynamic rendering, so there's no static shell for a
missing Suspense boundary to break.

### Original (in-page tab strip) implementation notes

Ten files: one created, eight modified, plus this doc.

**The join filter shipped — the fallback was not needed.** `customer_products!inner(...)` +
`.or('classification.eq."<C>",classifications.cs.{"<C>"}', { referencedTable: "customer_products" })` works:
PostgREST accepts the double-quoted values (five of the six classifications contain a space) and the
brace-array literal, and `count: "exact"` reflects the join filter. Verified against the live database with a
throwaway script that computed a ground truth in JS from fully-paged `customer_products` + `projects` reads and
diffed it against the shipped query, per tab:

```
customer_products rows: 46
projects rows: 264  (after base filters: 16)
base projects whose product has NEITHER classification nor classifications: 0

StackShift I             query count=  15  expected=  15  MATCH
StackShift II            query count=   0  expected=   0  MATCH
StackShift Access        query count=   1  expected=   1  MATCH
StackShift Access Plus   query count=   0  expected=   0  MATCH
PipelineForge            query count=   1  expected=   1  MATCH
Discrete Development     query count=   1  expected=   1  MATCH

distinct projects across all six tabs: 16
sum of tab counts: 18  (exceeds distinct by 2 => multi-classified)
projects appearing in >1 tab: 2
   2 tabs: "Retail Sign Systems Website"            -> StackShift I + PipelineForge
   2 tabs: "Trident Roof Solutions App August 2026" -> StackShift I + Discrete Development
```

The two multi-classified projects confirm the union rule end to end — each is reachable from both of its tabs,
which is the behaviour chosen over primary-only during planning. (Service key, so RLS was bypassed: this
verifies *filter semantics*, not role scoping, which task 361 does not touch.) The script was deleted after the
run; it is reproducible from this block if the query ever needs re-checking.

Also worth noting from that output: **StackShift II and StackShift Access Plus currently have zero projects**,
so those two tabs land on the empty state by default. That is real data, not a bug — but it is the most likely
thing to look wrong at first glance during acceptance.

**Deviations / judgement calls:**
- `handleMultiChange`'s key parameter narrowed to the literal `"status"` rather than being left as a widened
  union — the second member no longer exists, and a one-member union is the honest type.
- The `classifications[]` sync in the PATCH route collapsed to a single expression rather than the two branches
  the plan sketched. Both branches reduced to `[next, ...existing.filter(c => !isVariant(c) && c !== next)]`;
  the comment explains why that is correct for both the variant and non-variant cases.
- The filtered-empty-state copy gained "…or switch to another classification tab", since with no "All" tab a
  user searching in the wrong tab has no other cue.
- `isFiltered` deliberately does **not** count the active tab, so an empty tab shows "No X projects" rather
  than the "no match, clear your filters" state.
- **Not** fixed (pre-existing, out of scope): the same PATCH route leaves `customer_products.product_name`
  ("StackShift" / "PipelineForge") untouched when the classification changes across product families, so that
  column can drift. Task 361 does not read `product_name`, and task 268 never maintained it either.

**Verification run:** `npx tsc --noEmit` exit 0; `pnpm lint` clean (2 pre-existing unrelated warnings in
`onboarding-workspace/_checklist-tab.tsx`). All eight `/projects/v2?tab=…` variants plus `/projects` and
`/projects/legacy` return 307 (the proxy auth redirect) with no 500s and no compile errors in the dev log.

**Browser acceptance NOT RUN** — the Claude-in-Chrome extension is not connected in this environment, and the
listing sits behind the auth guard so an unauthenticated request never reaches the render path. The visual
checklist below (tab strip, active state, wrapping, empty states, Clear-filters target) is unverified and needs
a signed-in pass.

## Overview

The `/projects` listing currently has a two-tab identity (**V2 Projects** / **Legacy Projects**) rendered as a
badge + one "switch to the other tab" link, and the V2 listing carries a **Classification** multi-select filter
in its toolbar. This task replaces that with a real seven-tab strip — one tab per classification, plus Legacy —
and deletes the Classification filter, since the tab now *is* the classification selection.

Final tab strip:

```
[ StackShift I ] [ StackShift II ] [ StackShift Access ] [ StackShift Access Plus ]
[ PipelineForge ] [ Discrete Development ]   │   [ Legacy ]
```

Each classification tab shows every V2 project carrying that classification. **Legacy Projects** keeps its
existing listing and route, relabelled to just **Legacy**.

## Requirements

### Must Have
- [x] Tab strip on `/projects/v2` and `/projects/legacy` with the six classifications + Legacy, in the order above.
- [x] Clicking a classification tab shows only that classification's projects.
- [x] The **Classification** `FilterMultiSelect` is removed from the V2 toolbar (Status, Sort, search, pagination stay).
- [x] The "Legacy Projects" tab is relabelled **Legacy**; its route, listing and behaviour are otherwise unchanged.
- [x] Bare `/projects/v2` (no `?tab=`) resolves to **StackShift I**; an unrecognized `?tab=` value falls back to it too.
- [x] Bare `/projects` still redirects to the last visited tab, now including *which* classification tab.
- [x] A project carrying more than one classification appears under **every** classification it carries.
- [x] No "All" tab — the six classifications and Legacy are the complete set.
- [x] No per-tab counts.

### Nice to Have
- [x] Tab strip wraps gracefully on narrow viewports rather than clipping (`flex-wrap`, no horizontal scroll).

## Decisions (confirmed with the user during planning)

| Question | Decision | Consequence |
|---|---|---|
| An "All" tab? | **No** — six classifications + Legacy only | There is no cross-classification V2 view; search only searches within the active tab. Bare `/projects/v2` defaults to StackShift I, so every existing link to `V2_ROUTES.PROJECTS_V2` (PM dashboard, marketing dashboard, `/portfolio-tracker` redirect, New/Import project "back" buttons, Status Report back-link, `_load-detail-data.ts` redirect) now lands on the StackShift I tab instead of the unfiltered list. Accepted. |
| Multi-classification projects | **Appear under every classification they carry** | Matching reads `customer_products.classifications[]` **∪** `customer_products.classification`, not just the primary column. See "Matching rule" below. |
| Per-tab counts | **No** | One list query per page load, exactly as today. The active tab's count still shows in the header line. |

## Current State

`/projects` is a client-side redirect to the last-visited tab. Two sibling routes render the two listings, both
wrapped in a shared `ListingShell`:

**Current Files:**
| File | Purpose |
|------|---------|
| `src/app/(hub)/projects/page.tsx` | Client redirect: `/projects` → `/projects/v2` or `/projects/legacy` per `useLastTab()` |
| `src/app/(hub)/projects/_use-last-tab.ts` | `localStorage`-backed last-tab memory (`ProjectsTabId = "v2" \| "legacy"`), `useSyncExternalStore` pattern |
| `src/app/(hub)/projects/_listing-shell.tsx` | Shared header: `Projects` title + V2/Legacy badge + one `ArrowLeftRight` link to the other tab |
| `src/app/(hub)/projects/v2/page.tsx` | Server component; parses `searchParams` (incl. `classification`), calls `loadOnboardingProjectsList()` |
| `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` | Server query: role/membership scoping, status + classification + search filters, sort, pagination |
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | V2 listing client component; toolbar (search, Status, **Classification**, Sort), grid, pagination, empty states |
| `src/app/(hub)/projects/legacy/page.tsx` | Server component for the Legacy listing (unchanged by this task except the shell prop) |
| `src/app/(hub)/projects/_v2-listing/_filter-multi-select.tsx` | `FilterMultiSelect` + `parseMultiParam` — **shared** with `v2/status-report/_status-report-client.tsx`; must stay |
| `src/app/api/v2/projects/[projectId]/classification/route.ts` | `PATCH` behind the card menu's "Update classification" modal — writes `classification` only |
| `src/config/customer-phases.ts` | `CLASSIFICATIONS` (the six values), `Classification` type, `STACKSHIFT_VARIANTS` |

Today's classification filtering in `_load-list-data.ts` (lines 45–68, 122–133):
- excludes any project whose linked `customer_products` row has `classification IS NULL` (import noise), via an
  unbounded `.select("id").is("classification", null)` lookup — **a latent >1000-row truncation bug** per
  CLAUDE.md's pagination rule;
- when `?classification=` is present, does a two-step lookup on `customer_products.classification` (primary only),
  then `customer_product_id.in.(…)`.

## Proposed Solution

### Architecture

**Routing — query param, not a path segment.** `/projects/v2/<slug>` is impossible: `/projects/v2/[projectId]`
already owns that segment (and `[projectId]` there is the display `project_id`, not a UUID — see CLAUDE.md's
`projects` bullet), so a classification slug would collide with a real project. The active tab therefore lives in
`?tab=<slug>` on `/projects/v2`. Legacy keeps its own route `/projects/legacy`.

Slugs (stable, URL-safe, one per `CLASSIFICATIONS` entry):

| Tab label | `?tab=` slug | `Classification` value |
|---|---|---|
| StackShift I | `stackshift-i` | `StackShift I` |
| StackShift II | `stackshift-ii` | `StackShift II` |
| StackShift Access | `stackshift-access` | `StackShift Access` |
| StackShift Access Plus | `stackshift-access-plus` | `StackShift Access Plus` |
| PipelineForge | `pipelineforge` | `PipelineForge` |
| Discrete Development | `discrete-development` | `Discrete Development` |
| Legacy | *(n/a — own route)* | *(n/a)* |

**Matching rule.** A project belongs to tab *X* when its linked `customer_products` row satisfies
`classifications @> {X}` **OR** `classification = X`. The union (not "array, falling back to the column") is
deliberate — there are three row shapes in live data:

1. Rows created by the New Project intake / CSV import / StackShift-order convert write **both** `classification`
   (the primary — the StackShift variant when one is selected, else the first) and `classifications` (the full
   multi-select array). The array alone would be correct for these.
2. Rows predating task 157's multi-select have an empty `classifications` array and only the single
   `classification` column. The array alone would drop them entirely.
3. Rows edited through the card menu's **Update classification** modal: `PATCH /api/v2/projects/[projectId]/classification`
   writes `classification` only and leaves `classifications` stale. The array alone would show these under their
   *old* tab and never the new one.

The union covers 1 and 2 correctly. Shape 3 is fixed at the source — see Step 5 — because the union alone would
leave such a project visible in **both** the old and the new tab.

**Query shape.** Replace the two unbounded `customer_products` pre-queries with a single `!inner` embed plus a
referenced-table `or()` filter, so PostgREST does the join-filter in one round trip and there is no
`customer_product_id.in.(<thousands of uuids>)` URL to blow up:

```ts
supabase.from("projects")
  .select(`…, customers(company_name), customer_products!inner(classification, classifications)`, { count: "exact" })
  .or(`classification.eq."${c}",classifications.cs.{"${c}"}`, { referencedTable: "customer_products" })
```

This also **removes** the unbounded `null`-classification lookup: an unclassified row matches neither side of the
`or`, so it is excluded by construction — which is exactly the behaviour task 272 wanted, now without the
pagination bug.

### File Changes

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/app/(hub)/projects/_classification-tabs.ts` | Tab catalog: `ClassificationTabId`, `ProjectsTabId`, `CLASSIFICATION_TABS`, `DEFAULT_CLASSIFICATION_TAB`, `parseProjectsTab()`, `classificationForTab()`, `tabHref()`. Plain module (no `"use client"`) — imported by both the server page and the client shell. |
| MODIFY | `src/app/(hub)/projects/_use-last-tab.ts` | `ProjectsTabId` moves to `_classification-tabs.ts`; `isValidTab`/`DEFAULT_TAB` updated to the new 7-value union. Storage key unchanged — an old `"v2"` value is simply unrecognized and falls back. |
| MODIFY | `src/app/(hub)/projects/_listing-shell.tsx` | Badge + `ArrowLeftRight` switch link → seven-tab strip. Drop `TAB_LABEL`/`TAB_BADGE`/`TAB_BADGE_STYLE`/`OTHER_TAB` and the `ArrowLeftRight` import. |
| MODIFY | `src/app/(hub)/projects/page.tsx` | Redirect target now `/projects/legacy` or `/projects/v2?tab=<slug>`. |
| MODIFY | `src/app/(hub)/projects/v2/page.tsx` | `searchParams.classification` → `searchParams.tab`; resolve to a `ClassificationTabId`; pass `classification` to the loader and `classificationLabel` to the listing; `activeTab={tabId}`. |
| MODIFY | `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` | `classificationValues: string[] \| null` → `classification: Classification` (single, required). Two pre-queries → one `!inner` + referenced-table `or()`. Delete the `null`-classification exclusion and the `"unclassified"` strip. |
| MODIFY | `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Remove the Classification `FilterMultiSelect`, `CLASSIFICATION_OPTIONS`, `classificationSelected`, and `"classification"` from `handleMultiChange`'s key union. Header line + empty states become tab-aware. "Clear filters" must preserve `?tab=`. |
| MODIFY | `src/app/(hub)/projects/legacy/page.tsx` | One-line change: `activeTab="legacy"` still valid — verify the prop type after the union widens. |
| MODIFY | `src/app/api/v2/projects/[projectId]/classification/route.ts` | Keep `classifications[]` in sync when the primary `classification` is updated (see Step 5). |
| MODIFY | `CLAUDE.md` | Document the `?tab=` convention under Key Conventions (next to the task-359 Files-tab deep-link bullet). |

**Explicitly out of scope / untouched:** `_filter-multi-select.tsx` (still used for Status here and for four
filters on the Status Report page), `v2/status-report/_status-report-client.tsx` (keeps its own client-side
Classification filter, including its `"unclassified"` option), `_legacy-listing/*`, `projects-old/*`,
`GET /api/onboarding/projects`, `_project-card.tsx`'s classification chip (still useful — it shows the *primary*
classification, which for a multi-classified project differs from the active tab).

## Implementation Steps

### Step 1: Tab catalog module

Create `src/app/(hub)/projects/_classification-tabs.ts`:

```ts
import { CLASSIFICATIONS, type Classification } from "@/config/customer-phases";
import { V2_ROUTES } from "@/config/constants";

// Task 361 — the /projects listing's tab strip is one tab per classification plus Legacy.
// The active classification lives in `?tab=<slug>` on /projects/v2, NOT in a path segment:
// /projects/v2/[projectId] already owns that segment (and holds a display project_id there),
// so /projects/v2/stackshift-i would resolve as a project lookup.

export type ClassificationTabId =
  | "stackshift-i" | "stackshift-ii" | "stackshift-access"
  | "stackshift-access-plus" | "pipelineforge" | "discrete-development";

export type ProjectsTabId = ClassificationTabId | "legacy";

export const CLASSIFICATION_TABS: { id: ClassificationTabId; classification: Classification; label: string }[] = [
  { id: "stackshift-i",           classification: "StackShift I",           label: "StackShift I" },
  { id: "stackshift-ii",          classification: "StackShift II",          label: "StackShift II" },
  { id: "stackshift-access",      classification: "StackShift Access",      label: "StackShift Access" },
  { id: "stackshift-access-plus", classification: "StackShift Access Plus", label: "StackShift Access Plus" },
  { id: "pipelineforge",          classification: "PipelineForge",          label: "PipelineForge" },
  { id: "discrete-development",   classification: "Discrete Development",   label: "Discrete Development" },
];

export const DEFAULT_CLASSIFICATION_TAB: ClassificationTabId = "stackshift-i";

export function parseClassificationTab(raw: string | null | undefined): ClassificationTabId {
  const hit = CLASSIFICATION_TABS.find((t) => t.id === raw);
  return hit ? hit.id : DEFAULT_CLASSIFICATION_TAB;
}

export function classificationForTab(id: ClassificationTabId): Classification {
  return (CLASSIFICATION_TABS.find((t) => t.id === id) ?? CLASSIFICATION_TABS[0]).classification;
}

export function labelForTab(id: ClassificationTabId): string {
  return (CLASSIFICATION_TABS.find((t) => t.id === id) ?? CLASSIFICATION_TABS[0]).label;
}

export function classificationTabHref(id: ClassificationTabId): string {
  return `${V2_ROUTES.PROJECTS_V2}?tab=${id}`;
}

export function isLegacyTab(id: ProjectsTabId): id is "legacy" {
  return id === "legacy";
}
```

> Assert at authoring time that `CLASSIFICATION_TABS.map(t => t.classification)` is exactly `CLASSIFICATIONS` —
> if a seventh classification is ever added to `customer-phases.ts`, this file needs a matching row. Add a
> compile-time guard so a drift is a type error, not a silently missing tab:
> ```ts
> const _exhaustive: Record<Classification, ClassificationTabId> = Object.fromEntries(
>   CLASSIFICATION_TABS.map((t) => [t.classification, t.id])
> ) as Record<Classification, ClassificationTabId>;
> void _exhaustive;
> ```
> (The `as` cast means this catches an *added* classification only via a follow-on `satisfies`; if that proves
> awkward, a literal object map keyed by `Classification` is the cleaner form — use whichever type-checks.)

### Step 2: `_use-last-tab.ts`

Re-point the type and default; keep the storage key and the whole `useSyncExternalStore` machinery as-is.

```ts
import { CLASSIFICATION_TABS, DEFAULT_CLASSIFICATION_TAB, type ProjectsTabId } from "./_classification-tabs";
export type { ProjectsTabId };            // keep the existing import site working

const DEFAULT_TAB: ProjectsTabId = DEFAULT_CLASSIFICATION_TAB;

function isValidTab(v: unknown): v is ProjectsTabId {
  return v === "legacy" || CLASSIFICATION_TABS.some((t) => t.id === v);
}
```

The storage key stays `"projects-v2-tab-order"` — a stale `{ lastTab: "v2" }` from before this task fails
`isValidTab` and falls back to StackShift I, which is the file's documented behaviour for unrecognized values.

### Step 3: `_listing-shell.tsx` — the tab strip

Replace the badge + switch-link row. Keep the fixed-light palette and the `setLastTab(activeTab)` effect. The
outer `pt-6` / no-`pb` comment still applies to the last row in this header.

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { useLastTab } from "./_use-last-tab";
import { CLASSIFICATION_TABS, classificationTabHref, type ProjectsTabId } from "./_classification-tabs";

const TAB_BASE = "inline-flex shrink-0 items-center rounded-full border px-3.5 py-[6.5px] text-[12px] font-semibold transition-colors duration-150";
const TAB_ON = "border-[#071133] bg-[#071133] text-white";
const TAB_OFF = "border-[#E2E7F2] bg-white text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]";

export default function ListingShell({ activeTab, children }: { activeTab: ProjectsTabId; children: React.ReactNode }) {
  const { setLastTab } = useLastTab();
  useEffect(() => { setLastTab(activeTab); }, [activeTab, setLastTab]);

  return (
    <div className="min-h-full bg-[#F4F6FB]">
      <div className="max-w-350 mx-auto px-8 pt-6">
        <div className="flex items-center gap-2.5">
          <LayoutGrid size={20} className="text-[#5F6A88]" />
          <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">Projects</h1>
        </div>

        {/* Seven tabs wrap rather than scroll — a clipped tab is worse than a second row. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          {CLASSIFICATION_TABS.map((t) => (
            <Link key={t.id} href={classificationTabHref(t.id)} aria-current={activeTab === t.id ? "page" : undefined}
                  className={cn(TAB_BASE, activeTab === t.id ? TAB_ON : TAB_OFF)}>
              {t.label}
            </Link>
          ))}
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[#E2E7F2]" />
          <Link href={V2_ROUTES.PROJECTS_LEGACY} aria-current={activeTab === "legacy" ? "page" : undefined}
                className={cn(TAB_BASE, activeTab === "legacy" ? TAB_ON : TAB_OFF)}>
            Legacy
          </Link>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
```

**Tab links are bare** — `?tab=<slug>` only. Switching tabs deliberately drops `search`, `status`, `sort`,
`page` and `pageSize` rather than carrying them across: the filters are per-tab working state, and a stale
`?search=` silently producing an empty tab is the worse failure. Document that choice in a comment.

Note the removed bottom padding contract: the old comment explained that each listing's own sticky header opens
with `pt-6`, so this shell adds none. That still holds — the tab row is the last thing in the shell header.

### Step 4: `v2/page.tsx` and `_load-list-data.ts`

**`v2/page.tsx`** — swap `classification` for `tab` in `SearchParams`, resolve, and thread through:

```ts
type SearchParams = { search?: string; status?: string; tab?: string; sort?: string; page?: string; pageSize?: string };
…
const tabId = parseClassificationTab(params.tab);
const classification = classificationForTab(tabId);
…
const { projects, paginationMeta, canCreate } = await loadOnboardingProjectsList(userId, role, {
  search: params.search?.trim() ?? "",
  statusValues,
  classification,
  sort: params.sort ?? "newest",
  page,
  pageSize,
});

return (
  <ListingShell activeTab={tabId}>
    <V2ProjectsListing … classificationLabel={labelForTab(tabId)} />
  </ListingShell>
);
```

Delete the `classificationValues` parsing line entirely.

**`_load-list-data.ts`:**

1. `OnboardingListParams.classificationValues: string[] | null` → `classification: Classification` (import the
   type from `@/config/customer-phases`).
2. Delete the `classificationValues` "unclassified"-strip block (lines ~45–65), the `classificationOrParts`
   two-step lookup, the `nullClassificationProducts` query (~67–68), and the `if (nullClassificationProductIds…)`
   / `if (classificationOrParts !== null)` branches (~122–133). Replace the `customer_products(classification)`
   embed and add the join filter:

```ts
  let query = supabase
    .from("projects")
    .select(
      `
      id, project_id, name, customer_id,
      programme_started_at, programme_duration_days, scheduled_onboarding_start_at,
      customer_product_id, created_at, created_by, onboarding_status, target_handover_at,
      customers(company_name),
      customer_products!inner(classification, classifications)
    `,
      { count: "exact" }
    )
    .gte("created_at", "2026-07-06T00:00:00Z")
    .neq("status", "deleted")
    .not("customer_product_id", "is", null)
    // Task 361 — tab membership: the row's multi-select array OR its primary column. Union, not
    // fallback: pre-task-157 rows have an empty array, and PATCH …/classification (task 268)
    // updates only the primary column. `!inner` makes this a join filter, so a customer_products
    // row with neither value set (legacy/Zoho import noise — task 272) drops out by construction,
    // which is what the old unbounded `.is("classification", null)` exclusion query was for.
    .or(
      `classification.eq."${params.classification}",classifications.cs.{"${params.classification}"}`,
      { referencedTable: "customer_products" }
    )
    .order(sortSpec.column, { ascending: sortSpec.ascending, nullsFirst: sortSpec.nullsFirst });
```

   The double quotes around the value are required — every classification except `PipelineForge` contains a
   space. `params.classification` is never user input: it comes from `classificationForTab()`, which only ever
   returns a literal from `CLASSIFICATIONS`, so the template interpolation cannot be injected into.

3. `ZERO_ROWS_ID` stays — it is still used by the status and `allowedProjectIds` branches.

**Verification of the `!inner` + `referencedTable` form is a required implementation step.** If PostgREST rejects
the quoting or `referencedTable` behaves unexpectedly on `count: "exact"`, fall back to the two-step lookup the
file already uses — but page it properly per CLAUDE.md's 1000-row rule:

```ts
const PAGE = 1000;
const matchingProductIds: string[] = [];
for (let offset = 0; ; offset += PAGE) {
  const { data } = await supabase.from("customer_products")
    .select("id, classification, classifications").range(offset, offset + PAGE - 1);
  const rows = data ?? [];
  for (const r of rows) {
    if (r.classification === params.classification || (r.classifications ?? []).includes(params.classification)) {
      matchingProductIds.push(r.id);
    }
  }
  if (rows.length < PAGE) break;
}
query = matchingProductIds.length > 0
  ? query.in("customer_product_id", matchingProductIds)
  : query.eq("id", ZERO_ROWS_ID);
```

Prefer the join filter; record in the task doc which one shipped.

### Step 5: Keep `classifications[]` in sync on the classification PATCH

`PATCH /api/v2/projects/[projectId]/classification` currently does `.update({ classification })` and leaves
`classifications` holding the pre-edit value. Under the new union matching rule that makes an edited project show
up in **two** tabs at once (its old array value and its new primary). Fix it at the source, mirroring the
primary-derivation rule used at intake (`classifications.find(c => STACKSHIFT_VARIANTS.includes(c)) ?? classifications[0]`):

```ts
// Read the existing array alongside the row id, then:
const existing = (product?.classifications ?? []) as Classification[];
const nextClassifications: Classification[] = STACKSHIFT_VARIANTS.includes(classification as Classification)
  // New primary is a StackShift variant: swap out whichever variant was there, keep the rest.
  ? [classification as Classification, ...existing.filter((c) => !STACKSHIFT_VARIANTS.includes(c))]
  // New primary is NOT a variant, which (by the primary rule) means the set now has no variant at all.
  : [classification as Classification, ...existing.filter((c) => !STACKSHIFT_VARIANTS.includes(c) && c !== classification)];

await supabase.from("customer_products").update({ classification, classifications: nextClassifications })…
```

Leave the route's auth, `CLASSIFICATIONS` validation, and response shape alone.

### Step 6: `_onboarding-list.tsx` — drop the filter, make copy tab-aware

1. **Remove** the `CLASSIFICATION_OPTIONS` const, the `CLASSIFICATIONS` import from `@/config/customer-phases`,
   the `classificationSelected` line, the whole `<FilterMultiSelect label="Classification" …>` block and its
   comment, and the `classificationSelected.length !== …` term from `isFiltered`.
2. Narrow `handleMultiChange`'s key parameter from `"status" | "classification"` to `"status"`.
3. Keep the `FilterMultiSelect` / `parseMultiParam` imports — Status still uses both.
4. New prop `classificationLabel: string`. Header line (currently line ~173, the "Current classifications: …"
   sentence) becomes:
   ```tsx
   {`${total} ${classificationLabel} project${total === 1 ? "" : "s"}`}
   ```
5. Both "Clear filters" buttons currently `navigate(V2_ROUTES.PROJECTS_V2)`, which would drop the active tab and
   bounce the user to StackShift I. Change both to `navigate(classificationTabHref(activeTabId))` — pass the tab
   id down as a prop alongside the label, or rebuild from `searchParams.get("tab")`.
6. Empty states become tab-aware:
   - unfiltered-empty: "No {classificationLabel} projects" / "No project in this classification yet." (keep the
     `canCreate` branch's "Start a new intake…" copy).
   - filtered-empty: unchanged copy, but the reset button per (5).

`buildUrl()` needs no change — it copies the current `searchParams`, so `tab` rides along through search, status,
sort and pagination automatically.

### Step 7: `page.tsx` redirect + CLAUDE.md

```tsx
router.replace(lastTab === "legacy" ? V2_ROUTES.PROJECTS_LEGACY : classificationTabHref(lastTab));
```

Add to CLAUDE.md's Key Conventions, near the task-359 Files-tab deep-link bullet:

> **Projects listing tabs** (task 361) — `/projects` is a tab strip of the six `CLASSIFICATIONS` plus **Legacy**.
> The active classification is `?tab=<slug>` on `/projects/v2` (slugs + helpers in
> `src/app/(hub)/projects/_classification-tabs.ts`), **not** a path segment — `/projects/v2/[projectId]` already
> owns that segment. Bare `/projects/v2` and any unrecognized slug resolve to `stackshift-i`. There is no "All"
> tab and no separate Classification filter; tab membership is `customer_products.classifications[] ∪
> customer_products.classification`, so a multi-classified project appears under every classification it carries.
> `/projects/legacy` is its own route and keeps its own listing.

## Testing Checklist

**Sidebar (the corrected surface — see Implementation Notes):**
- [ ] Sidebar "Projects" group expands to exactly 7 links, in order: StackShift I, StackShift II, StackShift
      Access, StackShift Access Plus, PipelineForge, Discrete Development, Legacy.
- [ ] On bare `/projects/v2` (no `?tab=`), the **StackShift I** sidebar link shows active — not zero links, not
      more than one.
- [ ] Clicking each of the six classification links updates the listing and moves the active-link highlight to
      that link only; the other five (and Legacy) are not highlighted.
- [ ] Clicking **Legacy** navigates to `/projects/legacy` and highlights only that link.
- [ ] Clicking the "Projects" parent icon while collapsed navigates to bare `/projects`, which redirects to the
      last-visited tab (sidebar behavior unchanged from task 279 here).
- [ ] Sidebar collapse/expand still works normally for the Projects group and every other group (Desk, etc.) —
      the `isChildActive` rework didn't touch plain-pathname children.
- [ ] `pnpm build` succeeds with no "useSearchParams() should be wrapped in a suspense boundary" error (already
      verified once — re-check if this file is touched again).

**Listing pages (`/projects/v2`, `/projects/legacy`) — no visible tab UI, title-only header:**
- [ ] `/projects/v2` with no query lands on **StackShift I** data (toolbar reads "N StackShift I projects").
- [ ] Each of the six classifications' sidebar link shows only projects of that classification; spot-check one
      project per classification against its `customer_products` row.
- [ ] A project with two classifications (e.g. StackShift I + Discrete Development) appears under **both**.
- [ ] A pre-task-157 project (empty `classifications` array, `classification` set) still appears under its tab.
- [ ] Projects with no classification at all appear in **no** tab (task 272's exclusion still holds).
- [ ] The Classification filter is gone from the toolbar; Status, Sort, search and pagination still work and
      preserve `?tab=` across every interaction.
- [ ] "Clear filters" (both the toolbar button and the empty-state button) returns to the **current** tab, not
      StackShift I.
- [ ] Pagination past page 1, then switching classification via the sidebar, resets to page 1 of the new one.
- [ ] The Legacy listing renders exactly as before (grid/list toggle, `?customer=` deep link, its own filters).
- [ ] Bare `/projects` redirects to the last tab visited, including which classification, across a reload.
- [ ] A browser with a stale `{ lastTab: "v2" }` in `localStorage` lands on StackShift I without erroring.
- [ ] `?tab=bogus` falls back to StackShift I rather than 404ing or showing an empty list.
- [ ] Card menu → **Update classification** to a different classification: after `router.refresh()` the card
      leaves the current tab and appears under exactly one new tab (not both) — verifies the PATCH route's
      `mergeClassificationUpdate()` sync.
- [ ] Role checks unchanged: sign in as `developer` and as `marketing` — the same membership/allow-list scoping
      applies within each classification.
- [ ] `/projects/v2/status-report` still has its own Classification filter, unaffected.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Dependencies

- Required packages: none.
- Required APIs: none new. One existing route modified (`PATCH /api/v2/projects/[projectId]/classification`).
- Database: no migration. Reads `customer_products.classification` + `.classifications` (both already exist).
- Blocked by: nothing.

## Notes for Implementation Agent

- **Do not delete `_filter-multi-select.tsx` or `parseMultiParam`** — Status uses them here and
  `v2/status-report/_status-report-client.tsx` uses them for four filters including its own Classification one.
- **`/projects/v2/<slug>` is not an option.** `[projectId]` owns that segment. Keep the tab in `?tab=`.
- The `.or(..., { referencedTable })` form is the intended shape but **must be verified against the live
  database** before the task is called done — a silently-wrong join filter would look like "this tab is empty",
  not like an error. Run each of the six tabs and compare row counts against a direct SQL check. If it does not
  work, use the paged two-step fallback in Step 4 and say so in the shipped doc.
- Deleting the old unbounded `.is("classification", null)` lookup is a real bugfix, not incidental cleanup —
  CLAUDE.md flags exactly this shape as having caused two live-run bugs. Do not reintroduce an unpaginated
  `customer_products` scan in the fallback path.
- Every existing link to bare `V2_ROUTES.PROJECTS_V2` now lands on StackShift I. That is the accepted consequence
  of having no "All" tab — do not "fix" it by adding one.
- Follow the page's fixed-light palette (`#F4F6FB` / `#E2E7F2` / `#0B1533` / `#5F6A88`); this shell is explicitly
  **not** `isDark`-aware (see its header comment) and must stay that way.
- No emoji, no `style={{}}`, Tailwind scale values over arbitrary brackets where one exists.

## Related

- Task 279 — split `/projects-v2?tab=` into the `/projects/v2` + `/projects/legacy` routes and introduced
  `ListingShell` / `_use-last-tab.ts`.
- Task 272 — excluded null-classification (legacy import) projects from the V2 listing.
- Task 224 — introduced the Status + Classification `FilterMultiSelect` pair this task halves.
- Task 157 — multi-select classification at intake (`customer_products.classifications`).
- Task 268 — the Update-classification modal and its PATCH route (amended here in Step 5).
