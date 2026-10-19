# 456: Zoho Mail inbound attachments never ingested — fix `getMessageDetail()` + backfill stored messages

**Created:** 2026-10-19
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned (Part A already applied in the working tree during the audit; Part B not started)

---

## Overview

Emails polled from the helpdesk Zoho Mail inbox never get their regular (non-inline) attachments in the Hub Desk Inbox. Example: ticket **#21108 "Logo Additions"** — Zoho Mail shows `Glaukos-logo.jpg` (19.5 KB) and `Logo.jpg` (58.4 KB), but the Hub ticket shows **0 Attachments**.

**Ingest path (as built, task 303/318):**

1. `POST /api/cron/email-poll` → `listNewMessages()` (inbox folder, cursor `helpdesk`).
2. Per message → `toParsedInboundEmail()` (`src/lib/email/inbound.ts`) → `getMessageDetail()` (`src/lib/zoho/mail.ts`) for body **and attachment list**.
3. `processMessage()` loops `email.attachments`: `downloadAttachment()` → upload to `ticket-attachments` bucket at `<messageRowId>/<attachmentId>_<safeName>` → upsert `attachments` row (`entity_type='inbox_message'`, `entity_id` = message row id, `external_id` = Zoho attachmentId, `cid` null).
4. Ticket page (`desk/inbox/[inboxId]/page.tsx`) reads `attachments` where `entity_type='inbox_message'` and `cid is null`; Attachments tab + chips render them. **This side is correct.**

**Root cause:** step 2 read attachments from Zoho's **Get Email Content** endpoint (`/messages/{id}/content`). Per Zoho docs that endpoint returns only `{ messageId, content }` — never attachments. The code was flagged "UNVERIFIED" in its own header. So `detail.attachments` was always `[]`, the loop in step 3 never ran, and nothing was logged. **Every** polled email is affected, not just #21108.

Attachment ids come from **Get Email Attachment Info** — `GET /api/accounts/{accountId}/folders/{folderId}/messages/{messageId}/attachmentinfo` (zoho.com/mail/help/api/get-attach-info.html):

```json
{ "data": {
  "attachments": [ { "attachmentSize": 6737, "attachmentName": "test.odt", "attachmentId": "138907275303090130" } ],
  "inline":      [ { "attachmentSize": 71730, "attachmentName": "import.jpg", "attachmentId": "…", "cid": "…" } ],
  "messageId": "1671434730313114778" } }
```

The download endpoint (`/messages/{id}/attachments/{attachmentId}`, zoho.com/mail/help/api/get-attachment-content.html) is the one the code already used — it is now confirmed, and documents `Accept: application/octet-stream`.

## Requirements

### Part A — forward fix (applied during audit, needs live verification)
- [x] `getMessageDetail()` gets the attachment list from `/attachmentinfo` (`data.attachments[]` → `attachmentId`, `attachmentName`, `attachmentSize`). `inline[]` is ignored (still IMAP, task 321).
- [x] `downloadAttachment()` sends `Accept: application/octet-stream` (overrides `zohoMailFetch`'s JSON default).
- [ ] Verified live: a new email with an attachment to helpdesk@ lands with its files on the ticket.

### Part B — backfill already-stored messages
- [ ] Admin-only, manually triggered, bounded, re-runnable route `POST /api/admin/desk/backfill-email-attachments`, same shape as `backfill-inline-images`: `?dryRun=1`, `?limit=N` (default 25), `?ticketNumber=N`.
- [ ] Candidates: `inbox_messages` with `author_type='client'`, `email_message_id` not null, no `source_meta.attachmentsBackfilledAt` stamp, and **no** existing `attachments` row (`entity_type='inbox_message'`, `cid is null`) for that message. Newest first, paginated with `.range()` (PAGE = 1000, SCAN_CAP 10000).
- [ ] Per candidate: `/attachmentinfo` (folder = `ZOHO_MAIL_INBOX_FOLDER_ID`) → download + store each attachment with the **same** code the poll uses (shared helper, see Part C) → stamp `source_meta.attachmentsBackfilledAt` (merge, never overwrite other keys) so messages with genuinely no attachments are not re-checked forever.
- [ ] A Zoho failure for a message (e.g. moved out of INBOX → 4xx, or deleted) is reported in `unresolved[]` with the reason and **not** stamped, so a later run can retry it. One failure never aborts the run.
- [ ] Response: `{ dryRun, scanned, candidates, checked, withAttachments, attachmentsStored, unresolvedCount, unresolved[] }`. Dry run calls `/attachmentinfo` (read-only) but downloads/writes nothing.

### Part C — shared store helper (no behaviour change)
- [ ] Move the per-attachment loop from `email-poll/route.ts` (lines ~326–359: size cap, download, sanitized path, upload, upsert on `external_id`) into `storeEmailAttachments({ messageRowId, zohoMessageId, folderId, attachments })` in `src/lib/email/attachments.ts`, returning `{ stored, failed: {attachmentId, reason}[] }`. Poll route and backfill both call it. Keeps the existing per-attachment try/catch (a failed file never fails the message).

## Out of Scope / Must-Not-Change

- Inline (`cid:`) images — still IMAP (`imap.ts`, `inline-images.ts`, task 321/322/341). Using `/attachmentinfo`'s `inline[]` to replace IMAP is a possible follow-up, not this task.
- **Sent-folder staff replies** (`sent-ingest.ts`) — do not ingest attachments today; adding that is a follow-up (also note it now pays the extra `/attachmentinfo` call and discards the result).
- StackShift direct tickets / Desk-polled tickets — separate attachment paths (task 447, Desk import).
- Ticket detail UI, Attachments tab, `file-url` route — already correct.
- No migration. `attachments.external_id` already has a global UNIQUE constraint (migration 035); `source_meta` is existing jsonb.
- No cron for the backfill.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/zoho/mail.ts` | Modify (done) | `getAttachmentInfo()` via `/attachmentinfo`; octet-stream Accept on download; update stale "UNVERIFIED" header lines for these two endpoints |
| `src/lib/email/attachments.ts` | Create | `storeEmailAttachments()` — extracted from the poll route |
| `src/app/api/cron/email-poll/route.ts` | Modify | Call the shared helper instead of the inline loop |
| `src/app/api/admin/desk/backfill-email-attachments/route.ts` | Create | Part B backfill |
| `CLAUDE.md` | Modify | One line under the inbound-email conventions: attachments come from `/attachmentinfo`, not `/content`; backfill route + params |

## Code Context

### File: `src/lib/zoho/mail.ts` (as fixed)

```ts
return { htmlContent, textContent, attachments: await getAttachmentInfo(accountId, folderId, messageId) };
…
async function getAttachmentInfo(accountId, folderId, messageId) {
  const res = await zohoMailFetch(`/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachmentinfo`, { method: "GET" });
  if (!res.ok) throw new Error(`Zoho Mail get attachment info failed: HTTP ${res.status} …`);
  const rows = (json.data?.attachments ?? []) …
  return rows.map((a) => ({ attachmentId: String(a.attachmentId), fileName: a.attachmentName || "attachment", size: Number(a.attachmentSize ?? 0) }));
}
```

Export `getAttachmentInfo` for the backfill (it needs the list without the body).

### File: `src/app/api/cron/email-poll/route.ts` — loop to extract

```ts
for (const att of email.attachments) {
  try {
    if (att.size > MAX_SIZE) { …skip… }
    const buffer = await downloadAttachment(summary.messageId, summary.folderId, att.attachmentId);
    const safeFilename = att.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${newMessage.id}/${att.attachmentId}_${safeFilename}`;
    await adminClient.storage.from(BUCKET).upload(storagePath, buffer, { upsert: true });
    await adminClient.from("attachments").upsert({ external_id: att.attachmentId, entity_type: "inbox_message",
      entity_id: newMessage.id, storage_path: storagePath, filename: att.fileName, size: att.size }, { onConflict: "external_id" });
  } catch (e) { console.error(…) }
}
```

`MAX_SIZE` = 50 MB (bucket limit, migration 117); `BUCKET` = `"ticket-attachments"` (`INLINE_IMAGE_BUCKET`).

### File: `src/app/api/admin/desk/backfill-inline-images/route.ts` — pattern to copy

Auth (session → `profiles.role` admin/super_admin else 403), `ZOHO_MAIL_INBOX_FOLDER_ID` required, `dryRun`/`limit`/`ticketNumber` parsing, `ticketNumber` → `inbox.id` lookup, paginated candidate scan, `unresolved[]` with `{ ticketId, messageId, reason }`. The attachment backfill is simpler: `inbox_messages.email_message_id` **is** the Zoho messageId, so no IMAP/metadata correlation is needed — only the folder can be wrong (message moved), which surfaces as a Zoho error.

### Notes
- Upload uses `upsert: true` and the row upserts on `external_id`, so re-running after a partial failure is safe.
- Candidate exclusion query: fetch candidate message ids per page, then one `attachments` `.in("entity_id", ids).eq("entity_type","inbox_message").is("cid", null)` lookup to drop those already holding files.

## Implementation Steps

1. Export `getAttachmentInfo` from `mail.ts`; refresh the header comment (content/attachmentinfo/download now confirmed).
2. Create `src/lib/email/attachments.ts` with `storeEmailAttachments()`; swap the poll route's loop for it (same logs, same skip rules).
3. Create the backfill route per Part B.
4. `npx tsc --noEmit`, `pnpm lint`.
5. Live: send a test email with 2 attachments to helpdesk@, trigger the poll, confirm the ticket shows them.
6. Backfill: `?ticketNumber=21108&dryRun=1` → expect 2 attachments listed; run without `dryRun`; confirm #21108 shows `Glaukos-logo.jpg` + `Logo.jpg` and both open/download. Then dry-run wider (`?limit=50&dryRun=1`), review `unresolved`, run in batches until `candidates: 0`.
7. Add the CLAUDE.md line.

## Acceptance Criteria

- [ ] New inbound email with attachments → files appear in the ticket's Attachments tab and on the message, viewable and downloadable.
- [ ] Ticket #21108 shows its two logos after the backfill.
- [ ] Backfill dry run writes nothing (no storage objects, no rows, no stamps).
- [ ] Re-running the backfill does not duplicate files or rows and skips stamped messages.
- [ ] A message Zoho can no longer find is reported in `unresolved` and does not stop the run.
- [ ] Non-admin → 403; no session → 401.
- [ ] Inline-image behaviour unchanged (cid images still render in the body and stay out of the Attachments tab).

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Backfill (signed in as admin in the browser, or with the session cookie):
curl -X POST "http://localhost:3000/api/admin/desk/backfill-email-attachments?ticketNumber=21108&dryRun=1" -b "<session cookie>"
curl -X POST "http://localhost:3000/api/admin/desk/backfill-email-attachments?ticketNumber=21108" -b "<session cookie>"
```

Browser: open `/desk/inbox/<#21108 id>` → Attachments tab shows 2; open each preview.

## Compatibility Touchpoints

- One extra Zoho Mail API call per polled message (inbound **and** sent). Zoho's rate limits are still unpublished; watch for 429s in the poll log.
- `getMessageDetail()` now throws if `/attachmentinfo` fails → the poll stops at that message and retries it next run (no mail lost, but a persistent failure would block newer mail behind it). Same OAuth scope (`ZohoMail.messages.READ`), so no token change expected.
- No env, migration, or package changes.

## Implementation Notes

### What Changed
- `getMessageDetail()` now reads the attachment list from `/attachmentinfo` via the exported `getAttachmentInfo(messageId, folderId)`; `downloadAttachment()` sends `Accept: application/octet-stream`. Stale "UNVERIFIED" header/function comments updated to point at the confirmed Zoho doc pages.
- The poll's per-attachment loop moved verbatim into `storeEmailAttachments()`; it now also reports per-file failures (`{ stored, failed[] }`), and checks the `attachments` upsert error (the poll ignored it before). Over-50 MB files remain a log-only skip, not a failure (a retry can never succeed, so the backfill must still stamp the message).
- New admin backfill route per Part B. Dry run lists the files Zoho reports per message in `found[]` (also returned on a real run).

### Files Changed
- `src/lib/zoho/mail.ts` - `/attachmentinfo` lookup, octet-stream download, comment refresh
- `src/lib/email/attachments.ts` - new shared `storeEmailAttachments()`
- `src/app/api/cron/email-poll/route.ts` - uses the helper; drops now-unused `downloadAttachment`/`BUCKET`/`MAX_SIZE`
- `src/app/api/admin/desk/backfill-email-attachments/route.ts` - new backfill
- `CLAUDE.md` - inbound-email regular attachments convention

### Deviations From Plan
- Response adds `found[]` (ticket number + filenames per message with attachments) so a dry run shows exactly what would be stored.
- Known limit, not fixed: a message Zoho permanently can't find stays unstamped and is re-checked every run, taking a `limit` slot. If many such messages exist, newer backfill runs can stall on them — use `?ticketNumber=` or raise `?limit`; a follow-up could stamp permanent 4xx errors.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint` on the four changed TS files - PASS
- Live poll with a test email + #21108 backfill (dry run, then real) - SKIPPED (needs the running app with Zoho credentials and an admin session; operator step)

## Quality Gate Notes

### Result
FAIL

### Standards Review
- **Blocking — stored files get the wrong Content-Type.** `storeEmailAttachments()` (`src/lib/email/attachments.ts:32`) uploads the `ArrayBuffer` with only `{ upsert: true }`. With no `contentType`, supabase-js storage defaults to `text/plain;charset=UTF-8`, so the signed URL from `.../attachments/[attachmentId]/file-url` serves e.g. `Logo.jpg` as text. This was latent in the old poll loop (moved verbatim) but never ran until this task, so it ships with the fix. It threatens the acceptance criterion "viewable and downloadable". The sibling paths set it: `zoho-import/ticket-attachments/route.ts:163` passes the download's `content-type`; `inline-images.ts:63` passes `img.contentType`.
- Minor (non-blocking): `getMessageDetail()` comment "Field names not confirmed against live docs" is now half-stale (header says docs show `data.content`). Cosmetic.
- Minor (non-blocking): the backfill's `source_meta` stamp is read-modify-write; a concurrent writer to the same message's `source_meta` could be lost. Negligible for an admin-run backfill on old messages.
- Otherwise clean: no unused code (lint pass), typed rows, guard clauses, errors collected not thrown, no secrets/debug logs, `.range()` pagination + SCAN_CAP per CLAUDE.md, admin gate matches `backfill-inline-images`, poll behaviour unchanged except the added upsert-error check.

### Deviations
- Minor: `found[]` added to the backfill response — strictly diagnostic, within scope.
- Minor: helper also checks the `attachments` upsert error (old loop ignored it) — stricter, no behaviour change on success.
- Medium (accepted, documented): permanently-missing Zoho messages stay unstamped and occupy `limit` slots on every run. Operator workaround documented; follow-up candidate.
- Medium (accepted, pre-existing per Compatibility Touchpoints): `sent-ingest.ts` now pays an `/attachmentinfo` call per Sent message and discards it; a failure there throws for that message.

### Required Fixes
1. In `storeEmailAttachments()`, pass a real `contentType` on upload. Reuse the existing allowlist map: `extensionInfoFor(att.fileName)?.mime` from `@/config/attachment-types` (the same lookup `contentTypeFor()` in `src/lib/stackshift-support/attachments-logic.ts` wraps), falling back to `application/octet-stream`. No new helper needed.

## Implementation Notes — Quality Gate Fix (round 1)

### What Changed
- Required fix 1: `storeEmailAttachments()` now uploads with `contentType: extensionInfoFor(att.fileName)?.mime ?? "application/octet-stream"` (existing `@/config/attachment-types` map; jpg/jpeg/png → `image/*`), so signed URLs serve the real type.
- Also cleared the minor finding: `getMessageDetail()`'s stale "not confirmed" comment now matches the file header.

### Files Changed
- `src/lib/email/attachments.ts` - contentType on upload
- `src/lib/zoho/mail.ts` - comment only

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint src/lib/email/attachments.ts src/lib/zoho/mail.ts` - PASS

## Quality Gate Notes (round 2)

### Result
PASS

### Standards Review
- Round-1 blocker resolved: `storeEmailAttachments()` uploads with `contentType` from `extensionInfoFor()` (`@/config/attachment-types`, pure config, no new helper). `extensionOf()` lowercases, so `LOGO.JPG` resolves to `image/jpeg`; unknown extensions fall back to `application/octet-stream` (download, not preview) — acceptable.
- Round-1 minor comment finding cleared in `mail.ts`.
- No new issues: tsc + eslint PASS on the changed files.

### Deviations
- Unchanged from round 1 (all Minor/Medium, accepted): `found[]` diagnostic field; stricter upsert-error check; permanently-missing Zoho messages occupy backfill `limit` slots; `sent-ingest.ts` pays an unused `/attachmentinfo` call. The `source_meta` read-modify-write stamp remains a negligible, accepted risk.

### Required Fixes
- None.
