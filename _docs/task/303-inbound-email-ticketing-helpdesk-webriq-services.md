# 303: Inbound Email Ticketing — Receive helpdesk@webriq.services as Desk Tickets

**Created:** 2026-08-25
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Today the Hub can only *send* email (`src/lib/email/resend.ts`, Resend, invite/OTP only) and only *receives* Zoho's outbound webhooks (`src/app/api/webhooks/route.ts` — Zoho Desk/Projects event pushes, HMAC-verified). There is no path for a live inbound email to become a Hub ticket. `helpdesk@webriq.services` is presumed to route to Zoho Desk today.

Task 302 is preserving the *historical* Zoho Desk ticket record ahead of decommission (batch import into the native `tickets`/`ticket_messages` schema from migration 025, extended by migration 114). This task specs the *live* replacement: a webhook endpoint fed by an inbound-email provider that turns new mail to `helpdesk@webriq.services` — and replies to threads already open — into native `tickets`/`ticket_messages` rows, using the exact same schema task 302 populates historically. `tickets.channel` already has an `'email'` value in its check constraint (migration 025) — this task is what actually produces rows with that value live, rather than importing them.

This does not touch the Desk Tickets *import* route or its data — it is a new, separate live-intake path that becomes the ongoing replacement once Zoho Desk access ends.

## Requirements

- [ ] New webhook endpoint receives inbound-email events from the chosen provider and cryptographically verifies the request before processing (never trust an unauthenticated POST — same non-negotiable principle as `ZOHO_WEBHOOK_SECRET` in `src/app/api/webhooks/route.ts`; a missing/misconfigured secret must reject, not fall open).
- [ ] A new inbound email with no thread match creates: one `tickets` row (`channel: 'email'`, `subject` from the email subject, `requester_email` from the From address, `status: 'new'`, `priority: 'normal'`) and one `ticket_messages` row (`author_type: 'client'`, `visibility: 'public'`, `body` from the email text/HTML, `email_message_id` from the email's `Message-ID` header).
- [ ] A reply whose `In-Reply-To` or `References` header matches an existing `ticket_messages.email_message_id` appends a new `ticket_messages` row to that ticket instead of creating a duplicate ticket.
- [ ] Requester → `customer_id` resolution: match the From address against `contacts.email`, resolve `contacts.customer_id` — mirrors the desk-tickets import's contact-based primary match (`src/app/api/admin/zoho-import/desk-tickets/route.ts`). No match → `customer_id: null`, using the same nullable precedent migration 114 already established for exactly this "can't confidently match a customer" case; the ticket still lands in the staff-visible queue (`tickets_staff_all` RLS has no customer_id condition) instead of being dropped.
- [ ] Duplicate delivery from the provider (webhook retries are normal/expected) must not create duplicate `ticket_messages` rows — dedupe on `email_message_id` before insert.
- [ ] Inbound attachments are stored in Supabase Storage and referenced from the created `ticket_messages` row.
- [ ] Provider signature verification secret(s) are documented in `env.example` following the existing `ZOHO_WEBHOOK_SECRET`/`CRONJOB_SECRET_KEY` comment style (what it's for, where it comes from).
- [ ] Decision recorded (see Open Decisions) for which inbound-email provider is used and how `helpdesk@webriq.services` mail routing/DNS gets pointed at it.

## Out of Scope / Must-Not-Change

- `src/app/api/admin/zoho-import/desk-tickets/route.ts` and the batch Desk Ticket import flow (task 296/302) — untouched. This task adds a parallel *live* intake path; it does not replace or modify the import.
- Outbound email (`src/lib/email/resend.ts`) — unchanged.
- The existing Zoho webhook listener (`src/app/api/webhooks/route.ts`) — a new, separate route handles inbound email; do not fold email handling into the Zoho listener's HMAC/payload logic.
- No UI work — creating tickets/messages via this endpoint is enough for this task; browsing/replying-from-the-Hub UI for tickets (if it doesn't already fully exist) is separate scope.
- Outbound reply-by-email (staff replying to a ticket and having it emailed back to the client) — not in scope here; this task is inbound-only.
- `tickets.ticket_number` (a `serial`) — never write an external value into it, same precedent as the import route.
- Actually cutting over DNS/MX for `helpdesk@webriq.services` is an infrastructure/ops action outside this repo — this task delivers the endpoint and documents the cutover step; the cutover itself needs explicit user sign-off before execution (mail routing changes are hard to reverse quickly and affect live customer support).

## Open Decisions

These need a call before/during implementation — flagging rather than guessing, since getting them wrong is costly (wrong provider choice = redo the endpoint; wrong DNS step = dropped customer email):

1. **Inbound-email provider.** Resend (already integrated for outbound, `src/lib/email/resend.ts`) has been adding inbound-receiving capability; alternatives with mature inbound parsing are Postmark, Mailgun (Routes), and SendGrid (Inbound Parse). Recommend defaulting to Resend to avoid a second email vendor, but **verify current Resend inbound support, payload shape, and webhook signing scheme against their live docs at implementation time** — this is a fast-moving surface and nothing here should be assumed stale-safe.
2. **DNS/MX routing.** Whatever provider is chosen needs `helpdesk@webriq.services` (or its MX/routing) pointed at it, away from Zoho Desk. This is a real cutover with a blast radius (support email is live) — sequence it as: build + test the endpoint against a *staging* address first, confirm parity, then cut the real address over with the user's explicit go-ahead.
3. **Attachment storage bucket.** Recommend a new private `ticket-attachments` bucket (`public: false`), mirroring the `project-assets`/`customer-assets` precedent (migrations 050/057): staff-role RLS on `storage.objects` (`admin`/`super_admin`/`pm`/`developer` read, `admin`/`super_admin`/`pm` write — inserts happen via `adminClient` from the webhook anyway, no session exists), with client-facing exposure (if any) served through an app API route that checks `tickets.customer_id`/`ticket_messages.visibility` application-side, not through path-scoped storage RLS — matching how `customer_assets`' `allowed_roles` is enforced at the application layer per migration 057's comment.
4. **Transition-period dedup.** If live inbound-email intake goes live *before* the historical Desk import (task 302) fully completes, or if Zoho Desk keeps receiving mail in parallel for a cutover window, there's a real risk of the same ticket existing in both the imported (`external_id` set) and live (`external_id` null) rows. Needs an explicit cutover sequencing decision — likely "flip DNS, then the import only ever sees pre-cutover tickets" — before go-live.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/webhooks/email/route.ts` | Create | Inbound-email webhook: verify provider signature, parse email, thread-match or create ticket, insert `ticket_messages`, store attachments. |
| `src/lib/email/inbound.ts` | Create | Provider-specific payload parsing + signature verification helpers, kept separate from `resend.ts` (outbound) for a clean boundary. |
| `supabase/migrations/{next}_ticket_messages_email_message_id_unique.sql` | Create | Add a unique index on `ticket_messages.email_message_id` (currently has no uniqueness constraint — needed both for provider-retry dedup and for fast `In-Reply-To`/`References` thread-match lookups). |
| `env.example` | Modify | Document the new provider webhook secret env var(s), matching the `ZOHO_WEBHOOK_SECRET` comment style. |
| `supabase/migrations/{next}_ticket_attachments_storage.sql` | Create | New private `ticket-attachments` bucket + staff-role RLS, per Open Decision 3. |

## Code Context

### `src/app/api/webhooks/route.ts` — existing webhook signature-verification pattern to mirror

```ts
const hmacSecret = process.env.ZOHO_WEBHOOK_SECRET;
if (!hmacSecret) {
  console.error("[webhook] ZOHO_WEBHOOK_SECRET is not configured — rejecting request");
  return NextResponse.json({ received: true }); // 200 so Zoho doesn't retry
}
const signature = req.headers.get("x-zp-webhook-signature") ?? "";
const expected = createHmac("sha256", hmacSecret).update(rawText).digest("base64");
const sigBuf = Buffer.from(signature);
const expBuf = Buffer.from(expected);
const valid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
```
Adapt to whatever signing scheme the chosen provider actually uses (verify against live docs — do not assume HMAC-SHA256 the same way without checking).

### `supabase/migrations/025_v2_schema.sql` — `tickets` / `ticket_messages` schema this task writes into

```sql
create table tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number serial unique,
  customer_id text references customers(customer_id) on delete cascade, -- nullable per migration 114
  subject text not null,
  channel text not null check (channel in ('portal', 'email', 'manual')),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')) default 'normal',
  status text not null check (status in ('new', 'open', 'waiting_on_client', 'waiting_on_us', 'resolved', 'closed')) default 'new',
  requester_email text,
  ...
);

create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_type text not null check (author_type in ('client', 'staff', 'system', 'llm_draft')),
  body text not null,
  email_message_id text null, -- NOT unique yet — this task adds that
  visibility text not null check (visibility in ('public', 'internal')) default 'public',
  created_at timestamptz not null default now()
);
```

### `src/app/api/admin/zoho-import/desk-tickets/route.ts` — contact-based customer match pattern to reuse

```ts
const contactId = ticket.contactId != null ? String(ticket.contactId) : null;
// ...
if (contactId && customerIdByContactExternalId.has(contactId)) {
  customerId = customerIdByContactExternalId.get(contactId)!;
  matchMethod = "contact";
}
```
Live equivalent: look up `contacts` by `email` (the inbound From address) instead of by imported `external_id`.

## Implementation Steps

1. Confirm provider choice and inbound payload/signature shape against current live docs (Open Decision 1) before writing code against assumptions.
2. Write the `email_message_id` unique-index migration and the `ticket-attachments` storage bucket migration.
3. Build `src/lib/email/inbound.ts`: signature verification + payload → normalized `{from, to, subject, textBody, htmlBody, messageId, inReplyTo, references, attachments}` parsing.
4. Build `src/app/api/webhooks/email/route.ts`: verify → thread-match (by `email_message_id` against `In-Reply-To`/`References`) → append-or-create ticket/message → store attachments → return 200.
5. Add `contacts.email` → `customer_id` resolution with the `null`-on-no-match fallback.
6. Document the new env var(s) in `env.example`.
7. Test end-to-end against a staging inbox/address before touching the real `helpdesk@webriq.services` routing (Open Decision 2) — do not cut real DNS over as part of this task without separate explicit user go-ahead.

## Acceptance Criteria

- [ ] Sending a fresh email to the test inbound address creates exactly one `tickets` row (`channel: 'email'`) and one `ticket_messages` row with the correct `email_message_id`.
- [ ] Replying to that thread (matching `In-Reply-To`) appends a `ticket_messages` row to the *same* ticket, not a new one.
- [ ] The provider re-delivering the same webhook event does not create a duplicate `ticket_messages` row.
- [ ] An email from an address in `contacts.email` resolves to that contact's `customer_id`; an unrecognized address creates the ticket with `customer_id: null` and is visible to staff via `tickets_staff_all`.
- [ ] An unsigned/forged POST to the new webhook endpoint is rejected, not processed.
- [ ] An email with an attachment results in the file landing in the new storage bucket and being referenced from the ticket message.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: send test emails to the staging inbound address, inspect tickets/ticket_messages rows in Supabase.
# Manual: replay a captured webhook payload with a bad signature — confirm rejection.
```

## Compatibility Touchpoints

- `env.example` gains new documented var(s) — no behavior change for existing deployments until the var is set.
- New migrations are additive (new index, new bucket) — no existing column/table changes, no risk to the task 302 import path.
- Real mail routing for `helpdesk@webriq.services` is unaffected until the DNS cutover step (Open Decision 2) is separately approved and executed.
