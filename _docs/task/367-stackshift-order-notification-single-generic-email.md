# 367: StackShift Order Notification — Single Generic Staff Email, Drop Customer Confirmation

**Created:** 2026-09-15
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

COO request: simplify the StackShift Order Form notification flow (task 347/354) to a single internal email instead of two.

Today, `POST /api/webhooks/stackshift-order` sends **two** emails on every submission:
1. A staff notification (`sendStackShiftOrderNotification`) to `getOrderNotificationRecipients()` — `STACKSHIFT_ORDER_NOTIFY_EMAILS` **∪ every PM** (resolved from `auth.users` ∩ `profiles.role='pm'`).
2. A "We've received your order" thank-you confirmation (`sendStackShiftOrderCustomerConfirmation`, task 354) to the **submitter** (`contact.email`/`billing_email`).

The submitters are internal WebriQ staff (Alex/Bert) filling out the order form on behalf of the company, not external customers — so the thank-you email is unnecessary and confusing ("no need to thank them for their submission since we're all on the same team"). The COO wants exactly **one** generic email sent to `getOrderNotificationRecipients()`'s existing list — `STACKSHIFT_ORDER_NOTIFY_EMAILS` **plus every PM, unchanged** (the COO will manage the fixed part of that list directly), with:
- A generic heading: **"A New Order Form Has Been Submitted"**
- A summary of the submitted order
- A link to the order's review page in the Hub

The existing staff notification (`src/lib/email/stackshift-order-notification.ts`) already has a summary table + review link + the right recipient list — it just needs its heading/subject genericized. The customer confirmation email (task 354) is removed entirely, along with its now-permanently-dead "Customer emailed" / "Confirmation sent" UI badges. `getOrderNotificationRecipients()` (`src/lib/stackshift-orders/recipients.ts`) is **not** touched — PM auto-include stays as-is (confirmed: keep PMs in the list).

## Requirements

- [ ] `POST /api/webhooks/stackshift-order` sends exactly one email per submission — the staff notification. The customer/submitter confirmation email is no longer sent.
- [ ] Recipients stay as they are today: `STACKSHIFT_ORDER_NOTIFY_EMAILS` ∪ every PM (`getOrderNotificationRecipients()` unchanged).
- [ ] The staff notification's subject and heading read **"A New Order Form Has Been Submitted"** (generic, not addressed to any one person, no thank-you copy) instead of "New StackShift order — {company}".
- [ ] The staff notification still includes the order summary table and a link to that order's `/stackshift-orders/[orderId]` review page in the Hub (already present — preserve as-is).
- [ ] `src/lib/email/stackshift-order-customer-confirmation.ts` is deleted; its import and call site in the webhook route are removed.
- [ ] Dead UI that depended on the now-never-populated `customer_notification_sent_at` ("Customer emailed {date}" on the review page, "Confirmation sent" badge in the orders table) is removed.
- [ ] `env.example`'s `STACKSHIFT_ORDER_REPLY_TO` var (only ever consumed by the deleted confirmation email) is removed.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Out of Scope / Must-Not-Change

- Do **not** change `getOrderNotificationRecipients()` / `src/lib/stackshift-orders/recipients.ts` — PMs stay auto-included alongside `STACKSHIFT_ORDER_NOTIFY_EMAILS`. (Reverted from an earlier draft of this task that proposed dropping PM auto-include — user confirmed: still include the PMs.)
- Do **not** touch `stackshift_orders.customer_notification_sent_at` at the DB/migration level — leave the column as-is (harmless, unused going forward). No new migration.
- Do **not** change `contact_risk` handling elsewhere (the `/stackshift-orders` list pill, the review-page banner) — only the customer-confirmation skip branch tied to `contactRisk === "high"` goes away, because the whole customer-confirmation call is removed.
- Do **not** change the `/stackshift-orders` review/convert flow, `orderIntakeSchema`, upload verification, or `dedupe_key`/idempotency logic.
- CLAUDE.md's task-347/354 documentation block is now stale (describes two emails) — flag for the `document` skill/stage; do not hand-edit it as part of this task's implementation unless the `document` stage is explicitly invoked afterward.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/webhooks/stackshift-order/route.ts` | Modify | Remove the customer-confirmation try/catch block, its import, and the now-unused `dedupeEmails()` helper |
| `src/lib/email/stackshift-order-customer-confirmation.ts` | Delete | Task 354 feature reverted — no longer sent |
| `src/lib/email/stackshift-order-notification.ts` | Modify | Genericize subject + heading text; keep summary table + review link unchanged |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` | Modify | Remove the "Customer emailed {date}" paragraph (dead — never fires again) |
| `src/app/(hub)/stackshift-orders/_components/orders-table.tsx` | Modify | Remove the "Confirmation sent" badge, its `customer_notification_sent_at` type field, and the now-unused `Check` icon import |
| `src/app/(hub)/stackshift-orders/page.tsx` | Modify | Drop `customer_notification_sent_at` from the `.select()` column list (no longer read) |
| `env.example` | Modify | Remove `STACKSHIFT_ORDER_REPLY_TO` |

Note: `src/lib/stackshift-orders/recipients.ts` is **not** in this list — recipients stay unchanged (`STACKSHIFT_ORDER_NOTIFY_EMAILS` ∪ PMs).

## Code Context

### File: `src/app/api/webhooks/stackshift-order/route.ts`

Remove the import on line 10 and the whole block at lines 144-168 (the `// Task 354 — customer confirmation email...` try/catch), plus the `dedupeEmails()` helper at the bottom (lines 183-192) since it has no other caller. The staff-notification try/catch above it (lines 118-142) stays untouched.

```ts
// REMOVE this import:
import { sendStackShiftOrderCustomerConfirmation } from "@/lib/email/stackshift-order-customer-confirmation";

// REMOVE this entire block (task 354):
try {
  if (p.contactRisk === "high") { ... }
  else {
    const recipients = dedupeEmails([p.contact.email, p.contact.billingEmail]);
    await sendStackShiftOrderCustomerConfirmation({ ... });
    // stamp customer_notification_sent_at ...
  }
} catch (err) { ... }

// REMOVE (now-unused, only referenced by the block above):
function dedupeEmails(values: (string | null | undefined)[]): string[] { ... }
```

### File: `src/lib/email/stackshift-order-notification.ts`

Current subject/heading (lines 55, 75-76):

```ts
const subject = `${data.needsReview ? "[Needs review] " : ""}New StackShift order — ${data.companyName}`;
// ...
`<p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">New StackShift order — ${esc(data.companyName)}</p>`,
`<p style="margin:6px 0 0;font-size:13px;color:#64748b;">Waiting in the Hub review queue.</p>`,
```

And the plain-text opener (line 58):

```ts
`A new StackShift Order Form submission is waiting in the Hub review queue.`,
```

Update the heading/subject copy to lead with **"A New Order Form Has Been Submitted"** (keep the `[Needs review]` prefix and the multi-tier warning line — those are unrelated internal flags, not addressed to the submitter). The company name can still appear in the body/summary table (`Company` row already lists it) and as a subtitle line under the heading — just not as the lead phrase. Everything else in this file (the `rows` summary table, `reviewUrl()`, the CTA button, `transporter.sendMail`) stays as-is.

### File: `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` (lines 68-74)

```tsx
{order.customer_notification_sent_at && (
  <p className="text-[12px] text-[#1E7C4B] mt-0.5">
    Customer emailed {formatDate(order.customer_notification_sent_at)}
  </p>
)}
```

Remove this block. `formatDate` is still used elsewhere on the page (`Submitted {formatDate(...)}`) — keep that import.

### File: `src/app/(hub)/stackshift-orders/_components/orders-table.tsx` (line 26, 208-213)

```tsx
customer_notification_sent_at: string | null;
// ...
{o.customer_notification_sent_at && (
  <div className="flex items-center gap-1 text-[10.5px] text-[#1E7C4B] mt-0.5">
    <Check size={10} /> Confirmation sent
  </div>
)}
```

Remove the type field and the JSX block. Drop `Check` from the icon import on line 5 (verify no other usage in the file first — currently only referenced at line 211).

### File: `src/app/(hub)/stackshift-orders/page.tsx` (line 39)

```ts
.select(
  "id, status, company_name, contact_name, business_email, services, mapped_classifications, created_at, submitted_at, customer_id, project_id, contact_risk, customer_notification_sent_at",
  { count: "exact" }
)
```

Drop `customer_notification_sent_at` from the column list.

### File: `env.example` (lines 128-135)

```
STACKSHIFT_ORDER_WEBHOOK_SECRET=
# Comma-separated fixed recipients notified on every submission, on top of every PM's email
# (resolved from auth.users ∩ profiles.role='pm'). e.g. philippe@webriq.com,danielle@webriq.com
STACKSHIFT_ORDER_NOTIFY_EMAILS=
# Task 354 — Reply-To on the confirmation email sent to the form submitter. A monitored
# inbox they can reply to with questions. Optional: absent → falls back to the first
# STACKSHIFT_ORDER_NOTIFY_EMAILS entry, then to no Reply-To (email still sends from MAIL_FROM).
STACKSHIFT_ORDER_REPLY_TO=
```

Remove only the `STACKSHIFT_ORDER_REPLY_TO` var + its comment. Leave `STACKSHIFT_ORDER_NOTIFY_EMAILS` and its comment exactly as-is — the "on top of every PM's email" behavior is unchanged.

## Implementation Steps

1. Delete `src/lib/email/stackshift-order-customer-confirmation.ts`.
2. In `src/app/api/webhooks/stackshift-order/route.ts`: remove the `sendStackShiftOrderCustomerConfirmation` import, the task-354 try/catch block, and the now-orphaned `dedupeEmails()` helper.
3. In `src/lib/email/stackshift-order-notification.ts`: update the subject string and the HTML/text heading copy to lead with "A New Order Form Has Been Submitted"; leave the summary table, review link, and `[Needs review]`/multi-tier warning logic untouched.
4. Remove the "Customer emailed {date}" block from `order-review.tsx` and the "Confirmation sent" badge + `customer_notification_sent_at` type field + unused `Check` import from `orders-table.tsx`.
5. Drop `customer_notification_sent_at` from the `.select()` call in `page.tsx`.
6. Update `env.example`: remove `STACKSHIFT_ORDER_REPLY_TO` and its comment; leave `STACKSHIFT_ORDER_NOTIFY_EMAILS` untouched.
7. Run `npx tsc --noEmit` and `pnpm lint`; fix any fallout from removed imports/types.
8. Grep the repo for any remaining references to `sendStackShiftOrderCustomerConfirmation`, `customer_notification_sent_at`, or `STACKSHIFT_ORDER_REPLY_TO` to confirm nothing was missed. Confirm `src/lib/stackshift-orders/recipients.ts` was left untouched.

## Acceptance Criteria

- [ ] A StackShift order submission triggers exactly one outbound email (the staff notification) — no customer/submitter confirmation email is sent.
- [ ] The staff notification's subject and visible heading read "A New Order Form Has Been Submitted" (with `[Needs review] ` prefix preserved when applicable).
- [ ] The staff notification still contains the order summary details and a working link to `/stackshift-orders/[orderId]`.
- [ ] `getOrderNotificationRecipients()` is unchanged and still resolves `STACKSHIFT_ORDER_NOTIFY_EMAILS` ∪ every PM.
- [ ] `src/lib/email/stackshift-order-customer-confirmation.ts` no longer exists and nothing imports it.
- [ ] The "Customer emailed" and "Confirmation sent" UI elements no longer appear anywhere in `/stackshift-orders`.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass clean (no new warnings beyond pre-existing ones).

## Verification

```bash
npx tsc --noEmit
pnpm lint
grep -rn "sendStackShiftOrderCustomerConfirmation\|customer_notification_sent_at\|STACKSHIFT_ORDER_REPLY_TO" src env.example
```

No live email send is required for verification — inspect the generated `subject`/`text`/`html` strings via a quick scratch script or manual read-through, since this repo has no test runner. Browser acceptance (viewing `/stackshift-orders` and an order detail page to confirm the removed badges are gone) is recommended before shipping, per the codebase's usual "Browser acceptance NOT RUN" caveat pattern if the Chrome tool isn't available in the implementing session.

## Compatibility Touchpoints

- Recipients are unchanged: `STACKSHIFT_ORDER_NOTIFY_EMAILS` ∪ every PM — the COO manages the fixed-list part of that directly (Vercel env), no code change needed for that.
- `STACKSHIFT_ORDER_REPLY_TO` is removed from `env.example`; if it's set in any deployed environment it becomes a harmless unused var (safe to leave or remove there too, at the user's discretion).
- No DB migration required. No new dependencies.
- CLAUDE.md's task-347/354 documentation block will read as stale after this ships (describes the customer confirmation email that no longer exists) — leave for the `document` skill stage.

## Implementation Notes

### What Changed
- Removed the task-354 customer/submitter confirmation email path entirely — only the internal staff notification email fires on a StackShift order submission now.
- Genericized the staff notification's subject and heading to "A New Order Form Has Been Submitted" (company name moved to a subtitle line + the existing summary table, not the lead heading); kept the `[Needs review]` subject prefix and multi-tier warning banner as-is.
- Removed the now-permanently-dead "Customer emailed" (review page) and "Confirmation sent" (orders table) UI, and the `customer_notification_sent_at` field from the orders-table type and the `/stackshift-orders` list query's `.select()`.
- Removed `STACKSHIFT_ORDER_REPLY_TO` from `env.example` (its only consumer was the deleted confirmation email).
- Left `src/lib/stackshift-orders/recipients.ts` (`getOrderNotificationRecipients()`) untouched, per the user's explicit correction mid-planning — recipients remain `STACKSHIFT_ORDER_NOTIFY_EMAILS` ∪ every PM.

### Files Changed
- `src/app/api/webhooks/stackshift-order/route.ts` — removed the `sendStackShiftOrderCustomerConfirmation` import, the task-354 try/catch block, and the now-orphaned `dedupeEmails()` helper.
- `src/lib/email/stackshift-order-customer-confirmation.ts` — deleted.
- `src/lib/email/stackshift-order-notification.ts` — subject + text/HTML heading copy updated to the generic phrase; summary table, review link, and needsReview logic untouched.
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` — removed the "Customer emailed {date}" paragraph.
- `src/app/(hub)/stackshift-orders/_components/orders-table.tsx` — removed the "Confirmation sent" badge, the `customer_notification_sent_at` type field, and the now-unused `Check` icon import.
- `src/app/(hub)/stackshift-orders/page.tsx` — dropped `customer_notification_sent_at` from the `.select()` column list.
- `env.example` — removed `STACKSHIFT_ORDER_REPLY_TO` and its comment.

### Deviations From Plan
- None. Implemented exactly per the approved task document, including the mid-planning correction to leave `recipients.ts`/PM auto-include untouched.

### Verification Run
- `npx tsc --noEmit` - PASS (no output)
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, not touched by this task)
- `grep -rn "sendStackShiftOrderCustomerConfirmation\|customer_notification_sent_at\|STACKSHIFT_ORDER_REPLY_TO" src env.example` - PASS (only remaining hits are the generated `customer_notification_sent_at` column type in `src/types/database.ts`, expected per Out of Scope — the DB column itself is intentionally left alone)
- Browser acceptance (viewing `/stackshift-orders` + an order detail page, confirming badges are gone) - SKIPPED (Chrome browser tool not exercised this session; recommended before shipping, per the task's own Verification note)
- Live email send / generated email content review - SKIPPED (no test runner in this repo; verified by reading the generated `subject`/`text`/`html` strings directly instead of sending)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation left behind — the `dedupeEmails()` helper, the `Check` icon import, and the `customer_notification_sent_at` type field were all removed alongside their only call sites (confirmed via `git diff`, no orphaned references outside `src/types/database.ts`'s generated schema, which is intentionally out of scope).
- No new `any`/untyped escape hatches introduced.
- No deep nesting introduced; the removed blocks were replaced with nothing, not a stub.
- Error handling for the remaining staff notification (`try/catch`, best-effort, doesn't fail the request) is unchanged from before — still intentional.
- No secrets, credentials, or debug logging added.
- File-scoped: only files listed in the task's `Proposed File Changes` / `Implementation Notes` were touched. `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` shows in `git diff --name-only` but that change (a `readOnly`/department lookup) predates this session and belongs to task 366, not 367 — confirmed untouched by this implementation.
- `src/lib/stackshift-orders/recipients.ts` confirmed still has zero diff (`git diff --stat` empty), matching the task's explicit Out-of-Scope boundary.

### Deviations
- Minor: the staff notification's subject line reads `A New Order Form Has Been Submitted — {companyName}` rather than the bare generic phrase. This was flagged and pre-approved in the task document's own Code Context ("Update the heading/subject copy to lead with... The company name can still appear... as a subtitle line") — the subject leads with the required generic phrase and appends the company name for inbox scannability, consistent with the documented design call. Not a deviation from the approved plan.

### Required Fixes
- None.
