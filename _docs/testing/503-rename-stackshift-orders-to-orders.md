# Test Report — 503: Rename "StackShift Orders" → "Orders", `/stackshift-orders` → `/orders`

**Date:** 2026-11-24
**Task doc:** `_docs/task/503-rename-stackshift-orders-to-orders.md`
**Result:** PASS. Two criteria were checked statically only (see Skipped).

## Environment
- Local `pnpm dev` (Next.js 16 dev server, http://localhost:3000)
- Browser: Chrome via Claude in Chrome, signed in as an admin user

## Static checks

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS for `src` (0 errors). Stale generated `.next/types/validator.ts` entries for the old route are excluded; they regenerate on dev/build. |
| `pnpm exec eslint` on the changed files | PASS |
| `grep -rn "STACKSHIFT_ORDERS\|stackshift-orders" src` (excluding API, lib, storage-prefix and log-tag references) | PASS. No page-route references remain. |

## Redirect checks (curl, signed out)

```bash
curl -s -o /dev/null -D - "http://localhost:3000/stackshift-orders"
curl -s -o /dev/null -D - "http://localhost:3000/stackshift-orders?tab=converted&page=2"
curl -s -o /dev/null -D - "http://localhost:3000/stackshift-orders/00000000-0000-0000-0000-000000000000"
curl -s -o /dev/null -D - "http://localhost:3000/stackshift-orders/00000000-0000-0000-0000-000000000000?x=1"
curl -s -o /dev/null -D - "http://localhost:3000/orders"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:3000/api/stackshift-orders/00000000-0000-0000-0000-000000000000"
```

| Request | Expected | Actual | Result |
|---------|----------|--------|--------|
| `/stackshift-orders` | 308 → `/orders` | `308`, `location: /orders` | PASS |
| `/stackshift-orders?tab=converted&page=2` | 308, query kept | `308`, `location: /orders?tab=converted&page=2` | PASS |
| `/stackshift-orders/<id>` | 308 → `/orders/<id>` | `308`, `location: /orders/0000…0000` | PASS |
| `/stackshift-orders/<id>?x=1` | 308, query kept | `308`, `location: /orders/0000…0000?x=1` | PASS |
| `/orders` (signed out) | hub auth gate | `307` → `/auth/login?returnTo=%2Forders` | PASS |
| `PATCH /api/stackshift-orders/<id>` (signed out) | API still exists, auth-guarded | `401` | PASS |

## Browser checks (signed in, admin)

| # | Step | Result |
|---|------|--------|
| 1 | Open `/stackshift-orders?tab=converted` | Landed on `/orders?tab=converted`. Tab title "Orders \| WebriQ Central Hub", `<h1>` "Orders". PASS |
| 2 | Sidebar "Orders" entry | `href="/orders"`, `aria-current="page"` (active). PASS |
| 3 | Open `/orders` and click the first row | Navigated to `/orders/71d5f0d1-…`. Tab title "Order \| WebriQ Central Hub". Review page rendered with the back link reading "Back to Orders". Sidebar Orders still active. PASS |
| 4 | Click "Back to Orders" | Returned to `/orders`. Title "Orders". PASS |

## Skipped
- **Finance-department sign-in landing on `/orders`:** no Finance test account was available. Verified statically instead: `DEPARTMENT_HOME.Finance` and `DEPARTMENT_NAV_RESTRICTION.Finance` both use `V2_ROUTES.ORDERS`, and the prefix match (`department-map.ts:71`) allows `/orders/<id>`.
- **Staff notification email link:** sending it requires a webhook submission that emails real recipients. Verified statically: `reviewUrl()` returns `${base}/orders/${orderId}`.
- **Mutating API actions** (convert, dismiss, link project, resend, file download): not run against real orders, to avoid changing data and sending emails. API paths and client `fetch` URLs are unchanged by this task, and the `PATCH` probe confirms the route is still served.
- **Row-menu "Open order":** not clicked. It uses the same `${V2_ROUTES.ORDERS}/${id}` push as the row click, which passed.
