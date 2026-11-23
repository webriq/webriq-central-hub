# 495: Order-converted Discrete Development project shows under StackShift I (convert reuses the customer's existing product row)

**Created:** 2026-11-23
**Priority:** HIGH
**Type:** bugfix (+ one-off data repair)
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The StackShift Order for **Veteran Roofing & Exteriors** was converted with the classification **Discrete Development**. The new draft project, **"Veteran Roofing & Exteriors App"**, shows on the **StackShift I** tab of `/projects` (status Draft, "Awaiting kickoff") instead of **Discrete Development**.

### Root cause (from the code; confirm with Operator Step 1)

1. The listing puts a project on a tab when its **linked `customer_products` row** has the classification, either in the `classification` column or in the `classifications` array. It does not use anything stored on the project itself.
   `src/app/(hub)/projects/_v2-listing/_load-list-data.ts:104,121-124`:
   ```ts
   customer_products!inner(classification, classifications)
   .or(`classification.eq."${c}",classifications.cs.{"${c}"}`, { referencedTable: "customer_products" })
   ```
2. When the reviewer picks **"Link existing customer"** (the default when the order matched a customer: `_convert-panel.tsx:40-41`), `createFromOrder` **reuses** the customer's existing `customer_products` row with the same `product_name` instead of creating a new one.
   `src/lib/stackshift-orders/create-from-order.ts:76-107`:
   ```ts
   if (!isNewCustomer) {
     const { data: existingProduct } = await adminClient.from("customer_products").select("id")
       .eq("customer_id", customerId).eq("product_name", shape.productNames[0]).maybeSingle();
     productId = existingProduct?.id ?? null;
   }
   if (!productId) { /* insert with the reviewer's classifications */ }
   ```
3. `deriveProductNamesMulti(["Discrete Development"])` returns `["StackShift"]` (`src/config/customer-phases.ts:434-442`: when nothing else matches, the fallback is `"StackShift"`). Veteran Roofing is already a StackShift I customer: its website project is `C74DEA31-PROJ-02` (see `_docs/task/475-…md:50`). So the convert found that customer's **StackShift I** product row, linked the new App project to it, and **never wrote the reviewer's classification anywhere**. The project name suffix "App" and `project_type = 'Custom App'` (both derived from the chosen classifications) show that the reviewer did pick Discrete Development.

The **New Project** intake doesn't have this problem. It always inserts a fresh `customer_products` row, even for an existing customer (`src/app/api/onboarding/projects/route.ts:438-450`). The convert path is the only one that reuses a row. The comment there says it does this to avoid duplicates, but the intake already creates them, so (customer, `product_name`) is not unique in practice.

### Second hazard (why this matters beyond the tab)

The website project and the App project now **share one product row**. If a PM fixes the App project with the Classification modal (`PATCH /api/v2/projects/[projectId]/classification`, which updates `customer_products` by `customer_product_id`), the change also **reclassifies the StackShift I website project**: it would move tabs and could lose its StackShift I classification. The shared row also gives both projects the same onboarding form data and `onboarding_complete`. **Do not use the modal to fix this project until the data repair below has run.**

## Requirements

- [ ] `createFromOrder` always inserts a **new** `customer_products` row carrying the reviewer's `classification` + `classifications`, the same as the New Project intake. Delete the reuse lookup (lines 76-91) and its comment.
- [ ] One-off data repair script `supabase/manual/495_repair_order_converted_shared_product_rows.sql`:
  - It finds projects created by an order convert (`stackshift_orders.project_id`) whose `customer_product_id` is also used by another project.
  - For each one, it inserts a new `customer_products` row (same `customer_id` / `product_name`, `classification` = primary of the order's intended classifications, `status='active'`, `onboarding_complete=false`, `onboarding_data='{}'`) and repoints that project to the new row.
  - The order's intended classifications are **not stored** on `stackshift_orders` (only the raw `services`). So the script takes an explicit `(project uuid, classifications[])` list that the operator fills in from Step 1, with Veteran → `{"Discrete Development"}`. Guarded: it aborts if the project's `customer_product_id` is no longer shared, and it is idempotent. That's why it lives in `supabase/manual/`.
- [ ] No change to the listing query, the Classification modal/PATCH route, or `deriveProductNamesMulti`.

## Out of scope / must not change

- `deriveProductNamesMulti` fallback (`"StackShift"` for a Discrete-only selection). The `product_name` check constraint only allows StackShift/PipelineForge-style values, and the intake uses the same rule.
- Other routes keyed on `(customer_id, product_name)` with `.single()`: `api/customers/[customerId]/products/[productName]/route.ts:44` and `…/onboarding/route.ts:45`. They already break for customers with two same-name rows, which the New Project intake creates today. **This is an existing problem, not caused by this task.** It's listed as follow-up F1.
- The StackShift I engine flag logic in `createFromOrder` (`usesEngine`): it's correct for a Discrete selection (false).
- The phase seeding block (task 429 owns that area).

## Proposed File Changes

| File | Change |
|------|--------|
| `src/lib/stackshift-orders/create-from-order.ts` | Remove the existing-product reuse (lines 76-91). Always insert. Rewrite the block comment. |
| `supabase/manual/495_repair_order_converted_shared_product_rows.sql` | New guarded one-off repair (see Requirements). |

## Code Context

- `create-from-order.ts:42-44`: `shape = deriveProjectShape(classifications)`, `usesEngine = primary === "StackShift I"`.
- `create-from-order.ts:93-107`: the insert to keep. It already writes `classification: shape.primaryClassification, classifications`.
- `service-map.ts:62-77` `deriveProjectShape`: `productNames`, `primaryClassification` (StackShift variant first, else the first entry), `projectType`, `projectSuffix`.
- `_convert-panel.tsx:40-41`: mode defaults to `existing_customer` when `order._match` is set, so any order from an existing StackShift customer hits the reuse path.
- `api/v2/projects/[projectId]/classification/route.ts:88-93`: the modal writes the linked product row by id. This is why a shared row is dangerous.

## Implementation Steps

1. In `createFromOrder`, replace the `let productId … if (!isNewCustomer) {…} if (!productId) {…}` block with a single unconditional insert, and keep its error throw. Use `product.id` directly as `customer_product_id`.
2. Write `supabase/manual/495_…sql`:
   - `BEGIN;`
   - a `VALUES` CTE of `(project_id uuid, classifications text[])` targets, pre-filled with Veteran's project once Step 1 confirms its UUID
   - for each target, `RAISE EXCEPTION` unless another project shares its `customer_product_id`
   - `INSERT … RETURNING id`, then `UPDATE projects SET customer_product_id`
   - `COMMIT;`
   - a header comment with the Step 1 detection query and rollback notes: repoint back to the old id, then delete the new row.
3. `npx tsc --noEmit`.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` | no new errors | pre-merge |
| 2 | `grep -n 'eq("product_name"' src/lib/stackshift-orders/create-from-order.ts` | no match | pre-merge |
| 3 | Browser: Orders → open an order for an **existing** StackShift I test customer (`customers.is_test`) → Link existing customer → classification Discrete Development → Convert. Then `/projects/discrete-development`. | new "… App" draft is on Discrete Development and **not** on StackShift I | pre-merge (local, test customer) |
| 4 | SQL: `select customer_product_id, count(*) from projects where customer_product_id = (select customer_product_id from projects where id = '<new project uuid>') group by 1` | count = 1 | pre-merge |
| 5 | **No regression:** the test customer's existing StackShift I project is still on `/projects/stackshift-i`, and its `customer_products.classification` is unchanged | unchanged | pre-merge |
| 6 | **No regression:** a convert with mode **Create new customer** + StackShift I still creates a draft with `uses_customer_phases_engine = true` on the StackShift I tab | unchanged | pre-merge |
| 7 | After Operator Step 3: `/projects/stackshift-i` no longer lists "Veteran Roofing & Exteriors App". `/projects/discrete-development` lists it. Veteran's website project (`C74DEA31-PROJ-02`) is still on StackShift I. | as stated | post-deploy |

## Verification

`npx tsc --noEmit`, then browser checks 3/5/6 against a test customer, then the SQL check 4. Check 7 runs after the repair script.

## Coordination

- **429** (In Progress, programme-engine cutover) lists `lib/stackshift-orders/*` in scope and edits the phase-seed block of `create-from-order.ts`. This task edits a different hunk (customer_products, lines 76-107). Land 495 first if possible (small hunk); otherwise rebase on 429.
- **431** (Planned, drop `customer_*` tables) targets the `customer_phases`-family tables, not `customer_products`. No overlap.
- **048** (In Progress) reads/writes `customer_products.onboarding_*` via the product_name-keyed routes. No file overlap, but see F1.

## Open Decisions

- **D1 (NON-BLOCKING): fix code only, or also repair data?** Default: both. The code fix only affects future converts, so the Veteran project needs the manual repair script to move tabs.
- **D3 — RESOLVED 2026-11-23 (user): accept; fix routes in follow-up F1.** Side effect on the customer onboarding form.** After the fix, Veteran will have two `product_name='StackShift'` rows. The public onboarding autosave (`PATCH …/products/StackShift/onboarding`, `.eq(customer_id).eq(product_name)`) would then **update both rows** and return 404 (PGRST116) to the customer. That matters only if an existing customer still fills in a StackShift onboarding form while a second StackShift project exists. The New Project intake already creates this state today. Default: accept it, do the code fix here, and fix the routes in F1. Alternative: fold F1 into this task (larger, touches the public onboarding flow).
- **D2 (NON-BLOCKING): intended classifications for other affected projects.** Default: the operator fills these in per project from the Step 1 output (order `services` + project name/`project_type`). Only Veteran is known now.

## Operator Steps

1. **Before applying the repair, confirm the diagnosis and find any other affected projects** (read-only, SQL editor):
   ```sql
   select p.id, p.project_id, p.name, p.project_type, p.customer_id, p.customer_product_id,
          cp.product_name, cp.classification, cp.classifications,
          o.services, o.is_new_customer,
          (select count(*) from projects p2 where p2.customer_product_id = p.customer_product_id) as projects_on_row
   from stackshift_orders o
   join projects p on p.id = o.project_id
   join customer_products cp on cp.id = p.customer_product_id
   where o.status = 'converted'
   order by projects_on_row desc, p.created_at desc;
   ```
   For Veteran, expect `projects_on_row ≥ 2`, `cp.classification = 'StackShift I'`, `project_type = 'Custom App'`. If instead `cp.classification` is already `Discrete Development`, someone used the modal on the shared row. In that case also check `C74DEA31-PROJ-02` and restore its classification before running the repair.
2. Deploy the code fix (Vercel, hub). Only the hub app imports `create-from-order.ts` (found with `grep -rn create-from-order src`: the only importer is `api/stackshift-orders/[orderId]/convert/route.ts`).
3. Fill in the target list in `supabase/manual/495_repair_order_converted_shared_product_rows.sql` from Step 1 and run it once in the SQL editor. Then run AC 7.

## Follow-ups (not this task)

- **F1:** the `(customer_id, product_name)` + `.single()` routes (`api/customers/[customerId]/products/[productName]/…`) return 406/PGRST116 for any customer with two same-name product rows. The New Project intake already creates these, and this fix creates them too. They should be keyed by product id or project.

## Baseline

- `npx tsc --noEmit`: exit 0, no output.
- AC2 `grep -n 'eq("product_name"' create-from-order.ts`: matched line 86, so the check fails before the change, as intended.
- ACs 3–7 not run at baseline: they need live order converts or the repair applied.

## Implementation Notes

### What Changed
- `createFromOrder` now always inserts a new `customer_products` row with the reviewer's classifications. The existing-customer reuse lookup is gone. The project insert uses `product.id`.
- New guarded manual repair script, pre-filled for "Veteran Roofing & Exteriors App" → `{Discrete Development}`.

### Files Changed
- `src/lib/stackshift-orders/create-from-order.ts`: removed the reuse branch and rewrote its comment.
- `supabase/manual/495_repair_order_converted_shared_product_rows.sql`: new one-off repair. One transaction. Aborts if a target is missing, ambiguous, or no longer shares its row. Derives the primary classification and `product_name` with the same rules as `customer-phases.ts`. A NOTICE logs the old → new row id for rollback.
- `_docs/task/495-repair-shared-product.sql-check.mjs`: new PGlite check for the script (same pattern as 494).

### Deviations From Plan
- Repair targets are identified by **project name**, limited to order-converted projects, instead of by UUID. The operator can't easily see the UUID, and the name is what Step 1 shows. Duplicate names abort.
- Added the PGlite check script. It wasn't in the plan, but it's the repo's convention for SQL in `_docs/task/`.

### Verification Run
- `npx tsc --noEmit`: PASS (baseline exit 0 → now exit 0)
- AC2 grep: PASS (baseline: match at line 86 → now: no match)
- `npx eslint src/lib/stackshift-orders/create-from-order.ts`: PASS
- PGlite `495-repair-shared-product.sql-check.mjs`: PASS. The App project gets its own Discrete Development / `StackShift` row with empty onboarding data. The website project keeps its StackShift I row and onboarding data. A re-run aborts with "no longer shares" and writes nothing.
- AC3–AC6 (browser converts against a test customer): SKIPPED. Each convert creates real customer/product/project rows, so they're left for the `test` stage.
- AC7: SKIPPED (post-deploy, after the repair script runs).

### Attempts That Failed
- None. The live DB read for Operator Step 1 was denied to the agent during planning, so the diagnosis is still unconfirmed against live data.

### Operator Steps
1. Run the Operator Step 1 detection query (read-only). Confirm Veteran's App project has `projects_on_row ≥ 2` and `cp.classification = 'StackShift I'`. Add any other affected projects to the `targets` list in the script.
2. Deploy the hub (Vercel). The only importer of `create-from-order.ts` is `src/app/api/stackshift-orders/[orderId]/convert/route.ts` (checked with grep). No other deployable.
3. Run `supabase/manual/495_repair_order_converted_shared_product_rows.sql` once in the SQL editor. Keep the NOTICE output (it has the rollback ids). Then run AC7.

## Quality Gate Notes

### Result
PASS

### Standards Review
- `create-from-order.ts`: the diff only removes code. No dead variables are left (`isNewCustomer` is still used for the order link-back and the return value). Error handling is unchanged: a failed insert still throws before the project insert.
- An existing behaviour, now applying to every convert: if the project insert fails after the product insert, the new `customer_products` row is orphaned. This was already true for new customers, and the order stays unconverted so it can be retried. Not a blocker. Same as the New Project intake.
- Repair script: one transaction; explicit ambiguity, not-found, and not-shared guards; derivation rules match `customer-phases.ts`; NOTICE gives the rollback ids. The order-scope subquery is written out twice (target lookup + ambiguity count). That's acceptable in a one-off script.
- The PGlite check asserts behaviour (resulting rows, a re-run aborts and writes nothing), not source text.
- AC2 is a source grep, which is weak evidence on its own. AC3–AC6 (browser) carry the behaviour proof and are still pending for `test`.

### Deviations
- Minor: repair targets are matched by project name instead of UUID, with an ambiguity guard. Still within scope.
- Minor: added a PGlite check script, following the repo's convention for SQL checks.

### Required Fixes
- None.

## Operator Step 1 result (2026-11-23, run by user)

- Confirmed. `C74DEA31-PROJ-03` "Veteran Roofing & Exteriors App" (`43dae56b-1660-47af-aac0-b3148e237be6`, `Custom App`, order services `{FlowForge}`, `is_new_customer=false`) is on `customer_products` `6405099a-99e5-4cfe-b143-86388b4a1038` (`StackShift` / `StackShift I`), with `projects_on_row = 2`. The shared row still says `StackShift I`, so the modal was not used and the website project needs no restore.
- It is the only converted order with `projects_on_row ≥ 2` (7 converted orders checked). The repair script's `targets` list needs no change.
- Not this bug: `E4D31095-PROJ-01` Salas Ayala (services `{StackShift I}`, classified `StackShift II` on its own row). This is likely the reviewer's choice or a later modal edit.
