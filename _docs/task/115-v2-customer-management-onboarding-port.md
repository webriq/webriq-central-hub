# 115: v2 Customer Management & Onboarding — Full Port from v1

**Created:** 2026-07-08
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

v1's customer management (list, 2174-line profile page, new-customer wizard) is fully built at `src/app/(hub)/customers/**` and `src/app/(hub)/dashboard/customers/**`. v2 has only a real customer **list** (`src/app/v2/(hub)/customers/page.tsx` + `_customers-index.tsx`) — the profile page and onboard wizard are 7-line placeholder stubs. This task ports v1's customer profile and onboarding-creation features into v2, reusing the already-shared `/api/customers/**` REST layer and the version-agnostic onboarding form engine, and closes a route-tree duplication bug uncovered during investigation.

User decisions locked in for this task (asked via `/task` clarification):
1. **Full port** of v1's profile page — all features (company info edit, products, projects, assets/secrets, onboarding responses view+edit, reopen-onboarding), not a scoped-down or read-only version.
2. **List gets live onboarding-progress** — add the per-product completion display + Supabase Realtime subscription on `customer_products` that v1's list has and v2's doesn't. Skip porting v1's `usePMSettings` dark/light theme toggle for the list specifically (v2's list currently has no theme branching at all — adding just the subscription/progress keeps the diff focused).

## Requirements

- [ ] `/v2/customers/[customerId]` renders a full-featured profile page with parity to v1: company info view/edit, products (active + archived tabs, add/edit/archive), projects (add/edit, Zoho project creation toggle), assets/secrets (add, delete, reveal/mask), onboarding responses (view + inline edit), reopen-onboarding action.
- [ ] `/v2/customers/onboard` renders the 3-step wizard (Company Info → Products → Review) and creates a customer + selected products via the shared `/api/customers` REST layer, ending in a success screen with the `WRQ-CUST-XXXX` ID and a copyable public onboarding link.
- [ ] `_customers-index.tsx`'s list gains a per-product onboarding-progress indicator and a live Realtime subscription on `customer_products` UPDATE so progress reflects without a manual refresh, matching v1's `ClientsTab` behavior.
- [ ] `_customers-index.tsx` gets a "+ New Customer" entry point wired to `V2_ROUTES.CUSTOMERS_ONBOARD`.
- [ ] Route-tree duplication is resolved: `v2/(hub)/customers/**` becomes the single canonical customer route tree; the dead, unreferenced `v2/(hub)/dashboard/customers/**` stub tree is removed.
- [ ] `V2_ROUTES.CUSTOMERS_ONBOARD` is fixed to point at `/v2/customers/onboard` (currently points into the tree being deleted).
- [ ] All new/changed code uses v2 conventions: server-component-fetches-then-client-renders split, `profiles`-based auth already provided by `v2/(hub)/layout.tsx`, `V2_ROUTES` constants (never hardcoded `/v2/...` paths).

## Out of Scope / Must-Not-Change

- v1's own routes/pages (`(hub)/customers/**`, `(hub)/dashboard/customers/**`) — leave fully intact and functional; v1 and v2 coexist during the transition, this task does not deprecate v1.
- The public onboarding form (`(public)/onboard/[customerId]/**`, `FormEngine`, `useAutoSave`, `useOnboardingForm`, `onboarding-schemas.ts`) — confirmed version-agnostic already, no changes needed or wanted.
- The shared `/api/customers/**` REST layer — reuse as-is; no route handler changes.
- `V2_ROUTES.DASHBOARD_CUSTOMERS` and its orphaned breadcrumb-map entry in `v2-hub-header.tsx` — remove them as part of deleting the dead tree (see File Changes), but do not repurpose that route for anything else.
- Introducing a new v2-wide RBAC redirect-guard system (like v1's `requireRole`/`isRouteAllowed`). v2's established pattern (see `v2/(hub)/projects/page.tsx`) is inline capability flags for conditional UI, not hard route redirects — follow that, don't invent a new mechanism. The "Customers" sidebar link is already hidden for `developer` role (`v2-hub-sidebar.tsx`); that's the extent of the access control for this task.
- `v2/(hub)/orchestration`, `v2/(hub)/kb`, `v2/(hub)/admin`, `v2/(hub)/pm` stubs — separate Sprint 1A/1C work, not touched here.
- Porting v1's `usePMSettings` dark/light theme toggle into the **list** page (`_customers-index.tsx`). Note: the ported **profile** page (`client.tsx`) already uses `usePMSettings` throughout its own styling (it's the literal v1 file, ported) and v2 already reuses this same hook elsewhere (`v2/(hub)/dashboard/_components/dev-dashboard.tsx`) — so this is not a new pattern for v2, just not one this task should retrofit onto the list.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/config/constants.ts` | Modify | Fix `V2_ROUTES.CUSTOMERS_ONBOARD` → `/v2/customers/onboard`. Remove `V2_ROUTES.DASHBOARD_CUSTOMERS` (dead, unreferenced by any nav). |
| `src/app/v2/(hub)/_components/v2-hub-header.tsx` | Modify | Remove the orphaned `[V2_ROUTES.DASHBOARD_CUSTOMERS]` breadcrumb-map entry (line 13) that referenced the route being deleted. |
| `src/app/v2/(hub)/dashboard/customers/page.tsx` | Delete | Dead stub, unreferenced by sidebar or any other nav (confirmed via grep — only self-referencing). |
| `src/app/v2/(hub)/dashboard/customers/[customerId]/page.tsx` | Delete | Dead stub, same tree. |
| `src/app/v2/(hub)/dashboard/customers/onboard/page.tsx` | Delete | Dead stub, same tree. |
| `src/app/v2/(hub)/customers/[customerId]/page.tsx` | Modify (rewrite) | Server component: fetch `customers` row + `customer_products` (mirrors v1's `(hub)/customers/[customerId]/page.tsx`), `notFound()` on miss, render new client component wrapped in v2-style `px-8 py-6` container (not v1's `p-6 max-w-240 mx-auto`). |
| `src/app/v2/(hub)/customers/[customerId]/client.tsx` | Create | Full port of `src/app/(hub)/customers/[customerId]/client.tsx` (2174 lines) — see Code Context for port strategy. |
| `src/app/v2/(hub)/customers/onboard/page.tsx` | Modify (rewrite) | Thin wrapper rendering the new `_content.tsx` client component (mirrors v1's `onboard/page.tsx` → `_content.tsx` split, if v1 has one — otherwise a direct `"use client"` page is fine, matching v1's actual structure where `_content.tsx` IS the client component). |
| `src/app/v2/(hub)/customers/onboard/_content.tsx` | Create | Port of `src/app/(hub)/customers/onboard/_content.tsx` (299 lines, full file embedded below) with v2 link targets swapped in. |
| `src/app/v2/(hub)/customers/_customers-index.tsx` | Modify | Add per-product onboarding-progress column + Realtime subscription on `customer_products` UPDATE; add "+ New Customer" button → `V2_ROUTES.CUSTOMERS_ONBOARD`. |
| `src/app/v2/(hub)/customers/page.tsx` | Modify | Extend server fetch to also select `customer_products` (id, product_name, onboarding_data, status) needed to compute progress, pass through to `CustomersIndex`. |

## Code Context

### Port strategy for `client.tsx` (2174 lines — do not paste inline, read the source file directly during implementation)

Source: `src/app/(hub)/customers/[customerId]/client.tsx`. This is a **literal, feature-complete port** — same imports, same state, same handlers, same JSX — restructured only where v2 conventions require it. Concretely:

- **Keep unchanged:** all `useState` hooks (company edit, product add/edit/archive, project add/edit + Zoho toggle, asset add/delete/reveal, responses view/edit, reopen-onboarding), all fetch calls (`/api/customers/${customer.customer_id}/...` — these are the shared, version-agnostic REST layer, confirmed no v1-specific assumptions), `usePMSettings` for theme (v2 already uses this hook in `dashboard/_components/dev-dashboard.tsx`, so this is consistent with existing v2 practice, not a new dependency), `FileUpload` from `@/components/onboarding/file-upload`, `getIncompleteSections`/`getOnboardingSchema`/`computeCompletionPercentage` from `@/config/onboarding-schemas`.
- **Change:** the router push targets that hardcode v1 paths — grep the ported file for `router.push(` and any literal `/dashboard/customers` or `/customers/` strings and repoint to `V2_ROUTES.CUSTOMERS`. The component itself takes `customer`, `zohoPortalId`, `zohoPortalName` as props (unchanged prop shape) — the new `page.tsx` server wrapper supplies these the same way v1's does (`process.env.ZOHO_PORTAL_ID`, `process.env.ZOHO_PORTAL_NAME` — note CLAUDE.md documents `NEXT_PUBLIC_ZOHO_PORTAL_NAME`, verify which env var name v1 actually reads before copying).
- **Structural landmarks in the source file** (for navigating the 2174 lines): L1–92 imports/types/style constants; L93–131 helper functions (`extractMetadata`, `getProductHighlights`); L132 component start, L141–209 all `useState` declarations; L226–244 initial data fetches (projects, assets); L369+ product handlers; L399+ company-edit handler; L502+ reopen-onboarding handler; L531+ project handlers; L574–596 asset handlers; L626 main return (`<>` fragment, no outer padding — confirms the page.tsx wrapper owns the container padding); L2107 `ResponsesView` sub-component (rendered inline, not exported elsewhere).
- **Types used:** `CustomerRow`, `CustomerProductRow`, `Database` from `@/types/database`; `ProductName` from `@/types/hub`. All exist already — no type changes needed.

### File: `src/app/(hub)/customers/onboard/_content.tsx` (full source — port directly, only link targets change)

```tsx
"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProductName } from "@/types/hub";
import ProductSelector from "@/components/onboarding/product-selector";
import { ROUTES } from "@/config/constants";
// v2 port: import { V2_ROUTES } from "@/config/constants"; use V2_ROUTES.DASHBOARD / V2_ROUTES.CUSTOMERS instead of ROUTES.DASHBOARD / "/dashboard/customers"

// ... (full 299-line file — see src/app/(hub)/customers/onboard/_content.tsx)
```

Two link changes needed when porting:
- Success screen `href={`/dashboard/customers/${createdCustomer.customer_id}`}` (line 104) → `` href={`${V2_ROUTES.CUSTOMERS}/${createdCustomer.customer_id}`} ``
- Success screen `href={ROUTES.DASHBOARD}` → `href={V2_ROUTES.DASHBOARD}`
- The public onboarding URL construction (`${window.location.origin}/onboard/${createdCustomer.customer_id}`) stays **unchanged** — that route is confirmed unversioned/shared.
- POST bodies to `/api/customers` and `/api/customers/${id}/products` stay unchanged — shared REST layer.

### File: `src/app/v2/(hub)/customers/_customers-index.tsx` (current — add to this, don't rewrite)

Current file has no `customer_products` data and no progress display at all — it only shows `company_name`, `contact_name`/`contact_email`, a status badge, and project count, in a `grid-cols-[1fr_1fr_120px_120px]` row layout with plain Tailwind slate/blue classes (no CSS-var theming — v1's `ProgressBar` from `@/components/hub/pm-tabs/shared.tsx` uses `--c-track`/`--c-blue` CSS vars that aren't defined in v2's scope, so **do not import it directly** — build a small inline progress bar matching this file's existing direct-color style instead, per the "page-scoped UI" convention in CLAUDE.md).

Realtime pattern to port (from `src/app/(hub)/dashboard/customers/_content.tsx`, lines ~46–60):

```tsx
useEffect(() => {
  const supabase = createClient(); // from "@/lib/supabase/client"
  const channel = supabase
    .channel("v2_customers_products")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customer_products" }, (payload) => {
      const updated = payload.new as CustomerProductRow;
      setCustomers(prev => prev.map(c => ({
        ...c,
        customer_products: c.customer_products.map(p => p.id === updated.id ? { ...p, ...updated } : p),
      })));
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```

Progress computation to port (from `computeCompletionPercentage`, `src/config/onboarding-schemas.ts:615`): call `computeCompletionPercentage(getOnboardingSchema(product.product_name), product.onboarding_data)` per product; if a customer has multiple products, show the lowest (or average — implementer's call, note the choice in the PR) completion, or one bar per product if row height allows.

Since `_customers-index.tsx` currently receives `customers: CustomerListItem[]` as server-fetched props (not client-fetched, unlike v1's `_content.tsx`), the Realtime subscription needs local `useState` seeded from props to allow live mutation — same pattern v1 uses, just adapted to a props-seeded-then-mutated local state instead of a fully client-side fetch.

### `src/config/constants.ts` (current relevant lines)

```ts
export const V2_ROUTES = {
  HOME: "/v2",
  DASHBOARD: "/v2/dashboard",
  PROJECTS: "/v2/projects",
  CUSTOMERS: "/v2/customers",
  DASHBOARD_CUSTOMERS: "/v2/dashboard/customers", // ← DELETE (dead, unreferenced by nav)
  ...
  CUSTOMERS_ONBOARD: "/v2/dashboard/customers/onboard", // ← FIX to "/v2/customers/onboard"
  ...
} as const;
```

Confirmed via grep: `V2_ROUTES.DASHBOARD_CUSTOMERS` is referenced only by the orphaned breadcrumb-map entry in `v2-hub-header.tsx:13` (`{ section: "Work", page: "Projects" }` — itself a confusing leftover) and the dead stub pages. `V2_ROUTES.CUSTOMERS` is the one actually used by the sidebar (`v2-hub-sidebar.tsx:35`) and the list (`_customers-index.tsx:113`).

## Implementation Steps

1. Fix `V2_ROUTES` in `constants.ts` (`CUSTOMERS_ONBOARD` path fix, remove `DASHBOARD_CUSTOMERS`); remove the orphaned breadcrumb entry in `v2-hub-header.tsx`.
2. Delete the three dead stub files under `v2/(hub)/dashboard/customers/**`.
3. Build `v2/(hub)/customers/[customerId]/page.tsx` (server fetch + notFound) and `client.tsx` (full port of v1's client.tsx, with router targets repointed to `V2_ROUTES`).
4. Build `v2/(hub)/customers/onboard/page.tsx` / `_content.tsx` (port of v1's wizard, with the two link changes noted above).
5. Update `v2/(hub)/customers/page.tsx` to also fetch `customer_products`; update `_customers-index.tsx` to accept it, render progress, subscribe to Realtime, and add the "+ New Customer" button.
6. `npx tsc --noEmit` and `pnpm lint`.
7. Manual verification per Acceptance Criteria below (dev server, browser).

## Acceptance Criteria

- [ ] `/v2/customers` list shows a progress indicator per customer that updates live (test by editing a `customer_products` row's `onboarding_data` in another tab/Supabase and confirming the list updates without refresh).
- [ ] "+ New Customer" on `/v2/customers` navigates to `/v2/customers/onboard`.
- [ ] `/v2/customers/onboard` completes the 3-step wizard, creates a customer + products via `/api/customers`, and shows the success screen with a working "View Customer Profile" link to `/v2/customers/[newId]` and a copyable public onboarding link.
- [ ] `/v2/customers/[customerId]` renders full profile parity with v1: company info edit saves correctly, products can be added/edited/archived (active + archived tabs both work), projects can be added/edited (including the Zoho project-creation toggle), assets can be added/deleted/revealed, onboarding responses can be viewed and edited inline, reopen-onboarding works.
- [ ] `/v2/dashboard/customers`, `/v2/dashboard/customers/[anything]`, `/v2/dashboard/customers/onboard` all 404 (tree deleted).
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.
- [ ] v1's `/dashboard/customers`, `/customers/[customerId]`, `/customers/onboard` still work unchanged.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual: walk through Acceptance Criteria in browser at localhost:3000/v2/customers
```

## Compatibility Touchpoints

- None for packaging/docs/install surface. This is app-route-only work within the existing v2 parallel build (per CLAUDE.md's Sprint Plan, v2 is accessible at `/v2/*` alongside v1 — no migration/cutover implied by this task).

## Implementation Notes

### What Changed
- Ported v1's customer profile page (`client.tsx`, 2174 lines) and onboarding wizard (`_content.tsx`, 299 lines) into `v2/(hub)/customers/**` as literal, byte-identical copies — grepped both for hardcoded v1 route strings and `router.push`/`useRouter` targets first; found none in `client.tsx` (all its navigation is `router.refresh()`, and its only hardcoded links are to the version-agnostic public `/onboard/[customerId]` route, left untouched per scope). `_content.tsx` needed exactly two link fixes (success-screen "View Customer Profile" and "Go to Dashboard") plus its `ROUTES` → `V2_ROUTES` import swap.
- Built new server-component wrappers (`[customerId]/page.tsx`, `onboard/page.tsx`) following v2's existing server-fetch/client-render convention (mirrors `v2/(hub)/projects/[projectId]/page.tsx`), not v1's `requireRole`-gated wrapper — no v2-wide RBAC redirect mechanism exists yet, consistent with the task's Out-of-Scope note.
- Added live onboarding-progress to `_customers-index.tsx`: extended `CustomerListItem` with a `customer_products` array, added a "Onboarding" progress-bar column, and a Supabase Realtime subscription on `customer_products` UPDATE (mirrors v1's `dashboard/customers/_content.tsx` pattern). Updated `page.tsx` to fetch `customer_products` (id, product_name, completed_percentage) alongside the existing `customers`/`projects` queries.
- Added a "+ New Customer" button to the list header, styled to match the existing "+ New Project" button in `v2/(hub)/projects/_projects-index.tsx`, navigating to `V2_ROUTES.CUSTOMERS_ONBOARD`.
- Fixed `V2_ROUTES.CUSTOMERS_ONBOARD` (was pointing into the dead tree) and removed the unreferenced `V2_ROUTES.DASHBOARD_CUSTOMERS` constant + its orphaned breadcrumb-map entry in `v2-hub-header.tsx`.
- Deleted the dead `v2/(hub)/dashboard/customers/**` stub tree (3 files) — confirmed via grep it was reachable only by direct URL, never linked from the sidebar (`v2-hub-sidebar.tsx` uses `V2_ROUTES.CUSTOMERS`, not `DASHBOARD_CUSTOMERS`) or anywhere else in v2.

### Files Changed
- `src/config/constants.ts` — fixed `V2_ROUTES.CUSTOMERS_ONBOARD` path, removed dead `V2_ROUTES.DASHBOARD_CUSTOMERS`.
- `src/app/v2/(hub)/_components/v2-hub-header.tsx` — removed orphaned breadcrumb-map entry for the deleted route.
- `src/app/v2/(hub)/dashboard/customers/page.tsx`, `.../[customerId]/page.tsx`, `.../onboard/page.tsx` — deleted (dead stub tree).
- `src/app/v2/(hub)/customers/[customerId]/page.tsx` — rewritten: server fetch (customer + customer_products), `notFound()` guard, renders the new client component.
- `src/app/v2/(hub)/customers/[customerId]/client.tsx` — created: literal port of v1's profile component (copied via `cp`, verified no edits needed).
- `src/app/v2/(hub)/customers/onboard/page.tsx` — rewritten: thin wrapper rendering `_content.tsx`.
- `src/app/v2/(hub)/customers/onboard/_content.tsx` — created: port of v1's 3-step wizard with two link targets and the `ROUTES`→`V2_ROUTES` import repointed.
- `src/app/v2/(hub)/customers/_customers-index.tsx` — added progress column, Realtime subscription, "+ New Customer" button.
- `src/app/v2/(hub)/customers/page.tsx` — extended server fetch to include `customer_products`.

### Deviations From Plan
- Task doc anticipated needing to fix hardcoded router targets inside `client.tsx` during the port; grep confirmed there are none — the file needed zero edits beyond the `cp`. Noted here since it changed the actual diff size from what the plan implied.
- Used the already-maintained `customer_products.completed_percentage` column directly for the list's progress bar instead of importing `computeCompletionPercentage`/`getOnboardingSchema` and recomputing client-side (as the task doc's Code Context suggested). That column is written on every onboarding auto-save PATCH (`api/customers/[customerId]/products/[productName]/onboarding/route.ts:33`), so it's already the authoritative value — recomputing it a second way in the list would duplicate logic for no benefit.
- List progress bar shows the **average** completed_percentage across a customer's products (task doc left this as an implementer's call between average/lowest).
- Fixed the v2 detail page's Zoho portal-name env var to `process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME` instead of literally copying v1's `process.env.ZOHO_PORTAL_NAME` — v1's own page.tsx reads a var that doesn't exist in `env.example` (confirmed only `NEXT_PUBLIC_ZOHO_PORTAL_NAME` is defined there and in CLAUDE.md). This is a pre-existing bug in v1 that this task does not touch; the v2 port uses the correct var name rather than replicating the typo.
- Removed a `useEffect` that resynced local list state from `initialCustomers` props — it tripped the `react-hooks/set-state-in-effect` lint rule and is unnecessary: `page.tsx` is `dynamic = "force-dynamic"` so navigations remount the client component fresh, and the Realtime subscription already keeps state current for the case that actually matters (background updates from Supabase).
- Cleared `.next/` build cache mid-implementation — `tsc --noEmit` initially failed against stale generated route-type files referencing the just-deleted `dashboard/customers/**` paths. This is a build artifact, not source; regenerating it does not affect any tracked files.

### Verification Run
- `npx tsc --noEmit` — PASS (clean after clearing stale `.next/` cache).
- `pnpm lint` — PASS on all files touched by this task (0 errors, only pre-existing warnings carried over verbatim from the v1 source file being ported: `AlertTriangle` unused import, unused `zohoPortalId` param, one unused-expression at line 1853 — confirmed identical in v1's original via direct `eslint` diff of both files). One real lint error this task introduced (`set-state-in-effect` in `_customers-index.tsx`) was found and fixed. Full-repo `pnpm lint` still reports pre-existing errors/warnings in unrelated files (`pm-dashboard.tsx`, `dashboard/users/page.tsx`, `_list-view.tsx`, `theme-toggle.tsx`, `sanity/index.ts`, etc.) — confirmed via `git status` that none of these files were touched by this task.
- Route smoke test via `curl` — PASS: `/v2/customers`, `/v2/customers/onboard`, `/v2/customers/[id]` all return 307 (expected — redirected to `/v2/auth/login` by `proxy.ts`/layout auth guard when unauthenticated, matching every other `/v2/(hub)` route); `/v2/dashboard/customers` and its sub-paths return 404 (tree confirmed deleted).
- Full authenticated browser walkthrough of the Acceptance Criteria — SKIPPED (the Claude-in-Chrome browser extension is not connected in this session, and no test credentials were available to drive an authenticated session via `curl`). This is a real gap: nothing in this session exercised the actual UI at runtime past the auth boundary. Recommend the `/test` stage (or a manual pass) walks through: list progress-column rendering + live Realtime update, "+ New Customer" → wizard → success screen → profile page, and the full profile page's edit/add/archive/reveal/reopen actions, before this is considered done.
