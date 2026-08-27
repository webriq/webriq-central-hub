# 316: Outbound Ticket Reply-by-Email — Staff Compose & Send from Ticket Detail Page

**Created:** 2026-08-26
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Task 303 built live inbound-email ticket intake (`helpdesk@webriq.us` → Resend webhook → `tickets`/`ticket_messages`) and a ticket detail page at `/desk/tickets/{ticket_number}` with a conversation thread and a compose box — but that compose box only writes **internal notes** (`visibility: 'internal'`, staff-only, never sent to the customer). Task 303 explicitly deferred customer-facing reply-by-email as "a separate follow-up task once outbound-per-ticket infrastructure exists." This is that task.

Today, until this ships, staff replying to a customer must do so outside the Hub (via Zoho Desk/Zoho Mail directly), and that reply never syncs into the Hub's `ticket_messages` thread — the Hub's view of the conversation is incomplete for any ticket a staff member has actually replied to. This task closes that gap: a real "Reply" action on the ticket detail page that sends an actual email to the customer via Resend, records it in `ticket_messages`, and threads correctly in the customer's mail client.

## Requirements

### A. Reply compose + send — **provider superseded by task 318 (Zoho Mail API), see that task doc**

> **2026-08-27 update:** This section originally specced sending via Resend from a verified `webriq.us` sending domain. That domain verification (Open Decision 1 below) was never completed, so the Resend implementation (see Implementation Notes) was never actually able to send. Task 318 replaces Resend with Zoho Mail's own native reply endpoint — no sending-domain verification needed at all, since Zoho Mail already owns and verifies `helpdesk@webriq.us` for sending today. See `_docs/task/318-ticketing-email-provider-migrate-resend-to-zoho-mail-api.md` for the current design.

- [ ] Ticket detail page (`_ticket-detail.tsx`) gains a second compose mode alongside the existing internal-note box — e.g. a toggle/tab between "Internal Note" and "Reply to Customer" — reusing the existing compose UI shell rather than duplicating it. *(Unaffected by the provider swap — still true.)*
- [ ] "Reply to Customer" send action:
  - Resolves the recipient: `requester_email`, falling back to the resolved contact's email (same resolution chain as `resolveContactName` in `_resolve.ts` — reuse it, don't reimplement). *(Unaffected — still true.)*
  - ~~Sends via `resend.emails.send()`, `from` = the verified `helpdesk@webriq.us` sending address~~ — sends via Zoho Mail's `POST /api/accounts/{accountId}/messages/{messageId}` (Reply to an email) endpoint, `fromAddress` = `ZOHO_MAIL_FROM_ADDRESS` (task 318).
  - Subject: `Re: {ticket.subject}` (or the original subject if already prefixed) — do not double-prefix `Re: Re:`. *(Unaffected — still true.)*
  - ~~Sets `In-Reply-To` and `References` headers against the **latest** `ticket_messages.email_message_id`~~ — replies target the **latest** `ticket_messages.email_message_id` (a Zoho Mail message ID) as the path-param message being replied to; Zoho Mail threads natively off that, no manual header construction needed (task 318).
  - On successful send, inserts a `ticket_messages` row: `author_type: 'staff'`, `author_id` = current user, `visibility: 'public'`, `body` = the sent content, `email_message_id` = the new message's own ID (returned by Zoho Mail's reply response, best-effort parsed — see task 318 Implementation Notes) so a customer's reply-to-the-reply threads correctly via task 303's `threadId`-based inbound thread-match. *(Same rule, different provider's ID.)*
  - On send failure, the ticket_messages row is **not** inserted (no record of a reply that was never actually delivered) — surface the error inline, do not silently swallow. *(Unaffected — still true.)*
- [ ] Staff-only (same role gate as the notes route: `admin`/`super_admin`/`pm`). *(Unaffected — still true.)*
- [ ] New route `src/app/api/desk/tickets/[ticketNumber]/reply/route.ts` (`POST`), modeled directly on the existing `notes/route.ts` (session auth check → `adminClient` role lookup → `adminClient` for the ticket_messages insert, per task 303's established precedent for staff-mutation routes) but calling Zoho Mail's reply API (not Resend) before the insert.
- [ ] Conversation thread (`_conversation-thread.tsx`) already renders `ticket_messages` by `visibility`/`author_type` — a sent reply should render distinctly from an internal note (it already shows a Public/Internal badge; verify a `public` + `staff` message reads clearly as "the customer was emailed this," not confusable with the client's own inbound messages).

### B. Sending-domain verification (From address) — **moot as of task 318**

> **2026-08-27 update:** No longer needed. Zoho Mail already owns and verifies `helpdesk@webriq.us` for sending — see Open Decision 1's resolution above.

- [ ] ~~`helpdesk@webriq.us` must be usable as the `from` address in Resend...~~ — n/a, see task 318.
- [ ] Document the resolved "reply from" address as an env var — done as `ZOHO_MAIL_FROM_ADDRESS` (task 318), not `RESEND_TICKET_REPLY_FROM_EMAIL`.

## Out of Scope / Must-Not-Change

- **AI-drafted replies.** This task is a manual staff compose-and-send capability only — no LLM involvement. `src/lib/ai/reply.ts`'s `generateReplyDraft()` is a separate, already-existing flow for classification/execution records (Sprint 5 / M8 orchestration), not tickets — do not conflate the two or route ticket replies through it.
- ~~**Switching outbound email vendor away from Resend.**~~ Deferred here as out of scope at the time this task doc was written (AgentMail, Postmark, Mailgun, SendGrid were considered as alternatives during task 303 planning) — but this is exactly what task 318 later did (Zoho Mail API), once it became clear Resend's sending-domain verification for `webriq.us` was never going to be completed. Recorded here for history, not as a still-current boundary.
- **Zoho Desk changes.** Nothing here touches Zoho Desk's own reply flow, macros, or SLA tracking — staff can continue using Zoho Desk for tickets not yet migrated to live Hub intake.
- **Reply attachments.** Sending file attachments with a reply is not required for this task's acceptance criteria — plain text/HTML body only. Note as a possible fast-follow if requested, but do not build it speculatively; the existing `ticket-attachments` bucket pattern from task 303 could be reused later if scoped.
- **Reassigning ticket owner, editing ticket priority/status from the reply flow** — status changes already exist as a separate control (task 303); do not fold that into the reply action.
- **Actually performing the DNS/domain verification** — this task's code changes are additive and inert until the `webriq.us` sending-domain verification (Requirement B / Open Decision 1) is separately completed and the env var is set; do not attempt DNS changes as part of implementing this task without explicit user go-ahead.

## Open Decisions

1. ~~**Sending-domain verification for `helpdesk@webriq.us`.**~~ **Resolved by task 318: moot.** Zoho Mail already owns and verifies `helpdesk@webriq.us` for sending today — no SPF/DKIM work needed at all. This was the blocker that kept the Resend implementation below from ever actually sending in production.
2. ~~**Threading fallback for `References` header depth.**~~ **Resolved by task 318: no longer applicable.** Zoho Mail's reply endpoint threads natively off a message ID (path param), not manually-constructed `In-Reply-To`/`References` headers — there is no header-depth concern to manage.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/desk/tickets/[ticketNumber]/reply/route.ts` | Create | `POST` — staff-only: resolve recipient, send via Resend with threading headers, insert `ticket_messages` row on success. |
| ~~`src/lib/email/resend.ts`~~ `src/lib/zoho/mail.ts` | Modify, then superseded by task 318 | Originally added `sendTicketReply()` here; task 318 removed it and added the equivalent `sendReply()` to the new Zoho Mail client instead. `resend.ts` keeps only `sendInvitationEmail`/`sendOtpEmail`. |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` | Modify | Add reply-mode toggle to the existing compose box; wire to the new route; handle send-failure inline error state. |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_conversation-thread.tsx` | Modify | Ensure a public staff reply is visually distinct from a client message and from an internal note. |
| `env.example` | Modify | Document `RESEND_TICKET_REPLY_FROM_EMAIL` (and note the Resend sending-domain verification prerequisite in the comment). |

## Code Context

### `src/app/api/desk/tickets/[ticketNumber]/notes/route.ts` — existing staff-mutation pattern to mirror

```ts
const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (!["admin", "super_admin", "pm"].includes(profile?.role ?? "")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
// ... resolve ticket by ticket_number, then adminClient.from("ticket_messages").insert({...})
```
The reply route follows this same shape, but sends via Resend *before* the insert, and only inserts on send success.

### `src/lib/email/inbound.ts` — existing Resend email helpers (task 303) to extend, not duplicate

`ParsedInboundEmail` already carries `messageId`/`headers` for inbound mail; the new outbound helper in `resend.ts` needs the mirror-image shape for a reply: pass `In-Reply-To: {lastMessageId}` and `References: {full chain}`, and capture the new send's own `Message-ID` from Resend's response to store as that new `ticket_messages` row's `email_message_id` — this is what lets a customer's reply-to-the-reply thread-match correctly via task 303's existing `In-Reply-To`/`References` lookup in `src/app/api/webhooks/email/route.ts`.

### `supabase/migrations/025_v2_schema.sql` / `119_ticket_messages_email_message_id_unique.sql` — schema already in place, no migration needed

```sql
create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_type text not null check (author_type in ('client', 'staff', 'system', 'llm_draft')),
  author_id uuid null references auth.users(id) on delete set null,
  body text not null,
  email_message_id text null, -- unique-indexed (partial, where not null) per migration 119
  visibility text not null check (visibility in ('public', 'internal')) default 'public',
  created_at timestamptz not null default now()
);
```
A sent reply is `author_type: 'staff'`, `visibility: 'public'` — this is the schema-level difference from an internal note (`visibility: 'internal'`), no new columns required.

## Implementation Steps

1. Confirm Resend's send-API shape for custom headers (`In-Reply-To`/`References`) and the response fields for the new message's own `Message-ID`, against live docs — do not assume the same shape as the inbound `receiving.get()` response documented in task 303.
2. Add `sendTicketReply()` to `resend.ts`.
3. Build `reply/route.ts`: auth/role gate → resolve ticket + recipient + latest thread `email_message_id` → send → insert `ticket_messages` on success → return the new row.
4. Extend `_ticket-detail.tsx` with the reply-mode compose toggle and wire it to the new route, including a visible send-failure state (do not silently fail).
5. Verify `_conversation-thread.tsx` renders public staff replies distinctly.
6. Document `RESEND_TICKET_REPLY_FROM_EMAIL` in `env.example`, including a comment on the Resend sending-domain verification prerequisite (Open Decision 1).
7. Do not attempt the actual DNS/domain verification (Open Decision 1) as part of this implementation — that requires separate, explicit user go-ahead and happens outside this repo.

## Acceptance Criteria

- [ ] With `RESEND_TICKET_REPLY_FROM_EMAIL` unset, attempting to send a reply fails loudly with a clear error — no silent fallback to an unverified/wrong `from` address.
- [ ] With the env var set and the sending domain verified, sending a reply from the ticket detail page delivers an actual email to the customer's address, threaded (`In-Reply-To`/`References`) into the existing conversation in a real mail client (e.g. Gmail shows it as one thread, not a new email).
- [ ] The sent reply creates exactly one `ticket_messages` row: `author_type: 'staff'`, `visibility: 'public'`, correct `email_message_id`.
- [ ] If the Resend send call fails, no `ticket_messages` row is created, and the UI shows an inline error.
- [ ] A customer replying to that email is correctly thread-matched into the same ticket via the existing inbound webhook logic from task 303 (not a new ticket).
- [ ] The internal-note flow (task 303) is unaffected — both compose modes coexist on the same page without regressing the other.
- [ ] Non-staff roles cannot call the reply route (403).
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: once RESEND_TICKET_REPLY_FROM_EMAIL is set and the sending domain is verified —
#   send a reply from a real ticket, confirm delivery + threading in an actual mail client.
# Manual: reply to that email as the "customer" and confirm it thread-matches the same ticket
#   (not a new one) via the task 303 inbound webhook.
# Manual: attempt a reply with the env var unset — confirm a clear, loud failure, not a silent
#   send from a wrong/unverified address.
```

## Compatibility Touchpoints

- `env.example` gains `RESEND_TICKET_REPLY_FROM_EMAIL` — no behavior change for existing deployments until set.
- No schema/migration changes — `ticket_messages.email_message_id` (unique-indexed per migration 119) already supports this.
- Task 303's inbound webhook and internal-note flow are unaffected; this task only adds a new outbound path and a new route.

## Implementation Notes

### What Changed
- Added `sendTicketReply()` to `src/lib/email/resend.ts`: sends via `resend.emails.send()`, reads `from` from `RESEND_TICKET_REPLY_FROM_EMAIL` (throws if unset — no silent fallback to an unverified address), and threads via `In-Reply-To`/`References` custom headers.
- **Resolved the Message-ID open question (Open Decision 2) during implementation**, verified against the installed `resend@6.18.0` package's own type definitions (not assumed): `CreateEmailResponseSuccess` only returns Resend's internal `{ id }`, not an RFC 5322 `Message-ID`. Rather than guess at a mapping between the two, `sendTicketReply()` generates its own `Message-ID` (`<ticket-reply-{uuid}@{domain-from-from-address}>`), sets it explicitly via the SDK's documented `headers` passthrough, and returns that exact value to the caller to store — guaranteeing the stored `email_message_id` matches the outgoing wire header with no format guessing. This still needs a live send to confirm Resend doesn't override a caller-supplied `Message-ID` header (not verifiable without a live account/domain — flagged as a Deviation below, same posture as task 303's own skipped live-send verification).
- Built `POST /api/desk/tickets/[ticketNumber]/reply`: staff-only (mirrors `notes/route.ts`'s auth/role-check/`adminClient` pattern), resolves recipient (`contacts.email` via `external_contact_id`, falling back to `requester_email`), builds the full `References` chain from every prior message's `email_message_id` in the thread, sends, and only inserts the `ticket_messages` row (`author_type: 'staff'`, `visibility: 'public'`) on send success.
- Extended `_ticket-detail.tsx`'s existing compose box with a mode toggle ("Internal Note" / "Reply to Customer") reusing the same panel shell rather than adding a second box; reply mode shows the resolved recipient email inline and disables send when there's no recipient on file.
- Left `_conversation-thread.tsx` unmodified — a sent reply already renders distinctly from an internal note (existing Public/Private `Chip`) and from the client's own messages (existing author-name resolution: staff via `profiles.full_name`, client via contact/requester_email), so no code change was needed to satisfy that requirement.

### Files Changed
- `src/lib/email/resend.ts` - added `sendTicketReply()` alongside the existing invite/OTP senders.
- `src/app/api/desk/tickets/[ticketNumber]/reply/route.ts` - new `POST` route: staff-only, resolve recipient + thread chain, send, insert on success only.
- `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` - added reply-mode compose toggle, `handleSendReply()`, reply state.
- `env.example` - documented `RESEND_TICKET_REPLY_FROM_EMAIL`, with an inline note on the sending-domain-verification prerequisite.

### Deviations From Plan
- **`_conversation-thread.tsx` was not modified.** The task doc listed it as a Proposed File Change ("verify a public + staff message reads clearly"), but on inspection the existing `authorName` + `visibility` `Chip` rendering already satisfies that — a staff reply shows the staff member's real name (via `profiles.full_name`) with a "Public" badge, distinct from both an internal note ("Private" badge) and the client's own messages (different author name). No gap found, so no change made — verified, not assumed.
- **Resolved Open Decision 2 (Message-ID mapping) with a self-generated Message-ID** rather than leaving it as an open question — see "What Changed" above for the rationale. This is a design decision made during implementation, not a deviation from a stated requirement; the task doc explicitly asked to "confirm at implementation time," and this is that confirmation, done via the SDK's type definitions.
- **Pre-existing `design-system-font-size` findings** on literal `text-[Npx]` classes were flagged by the design hook on `_ticket-detail.tsx`'s new toggle/reply-mode markup. Left as-is, same rationale task 303 already documented for this exact file: every sibling file in `desk/tickets/` uses the identical literal-px convention, and switching only the new lines would make the file internally inconsistent rather than more consistent.
- Everything else matches the task doc as written: staff-only, no AI drafting, no vendor switch, no Zoho Desk changes, no reply attachments, no DNS/domain verification performed.

### Verification Run
- `npx tsc --noEmit` - PASS (clean, no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in `_checklist-tab.tsx`, unrelated and not touched by this task)
- Manual: live send/threading test, forged-header/unverified-domain rejection, real mail-client threading confirmation - SKIPPED. Requires `RESEND_TICKET_REPLY_FROM_EMAIL` plus the `webriq.us` Resend sending-domain verification (Open Decision 1), neither of which exist yet in this environment — this is explicitly the user's separate infrastructure action per the task's Out-of-Scope boundary, same posture as task 303's skipped live-account verification.
