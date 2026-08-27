# 318: Migrate Ticketing Email Provider — Resend → Zoho Mail API (Supersedes Tasks 303 & 316's Email Layer)

**Created:** 2026-08-27
**Priority:** HIGH
**Type:** refactor
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Tasks 303 (inbound email ticketing) and 316 (outbound ticket reply-by-email) were built against Resend: an inbound-receiving webhook fed by a Zoho Mail forwarding rule (303), and an outbound send via Resend's API from a `webriq.us` sending address (316). Both are implemented and in "Testing" status, but **neither is actually live** — 303 is blocked on Resend receiving-domain verification + the Zoho Mail forwarding rule (never configured), and 316 is explicitly blocked on its own Open Decision 1: `webriq.us` was never verified as a *sending* domain in Resend, so `sendTicketReply()` cannot send at all yet. 316's implementation also had to self-generate an RFC `Message-ID` because Resend's send response never returns one (`CreateEmailResponseSuccess` only returns an internal `id` — verified against the installed `resend@6.18.0` types), an unverified assumption flagged in that task's own Implementation Notes.

`helpdesk@webriq.us` already lives in Zoho Mail today, already sends and receives real mail with no additional domain work, and the team has decided Zoho Mail (unlike Zoho Desk) stays long-term. This task replaces the Resend-specific transport in 303 and 316 with the Zoho Mail REST API — polling `GET /api/accounts/{accountId}/messages` for inbound, and `POST /api/accounts/{accountId}/messages/{messageId}` (native reply-threading) for outbound — while leaving the `tickets`/`ticket_messages` schema, the ticket detail page, and all UI from 303/316 completely untouched. Because nothing on either Resend path is live in production yet, this is a clean swap, not a migration of running infrastructure.

## Requirements

### A. Inbound — replace Resend webhook with Zoho Mail polling

- [ ] New cron-triggered route polling `GET /api/accounts/{accountId}/messages` (Zoho Mail Email Messages API) for the Inbox folder holding `helpdesk@webriq.us` mail — same cron-auth pattern as `/api/digest`/`/api/kb/lint` (`x-cron-secret` header matching `CRONJOB_SECRET_KEY`, or a valid user session).
- [ ] Cursor-based dedupe keyed on Zoho Mail's own message ID/received timestamp — **not** read/unread state, since Zoho Desk's own independent polling of the same mailbox may flip read status without this task's involvement.
- [ ] For each new message: fetch full detail (body/headers) to extract From, Subject, Message-ID, In-Reply-To/References headers, body (text/HTML), and attachment references.
- [ ] Same thread-match / create-or-append / `contacts.email` → `customer_id` resolution / attachment-storage logic as 303's original Requirements A — only the transport (poll vs. webhook) and payload parsing change. `ticket_messages.email_message_id`'s unique index (migration 119) remains the dedupe mechanism, now keyed on Zoho Mail's message ID instead of Resend's.
- [ ] pg_cron schedule — confirm interval against actual Zoho Mail API rate/credit limits at implementation time (not published in what was checked during planning; verify live, do not assume a number).

### B. Outbound — replace Resend send with Zoho Mail reply

- [ ] Replace `sendTicketReply()` (currently in `resend.ts`) with a Zoho Mail equivalent calling `POST /api/accounts/{accountId}/messages/{messageId}` (Reply to an email) against the specific thread message being answered — this threads natively via Zoho Mail's own mechanism, eliminating 316's self-generated `Message-ID` workaround entirely.
- [ ] Store the reply's own message ID (returned by the API — confirm exact field at implementation time) as the new `ticket_messages.email_message_id`, preserving thread-match continuity for a customer's reply-to-the-reply.
- [ ] Same route contract as 316's original Requirements A: `POST /api/desk/tickets/[ticketNumber]/reply`, staff-only (`admin`/`super_admin`/`pm`), `ticket_messages` row inserted only on send success, recipient resolved via the existing `_resolve.ts` chain.
- [ ] Confirm whether Zoho Mail's reply endpoint threads off the *original* inbound message or the *latest* message in the thread — determines whether a "find latest Zoho-Mail-keyed message in this ticket" lookup is needed (mirrors 316's current `References`-chain logic, simplified if Zoho Mail only needs the immediate parent).

### C. Auth & config

- [ ] New Zoho OAuth scope(s) for Mail (`ZohoMail.messages.ALL` at minimum, or split READ/CREATE — confirm minimal set at implementation time).
- [ ] **Dedicated `ZOHO_MAIL_REFRESH_TOKEN`**, separate from the existing `ZOHO_REFRESH_TOKEN` shared by Projects/Desk. `env.example` already documents that adding a scope to the existing client requires regenerating its refresh token (task 117 precedent) — isolating Mail's token avoids re-touching the already-working Projects/Desk integration.
- [ ] New `getZohoMailAccessToken()` in a new `src/lib/zoho/mail.ts`, mirroring the token-cache pattern in `src/lib/zoho/index.ts`'s `getZohoAccessToken()` (1hr cache, de-duped in-flight refresh).
- [ ] `accountId` (Zoho Mail's internal ID for the `helpdesk@webriq.us` mailbox) and the Inbox `folderId` are static per-mailbox values — resolve once during setup (`GET /api/accounts`, `GET /api/accounts/{accountId}/folders`) and store as env vars rather than re-resolving on every poll.

## Out of Scope / Must-Not-Change

- `tickets`/`ticket_messages` schema, RLS, and the `email_message_id` unique index (migration 119) — this is a transport-layer swap only, no schema change.
- Ticket detail page, conversation thread UI, internal-note flow, status route (all of 303's Requirement B) — untouched; they read/write `ticket_messages` regardless of which provider populated it.
- Attachment storage (`ticket-attachments` bucket, `attachments` table) — untouched; only the source of the attachment bytes changes.
- Zoho Desk's own independent email-to-ticket conversion on the same mailbox — unaffected. Desk and the Hub read `helpdesk@webriq.us` in parallel until Desk is separately decommissioned, exactly as 303 already established.
- Any DNS/MX/domain-verification work on `webriq.us` — not needed for this task at all; that's the reason for doing it. No Resend receiving-subdomain setup, no Resend sending-domain SPF/DKIM.
- `resend.ts`'s `sendInvitationEmail`/`sendOtpEmail` and the `RESEND_API_KEY`/`RESEND_FROM_EMAIL` vars — unrelated to ticketing, unaffected.
- Task 302 (historical Desk-ticket import) and task 304 (Desk-threads import) — different data path entirely, no overlap.

## Open Decisions

1. **Poll interval and Zoho Mail API rate/credit limits** — not confirmed against live docs during planning. Verify before fixing a `pg_cron` schedule; same "verify against live docs, don't assume" discipline 303/316 already applied to Resend.
2. **Reply-threading target** (original message vs. latest-in-thread) — confirm against live Zoho Mail API docs before finalizing the reply route's message lookup.
3. **OAuth client scoping** — confirm whether Zoho Mail scopes can be added to the existing API Console client (issuing a second, separate refresh token) or require registering a distinct client. Either way, keep the resulting refresh token dedicated to Mail (see Requirement C).
4. **Sequencing vs. 303/316's Testing status** — since neither Resend path is actually live (no forwarding rule configured, no sending domain verified), this task can replace their email-integration files outright with no cutover risk. No customer-facing ticket flow exists yet to disrupt.

## Proposed File Changes

| File | Action | Purpose |
|---|---|---|
| `src/lib/zoho/mail.ts` | Create | Zoho Mail API client: `getZohoMailAccessToken()`, `listNewMessages(cursor)`, `getMessageDetail(messageId)`, `sendReply(messageId, body)`, attachment download helper. |
| `src/lib/email/inbound.ts` | Modify | Replace Resend-specific parsing (`fetchReceivedEmail`, Svix verification) with Zoho Mail message-detail parsing; preserve the same normalized output shape (`{from, subject, textBody, htmlBody, messageId, inReplyTo, references, attachments}`) so downstream logic in the poll route needs minimal change. |
| `src/app/api/webhooks/email/route.ts` → `src/app/api/cron/email-poll/route.ts` | Rename/Replace | Convert from a Resend-signature-verified webhook receiver to a cron-secret-gated poller (mirrors `/api/digest`); same thread-match/create-or-append/attachment logic as 303, new trigger mechanism and cursor advance. |
| `src/lib/email/resend.ts` | Modify | Remove `sendTicketReply()` (superseded by `src/lib/zoho/mail.ts`'s `sendReply()`); leave `sendInvitationEmail`/`sendOtpEmail` untouched. |
| `src/app/api/desk/tickets/[ticketNumber]/reply/route.ts` | Modify | Call `sendReply()` from `src/lib/zoho/mail.ts` instead of `sendTicketReply()` from `resend.ts`; same auth/role-gate/insert-on-success contract as 316. |
| `supabase/migrations/{next}_email_poll_cursor.sql` | Create | Persist the last-processed Zoho Mail message ID/timestamp across cron runs. Confirm at implementation time whether a generic settings/key-value table already exists to reuse before adding a new one. |
| `env.example` | Modify | Remove `RESEND_INBOUND_WEBHOOK_SECRET`/`RESEND_TICKET_REPLY_FROM_EMAIL` (ticketing-specific, retired); add `ZOHO_MAIL_REFRESH_TOKEN`, `ZOHO_MAIL_ACCOUNT_ID`, `ZOHO_MAIL_INBOX_FOLDER_ID`, `ZOHO_MAIL_API_BASE_URL`. Reuses the existing `ZOHO_CLIENT_ID`/`ZOHO_CLIENT_SECRET` (no separate Mail client — Zoho allows only one Self Client per account). `RESEND_API_KEY`/`RESEND_FROM_EMAIL` stay (still used for invite/OTP). |
| `_docs/task/303-inbound-email-ticketing-helpdesk-webriq-services.md` | Modify | Update Requirements A, Open Decision 1, and Proposed File Changes to reference this task's Zoho Mail polling design instead of Resend; Requirement B (Ticket Detail Page) stays as-is — already implemented and provider-agnostic. |
| `_docs/task/316-outbound-ticket-reply-by-email.md` | Modify | Update Requirements A and Open Decision 1 to reference Zoho Mail's reply endpoint instead of Resend send; note Requirement B's sending-domain-verification blocker is now moot. |

## Code Context

### `src/lib/zoho/index.ts` — token-cache pattern to mirror for the new Mail client

```ts
// getZohoAccessToken(): 1hr in-memory cache + de-duped in-flight refresh promise,
// reads ZOHO_CLIENT_ID/ZOHO_CLIENT_SECRET/ZOHO_REFRESH_TOKEN, POSTs to
// https://accounts.zoho.com/oauth/v2/token with grant_type=refresh_token.
// getZohoMailAccessToken() follows the identical shape, reading the Mail-specific
// env vars instead (Requirement C / Open Decision 3 on token separation).
```

### `env.example` — Resend ticketing vars being retired vs. kept

```
# ─── Email (Resend) ────────────────────────────────────────────────────────────
RESEND_API_KEY=                     # KEEP — still used by sendInvitationEmail/sendOtpEmail
RESEND_FROM_EMAIL=                  # KEEP — same as above
RESEND_INBOUND_WEBHOOK_SECRET=      # RETIRE — inbound moves to Zoho Mail polling
RESEND_TICKET_REPLY_FROM_EMAIL=     # RETIRE — outbound moves to Zoho Mail reply API
```

### Cron-auth pattern to mirror (per CLAUDE.md, `/api/digest` etc.)

```ts
// Every cron-triggered route accepts either an x-cron-secret header (pg_cron) or a
// valid user session; secret must match CRONJOB_SECRET_KEY. The new
// /api/cron/email-poll route follows this exact pattern instead of Resend's
// Svix webhook-signature verification (there is no inbound webhook anymore).
```

### `supabase/migrations/119_ticket_messages_email_message_id_unique.sql` — unchanged, still the dedupe key

```sql
-- Partial unique index on ticket_messages.email_message_id, where not null.
-- Still the correct dedupe mechanism for polling: Zoho Mail's own message ID
-- replaces Resend's email_id in this column. No schema change needed.
```

## Implementation Steps

1. Complete the Zoho API Console setup and env var collection (see hand-off notes — user action, not code; summarized separately for the user).
2. Verify live Zoho Mail API docs for: exact response shape of "Get list of emails in a folder," whether the message-list/detail response includes raw headers (In-Reply-To/References) or requires a separate call, the "Reply to an email" response shape (does it return a message ID to store?), and any published rate/credit limits. Do not build against assumptions (Open Decisions 1–2).
3. Build `src/lib/zoho/mail.ts`: token helper, `listNewMessages(sinceCursor)`, `getMessageDetail(messageId)`, `sendReply(messageId, body)`, attachment download.
4. Build the poll-cursor migration and read/write helpers.
5. Convert `src/app/api/webhooks/email/route.ts` → `src/app/api/cron/email-poll/route.ts`: cron-secret gate → poll → parse → thread-match/create-or-append → attachments → advance cursor. Reuse as much of 303's existing create-or-append/customer-resolution logic as possible — only the fetch/parse layer changes.
6. Update `src/app/api/desk/tickets/[ticketNumber]/reply/route.ts` to call the new `sendReply()`.
7. Remove `sendTicketReply()` from `resend.ts`.
8. Register the `pg_cron` schedule for the new poll route (interval per Open Decision 1).
9. Update `env.example` — remove retired Resend ticketing vars, add Zoho Mail vars.
10. Update task docs 303 and 316's Requirements/Open Decisions/Proposed File Changes sections to reference this design instead of Resend, keeping both as accurate historical records.

## Acceptance Criteria

- [ ] Sending a fresh email to `helpdesk@webriq.us` is picked up by the next poll cycle and creates exactly one `tickets` row + one `ticket_messages` row (matches 303's original criteria).
- [ ] Replying to that thread appends to the same ticket, not a new one.
- [ ] Re-running the poll (overlapping cron invocation, or a re-run after a crash) does not create duplicate `ticket_messages` rows.
- [ ] A staff "Reply to Customer" send delivers via Zoho Mail, threads correctly in a real mail client, and inserts exactly one `ticket_messages` row only on send success (matches 316's original criteria).
- [ ] A customer replying to that Zoho-Mail-sent reply thread-matches into the same ticket on the next poll.
- [ ] With Zoho Mail OAuth env vars unset/misconfigured, both the poll route and the reply route fail loudly (logged error), never silently no-op or crash the cron schedule.
- [ ] `npx tsc --noEmit` passes.
- [ ] `sendInvitationEmail`/`sendOtpEmail` (Resend) continue to work unmodified.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: send a test email to helpdesk@webriq.us, wait one poll interval, confirm
#   tickets/ticket_messages rows in Supabase.
# Manual: reply from the ticket detail page, confirm delivery + threading in a real mail client.
# Manual: reply to that email as the "customer," confirm thread-match on the next poll.
# Manual: temporarily unset ZOHO_MAIL_REFRESH_TOKEN, confirm loud failure, not a silent skip.
```

## Compatibility Touchpoints

- `env.example` loses two Resend ticketing vars, gains ~6 Zoho Mail vars — no behavior change for existing deployments until the new vars are set, same "additive until configured" posture as 303/316.
- `RESEND_API_KEY`/`RESEND_FROM_EMAIL` and the invite/OTP send path are completely unaffected.
- Task 302 (historical Desk-ticket import) and task 304 (Desk-threads import) are unaffected — different data source, no overlap with this task's live-poll mechanism.
- Zoho Desk's own independent email-to-ticket conversion on the same mailbox is unaffected — both systems read `helpdesk@webriq.us` in parallel until Desk is separately decommissioned (a later, explicit, out-of-scope step).

## Implementation Notes

### What Changed
- Built `src/lib/zoho/mail.ts`: `getZohoMailAccessToken()` (mirrors `src/lib/zoho/index.ts`'s token-cache pattern with an isolated Mail-specific refresh token), a thin `zohoMailFetch()` retry wrapper (401 → force-refresh-and-retry, 429 → respect `Retry-After`), `listNewMessages()`, `getMessageDetail()`, `downloadAttachment()`, and `sendReply()`. Confirmed live against Zoho Mail's public API docs (fetched during implementation, not assumed): List Emails (`GET /api/accounts/{accountId}/messages/view?folderId=...`), Get Email Content (`GET /api/accounts/{accountId}/folders/{folderId}/messages/{messageId}/content`), and Reply to an Email (`POST /api/accounts/{accountId}/messages/{messageId}` with `action: "reply"`) — request/response shapes and the `https://mail.zoho.com` base host are all doc-confirmed.
- **Design change beyond the task doc's original Requirement A**: thread-matching uses Zoho Mail's own `threadId` (present on every message in the List Emails response) instead of parsing `In-Reply-To`/`References` headers. This is simpler and more reliable than the Resend-era approach and was only discovered to be viable after reading Zoho's live docs during implementation — the task doc's Requirements A/B anticipated needing header parsing (mirroring 303's original design) but this turned out to be unnecessary. `tickets.zoho_mail_thread_id` (migration 122) stores it.
- Rewrote `src/lib/email/inbound.ts` as a thin normalizer (`toParsedInboundEmail()`) over `src/lib/zoho/mail.ts`, replacing the Resend/Svix-specific parsing entirely.
- Replaced `src/app/api/webhooks/email/route.ts` (Resend webhook) with `src/app/api/cron/email-poll/route.ts` (cron-secret-gated poller, same auth pattern as `/api/digest`). Per-message idempotency via `ticket_messages.email_message_id` (now a Zoho Mail message ID) unchanged from 303's original design; the poll cursor (`email_poll_cursor` table) advances only after a message is successfully processed, so a mid-batch failure doesn't skip anything on the next run.
- Removed `sendTicketReply()` from `src/lib/email/resend.ts` (left `sendInvitationEmail`/`sendOtpEmail` untouched); updated `src/app/api/desk/tickets/[ticketNumber]/reply/route.ts` to call the new `sendReply()`, replying against the latest `ticket_messages.email_message_id` in the thread via Zoho Mail's native reply-by-message-ID mechanism instead of manually constructed threading headers.
- Added migration 122: `tickets.zoho_mail_thread_id` column + index, `email_poll_cursor` table (+ RLS), and `ticket-email-poll` pg_cron registration (mirrors migration 078's Vault-secret pattern exactly).
- Updated `env.example`: removed `RESEND_INBOUND_WEBHOOK_SECRET`/`RESEND_TICKET_REPLY_FROM_EMAIL`, added `ZOHO_MAIL_REFRESH_TOKEN`/`ZOHO_MAIL_ACCOUNT_ID`/`ZOHO_MAIL_INBOX_FOLDER_ID`/`ZOHO_MAIL_API_BASE_URL`/`ZOHO_MAIL_FROM_ADDRESS` (the last one not anticipated in the task doc's Proposed File Changes — see Deviations).
- **Post-Testing correction (during live Zoho API Console setup):** the real helpdesk mailbox is `helpdesk@webriq.us`, not `webriq.services` as this task doc and 303/316 originally assumed throughout — corrected across all three task docs, `env.example`, `src/lib/zoho/mail.ts`, and `_conversation-thread.tsx`'s one code comment. `webriq.services` itself is not wrong in general — it's genuinely used elsewhere in this codebase for individual staff email addresses (e.g. migration 046) — it was specifically wrong as the *helpdesk ticketing mailbox's* domain.
- **Post-Testing bug fix (found via live testing): `tickets.zoho_mail_thread_id` was `null` on every ticket, including freshly-created ones.** Root cause, confirmed against live Zoho Mail API responses: Zoho only assigns a `threadId` to a message once a reply actually exists on it — a brand-new, never-replied-to message has no `threadId` field in the List Emails response at all. Once a thread does form, Zoho retroactively sets the *original* message's `threadId` equal to its own `messageId` (confirmed: a real message showed `messageId` and `threadId` as the identical value once it had a reply, and the reply itself carried that same value as its `threadId`). Since our code stored whatever `threadId` Zoho gave at ingest time, every ticket's first message (no `threadId` yet) got `zoho_mail_thread_id: null` — and a later reply's real `threadId` (= the original's `messageId`) would never match that `null`, silently creating a duplicate ticket instead of appending to the existing conversation. **Fixed** two ways: (1) `listNewMessages()` in `src/lib/zoho/mail.ts` now defaults `threadId: r.threadId || r.messageId`, so every ticket is seeded with the value a future reply's `threadId` will actually equal; (2) `processMessage()` in the poll route adds a fallback lookup — if no ticket matches by `zoho_mail_thread_id`, check whether `email.threadId` matches an existing `ticket_messages.email_message_id` (the root message), and backfill the ticket's `zoho_mail_thread_id` when found. This also self-heals the 3 real tickets already created with `null` (#568/#569/#570) the next time a reply lands on any of them, with no manual data fix required — though a proactive one-time backfill is possible too (`update tickets set zoho_mail_thread_id = (select email_message_id from ticket_messages where ticket_id = tickets.id order by created_at asc limit 1) where zoho_mail_thread_id is null and channel = 'email';`).
- **Post-Testing correction: dropped `ZOHO_MAIL_CLIENT_ID`/`ZOHO_MAIL_CLIENT_SECRET` as separate env vars.** Discovered during live setup that Zoho allows only one Self Client per account, so the Mail refresh token had to be minted from the *same* Self Client already backing `ZOHO_CLIENT_ID`/`ZOHO_CLIENT_SECRET` — a second pair of client env vars would just be a duplicate value, a drift risk on rotation. `getZohoMailAccessToken()` in `src/lib/zoho/mail.ts` now reads `ZOHO_CLIENT_ID`/`ZOHO_CLIENT_SECRET` directly; only `ZOHO_MAIL_REFRESH_TOKEN` is a genuinely new, Mail-specific credential.
- Updated task docs 303 and 316 in place (strikethrough + inline notes on superseded sections) rather than deleting their original Resend-era content, per this repo's convention of task docs as historical records.
- Updated `src/types/database.ts` (`tickets.zoho_mail_thread_id`, new `email_poll_cursor` table) since migration 122 is written but not yet applied to the remote database — same "types updated ahead of a manually-applied migration" precedent as prior tasks.

### Files Changed
- `src/lib/zoho/mail.ts` - new Zoho Mail API client.
- `src/lib/email/inbound.ts` - rewritten as a Zoho Mail normalizer (was Resend-specific).
- `src/app/api/cron/email-poll/route.ts` - new cron poller, replaces `src/app/api/webhooks/email/route.ts` (deleted).
- `src/lib/email/resend.ts` - `sendTicketReply()` removed.
- `src/app/api/desk/tickets/[ticketNumber]/reply/route.ts` - calls `sendReply()` from `src/lib/zoho/mail.ts` instead of `resend.ts`; reply-target resolution changed from a `References` chain to "latest `email_message_id`".
- `supabase/migrations/122_ticketing_zoho_mail_migration.sql` - new: `tickets.zoho_mail_thread_id`, `email_poll_cursor` table + RLS, `ticket-email-poll` cron job.
- `src/types/database.ts` - `tickets.zoho_mail_thread_id` added to Row/Insert/Update; new `email_poll_cursor` table type.
- `env.example` - Resend ticketing vars retired, Zoho Mail ticketing vars added.
- `_docs/task/303-inbound-email-ticketing-helpdesk-webriq-services.md` / `_docs/task/316-outbound-ticket-reply-by-email.md` - annotated in place to point at this task.

### Deviations From Plan
- **Thread-matching via `threadId` instead of header parsing** (see What Changed) — a genuine design improvement discovered during live-doc verification, not anticipated in the original Requirements A/B wording. Net effect: less code, no header-parsing edge cases, more reliable than the Resend-era design it replaces.
- **Added `ZOHO_MAIL_FROM_ADDRESS`**, not listed in the task doc's Proposed File Changes. Needed because Zoho Mail's send/reply API requires an explicit `fromAddress` field distinct from the numeric `ZOHO_MAIL_ACCOUNT_ID` — there was no existing env var carrying the mailbox's literal address.
- **`getMessageDetail()`'s response field names and `downloadAttachment()`'s endpoint are unverified against a live account** — the Get Email Content endpoint URL is doc-confirmed, but exact JSON field names for body/attachments were not available from public docs, and no public doc page was found at all for attachment download (modeled on the nested-resource pattern every other confirmed endpoint uses). Both are implemented defensively (multiple fallback field names, non-fatal per-attachment failure) and flagged prominently in `src/lib/zoho/mail.ts`'s file header — same posture as task 316's own unverified Resend `Message-ID` passthrough assumption. **Requires a live Zoho Mail account/message to confirm before relying on this in production.**
- **Published Zoho Mail API rate/credit limits were not found** during planning or implementation (Open Decision 1, unresolved) — the `*/5 * * * *` cron interval in migration 122 is a reasonable default matching this repo's other cron cadences, not a limit-verified number. Revisit if Zoho Mail throttles the poll.
- **List Emails has no server-side "since" filter** — `listNewMessages()` fetches the most recent 50 messages and filters client-side against the stored cursor. A backlog larger than 50 unprocessed messages between polls would be missed. Acceptable for a helpdesk mailbox's expected volume; flagged in the file's code comment as a design limitation to revisit if that assumption breaks.
- File sizes reviewed against the requested `nextjs-file-length-best-practices.md`: `src/lib/zoho/mail.ts` (266 lines) exceeds the 150-line "utility file" guideline but stays under the 400-500 hard limit and mirrors this repo's own precedent (`src/lib/zoho/index.ts`, 806 lines, same single-responsibility "one provider's API surface" shape) — splitting it (e.g. token logic into its own file) would fragment a cohesive module for no testability/readability gain, so it was kept as one file per the guide's own "real test" heuristic. `src/app/api/cron/email-poll/route.ts` (175 lines) is comparable to the 199-line webhook route it replaces (which passed 303's own quality gate at that size) — the per-message pipeline is a single linear sequence with guard clauses, not deep nesting.
- No **Major** deviations. Nothing here changes the `tickets`/`ticket_messages` schema shape beyond the one additive column the task doc anticipated, touches the ticket detail page/UI, or reintroduces a Resend dependency for ticketing.

### Verification Run
- `npx tsc --noEmit` - PASS (clean, no errors; required clearing a stale `.next/` build cache that still referenced the deleted `src/app/api/webhooks/email/route.ts`)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in `_checklist-tab.tsx`, unrelated and not touched by this task — same warnings tasks 303/316 already noted)
- Manual: send a test email to `helpdesk@webriq.us`, confirm poll picks it up; staff reply from the ticket detail page; customer reply-to-a-reply thread-match; unset `ZOHO_MAIL_REFRESH_TOKEN` and confirm loud failure - **SKIPPED**. Requires the Zoho API Console setup (OAuth client, scopes, `accountId`/`folderId` lookups) and all `ZOHO_MAIL_*` env vars, none of which exist yet in this environment — this is the user's own infrastructure setup step (see the hand-off notes given alongside the task-318 plan), same posture as 303/316's own skipped live-provider verification.
- Migration `122_ticketing_zoho_mail_migration.sql` - written but **not applied** to the remote database — user applies manually, same precedent as every other recent migration in this repo.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation across the 9 changed/new files — `pnpm lint` clean (0 errors; the 2 pre-existing warnings in `_checklist-tab.tsx` are unrelated, already noted by tasks 303/316).
- `npx tsc --noEmit` clean, re-verified after the fix made during this pass (see Deviations).
- Error handling is intentional throughout: the poll route only advances its cursor after a successful per-message process (a failure retries next run, made safe by `email_message_id`'s unique index), the reply route fails loudly on missing config or send failure and distinguishes "sent but not recorded" from "never sent" in its error message, and every attachment operation is a non-fatal per-item try/catch (log + skip) rather than aborting the whole message.
- No secrets, credentials, or raw tokens logged anywhere — only structured `console.error`/`console.warn` with ids, matching the existing webhook/cron routes' logging style.
- Naming is accurate (`listNewMessages`, `getMessageDetail`, `sendReply`, `downloadAttachment`, `processMessage` all do exactly what they say) and each function stays single-purpose.
- `json` response bodies in `src/lib/zoho/mail.ts` are read without an intermediate typed interface (unlike e.g. `src/app/api/webhooks/route.ts`'s `ZohoPayload` cast) — left this way deliberately: the file's own header already flags that several response field names are unverified against a live account, and adding a typed interface would overstate confidence in a shape that hasn't actually been confirmed. Revisit once live-verified.

### Deviations

- **Medium — found and fixed during this pass.** `tickets.zoho_mail_thread_id` was originally a plain (non-unique) partial index. Concurrent or overlapping poll invocations (e.g. a slow Zoho API response causing the next cron tick to start before the previous run finishes) could both see "no ticket for this threadId" and both insert, splitting one email conversation across two tickets — no DB-level safety net, unlike `ticket_messages.email_message_id`'s unique index (migration 119) which already guards the equivalent message-level race. Fixed by making it a unique partial index (migration 122) — the failure scenario for this exact class of bug: two `POST /api/cron/email-poll` invocations overlap, both process a new message on a never-before-seen thread, both find `existingTicket` null, both attempt to insert a `tickets` row with the same `zoho_mail_thread_id` — without the unique constraint, both succeed and the thread is now split across two ticket rows with future replies landing unpredictably on whichever one a later lookup happens to match first.
- **Medium — documented, not fixed (judgment call, not a defect).** The poll cursor starts `null`, so the very first poll run backfills up to the 50 most-recent messages already sitting in the Inbox as brand-new tickets — including mail that predates this feature and may already be a Zoho Desk ticket or part of the task 302/304 historical import. Left as-is because "backfill on first activation" vs. "start fresh from now()" is a product decision the task doc didn't specify, not a bug to silently resolve either way. Migration 122 documents the one-line SQL to seed the cursor to "now" first, if backfill is unwanted — same one-time-cutover-care posture as task 303's own Open Decision 4.
- **Minor.** `getMessageDetail()`'s attachment field extraction (`a.attachmentId ?? a.storeName ?? ""`) can produce an empty-string `attachmentId` if a live response uses neither guessed field name, which would make `attachments.external_id` empty across every affected attachment and risk an incorrect `onConflict: "external_id"` upsert match between unrelated messages' attachments. Not fixed — this is a direct, narrower consequence of the same "field names unverified" uncertainty already prominently flagged in the file header and Implementation Notes; a real fix requires the actual live response shape, not a guess layered on a guess.
- No **Major** deviations. Nothing here violates a stated requirement, touches the ticket detail page/UI, changes the `tickets`/`ticket_messages` schema beyond the one additive column the task doc anticipated, or reintroduces a Resend dependency for ticketing.

### Completion Note

Marked **Completed** at the user's explicit request, after real live verification (not just tsc/lint) — a genuine end-to-end run against production infrastructure:

- **Confirmed working live**: Zoho API Console setup (Self Client, scoped refresh token), all `ZOHO_MAIL_*` env vars resolved against the real `helpdesk@webriq.us` mailbox (`accountId 7546452000000008002`, Inbox `folderId 7546452000000008014`), the code deployed to production, migration 122 applied, the Supabase Vault `app_base_url` secret updated to track the app's domain (which changed twice mid-session — `centralhub.webriq.cloud` → `hub.webriqs.com`, see task 319), a manual poll trigger, a real backlog-processing run (the pre-existing inbox backlog, up to the documented 50-message cap, was ingested as new tickets on first activation — confirmed via tickets #568/#569 among them — exactly matching the documented first-run-backfill behavior), and a genuinely new test email creating ticket #570 end-to-end (`polled:1, processed:1`, ticket + `ticket_messages` row confirmed in Supabase and in the `/desk/tickets` UI).
- **A real bug was found and fixed during this live verification, not left in place**: `tickets.zoho_mail_thread_id` was `null` on every created ticket, including #570. Root cause traced against actual Zoho API responses: Zoho only assigns a message's `threadId` once a reply exists on it, so a ticket's *first* message never has one at ingest time. Fixed in `src/lib/zoho/mail.ts` (default `threadId` to the message's own `messageId`, matching Zoho's confirmed convention that a thread's ID equals its root message's ID) and in the poll route (fallback match via `ticket_messages.email_message_id`, self-healing tickets #568–#570's `null` values on their next reply). See the dedicated Deviations entry above for the full trace.
- **Not independently re-verified after that fix**: the reply-thread-match flow (reply to an existing ticket's email → confirm it appends to the same ticket, not a new one) and the outbound "Reply to Customer" UI flow end-to-end (send → arrives → threads correctly in a real mail client). Both were scoped as the next manual test to run but not completed before this doc was marked complete. If either fails, the most likely place to look first is the same `zoho_mail_thread_id`/`email_message_id` matching logic just fixed, followed by `sendReply()`'s handling of `ZOHO_MAIL_FROM_ADDRESS` and the reply-target message-ID lookup in the reply route.
- **Optional, not yet run**: the one-time SQL backfill for tickets #568–#570's `zoho_mail_thread_id` (given in the fix's own note above) — not required for correctness (the fallback match self-heals on the next reply either way), just saves that one fallback lookup the first time.

