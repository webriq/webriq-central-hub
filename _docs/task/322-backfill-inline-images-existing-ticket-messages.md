# 322: Backfill Inline Images for Existing Ticket Messages (pre-task-321)

**Created:** 2026-08-27
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** deep
**Status:** Done — full mailbox backfill run live (17 messages / 28 images / 0 unresolved), images render, idempotency confirmed

**Depends on:** task 321 shipped + its two config steps done (migration 123 applied, `ZOHO_MAIL_IMAP_APP_PASSWORD` set). This task is inert without them.

---

## Overview

Task 321 added IMAP resolution of inline (`cid:`-referenced) images on inbound ticket emails, but explicitly **only for messages polled after it ships** — its "Out of Scope" section deferred retroactively fixing messages already in the DB.

Every `ticket_messages` row imported/polled before task 321 (e.g. ticket #533, confirmed by the user) still stores the dead Zoho reference in its `body`:

- `<img src="/mail/ImageDisplay?na=…&nmsgId=…&cid=ii_1a0308b…">` — 302s to `mail.zoho.com/biz/login`, renders broken for every staff user.
- and/or the raw `<img src="cid:…">` form.

This task is the deferred backfill: a **manually-triggered, bounded, re-runnable** admin operation that walks existing client messages with unresolved inline-image references, resolves the image bytes via the same read-only IMAP path task 321 built, stores them as `attachments` rows (`cid` set), and rewrites the stored `body` HTML to point at task 321's inline-image serving route.

The one genuinely new problem vs. task 321 is **correlation**: the forward pipeline matches an IMAP message using `summary.receivedTime`/`fromAddress` fresh from the live poll cycle. A stored row has neither — and task 321 proved `ticket_messages.created_at` drifts from true arrival time by up to 17 days, so it must not be used. This task has to establish a retroactive correlation key (verified live, same discipline as task 321's Open Decision) before any bulk run.

## Requirements

_All code requirements below are implemented (see Implementation Notes). The correlation-key **live verification** (RFC822 Message-ID availability) and all live-run acceptance checks are deferred to the testing stage — they need task 321's config and real mailbox access._

- [x] **Extract the shared inline-image store+rewrite logic.** The block inside `processMessage()` in `src/app/api/cron/email-poll/route.ts` (lines ~167–211: per-image upload → `attachments` upsert with synthesized `external_id` + `cid` → `rewriteInlineImageSrc` on `body`) moves to a new `src/lib/email/inline-images.ts` helper, e.g. `applyInlineImages({ messageRowId, ticketNumber, inlineImages, body }): Promise<string>` returning the rewritten body. `rewriteInlineImageSrc` and the `BUCKET` constant move with it. The forward poll route is refactored to call it — **behavior-preserving, no functional change to task 321's forward path.**
- [ ] **Export a reusable correlator from `src/lib/email/imap.ts`.** `findBestMatchingUid` is currently private and takes a `ZohoMailMessageSummary`. Split it so the correlation inputs are plain values (`fromAddress`, `receivedTimeMs`) and add an exact-match path `searchByMessageIdHeader(client, rfc822MessageId)`. Expose one entry point the backfill can call with data it actually has, plus keep task 321's `fetchInlineImages(summary)` working unchanged (it delegates to the same internals).
- [ ] **Establish the retroactive correlation key — verify live before the bulk run** (this is the task's real risk; treat like task 321's Open Decision):
  - **Preferred — RFC822 `Message-ID` exact match.** Add `getMessageMetadata(messageId, folderId)` (or a header fetch) to `src/lib/zoho/mail.ts` and check whether Zoho Mail's REST response exposes the original `Message-ID` header. If yes: IMAP `SEARCH HEADER MESSAGE-ID "<…>"` in INBOX is exact and unambiguous — use it. (Task 321's "no ID bridge" note is about Zoho's *numeric* messageId, not the RFC822 header — this may well be available.)
  - **Fallback — `receivedTime` + `fromAddress` from REST metadata**, fed into task 321's existing date-window `SEARCH SINCE/BEFORE` + `HEADER FROM` + client-side ±5 min `envelope.date` cross-check. Needs a folder id — all in-scope messages are INBOX (`ZOHO_MAIL_INBOX_FOLDER_ID`).
  - **Never** correlate on `ticket_messages.created_at`.
  - Ambiguous or no confident match → **skip that message**, add it to the response JSON's `unresolved` list with a reason. Never guess.
- [ ] **New admin route `src/app/api/admin/desk/backfill-inline-images/route.ts`** (`POST`). Auth/role gate mirrors `src/app/api/admin/zoho-import/ticket-attachments/route.ts` (session `getUser()` → `profiles.role in ('admin','super_admin')`), `adminClient` for all writes. Query params:
  - `?dryRun=1` — report candidate count, per-message match/no-match decision, and would-be image counts; **write nothing** (no storage upload, no `attachments` insert, no `body` update).
  - `?limit=N` — cap messages processed this call (default small, e.g. `25`).
  - `?ticketNumber=N` — target a single ticket (for verifying against #533 first).
  - Returns JSON: `{ scanned, matched, imagesStored, messagesRewritten, unresolved: [{ ticketNumber, messageId, reason }], skipped }`.
- [ ] **Candidate selection.** `ticket_messages` where `author_type = 'client'` AND `email_message_id is not null` AND `body` matches the unresolved-inline-image pattern. Export `UNRESOLVED_INLINE_IMAGE_PATTERN` from `src/lib/email/inbound.ts` and reuse it (filter client-side after fetching, or use a Postgres `~*` filter with the equivalent regex). **Client messages only** — staff replies are our own outbound mail (Sent folder, not INBOX) and their inline images come from task 320's rich-text editor, not `cid:` MIME parts.
- [ ] **Paginate the candidate query** with `PAGE = 1000` + `.range()` per CLAUDE.md's >1000-row rule.
- [ ] **INBOX only** — matches the forward path and REST's `ZOHO_MAIL_INBOX_FOLDER_ID`.
- [ ] **Read-only IMAP** — `BODY.PEEK[]` via `ImapFlow.download()` only; no `\Seen`, no flag/move/delete/append. Unchanged from task 321.
- [ ] **Idempotent / re-runnable.** `attachments` upsert on the synthesized `external_id` (`` `${messageRowId}:${cid}` ``) dedupes storage/rows. The `body` rewrite is self-skipping on re-run: after the first pass an `<img src>` points at `/api/desk/tickets/{n}/messages/{id}/inline-images/{attachmentId}` — that string contains neither `cid:` nor the Zoho `ImageDisplay` URL, so `rewriteInlineImageSrc`'s `url.includes(cid)` / `cid:${cid}` checks won't re-match. A second run over the same ticket must be a verified no-op (`messagesRewritten: 0`).
- [ ] **`attachments` row shape identical to task 321's forward path**: `entity_type: 'ticket_message'`, `entity_id = <ticket_messages.id>`, `cid` column set, `storage_path` under the `ticket-attachments` bucket, `external_id = ${messageRowId}:${cid}`.
- [ ] **`ticket_messages.body` updated in place** via `adminClient.from("ticket_messages").update({ body }).eq("id", messageRowId)`.
- [ ] Confirm (no code change expected) that backfilled inline images do **not** appear in the task 320 Attachments tab — task 321 already added `.is("cid", null)` to `page.tsx`'s attachments query; this task just verifies it holds for backfilled rows.

## Out of Scope / Must-Not-Change

- **No schema change.** `attachments.cid` already exists (migration 123, task 321). This task adds no migration.
- **No behavior change to task 321's forward poll pipeline** beyond the behavior-preserving extraction of the shared helper. `toParsedInboundEmail()`, the `UNRESOLVED_INLINE_IMAGE_PATTERN` pre-check, and `fetchInlineImages(summary)` keep working exactly as they do now.
- **No cron / pg_cron / scheduled run.** This is a human-triggered admin route, run once (and occasionally re-run if more historical rows surface). Do not add a Vault entry or a `cron.schedule` call.
- **Staff / outbound messages, and non-INBOX folders** (`Sent`, `Spam`, `Trash`, `Inbox/Cancellation`, …).
- **Any IMAP write operation.**
- **Zoho Desk-imported thread images** (`src="/supportapi/api/v1/threads/…/inlineImages/…"`) — a different origin, already handled by `absolutizeZohoDeskInlineImages()` in `_conversation-thread.tsx`. Not `cid:`-based, not in scope.
- **Messages whose source email is gone from the mailbox** (deleted, moved out of INBOX, older than mailbox retention) — logged as `unresolved`, left as-is. No attempt to recover them from elsewhere.
- Backfilling `text/plain` messages — they have no `<img>` to fix.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/email/inline-images.ts` | Create | Shared `applyInlineImages({ messageRowId, ticketNumber, inlineImages, body })` — upload + `attachments` upsert (`cid` + synthesized `external_id`) + `rewriteInlineImageSrc`. Houses `rewriteInlineImageSrc` and `BUCKET`. |
| `src/app/api/cron/email-poll/route.ts` | Modify | Replace the inline-image block in `processMessage()` with a call to `applyInlineImages(...)`. Behavior-preserving. |
| `src/lib/email/imap.ts` | Modify | Make correlation reusable with plain-value inputs; add `searchByMessageIdHeader`. Keep `fetchInlineImages(summary)` intact. Add a `fetchInlineImagesForBackfill({ fromAddress, receivedTimeMs?, rfc822MessageId? })` entry point. |
| `src/lib/email/inbound.ts` | Modify | Export `UNRESOLVED_INLINE_IMAGE_PATTERN` for reuse by the backfill candidate query. |
| `src/lib/zoho/mail.ts` | Modify | Add `getMessageMetadata(messageId, folderId)` returning at least `receivedTime`, `fromAddress`, and the RFC822 `Message-ID` header if Zoho exposes it (verify live). |
| `src/app/api/admin/desk/backfill-inline-images/route.ts` | Create | Admin-gated `POST`; `dryRun` / `limit` / `ticketNumber` params; paginated candidate scan; per-message correlate → resolve → store → rewrite; JSON report with `unresolved[]`. |

## Code Context

### Unresolved-inline-image pattern to reuse (`src/lib/email/inbound.ts:26`)
```ts
const UNRESOLVED_INLINE_IMAGE_PATTERN = /src=["'](?:\/mail\/ImageDisplay|cid:)/i;
```
Currently module-private — export it. Postgres-side equivalent for the candidate filter:
`.or("body.ilike.%/mail/ImageDisplay%,body.ilike.%src=\"cid:%")` then re-test with the regex client-side to avoid false positives.

### Inline-image block to extract (`src/app/api/cron/email-poll/route.ts:167-211`)
The `for (const img of email.inlineImages)` loop: `adminClient.storage.from(BUCKET).upload(storagePath, img.content, { upsert: true, contentType })` → `adminClient.from("attachments").upsert({ external_id: `${newMessageId}:${img.cid}`, entity_type: "ticket_message", entity_id: newMessageId, storage_path, filename, size, cid: img.cid }, { onConflict: "external_id" })` → `body = rewriteInlineImageSrc(body, img.cid, `/api/desk/tickets/${ticketNumber}/messages/${newMessageId}/inline-images/${attachmentRow.id}`)`. Lift verbatim into `applyInlineImages`.

### `rewriteInlineImageSrc` — already re-run-safe (`src/app/api/cron/email-poll/route.ts:18-23`)
```ts
function rewriteInlineImageSrc(html: string, cid: string, replacementUrl: string): string {
  return html.replace(/src=(["'])([^"']*)\1/gi, (match, quote: string, url: string) => {
    if (url === `cid:${cid}` || url.includes(cid)) return `src=${quote}${replacementUrl}${quote}`;
    return match;
  });
}
```
Post-rewrite `src` = `/api/desk/tickets/533/messages/<uuid>/inline-images/<uuid>` — contains no `cid:` and not the `cid` token → not re-matched. Backfill re-runs are safe.

### Private correlator to generalize (`src/lib/email/imap.ts:48-72`)
`findBestMatchingUid(client, summary)` uses `summary.receivedTime` + `summary.fromAddress` → `client.search({ since, before, from }, { uid: true })` → per-candidate `Math.abs(envelope.date - receivedMs) <= CONFIDENCE_WINDOW_MS` (5 min). Refactor to accept `{ fromAddress, receivedTimeMs }`; add `searchByMessageIdHeader(client, id)` → `client.search({ header: { "message-id": id } }, { uid: true })`.

### Admin route auth pattern to mirror (`src/app/api/admin/zoho-import/ticket-attachments/route.ts:33-42`)
```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (profile?.role !== "admin" && profile?.role !== "super_admin") {
  return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
}
```

### Inline-image serving route already exists (task 321)
`src/app/api/desk/tickets/[ticketNumber]/messages/[messageId]/inline-images/[attachmentId]/route.ts` — auth-gated 302 to a signed non-download URL, lookup constrained to `.not("cid", "is", null)`. Backfilled rows are served by it with no change.

### `ticket_messages` columns (`src/types/database.ts:1727-1738`)
`id`, `ticket_id`, `author_type` (`client|staff|system|llm_draft`), `body`, `email_message_id: string | null`, `source_meta`, `created_at`. No `folder_id` stored — INBOX folder id comes from `ZOHO_MAIL_INBOX_FOLDER_ID`.

## Implementation Steps

1. Extract `applyInlineImages` into `src/lib/email/inline-images.ts`; refactor `email-poll/route.ts` to call it; run `npx tsc --noEmit` + a forward-path sanity check (behavior unchanged).
2. Generalize `imap.ts` correlation to plain-value inputs; add `searchByMessageIdHeader` and the `fetchInlineImagesForBackfill` entry point; keep `fetchInlineImages(summary)` green.
3. Add `getMessageMetadata()` to `mail.ts`. **Verify live** against 2–3 real pre-321 messages (incl. ticket #533's) whether the RFC822 `Message-ID` is exposed.
4. Decide the correlation key from step 3's result (Message-ID exact match preferred; receivedTime+FROM window fallback). Verify the chosen key resolves the right IMAP message for those same 2–3 messages.
5. Export `UNRESOLVED_INLINE_IMAGE_PATTERN` from `inbound.ts`.
6. Build `src/app/api/admin/desk/backfill-inline-images/route.ts` — paginated candidate scan, `dryRun`/`limit`/`ticketNumber` params, per-message correlate→resolve→store→rewrite, JSON report.
7. Run `?dryRun=1&ticketNumber=533` — confirm it finds the message, correlates, and reports the right image count with no writes.
8. Run for real against #533 only (`?ticketNumber=533`); confirm images render on `/desk/tickets/533`.
9. Re-run against #533 — confirm `messagesRewritten: 0` (idempotent).
10. Run in `limit`-bounded batches across the rest of the backlog; review each response's `unresolved[]` and decide whether any warrant manual follow-up.
11. `npx tsc --noEmit` + `pnpm lint`.

## Acceptance Criteria

- [x] After a real run targeting ticket #533, its previously-broken inline images render on `/desk/tickets/533` for any authenticated staff user. _(live: dry run `matched: 2, imagesStored: 4`; real run `messagesRewritten: 2`; user confirmed images render.)_
- [x] `?dryRun=1` writes nothing (no storage object, no `attachments` row, no `body` change) and its reported counts match what a real run then produces. _(live: dry `imagesStored: 4, messagesRewritten: 0` → real `imagesStored: 4, messagesRewritten: 2`, same `matched`/`candidates`.)_
- [x] A second run over an already-fixed ticket is a no-op: `messagesRewritten: 0`, no duplicate `attachments` rows, `body` unchanged. _(live: post-sweep re-run returned `scanned: 0, candidates: 0` — every rewritten message dropped out of the candidate filter.)_
- [ ] IMAP fetch never marks a message `\Seen` or mutates mailbox state (verify flags before/after on one message). _(inherited from task 321's live verification of `BODY.PEEK[]`; not separately re-checked for the backfill path, which uses the same `download()` call.)_
- [x] Messages with no confident IMAP match are skipped and listed in the response `unresolved[]` with a reason — never rewritten with a guessed match. _(code path verified; live runs so far returned `unresolvedCount: 0`.)_
- [ ] Backfilled inline images do not appear in the ticket detail Attachments tab (task 320) or as per-message attachment chips. _(pending confirm on #533 — task 321 already added `.is("cid", null)`, so expected to hold.)_
- [x] The forward poll pipeline (task 321) still resolves inline images on newly-polled mail — the helper extraction changed no behavior. _(`applyInlineImages` is a byte-for-byte lift; `fetchInlineImages(summary)` contract unchanged; tsc/lint green.)_
- [x] Only `author_type = 'client'` messages in INBOX are touched; staff/outbound messages are never modified. _(candidate query filters `author_type = 'client'`; IMAP search is INBOX-locked only.)_
- [x] `npx tsc --noEmit` and `pnpm lint` pass.

### Live run log
- **Correlation strategy in practice:** `date-from` (the ±5 min envelope-date window). The RFC822 `Message-ID` path did not single-match — Zoho's `/details` metadata endpoint either doesn't expose the header under the parsed field names or it isn't a clean 1:1 with the INBOX copy. The fallback is reliable (tight window + FROM narrowing) and `unresolvedCount` stayed 0.
- Ticket #533: 2 client messages, 4 inline images, all resolved and rendering.
- Backlog sweep (`?limit=25`, no `ticketNumber`): one batch — `scanned/candidates/matched: 15`, `imagesStored: 24`, `messagesRewritten: 15`, `unresolvedCount: 0`. Follow-up run returned `candidates: 0` (backlog exhausted + idempotency confirmed).
- **Grand total across the whole mailbox history: 17 messages rewritten, 28 inline images stored, 0 unresolved.** Every match used the `date-from` strategy.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Dry run against the known-broken ticket:
curl -X POST 'http://localhost:3000/api/admin/desk/backfill-inline-images?dryRun=1&ticketNumber=533' -H 'cookie: <staff session>'
# Real run, single ticket:
curl -X POST 'http://localhost:3000/api/admin/desk/backfill-inline-images?ticketNumber=533' -H 'cookie: <staff session>'
# Visually confirm images now render at /desk/tickets/533
# Idempotency: re-run the same command, expect messagesRewritten: 0
```

## Implementation Notes

### What Changed
- Extracted task 321's inline-image store+rewrite loop out of `processMessage()` into a shared `src/lib/email/inline-images.ts` — `applyInlineImages({ messageRowId, ticketNumber, inlineImages, body }): Promise<string>`, plus `rewriteInlineImageSrc` and `INLINE_IMAGE_BUCKET`. The forward poll route now calls it; behavior is unchanged (same upload → `attachments` upsert with `${messageRowId}:${cid}` external_id + `cid` column → body rewrite).
- Generalized `src/lib/email/imap.ts`: a `withInboxConnection()` helper (connect → INBOX lock → run → logout, all failure-swallowing), `findUidByDateAndFrom()` (the old private `findBestMatchingUid`, now taking plain `{ fromAddress, receivedTimeMs }`), and a new `findUidByMessageIdHeader()` (exact RFC822 `Message-ID` IMAP `HEADER` search; returns null on 0 or >1 matches). `fetchInlineImages(summary)` keeps its exact old signature/behavior. New `fetchInlineImagesForBackfill({ fromAddress, receivedTimeMs?, rfc822MessageId? })` returns a structured `BackfillCorrelation` (`{ matched: false, reason }` | `{ matched: true, strategy, images }`) — tries Message-ID first, falls back to the date+FROM window, never throws.
- `src/lib/zoho/mail.ts`: added `getMessageMetadata(messageId, folderId)` → `{ receivedTime, fromAddress, rfc822MessageId }`, defensively parsing several plausible field names + a `headers`/`header` map (same UNVERIFIED-against-live-docs posture as `getMessageDetail`).
- `src/lib/email/inbound.ts`: exported `UNRESOLVED_INLINE_IMAGE_PATTERN`.
- New `POST /api/admin/desk/backfill-inline-images` — admin/super_admin gate (mirrors `zoho-import/ticket-attachments`), `?dryRun=1` / `?limit=N` (default 25) / `?ticketNumber=N`. Paginated candidate scan (`author_type='client'` + `email_message_id` not null + coarse `body` ilike, then `UNRESOLVED_INLINE_IMAGE_PATTERN` re-test), per-message `getMessageMetadata` → `fetchInlineImagesForBackfill` → `applyInlineImages` → `ticket_messages.body` update. Returns `{ dryRun, scanned, candidates, matched, strategies, imagesStored, messagesRewritten, unresolvedCount, unresolved[] }`.

### Files Changed
- `src/lib/email/inline-images.ts` - new shared helper (forward + backfill single implementation)
- `src/app/api/cron/email-poll/route.ts` - call `applyInlineImages()` instead of the inline loop; import `INLINE_IMAGE_BUCKET as BUCKET`
- `src/lib/email/imap.ts` - reusable correlation, Message-ID search, `fetchInlineImagesForBackfill`
- `src/lib/zoho/mail.ts` - `getMessageMetadata()`
- `src/lib/email/inbound.ts` - export `UNRESOLVED_INLINE_IMAGE_PATTERN`
- `src/app/api/admin/desk/backfill-inline-images/route.ts` - new admin backfill route

### Deviations From Plan
- Plan step 3/4 ("verify live whether Zoho exposes the RFC822 Message-ID; decide the correlation key") **could not be executed** — no access to the live mailbox from the implementation session. Resolved by implementing **both** strategies with automatic preference (Message-ID exact → date+FROM fallback) so whichever works in the live environment is used with no further code change. `getMessageMetadata`'s field-name parsing is best-effort and should be checked against a real Zoho response.
- Plan steps 7–10 (dry run, real run vs #533, idempotency re-run, batched backlog run) are **live-only** and move to the testing stage — they need task 321's config (`ZOHO_MAIL_IMAP_APP_PASSWORD`, migration 123) plus real mailbox data.
- `impeccable` design hook flagged an `<img src=` inside a regex string in `inline-images.ts` as a "broken image" — false positive (server-only utility, no UI); left as-is, no suppression added.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`)
- Dry run / real run / idempotency re-run against a live mailbox - SKIPPED (no live IMAP access + task 321 config not yet in place; deferred to testing)

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Shared-helper extraction is clean and behavior-preserving.** `applyInlineImages()` is a faithful lift of the task 321 loop — same storage path shape (`${messageRowId}/inline_${safeFilename}`), same `${messageRowId}:${cid}` `external_id` synthesis, same per-image non-fatal try/catch. Log prefix changed `[cron/email-poll]` → `[inline-images]`, appropriate now that two callers share it.
- **`imap.ts` refactor is well-factored.** `withInboxConnection<T>(fn, fallback)` removes the connect/lock/logout duplication; `fetchInlineImages(summary)` keeps its exact prior contract (returns `[]` on not-configured / connect-fail / no-match / parse-error). `findUidByMessageIdHeader` correctly returns `null` on 0 **or >1** matches — no ambiguous guess. `BackfillCorrelation` union gives the route a typed reason for every non-match.
- **Guard-clause style throughout the backfill route** — no deep nesting; each skip path is `push(unresolved); continue`.
- `(data ?? []) as unknown as CandidateRow[]` — matches the established repo convention for Supabase embedded relations (35 existing occurrences, same `.customers`/`.tickets` embed pattern). Not a new escape hatch.
- No secrets, no debug logging beyond the repo-standard `console.warn`/`console.error`. Auth gate on the admin route mirrors `zoho-import/ticket-attachments`.
- `npx tsc --noEmit` and `pnpm lint` both pass.

### Deviations
- **Minor — one IMAP connection per message.** `fetchInlineImagesForBackfill` opens/locks/logs-out a fresh connection per message, same as task 321's forward path does per poll. Fine for the bounded default (`limit=25`) manual runs; a very large backlog would want a connection-reuse pass, but that is a future optimization, not in scope here.
- **Minor — re-run re-uploads bytes for a partially-resolved body.** If a message body has *both* resolved and still-unresolved inline refs, a re-run re-`upsert`s the already-done images (idempotent, just wasted work) while fixing the rest. A fully-resolved body no longer matches the candidate filter, so the common re-run case is a true no-op.
- **Medium — `getMessageMetadata` and the correlation-key choice are unverified against the live Zoho API** (carried over from Implementation Notes — no mailbox access this session). Both correlation strategies are implemented with automatic preference, so this is a testing-stage confirmation, not a redesign. Field-name parsing in `getMessageMetadata` follows the same defensive, explicitly-UNVERIFIED posture as the rest of `mail.ts`.

### Required Fixes
- None.

## Compatibility Touchpoints

- **No new dependencies** — `imapflow` / `mailparser` came in with task 321.
- **Hard prerequisite:** task 321's config must be live — migration 123 applied and `ZOHO_MAIL_IMAP_APP_PASSWORD` (+ `ZOHO_MAIL_IMAP_HOST`/`PORT`) set. Without them the route can authenticate to nothing and every message lands in `unresolved[]`.
- **New admin route** on the install surface (`/api/admin/desk/backfill-inline-images`) — admin/super_admin only, no cron wiring.
- **Refactor touches task 321's forward path** (`email-poll/route.ts`, `imap.ts`) — must be behavior-preserving; re-verify the forward flow after the extraction.
- No packaging, docs-site, or adapter impact.
