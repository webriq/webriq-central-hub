# 457: StackShift attachment hardening — Desk-poll gaps (D1–D3) + direct-API stored content type (S1/S3)

**Created:** 2026-10-19
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Follow-up audit to task 456 (Zoho Mail attachments never ingested). The two StackShift ticket paths have their **own** attachment code and do **not** have the 456 bug, but the audit found smaller gaps:

| Path | Code | Gaps |
|---|---|---|
| StackShift Support Center → Zoho Desk → Hub | `desk-ticket-poll` → `syncTicketMessages()` / `syncMessageAttachments()` in `src/lib/desk/stackshift-message-sync.ts` (tasks 388–392) | D1, D2, D3 |
| StackShift Support Center → Hub (direct API) | `uploads/sign` → StackShift PUTs to Storage → `verifyRegistered()` + `insertAttachmentRows()` in `src/lib/stackshift-support/attachments.ts` (task 447) | S1, S3 |

- **D1 — attachments on an empty-body Desk comment are dropped.** `upsertInboxMessage()` returns `null` when the body is empty, so `syncMessageAttachments()` never runs for it. An attachment-only reply is lost silently.
- **D2 — a failed Desk attachment download is never retried and leaves no signal.** `syncMessageAttachments()` logs and `continue`s; the poll only revisits a ticket when Desk's `modifiedTime` moves. Recovery today is a manual `backfill-stackshift-messages` run that nobody knows to trigger.
- **D3 — Desk uploads trust Zoho's response `content-type`.** If Zoho returns none or `application/octet-stream`, images download instead of previewing. If the header is absent, storage-js defaults to `text/plain` (confirmed in `@supabase/storage-js@2.108.2`, `dist/index.mjs:588`) — the same class as 456's gate finding.
- **S1 — direct-API files keep whatever content type StackShift sent on its PUT.** The integration doc says "PUT with the declared content-type" but the Hub never checks. A missing header means the object is stored as `text/plain` / `application/octet-stream`, and Hub previews break with no Hub-side signal.
- **S3 — direct-API `attachments.size` is StackShift's declared size**, never checked against the real object.

## Requirements

### Part 0 — measure first (read-only, before coding)
- [ ] Run in the Supabase SQL editor and paste the result into Implementation Notes:
  ```sql
  select case when name like 'stackshift-support/%' then 'direct' else 'desk/email/import' end as path,
         metadata->>'mimetype' as mimetype, count(*)
  from storage.objects where bucket_id = 'ticket-attachments'
  group by 1, 2 order by 1, 3 desc;
  ```
- [ ] Decide Part E from it: if any `text/plain`, `application/octet-stream` or null rows exist for image/PDF filenames, Part E (repair existing objects) is in scope; otherwise drop Part E.

### Part A — D3: content-type fallback on Desk uploads
- [ ] In `syncMessageAttachments()`, use Zoho's `content-type` only when it is specific; when it is missing, `application/octet-stream` or `text/plain*`, use `extensionInfoFor(filename)?.mime`, else `application/octet-stream`. Same lookup task 456 uses in `storeEmailAttachments()`.

### Part B — D1: keep attachments from empty-body Desk comments
- [ ] When a comment has **no body but has attachments**, do **not** create a new `inbox_messages` row. Attach its files to the opening thread's message (`openingThreadMessageId`), the same owner task 392 uses for ticket-level attachments.
- [ ] Why not create an empty message: the parity gate (`customerMessages()` / `compareMessages()` in `parity-logic.ts`) pairs customer messages by count. The direct API rejects empty bodies (`text()` = `.min(1)` in `schema.ts`), so an extra empty Desk message would create a permanent `count` mismatch and block sign-off.
- [ ] An empty-body **opening thread** stays as today (skipped; self-heals once Desk has a body). Record it in Implementation Notes if Part 0 or logs show it happens.

### Part C — D2: retry failed Desk attachment downloads automatically
- [ ] `syncMessageAttachments()` returns `failed` (count) alongside `added`; `syncTicketMessages()` sums it into its result (`attachmentsFailed`).
- [ ] When `attachmentsFailed > 0`, the poll stamps `inbox.source_meta.attachmentSyncFailedAt` (merge, keep other keys); when a later sync of that ticket finishes with `0`, it removes the stamp.
- [ ] Each `desk-ticket-poll` run, after the existing passes and within the existing 240 s budget, re-syncs **at most 10** stamped tickets (oldest stamp first) via `syncTicketMessages()`. Already-stored files are skipped before any network call, so a retry only re-downloads what failed.
- [ ] The run's JSON log line gains `attachmentRetries` / `attachmentsStillFailing` counts so the failure is visible in Vercel logs.

### Part D — S1 + S3: correct stored type and size on direct-API registration
- [ ] In `verifyRegistered()`, for each **newly** verified path (not `alreadyOwned`), call `adminClient.storage.from(ATTACHMENT_BUCKET).info(path)` after `verifyUploadedObject()` passes.
- [ ] If the stored content type is not the extension's expected mime (`extensionInfoFor(filename)?.mime`), repair it: download the object and re-upload it to the same path with `upsert: true` and the correct `contentType` (files are ≤ 25 MB by the sign-time cap). Log one `console.warn` naming the site and path, so the StackShift-side bug is visible.
- [ ] Return the real byte size from `info()` per path; `insertAttachmentRows()` stores that instead of the declared `f.size` (S3). Keep the declared size only if `info()` fails.
- [ ] A failed `info()` or repair must **not** fail the request (the file already passed the magic-byte check). Log and keep the stored object as-is.

### Part E — repair existing objects (only if Part 0 finds bad rows)
- [ ] Admin-only `POST /api/admin/desk/repair-attachment-content-types` (`?dryRun=1`, `?limit=N` default 25), same auth/param shape as `backfill-email-attachments`. Walks `attachments` rows (`entity_type='inbox_message'`, `cid is null`) whose stored object's `info()` type is generic or mismatched for its filename, and re-uploads each with the correct type. Reports `{ dryRun, scanned, mismatched, repaired, unresolved[] }`.

## Out of Scope / Must-Not-Change

- **S2** (a new direct comment whose attachment insert fails stays saved without files): it self-heals when StackShift retries with the same `commentRef`. No change.
- **S4** orphaned uploads: accepted trade-off from task 447.
- Desk **threads after the opening one** are not synced at all by `syncTicketMessages()` (only the opening thread plus comments). That's message coverage, not attachments: note only, do not change here.
- `verifyUploadedObject()` in `src/lib/uploads/attachment-storage.ts` is shared with task/issue attachments. Do not change it; Part D wraps it.
- The parity gate logic (`parity-logic.ts`) is unchanged; Part B is designed so it doesn't need to change.
- No migration (`source_meta` is existing jsonb; no new columns). No change to the StackShift contract or the signed-upload flow.
- Zoho Mail path (task 456): unchanged.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/desk/stackshift-message-sync.ts` | Modify | A: content-type fallback; B: route empty-body comment files to the opening message; C: return `failed` / `attachmentsFailed` |
| `src/app/api/cron/desk-ticket-poll/route.ts` | Modify | C: stamp/clear `attachmentSyncFailedAt`, bounded retry pass, log counts |
| `src/lib/stackshift-support/attachments.ts` | Modify | D: `info()` check, content-type repair, real size passed to `insertAttachmentRows()` |
| `src/lib/stackshift-support/create-ticket.ts`, `comment-status.ts` | Modify (small) | D: pass the verified sizes from `verifyRegistered()` into `insertAttachmentRows()` |
| `src/app/api/admin/desk/repair-attachment-content-types/route.ts` | Create (Part E only) | Repair existing mistyped objects |
| `CLAUDE.md` | Modify | One line each under the StackShift live-poll and direct-API bullets |

## Code Context

### `src/lib/desk/stackshift-message-sync.ts`

```ts
// comment loop — an empty body returns null, so the attachments below never sync (D1)
const upserted = await upsertInboxMessage(inboxId, String(raw.id), { ..., body: String(raw.content ?? raw.plainText ?? "") }, opts);
if (upserted) { const attachResult = await syncMessageAttachments(currentToken, upserted.id, raw.attachments ?? []); ... }

// upsertInboxMessage(): if (!fields.body) return null;

// syncMessageAttachments(): failures only log + continue (D2); content type straight from Zoho (D3)
if (throttleExhausted || !res.ok) { console.warn(...); continue; }
.upload(safeName, buffer, { upsert: true, contentType: res.headers.get("content-type") ?? undefined });
```

`openingThreadMessageId` is set before the comment loop runs, so Part B can use it directly. Existing files are skipped up front (`attachments.external_id` lookup before download), which is what makes Part C's retry cheap.

### `src/app/api/cron/desk-ticket-poll/route.ts`

`processTicket()` calls `await syncTicketMessages(token, externalId, inboxId);` (line ~376) and ignores the result. There are two passes (search + created), a 240 s run budget and `maxDuration = 300` (task 441). Add the retry pass after both passes and respect the same budget check.

### `src/lib/stackshift-support/attachments.ts`

```ts
for (const f of files) {
  if (alreadyOwned.has(f.path)) continue;
  const res = await verifyUploadedObject(adminClient, f.path, f.filename, ATTACHMENT_BUCKET);
  if (!res.ok) return { ok: false, path: f.path, message: res.reason };
}
...
insertAttachmentRows(messageId, files) // size: f.size  ← declared by StackShift (S3)
```

`storage.from(bucket).info(path)` exists in the installed `@supabase/storage-js@2.108.2` (`dist/index.d.mts:1369`). At implementation, confirm the field names it returns for content type and size (`contentType`/`size` vs `metadata.mimetype`/`metadata.size`) before relying on them.

### Shared lookup

`extensionInfoFor(filename)?.mime` from `@/config/attachment-types` (lowercases the extension; jpg/jpeg/png/pdf/... mapped). Task 456 uses it in `src/lib/email/attachments.ts`.

## Implementation Steps

1. Part 0: get the SQL result from the user/operator; decide Part E.
2. Part A in `syncMessageAttachments()`.
3. Part B in the comment loop of `syncTicketMessages()`.
4. Part C: `failed` count → `attachmentsFailed` → poll stamp/clear + retry pass + log fields.
5. Part D in `verifyRegistered()`; thread verified sizes into `insertAttachmentRows()` from both callers.
6. Part E only if Part 0 says so.
7. `npx tsc --noEmit`, `pnpm lint`; run the existing checks that touch these modules: `npx tsx _docs/task/447-attachments.check.ts`, `npx tsx _docs/task/449-parity.check.ts`.
8. CLAUDE.md lines.

## Acceptance Criteria

- [ ] A Desk image whose download response has no or a generic content type is stored as `image/*` and previews in the Hub.
- [ ] A Desk comment with files and no text: the files appear on the ticket (on the opening message), no empty message row is created, and the parity report for that site shows no new `count` mismatch.
- [ ] A Desk attachment that fails once (e.g. throttled) is stored on a later poll run without anyone running a backfill, and the ticket's `attachmentSyncFailedAt` stamp is cleared afterwards.
- [ ] A direct-API upload PUT without a content type ends up stored with the right type and previews; a warn log names the site and path.
- [ ] Direct-API `attachments.size` equals the real object size.
- [ ] A failing `info()` or repair never fails a create/comment request.
- [ ] Existing 447/449 checks still pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/447-attachments.check.ts
npx tsx _docs/task/449-parity.check.ts
# Direct API end-to-end (needs migrations applied + throwaway STACKSHIFT_SUPPORT_SECRET in .env.local):
npx tsx _docs/task/445-support-harness.ts --base http://localhost:3000
```

Manual:
- S1: in the harness or with curl, PUT a PNG to a signed URL **without** `Content-Type`, register it, then confirm `storage.objects.metadata->>'mimetype'` is `image/png` and the Hub previews it.
- D1/D2/D3: re-run the Desk poll against a StackShift test ticket with an attachment-only comment; check the attachment lands and the poll log counts.

## Compatibility Touchpoints

- **Parity gate (task 449):** Part B deliberately adds no message rows. Attaching files to the opening message does change per-message attachment placement on the Desk copy, but check (c) compares **ticket-level totals**, so the change raises the Desk total toward the true count instead of breaking it.
- **Desk step-down (task 450):** reconcile mode's `processTicket()` still calls `syncTicketMessages()` for refreshed rows; the retry pass must honour the same reconcile/skip decision (no retries for skipped/retired copies).
- **Zoho Desk API budget:** the retry pass is capped at 10 tickets per run and only re-downloads failed files.
- **Direct-API latency:** Part D adds one `info()` call per newly registered file, plus a download/re-upload only when StackShift sent the wrong type (≤ 10 files × 25 MB per request).
- No env, migration, package or contract changes. If S1 repairs show up in logs, tell the StackShift team to send `Content-Type` on the PUT (`_docs/plan/stackshift-app-hub-integration-instructions.md` D5 already requires it).

## Implementation Notes

### What Changed
- **A (D3):** `syncMessageAttachments()` uploads with `uploadContentType(header, filename)` — Zoho's header when specific, otherwise `extensionInfoFor(filename)?.mime`.
- **B (D1):** in the comment loop, files go to `upserted?.id ?? openingThreadMessageId`; an empty-body comment still creates no message row.
- **C (D2):** `syncMessageAttachments()` returns `failed` (throttled/non-OK fetch, upload error, row upsert error, exception; over-50 MB and missing id/href are skips, not failures); a failed ticket-level attachments listing counts as 1. `syncTicketMessages()` returns `attachmentsFailed`. `processTicket()` re-stamps `source_meta.attachmentSyncFailedAt` only when failures remain. Its own `inbox` upsert rewrites `source_meta` whole, so a clean sync clears the stamp with no extra write. New `runAttachmentRetries()` runs after the created-pass: up to 10 stamped `stackshift-desk-poll` rows, oldest stamp first, budget-checked, retired copies (task 450) have their stamp dropped. The run log/JSON gains `attachmentRetry: { attachmentRetries, attachmentsStillFailing }` (or `{ error }`).
- **D (S1/S3):** `verifyRegistered()` calls `fixStoredType()` for each newly verified path: `info()`, then download + `upload(upsert, contentType)` when the stored type ≠ the extension's, with a warn naming site + path; returns the real size. `VerifyOutcome.ok` now carries `sizes`; `insertAttachmentRows(messageId, files, sizes)` stores `sizes.get(path) ?? f.size`. Both callers pass `verified.sizes`. No step can fail the request.

### Files Changed
- `src/lib/desk/stackshift-message-sync.ts` - A, B, C (failure counts)
- `src/app/api/cron/desk-ticket-poll/route.ts` - C (stamp, retry pass, log field)
- `src/lib/stackshift-support/attachments.ts` - D
- `src/lib/stackshift-support/create-ticket.ts`, `src/lib/stackshift-support/comment-status.ts` - pass verified sizes
- `CLAUDE.md` - one addition each to the StackShift live-poll and direct-API bullets

### Deviations From Plan
- **Part 0 / Part E not done:** the storage query needs the operator (no DB access from the agent). Part E stays gated: run the Part 0 SQL; if it finds mistyped image/PDF objects, Part E is a follow-up implement round.
- Stamp clearing in `processTicket()` relies on its existing whole-object `source_meta` upsert, not an explicit `setAttachmentFailStamp(false)`. Same result, one write fewer.
- An empty-body comment with files when the ticket has no opening message yet (empty opening thread) is skipped without counting as a failure. Retrying could never succeed until Desk has an opening body, and the next sync of that ticket picks the files up once it does.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint` on the 5 changed TS files - PASS
- `npx tsx _docs/task/447-attachments.check.ts` - PASS
- `npx tsx _docs/task/449-parity.check.ts` - PASS
- `445-support-harness.ts` end-to-end + manual S1 PUT-without-Content-Type check + live Desk poll - SKIPPED (need a running app with migrations applied, a throwaway `STACKSHIFT_SUPPORT_SECRET`, and Zoho Desk credentials; operator step in the test stage)

## Quality Gate Notes

### Result
FAIL

### Standards Review
- **Blocking 1 — D1 fallback also fires on insert errors.** `upsertInboxMessage()` returns `null` both for an empty body (intended) **and** when a non-empty message's insert fails (`error || !inserted`). The new `ownerId = upserted?.id ?? openingThreadMessageId` then attaches that comment's files to the opening message. Because `attachments.external_id` is the idempotency key, they stay there even after the comment row is inserted on a later run, so the files show on the wrong message for good. The fallback must apply only when the comment body is empty.
- **Blocking 2 — D2 retries are unbounded.** Every failure (including a permanent Desk 404/403 for a deleted or inaccessible attachment) re-stamps the ticket, and `runAttachmentRetries()` re-syncs it on every run. Each retry costs a full `syncTicketMessages()`: threads list, content enrichment, comments list and ticket-attachments list, so about 4+ Desk calls per ticket even when only one file is bad. A permanently broken file keeps a ticket in rotation forever and spends Desk API credits every poll run. Needs an attempt cap.
- Minor (non-blocking): in `fixStoredType()`, a client that sends an equivalent but different type (e.g. `image/jpg`, `application/x-zip-compressed`) triggers a re-upload + warn every time. Harmless, slightly noisy.
- Minor (non-blocking): a retried comment re-registering a path it already owns skips `fixStoredType()`, so the upsert writes back the declared `f.size` over the real size stored the first time. Cosmetic.
- Minor (non-blocking): a ticket processed by the search/created passes can be retried again in the same run by `runAttachmentRetries()`. Redundant but bounded (≤10).
- Otherwise clean: tsc/eslint/447/449 PASS, no unused code, typed `info()` usage (`contentType`/`size`), failures never fail a request, reconcile-retired copies handled, run log extended as planned.

### Deviations
- Medium (accepted): Part 0 / Part E deferred to the operator (needs DB access); gated, documented.
- Minor: stamp clearing in `processTicket()` relies on the whole-object `source_meta` upsert.
- Minor: empty-body comment with no opening message yet is skipped, not counted as failed.

### Required Fixes
1. In the comment loop, fall back to `openingThreadMessageId` **only when the comment body is empty** (the same `String(raw.content ?? raw.plainText ?? "")` value passed to `upsertInboxMessage()`). A non-empty comment whose insert failed must skip its attachments and count them toward `attachmentsFailed`, so the ticket is retried and the files land on the right message once the row exists.
2. Cap D2 retries: keep a `source_meta.attachmentSyncAttempts` counter alongside `attachmentSyncFailedAt` (incremented by `setAttachmentFailStamp(…, true)`, removed with the stamp). When it reaches 5, clear both keys and `console.warn` the Desk ticket id ("giving up; run backfill-stackshift-messages after fixing"). Note the counter resets whenever `processTicket()` re-upserts the row (Desk ticket modified), which is acceptable: a changed ticket deserves a fresh try.

## Implementation Notes — Quality Gate Fix (round 1)

### What Changed
- **Required fix 1:** the comment loop computes `body` once; `ownerId = upserted?.id ?? (body ? null : openingThreadMessageId)`. A non-empty comment whose insert failed now skips its files and adds `raw.attachments.length` to `attachmentsFailed`, so the ticket is stamped and retried, and the files land on the comment's own row once it exists.
- **Required fix 2:** `setAttachmentFailStamp(inboxId, deskTicketId, failed)` keeps `source_meta.attachmentSyncAttempts`. On the 5th consecutive failure (`MAX_ATTACHMENT_ATTEMPTS`) it clears both keys and warns with the Desk ticket id ("giving up — run backfill-stackshift-messages after fixing"). A clean sync or a retired copy clears both. The counter resets when `processTicket()` re-upserts `source_meta` (Desk ticket modified).
- `CLAUDE.md` live-poll line updated with the cap and the empty-body-only fallback.

### Files Changed
- `src/lib/desk/stackshift-message-sync.ts` - fix 1
- `src/app/api/cron/desk-ticket-poll/route.ts` - fix 2
- `CLAUDE.md` - note update

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint` on the 2 changed TS files - PASS
- `npx tsx _docs/task/449-parity.check.ts` - PASS
- `npx tsx _docs/task/447-attachments.check.ts` - PASS

## Quality Gate Notes (round 2)

### Result
PASS

### Standards Review
- Round-1 blocker 1 resolved: `ownerId = upserted?.id ?? (body ? null : openingThreadMessageId)`. Only a genuinely empty comment re-homes its files; a failed insert of a real comment adds its attachment count to `attachmentsFailed`, so it is stamped and retried onto the correct row.
- Round-1 blocker 2 resolved: `setAttachmentFailStamp()` keeps `attachmentSyncAttempts`; trace = first failure (processTicket) → 1, retries → 2..4, 5th consecutive failure clears both keys and warns with the Desk ticket id. All three call sites pass the Desk id. Bounded to 5 full syncs per failing ticket per Desk modification.
- No new issues: tsc, eslint, 447 and 449 checks PASS.

### Deviations
- Unchanged and accepted: Part 0 / Part E operator-gated (Medium); stamp clearing via the whole-object upsert, empty-body comment without an opening message skipped (Minor); round-1 non-blocking minors (equivalent-type re-upload noise, declared size on re-registration, possible same-run re-sync) remain documented, not fixed.

### Required Fixes
- None.

## Part 0 Result + Part E Implementation (round 2)

### Part 0 (operator ran the bucket queries, 2026-10-19)
- No image/PDF objects with a missing, `text/plain` or `application/octet-stream` type, so the originally planned Part E target was empty.
- But ~68 objects were `text/html;charset=UTF-8`, and a follow-up grouped by extension showed these are **real files mislabeled by Zoho Desk** (large, varied sizes, not error pages): heic 31, csv 7, webp 6, ai 5, mp4 4, eps 3, eml 3, aab 2, pages 2, indd 1, msg 1, plus 3 genuine htm/html. `text/plain` was 13 real `.txt`; 2 octet-stream files have no extension (fine). Example tickets #18797–#21092 (historical Desk import + poll).
- Also revealed a Part A gap: `uploadContentType()` trusted `text/html`, so the live Desk poll would keep mislabeling new heic/webp/mp4 files.
- User decision: fix both (forward + relabel existing).

### What Changed
- New pure `correctedContentType(stored, filename)` in `src/config/attachment-types.ts`: untrusted = missing, `application/octet-stream`, `text/plain`, or `text/html` on a non-HTML extension; returns the extension's type (or `application/octet-stream` when unmapped), or `null` to keep. Self-check `_docs/task/457-content-type.check.ts` uses the live cases.
- Part A: `uploadContentType()` now delegates to it (closes the text/html gap).
- Part D: `fixStoredType()` now uses it too. This also clears the round-1 minor finding (equivalent spellings like `image/jpg` no longer trigger a re-upload) and stops correcting a specific-but-different type StackShift sent; only missing/generic/HTML-mislabeled ones are fixed.
- Part E: `POST /api/admin/desk/repair-attachment-content-types` (admin; `?dryRun`, `?limit` default 100 / max 500, `?offset`) walks `inbox_message` attachment rows by id, reads each object's stored type, and re-uploads mislabeled ones in place with the corrected type. Returns `{ dryRun, offset, scanned, mismatched, repaired, nextOffset, done, changes[], unresolved[] }`. `maxDuration = 300`.
- `CLAUDE.md` live-poll line updated.

### Files Changed
- `src/config/attachment-types.ts` - `correctedContentType()`
- `src/lib/desk/stackshift-message-sync.ts` - Part A uses the helper
- `src/lib/stackshift-support/attachments.ts` - Part D uses the helper
- `src/app/api/admin/desk/repair-attachment-content-types/route.ts` - Part E (new)
- `_docs/task/457-content-type.check.ts` - helper self-check (new)
- `CLAUDE.md` - note update

### Deviations From Plan
- Part E's target changed from "generic types on previewable files" (found none) to "untrusted types per `correctedContentType()`", driven by the Part 0 data. It relabels in place (download + re-upload with the same path); bytes are unchanged.
- Part E is paged by `offset` over all `inbox_message` attachment rows (~1,000), one `info()` per row, instead of a stamp-based cursor: rows don't change, and a re-run only re-uploads still-mislabeled objects.
- `src/lib/email/attachments.ts` (task 456) is unchanged: it has no header to distrust and already sets the extension's type.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint` on the 4 changed TS files - PASS
- `npx tsx _docs/task/457-content-type.check.ts` - PASS
- `npx tsx _docs/task/447-attachments.check.ts` - PASS
- `npx tsx _docs/task/449-parity.check.ts` - PASS
- Part E dry run + run against the live bucket - SKIPPED (operator step)

## Quality Gate Notes (round 3 — Part E / shared helper)

### Result
FAIL

### Standards Review
- **Blocking — re-uploads keep the wrong type.** Both `repair-attachment-content-types` and `fixStoredType()` (S1) do `bucket.download(path)` → `bucket.upload(path, blob, { upsert: true, contentType })`. In the installed `@supabase/storage-js@2.108.2` (`dist/index.mjs`, `uploadOrUpdate`), a `Blob` body is wrapped in `FormData` (`body.append("", fileBody)`) and `options.contentType` is **never sent**; the part's type is the Blob's own type, i.e. the wrong type it was downloaded with. Only non-Blob bodies (`ArrayBuffer`, `Buffer`, stream) get `headers["content-type"] = options.contentType`. Result: Part E would report `repaired: N` while changing nothing, and S1 would keep a missing/generic type. Not caught by tsc/lint/checks (runtime library behaviour). The 456 email and Desk-poll uploads pass `ArrayBuffer`, so they are correct.
- `correctedContentType()` is pure, covered by the new check against the live cases, and now shared by Desk poll, direct API and Part E (removes duplicated rules; clears the round-1 `image/jpg` noise finding).
- Part E route otherwise matches the house backfill shape (admin gate, dryRun/limit/offset, unresolved list, `maxDuration`).
- Minor (non-blocking): Part E's `done: scanned < limit` reports `false` when the last page is exactly `limit` long; the next call returns `scanned: 0, done: true`. Harmless.

### Deviations
- Medium (accepted, user-approved): Part E retargeted from generic types to `correctedContentType()` mismatches based on Part 0 data.
- Minor: Part E pages by `offset` over all `inbox_message` attachment rows.

### Required Fixes
1. In both `repair-attachment-content-types/route.ts` and `fixStoredType()` in `src/lib/stackshift-support/attachments.ts`, upload `await blob.arrayBuffer()` instead of the `Blob`, so storage-js sends `contentType` as the request header. Add a one-line comment saying why (a Blob body ignores `contentType`).

## Implementation Notes — Quality Gate Fix (round 3)

### What Changed
- Required fix 1: `repair-attachment-content-types/route.ts` and `fixStoredType()` now upload `await blob.arrayBuffer()` (comment: storage-js sends a Blob as FormData and ignores `contentType`). All four `ticket-attachments` upload sites in this task's scope (email, Desk poll, direct-API repair, Part E) now pass an `ArrayBuffer`, the branch that sets the `content-type` header.

### Files Changed
- `src/app/api/admin/desk/repair-attachment-content-types/route.ts`
- `src/lib/stackshift-support/attachments.ts`

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint` on the 2 changed files - PASS
- `npx tsx _docs/task/457-content-type.check.ts`, `447-attachments.check.ts`, `449-parity.check.ts` - PASS
- Live: after a Part E run, re-run the Part 0 extension query; the mislabeled heic/webp/mp4/csv/… rows must be gone - operator step

## Quality Gate Notes (round 4)

### Result
PASS

### Standards Review
- Round-3 blocker resolved: `repair-attachment-content-types` and `fixStoredType()` upload `await blob.arrayBuffer()`, which takes storage-js 2.108.2's non-Blob branch (`headers["content-type"] = options.contentType`). Re-read both files from disk after an external modification notice; contents match the fix.
- All four upload sites in scope now pass non-Blob bodies (email `ArrayBuffer`, Desk-poll `ArrayBuffer`, S1 repair, Part E).
- tsc, eslint, 457/447/449 checks PASS. No new findings.

### Deviations
- Unchanged and accepted from earlier rounds (Part E retarget, offset paging, documented minors).
- Note for testing: the Blob/contentType behaviour is runtime-only, so the live acceptance check is mandatory. After Part E, re-run the Part 0 per-extension query and confirm only `.htm`/`.html` remain `text/html`.

### Required Fixes
- None.

## Live Run + Implementation Notes — round 4 (Part E verification source)

### Live run (operator, local `pnpm dev`, 2026-10-19)
- Dry runs over offsets 0/500/1000: 1,011 rows scanned, **65 mismatched** (31 heic, 7 csv, 6 webp, 5 ai, 4 mp4, 3 eps, 3 eml, 2 aab, 2 pages, 1 indd, 1 msg), exactly the Part 0 count; 0 unresolved. (The bucket holds ~1,018 objects; the 7 without an `attachments` row are unregistered uploads, the accepted orphan trade-off.)
- Real run: `repaired` 32 + 32 + 1 = 65, 0 unresolved.
- Verification dry run then still reported 65 `text/html`. `storage.objects` showed the repair **had** worked: e.g. `KohenMeyers.webp` → `image/webp`, `Loading_issue.mp4` → `video/mp4`, `IMG_5857.heic` → `application/octet-stream`, `updated_at` 2026-10-19 09:46–10:08. So storage-js `info()` returns a stale type after an overwrite (likely a cached GET); the DB is correct.

### What Changed
- `repair-attachment-content-types` reads the stored type with `bucket.list(folder, { search: name })` (POST, reads `storage.objects`) and an exact name match, instead of `info()`. A missing object is reported in `unresolved` as `lookup failed: object not found`.
- `fixStoredType()` (S1) keeps `info()`: it only reads brand-new, never-overwritten objects, where the stale-after-overwrite problem doesn't apply.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint` on the route - PASS
- Live: one dry run across offsets 0/500/1000 should now report `mismatched: 0` - operator step
- Live: previews of `KohenMeyers.webp` / `Loading issue.mp4` in the Hub - operator step (if downloads are also CDN-cached, the served type may lag the DB)

## Quality Gate Notes (round 5 — Part E verification source)

### Result
PASS

### Standards Review
- `list(folder, { search: name })` + exact `o.name === name` match is correct: stored names are sanitized to `[a-zA-Z0-9._-]` by every writer in this bucket (email, Desk poll, Desk import, direct-API `buildPath`), so no `%`; `_` acts as a one-char wildcard in the server-side search, which only widens the result set, and the exact match filters it. Folders are per-message, so `limit: 100` is ample.
- `list()` is a POST that reads `storage.objects`, matching the source of truth the live SQL confirmed; the stale-`info()` reason is stated in a one-line comment.
- Missing object surfaces in `unresolved` (`lookup failed: object not found`) rather than being silently skipped.
- Keeping `info()` in `fixStoredType()` is justified (fresh objects only); documented.
- tsc + eslint PASS.

### Deviations
- Minor: one `list()` call per attachment row (~1,011 per full pass) rather than one per folder. Admin-run, paged, fine.
- Medium (documented, operator-checked): if Supabase also caches downloads, the served type may lag the DB after a repair. To be confirmed by the preview check. No code change unless observed.

### Required Fixes
- None.

## Test Log — Part E verification (2026-10-19, local `pnpm dev`)
- Dry run with the `list()`-based route over offsets 0/500/1000: `{ scanned: 1011, mismatched: 0, left: [], unresolved: [] }`. All 65 relabelled objects confirmed at the correct type; every attachment row resolved to its object.
- Remaining: Hub preview of `KohenMeyers.webp` / `Loading issue.mp4`; forward checks (456 test email, `attachmentRetry` in the Desk poll log, direct-API PUT without `Content-Type`).
