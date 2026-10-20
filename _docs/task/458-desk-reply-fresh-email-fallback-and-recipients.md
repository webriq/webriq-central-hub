# 458: Desk Inbox Reply — Fresh-Email Fallback for Tickets Without a Mail Thread + Editable To/Cc/Bcc

**Created:** 2026-10-20
**Priority:** HIGH
**Type:** bugfix + enhancement
**Recommended Tier:** balanced
**Status:** Planned (code already written in the working tree, ahead of approval. tsc + eslint clean. Not yet live-tested against Zoho Mail.)

---

## Overview

### Part A: "No prior email message to reply to on this ticket"

Staff replying on some Desk Inbox tickets get the error `No prior email message to reply to on this ticket` after writing the full reply (reported on the wscgroup.com.au "Financial Planning Latest News" ticket).

**Root cause.** `POST /api/desk/tickets/[ticketId]/reply` only sends through Zoho Mail's **reply** endpoint (`sendReply()`). That endpoint threads off an existing Zoho Mail message ID, taken from the newest `inbox_messages.email_message_id` on the ticket. When none exists, the route returns 400. Only three writers ever set `email_message_id`:

| Ticket origin | Has `email_message_id`? |
|---|---|
| Zoho Mail poll (`email-poll`, `channel='email'`) | Yes |
| Sent-folder ingest (`sent-ingest.ts`) / the reply route itself | Yes (existing tickets only) |
| Zoho Desk import (`desk-tickets-import.ts`) | **No.** The Desk threads export carries no RFC822 Message-ID (`src/lib/email/subject.ts:3-5`) |
| StackShift Desk poll (`desk-ticket-poll`, `channel='api'`) | **No.** Desk threads/comments, not mail messages |
| Direct StackShift (`channel='stackshift'`) | n/a. Returns early via `replyOnDirectTicket()` |

An imported/polled ticket only became replyable after the customer emailed helpdesk@ again and `email-poll`'s subject-match fallback (Match 3) threaded that email on. The composer (`_ticket-detail.tsx`) shows Reply on every non-direct ticket, so staff hit the error only on Send.

**Fix.** When the ticket has no mail message to thread off, send a **fresh** email via Zoho Mail's send endpoint with subject `Re: <ticket subject>`. Below the reply, quote the last public message mail-client style ("On <date>, <sender> wrote:" + blockquote), so it reads as a reply in the customer's inbox. The Hub stores the same staff-reply row as the normal path (body without the quote, plus the returned `messageId`). The thread shows it as an ordinary "Reply from us", and later customer replies thread on via `email-poll` Match 2 (or Match 3 as a backstop).

### Part B: editable recipients

The composer's **To** row was read-only text, and the route sent to exactly one address (contact email, else requester email). Staff need to add, change or remove recipients and add Cc/Bcc on a reply.

## Requirements

- [ ] A reply on a ticket with no `email_message_id` sends successfully as a fresh email instead of returning 400.
- [ ] The fresh email uses subject `Re: <subject>` (no double `Re:`) and quotes the last public message. HTML bodies are embedded as-is; plain-text bodies are HTML-escaped with newlines → `<br>`. If there is no public message at all, the reply goes out unquoted.
- [ ] HTML detection for the quoted message uses `source_meta.contentType === "text/html"` only, the same rule `page.tsx` renders by. *(Changed during test: the original tag sniff misread plain text such as `John <john@x.com>` as HTML. Every writer, Desk imports included, stamps `contentType` (`DESK_MESSAGE_CONTENT_TYPE = "text/html"`), so the sniff was unnecessary.)*
- [ ] Tickets that do have an `email_message_id` keep the existing native-reply path unchanged.
- [ ] The Hub row for both paths is a normal `author_type='staff'`, `visibility='public'` row with `email_message_id` = the returned `messageId`. The quote is **not** stored in the Hub body.
- [ ] Composer shows editable **To** (pre-filled with the ticket contact as a removable chip), plus **Cc** / **Bcc** rows revealed by links.
- [ ] Chips commit on Enter, comma, semicolon, Tab (when text is present) or blur. A pasted list splits into chips. Backspace on an empty input removes the last chip. Each chip has an × (`aria-label="Remove <email>"`).
- [ ] Invalid text stays in the input with an inline "Not a valid email" message, never silently dropped.
- [ ] Sending with an empty To is blocked client-side ("Add at least one To recipient") and server-side (400).
- [ ] Server validates `to`/`cc`/`bcc` as string arrays of valid emails, dedupes case-insensitively across lists (To beats Cc beats Bcc), and caps the total at 20.
- [ ] An absent `to` in the request body falls back to the old behaviour (resolved contact only), so older clients still work.
- [ ] Recipients are passed to Zoho Mail as comma-joined `toAddress` / `ccAddress` / `bccAddress` on **both** send paths. Empty Cc/Bcc are omitted.
- [ ] Recipients are stored on the Hub row as `source_meta.recipients = { to, cc, bcc }` and shown as To/Cc/Bcc lines when the message is expanded in the thread.
- [ ] Direct StackShift tickets (`channel='stackshift'`) keep a read-only To line and send no recipients (their reply goes through the outbox).
- [ ] Recipient edits apply to the single reply only. After send or cancel, the composer resets to the contact in To. The ticket's contact record is never changed.

## Out of Scope / Must-Not-Change

- `replyOnDirectTicket()` and the StackShift outbox flow: untouched.
- No write-back to Zoho Desk (replying through Desk for `channel='api'` tickets stays deferred to the Desk step-down, task 450).
- No change to `email-poll` thread matching. A reply from a Cc'd person from their own address threads only via Zoho's message-ID match. The Match 3 fallback still only checks the original requester.
- No migration: `source_meta` is existing jsonb.
- No attachments on outgoing replies (unchanged).
- No persistent "default Cc" per ticket/contact.
- `sent-ingest.ts` dedupe is unchanged. It relies on the stored `messageId`, same as the existing reply path.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/zoho/mail.ts` | Modify | Add `sendNewEmail()` (`POST /api/accounts/{id}/messages`, `mailFormat: "html"`). `MailRecipients` type + `recipientFields()` helper. `sendReply()` takes `to: string[]` + optional `cc`/`bcc`. |
| `src/app/api/desk/tickets/[ticketId]/reply/route.ts` | Modify | Recipient parsing/validation (`parseRecipients`). Native-reply vs fresh-email branch. Quote builder (`withQuotedMessage`, `isHtmlBody`, `escapeHtml`). Store `source_meta.recipients`. |
| `src/app/(hub)/desk/inbox/[inboxId]/_reply-composer.tsx` | Modify | `RecipientRow` chip input. Exported `ReplyRecipients` type. Editable To + toggleable Cc/Bcc. Read-only mode for direct StackShift. |
| `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` | Modify | `replyRecipients` state (default = contact in To), reset on send/cancel, sent in the POST body, empty-To guard, `recipientsEditable = channel !== "stackshift"`. |
| `src/app/(hub)/desk/inbox/[inboxId]/_conversation-thread.tsx` | Modify | `MessageItem.recipients`. `RecipientLines` rendered above an expanded message body. |
| `src/app/(hub)/desk/inbox/[inboxId]/page.tsx` | Modify | `recipientsOf()` maps `source_meta.recipients` → `MessageItem.recipients` (null for rows without it). |

## Code Context

### `src/app/api/desk/tickets/[ticketId]/reply/route.ts` (before)

```ts
const { data: latestMessage } = await adminClient
  .from("inbox_messages")
  .select("email_message_id")
  .eq("inbox_id", ticket.id)
  .not("email_message_id", "is", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (!latestMessage?.email_message_id) {
  return NextResponse.json({ error: "No prior email message to reply to on this ticket" }, { status: 400 });
}
```

The route also resolved a single `recipient = contactEmail ?? ticket.requester_email` and passed `to: recipient` to `sendReply()`.

### `src/app/api/cron/email-poll/route.ts` (threading, unchanged, relied on)

- Match 1: `inbox.zoho_mail_thread_id = email.threadId`.
- Match 2: `inbox_messages.email_message_id = email.threadId` (Zoho's threadId = the root message's own messageId). This is how a customer reply to the fresh email finds the ticket.
- Match 3: same requester + normalized subject within the lookback window (task 327).

### `src/lib/zoho/mail.ts` (shape after)

```ts
type MailRecipients = { to: string[]; cc?: string[]; bcc?: string[] };
function recipientFields(r: MailRecipients) // → { toAddress, ccAddress?, bccAddress? } comma-joined
export async function sendReply(input: { replyToMessageId; from; subject; content } & MailRecipients)
export async function sendNewEmail(input: { from; subject; content } & MailRecipients)
```

### Theming note

These Desk Inbox files use hard-coded hex Tailwind classes (`text-[#5F6A88]`, `border-[#E2E7F2]`, …), not the `isDark` prop pattern. The new UI matches the neighbouring composer markup.

## Implementation Steps

1. `mail.ts`: add `MailRecipients` + `recipientFields()`. Switch `sendReply()` to it. Add `sendNewEmail()` with the same response parsing (`data.messageId`, array-or-object `data`).
2. Reply route: add `parseRecipients()` (EMAIL_RE, cross-list dedupe, max 20). Compute `to = parsed.to ?? [contact]` and reject an empty To.
3. Reply route: drop the 400 on a missing `email_message_id`. Branch to `sendReply()` when one exists, else load the last public message and call `sendNewEmail()` with `withQuotedMessage(...)`.
4. Reply route: stamp `source_meta.recipients` on the inserted row.
5. `page.tsx` + `_conversation-thread.tsx`: map and render recipients.
6. `_reply-composer.tsx` + `_ticket-detail.tsx`: chip rows, state, reset, empty-To guard, StackShift read-only mode.
7. `npx tsc --noEmit` + eslint on touched files.

## Acceptance Criteria

- [ ] On a Desk-imported ticket with no `email_message_id`, Send succeeds. The customer receives a `Re:` email with the quoted last message. The Hub thread shows a "Reply from us" row whose `email_message_id` is set.
- [ ] A customer reply to that email lands on the same ticket (not a new one).
- [ ] On an email-poll ticket, the reply still threads natively in the customer's mail client.
- [ ] Removing the pre-filled contact and adding another To address sends only to the new address.
- [ ] Cc and Bcc recipients receive the email. Bcc is not visible to To/Cc recipients.
- [ ] Expanded Hub reply rows show To/Cc/Bcc. Pre-458 rows show no recipient lines.
- [ ] Empty To → blocked with "Add at least one To recipient". Invalid address → inline error, text kept.
- [ ] A request with 21 total recipients → 400. A non-array `cc` → 400.
- [ ] Direct StackShift ticket: To line is read-only and the reply still goes through the outbox.

## Verification

```bash
npx tsc --noEmit
npx eslint "src/app/(hub)/desk/inbox/[inboxId]" "src/app/api/desk/tickets/[ticketId]/reply" src/lib/zoho/mail.ts
```

Status so far: both clean on the current working tree.

**Live checks, still outstanding. Use inboxes you control, never a real customer:**

1. Send-mail endpoint + `messageId` field are unverified against the live account (same caveat as the `mail.ts` header). On a test ticket with no `email_message_id`, reply and confirm the email arrives with the quote and the inserted row has a non-null `email_message_id`. If `messageId` comes back null, the Sent-folder ingest could add a duplicate row (pre-existing risk on the reply path).
2. Confirm `ccAddress` / `bccAddress` field names by sending with one Cc and one Bcc to owned inboxes.
3. Reply to the fresh email from the To inbox and confirm `email-poll` attaches it to the same ticket.
4. Browser pass on the composer: chip add/remove, paste split, Backspace, invalid input, empty-To guard, Cancel resets.

## Compatibility Touchpoints

- **API contract:** `POST /api/desk/tickets/[ticketId]/reply` gains optional `to`/`cc`/`bcc` arrays. Omitting them keeps the old single-recipient behaviour.
- **Exports:** `sendReply()` signature changed (`to: string` → `to: string[]`). The reply route is its only caller.
- **Docs:** after verification, add a short CLAUDE.md Key Conventions note: the reply route falls back to `sendNewEmail()` when a ticket has no `email_message_id`, and recipients live in `inbox_messages.source_meta.recipients`.
- No migration, env var, or packaging change.

## Quality Gate Notes

### Result
PASS (2026-10-20)

### Standards Review
- Scope respected: only the six files listed in Proposed File Changes (+ `TASKS.md`, this doc) differ from `HEAD`. No migration, no env var, StackShift outbox path untouched.
- Fixed during the gate:
  - `sendReply()` / `sendNewEmail()` duplicated the Zoho response parsing. Extracted to `parseSendResponse()` in `mail.ts`.
  - Reply route header comment still described the native-reply-only behaviour. Updated to mention the task-458 fallback and staff-chosen recipients.
  - Quoted HTML in the fallback email kept `<img src="/api/desk/tickets/…/inline-images/…">` (relative, auth-gated, from `inline-images.ts:94`), which would render as broken images in the customer's mail client. `withQuotedMessage()` now replaces those `<img>` tags with `[image]`.
- No `any` escape hatches added. `parseRecipients()` narrows `unknown` explicitly. `recipientsOf()` in `page.tsx` narrows `source_meta.recipients` defensively for rows without it.
- Errors are handled intentionally. Validation → 400, send failure → 502 (unchanged), sent-but-not-saved → 500 "do not resend" (unchanged).
- No debug logging or secrets added.
- `npx tsc --noEmit` and eslint on the touched paths are clean after the fixes.

### Deviations
- **Minor:** `EMAIL_RE` exists in both `_reply-composer.tsx` and the reply route. Kept duplicated on purpose. The client check is UX only, the server is authoritative, and a shared module for one regex isn't worth it.
- **Minor:** client-side duplicates across To/Cc/Bcc rows aren't blocked. The server silently drops the later occurrence (To beats Cc beats Bcc), so nobody gets the email twice, but the thread's recipient lines show the deduped lists rather than exactly what was typed.
- **Minor:** pasting into a recipient input appends the pasted text to the end of the draft regardless of cursor position.
- **Medium (accepted, documented):** quoted customer HTML is embedded in the outbound email without sanitising. It's the customer's own message going back to them, as every mail client does, and receiving clients strip active content. Revisit only if quoted bodies from untrusted third parties become possible.
- **Medium (pre-existing risk, unchanged):** if Zoho returns no `messageId`, the Hub row has `email_message_id = null`. On the fallback path this also means the ticket stays without a thread anchor, so the next reply sends another fresh email. Covered by live check 1 in Verification.

### Required Fixes
- None.

### Process note
- This doc has no `Implementation Notes` section. The code was written in-session before the task doc existed, not through the `implement` stage. `TASKS.md` was therefore **not** moved from `Planned` to `Testing` (per the gate's reconciliation rule).
