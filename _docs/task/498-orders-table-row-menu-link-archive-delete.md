# 498: StackShift Orders table: row kebab menu with Link existing project, Archive/Restore and Delete (all confirmed)

**Created:** 2026-11-23
**Priority:** MEDIUM
**Type:** feature (+ migration 191, written-not-applied)
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Task 496 put **Link existing project** on the order detail page only. Reviewers also want it, plus **Archive** and **Delete**, directly on the `/stackshift-orders` table, through a kebab menu on each row. Every action needs a confirmation dialog first.

Decisions (user, 2026-11-23):
- **Archive** is a separate flag, not a status. An archived order leaves every status tab and appears only under a new **Archived** tab, where it can be **Restored**. It keeps its status (pending, converted or dismissed).
- **Delete** is a soft delete (`deleted_at`). The order disappears from every tab and count. The row and its Storage files stay, so it can be recovered with SQL.
- **Permissions:**
  - Link, Archive and Restore use the existing `requireOrderMutator` (admin + super_admin, not the Finance department).
  - Delete is **super_admin only** (still not Finance).
- **Converted orders can be archived but not deleted.**

## Requirements

### Data (migration 191, written-not-applied)
- [ ] `supabase/migrations/191_stackshift_orders_archive_delete.sql`: `add column if not exists archived_at timestamptz, add column if not exists deleted_at timestamptz` on `stackshift_orders`. No backfill, no index (small table).
- [ ] `src/types/database.ts`: add both columns to Row/Insert/Update.

### API
- [ ] `_auth.ts`: `requireOrderReviewer` / `requireOrderMutator` also return `role`. Callers that ignore it are unchanged.
- [ ] `PATCH /api/stackshift-orders/[orderId]`: `patchOrderSchema.action` becomes `dismiss | reopen | archive | restore`.
  - `archive` sets `archived_at = now()`. `restore` clears it.
  - Both are allowed for **any** status, including converted. Today's "Converted orders can't change status" 409 must apply only to `dismiss`/`reopen`.
  - Every action returns 404 on a deleted order.
- [ ] `DELETE /api/stackshift-orders/[orderId]`:
  - 403 unless `role === 'super_admin'` (via `requireOrderMutator`, so Finance is still 403)
  - 404 if missing or already deleted; 409 if `status = 'converted'`
  - otherwise sets `deleted_at = now()`
- [ ] Before migration 191 is applied, archive/restore/delete writes fail with `42703`/`PGRST204`. They return **503** "Apply migration 191 first" rather than 500.
- [ ] `convert/route.ts`, `link-project/route.ts`, `resend/route.ts`, `file/route.ts`: treat a deleted order as 404. Read it with `select("*")` and check `deleted_at` in JS, so nothing breaks before 191. Link and PATCH currently select `"id, status"` and change to `"*"`.

### List page (`page.tsx`)
- [ ] New tab value `archived`. Status tabs add `.is("archived_at", null)`, and the Archived tab uses `.not("archived_at","is",null)` (all statuses). Every query, list and counts, adds `.is("deleted_at", null)`.
- [ ] **Before migration 191:** if the list query fails with `42703`, re-run it without the two filters, so today's behaviour is unchanged. The Archived count is then 0.
- [ ] Load the viewer's department as the detail page does, and pass `readOnly` (Finance) and `isSuperAdmin` to the table. Finance users see no kebab.

### Table + menu
- [ ] `orders-table.tsx`:
  - add the `Archived` tab
  - the header gets a 40px trailing column
  - each row becomes a `div` grid: the existing row `<button>` (4 columns, unchanged) plus the menu cell. A menu button can't be nested inside the row button, which is the same constraint `_portfolio-card-menu.tsx` documents
- [ ] New `_components/order-row-menu.tsx`. It uses the kebab pattern from `_portfolio-card-menu.tsx`:
  - a fixed-position dropdown anchored to the trigger, so it isn't clipped by the table's `overflow-hidden`
  - `aria-label="Order actions"`, `role="menu"` / `menuitem`, and Esc closes it

  Items, by order state:

  | Item | Shown when | Confirm |
  |------|-----------|---------|
  | Open order | always | none (navigation) |
  | Link existing project | `status = pending_review` and not archived | `LinkProjectDialog` → `ConfirmDialog` danger (as 496) |
  | Archive | not archived | `ConfirmDialog` neutral: "Archive order from {company}?" / "It moves to the Archived tab and can be restored there." |
  | Restore | archived | `ConfirmDialog` neutral: "Restore order from {company}?" / "It returns to the {status label} tab." |
  | Delete | `isSuperAdmin` and `status ≠ converted` | `ConfirmDialog` danger: "Delete order from {company}?" / "It's removed from every tab. Only a database admin can recover it." |

  Delete sits below a divider, in red (`#C0392B` on `#FDE8E6` hover), like Delete Project. On success: `toast.success("Order archived" | "Order restored" | "Order deleted")` + `router.refresh()`. On failure: `toast.error(<server message>)`, and the dialog stays open. The confirm button shows "Archiving…" etc. and is disabled while busy.
- [ ] Hide the menu for read-only viewers. For a converted order that isn't super_admin-deletable, the menu still has Open and Archive.

### Shared pieces (maintainability: `_convert-panel.tsx` is 372 lines after 496)
- [ ] New `_components/customer-search.tsx`: the customer search input + results dropdown, moved verbatim from `_convert-panel.tsx` (`searchCustomers`, results list, "Selected: …"). Props: `value`, `onSelect(customer)`, `initialQuery`.
- [ ] New `_components/link-project-dialog.tsx`: 496's inline link section (customer, then project list with loading/empty/selected states, then confirm), now a modal. Overlay as `ConfirmDialog` (`fixed inset-0 z-[60] bg-[#0B1533]/40`), panel white with `--line` border, `--r-lg` and `--sh-md`. It ends in the danger `ConfirmDialog` and POSTs to `/link-project`. Props: `orderId`, `companyName`, `initialCustomer?` (the detail page passes `order._match`; the table passes none and prefills the search text with `company_name`), `open`, `onClose`, `onLinked`.
- [ ] `_convert-panel.tsx`: replace the inline customer search JSX and the 496 link section with `<CustomerSearch>` and a button that opens `<LinkProjectDialog>`. Target: back under ~250 lines. Behaviour must not change (AC 12).
- [ ] Design-guide fix (carried from 496): the link action's confirm/navigate button is **blue** (`#007BFF`, hover `#0063D6`), not navy. The guide says navy is for selection and filters, blue for actions.

### Shared confirm dialog
- [ ] `src/components/ui/confirm-dialog.tsx`: optional `tone?: "danger" | "neutral"` (default `danger`, so all existing callers are unchanged). `neutral` uses a blue icon tint and a blue confirm button, through a static class lookup (no runtime-built class names). The guide reserves `--late` red for errors and destructive actions, so Archive and Restore must not be red.

### Detail page
- [ ] `[orderId]/page.tsx`: `notFound()` when `order.deleted_at` is set. An archived order still opens normally. No archive UI on the detail page (out of scope).

## Out of scope / must not change

- Hard delete, Storage file cleanup, an un-delete UI, and bulk actions.
- Archive/restore/delete on the detail page (table only).
- Dismiss/Reopen behaviour and wording, the Convert flow, and 496's link rules (pending-only, one order per project, deleted/merged projects rejected).
- The webhook's `dedupe_key` idempotency. A resubmission whose key matches a **deleted** order still returns that order and doesn't create a new one. This is accepted: deletes are rare and the key is per submission.
- `ConfirmDialog` focus trapping and Esc handling (existing gap, out of scope).

## Proposed File Changes

| File | Change | Est. lines |
|------|--------|-----------|
| `supabase/migrations/191_stackshift_orders_archive_delete.sql` | new | ~8 |
| `src/types/database.ts` | 2 columns × 3 | +6 |
| `src/lib/stackshift-orders/schema.ts` | action enum | ±1 |
| `src/app/api/stackshift-orders/_auth.ts` | return `role` | ±4 |
| `src/app/api/stackshift-orders/[orderId]/route.ts` | archive/restore, DELETE, deleted guard, 503 | ~120 |
| `src/app/api/stackshift-orders/[orderId]/{convert,link-project,resend,file}/route.ts` | deleted → 404 | +2 each |
| `src/components/ui/confirm-dialog.tsx` | `tone` | +10 |
| `src/app/(hub)/stackshift-orders/page.tsx` | archived tab, filters + 42703 fallback, readOnly/isSuperAdmin | ~110 |
| `src/app/(hub)/stackshift-orders/_components/orders-table.tsx` | tab, row grid, menu cell | ~245 |
| `src/app/(hub)/stackshift-orders/_components/order-row-menu.tsx` | new | ~170 |
| `src/app/(hub)/stackshift-orders/_components/link-project-dialog.tsx` | new (from 496 panel) | ~150 |
| `src/app/(hub)/stackshift-orders/_components/customer-search.tsx` | new (from panel) | ~60 |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/_convert-panel.tsx` | use the two shared pieces | ~250 |
| `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` | deleted → notFound | +1 |

File-length guide (`nextjs-file-length-best-practices.md`): every component stays ≤ ~250 lines and every route ≤ ~150. If `order-row-menu.tsx` goes over, split the dialogs into an `_order-action-dialogs.tsx`, not into more props.

## Code Context

- `orders-table.tsx:11,30-34`: `OrderStatus` + `STATUS_TABS`. Add `"archived"` to the tab type only. Keep `OrderStatus` as the DB status, and add a separate `OrderTab = OrderStatus | "archived"`.
- `orders-table.tsx:174-224`: the row is a `<button>` with grid `grid-cols-[1.3fr_1.2fr_1.4fr_120px]`. The header uses the same template at line 167.
- `page.tsx:10,33-35,36-44,57-66`: `STATUS_VALUES`, the tab parse (default `pending_review`), the list query and per-status counts. The counts loop runs one query per tab, and Archived adds one more.
- `_portfolio-card-menu.tsx:14-15,52-61,113-191`: `MENU_WIDTH`/`MENU_HEIGHT`, `toggleMenu()` rect clamping, a backdrop `fixed inset-0 z-40` + a `fixed z-50` panel with `style={{left, top}}`. That's the one allowed `style` use: runtime positioning, the same precedent. Item classes and the divider and red delete item come from there too.
- `confirm-dialog.tsx`: the whole component is 50 lines. Add `tone` there.
- `[orderId]/route.ts:36-38`: the converted 409 that must narrow to dismiss/reopen.
- `_auth.ts:9-34`: `requireOrderReviewer` already loads `profile.role`.
- `_convert-panel.tsx` (after 496): `customerPicker` const (search JSX), `loadCustomerProjects`, `submitLink`, the link section JSX and the `ConfirmDialog`. All of this moves into `customer-search.tsx` / `link-project-dialog.tsx`.
- Design guide `_final_design/guide/central-hub-design-system.md`:
  - §3 elevation `--sh-md` for dropdowns/modals, border + shadow together, z-popover 40
  - §4 Buttons (blue for confirm, ghost, sentence-case outcome labels)
  - §4 Table (row hover `--blue-50` = `#F0F7FF`)
  - §5 focus 2px blue outline on every interactive element, 160ms transitions, `prefers-reduced-motion`
  - §6 sentence case, no exclamation marks, errors state the problem and the fix

## Implementation Steps

1. Migration 191 + types + schema enum + `_auth` role.
2. API: PATCH archive/restore + DELETE + deleted guards (+ 503 on a missing column). Run `tsc`.
3. `ConfirmDialog` `tone`.
4. Extract `customer-search.tsx` and `link-project-dialog.tsx`, and rewire `_convert-panel.tsx`. Run `tsc`/`eslint`, then re-run 496's link flow on the detail page (AC 12).
5. `page.tsx` filters + fallback + props. Then the `orders-table.tsx` row grid + Archived tab, and `order-row-menu.tsx`.
6. Detail page deleted → notFound.
7. Run `tsc`, `eslint`, then the browser and curl checks below. Check every file length with `wc -l`.

## Acceptance Criteria

Use only `customers.is_test` customers and orders created for testing.

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` + `npx eslint <changed files>` | clean | pre-merge |
| 2 | `wc -l` on every changed/new component and route | components ≤ ~250, routes ≤ ~150 | pre-merge |
| 3 | Browser `/stackshift-orders`: each row has a kebab (`aria-label="Order actions"`). Clicking it opens the menu without navigating, and clicking the row elsewhere still opens the order. | as stated | pre-merge |
| 4 | Keyboard: Tab to a kebab, Enter opens it, Esc closes it, and the focus ring is visible | as stated | pre-merge |
| 5 | Pending test order → Link existing project → dialog → pick customer + project → red confirm → confirm | the order moves to the Converted tab; same DB result as 496 AC 3 | pre-merge, after 191 |
| 6 | Archive a pending test order → neutral (blue) confirm → confirm | toast "Order archived". It's gone from Pending review and listed under Archived. `archived_at` is set and `status` is unchanged. | pre-merge, after 191 |
| 7 | Restore it from Archived | it's back under Pending review and `archived_at` is null | pre-merge, after 191 |
| 8 | As super_admin, delete a dismissed test order (red confirm) | it's gone from every tab and count, `deleted_at` is set, and `/stackshift-orders/<id>` returns 404 | pre-merge, after 191 |
| 9 | `curl -X DELETE` as an admin (not super_admin) | 403. The admin's menu has no Delete item. | pre-merge |
| 10 | `curl -X DELETE` on a converted order as super_admin | 409. The menu has no Delete item for converted orders. | pre-merge |
| 11 | Cancel in every confirm dialog | no request is sent (Network tab) | pre-merge |
| 12 | **No regression:** detail page Convert (both customer modes) and 496 Link still work, and the customer search still prefills from the match | unchanged | pre-merge |
| 13 | **No regression, before 191 is applied:** `/stackshift-orders` tabs and counts are the same as today. Archive returns 503 with "Apply migration 191 first" (as a toast). | as stated | pre-merge |
| 14 | **No regression:** Finance user sees no kebab; `PATCH {action:"archive"}` → 403 | as stated | pre-merge |
| 15 | **No regression:** other `ConfirmDialog` callers (e.g. Delete Project) are still red | unchanged | pre-merge |
| 16 | After 191 is applied in prod: Archived tab and actions work | as stated | post-deploy |

## Verification

`tsc` + `eslint` + `wc -l`. Browser checks 3–8, 11–15 run on a local dev server against test orders; check 13 runs before applying 191 locally. Curl checks 9, 10 and 14. Check 16 runs after deploy.

## Coordination

- **496** (Testing, same session): this task edits 496's files: `_convert-panel.tsx` (the link section moves into `link-project-dialog.tsx`), `link-project/route.ts` (deleted guard) and `order-review.tsx` (no change planned). **Land after 496.** Implement on top of 496's working-tree state. 496's AC 2–3 then run through the new dialog, which keeps the same flow and the same confirm.
- **495** (Testing): `create-from-order.ts` only. No overlap.
- **429** (In Progress): has `lib/stackshift-orders/*` in scope. This task changes one line in `schema.ts` (the action enum). Rebase if needed.
- `confirm-dialog.tsx` is shared by many pages. The change is additive with a default, so other callers are unaffected (AC 15).

## Open Decisions

- **D1 — RESOLVED 2026-11-23 (user):** Archive is an `archived_at` flag with an Archived tab + Restore. Status is kept.
- **D2 — RESOLVED 2026-11-23 (user):** Delete is a soft delete with `deleted_at`. The row and files are kept.
- **D3 — RESOLVED 2026-11-23 (user):** Link/Archive/Restore use the existing mutators; Delete is super_admin only. Finance is never allowed.
- **D4 — RESOLVED 2026-11-23 (user):** converted orders can be archived but not deleted.
- **D5 (NON-BLOCKING): dialog tone.** Default: Delete and Link use the red danger dialog (Link as you asked for 496); Archive and Restore use the new neutral (blue) tone. Alternative: all red.

## Operator Steps

1. Deploy the hub (Vercel). It's the only deployable: every changed file is under `src/`. `confirm-dialog.tsx` and `schema.ts` are imported only within the hub app (`grep -rn "confirm-dialog\|stackshift-orders/schema" src`).
2. Apply `supabase/migrations/191_stackshift_orders_archive_delete.sql`. The code degrades before it (AC 13): tabs are unchanged and the actions return 503. After that, run AC 16.
3. To recover a deleted order: `update stackshift_orders set deleted_at = null where id = '<order id>';`

## Skills note

The design guide covers every surface here (menu, dialog, table, buttons), so `/frontend-design` and `/impeccable` aren't needed for planning. Implementation follows the guide's tokens and the existing `_portfolio-card-menu.tsx` pattern rather than a new visual direction.

## Baseline

- `npx tsc --noEmit`: exit 0.
- Line counts: `_convert-panel.tsx` 372, `orders-table.tsx` 230, `page.tsx` 78, `[orderId]/route.ts` 65, `confirm-dialog.tsx` 55.
- No row menu, Archived tab or DELETE handler existed, so AC 3–10 and 16 fail by construction before the change.

## Implementation Notes

### What Changed
- **Migration 191** (`archived_at`, `deleted_at`) and types. `patchOrderSchema` gains `archive`/`restore`. `requireOrderReviewer`/`requireOrderMutator` now return `role`.
- **`[orderId]/route.ts`:**
  - PATCH archive/restore works for any status; the converted 409 now applies only to dismiss/reopen
  - new DELETE: super_admin only, 409 on converted, sets `deleted_at`
  - a deleted order is 404 for every action; a missing column (`42703`/`PGRST204`) returns 503 "Apply migration 191 first"
- **Deleted orders are 404** in convert, link-project, resend and file (all read with `select("*")`), and in the detail page (`notFound()`).
- **`ConfirmDialog`:** new `tone` prop (`danger` default, `neutral` blue) via a static lookup.
- **New `customer-search.tsx`:** the typeahead moved out of the panel, with an `aria-label` and the guide's dropdown shadow.
- **New `link-project-dialog.tsx`:** 496's link flow as a modal.
  - skeleton rows while projects load; a blue "Link project" action, per the guide; inline error box; danger confirm
  - a latest-request ref discards out-of-order project responses (the race noted in 496's quality gate)
  - the prefilled customer loads once in an effect, with the state set in `.then`
- **`_convert-panel.tsx`:** uses both shared pieces, and "Link existing project" opens the dialog. 372 → 224 lines.
- **List page (`page.tsx`):**
  - `archived` tab; tab filters built as `.filter()` triples
  - on `42703` it falls back to today's status-only filters, and the Archived tab is empty
  - Finance → `readOnly`; `isSuperAdmin` passed to the table
- **`orders-table.tsx`:**
  - Archived tab with its own empty-state copy
  - header and rows are `[content, 44px menu]` grids (the menu can't nest inside the row `<button>`); the menu column is hidden for read-only viewers
  - the four pagination buttons are one mapped list, which adds `aria-label`s
- **New `order-row-menu.tsx`:**
  - kebab with `aria-haspopup`/`aria-expanded`, and `role="menu"`/`menuitem`; the first item autofocuses; Esc closes the menu and refocuses the trigger
  - fixed-position panel (the same technique as `_portfolio-card-menu.tsx`)
  - items: Open order / Link existing project (pending, not archived) / Archive or Restore / Delete (super_admin, not converted, red below a divider)
  - one `ConfirmDialog` driven by the pending action: neutral for archive/restore, danger for delete
  - sonner toast on success/failure; the dialog stays open on failure

### Files Changed
- `supabase/migrations/191_stackshift_orders_archive_delete.sql` (new)
- `src/types/database.ts`, `src/lib/stackshift-orders/schema.ts`, `src/app/api/stackshift-orders/_auth.ts`
- `src/app/api/stackshift-orders/[orderId]/route.ts` (rewritten: PATCH + DELETE)
- `src/app/api/stackshift-orders/[orderId]/{convert,link-project,resend,file}/route.ts` (deleted → 404)
- `src/components/ui/confirm-dialog.tsx` (`tone`)
- `src/app/(hub)/stackshift-orders/page.tsx`, `_components/orders-table.tsx`
- `src/app/(hub)/stackshift-orders/_components/{order-row-menu,link-project-dialog,customer-search}.tsx` (new)
- `src/app/(hub)/stackshift-orders/[orderId]/_components/_convert-panel.tsx`, `[orderId]/page.tsx`

### Deviations From Plan
- Minor: `LinkProjectDialog` is mounted only while open (no `open` prop), so its state resets on every open.
- Minor: on the table, the dialog prefills the customer search **text** with the order's company name but doesn't preselect a customer. The table has no customer match, so the reviewer picks from the results.
- Minor: the tab filters use `.filter(col, op, val)` triples instead of a generic helper over the query builder, because two differently-typed `select()` builders couldn't share a typed helper.
- Minor: the pagination buttons were collapsed into a mapped list to keep `orders-table.tsx` near the guide's length (260 → 255).
- Minor: the convert panel's "Link existing project" button is a ghost button (hover border `#A8C6F5`). The dialog's primary action is blue. That's the guide's split between ghost (secondary) and blue (confirm).

### Verification Run
- `npx tsc --noEmit`: PASS (baseline exit 0 → exit 0)
- `npx eslint` on `src/app/(hub)/stackshift-orders/`, `src/app/api/stackshift-orders/`, `confirm-dialog.tsx`, `schema.ts`: PASS
- AC 2, `wc -l`: PASS. Components: table 255, menu 200, link dialog ~200, panel 224, customer search 69, page 97. Routes: `[orderId]` 103, link-project 96, others ≤ 81. The table is 5 lines over the soft ~250.
- Local dev server, signed out: `PATCH {action:"archive"}` → 401, `DELETE` → 401, `/stackshift-orders?status=archived` → 307 to login. It compiles with no errors in the dev log.
- AC 3–15 (signed-in browser/curl): SKIPPED. They archive, delete and link real order rows and need a signed-in admin and super_admin plus test orders, so they're left for the `test` stage.
- AC 16: post-deploy.

### Attempts That Failed
- A generic `forTab<Q>()` filter helper over the Supabase builder failed tsc (`eq`/`is` not on `Q`), and the conditional select string made the row type a `ParserError`. Replaced with `.filter()` triples and one `SELECT` constant.
- The first `LinkProjectDialog` triggered the prefilled-customer fetch during render. That's impure and would double-fetch under StrictMode. Moved to a one-time effect (`setState` only in `.then`) plus the select handler.
- The first route draft used a module-level `NextResponse` for the 503. A Response body can only be read once, so a second request would fail. Changed to a factory function.

### Operator Steps
1. Deploy the hub (Vercel). It's the only deployable: all changes are under `src/`. `confirm-dialog.tsx` is imported only by hub pages, and `schema.ts`/`_auth.ts` only by the hub's stackshift-orders routes.
2. Apply `supabase/migrations/191_stackshift_orders_archive_delete.sql`. Before it, tabs and counts are unchanged and Archive/Restore/Delete return 503. Apply 189 (task 496) too if it isn't yet; they're independent.
3. To recover a deleted order: `update stackshift_orders set deleted_at = null where id = '<order id>';`

### Renumbering (2026-11-23)
- This task was planned as **497 / migration 190**. Another session had already taken **497** (Desk Inbox: delete a single message) and **migration 190** (`190_inbox_messages_soft_delete.sql`). I renumbered this task to **498** and its migration to **191** (`191_stackshift_orders_archive_delete.sql`). Code comments, the 503 message ("Apply migration 191 first") and the tracker row are updated. The other session's files were not touched.
- 190 and 191 are independent: they add different columns to different tables. Apply 189 (task 496) and 191 in any order.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **API (`[orderId]/route.ts`):**
  - `loadOrder` and `writeOrder` remove the duplicated lookup/update between PATCH and DELETE
  - guard clauses only; each refusal has its own status (401/403/404/409/503/500)
  - the 503 response is created per request (a factory), not a shared `Response`
  - the converted 409 is correctly narrowed to dismiss/reopen
- **Deleted orders are 404 everywhere a single order is read:** detail page, PATCH, DELETE, convert, link-project, resend, file. Each uses `select("*")`, so nothing breaks before migration 191.
- **List page:** the tab rules live in one `tabFilters()` table that both the list and the count queries use, so they can't drift. The pre-191 fallback reuses the same function with `withFlags=false`.
- **`ConfirmDialog` `tone`:** a static lookup with `danger` as the default. Existing callers are byte-identical in behaviour.
- **`order-row-menu.tsx`:**
  - one `ConfirmDialog` driven by `pending`, and copy per action in `ACTION_COPY`, with no repeated dialog JSX
  - the menu items are data (`items[]`)
  - the Esc listener is a subscription effect, so state is set only in the callback
- **`link-project-dialog.tsx`:**
  - the fetch is a pure helper; the latest-request ref drops stale responses
  - the prefill effect sets state only in `.then`
  - the dialog is mounted only while open, so its state resets on each open
- **Design guide:**
  - blue for actions, ghost for secondary, red only for delete/link
  - `--sh-md` shadow + `--line` border on the menu, dialog and dropdown
  - row hover `#F0F7FF`; focus-visible outlines on the kebab and menu items
  - sentence-case labels; error copy states the fix ("Apply migration 191 first", "archive it instead")
- **File lengths:** within the guide, except `orders-table.tsx` at 255 (soft target ~250). Accepted: it's mostly simple JSX, and the pagination repetition was already collapsed.
- **Minor, not fixed:**
  - `role="menu"` without arrow-key navigation. Tab/Shift-Tab and Esc work, but the full ARIA menu pattern wants Up/Down. A small follow-up if wanted.
  - The prefill `useEffect` doesn't list `load` as a dependency. `load` only touches a ref and state setters, so the effect is correct, and eslint passes.
  - Esc and focus trapping in `ConfirmDialog` and the link dialog: already excluded from scope.
- **Acceptance criteria:** every one names a check that could fail. AC 1–2 and the signed-out route/page checks have been run. AC 3–15 (signed-in) and 16 (post-deploy) are pending for `test`.

### Deviations
- Minor (recorded in Implementation Notes):
  - the dialog is mount-on-open, with no `open` prop
  - the table prefills the search text rather than a matched customer
  - `.filter()` triples instead of a generic helper
  - pagination collapsed
  - ghost "Link existing project" trigger + blue primary in the dialog
- Medium, visible to the user: the renumbering to **498 / migration 191** after another session took 497/190. No behaviour change. The operator must apply **191** (not 190) for this feature.

### Required Fixes
- None.
