# 354: StackShift Order Form — Customer Confirmation Email

**Created:** 2026-09-10
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Today a StackShift Order Form submission (task 347) notifies **staff only** — a fixed
recipient list plus every PM — via `sendStackShiftOrderNotification()` fired from
`POST /api/webhooks/stackshift-order`. The customer who filled out the form gets nothing
from the Hub; they only see whatever on-page success state webriq.com renders.

This task adds a **transactional confirmation email to the submitter** — a receipt that
the order was received, a summary of what they selected, and what happens next. It is sent
from the **Hub**, after the `stackshift_orders` row is successfully inserted, so the
customer is only ever told "we got it" for an order that actually landed in the review
queue (the webhook can still reject on file verification or a bad payload).

webriq.com keeps its immediate on-page success state — that is out of scope here and
already its responsibility. This task is only the durable email receipt.

## Requirements

- [ ] New email module `src/lib/email/stackshift-order-customer-confirmation.ts` exporting
      `sendStackShiftOrderCustomerConfirmation(order)` — plain-text + light HTML, Arial
      only (matches `stackshift-order-notification.ts` conventions).
- [ ] Email content: receipt confirmation, company name, the StackShift tier / services
      selected, proposal filename (and FlowForge spec filename if present), a
      "what happens next" paragraph with a rough timeline, and a real reply-to address for
      questions. **No** `/stackshift-orders/[orderId]` link — that is internal.
- [ ] Sent to `contact.email`. If `billing_email` is present and differs from
      `contact.email` (case-insensitive), add it as a second `to` recipient.
- [ ] Fired from the webhook handler **after** the successful `.insert()`, in its **own**
      `try/catch` — independent of the staff-notification block. A failure in either must
      not suppress the other, and neither fails the webhook response.
- [ ] Skip the send (and log a line) when `contact_risk === "high"`. Per the schema a
      `"high"` submission should have been blocked upstream, but guard anyway.
- [ ] New column `stackshift_orders.customer_notification_sent_at timestamptz` — stamped
      on a successful send. Migration **written, not applied** by the agent (StackShift
      migration convention — tasks 130 / 133 / 134). Until it lands the stamp `update` is a
      wrapped no-op that logs; the email still sends.
- [ ] Optional `STACKSHIFT_ORDER_REPLY_TO` env var — a monitored inbox set as the email's
      `replyTo`. Absent → fall back to the first entry in `STACKSHIFT_ORDER_NOTIFY_EMAILS`,
      and if that is also empty omit `replyTo` (the email still sends from `FROM`).
- [ ] Surface "Customer emailed {date}" on the review page header area
      (`order-review.tsx`) when `customer_notification_sent_at` is set; add the column to
      the list-page `select` and a small indicator in `orders-table.tsx` (parity with how
      staff-notification / contact-risk state is shown).
- [ ] `src/types/database.ts` — add `customer_notification_sent_at` to the
      `stackshift_orders` `Row` / `Insert` / `Update` shapes.
- [ ] `env.example` — document `STACKSHIFT_ORDER_REPLY_TO` under the task-347 block.
- [ ] `CLAUDE.md` — update the `stackshift_orders` bullet: the webhook now also sends a
      customer confirmation, `customer_notification_sent_at`, migration 135 written-not-applied.

## Out of Scope / Must-Not-Change

- **webriq.com** — no changes. Its on-page success state and any client-side behavior are
  its own concern. This task ships entirely in the Hub repo.
- **The staff notification** (`sendStackShiftOrderNotification` / `recipients.ts`) — do not
  change its recipients, template, or trigger. The new email is strictly additive.
- **Idempotency / dedupe** — do not touch the early-return dedupe path
  (`route.ts` ~L32–41). A proxy retry with the same `idempotencyKey` returns the existing
  row before either notification block runs, so the customer email already cannot
  double-send on retry. Leave it that way.
- **Conversion / dismiss flow** — no customer email on convert or dismiss. Only on intake.
- **`mailer.ts` transport** — reuse the exported `transporter` / `FROM` as-is. Do not add a
  second transport or a new provider.
- No unsubscribe/marketing-compliance plumbing — this is a transactional email the
  recipient initiated.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/email/stackshift-order-customer-confirmation.ts` | Create | `sendStackShiftOrderCustomerConfirmation()` — customer-facing receipt email |
| `src/app/api/webhooks/stackshift-order/route.ts` | Modify | Add a second, independent `try/catch` after insert that resolves recipients, sends the confirmation, stamps `customer_notification_sent_at` |
| `supabase/migrations/135_stackshift_orders_customer_notification.sql` | Create | `add column customer_notification_sent_at timestamptz` — written, NOT applied |
| `src/types/database.ts` | Modify | Add `customer_notification_sent_at` to `stackshift_orders` Row/Insert/Update |
| `src/app/(hub)/stackshift-orders/page.tsx` | Modify | Add `customer_notification_sent_at` to the list `select` |
| `src/app/(hub)/stackshift-orders/_components/orders-table.tsx` | Modify | Add field to the row type + a small "customer emailed" indicator |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` | Modify | Show "Customer emailed {date}" in the header block when set |
| `env.example` | Modify | Document `STACKSHIFT_ORDER_REPLY_TO` |
| `CLAUDE.md` | Modify | Update the `stackshift_orders` bullet |

## Code Context

### File: `src/app/api/webhooks/stackshift-order/route.ts`

The insert returns `order.id`. The existing staff-notification block is best-effort and
stamps `notification_sent_at`. The new block goes **right after** it, structured the same
way but fully independent.

```tsx
// ...after the successful insert + the task-353 contact_risk update...

// Staff notification — best-effort, never fails the request over email.
try {
  const recipients = await getOrderNotificationRecipients();
  await sendStackShiftOrderNotification(recipients, { /* ...existing... */ });
  await adminClient
    .from("stackshift_orders")
    .update({ notification_sent_at: new Date().toISOString() })
    .eq("id", order.id);
} catch (err) {
  console.error("[stackshift-order] notification email failed:", err);
}

// NEW — customer confirmation. Independent try/catch: a failure here must not
// affect the staff notification above, and vice versa.
try {
  if (p.contactRisk === "high") {
    console.warn("[stackshift-order] contact_risk=high — skipping customer confirmation email");
  } else {
    await sendStackShiftOrderCustomerConfirmation({
      to: dedupeEmails([p.contact.email, p.contact.billingEmail]),
      companyName: p.company.name,
      contactName: p.contact.name,
      services: p.services,
      proposalFilename: p.proposalFilename,
      flowforgeSpecFilename: p.flowforgeSpecFilename ?? null,
    });
    await adminClient
      .from("stackshift_orders")
      .update({ customer_notification_sent_at: new Date().toISOString() })
      .eq("id", order.id);
  }
} catch (err) {
  console.error("[stackshift-order] customer confirmation email failed:", err);
}
```

`dedupeEmails` = trim + lowercase + drop blanks/`""` + `Set`. `billingEmail` can be
`null | "" | string` (see schema below).

### File: `src/lib/stackshift-orders/schema.ts` (payload shape — do not change)

```ts
contact: z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().min(1).max(64),
  billingName: z.string().max(200).optional().nullable(),
  billingEmail: z.string().email().max(320).optional().nullable().or(z.literal("")),
}),
company: z.object({ name, website, address }),
services: z.array(z.string()).min(1).max(10),
proposalFilename: z.string().min(1).max(255),
flowforgeSpecFilename: z.string().min(1).max(255).optional().nullable(),
contactRisk: z.enum(["low", "medium", "high"]).optional().nullable(),
```

### File: `src/lib/email/stackshift-order-notification.ts` (sibling — mirror its style)

- `import { transporter, FROM } from "./mailer";`
- Header comment noting the task number and "Arial is the deliberate choice for
  transactional email".
- `esc()` helper for HTML entity escaping (copy it, or extract a shared one — a shared
  `escapeHtml` in a small `_email-html.ts` is acceptable if it stays minimal).
- Ends with `await transporter.sendMail({ from: FROM, to, subject, text, html, replyTo })`.
- Guard `if (to.length === 0) { console.warn(...); return; }`.

Draft copy for the new email (tune wording with the user at implementation time):

> **Subject:** We've received your StackShift order — {companyName}
>
> Hi {contactName},
>
> Thanks for your StackShift order. We've received it and it's now with our team.
>
> **What you ordered**
> - Services: {services joined}
> - Proposal: {proposalFilename}
> - FlowForge spec: {flowforgeSpecFilename or "not included"}
>
> **What happens next**
> A WebriQ project manager will review your order and reach out within 1–2 business
> days to confirm scope and kick off. If you have any questions in the meantime, just
> reply to this email.
>
> — The WebriQ team

### File: `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx`

Header block around L65–76 renders company name + "Submitted {date}" and a column of
pills (`StatusPill`, `ContactRiskPill`). Add a muted line — e.g. under the "Submitted"
`<p>` — like `Customer emailed {formatDate(order.customer_notification_sent_at)}` when set.
Follow the existing `text-[12px] text-[#5F6A88]` styling; use `formatDate` from
`@/lib/utils` (already imported).

### File: `src/app/(hub)/stackshift-orders/page.tsx`

L39 `select` string — append `, customer_notification_sent_at`.

### File: `src/types/database.ts` (L1067–1171, `stackshift_orders`)

Add `customer_notification_sent_at: string | null;` to `Row`, and
`customer_notification_sent_at?: string | null;` to `Insert` and `Update` — place it next
to the existing `notification_sent_at` line in each block.

### File: `supabase/migrations/134_stackshift_orders_contact_risk.sql` (style reference)

```sql
-- Migration 135: stackshift_orders.customer_notification_sent_at (task 354)
--
-- POST /api/webhooks/stackshift-order now also sends a confirmation email to the form
-- submitter (contact.email, + billing_email if different) after a successful insert.
-- This column is stamped when that send succeeds; null = not sent (send failed, was
-- skipped for contact_risk='high', or the row predates this migration).
--
-- **Written, not applied by the agent** (StackShift-migration convention, tasks 130/133/134).
-- Until it lands, the webhook's stamping update is a wrapped no-op that logs; the email
-- still sends.

alter table stackshift_orders
  add column customer_notification_sent_at timestamptz;
```

## Implementation Steps

1. Write `supabase/migrations/135_stackshift_orders_customer_notification.sql` (do not apply).
2. Add `customer_notification_sent_at` to the three `stackshift_orders` shapes in `src/types/database.ts`.
3. Create `src/lib/email/stackshift-order-customer-confirmation.ts`:
   `sendStackShiftOrderCustomerConfirmation({ to, companyName, contactName, services, proposalFilename, flowforgeSpecFilename })`
   — resolve `replyTo` from `STACKSHIFT_ORDER_REPLY_TO` → first `STACKSHIFT_ORDER_NOTIFY_EMAILS` entry → omit; build text + HTML; `transporter.sendMail`.
4. In `route.ts`: add the `dedupeEmails` helper and the independent `try/catch` block after
   the staff-notification block, including the `contact_risk === "high"` skip and the
   `customer_notification_sent_at` stamp (wrapped — tolerate the column not existing).
5. Wire the review UI: list-page `select`, `orders-table.tsx` row type + indicator,
   `order-review.tsx` header line.
6. Document `STACKSHIFT_ORDER_REPLY_TO` in `env.example` (task-347 block).
7. Update the `stackshift_orders` bullet in `CLAUDE.md`.
8. `npx tsc --noEmit` + `pnpm lint`.

## Acceptance Criteria

- [ ] A valid submission to `POST /api/webhooks/stackshift-order` results in **two** emails:
      the existing staff notification and a new confirmation to `contact.email`.
- [ ] The confirmation email contains company name, selected services, proposal filename,
      "what happens next" text, and a working `replyTo` — and contains **no**
      `/stackshift-orders/` URL.
- [ ] `billing_email`, when present and different from `contact.email`, receives the email
      too; when equal or blank, only one recipient.
- [ ] Forcing `sendStackShiftOrderCustomerConfirmation` to throw does **not** prevent the
      staff notification or its `notification_sent_at` stamp, and the webhook still returns
      `201`. The reverse also holds.
- [ ] `contactRisk: "high"` in the payload → no confirmation email, a `console.warn` line,
      webhook still `201`.
- [ ] After a successful send, `stackshift_orders.customer_notification_sent_at` is set and
      the review page shows "Customer emailed {date}".
- [ ] With migration 135 not yet applied, the send still happens and the webhook still
      succeeds (stamp update logs and is swallowed).
- [ ] A proxy retry with the same `idempotencyKey` does not send a second confirmation
      email (early dedupe return still precedes both notification blocks).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint

# Local intake exercise (needs STACKSHIFT_ORDER_WEBHOOK_SECRET + MAIL_* set,
# and a proposal object already uploaded via /uploads):
curl -sS -X POST http://localhost:3000/api/webhooks/stackshift-order \
  -H 'content-type: application/json' \
  -H "x-stackshift-webhook-secret: $STACKSHIFT_ORDER_WEBHOOK_SECRET" \
  -d @scratch/sample-order.json | jq

# Then confirm: staff email + a confirmation to the sample contact.email,
# and stackshift_orders.customer_notification_sent_at is populated.
```

Live end-to-end (real SMTP delivery, migration 135 applied, webriq.com proxy relaying)
is **not run by the agent** — same posture as task 347 / 353.

## Compatibility Touchpoints

- **Migration 135** — written, not applied. Must be applied on Supabase before the stamp
  and the review-UI indicator work; the email itself works without it.
- **env** — new optional `STACKSHIFT_ORDER_REPLY_TO`. No new required vars. If unset and
  `STACKSHIFT_ORDER_NOTIFY_EMAILS` is also empty, the email sends with no `replyTo`.
- **webriq.com** — unaffected. No contract change; the proxy payload is unchanged.
- **CLAUDE.md** — `stackshift_orders` bullet updated (customer confirmation + new column).
- **No new dependencies.** Reuses `nodemailer` via `mailer.ts`.

## Implementation Notes

### What Changed
- New `src/lib/email/stackshift-order-customer-confirmation.ts` —
  `sendStackShiftOrderCustomerConfirmation({ to, companyName, contactName, services, proposalFilename, flowforgeSpecFilename })`.
  Plain-text + light inline-styled HTML (Arial), mirrors `stackshift-order-notification.ts`.
  Internal `resolveReplyTo()`: `STACKSHIFT_ORDER_REPLY_TO` → first `STACKSHIFT_ORDER_NOTIFY_EMAILS`
  entry → `undefined` (spread out of `sendMail` opts when absent). Guards `to.length === 0`.
  No `/stackshift-orders/` link anywhere.
- `route.ts` — added a second, independent `try/catch` after the staff-notification block:
  skips on `p.contactRisk === "high"` (warn line); otherwise resolves recipients via new
  `dedupeEmails([p.contact.email, p.contact.billingEmail])` (trim/lowercase/`@`-filter/Set),
  sends, then stamps `customer_notification_sent_at` via a wrapped `update` that logs and
  continues if the column doesn't exist yet. The dedupe early-return (unchanged) still
  precedes both blocks, so a proxy retry can't double-send.
- `supabase/migrations/135_stackshift_orders_customer_notification.sql` — `add column
  customer_notification_sent_at timestamptz`. **Written, not applied.**
- `src/types/database.ts` — `customer_notification_sent_at` added to `stackshift_orders`
  Row (`string | null`) / Insert / Update (`?: string | null`).
- `src/app/(hub)/stackshift-orders/page.tsx` — added the column to the list `select`.
- `src/app/(hub)/stackshift-orders/_components/orders-table.tsx` — `customer_notification_sent_at`
  on `OrderListItem`; a green `<Check /> Confirmation sent` line under the contact email
  (imported `Check` from lucide-react).
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` — green
  "Customer emailed {date}" line under "Submitted {date}" in the header (`OrderDetail`
  extends `OrderRow`, so the field is already typed).
- `env.example` — documented `STACKSHIFT_ORDER_REPLY_TO` under the task-347 block.
- `CLAUDE.md` — `stackshift_orders` bullet updated (customer confirmation, migration 135,
  `customer_notification_sent_at`, independent try/catch, no double-send).

### Files Changed
- `src/lib/email/stackshift-order-customer-confirmation.ts` - new email module
- `src/app/api/webhooks/stackshift-order/route.ts` - fire the confirmation + `dedupeEmails` helper
- `supabase/migrations/135_stackshift_orders_customer_notification.sql` - new column (not applied)
- `src/types/database.ts` - type the new column
- `src/app/(hub)/stackshift-orders/page.tsx` - list `select`
- `src/app/(hub)/stackshift-orders/_components/orders-table.tsx` - "Confirmation sent" indicator
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` - "Customer emailed" line
- `env.example` - `STACKSHIFT_ORDER_REPLY_TO`
- `CLAUDE.md` - bullet update

### Deviations From Plan
- Table indicator placed under the contact email (Contact column) rather than the narrow
  120px "Submitted" column — the plan left the exact spot open ("a small indicator");
  Contact column is where email context already lives and there was room.
- `text-[12px]` / `text-[10.5px]` literals in the two UI edits match the shipped
  hand-rolled type scale in these exact files (CLAUDE.md UI Polish section documents this
  codebase deliberately does not use a shadcn/DESIGN.md type ramp). Impeccable hook flags
  these as "font size outside DESIGN.md" — left as-is for consistency with the surrounding
  lines; not silenced.
- Impeccable also flags Arial / inline hex colors / `border-radius` in the new email
  module — inherent to transactional HTML email (clients strip stylesheets & design
  systems) and identical to the sibling `stackshift-order-notification.ts`. Left as-is.

### Verification Run
- `npx tsc --noEmit` - PASS (exit 0)
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `_checklist-tab.tsx`)
- `pnpm build` - SKIPPED (not required by task doc; live SMTP/build deferred to test stage)
- Live intake curl + real email delivery + migration 135 apply - SKIPPED (needs secret/MAIL
  env + Supabase apply; same posture as tasks 347/353, deferred to test / live run)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Changed files stay within the task's proposed file list
  (`git diff --name-only` = route.ts, the new email module, migration 135, database.ts,
  page.tsx, orders-table.tsx, order-review.tsx, env.example, CLAUDE.md, TASKS.md + task doc).
- Error handling: the two notification blocks are independently `try/catch`-wrapped; the
  stamp `update` failure is caught and logged (tolerates the pre-migration-135 column gap).
  Neither path can fail the `201`. Matches the sibling staff-notification block's posture.
- Logging: `console.warn`/`console.error` only, same prefix + style as
  `stackshift-order-notification.ts` — operational, not debug noise. No secrets.
- Types: no `any`; `dedupeEmails` accepts `(string | null | undefined)[]` matching the
  zod-derived `billingEmail` type (`string | null | undefined`, `""` filtered by the `@` check).
- `resolveReplyTo()` / `dedupeEmails()` are small, single-responsibility, guard-clause style.
- `npx tsc --noEmit` PASS · `pnpm lint` PASS (2 pre-existing unrelated warnings).

### Deviations
- **Minor** — table "Confirmation sent" indicator placed in the Contact column (under the
  email) rather than the 120px Submitted column. The plan left the spot open; Contact
  column has the room and the semantic fit.
- **Minor** — `esc()` HTML-escape helper is copied into the new email module (one line,
  identical to `stackshift-order-notification.ts`) rather than extracted to a shared
  `_email-html.ts`. The task doc allowed either; copying a trivial one-liner is the
  lower-risk choice. Extract if a third transactional-email module appears.
- **Minor (fixed during gate)** — implementation first used a novel green `#3B8168` for the
  two "emailed" indicators; changed to `#1E7C4B` (the existing "Converted" `StatusPill`
  green in `_order-ui.tsx`) for palette consistency within the feature.
- Impeccable hook findings on the new email module (Arial, inline hex colors, `border-radius`)
  and the two UI edits (`text-[12px]`/`text-[10.5px]` literals) are left unchanged:
  transactional email HTML inherently can't use the design system (clients strip it) and is
  identical to the sibling module; the UI literals match the shipped hand-rolled type scale
  in those exact files, which CLAUDE.md's UI Polish section says this codebase deliberately
  uses instead of a DESIGN.md ramp. Not silenced with inline ignores.

### Required Fixes
- None.

---

## Completion (2026-09-10)

**Marked complete at the user's explicit request.** Code + quality gate done; the
following are operator / deploy steps (consistent with how tasks 345 / 350 / 351 closed):

- Migration `135_stackshift_orders_customer_notification.sql` applied via `supabase db push`
  (the confirmation email sends without it — only the `customer_notification_sent_at` stamp
  and the "Customer emailed" UI indicator need it).
- `MAIL_*` env set; optional `STACKSHIFT_ORDER_REPLY_TO` for a monitored reply inbox.
- Hub redeploy.
- Live acceptance: submit a real order → confirm the submitter receives the confirmation
  email (and the staff notification still fires independently) → confirm a forced failure
  in one email path doesn't suppress the other.

No webriq.com change required for this task (the Hub sends the email; webriq.com only owns
the on-page success state, which pre-existed).
