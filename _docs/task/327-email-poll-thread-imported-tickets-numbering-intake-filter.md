# 327: email-poll — Thread Replies onto Imported Tickets, Ticket-Number Continuity, Intake Filter

**Created:** 2026-08-28
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Fallout from task 326's live migration + Desk re-import. Three related defects in the inbound
email path (`src/app/api/cron/email-poll/route.ts`):

1. **email-poll cannot thread a customer reply onto an imported ticket → it duplicates.**
   email-poll matches an existing ticket only by `tickets.zoho_mail_thread_id` (imported tickets
   have none) or, as a fallback, by `ticket_messages.email_message_id = email.threadId` (the
   `desk-threads` import never populates `email_message_id` — the Desk export carries no RFC822
   Message-ID). So every reply to one of the 541 imported tickets creates a brand-new
   Hub-native ticket (`external_id IS NULL`). This is already happening — a live-DB probe found
   45 such orphan rows (14 with `zoho_mail_thread_id`, 31 without; 56 messages; 0 with a Zoho
   number), sitting next to their imported twins.

2. **New email-poll tickets get a stale `ticket_number`.** `tickets.ticket_number` is a `serial`;
   before task 326 the sequence sat at ~575 while imported Zoho numbers run to ~21008. Migration
   124 added `sync_ticket_number_sequence()` and calls it once, and the Desk import calls it after
   each run — but nothing guarantees the sequence is current at the moment email-poll inserts, so
   a poll that runs between a migration and an import (or after a restore) can still mint a
   colliding low number.

3. **Every inbound email becomes a ticket, including automated noise.** email-poll creates a
   ticket for every message in `ZOHO_MAIL_INBOX_FOLDER_ID` past the cursor, with no sender or
   header filtering. The observed orphan rows are almost entirely automated mail: the Hub's own
   "WebriQ Central Hub" system emails (verification codes, invites), Zoho flow-failure alerts,
   calendar-invite notifications.

### Decisions locked with the user (2026-08-28)

| Question | Decision |
|----------|----------|
| Thread fallback basis | `requester_email` + normalized subject (strip `Re:`/`Fwd:`), within a recent lookback window (**180 days**). |
| Customer reply to a **Closed** ticket | **Reopen** — append the message and set `status = 'open'`. |
| Intake filter | **Drop obvious automated mail** — bounces, `Auto-Submitted` / `Precedence: bulk\|list`, `no-reply@` / `notifications@` senders, own-domain system mail, **and any email whose sender display name is "WebriQ Central Hub"**. Everything else becomes a ticket. |

### Ground truth (live-DB probe, 2026-08-28)

- `tickets`: 586 total — 541 with `external_id` (Desk import, all carry `source_meta.ticketNumber`),
  45 with `external_id IS NULL` (Hub-native / email-poll).
- The 45 orphans hold 56 `ticket_messages`; the 541 imports hold 2238.
- Imported tickets **do** carry `requester_email` (`ticket.email` in the import) — so the
  `requester_email` fallback match will resolve against them.
- `ZohoMailMessageSummary` (from `listNewMessages`) exposes `messageId`, `threadId`, `folderId`,
  `subject`, `fromAddress` (bare address — display name is stripped by `extractEmailAddress`),
  `receivedTime`, `hasAttachment`. Raw headers are **not** on the summary; `getMessageMetadata()`
  (an extra `/messages/{id}/details`-style call) parses `data.headers` and already extracts
  `rfc822MessageId`.

## Requirements

### A. Ticket-number continuity

- [ ] `POST /api/cron/email-poll` calls `adminClient.rpc("sync_ticket_number_sequence")` **once**
      at the start of the run, before the message loop (idempotent; ~1 statement; guarantees the
      `ticket_number` serial is ahead of every imported Zoho number). Log + push to the response
      on error, non-fatal.
- [ ] Do **not** compute `max(ticket_number)+1` per-insert — the synced sequence is the right
      mechanism and per-row `max()` races.

### B. Thread fallback match (before creating a new ticket)

- [ ] New helper `normalizeEmailSubject(raw: string): string` — strips one or more leading
      reply/forward prefixes (`Re:`, `RE:`, `Fwd:`, `FW:`, `AW:`, `WG:`, with/without brackets),
      collapses whitespace, trims. Lives in `src/lib/email/subject.ts` (new).
- [ ] In `processMessage`, after the existing `zoho_mail_thread_id` lookup **and** the
      `ticket_messages.email_message_id = email.threadId` fallback both miss, add a third lookup:
  - fetch recent tickets for this sender:
    `.from("tickets").select("id, ticket_number, ticket_id, status, subject, zoho_mail_thread_id")
     .ilike("requester_email", email.from).gt("created_at", <now − 180d>)
     .order("created_at", { ascending: false }).limit(25)`
  - in JS, pick the first whose `normalizeEmailSubject(row.subject)` equals
    `normalizeEmailSubject(email.subject)` (case-insensitive compare).
  - on match: use that ticket; if its `zoho_mail_thread_id` is null, backfill it to
    `email.threadId` (so the next reply hits the fast path).
- [ ] `THREAD_MATCH_LOOKBACK_DAYS = 180` — module constant with a comment.
- [ ] The match must set `ticketId` (uuid), `ticketNumber`, and `ticketDisplayId` the same way
      the existing branches do (task 326 wiring), so the inline-image serving URL is correct.

### C. Reopen Closed on customer reply

- [ ] Single place: whenever `processMessage` resolves an **existing** ticket (any of the 3
      match paths) and is about to append a `client` message, if that ticket's `status === 'closed'`
      set it to `'open'` (`adminClient.from("tickets").update({ status: "open" }).eq("id", ticketId)`).
      Fetch `status` in the lookups that don't already select it.

### D. Intake filter

- [ ] New module `src/lib/email/intake-filter.ts` exporting
      `shouldIngestEmail(input): { ingest: boolean; reason?: string }` — a pure function over:
      `fromAddress` (bare), `fromName` (display name), `subject`, and optionally a `headers`
      record.
- [ ] Drop rules (any match → `ingest: false`, `reason` names the rule):
  - **Sender display name** equals (case-insensitive, trimmed) `"WebriQ Central Hub"`.
  - **Sender address** matches `no-?reply@`, `notifications?@`, `mailer-daemon@`, `postmaster@`,
    `bounce`, or the Hub's own sending domain(s) — a `SYSTEM_SENDER_PATTERNS` regex array +
    `HUB_OWN_DOMAINS` list (constants in the module; the Hub's outbound sender comes from
    `src/lib/email/mailer.ts` — read it to get the real address/domain).
  - **Subject** matches a `NOISE_SUBJECT_PATTERNS` array, seeded from the observed orphans:
    `/your webriq hub verification code/i`, `/error notification: your flow/i`,
    `/has assigned a .* to you\.?$/i`, `/^(undeliverable|delivery status notification|mail delivery failed)/i`.
  - **Headers** (only when available — see E): `Auto-Submitted` present and not `no`;
    `Precedence` in `bulk|list|junk`; `Return-Path: <>` (empty — a bounce).
- [ ] In `processMessage`: run the filter **after** the `email_message_id` idempotency check and
      **before** any ticket lookup/creation. On `ingest: false` → log
      `[cron/email-poll] skipped <messageId>: <reason>`, **do not** create/append anything, and
      let the caller advance the cursor (so it is not reprocessed). Count skips in the
      `POST` response (`{ polled, processed, skipped }`).
- [ ] A reply that would otherwise thread onto an existing ticket (match found in B) is **not**
      subject to the noise-subject rule — but sender-based system rules still apply (a "WebriQ
      Central Hub" email never belongs on a customer ticket).
      *Implementation:* run the filter first; if it drops, stop. (Threading a dropped message is
      not a real scenario — system senders don't reply to tickets.)

### E. Header access (research + minimal plumbing)

- [ ] Confirm whether the Zoho Mail message-content or message-details endpoint returns headers
      cheaply. If `getMessageMetadata()`'s `data.headers` is reliable, call it once per
      otherwise-accepted message and pass `Auto-Submitted` / `Precedence` / `Return-Path` into
      `shouldIngestEmail`. If it needs a separate call and that call is expensive/flaky, ship D
      with sender+subject rules only and note headers as a follow-up — the observed 45 orphans
      are **all** caught by sender + subject rules, so header checks are hardening, not the core.
- [ ] Add `fromName` (display name) and `fromRaw` to `ZohoMailMessageSummary` — parse from the
      raw `r.fromAddress` in `listNewMessages` before `extractEmailAddress` strips it. Thread
      `fromName` through `toParsedInboundEmail` → `ParsedInboundEmail`.

### F. One-time cleanup of the existing 45 orphans (runbook, not code)

- [ ] The task doc carries the classification + delete SQL (below). This is a **manual DB
      runbook** the operator runs once against the live DB — not a migration (baking row deletion
      into a migration that also runs on every fresh environment is wrong). Migration files are
      not added by this task.

## Out of Scope / Must-Not-Change

- **Spam scoring / ML / quarantine queue** — a fixed rule list only. No `email_poll_skipped`
  table; a log line + response counter is the record.
- **A denylist-management UI or DB table** — patterns live in `intake-filter.ts` constants
  (+ `HUB_OWN_DOMAINS` may read an env var if one already exists for the sender domain).
- **The Desk import** (`desk-tickets-import.ts`, `desk-threads`, `desk-ticket-comments`) — untouched.
- **Backfilling `ticket_messages.email_message_id` for imported rows** — considered and rejected:
  the Desk threads export carries no RFC822 Message-ID, so there is nothing to backfill from.
  The `requester_email` + subject fallback (B) is the mechanism instead.
- **Auto re-parenting the 56 orphan messages** — the manual runbook (F) deletes only orphans
  with no staff reply + a confirmed twin; anything with a staff reply is left for the operator.
- **The outbound reply route** (`/api/desk/tickets/[ticketId]/reply`) and `sendReply()` — unchanged.
- **`webhooks/route.ts`** (Zoho Desk/Projects event webhooks) — unrelated path.
- **Migration files** — none added by this task.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/email/subject.ts` | Create | `normalizeEmailSubject()`. |
| `src/lib/email/intake-filter.ts` | Create | `shouldIngestEmail()` + pattern constants. |
| `src/lib/zoho/mail.ts` | Modify | `ZohoMailMessageSummary` gains `fromName` / `fromRaw`; `listNewMessages` parses them. Possibly a headers accessor for E. |
| `src/lib/email/inbound.ts` | Modify | `ParsedInboundEmail` carries `fromName`; pass through in `toParsedInboundEmail`. |
| `src/app/api/cron/email-poll/route.ts` | Modify | (A) `sync_ticket_number_sequence` rpc at poll start; (D) intake filter gate + skip counter; (B) subject+email fallback match + `zoho_mail_thread_id` backfill; (C) reopen `closed` → `open` on client reply. |
| `_docs/task/327-*.md` | Create | This doc, incl. the F runbook SQL. |

## Code Context

### `src/app/api/cron/email-poll/route.ts` — current match logic (post-task-326)

```ts
// 1. primary: tickets.zoho_mail_thread_id == email.threadId
const { data: existingTicket } = await adminClient
  .from("tickets").select("id, ticket_number, ticket_id")
  .eq("zoho_mail_thread_id", email.threadId).maybeSingle();

let ticketId = existingTicket?.id ?? null;
let ticketNumber = existingTicket?.ticket_number ?? null;
let ticketDisplayId = existingTicket?.ticket_id ?? null;

// 2. fallback: a ticket_messages row whose email_message_id == email.threadId
if (!ticketId) {
  const { data: rootMessage } = await adminClient
    .from("ticket_messages").select("ticket_id")
    .eq("email_message_id", email.threadId).maybeSingle();
  if (rootMessage) { /* ... backfill zoho_mail_thread_id, re-select number/id ... */ }
}

// 3. NEW (this task): requester_email + normalized-subject match within 180d
// 4. else: insert a new ticket (status "open" — task 326)
```

The new-ticket insert and the `ticketDisplayId = ticketDisplayId ?? \`TKT-${ticketNumber}\`` guard
are already in place from task 326 — the fallback branch just needs to feed the same three vars.

### `src/lib/zoho/mail.ts:173-188` — where to capture the display name

```ts
fromAddress: extractEmailAddress(decodeHtmlEntities(r.fromAddress ?? "")),
// add:
// fromRaw: decodeHtmlEntities(r.fromAddress ?? ""),
// fromName: parseDisplayName(decodeHtmlEntities(r.fromAddress ?? "")),  // "" if none
```

### `sync_ticket_number_sequence()` (migration 124 — already deployed)

```sql
create or replace function sync_ticket_number_sequence() returns void as $$
  select setval(
    pg_get_serial_sequence('public.tickets', 'ticket_number'),
    greatest((select coalesce(max(ticket_number), 0) from public.tickets), 1),
    true
  );
$$ language sql security definer;
```

Typed in `src/types/database.ts` under `Functions` as `sync_ticket_number_sequence` (added by
task 326) — `adminClient.rpc("sync_ticket_number_sequence")` type-checks.

## Implementation Steps

1. `src/lib/email/subject.ts` — `normalizeEmailSubject()`.
2. `src/lib/email/intake-filter.ts` — `shouldIngestEmail()` + `SYSTEM_SENDER_PATTERNS`,
   `HUB_OWN_DOMAINS`, `NOISE_SUBJECT_PATTERNS`, `WEBRIQ_HUB_SENDER_NAME = "WebriQ Central Hub"`.
   Read `src/lib/email/mailer.ts` for the Hub's real outbound sender address/domain.
3. `src/lib/zoho/mail.ts` — `fromName` / `fromRaw` on the summary + a `parseDisplayName` helper;
   research the headers endpoint for E and add a minimal accessor if cheap.
4. `src/lib/email/inbound.ts` — thread `fromName` into `ParsedInboundEmail`.
5. `email-poll/route.ts`:
   a. `await adminClient.rpc("sync_ticket_number_sequence")` before the loop (log-on-error).
   b. after the `existingMessage` idempotency check: `const gate = shouldIngestEmail(...)`;
      if `!gate.ingest` → log, `return` (caller advances cursor), bump a `skipped` counter.
   c. add match path 3 (requester_email + normalized subject + 180d).
   d. reopen: if a matched ticket's `status === "closed"`, update to `"open"`.
   e. response body `{ polled, processed, skipped }`.
6. `npx tsc --noEmit`; `pnpm lint`.
7. Manual verification (below).
8. Operator runs the F runbook against the live DB.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] A simulated reply (`from` = an imported ticket's `requester_email`, `subject` =
      `"Re: " + that ticket's subject`, `receivedTime` newer than cursor) appends to the imported
      ticket and does **not** create a new row; the ticket's `zoho_mail_thread_id` is backfilled.
- [ ] The same reply against a `closed` imported ticket flips it to `open`.
- [ ] An email with sender display name `"WebriQ Central Hub"` is skipped (no ticket, no
      message); `skipped` increments; the cursor still advances.
- [ ] An email from `no-reply@…` / matching a `NOISE_SUBJECT_PATTERNS` subject is skipped.
- [ ] A genuine new customer email (real person, novel subject) still creates a ticket, and its
      `ticket_number` is greater than the current `max(ticket_number)` (≈21008+).
- [ ] `normalizeEmailSubject("Re: Fwd: RE: Widget broken")` → `"Widget broken"`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual (dev): POST /api/cron/email-poll with a valid session after seeding the Zoho Mail
#   test folder (or stub listNewMessages) with: (a) a reply to an imported ticket,
#   (b) a "WebriQ Central Hub" email, (c) a no-reply@ email, (d) a fresh customer email.
# Confirm row counts, statuses, and the skipped counter in the JSON response.
```

## One-Time Cleanup Runbook (F) — run once against the live DB

```sql
-- 1. Classify the 45 Hub-native orphans: twin? staff reply?
select
  l.id, l.ticket_number, l.status, l.requester_email,
  left(l.subject, 70) as subject, l.created_at::date as created,
  l.zoho_mail_thread_id is not null as from_email_poll,
  count(m.*) as msgs,
  bool_or(m.author_type = 'staff' and m.visibility = 'public') as has_staff_reply,
  exists (select 1 from tickets z where z.external_id is not null and z.subject = l.subject) as has_zoho_twin
from tickets l
left join ticket_messages m on m.ticket_id = l.id
where l.external_id is null
group by l.id
order by has_staff_reply desc, has_zoho_twin, l.created_at;

-- 2. Delete the clean duplicates (twin exists, no staff reply). Review query 1 first.
begin;
create temp table legacy_dupes as
  select l.id from tickets l
  where l.external_id is null
    and exists (select 1 from tickets z where z.external_id is not null and z.subject = l.subject)
    and not exists (
      select 1 from ticket_messages m
      where m.ticket_id = l.id and m.author_type = 'staff' and m.visibility = 'public');

delete from attachments
where entity_type = 'ticket_message'
  and entity_id in (select id from ticket_messages where ticket_id in (select id from legacy_dupes));

delete from tickets where id in (select id from legacy_dupes);  -- ticket_messages FK cascades
commit;

-- 3. Re-sync the sequence (belt-and-braces after deletes).
select sync_ticket_number_sequence();
```

Rows flagged `has_staff_reply = true` are handled case-by-case by the operator (keep, or
re-parent messages onto the twin then delete).

## Compatibility Touchpoints

- **CLAUDE.md** — under the ticketing conventions, note that email-poll now (a) filters inbound
  mail via `shouldIngestEmail()` (`src/lib/email/intake-filter.ts`), (b) threads by
  `requester_email` + normalized subject when no id-match exists, (c) reopens `closed` tickets on
  a customer reply, (d) resyncs the `ticket_number` sequence each run. Do this in the `document`
  stage.
- **Task 326** — depends on migration 124's `sync_ticket_number_sequence()` and the `ticket_id`
  wiring already being live. 327 must land after 326 is deployed.
- No packaging / install-surface impact. No new env vars unless `HUB_OWN_DOMAINS` reuses an
  existing one.

## Implementation Notes

### What Changed

- **A. Ticket-number continuity.** `POST /api/cron/email-poll` calls
  `adminClient.rpc("sync_ticket_number_sequence")` once before the message loop (logs on error,
  non-fatal). New tickets now advance the serial from the imported max (~21008+), not a stale low
  value.
- **B. Thread fallback (Match 3).** After the existing `zoho_mail_thread_id` (Match 1) and
  `ticket_messages.email_message_id` (Match 2) lookups miss, `processMessage` now queries recent
  tickets (`created_at > now() − 180d`) for the sender (`ilike requester_email`), pulls ≤25, and
  in JS picks the first with an exact case-insensitive `requester_email` match **and**
  `subjectsMatch(ticket.subject, email.subject)`. On a hit it reuses that ticket and backfills
  `zoho_mail_thread_id` (so the next reply takes Match 1's fast path). New helper module
  `src/lib/email/subject.ts` — `normalizeEmailSubject()` / `subjectsMatch()` strip stacked
  `Re:`/`Fwd:`/localized/`Re[2]:` prefixes.
- **C. Reopen on customer reply.** Each match path records the matched ticket's `status` in
  `matchedTicketStatus`; a single check after resolution flips `closed` → `open`
  (`update({ status: "open" })`). New-ticket path leaves it null.
- **D. Intake filter.** New `src/lib/email/intake-filter.ts` — `shouldIngestEmail({ fromAddress,
  fromName, subject, headers? })` → `{ ingest, reason? }`. Drop rules: sender display name
  `"WebriQ Central Hub"` (covers every `mailer.ts` send); `SYSTEM_SENDER_PATTERNS`
  (`no-reply@`, `notifications@`, `mailer-daemon@`, `postmaster@`, `bounce…`); unnamed sender on
  a `HUB_OWN_DOMAINS` domain (derived from `MAIL_FROM`, default `webriq.com`); `NOISE_SUBJECT_PATTERNS`
  (verification code, flow-failure, "assigned … to you", DSN/bounce, auto-reply, OOO); and, only
  when a `headers` map is passed, `Auto-Submitted` / `Precedence: bulk|list` / empty `Return-Path`.
  `processMessage` runs the gate on the cheap `summary` fields **before** the content parse; a
  drop logs `[cron/email-poll] skipped <id>: <reason>`, returns `"skipped"`, and the cursor still
  advances. `processMessage` now returns `"ingested" | "skipped" | "duplicate"`; the `POST`
  response is `{ polled, processed, skipped }`.
- **E. Display name plumbing.** `ZohoMailMessageSummary` gains `fromName` + `fromRaw`, parsed in
  `listNewMessages` via a new `extractDisplayName()` in `mail.ts`. Threaded into
  `ParsedInboundEmail.fromName`. Header-based filter rules are **not** wired from email-poll —
  `getMessageMetadata()`'s header map is an extra API call with unverified field names, and the
  sender + subject rules already catch every one of the 45 observed orphans (requirement E's
  sanctioned fallback).

### Files Changed

- `src/lib/email/subject.ts` — new: `normalizeEmailSubject()`, `subjectsMatch()`.
- `src/lib/email/intake-filter.ts` — new: `shouldIngestEmail()` + pattern constants.
- `src/lib/zoho/mail.ts` — `extractDisplayName()`; `ZohoMailMessageSummary.fromName` / `.fromRaw`;
  `listNewMessages` populates them.
- `src/lib/email/inbound.ts` — `ParsedInboundEmail.fromName`; passed through in `toParsedInboundEmail`.
- `src/app/api/cron/email-poll/route.ts` — sequence resync at poll start; intake gate + `skipped`
  counter + `ProcessOutcome` return type; Match 3 (sender + normalized subject, 180d); closed→open
  reopen; `THREAD_MATCH_LOOKBACK_DAYS` const.

### Deviations From Plan

- **Header-based filter rules not wired into email-poll** (requirement E, explicitly optional):
  `getMessageMetadata()` is a separate Zoho Mail call with unverified header field names, and the
  sender + subject rules cover all observed cases. `shouldIngestEmail` still accepts and applies a
  `headers` map if a future caller supplies one.
- **`HUB_OWN_DOMAINS` scoped to unnamed senders only** — dropping every `@webriq.com` inbound
  risked losing a WebriQ staffer's forwarded customer complaint. The rule now fires only when the
  sender has no display name; a named `jane@webriq.com` forward is kept. Noted in a code comment.
- **`fromRaw` added** alongside `fromName` (task doc mentioned it) — for logging/debugging; not
  otherwise consumed.

### Verification Run

- `npx tsc --noEmit` — PASS (exit 0).
- `pnpm lint` — PASS (2 pre-existing warnings in an unrelated file).
- `pnpm build` — PASS (`✓ Compiled successfully`; `/api/cron/email-poll` registers).
- Pure-helper checks (node, scratch script, then discarded):
  - `normalizeEmailSubject("Re: Fwd: RE: Widget broken")` → `"Widget broken"`; `"Re[2]: …"` handled.
  - `shouldIngestEmail` drops all four observed noise categories with correct reasons; a real
    customer `"Re: …"` from an external domain and a named `@webriq.com` forward both ingest.
- Live poll against the Zoho Mail folder + DB row-count assertions — NOT RUN (needs the configured
  mailbox + live DB; same caveat as tasks 303/321/322).
- The one-time orphan-cleanup runbook (section F) is the operator's to run — not part of this
  code change.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No `any` / untyped escape hatches. `shouldIngestEmail` / `normalizeEmailSubject` are pure,
  single-responsibility, guard-clause style.
- Dead-code sweep during the gate:
  - Removed `ParsedInboundEmail.fromName` + its assignment — the intake filter runs on the
    `summary` before the parse, so nothing downstream read it. `ZohoMailMessageSummary.fromName`
    stays (the filter consumes it).
  - Wired `summary.fromRaw` into the skip log line (`skipped <id> from "<raw>": <reason>`) so it
    is used, not just populated — the skip log is now actionable without a second lookup.
- Tightened `REPLY_FORWARD_PREFIX` in `subject.ts` to `re|fwd?|fw|aw|wg|antw(ort)?`, dropping the
  ambiguous 2-letter locale prefixes (`sv`, `vs`, `rv`, `tr`) the first pass included — an
  over-strip could mis-thread a reply; a missed strip is harmless (falls back to a new ticket).
- Error handling intentional: `sync_ticket_number_sequence` rpc failure is `console.error` +
  continue (non-fatal per plan); ticket-creation failure throws; the pre-existing
  attachment-loop try/catch is untouched.
- `console.log` for skipped messages is one operational line per drop, consistent with the
  file's existing `console.warn`/`console.error` usage — not debug spam. No secrets logged
  (the raw From is not sensitive).
- Conventions followed: `pnpm`, no git, task doc in `_docs/task/`, no migration files.

### Deviations
- **Minor** — `ParsedInboundEmail.fromName` (asked for in requirement E) removed as unused; add
  back trivially if a future consumer needs it. `fromRaw` kept and wired into the skip log.
- **Minor** — Header-based filter rules (`Auto-Submitted` / `Precedence` / `Return-Path`) are
  implemented in `shouldIngestEmail` but not fed from email-poll — requirement E's sanctioned
  fallback (extra Zoho Mail call, unverified field names; sender+subject rules cover all 45
  observed orphans). Already in Implementation Notes.
- **Minor** — `HUB_OWN_DOMAINS` drops only *unnamed* own-domain senders, so a named
  `jane@webriq.com` forward survives. Already in Implementation Notes.
- **Minor** — Match 3 uses `.ilike("requester_email", email.from)` (a `_` in a local part is a
  wildcard) but re-checks exact case-insensitive equality in JS before accepting the match, and
  mirrors the existing `contactMatches` query's pattern in the same file.
- **Medium (observation, not a blocker)** — An intake filter that *silently drops* mail is the
  dangerous failure mode. `NOISE_SUBJECT_PATTERNS` (`/has assigned an? .+ to you\.?$/`,
  DSN/OOO/auto-reply) could in a rare case drop a genuine customer email. Mitigations in place:
  every drop is logged with the reason **and** the raw sender, the patterns match observed Zoho
  automation formats, and nothing is deleted (the message stays in the mailbox). **Test stage:
  eyeball the `skipped` log against a real poll before trusting the filter broadly**, and be
  ready to loosen a pattern.
- No Major deviations.

### Required Fixes
- None.

## Completion Note

**Marked complete at the user's explicit request on 2026-08-28**, from the Testing state — the
`test` / browser-acceptance stage was skipped.

Done: implementation + quality gate (PASS). `npx tsc --noEmit`, `pnpm lint`, `pnpm build` pass;
pure-helper behaviour verified via a throwaway node script (`normalizeEmailSubject` prefix
stripping; `shouldIngestEmail` drops all four observed noise categories and keeps real customer
replies + named internal forwards).

Outstanding operator steps (not blockers to marking done, but required before the fix is live
and trustworthy):
1. **Deploy** this code — until then every reply to an imported ticket still creates an orphan.
2. **Run the section-F one-time runbook** to clean the 45 existing `external_id IS NULL` orphan
   tickets + their 56 messages.
3. **Reset `email_poll_cursor.last_received_time`** to the epoch-ms of the fresh Zoho export
   snapshot (discussed with the user: their value was `1787896170907`), so email-poll doesn't
   re-walk mail that the threads/comments re-import also covers.
4. **Watch the `[cron/email-poll] skipped …` logs** after the first live poll to confirm the
   intake filter isn't dropping genuine customer mail (the Medium observation above).
5. Header-based filter rules (`Auto-Submitted` / `Precedence` / bounce `Return-Path`) remain a
   possible follow-up if sender+subject rules prove insufficient in production.
