# 375 — Exclude PMs from the Orders Tab + Add a Resend-Notification Button

## Overview

Two related changes to `/stackshift-orders` (the StackShift Order Form review
queue, task 347):

1. **Exclude PMs.** The Orders tab/page/API is currently reachable by
   `admin`, `super_admin`, and `pm`. Remove `pm` from every one of those
   gates so only `admin`/`super_admin` can see the sidebar link, load the
   list/detail pages, or call the review/mutate APIs. This follows directly
   from task 374 (removing PMs from the *email* recipients) — this task
   removes PMs from the *in-app* review surface too, so the two stay
   consistent (a PM can currently open `/stackshift-orders` even without
   getting the email).
2. **Add a resend button.** On the order detail page, add a "Resend
   notification" action that re-sends the same staff notification email
   (`sendStackShiftOrderNotification`) for that order, to the current
   recipient list (`getOrderNotificationRecipients()` — already PM-free per
   task 374). Useful when the original send failed silently, a recipient was
   added after the fact, or a reviewer wants to loop someone back in.

## Requirements

- Sidebar "Orders" nav link — hidden for `pm` (still shown for
  `admin`/`super_admin`).
- `/stackshift-orders` and `/stackshift-orders/[orderId]` pages — redirect
  `pm` to the dashboard, same as any other disallowed role.
- `requireOrderReviewer()` / `requireOrderMutator()` (`src/app/api/stackshift-orders/_auth.ts`)
  — `403` for `pm`. This covers every API route under `/api/stackshift-orders/**`
  (list-adjacent reads happen via the page's own RLS-scoped query, not this
  helper — see RLS note below).
- RLS `stackshift_orders_staff_read` policy — drop `pm` from the allowed
  roles, so a PM can't read the table directly even via a raw Supabase
  client call, matching the page/API gates.
- New `POST /api/stackshift-orders/[orderId]/resend` route: re-sends the
  notification email for that order to the *current* recipient list, and
  updates `notification_sent_at` to now on success. Gated by
  `requireOrderMutator()` — same as Convert/Dismiss/Reopen (Finance dept
  stays read-only, consistent with those actions).
- New "Resend notification" button on the order detail page
  (`order-review.tsx`), visible whenever the existing action buttons are
  (i.e. `!readOnly`), for any order status. Shows a sending state, and a
  toast on success/failure (matching this codebase's toast convention — see
  CLAUDE.md's UI Polish Conventions). Display the last-sent timestamp
  (`order.notification_sent_at`, already selected via the page's `select("*")`)
  next to the button when present.

## Out of Scope / Must Not Change

- Do not touch `getOrderNotificationRecipients()` again — task 374 already
  removed PMs from the email list; this task is about the *in-app* Orders
  surface plus the resend action, not the recipient logic itself.
- Do not change Convert / Dismiss / Reopen behavior or their routes.
- Do not change the Finance department's existing read-only restriction
  (`requireOrderMutator`'s department check) — the resend button must be
  gated the same way as those existing mutating actions.
- Do not change `DEPARTMENT_ROLES` / `DEPARTMENT_NAV_RESTRICTION` in
  `department-map.ts` — that's an orthogonal, unrelated axis and doesn't
  currently grant PMs anything beyond ordinary role-based access here
  (`"Project Management"` department has no entry in
  `DEPARTMENT_NAV_RESTRICTION`, so it was always falling back to role-based
  access — which this task is changing anyway).
- Do not add a per-row resend action to the orders *list* table
  (`orders-table.tsx`) — each row is currently a single `<button>` (nested
  buttons aren't valid), and the detail page is this codebase's established
  place for order actions (Convert/Dismiss/Reopen all live there, not on the
  list). Resend goes on the detail page only.
- Migration for the RLS policy change: **write it, don't apply it** —
  matches this table's established convention (migrations 130/134/135/136
  are all "written, not applied" per `CLAUDE.md`). Don't run `supabase
  migration up` / apply against the live DB.
- No changes to `_secret.ts`, the inbound webhook route, or the email
  template itself (`stackshift-order-notification.ts`) — resend reuses both
  unchanged.

## Proposed File Changes

- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — line ~88: change the
  "Orders" nav item's gate from `isAdmin || role === "pm"` to `isAdmin`.
  Update the adjacent comment. **Leave the "Orchestration" item below it
  (line ~93) untouched** — same `isAdmin || role === "pm"` pattern, but
  out of scope here.
- `src/app/api/stackshift-orders/_auth.ts` — `REVIEWER_ROLES`: drop `"pm"`,
  leaving `["admin", "super_admin"]`. Update the file's top comment.
- `src/app/(hub)/stackshift-orders/page.tsx` — line ~24: drop the
  `role !== "pm"` clause from the redirect condition, leaving
  `role !== "admin" && role !== "super_admin"`.
- `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` — line ~29: same
  redirect-condition change as above.
- `supabase/migrations/140_stackshift_orders_exclude_pm.sql` (new) — drop +
  recreate `stackshift_orders_staff_read` to remove `'pm'` from the allowed
  roles list (keep `'marketing'` — untouched, out of scope). Written, not
  applied, per this table's established convention.
- `src/app/api/stackshift-orders/[orderId]/resend/route.ts` (new) — `POST`
  handler: `requireOrderMutator()` guard → fetch the order row → rebuild
  `OrderNotificationData` from the row's own columns → call
  `getOrderNotificationRecipients()` + `sendStackShiftOrderNotification()` →
  on success, update `notification_sent_at` → return
  `{ ok: true, notificationSentAt, recipientCount }`. Unlike the original
  webhook send (best-effort, never fails the request), this route **should**
  return an error status on send failure — the whole point of a manual
  resend button is telling the reviewer whether it worked.
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` —
  add `resending` state + a `resendNotification()` handler (fetch the new
  route, `toast.success`/`toast.error` from `sonner`, `router.refresh()` on
  success), and render a "Resend notification" button + last-sent caption in
  the header's right-side column (next to `StatusPill`/`ContactRiskPill`),
  gated by `!readOnly`.

No changes needed to `orders-table.tsx`, `_convert-panel.tsx`,
`_order-ui.tsx`, `create-from-order.ts`, `recipients.ts`, or
`stackshift-order-notification.ts`.

## Code Context

`src/app/(hub)/_components/v2-hub-sidebar.tsx:86-90` (current):

```tsx
// StackShift Orders review queue (task 347) — matches the page + API guards: admin /
// super_admin / pm only.
...((isAdmin || role === "pm") ? [
  { label: "Orders", icon: <ClipboardList size={18} />,          href: V2_ROUTES.STACKSHIFT_ORDERS },
] : []),
```

`src/app/api/stackshift-orders/_auth.ts:5,19` (current):

```ts
const REVIEWER_ROLES = ["admin", "super_admin", "pm"];
...
  if (!REVIEWER_ROLES.includes(profile?.role ?? "")) {
```

`src/app/(hub)/stackshift-orders/page.tsx:24` and
`src/app/(hub)/stackshift-orders/[orderId]/page.tsx:29` (current, identical
condition in both):

```ts
if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);
```

`supabase/migrations/130_stackshift_orders.sql:69-74` (current RLS policy):

```sql
create policy "stackshift_orders_staff_read"
  on stackshift_orders for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'marketing'));
```

`src/lib/email/stackshift-order-notification.ts` — `OrderNotificationData`
shape the resend route must rebuild from the DB row:

```ts
export type OrderNotificationData = {
  orderId: string;
  companyName: string;
  contactName: string | null;
  businessEmail: string | null;
  mobilePhone: string | null;
  website: string | null;
  services: string[];
  mappedClassifications: string[];
  approvedBy: string | null;
  submittedAt: string | null;
  proposalFilename: string | null;
  flowforgeSpecFilename: string | null;
  needsReview: boolean;
};
export async function sendStackShiftOrderNotification(to: string[], data: OrderNotificationData): Promise<void>
```

Every field maps 1:1 to a `stackshift_orders` column (`company_name` →
`companyName`, etc.) except `needsReview`, which is derived the same way the
inbound webhook derives it —
`mapServicesToClassifications(order.services).validCombo` (from
`src/lib/stackshift-orders/service-map.ts`), i.e. `needsReview = !mapped.validCombo`.

`src/app/api/stackshift-orders/[orderId]/route.ts` (existing PATCH route) —
the pattern to mirror for the new resend route: `requireOrderMutator()` →
`await params` → `adminClient` lookup → `404` if missing → mutate → `200`
with `{ ok: true, ... }`.

`src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx:41-54`
— the existing `reopen()` handler, the pattern to mirror for
`resendNotification()`:

```tsx
async function reopen() {
  setReopening(true);
  try {
    const res = await fetch(`/api/stackshift-orders/${order.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reopen" }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Reopen failed");
    router.refresh();
  } catch {
    setReopening(false);
  }
}
```

Header layout to add the button into (`order-review.tsx:65-76`):

```tsx
<div className="flex items-start justify-between gap-4 mb-5">
  <div>
    <h1 ...>{order.company_name}</h1>
    <p ...>Submitted {formatDate(order.submitted_at ?? order.created_at)}</p>
  </div>
  <div className="flex flex-col items-end gap-1.5">
    <StatusPill status={order.status} />
    <ContactRiskPill risk={order.contact_risk} />
  </div>
</div>
```

Toast convention (e.g. `src/app/(hub)/projects/_shared/_use-customer-assets.ts`):

```ts
import { toast } from "sonner";
...
toast.error("Couldn't delete file — try again");
```

## Implementation Steps

1. `v2-hub-sidebar.tsx`: change the Orders nav gate to `isAdmin` only;
   update its comment to say admin/super_admin only (task 375).
2. `_auth.ts`: `REVIEWER_ROLES = ["admin", "super_admin"]`; update the
   top comment.
3. Both `stackshift-orders/page.tsx` and `stackshift-orders/[orderId]/page.tsx`:
   drop the `role !== "pm"` clause from the redirect condition.
4. Write `supabase/migrations/140_stackshift_orders_exclude_pm.sql` — `drop
   policy if exists "stackshift_orders_staff_read" on stackshift_orders;`
   then recreate it with `('admin', 'super_admin', 'marketing')`. Do not
   apply it.
5. Create `src/app/api/stackshift-orders/[orderId]/resend/route.ts` per the
   Code Context pattern above. Log failures with the same
   `[stackshift-order]` console prefix this codebase uses throughout.
6. In `order-review.tsx`: import `Mail` from `lucide-react` and `toast` from
   `"sonner"`; add `resending` state; add `resendNotification()`; render the
   button (disabled while `resending`, label toggles to "Sending…") plus a
   "Last sent {formatDate(...)}" caption when `order.notification_sent_at`
   is set, both inside the header's right-side column, gated by `!readOnly`.

## Acceptance Criteria

- A `pm`-role user: no "Orders" link in the sidebar; hitting
  `/stackshift-orders` or `/stackshift-orders/[orderId]` directly redirects
  to the dashboard; every `/api/stackshift-orders/**` route returns `403`
  for them; a direct Supabase client `select` against `stackshift_orders`
  as that user returns no rows once migration 140 is applied (not required
  for this task's completion, since the migration isn't applied yet — but
  the policy SQL itself must be correct).
- `admin`/`super_admin` behavior on `/stackshift-orders` is unchanged.
- Finance-department users still see the read-only order detail page with
  no resend button (mirrors the existing Convert/Dismiss/Reopen gating).
- Clicking "Resend notification" on an order (as `admin`/`super_admin`,
  non-Finance) sends the same-shaped email as the original webhook send, to
  the current `getOrderNotificationRecipients()` list, updates
  `notification_sent_at`, and shows a success toast; a send failure shows an
  error toast and does not update `notification_sent_at`.

## Verification

- `npx tsc --noEmit` — must pass with no new errors.
- `pnpm lint` — must pass with no new warnings.
- Manual read-through confirming no remaining `"pm"` reference in
  `_auth.ts`'s `REVIEWER_ROLES`, either `stackshift-orders` page's redirect
  condition, or the sidebar's Orders gate.
- Manual read-through of the new migration SQL against migration 130's
  original policy to confirm only `'pm'` was dropped.
- Live click-through NOT required to close this task (no test harness for
  outbound email exists — same caveat task 374 documented), but flag it for
  the `test` stage same as task 374 did.

## Compatibility Touchpoints

- New migration `140_stackshift_orders_exclude_pm.sql` — written, not
  applied (per table convention). Must be applied together with (i.e. after)
  migration 130 and its Orders-table successors whenever those are finally
  applied.
- No env var, dependency, or route-signature changes to existing routes —
  only a new route added.

## Implementation Notes

### What Changed
- Removed `pm` from every Orders-tab access gate: the sidebar "Orders" link, both page redirects, and `requireOrderReviewer()`'s `REVIEWER_ROLES` (which also governs `requireOrderMutator()`).
- Wrote (not applied) migration 140 dropping `pm` from the `stackshift_orders_staff_read` RLS policy, keeping `marketing` untouched.
- Added `POST /api/stackshift-orders/[orderId]/resend` — rebuilds `OrderNotificationData` from the stored order row (recomputing `needsReview` via `mapServicesToClassifications(order.services).validCombo`, same as the original webhook), resends via the existing `getOrderNotificationRecipients()` + `sendStackShiftOrderNotification()`, and updates `notification_sent_at` on success. Returns an error status on send failure (deliberately not best-effort, unlike the original webhook send).
- Added a "Resend notification" button + last-sent caption to `order-review.tsx`'s header, gated by `!readOnly` (same as the existing Reopen action), with a sending state and `sonner` toast feedback.

### Files Changed
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` - Orders nav gate: `isAdmin || role === "pm"` → `isAdmin`. Orchestration's identical-looking gate one block below was left untouched (out of scope).
- `src/app/api/stackshift-orders/_auth.ts` - `REVIEWER_ROLES` dropped `"pm"`; updated comment.
- `src/app/(hub)/stackshift-orders/page.tsx` - redirect condition dropped `role !== "pm"`.
- `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` - same redirect-condition change.
- `supabase/migrations/140_stackshift_orders_exclude_pm.sql` (new) - drop + recreate `stackshift_orders_staff_read` without `pm`.
- `src/app/api/stackshift-orders/[orderId]/resend/route.ts` (new) - resend endpoint.
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` - `resending` state, `resendNotification()` handler, button + last-sent caption in the header; added `toast` (sonner) and `Mail` (lucide-react) imports.

### Deviations From Plan
- None. All six planned file changes landed as specified; no scope changes.

### Verification Run
- `npx tsc --noEmit` - PASS (no output/errors)
- `pnpm lint` - PASS (2 pre-existing, unrelated warnings in `_checklist-tab.tsx`)
- Manual grep confirming no remaining `"pm"` in `_auth.ts`, either page's redirect condition, or the Orders sidebar gate - PASS
- Manual diff of migration 140's policy against migration 130's original - PASS (only `pm` removed, `marketing` untouched)
- Live click-through (PM redirect, admin resend button, Finance read-only) - SKIPPED (no test harness for outbound email or a live multi-role session in this environment — flagged for the `test` stage, same as task 374)
- impeccable design-hook findings on every touched file - reviewed inline after each edit; all were pre-existing hex-color/arbitrary-font-size literals elsewhere in the same files (or new lines using the exact same established `text-[Npx]` convention already used throughout `order-review.tsx`/`_order-ui.tsx`), consistent with `CLAUDE.md`'s documented UI Polish Conventions (literal paired colors over design tokens in this codebase) — none required a change

## Quality Gate Notes

### Result
PASS

### Standards Review
- All 7 changed files read in full. Every role-gate change (`_auth.ts`, both page redirects, the sidebar Orders item) uses the exact pre-existing pattern with only the `pm` branch removed — no new abstractions, no unrelated refactoring.
- New route (`resend/route.ts`) mirrors the established sibling-route shape (`[orderId]/route.ts` PATCH, `convert/route.ts`): `requireOrderMutator()` guard → `await params` → `adminClient` lookup → `404` → mutate → typed JSON response. Error logging uses the same `[stackshift-order]` console prefix used everywhere else in this feature.
- New migration (140) follows the established one-migration-per-incremental-change convention for this table (130/134/135/136), correctly left `marketing` untouched, and is written-not-applied per that same convention — confirmed via diff against 130's original policy (only `pm` removed).
- UI addition (`resendNotification()` + button) mirrors the adjacent `reopen()` handler's shape (state, fetch, error handling) and the codebase's `sonner` toast convention (`_use-customer-assets.ts`); gated by the same `!readOnly` check already used for Reopen.
- No unused imports/code, no `any`, no deep nesting, no secrets/debug logging. `_req: NextRequest` in the resend route is intentionally unused (route needs no body) — underscore-prefixed per this codebase's lint config, confirmed clean by `pnpm lint`.
- No blocking issues.

### Deviations
- **Minor**: `resend/route.ts` rebuilds `OrderNotificationData` with a field-by-field mapping that structurally parallels (but doesn't literally duplicate) the mapping already in the webhook route (`api/webhooks/stackshift-order/route.ts`) — the webhook maps from the raw intake payload (`p.company.name`, etc.) while resend maps from the stored DB row (`order.company_name`, etc.), so the two aren't extractable into one trivial shared function without added complexity. Left as-is per the task doc's explicit design and this codebase's stated preference against premature abstraction for ~13 lines of straightforward mapping used by exactly one row-based call site.
- No Medium or Major deviations. Implementation matches the task document's requirements, file list, and out-of-scope boundaries exactly (Orchestration's identical-looking sidebar gate, `recipients.ts`, Convert/Dismiss/Reopen routes, Finance-department logic, and `orders-table.tsx` all confirmed untouched).

### Required Fixes
- None.
