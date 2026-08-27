# 303: Inbound Email Ticketing — Receive helpdesk@webriq.us as Desk Tickets + Ticket Detail View

**Created:** 2026-08-25
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Today the Hub can only *send* email (`src/lib/email/resend.ts`, Resend, invite/OTP only) and only *receives* Zoho's outbound webhooks (`src/app/api/webhooks/route.ts` — Zoho Desk/Projects event pushes, HMAC-verified). There is no path for a live inbound email to become a Hub ticket. `helpdesk@webriq.us` is a Zoho Mail mailbox that Zoho Desk currently watches to create/append tickets.

Task 302 preserves the *historical* Zoho Desk ticket record ahead of decommission (batch import into the native `tickets`/`ticket_messages` schema from migration 025, extended by migration 114). This task specs the *live* replacement: a webhook endpoint fed by an inbound-email provider that turns new mail to `helpdesk@webriq.us` — and replies to threads already open — into native `tickets`/`ticket_messages` rows, using the exact schema task 302 populates historically. `tickets.channel` already accepts `'email'` (migration 025); this task is what actually produces rows with that value live.

**Scope was expanded during planning**: no ticket detail/conversation view exists anywhere in the Hub today — `desk/tickets/_tickets-table.tsx` rows aren't even clickable. That means live-imported tickets would show up as opaque list rows with no way to read what the customer actually wrote. Per explicit decision, this task now also builds a ticket detail page modeled on the reference Zoho Desk ticket-view layout (ticket properties sidebar + conversation thread + status), adapted to the Hub's existing visual system rather than cloned pixel-for-pixel — see **Ticket Detail Page** below. This benefits the 530 already-imported historical tickets too, not just new live ones.

This does not touch the Desk Tickets *import* route or its data — intake is a new, separate live path; the detail page is a new read/limited-write surface over the same `tickets`/`ticket_messages` tables both paths already share.

## Requirements

### A. Live email intake — **superseded by task 318 (Zoho Mail API), see that task doc**

> **2026-08-27 update:** This section originally specced a Resend inbound webhook fed by a Zoho Mail forwarding rule (Open Decision 2 below). That was implemented (see Implementation Notes) but never went live — the Resend receiving-domain verification and Zoho Mail forwarding rule were never configured. Task 318 replaces this transport entirely with a cron poller against Zoho Mail's own API (`helpdesk@webriq.us` already lives there), removing the need for a forwarding rule or any Resend domain verification. The `tickets`/`ticket_messages` schema and everything in Requirement B below are unaffected — see `_docs/task/318-ticketing-email-provider-migrate-resend-to-zoho-mail-api.md` for the current design.

- [ ] ~~New webhook endpoint receives inbound-email events from the chosen provider and cryptographically verifies the request before processing~~ — replaced by a cron-secret-gated poller (task 318 Requirement A) against Zoho Mail's Email Messages API; no provider webhook exists anymore.
- [ ] A new inbound email with no thread match creates: one `tickets` row (`channel: 'email'`, `subject` from the email subject, `requester_email` from the From address, `status: 'new'`, `priority: 'normal'`) and one `ticket_messages` row (`author_type: 'client'`, `visibility: 'public'`, `body` from the email text/HTML, `email_message_id` from the email's Zoho Mail message ID). *(Still true under task 318 — only the transport changed.)*
- [ ] ~~A reply whose `In-Reply-To` or `References` header matches an existing `ticket_messages.email_message_id` appends a new `ticket_messages` row~~ — replaced by matching on Zoho Mail's own `threadId` (stored as `tickets.zoho_mail_thread_id`), which groups a conversation server-side with no header parsing needed (task 318).
- [ ] Requester → `customer_id` resolution: match the From address against `contacts.email`, resolve `contacts.customer_id` — mirrors the desk-tickets import's contact-based primary match. No match → `customer_id: null` (migration 114's established nullable precedent); the ticket still lands in the staff-visible queue (`tickets_staff_all` RLS has no customer_id condition) instead of being dropped.
- [ ] Duplicate delivery from the provider (webhook retries are normal/expected) must not create duplicate `ticket_messages` rows — dedupe on `email_message_id` before insert.
- [ ] Inbound attachments are downloaded and stored via the **existing** `ticket-attachments` bucket + `attachments` table (`entity_type: 'ticket_message'`, `entity_id` = the new `ticket_messages.id`) — same storage shape the `ticket-attachments` import route already writes, no new bucket.
- [ ] Provider signature verification secret(s) documented in `env.example`, following the `ZOHO_WEBHOOK_SECRET`/`CRONJOB_SECRET_KEY` comment style.

### B. Ticket Detail Page

- [ ] New route `src/app/(hub)/desk/tickets/[ticketNumber]/page.tsx`, routed by `tickets.ticket_number` (the existing serial column, already unique and populated for every row — imported and live) instead of the `id` UUID, per explicit request. This is a deliberate addition to CLAUDE.md's documented UUID-routing exceptions (`project_id`/`display_id` on portfolio-tracker/projects routes) — unlike those, no new `display_id` column is introduced; `ticket_number` already exists and already serves this purpose. Server lookup becomes `.eq("ticket_number", ticketNumber)` instead of `.eq("id", id)`; the UUID `id` stays the internal PK used by `ticket_messages.ticket_id`/`attachments.entity_id` FKs, unchanged. Same role gate as the list page (`admin`/`super_admin`/`pm`).
- [ ] **Badge consistency (per explicit follow-up request)**: `resolveDisplayId()` in `src/app/(hub)/desk/tickets/page.tsx` currently prefers Zoho's historical `source_meta.ticketNumber` over the native `ticket_number` for imported tickets. Change it to always show `ticket_number`, so the badge and the URL agree for every ticket, imported or live:
  ```ts
  // Before:
  function resolveDisplayId(ticket: TicketRow): string {
    const zohoNumber = ticket.source_meta && typeof ticket.source_meta.ticketNumber === "string"
      ? ticket.source_meta.ticketNumber : null;
    return `#${zohoNumber ?? ticket.ticket_number}`;
  }
  // After:
  function resolveDisplayId(ticket: TicketRow): string {
    return `#${ticket.ticket_number}`;
  }
  ```
  **Consequence, called out rather than hidden**: this changes already-shipped list-page display (task 309) for all 530 imported historical tickets — they'll show the Hub's own native number (e.g. `#312`) instead of the number Zoho Desk itself used to assign (e.g. `#20975`). Zoho's original number isn't lost — it stays in `source_meta.ticketNumber` and should still surface somewhere on the **detail page** (e.g. a "Zoho ticket #20975" line in Ticket Information, for anyone cross-referencing the old system during the transition) — just not as the primary badge/URL number anymore.
- [ ] List page rows become links to the detail page (`/desk/tickets/{ticket_number}`) — `_tickets-table.tsx` currently renders static `<div>` rows with no navigation, and its `TicketListItem` type doesn't currently expose `ticket_number` to the client component (only the composed `displayId` string) — add it.
- [ ] Header: subject, display ID (now always `#{ticket_number}`, per the badge-consistency change above), contact name, created date, status badge, first-response indicator.
- [ ] Left properties panel, adapted from the reference layout to data the schema actually has:
  - **Contact Info** — resolved name (same fallback chain as the list page: contact full name → composed first/last → contact email → `requester_email` → "Guest"), email, phone (`source_meta.phone`, populated for imported tickets, absent for live ones — render conditionally).
  - **Key Information** — Owner (resolved via `desk_agents` for imported tickets exactly as today; "Unassigned" for live ones — display-only, no reassignment flow in this task), Status (editable, see below), created/resolved timestamps.
  - **Ticket Information** — channel, SLA due date, first response time, and (imported tickets only) the original Zoho ticket number from `source_meta.ticketNumber`, now that the badge/URL no longer shows it.
  - *Dropped from the reference layout*: Zia Insights (no AI-insight infra for tickets), Tags (no `tickets.tags` column), Resolution/Time Entry tabs (no ticket-scoped equivalent — `time_logs` is task-scoped).
- [ ] Conversation thread: `ticket_messages` for the ticket, ordered by `created_at`, each row showing resolved author name (client → contact/requester_email; staff → `profiles.full_name` via `author_id`), a Public/Internal badge (from `visibility`), and the message body. Desk Threads import already found `body` is often raw HTML with `source_meta.contentType` marking it — render accordingly, and sanitize before injecting HTML (no unsanitized `dangerouslySetInnerHTML`).
- [ ] Per-message attachments (via `attachments` where `entity_type = 'ticket_message'` and `entity_id = ticket_messages.id`) shown as chips with a signed-URL download link — mirrors the existing `.../attachments/[attachmentId]/file-url/route.ts` pattern (session-scoped `createSignedUrl`, not a bypass).
- [ ] Internal-note compose box (staff-only): posts a new `ticket_messages` row with `visibility: 'internal'`, `author_type: 'staff'`, `author_id` = current user. **Not** a customer-facing reply — no outbound email is sent (stays inside this task's Out-of-Scope boundary below).
- [ ] Status control (staff-only): a small `PATCH` route updates `tickets.status`; reflects immediately in both the detail page and the list page's existing status chip.

## Out of Scope / Must-Not-Change

- `src/app/api/admin/zoho-import/desk-tickets/route.ts` and the batch Desk Ticket import flow (task 296/302) — untouched. This task adds parallel live intake + a viewer; it does not replace or modify the import.
- Outbound email (`src/lib/email/resend.ts`) — unchanged.
- The existing Zoho webhook listener (`src/app/api/webhooks/route.ts`) — a new, separate route handles inbound email; do not fold email handling into the Zoho listener's HMAC/payload logic.
- **Customer-facing reply-by-email** (the reference layout's "Reply All") — not in scope. The detail page's compose box is internal-notes only. Sending a reply back to the customer's inbox is a separate follow-up task once outbound-per-ticket infrastructure exists.
- Zia Insights / AI ticket summarization, Remote Assist, Apply Macro — Zoho-specific automation with no Hub equivalent; not built here.
- Ticket **reassignment** ("Owner" is display-only in this task) — a follow-up if wanted.
- Tags — no schema column; not introduced here.
- `tickets.ticket_number` (a `serial`) — never write an external value into it, same precedent as the import route.
- Actually cutting over DNS/MX (or removing Zoho Desk's mail access) for `helpdesk@webriq.us` is an infrastructure/ops action outside this repo, and is explicitly **not** part of this task — see Open Decisions. The recommended setup below is additive (a forwarding rule) and does not touch Zoho Desk's existing intake.

## Open Decisions

1. ~~**Inbound-email provider.**~~ **Resolved by task 318: Zoho Mail API**, not Resend. `helpdesk@webriq.us` already lives in Zoho Mail, already sends/receives with no domain-verification work, and the team is keeping Zoho Mail long-term (only Zoho Desk is being decommissioned) — see task 318's Overview for the full comparison against Resend/ZeptoMail/the Zoho Desk API. The Resend implementation below (Implementation Notes) was real work but is now superseded, not deleted history.

2. **External mailbox setup — recommended path.** `helpdesk@webriq.us` stays exactly where it is (Zoho Mail); nothing about its live delivery to Zoho Desk changes as part of this task:
   - Add a **Zoho Mail forwarding rule** on `helpdesk@webriq.us` (Zoho Mail admin console → Mail Forwarding) that sends a copy of every inbound message to the chosen provider's inbound address. Zoho Desk keeps receiving the original mail unaffected — the Hub simply starts receiving its own copy via the provider's webhook. This is additive, reversible in seconds (delete the rule), and safe to test without any risk to live customer support. Requires Zoho Mail admin access on the `webriq.us` domain.
   - Separately, the chosen provider will require its own one-time domain verification (SPF/DKIM TXT records, or an MX record on a dedicated receiving subdomain such as `in.webriq.us`) to accept inbound mail at all — this is provider-side DNS setup and does **not** touch `helpdesk@webriq.us`'s own MX or mailbox.
   - A full DNS/MX cutover that stops Zoho Desk from receiving new mail is a later, separate, higher-risk step — only worth doing once the Hub path is proven in production and Zoho Desk is actually being retired, and needs explicit user go-ahead when it happens (out of scope here, per above).

3. ~~Attachment storage bucket~~ — **resolved**: reuse the existing `ticket-attachments` bucket (migration 117, private, staff-role RLS) and the generic `attachments` table (`entity_type`/`entity_id`), exactly as the `ticket-attachments` import route already does. No new bucket or storage migration needed.

4. **Transition sequencing.** Task 302's historical import reads a point-in-time `_from_zoho/desk-tickets.json`/`desk-threads.json` export. Run that import **one final time immediately before** turning on the Zoho Mail forwarding rule from Open Decision 2, and don't re-run it afterward — otherwise the same real-world email could land twice (once live via this task, once again in a later Zoho export). Once the forwarding cutover point is fixed, the Hub's live tickets and Zoho's historical import are two non-overlapping pools with no dedup logic needed between them.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| ~~`src/app/api/webhooks/email/route.ts`~~ `src/app/api/cron/email-poll/route.ts` | Create, then replaced by task 318 | Originally a Resend webhook; task 318 replaced it with a cron-secret-gated poller against the Zoho Mail API — file removed, functionality moved to the new path. |
| `src/lib/email/inbound.ts` | Create, then rewritten by task 318 | Originally Resend-specific payload parsing; task 318 rewrote it as a thin normalizer over `src/lib/zoho/mail.ts`. |
| `supabase/migrations/{next}_ticket_messages_email_message_id_unique.sql` | Create | Unique index on `ticket_messages.email_message_id` (currently unconstrained) — needed for provider-retry dedup and fast `In-Reply-To`/`References` thread-match lookups. |
| `env.example` | Modify | Document the new provider webhook secret env var(s). |
| `src/app/(hub)/desk/tickets/[ticketNumber]/page.tsx` | Create | Server component: resolve `ticket_number` → row, fetch messages + attachments + contact/agent/profile lookups, role-gate. |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` | Create | Client shell: header, properties sidebar, status control, note compose. |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_conversation-thread.tsx` | Create | Message list: author resolution, visibility badge, sanitized HTML body, attachment chips. |
| `src/app/(hub)/desk/tickets/_tickets-index.tsx` | Modify | Add `ticket_number` to `TicketListItem` so the table can link without a second lookup. |
| `src/app/(hub)/desk/tickets/page.tsx` | Modify | Simplify `resolveDisplayId()` to always use `ticket_number` (drop the Zoho-number preference — badge consistency); pass `ticket_number` into `TicketListItem`. |
| `src/app/(hub)/desk/tickets/_tickets-table.tsx` | Modify | Wrap rows in a `Link` to `/desk/tickets/{ticketNumber}` — currently static, no navigation. |
| `src/app/api/desk/tickets/[ticketNumber]/status/route.ts` | Create | `PATCH` — staff-only `tickets.status` update, looked up by `ticket_number`. |
| `src/app/api/desk/tickets/[ticketNumber]/notes/route.ts` | Create | `POST` — staff-only internal note (`ticket_messages`, `visibility: 'internal'`), ticket resolved by `ticket_number`. |
| `src/app/api/desk/tickets/[ticketNumber]/messages/[messageId]/attachments/[attachmentId]/file-url/route.ts` | Create | Session-scoped signed URL for a ticket-message attachment. |

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
```
Adapt to whatever signing scheme the chosen provider actually uses — verify against live docs, do not assume HMAC-SHA256 works the same way without checking.

### `src/app/(hub)/desk/tickets/page.tsx` — existing resolution helpers to reuse as-is

The list page already has graceful fallbacks that need **no changes** for live email tickets (no `external_contact_id`, no `source_meta.ticketNumber`, no `source_meta.assigneeId`):

```ts
function resolveContactName(ticket: TicketRow, contact: ContactRow | undefined): string {
  if (contact?.full_name) return contact.full_name;
  const composed = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();
  if (composed) return composed;
  if (contact?.email) return contact.email;
  if (ticket.requester_email) return ticket.requester_email;
  return "Guest";
}
function resolveDisplayId(ticket: TicketRow): string {
  return `#${ticket.ticket_number}`; // changed by this task — was Zoho-number-preferring, see Requirements B
}
```
The detail page should import/reuse this same (now-simplified) logic (extract to a shared helper if convenient) rather than reimplementing it.

### `supabase/migrations/117_ticket_attachments_storage.sql` + `attachments` table (migration 025) — storage pattern to reuse, not reinvent

```sql
-- bucket: 'ticket-attachments', private, staff-role RLS (admin/super_admin/pm/developer read, admin/super_admin/pm write)
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null,
  filename text not null,
  size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
```
Both the webhook's attachment writes and the detail page's attachment reads use `entity_type: 'ticket_message'`, `entity_id: ticket_messages.id`.

### `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts` — signed-URL pattern to mirror for the new file-url route

```ts
// session-bound client's own createSignedUrl is correctly scoped without a bypass
const { data } = await supabase.storage
  .from("ticket-attachments")
  .createSignedUrl(attachment.storage_path, 60, forceDownload ? { download: attachment.filename } : undefined);
```

### `supabase/migrations/025_v2_schema.sql` — `tickets` / `ticket_messages` schema this task writes into and reads from

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

### RLS already in place (migration 026) — no new policies needed for the detail page

```sql
create policy "tickets_staff_all" on tickets for all to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));
create policy "ticket_messages_staff_all" on ticket_messages for all to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));
```
Staff can already read/write both tables under existing RLS; the status/notes routes just need to run as the authenticated session (not `adminClient`) so these policies apply normally.

## Implementation Steps

1. Confirm provider choice and inbound payload/signature shape against current live docs (Open Decision 1) before writing code against assumptions.
2. Write the `email_message_id` unique-index migration.
3. Build `src/lib/email/inbound.ts` (signature verification + payload → normalized `{from, to, subject, textBody, htmlBody, messageId, inReplyTo, references, attachments}`) and `src/app/api/webhooks/email/route.ts` (verify → thread-match → append-or-create → store attachments via the existing bucket/table → 200).
4. Add `contacts.email` → `customer_id` resolution with the `null`-on-no-match fallback.
5. Build the ticket detail page (`[ticketNumber]/page.tsx` + `_ticket-detail.tsx` + `_conversation-thread.tsx`, resolving the route param via `.eq("ticket_number", ...)`), reusing the list page's resolution helpers; add `ticket_number` to `TicketListItem` and wire `_tickets-table.tsx` rows to link there. Doing this before/alongside step 3 is useful — it's the only way to actually see intake working end-to-end.
6. Build the `status` PATCH route and internal-note POST route.
7. Build the attachment `file-url` signed-URL route.
8. Document the new env var(s) in `env.example`.
9. Test end-to-end against a staging inbox before setting up the real Zoho Mail forwarding rule on `helpdesk@webriq.us` (Open Decision 2) — do not touch the real mailbox's forwarding as part of this task without separate explicit user go-ahead, and sequence it after a final run of task 302's import (Open Decision 4).

## Acceptance Criteria

- [ ] Sending a fresh email to the test inbound address creates exactly one `tickets` row (`channel: 'email'`) and one `ticket_messages` row with the correct `email_message_id`.
- [ ] Replying to that thread (matching `In-Reply-To`) appends a `ticket_messages` row to the *same* ticket, not a new one.
- [ ] The provider re-delivering the same webhook event does not create a duplicate `ticket_messages` row.
- [ ] An email from an address in `contacts.email` resolves to that contact's `customer_id`; an unrecognized address creates the ticket with `customer_id: null` and is visible to staff via `tickets_staff_all`.
- [ ] An unsigned/forged POST to the new webhook endpoint is rejected, not processed.
- [ ] An email with an attachment lands in the `ticket-attachments` bucket and is referenced from the ticket message via the `attachments` table.
- [ ] Opening a ticket from the list (both an imported one and a live-email one) navigates to `/desk/tickets/{ticket_number}` (not a UUID) and shows its full conversation in chronological order, with correct author names and Public/Internal badges.
- [ ] Visiting `/desk/tickets/{ticket_number}` for a nonexistent number 404s cleanly rather than erroring.
- [ ] The list-page badge and the detail-page header show the same `#{ticket_number}` for every ticket, imported or live; an imported ticket's original Zoho number (if any) still appears in Ticket Information on the detail page, just not as the primary badge.
- [ ] An internal note added by a staff user appears immediately in the thread with `visibility: 'internal'`, and is confirmed absent from any client-facing read path (`ticket_messages_client_read` filters `visibility = 'public'`).
- [ ] Changing status on the detail page persists and is reflected on the list page's status chip without a full reload mismatch.
- [ ] Attachment download links resolve via signed URL and open/download the correct file.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: send test emails (new + reply) to the staging inbound address, inspect tickets/ticket_messages rows in Supabase.
# Manual: replay a captured webhook payload with a bad signature — confirm rejection.
# Manual (browser): open an imported ticket and a live-email ticket from the list; verify thread, attachments, internal note, and status change all work for both.
```

## Compatibility Touchpoints

- `env.example` gains new documented var(s) — no behavior change for existing deployments until the var is set.
- The `email_message_id` unique-index migration is additive — no risk to the task 302 import path (which never writes that column).
- Real mail routing/forwarding for `helpdesk@webriq.us` is unaffected until the Zoho Mail forwarding rule (Open Decision 2) is separately approved and configured; no DNS/MX change is part of this task at all.

## Implementation Notes

### What Changed
- Live inbound-email webhook (Requirements A) built against Resend's actual `email.received` API — verified live against the installed `resend@6.18.0` package's own type definitions plus Resend's current docs (fetched during implementation, not assumed): the webhook payload is metadata-only (`email_id`, `from`, `to`, `subject`, `message_id`, attachment stubs — no body/headers/attachment content), so the route makes a second call (`resend.emails.receiving.get(emailId)`) to fetch `html`/`text`/`headers`, and a third per attachment (`resend.emails.receiving.attachments.get(...)`) for a signed `download_url`. Signature verification uses `resend.webhooks.verify()` (Svix under the hood, via `svix-id`/`svix-timestamp`/`svix-signature` headers) rather than hand-rolled HMAC.
- Ticket detail page (Requirements B) built at `/desk/tickets/{ticket_number}`, matching the routing decision from the prior planning turn. List page badge simplified to always show `ticket_number` (Zoho's historical number, where imported, now shown in the detail page's Ticket Information panel instead).
- Contact/owner/display-ID resolution logic extracted from `page.tsx` into a new shared `_resolve.ts` so the detail page reuses it instead of reimplementing it (the task doc flagged this as optional — done for real reuse across two pages, not speculative).
- Attachments reuse the existing `ticket-attachments` bucket + `attachments` table (`entity_type: 'ticket_message'`) exactly as planned — no new bucket.

### Files Changed
- `supabase/migrations/119_ticket_messages_email_message_id_unique.sql` - partial unique index on `ticket_messages.email_message_id`, for provider-retry dedup and thread-match lookups.
- `src/lib/email/inbound.ts` - Resend inbound helpers: webhook verification, fetch full received email, fetch attachment download URL, header lookup, References parsing, From-address extraction.
- `src/app/api/webhooks/email/route.ts` - the inbound-email webhook: verify → fetch full email → dedupe/thread-match → create-or-append ticket/message → store attachments.
- `env.example` - documented `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (pre-existing, previously undocumented) and new `RESEND_INBOUND_WEBHOOK_SECRET`.
- `src/app/(hub)/desk/tickets/_resolve.ts` - new shared module: `resolveContactName`, `resolveOwnerName`, `resolveDisplayId`, `isOverdue`, `ContactRow`/`DeskAgentRow` types.
- `src/app/(hub)/desk/tickets/page.tsx` - imports from `_resolve.ts` instead of local duplicate defs; passes `ticket_number` into `TicketListItem`.
- `src/app/(hub)/desk/tickets/_tickets-index.tsx` - `TicketListItem.ticketNumber: number` added.
- `src/app/(hub)/desk/tickets/_tickets-table.tsx` - rows now `<Link href="/desk/tickets/{ticketNumber}">` instead of static `<div>`.
- `src/app/(hub)/desk/tickets/[ticketNumber]/page.tsx` - server component: resolves `ticket_number` → ticket, fetches messages/attachments/contact/agent/staff-author lookups, role-gates, 404s on no match.
- `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` - client shell: header, properties sidebar (Contact Info / Key Information incl. editable status / Ticket Information incl. Zoho historical number), internal-note compose.
- `src/app/(hub)/desk/tickets/[ticketNumber]/_conversation-thread.tsx` - message thread: author resolution, Public/Internal badge, sanitized HTML or plain-text body, attachment chips with on-demand signed-URL download.
- `src/app/api/desk/tickets/[ticketNumber]/status/route.ts` - `PATCH`, staff-only status update (also clears/sets `resolved_at`).
- `src/app/api/desk/tickets/[ticketNumber]/notes/route.ts` - `POST`, staff-only internal note.
- `src/app/api/desk/tickets/[ticketNumber]/messages/[messageId]/attachments/[attachmentId]/file-url/route.ts` - `GET`, session-scoped signed URL.
- `package.json` / `pnpm-lock.yaml` - added `dompurify` dependency (not in original Proposed File Changes — see Deviations).

### Deviations From Plan
- **Added `dompurify` as a new dependency.** Not listed in Proposed File Changes. The task doc's own note that inbound bodies are "often raw HTML" made rendering unsanitized HTML from arbitrary external senders (anyone can email `helpdesk@webriq.us`) a real stored-XSS risk in a staff-privileged view. The codebase's only existing HTML-render helper, `normalizeZohoDescriptionHtml` (`projects-old/_pm-shared.tsx`), does not sanitize at all and is only appropriate for semi-trusted Zoho-authored content — reusing it here would have shipped an XSS hole, so a real sanitizer was added instead (CLAUDE.md: "Prioritize writing safe, secure, and correct code"). `ConversationThread` is loaded via `next/dynamic({ssr:false})` since DOMPurify needs a DOM, mirroring this codebase's existing recharts convention for the same reason.
- **Resend inbound API shape differs from the Code Context's generic HMAC sketch.** Verified live against the installed `resend@6.18.0` package and current Resend docs rather than building on assumption (per the task doc's own Open Decision 1 instruction): `email.received` webhooks carry metadata only, requiring `emails.receiving.get()` for body/headers and `emails.receiving.attachments.get()` per attachment for a `download_url`. Verification uses the SDK's own `webhooks.verify()` (Svix), not hand-rolled HMAC.
- **Status/notes mutation routes use `adminClient` for the write**, with session auth + an explicit `adminClient` role-check as the primary authorization gate — not "session client so RLS applies" as the task doc's Code Context suggested. This matches the actual dominant precedent found in this codebase for staff-mutation routes (e.g. `PATCH /api/customers/[customerId]`), which is sanctioned by CLAUDE.md itself ("[adminClient] only for writes that need service-level access"). The file-url route *does* use the session client, matching its own closer precedent (`.../attachments/[attachmentId]/file-url/route.ts`), where storage RLS alone already scopes it correctly.
- Everything else matches the task doc as written (routing by `ticket_number`, badge consistency, reused `ticket-attachments` bucket, internal-notes-only compose, no outbound reply, no ticket reassignment, no Tags/Zia/Resolution/Time-Entry).

### Verification Run
- `npx tsc --noEmit` - PASS (clean, no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, not touched by this task)
- Manual: send test emails to a staging inbound address; replay a forged-signature webhook payload; open an imported and a live-email ticket in the browser; add an internal note; change status; download an attachment - SKIPPED. Requires `RESEND_API_KEY`/`RESEND_INBOUND_WEBHOOK_SECRET` plus a live Resend account/receiving domain/webhook, none of which exist yet in this environment — this is the Open Decisions work (provider account, domain verification, Zoho Mail forwarding rule), still pending and explicitly the user's action per the task's Out-of-Scope boundary.
- Migration `119_ticket_messages_email_message_id_unique.sql` - written but **not applied** to the remote database — user applies manually, same precedent as every other recent migration in this repo (e.g. tasks 293/296).
- Design-hook note: pre-existing `design-system-font-size` findings on literal `text-[Npx]` classes were flagged in `_tickets-index.tsx` (3, on lines untouched by this change) and the new `_ticket-detail.tsx` (5, then 6 after the Quality Gate pass below). Left as-is deliberately — every sibling file in `desk/tickets/` (the already-shipped list page, table, filter) uses the identical literal-px convention; switching only the new files to DESIGN.md's ramp would make this page internally inconsistent rather than more consistent.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation across the 14 changed/new files. `grep` for `: any`, `as any`, and stray `console.log` across all changed files found none (only a pre-existing, unrelated `console.log` inside an `env.example` code-comment snippet).
- `pnpm lint` clean (0 errors; 2 pre-existing warnings in `_checklist-tab.tsx`, a file this task never touches).
- `npx tsc --noEmit` clean, re-verified after the one fix made during this pass (see Deviations).
- Error handling is intentional throughout the new routes/components: every Supabase/fetch failure branch either logs (webhook route — mirrors the existing Zoho webhook's `console.error`/`console.warn` convention) or surfaces a typed error to the caller (API routes return `{error}` + a real status code; `_ticket-detail.tsx`/`_conversation-thread.tsx` revert optimistic state and show an inline message). No silent swallows.
- No secrets or credentials logged; the only new env vars (`RESEND_INBOUND_WEBHOOK_SECRET`, plus previously-undocumented `RESEND_API_KEY`/`RESEND_FROM_EMAIL`) are read via `process.env`, never printed.
- Naming is accurate (`resolveContactName`, `fetchReceivedEmail`, `extractEmailAddress`, etc. all do exactly what they say) and functions stay single-purpose; the webhook route is the longest function (~130 lines of logic) but reads as a linear pipeline with early-return guard clauses (missing secret → bad signature → wrong event type → fetch failure → dedupe → thread-match → create-or-append → attachments), not nested branching — consistent with the existing `src/app/api/webhooks/route.ts` it was modeled on.
- Repeated logic (`resolveContactName`/`resolveOwnerName`/`resolveDisplayId`/`isOverdue`) was extracted to `_resolve.ts` rather than duplicated between the list and detail pages, per the task doc's own suggestion.

### Deviations
- **Minor** — Added a "Priority" row to the detail page's Ticket Information panel during this pass. `tickets.priority` was already fetched and typed onto `TicketDetailData` by the implementation but never rendered anywhere — dead data being passed through with no display, not a new field or scope addition (priority is explicitly part of the existing `tickets` schema this task already reads). Fixed by rendering it; re-verified `tsc --noEmit` still passes clean.
- **Minor** — The webhook's contact-match query (`contacts.email` ilike, no `customer_id is null` contacts) has no explicit `ORDER BY` before `.limit(1)`; if two contact rows somehow share the same email, which one wins is Postgres-implementation-defined rather than deterministic. Real-world impact is low (duplicate contact emails would be a pre-existing data-quality issue, not something this task introduces) and not required by the task doc's acceptance criteria — documented, not fixed, to avoid inventing tie-break logic the task never specified.
- **Minor** — Attachment downloads inside the webhook loop over per-email attachments run sequentially, not in parallel. Deliberate: keeps the webhook handler's total external-call fan-out bounded and matches the sequential style of the existing `ticket-attachments` Zoho import route it was modeled on, at the cost of slightly higher latency for multi-attachment emails.
- **Minor** — `dompurify` was added as a new dependency not listed in the original Proposed File Changes (see Implementation Notes' Deviations for the full security rationale — reusing the codebase's existing non-sanitizing HTML helper would have shipped a stored-XSS hole against genuinely untrusted email content). Visible dependency-graph change; flagged here again because a quality gate should surface any new dependency, not just note it once during implementation.
- **Minor** — `adminClient`-for-writes in the status/notes routes vs. the task doc's Code Context sketch (see Implementation Notes) — verified this matches the codebase's actual dominant precedent (`PATCH /api/customers/[customerId]`) rather than being an ad hoc choice.
- No **Medium** or **Major** deviations. Nothing here violates a stated requirement, touches an Out-of-Scope item (Desk import, outbound email, Zoho webhook listener, customer-facing reply, Zia/Tags/reassignment/Resolution/Time-Entry, `ticket_number` external writes, DNS/MX), or changes architecture without it already being called out and justified in Implementation Notes.
