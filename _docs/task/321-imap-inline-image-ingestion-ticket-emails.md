# 321: IMAP Ingestion for Inline Images on Inbound Ticket Emails

**Created:** 2026-08-27
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Implemented — pending manual verification (needs `ZOHO_MAIL_IMAP_APP_PASSWORD` set in local/prod env)

---

## Overview

Inline (`cid:`-referenced) images embedded in inbound ticket emails render broken on the Hub. Diagnosed and empirically confirmed this session (not guessed):

- Zoho Mail's REST "Get Email Content" API (`getMessageDetail()` in `src/lib/zoho/mail.ts:204`) returns an **empty `attachments` array** even for a real message with 3 embedded inline images — inline images are not exposed as fetchable attachment resources via this API at all.
- The `<img>` `src` the API's HTML body actually contains (`/mail/ImageDisplay?na=...&nmsgId=...&cid=...`) was tested directly with our Zoho Mail OAuth bearer token: Zoho responded with an **HTTP 302 to `mail.zoho.com/biz/login`** — i.e. it rejected the token and demanded an interactive login.
- The alternate host the user found via browser inspection (`us4-zmud.zoho.com/zm/ImageDisplay?...`) was also tested directly, with and without the OAuth token: both returned a flat **401**.
- The user separately confirmed in-browser: the URL opens successfully only when logged into Zoho as the mailbox owner (`helpdesk@webriq.us`); a different Zoho account gets `{"errorCode":10004,"errorMsg":"INTERNAL_ERROR"}`.

Conclusion: `ImageDisplay` is gated by an interactive Zoho Mail **webclient session** belonging to the mailbox owner — a different auth mechanism than the OAuth API token this integration holds, and not obtainable server-side without storing actual mailbox login credentials (which CLAUDE.md's "Never store credentials (DNS, email tool access) in the Hub" rule exists to prevent).

**Decision (explicitly made by the user this session):** work around this by pulling the raw MIME message via **IMAP** instead of the REST API. Raw MIME contains inline image parts as real bytes, keyed by `Content-ID` — no session-cookie problem. The user has explicitly authorized storing a new Zoho Mail **IMAP app-specific password** as a server-only secret, using the same treatment as the existing `ZOHO_MAIL_REFRESH_TOKEN` (env var, never committed, `.env`/`.env.local` only). IMAP access for this feature is read-only — no send, no delete, no flag changes.

## Requirements

- [x] Add `imapflow` (IMAP client) and `mailparser` (MIME parsing) as new dependencies via `pnpm add` — this is a real, visible `package.json`/`pnpm-lock.yaml` change; call it out, don't bury it. **Done:** `imapflow@^1.7.6`, `mailparser@^3.9.16`, `@types/mailparser@^3.4.6` added.
- [x] New `src/lib/email/imap.ts`: connects read-only (uses `BODY.PEEK[]`, not `BODY[]`, so fetching a message does **not** mark it `\Seen` on the mailbox — a real correctness requirement, not a nice-to-have, since this mailbox is also used interactively by staff), finds the message correlating to a given `ZohoMailMessageSummary` (see Open Decision below — no direct ID bridge exists between Zoho's REST `messageId` and IMAP), parses it with `mailparser`, and returns inline image parts: `{ cid: string; content: Buffer; contentType: string; filename: string }[]`. **Done:** `fetchInlineImages(summary)` — never throws, degrades to `[]`. Correlates via `summary.receivedTime`/`fromAddress` (date-granular SEARCH SINCE/BEFORE + HEADER FROM, then ±5 min envelope-date cross-check), INBOX only, `client.download()` (BODY.PEEK[]).
- [x] Wire into the existing inbound pipeline: `toParsedInboundEmail()` (`src/lib/email/inbound.ts:21`) gains an inline-images fetch step after the existing `getMessageDetail()` call. On any failure or no-confident-match (see Open Decision), **degrade gracefully** — return no inline images, leave the HTML as today's already-broken-but-harmless state. Never let an IMAP failure block ticket/message creation (mirrors the existing "attachment download failure is non-fatal" posture in `cron/email-poll/route.ts`'s attachment loop). **Done:** cheap `UNRESOLVED_INLINE_IMAGE_PATTERN` pre-check gates the IMAP round-trip so only messages that actually reference an unresolved inline image pay the cost.
- [x] `processMessage()` in `src/app/api/cron/email-poll/route.ts`: for each resolved inline image, upload to the existing `ticket-attachments` bucket (same bucket task 306/303 already use), insert an `attachments` row, and **rewrite the stored `ticket_messages.body` HTML** so each inline `<img src="...">` (both the `/mail/ImageDisplay?...cid=...` form and any raw `src="cid:..."` form) points at a new stable Hub-internal route instead of the dead Zoho URL. **Done:** message id generated up front so images upload + `body` is rewritten before the single `ticket_messages` insert; `rewriteInlineImageSrc()` matches by cid substring containment (a Content-ID can contain regex-special chars).
- [x] New migration: add a nullable `cid text` column to `attachments` (distinguishes "inline image referenced by a message body" from a real downloadable attachment). Do **not** reuse `external_id` to store the raw `cid` value — `external_id` has a **global unique constraint** (migration 035) and a MIME `Content-ID` is only guaranteed unique *within one message*, not across the whole mailbox; synthesize `external_id` as `` `${messageRowId}:${cid}` `` instead (deterministic, re-poll-safe, globally unique), and use the new `cid` column for the actual per-message lookup. **Done:** `supabase/migrations/123_attachments_inline_image_cid.sql`; `external_id` synthesized as `` `${newMessageId}:${img.cid}` ``.
- [x] New route `src/app/api/desk/tickets/[ticketNumber]/messages/[messageId]/inline-images/[attachmentId]/route.ts`: same auth/RLS pattern as the existing `.../attachments/[attachmentId]/file-url/route.ts` (session-bound client, ticket→message→attachment chain lookup), but issues a signed URL **without** the `download:` option (that route's `{ download: attachment.filename }` forces a Content-Disposition download — wrong for something that must render inline as `<img src>`) and responds with an HTTP **302 redirect** to it, not JSON — an `<img>` tag needs a directly-loadable URL, it can't do a fetch-then-open dance the way the existing attachment-chip download button does. **Done:** also constrains the lookup to `.not("cid", "is", null)` so the route only serves inline images.
- [x] Task 320's Attachments tab (`_attachments-tab.tsx`) currently lists every row under `entity_type: 'ticket_message'` for a ticket's messages. Inline images (signature logos, tracking pixels, etc.) must **not** flood that tab — filter to `cid is null` wherever attachments are queried for that tab (`page.tsx`'s attachment flatten, or wherever the query lands per this task's implementation). This is a required touchpoint into task 320's files, not optional. **Done:** `page.tsx`'s `attachments` query gains `.is("cid", null)` — the single source both the per-message attachment chips and the Attachments tab flatten from.

## Out of Scope / Must-Not-Change

- **Backfilling already-imported/already-polled messages.** This task only fixes inline images on messages polled *after* this ships. The (much larger, riskier) problem of retroactively IMAP-searching the mailbox's full history to fix already-broken messages already sitting in the DB is a separate, not-yet-scoped follow-up — do not bundle it in here.
- Any IMAP write operation — no send, no delete, no read/flag mutation. `BODY.PEEK[]` only.
- Regular (non-inline) attachment handling — already works via the REST `downloadAttachment()` path (task 306/303); untouched by this task.
- Storing the mailbox's actual account password — only an app-specific password, scoped to mail protocol access, independently revocable from the main Zoho login.
- Writing the actual secret value into any file. Add the new env var key(s) to `env.example` only (empty, documented) — the user fills in the real value in their own local env file.
- A signature/email-template system, or anything from task 320's already-declared out-of-scope list — unrelated to this task.

## Open Decision — IMAP↔REST correlation (RESOLVED, verified live during implementation)

Live-tested against the real mailbox (`imappro.zoho.com:993`, app-specific password) before writing any pipeline code, per this section's original instructions. Findings:

- **IMAP login, TLS, and the read-only requirement are all confirmed working.** `ImapFlow`'s `download()` (which uses `BODY.PEEK[]` under the hood) does **not** set `\Seen` — verified by fetching a message's flags before and after download.
- **The originally-proposed correlation key — `ticket_messages.created_at` — is unreliable and must not be used.** Tested against two real rows: one was ~20 hours off from its true IMAP date, another ~17 days off. `created_at` reflects when our system *inserted* the row (poll/import processing time), not when the email actually arrived — for a historically-imported or late-processed row these can diverge enormously.
- **Corrected design:** correlation must happen **inside the same poll cycle**, using `summary.receivedTime` fresh from the *same* `listNewMessages()` call that is already driving ticket/message creation in `processMessage()` — never a value re-derived from a stored DB timestamp after the fact. This has no drift-over-time failure mode, unlike the original proposal, and is a better design regardless of the bug just found.
- Search strategy: IMAP's base `SEARCH SINCE`/`BEFORE` criteria are **date-granular, not time-precise** (RFC 3501) — a JS `Date` with hours/minutes gets effectively truncated. Combine with `HEADER FROM` (we already have `summary.fromAddress`) to narrow reliably within a day-level window, then cross-check candidates' `envelope.date` against `summary.receivedTime` client-side (tight, e.g. ±5 min) before accepting a match. If ambiguous or no confident match, skip inline-image resolution for that message — never guess (unchanged from the original plan).
- The mailbox has other folders beyond `INBOX` (`Sent`, `Drafts`, `Spam`, `Trash`, `Inbox/Cancellation`, `NewsLetter`, `Notification`, `Templates`) — the poll cron only concerns itself with `INBOX`, matching REST's `ZOHO_MAIL_INBOX_FOLDER_ID`; IMAP correlation should search `INBOX` only, for the same reason.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add `imapflow`, `mailparser` (+ `@types/mailparser` if not bundled) via `pnpm add` |
| `env.example` | Modify | Document new IMAP env vars (see below) — keys only, no values |
| `src/lib/email/imap.ts` | Create | Read-only IMAP client: correlate a `ZohoMailMessageSummary` to a live IMAP message, fetch raw MIME via `BODY.PEEK[]`, parse with `mailparser`, return inline image parts |
| `src/lib/email/inbound.ts` | Modify | `toParsedInboundEmail()` gains an inline-images step, graceful-degrades on failure |
| `src/app/api/cron/email-poll/route.ts` | Modify | Upload resolved inline images to `ticket-attachments`, insert `attachments` rows, rewrite the stored HTML body's inline `<img src>` references |
| `supabase/migrations/{next}_attachments_inline_image_cid.sql` | Create | `alter table attachments add column cid text null;` |
| `src/app/api/desk/tickets/[ticketNumber]/messages/[messageId]/inline-images/[attachmentId]/route.ts` | Create | Auth-gated 302 redirect to a signed, non-download inline-image URL |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_attachments-tab.tsx` or `page.tsx` | Modify | Exclude `cid is not null` rows from the task 320 Attachments tab listing |

## Code Context

### `env.example` — where the new vars land (`env.example:65-91`)
Existing `ZOHO_MAIL_*` block reuses `ZOHO_CLIENT_ID`/`ZOHO_CLIENT_SECRET` and calls out that the API host is data-center-dependent (`ZOHO_MAIL_API_BASE_URL`, defaults to `https://mail.zoho.com`). Follow the same style for the new vars:
```
ZOHO_MAIL_IMAP_HOST=          # data-center-dependent, e.g. imap.zoho.com — confirm for this org
ZOHO_MAIL_IMAP_PORT=          # implicit TLS, Zoho's documented default is 993
ZOHO_MAIL_IMAP_APP_PASSWORD=  # app-specific password, NOT the account login password
```
Reuse `ZOHO_MAIL_FROM_ADDRESS` (already exists, = `helpdesk@webriq.us`) as the IMAP login username — Zoho IMAP auth uses the full email address. Do not add a duplicate "IMAP user" var.

### `attachments` table `external_id` is globally unique (`supabase/migrations/035_zoho_decommission_schema.sql:84`)
```sql
add column external_id text unique,   -- source system attachment ID
```
This is why the new `cid` column must be separate from `external_id` — see Requirements.

### Existing signed-URL pattern to mirror, minus `download:` (`src/app/api/desk/tickets/[ticketNumber]/messages/[messageId]/attachments/[attachmentId]/file-url/route.ts:46-48`)
```ts
const { data: signed, error: signError } = await supabase.storage
  .from("ticket-attachments")
  .createSignedUrl(attachment.storage_path, 60, { download: attachment.filename });
```
The new inline-images route drops `{ download: ... }` (so the browser renders it, doesn't prompt a save dialog) and returns `NextResponse.redirect(signed.signedUrl)` instead of `NextResponse.json({ url })`.

### Existing attachment upload/upsert shape to mirror (`src/app/api/cron/email-poll/route.ts` attachment loop)
```ts
const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(storagePath, buffer, { upsert: true });
...
await adminClient.from("attachments").upsert(
  { external_id: att.attachmentId, entity_type: "ticket_message", entity_id: newMessage.id, storage_path: storagePath, filename: att.fileName, size: att.size },
  { onConflict: "external_id" }
);
```
Inline images follow the same shape, plus the new `cid` column, plus the synthesized `external_id` (see Requirements — not `att.attachmentId` directly, there is no such ID from IMAP/mailparser in the same sense).

## Implementation Steps

1. [x] Once the app-specific password exists: manually verify basic IMAP login works for the mailbox (a throwaway script, not committed) before writing any pipeline code.
2. [x] Resolve the Open Decision above against a handful of real recent tickets — confirm the correlation strategy actually finds the right message reliably before trusting it in the cron. _(resolved — see Open Decision section; `created_at` correlation rejected, `summary.receivedTime` from the live poll cycle adopted)_
3. [x] Add `imapflow` + `mailparser` dependencies (`pnpm add`).
4. [x] Build `src/lib/email/imap.ts` (read-only fetch + correlate + parse).
5. [x] Wire into `src/lib/email/inbound.ts`'s `toParsedInboundEmail()`.
6. [x] Add the `attachments.cid` migration.
7. [x] Update `cron/email-poll/route.ts`'s `processMessage()` to upload inline images and rewrite the HTML body.
8. [x] Build the new inline-images serving route.
9. [x] Update task 320's Attachments tab query to exclude `cid is not null` rows.
10. [x] Add the new env vars to `env.example` (keys only).

**Remaining:** run migration 123 against the live DB; set `ZOHO_MAIL_IMAP_APP_PASSWORD` (and confirm `ZOHO_MAIL_IMAP_HOST`/`PORT` for this org); trigger the email-poll cron against a real inbound message with inline images and confirm it renders on `/desk/tickets/[n]`.

## Acceptance Criteria

- [ ] A newly-polled inbound email with inline images renders those images correctly on the Hub ticket detail page, for any authenticated staff user (not just whoever is logged into Zoho Mail's own webclient). _(manual — needs `ZOHO_MAIL_IMAP_APP_PASSWORD` set)_
- [x] IMAP fetch never marks a message `\Seen` or otherwise mutates mailbox state. _(verified live during Open Decision testing; `client.download()` uses BODY.PEEK[])_
- [x] A poll where IMAP correlation fails or is ambiguous still creates the ticket/message successfully — inline images just don't resolve, no different from today. _(`fetchInlineImages` never throws; inbound step + poll loop both non-fatal)_
- [x] Inline images do not appear in the ticket detail page's Attachments tab (task 320). _(`page.tsx` attachments query `.is("cid", null)`)_
- [x] `npx tsc --noEmit` and `pnpm lint` pass. _(tsc clean; lint clean apart from 2 pre-existing unrelated warnings in `_checklist-tab.tsx`)_
- [x] No secret values committed anywhere — `env.example` has only empty keys. _(`ZOHO_MAIL_IMAP_APP_PASSWORD=` empty; host/port are non-secret Zoho defaults)_

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: trigger the email-poll cron against a real inbound message with inline images
# (once ZOHO_MAIL_IMAP_APP_PASSWORD is set) and confirm the image renders on /desk/tickets/[n]
```

## Compatibility Touchpoints

- New runtime dependencies (`imapflow`, `mailparser`) — no packaging/adapter impact, this is a Next.js server-only addition.
- New required env vars for this feature specifically (existing inbound pipeline keeps working without them — graceful degradation per Requirements — so this is additive, not a breaking config change).
