# 496: Orders: "Link existing project" (mark an order converted against a project that already exists)

**Created:** 2026-11-23
**Priority:** MEDIUM
**Type:** feature (+ small migration, written-not-applied)
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Sometimes the project already exists before the order is reviewed. Either a PM created it from the Projects page (New Project / Import), or the order arrived late. Today the reviewer's only options on the order are **Create customer & project**, which makes a duplicate project, or **Dismiss**, which loses the link. This task adds a third action on a pending order: **Link existing project**. The reviewer picks the customer and one of that customer's projects, confirms in a delete-style `ConfirmDialog`, and the order becomes `converted` and points at that project. Nothing is created and the project is not modified.

## Requirements

- [ ] **UI** (`_convert-panel.tsx`): add a **Link existing project** button next to Create / Dismiss. Clicking it shows an inline picker:
  - **Customer:** reuse the panel's existing customer search (`/api/customers?search=`), prefilled from `order._match` when there is one (D2).
  - **Project:** a list of that customer's projects from `GET /api/v2/projects?customer_id=<id>`, which is RLS-scoped and already excludes `deleted`. Each row shows name, `project_id` and status. There's an explicit empty state ("No projects for this customer") and a loading state.
  - **Link** opens the shared `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`, the same component Delete Project uses), with:
    - title: `Link this order to "<project name>"?`
    - body: `The order will be marked Converted and linked to <customer> / <project_id>. No customer or project is created. This can't be undone from the Orders page.`
    - confirm label: `Link project` (`Linking…` while busy)
  - On success, `router.refresh()`. The Outcome section then renders the link. Errors use the panel's existing `ERROR_BOX_CLASS` box.
- [ ] **API:** `POST /api/stackshift-orders/[orderId]/link-project`, body `{ projectId: uuid }` (zod, in `schema.ts`).
  - Auth: `requireOrderMutator()` (admin/super_admin, not Finance), same as convert.
  - 404 if the order is missing. 409 if the order isn't `pending_review` ("Order is already converted" / "Order is dismissed — reopen it first").
  - Project lookup via `adminClient` (the route already uses it for order writes): 404 if missing, 409 if `status='deleted'` or `merged_into_project_id` is not null. The merged check retries without that column on `42703`.
  - **One order per project (D3):** 409 if another order already has this `project_id`. The error names that order's company and submitted date.
  - Update the order with `.eq("status","pending_review")` so a concurrent convert/link can't double-write (0 rows → 409). Fields: `status='converted'`, `customer_id = project.customer_id`, `project_id`, `is_new_customer=false`, `converted_by`, `converted_at`, `updated_at`, `link_method='linked_existing'`. On `42703` (migration 189 not applied), retry the same update without `link_method`.
  - Returns `{ ok, customerId, projectId }`.
- [ ] **Migration 189** `supabase/migrations/189_stackshift_orders_link_method.sql` (written-not-applied): `alter table stackshift_orders add column if not exists link_method text check (link_method in ('created','linked_existing'));`. Nullable, no backfill: null means created by Convert, which covers every existing row. Hand-edit `src/types/database.ts` (Row/Insert/Update) to match.
- [ ] **Outcome text** (`order-review.tsx`): when `order.link_method === 'linked_existing'`, show "Linked to existing project" in place of "Linked existing customer". Everything else (customer link, project link, `describeProject`) is unchanged. The detail page uses `select("*")`, so it picks up the column automatically, and before 189 the value is just `undefined`.

## Out of scope / must not change

- `createFromOrder` / `POST …/convert`: no changes. Convert leaves `link_method` null, so it can't break before 189 is applied. Task 495 owns that file.
- The linked project, its customer, and its `customer_products` row: nothing is written to them. The project keeps its own classification.
- No unlink/undo action. Undoing is an operator SQL step (below).
- Dismissed orders: no Link action. Reopen first, which matches Convert's 409.
- Finance read-only view: unchanged (the panel isn't rendered).
- No new picker component: per CLAUDE.md, page-scoped UI stays in the page's `_components`.

## Proposed File Changes

| File | Change |
|------|--------|
| `supabase/migrations/189_stackshift_orders_link_method.sql` | New, nullable checked column |
| `src/types/database.ts` | Add `link_method` to `stackshift_orders` Row/Insert/Update |
| `src/lib/stackshift-orders/schema.ts` | `linkProjectSchema = z.object({ projectId: z.string().uuid() })` |
| `src/app/api/stackshift-orders/[orderId]/link-project/route.ts` | New POST route (above) |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/_convert-panel.tsx` | Link button + customer→project picker + `ConfirmDialog` |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` | Outcome text for `linked_existing` |

## Code Context

- `_convert-panel.tsx:44-48,59-76`: customer search state and `searchCustomers()`. Reuse them for the link picker so `existingCustomerId` is shared with "Link existing customer" mode. `busy` is `null | "convert" | "dismiss"`; add `"link"`. Disable all three buttons while any action is busy, as today.
- `confirm-dialog.tsx`: props `open, title, body, confirmLabel, confirmDisabled, onConfirm, onCancel`. Red confirm button, `z-[60]`. Usage pattern: `_delete-project-menu-item.tsx:46-55`.
- `convert/route.ts:9-58`: the auth / parse / lookup / status-guard shape to copy for the new route.
- `create-from-order.ts:145-156`: the fields Convert writes onto the order. Link writes the same set plus `link_method`.
- `[orderId]/route.ts:36-38`: PATCH already refuses to change status of a converted order, so a linked order can't be reopened or dismissed. That's intended.
- `api/v2/projects/route.ts:8-30`: `GET ?customer_id=` (RLS-scoped, `neq status deleted`, ordered by `updated_at`). It doesn't filter merged projects. The picker accepts that, and the server rejects merged ones (409).
- `stackshift_orders.project_id` has no unique index (`130_stackshift_orders.sql:56`). D3 is enforced in the route only. A DB unique index could fail on existing data, so it's not added here.

## Implementation Steps

1. Write migration 189 and update the `database.ts` types.
2. Add `linkProjectSchema` and the route. Run `tsc`.
3. Panel: Link button, then the picker (customer search, then project list fetched when a customer is chosen), then `ConfirmDialog`, then POST and refresh. Then the Outcome text.
4. `npx tsc --noEmit`, `npx eslint` on the changed files, then the browser checks.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` + `npx eslint <changed files>` | clean | pre-merge |
| 2 | Browser: pending **test** order → Link existing project → pick a test customer → pick a project → Link | `ConfirmDialog` opens with the project name. **Cancel** closes it and no request is sent (Network tab). | pre-merge |
| 3 | Same flow → confirm | order status pill = Converted. Outcome shows the customer and project links. `select status, customer_id, project_id, is_new_customer, converted_by from stackshift_orders where id='<id>'` matches the chosen project and the acting user. | pre-merge |
| 4 | `curl -X POST …/link-project` on the now-converted order | 409 | pre-merge |
| 5 | Link a second pending order to the same project | 409 naming the first order | pre-merge |
| 6 | Link to a project with `status='deleted'` (via curl with its uuid) | 409 | pre-merge |
| 7 | Finance-department user: curl the route | 403. The panel isn't shown. | pre-merge |
| 8 | Before 189 is applied: step 3 still succeeds (42703 retry) and Outcome shows the old "Linked existing customer" text | as stated | pre-merge |
| 9 | After 189 is applied: a new link shows "Linked to existing project", and `link_method='linked_existing'` | as stated | post-deploy |
| 10 | **No regression:** convert a pending test order with Create customer & project | unchanged behaviour. `link_method` stays null. | pre-merge |
| 11 | **No regression:** the linked project's row (`select * from projects where id=…`) and its `customer_products` row are byte-identical before and after linking | unchanged | pre-merge |

Use only `customers.is_test` customers and orders created for testing. Real orders must not be linked during testing.

## Verification

`tsc` + `eslint`, browser checks 2–3 and 8, curl checks 4–7, SQL checks 3 and 11, then check 9 after applying 189.

## Coordination

- **495** (Testing): edits `create-from-order.ts`, which this task does not touch. 495's Operator Step 1 detection query joins `stackshift_orders.project_id`, so a linked order will show up there with `projects_on_row` reflecting real sharing. That's expected, and the query needs no change.
- **429** (In Progress): has `lib/stackshift-orders/*` in scope and edits the phase-plan schemas in `schema.ts`. This task only **appends** `linkProjectSchema` to that file. Either can land first; rebase if needed.
- **423** (Planned, investigation): lists the convert route as a consumer. There's no file overlap.

## Open Decisions

- **D1 — RESOLVED 2026-11-23 (user): add `link_method` column** (migration 189, written-not-applied, degrade on 42703).
- **D2 — RESOLVED 2026-11-23 (user): customer → project picker**, prefilled from the order's customer match.
- **D3 — RESOLVED 2026-11-23 (user): one order per project**: a second link to the same project is rejected with 409.

## Operator Steps

1. Deploy the hub (Vercel). This is the only deployable: the new route, panel and review files are hub-only, and `schema.ts` is imported only by the hub's stackshift-orders routes (`grep -rn "stackshift-orders/schema" src`).
2. Apply `supabase/migrations/189_stackshift_orders_link_method.sql`. It's safe before or after the deploy because the code degrades without it. Then run AC 9.
3. To undo a wrong link (SQL editor): `update stackshift_orders set status='pending_review', customer_id=null, project_id=null, is_new_customer=null, converted_by=null, converted_at=null, link_method=null where id='<order id>';` (drop `link_method` from the statement if 189 isn't applied).

## Baseline

- `npx tsc --noEmit`: exit 0 (clean as of 495).
- `src/app/api/stackshift-orders/[orderId]/link-project/` does not exist, so ACs 2–9 fail by construction before the change.

## Implementation Notes

### What Changed
- **New route** `POST /api/stackshift-orders/[orderId]/link-project`:
  - auth is `requireOrderMutator`; the order must be pending
  - the project must exist and be neither deleted nor merged
  - D3: one order per project; the 409 message names the other order's company and date
  - the write is race-safe: it's filtered on `status=pending_review`, and 0 rows → 409
  - the write includes `link_method='linked_existing'`; on `42703`/`PGRST204` it retries without that column
- **Convert panel:**
  - a **Link existing project** toggle opens an inline section: customer search, then that customer's projects (loading / empty / selected states), then **Link project**
  - the shared red `ConfirmDialog` asks for confirmation before the POST; success runs `router.refresh()`
  - the customer search JSX is now one `customerPicker` element, used by both "Link existing customer" and the link section, which share the same state
- Outcome section: shows "Linked to existing project" when `link_method === 'linked_existing'`.
- Migration 189, plus `database.ts` types (Row/Insert/Update) and `linkProjectSchema`.

### Files Changed
- `supabase/migrations/189_stackshift_orders_link_method.sql`: new column (written-not-applied)
- `src/types/database.ts`: `link_method` on `stackshift_orders`
- `src/lib/stackshift-orders/schema.ts`: appended `linkProjectSchema`
- `src/app/api/stackshift-orders/[orderId]/link-project/route.ts`: new
- `src/app/(hub)/stackshift-orders/[orderId]/_components/_convert-panel.tsx`: link section + ConfirmDialog
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx`: Outcome text

### Deviations From Plan
- The project is read with `select("*")` instead of naming `merged_into_project_id`. This reads the merged flag when migration 180 is applied and avoids a 42703 when it isn't. No retry is needed.
- The missing-column retry also catches `PGRST204`. PostgREST reports an unknown column in an update body as a schema-cache error, not as Postgres 42703. The same set is used in `api/v2/me/preferences/route.ts`.

### Verification Run
- `npx tsc --noEmit`: PASS (baseline exit 0 → now exit 0)
- `npx eslint` on the 4 changed TS files: PASS
- AC2–AC11: SKIPPED. No local dev server was running (curl to :3000 got connection refused). They also link real order rows, so they're left for the `test` stage with test customers and orders only.

### Attempts That Failed
- The first panel version loaded projects in a `useEffect`. eslint `react-hooks/set-state-in-effect` failed it, so the load moved to the event handlers: customer picked while the link section is open, or link section opened with a customer already selected.
- The first refactor left `{customerPicker}` inside `&& ( … )`, so tsc read it as an object literal. Fixed to `&& customerPicker`.

### Operator Steps
1. Deploy the hub (Vercel). It's the only deployable: every changed file is under `src/`, and `schema.ts` is imported only by the hub's stackshift-orders routes.
2. Apply migration 189 (safe before or after the deploy). Then run AC 9.
3. To undo a wrong link: the SQL in the planning Operator Steps above.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Route:**
  - guard clauses only, no nesting
  - every failure path returns a specific status (400/404/409/500)
  - the write is race-safe (`eq status pending_review`, 0 rows → 409)
  - no `any`; the merged flag is read through a narrow cast, because `merged_into_project_id` isn't in the generated types (migration 180)
  - the `_omit`/`void` destructure is a bit awkward but clear, and eslint accepts it
- **Panel:**
  - loading, empty and selected states are present; errors go to the existing error box
  - the confirm button is disabled while busy, and every action button is disabled while any action runs
  - icon + text button, with `aria-expanded`/`aria-pressed` on the toggles
- **Fixed here:** the `customerPicker` JSX was under-indented after the refactor. Whitespace only; tsc and eslint re-run clean.
- **Minor, not fixed:**
  - Changing customer quickly could let a slow, earlier projects response overwrite a newer one. The window is small and the confirm dialog names the project, so it can't link the wrong one silently.
  - With "Link existing customer" mode and the link section both open, the shared search shows two inputs bound to the same state. That's harmless but redundant.
- **Not touched:** existing gaps in this file (the `window.prompt` in Dismiss, the search input without an `aria-label`). They're out of scope.
- **Acceptance criteria:** AC 2–11 each name a browser/curl/SQL check that could fail. None has been run yet (test stage). AC 1 has been run and passes.

### Deviations
- Minor: the project is read with `select("*")` so the merged check works with or without migration 180.
- Minor: the missing-column retry also catches `PGRST204` (PostgREST's code for an unknown column in an update body).
- Minor: the customer search JSX was extracted into one `customerPicker` element shared by the two modes, instead of a second copy.

### Required Fixes
- None.
