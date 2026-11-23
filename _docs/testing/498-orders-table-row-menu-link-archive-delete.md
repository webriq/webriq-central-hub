# Test Report: StackShift Orders table row menu (Link existing project, Archive/Restore, Delete)

**Task:** 498 · **Date:** 2026-11-23 · **Result:** **PASS for everything that can run before migration 191.** Checks that write data (5–8) and need a second role (9, 14) are **Deferred**: they need migration 191 applied, test orders, and an admin and a Finance login.

## Test Environment

- Local dev server `http://localhost:3000`, already running (PID 28068) against this working tree. My own `pnpm dev` exited because that one was running.
- Chrome (Claude in Chrome), signed in as an existing **super_admin** session.
- Database: shared Supabase. **Migration 189 is applied** (`link_method` is present in the order payload). **Migration 191 is NOT applied**: `archived_at` and `deleted_at` are absent from the detail page's `select("*")` payload, checked with `fetch(location.href)` and a text search.
- **No order, project or customer data was changed.** Every dialog was cancelled. The only write-path calls were refused before or at the database:
  - DELETE on a converted order → 409 before the write
  - Archive before 191 → the update fails on the missing column, 503, nothing written
  - 404 / 400 for the missing order and the bad action

## Verification Commands

| # | Check (as run) | Result | Baseline → now |
|---|---|---|---|
| 1 | `npx tsc --noEmit` · `npx eslint src/app/(hub)/stackshift-orders/ src/app/api/stackshift-orders/ src/components/ui/confirm-dialog.tsx src/lib/stackshift-orders/schema.ts` | PASS | exit 0 → exit 0 |
| 2 | `wc -l` on changed files | PASS (soft): table 255, menu 200, link dialog ~200, panel 224, page 97; routes ≤ 103 | panel 372 → 224 |
| 3 | `/stackshift-orders`: click the first row's kebab | PASS: the menu opens, the URL stays `/stackshift-orders`; items **Open order / Link existing project / Archive / Delete** | no menu → menu |
| 4 | Keyboard: menu open → first item focused (`Open order`, `role=menuitem`) → `Escape` → menu gone, focus on `aria-label="Order actions"`, `aria-expanded="false"` → `Enter` reopens it with a visible blue focus ring | PASS | n/a → pass |
| 11 | Cancel in the Archive (neutral, blue icon/button), Delete (red) and Link (red) confirms; `read_network_requests` `/api/stackshift-orders` + `performance` entries | PASS: **0** PATCH/DELETE/link-project requests | n/a |
| 10 | Converted tab, first row's menu items | PASS: `["Open order","Archive"]` (no Delete, no Link) | n/a |
| 10 | `fetch DELETE /api/stackshift-orders/5a09518b-…` (converted, as super_admin) | PASS: **409** "Converted orders can't be deleted — archive it instead" | n/a |
| 13 | Before 191: tabs render and count (Pending review 7, Converted 7, Dismissed 0, Archived 0); page loads with no error (42703 fallback) | PASS | 3 tabs → 4 tabs, same counts |
| 13 | `fetch PATCH {action:"archive"}` before 191 | PASS: **503** "Apply migration 191 first" | n/a |
| 13 | UI: row menu → Archive → **Archive order** before 191 | PASS: toast "Apply migration 191 first", the dialog **stays open**, the label resets to "Archive order" | n/a |
| – | `DELETE` on a nonexistent uuid · `PATCH {action:"nope"}` | PASS: 404 · 400 | n/a |
| 5 (partial) | Row menu → Link existing project: the dialog opens with search prefilled from `company_name` and **Link project disabled** → search "Veteran" → pick customer → skeleton rows → 3 projects listed → select one → Link project → red confirm names `Veteran Roofing & Exteriors App` / `C74DEA31-PROJ-03` → **Cancel**, then dialog Cancel | PASS for the UI flow; **the link itself was not submitted** | n/a |
| 12 (partial) | Pending order detail (`63df0bfe-…`, reached through **Open order**): panel shows Create new customer / Link existing customer / Create customer & project / Dismiss / Link existing project. "Link existing customer" shows the shared `Search customers` input. "Link existing project" opens the dialog (prefill = company name, Link disabled), and Close dismisses it. | PASS. **Not covered:** the customer-match prefill (this order had no match) and an actual Convert. | n/a |
| 15 | `/projects/stackshift-i` → Project actions → Delete Project | PASS: confirm background `rgb(192, 57, 43)` (= `#C0392B`, unchanged), cancelled, closed | unchanged |
| – | Console errors (Projects tab, after the run) | none | n/a |

## Deferred / Not Run

| # | Why | Exact step to run it |
|---|---|---|
| 5 | It would convert a real order. There are no `is_test` orders (the orders table has no test flag). | Create a test order, link it to a test customer's project, and check `status/customer_id/project_id/link_method='linked_existing'` |
| 6, 7 | They need migration 191 | Apply 191 → archive a test order (gone from Pending, listed under Archived, `archived_at` set, status unchanged) → Restore |
| 8 | Needs 191, and it would hide a real order | After 191, delete a **dismissed test** order as super_admin → gone from every tab and count, `deleted_at` set, its detail page returns 404 |
| 9 | Needs a non-super_admin **admin** session | As an admin: the menu has no Delete; `DELETE` → 403 |
| 14 | Needs a **Finance** user | As Finance: no kebab column; `PATCH {action:"archive"}` → 403 |
| 12 (rest) | Convert would create a real customer/project | Convert a test order with both customer modes; check the match prefill on an order that has a customer match |
| 16 | Post-deploy | After deploy + 191: Archived tab, Restore, Delete in production |

## Findings

- No failures.
- Observation: right after typing, the customer results dropdown appears a moment later (it searches on every keystroke with no debounce). This is the existing behaviour moved verbatim from the convert panel; not a regression.
- Migration 189 (task 496) is already applied on the shared DB. Migration 191 is not.
