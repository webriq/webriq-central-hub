# 503: Rename "StackShift Orders" → "Orders" and move `/stackshift-orders` → `/orders` (permanent redirect)

**Created:** 2026-11-24
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The Orders review queue is no longer StackShift-only, so it should not be named or routed
that way. Rename the page title from "StackShift Orders" to "Orders", move the page route
from `/stackshift-orders` to `/orders`, and add a permanent (308) redirect from the old URL
(including `/stackshift-orders/[orderId]` detail links, with query strings kept) so bookmarks,
saved links, and links in order-notification emails already sent keep working.

The sidebar label is already "Orders" (`v2-hub-sidebar.tsx:94`). Only the page route,
titles, and internal links change.

## Requirements

- [ ] Page route moves to `/orders` (list) and `/orders/[orderId]` (review/detail).
- [ ] List page `<title>` (metadata) and the on-page `<h1>` read **"Orders"**.
- [ ] Detail page metadata title reads **"Order"** (was "StackShift Order"); the back link reads **"Back to Orders"**.
- [ ] `next.config.ts` `redirects()` gets permanent redirects:
  - `/stackshift-orders` → `/orders`
  - `/stackshift-orders/:path*` → `/orders/:path*`
  (Next keeps the query string, so `?tab=…&page=…` list URLs survive.)
- [ ] `V2_ROUTES` constant points to `/orders`; rename the key `STACKSHIFT_ORDERS` → `ORDERS` and update its 6 call sites.
- [ ] Staff order-notification email review link (`reviewUrl()` in `src/lib/email/stackshift-order-notification.ts`) builds `/orders/<id>`.
- [ ] Finance department nav restriction + Finance home (`department-map.ts`) follow the constant → `/orders`. Finance users still land on Orders after sign-in and can open order detail pages.

## Out of Scope / Must-Not-Change

- **API routes stay at `/api/stackshift-orders/*`** and `/api/webhooks/stackshift-order*`. The webriq.com proxy contract (task 347) depends on the webhook path. The internal API paths are not user-facing, so renaming them only adds risk.
- `src/lib/stackshift-orders/*` module paths, the `stackshift_orders` table, the storage prefix `stackshift-orders/incoming`, and log tags like `[stackshift-orders]` stay as they are.
- Customer-facing confirmation email copy and the "StackShift Order Form" wording in the empty state stay as they are, because that form really is StackShift's.
- Access rules don't change: the page/API guards stay admin/super_admin, and the sidebar entry stays admin-only.
- Do not touch the existing `/kb`, host, and `/v2` redirects.
- No git commands. The user manages version control, so move the folder with a plain filesystem move.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/stackshift-orders/` → `src/app/(hub)/orders/` | Move (whole folder: `page.tsx`, `loading.tsx`, `_components/*`, `[orderId]/**`) | New route |
| `src/app/(hub)/orders/page.tsx` | Modify | `metadata.title` → "Orders" |
| `src/app/(hub)/orders/_components/orders-table.tsx` | Modify | `<h1>` → "Orders"; constant rename |
| `src/app/(hub)/orders/_components/order-row-menu.tsx` | Modify | constant rename |
| `src/app/(hub)/orders/[orderId]/page.tsx` | Modify | `metadata.title` → "Order" |
| `src/app/(hub)/orders/[orderId]/_components/order-review.tsx` | Modify | "Back to Orders"; constant rename |
| `src/app/(hub)/orders/loading.tsx` | Modify (optional) | component name `StackShiftOrdersLoading` → `OrdersLoading` |
| `src/config/constants.ts` | Modify | `ORDERS: "/orders"` (replaces `STACKSHIFT_ORDERS`) |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | constant rename; comment wording |
| `src/lib/auth/department-map.ts` | Modify | constant rename (×2) |
| `src/lib/email/stackshift-order-notification.ts` | Modify | `reviewUrl` → `/orders/${orderId}` |
| `next.config.ts` | Modify | add the two permanent redirects |
| `_docs/context/stackshift-orders.md` | Modify (document stage) | page route references `/stackshift-orders` → `/orders`; note the redirect |

## Code Context

### `src/config/constants.ts:46`
```ts
  STACKSHIFT_ORDERS: "/stackshift-orders",
```
Call sites (all of them):
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx:99` `href={V2_ROUTES.STACKSHIFT_ORDERS}`
- `src/app/(hub)/stackshift-orders/_components/order-row-menu.tsx:101` `router.push(\`${V2_ROUTES.STACKSHIFT_ORDERS}/${order.id}\`)`
- `src/app/(hub)/stackshift-orders/_components/orders-table.tsx:88`, `:198`
- `src/app/(hub)/_components/v2-hub-sidebar.tsx:94`
- `src/lib/auth/department-map.ts:51`, `:59`

After the rename, `grep -rn "STACKSHIFT_ORDERS\|\"/stackshift-orders" src` must return nothing.

### Titles
- `src/app/(hub)/stackshift-orders/page.tsx:8` `export const metadata: Metadata = { title: "StackShift Orders" };`
- `src/app/(hub)/stackshift-orders/[orderId]/page.tsx:12` `export const metadata: Metadata = { title: "StackShift Order" };`
- `src/app/(hub)/stackshift-orders/_components/orders-table.tsx:96` `<h1 …>StackShift Orders</h1>`
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx:102` `<ArrowLeft size={14} /> Back to StackShift Orders`

### `src/lib/email/stackshift-order-notification.ts:23`
```ts
function reviewUrl(orderId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com";
  return `${base}/stackshift-orders/${orderId}`;
}
```
Emails already sent keep the old link and rely on the redirect.

### `next.config.ts` — `redirects()` pattern to follow (task 406 `/kb` → `/wiki`)
```ts
      {
        // Task 406 — the Wiki moved from /kb to /wiki; keep old bookmarks/links (query preserved).
        source: "/kb",
        destination: "/wiki",
        permanent: true,
      },
      {
        source: "/kb/:path*",
        destination: "/wiki/:path*",
        permanent: true,
      },
```
Add the same pair for `/stackshift-orders` → `/orders` right after the `/kb` pair, before the host-based redirects.

### Notes
- `src/proxy.ts:65`: the hub auth gate treats every path except `/auth/`, `/api/`, `/callback`, `/onboarding`, and `/.well-known/` as a hub route, so `/orders` is gated automatically. No proxy change is needed.
- `src/lib/auth/role-access.ts` has no rule for this path. Access is enforced by the page guard plus `src/app/api/stackshift-orders/_auth.ts`, and both are unchanged.
- `department-map.ts:71` prefix-matches `pathname === p || pathname.startsWith(p + "/")`, so `/orders/<id>` stays allowed for Finance.
- No existing `/orders` route or file conflicts with the new path.
- The PWA uses `aggressiveFrontEndNavCaching`. A stale cached `/stackshift-orders` document is harmless because the redirect is evaluated server-side on the next navigation.

## Implementation Steps

1. Move `src/app/(hub)/stackshift-orders/` to `src/app/(hub)/orders/` (filesystem move, no git).
2. Rename `V2_ROUTES.STACKSHIFT_ORDERS` → `V2_ROUTES.ORDERS = "/orders"` in `constants.ts` and update all 6 call sites.
3. Update the titles: list metadata + `<h1>` → "Orders", detail metadata → "Order", back link → "Back to Orders". Optionally rename `StackShiftOrdersLoading` → `OrdersLoading` and reword the sidebar comment ("Orders review queue (task 347)").
4. Update `reviewUrl()` in `stackshift-order-notification.ts` to `/orders/${orderId}`.
5. Add the two permanent redirects to `next.config.ts` with a `// Task 503` comment.
6. Delete any stale `.next` types for the old route if `tsc` complains (`.next/types/app/(hub)/stackshift-orders`).
7. Run the grep sweep and `npx tsc --noEmit`.

## Acceptance Criteria

- [ ] `/orders` renders the Orders list. The browser tab title and the page heading both read "Orders".
- [ ] `/orders/<id>` renders the review page. Its tab title is "Order" and the back link "Back to Orders" goes to `/orders`.
- [ ] `/stackshift-orders` returns a **308** to `/orders`; `/stackshift-orders?tab=converted&page=2` lands on `/orders?tab=converted&page=2`; `/stackshift-orders/<id>` lands on `/orders/<id>`.
- [ ] The sidebar "Orders" entry links to `/orders` and shows as active there.
- [ ] Row click, the row menu's "Open order", tab/pagination links, and the back link all use `/orders…`.
- [ ] A Finance-department user signs in and lands on `/orders` and can open an order detail page.
- [ ] A new staff notification email's review link points to `/orders/<id>`.
- [ ] `/api/stackshift-orders/*` actions (convert, dismiss, link project, resend, file download) still work from the moved pages.
- [ ] `grep -rn "STACKSHIFT_ORDERS\|\"/stackshift-orders\|/stackshift-orders/\${" src` returns no page-route references. API paths `/api/stackshift-orders` and storage prefix `stackshift-orders/incoming` remain.

## Verification

```bash
npx tsc --noEmit
pnpm exec eslint "src/app/(hub)/orders" src/config/constants.ts src/lib/auth/department-map.ts src/lib/email/stackshift-order-notification.ts "src/app/(hub)/_components/v2-hub-sidebar.tsx" next.config.ts
grep -rn "STACKSHIFT_ORDERS\|stackshift-orders" src | grep -v "/api/stackshift-orders\|lib/stackshift-orders\|stackshift-orders/incoming\|\[stackshift-orders\]"
# Redirect check (dev server running):
curl -sI "http://localhost:3000/stackshift-orders?tab=converted" | grep -i "^HTTP\|^location"
curl -sI "http://localhost:3000/stackshift-orders/00000000-0000-0000-0000-000000000000" | grep -i "^HTTP\|^location"
```
Browser: as admin, open `/orders`, check the tab title and heading, click into an order, use the back link, and check sidebar active state. Then hit the old URL from the address bar.

## Compatibility Touchpoints

- **Emails already sent** contain `/stackshift-orders/<id>`. The permanent redirect covers them, so keep it indefinitely.
- **webriq.com proxy / StackShift integration:** not affected, because the webhook and API paths are unchanged.
- **Docs:** `_docs/context/stackshift-orders.md` mentions the `/stackshift-orders` page route in several places. Update it to `/orders` in the document stage. Older task docs (347, 353, 354, 375, 376, 498, 499) are historical and are not edited.
- **MCP:** no MCP tool references this page route, so `_docs/mcp-tools.md` doesn't change.

## Implementation Notes

### What Changed
- Moved the page tree `src/app/(hub)/stackshift-orders/` → `src/app/(hub)/orders/` (filesystem move, no git).
- `V2_ROUTES.STACKSHIFT_ORDERS` → `V2_ROUTES.ORDERS = "/orders"`; all 6 call sites updated.
- Titles: list metadata + `<h1>` → "Orders"; detail metadata → "Order"; back link → "Back to Orders"; `StackShiftOrdersLoading` → `OrdersLoading`.
- Staff notification email `reviewUrl()` → `/orders/<id>`.
- `next.config.ts`: permanent redirects `/stackshift-orders` → `/orders` and `/stackshift-orders/:path*` → `/orders/:path*`, placed after the `/kb` pair.

### Files Changed
- `src/app/(hub)/orders/**` - moved; `page.tsx`, `[orderId]/page.tsx`, `loading.tsx`, `_components/orders-table.tsx`, `_components/order-row-menu.tsx`, `[orderId]/_components/order-review.tsx` edited
- `src/config/constants.ts` - route constant
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` - constant + comment
- `src/lib/auth/department-map.ts` - constant (Finance restriction + home)
- `src/lib/email/stackshift-order-notification.ts` - review link
- `src/app/api/webhooks/stackshift-order/route.ts` - comment only (old page route mentioned)
- `next.config.ts` - redirects

### Deviations From Plan
- Also updated the page-route comment in `src/app/api/webhooks/stackshift-order/route.ts`, which wasn't in the file table. It's a comment-only change.
- `_docs/context/stackshift-orders.md` is left for the document stage, as planned.

### Verification Run
- `npx tsc --noEmit` - PASS for `src` (0 errors). The 4 remaining errors are stale generated `.next/types/validator.ts` / `.next/dev/types/validator.ts` entries for the old route, which regenerate on the next `pnpm dev`/build.
- `eslint` on changed files - PASS
- Grep sweep - PASS (only API, lib, storage-prefix and log-tag references remain, plus one unrelated comment in `api/v2/projects/[projectId]/route.ts` about the API)
- curl redirect checks - SKIPPED (dev server not running)
- Browser checks - SKIPPED (pending test stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. All 6 `V2_ROUTES.ORDERS` call sites are updated, and no page-route references to `/stackshift-orders` remain under `src/app/(hub)`.
- The redirect pair follows the existing `/kb` → `/wiki` pattern and is placed before the host and `/v2` catch-alls.
- Nit fixed during the gate: renamed the page components `StackShiftOrdersPage` → `OrdersPage` and `StackShiftOrderDetailPage` → `OrderDetailPage` to match `OrdersLoading`. These are internal names only; `tsc` is still clean for `src`.
- The changed-file list came from Implementation Notes. `git diff` wasn't run because CLAUDE.md forbids git commands.

### Deviations
- Minor: the comment-only edit in `src/app/api/webhooks/stackshift-order/route.ts`, which was already noted in Implementation Notes.
- Minor: the page component renames above, which are cosmetic.
- Outside this task's code scope: the stop hook added a scoped `.impeccable/config.json` ignore for the pre-existing Arial font in the notification email HTML. It's tooling config only.

### Required Fixes
- None.
