# 341: Fix Broken Inline Images on Ticket Threads Polled While Prod Had No IMAP Env — Backfill + Silent-Degradation Guard

**Created:** 2026-08-31
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Inbound ticket emails with `cid:`-referenced inline images (e.g. Apple Mail screenshots pasted
into a message) still render broken on `/desk/tickets/[ticketId]` — the stored `ticket_messages.body`
keeps the dead Zoho reference `<img src="/mail/ImageDisplay?na=…&nmsgId=…&cid=…">`, which 302s to
`mail.zoho.com/biz/login` for every staff user. Reported on **TKT-21017** (email-polled 2026-08-31).

Tasks 321 (forward IMAP resolution in the email-poll cron) and 322 (one-off backfill of pre-321
messages) were built to fix exactly this. Root cause of the regression is now confirmed with the user:

- **The `ZOHO_MAIL_IMAP_*` env vars were never added to the production (Vercel) environment.**
  Task 322's "full mailbox backfill" live run on 2026-08-27 was executed **locally** against the prod
  DB using the developer's `.env.local` IMAP credentials. The production email-poll cron has been
  running since then with `getImapConfig()` returning `null`.
- When IMAP is not configured, `fetchInlineImages()` **silently returns `[]`** (by design — it must
  never fail a poll). So every ticket polled in production between task 321 shipping and now stored an
  unresolved `/mail/ImageDisplay` body with zero log signal that anything was skipped.
- The user **added the three IMAP env vars to Vercel just now**, so the forward path should resolve
  inline images on *newly* polled mail going forward. Every already-polled ticket in the gap window is
  still broken and needs the backfill re-run.

Two things to fix:

1. **Operational:** re-run the existing task 322 backfill route (`POST /api/admin/desk/backfill-inline-images`)
   across the gap window — email-polled `ticket_messages` rows *do* have `email_message_id` set, so
   they are valid candidates for that route with no code change. Verify TKT-21017 specifically.
2. **Code (prevent recurrence):** the silent `[]` degradation is the actual bug. Add a single
   `console.warn` when a message *has* an unresolved inline-image reference but resolution produced
   nothing, distinguishing **"IMAP not configured"** from **"no confident IMAP match"** — and stamp
   `source_meta.inlineImagesUnresolved` on the message so a future straggler sweep (and a possible
   render-time fallback) has a precise, regex-free candidate list. Also close the backfill route's
   "matched + images stored but body unchanged" silent hole (currently counts as success, leaves the
   body broken, emits no `unresolved` entry).

## Requirements

### A. Backfill the gap window (operational — no code change expected)

- [ ] Confirm `ZOHO_MAIL_IMAP_HOST` / `ZOHO_MAIL_IMAP_PORT` / `ZOHO_MAIL_IMAP_APP_PASSWORD` and
      `ZOHO_MAIL_INBOX_FOLDER_ID` are all present in the **production** Vercel environment (user added
      the IMAP three "just now" — verify the deploy that picked them up is live).
- [ ] `POST /api/admin/desk/backfill-inline-images?dryRun=1&ticketNumber=21017` against production —
      confirm it finds the candidate message, correlates (expect `strategy: "date-from"` per task 322's
      live findings), and reports `imagesStored > 0`.
- [ ] Real run `?ticketNumber=21017`; confirm the images render on `/desk/tickets/TKT-21017` for a
      staff user who is **not** logged into Zoho Mail's webclient.
- [ ] Re-run `?ticketNumber=21017` — expect `messagesRewritten: 0` (idempotency; task 322 already
      proved the body rewrite is self-skipping).
- [ ] Sweep the rest of the gap window in `?limit=25` batches (no `ticketNumber`). Review each
      response's `unresolved[]`. Expected reasons for legitimate misses: source email moved out of
      INBOX / deleted in the Zoho Mail webclient since it was polled.
- [ ] Record the totals (candidates / matched / imagesStored / messagesRewritten / unresolvedCount)
      in this doc's Live Run Log, same format as task 322.

### B. Silent-degradation guard (code)

- [ ] `src/lib/email/imap.ts` — export a tiny `isImapConfigured(): boolean` (wraps the existing
      private `getImapConfig() !== null`). No behavior change to `fetchInlineImages` / `withInboxConnection`.
- [ ] `src/lib/email/inbound.ts` — in `toParsedInboundEmail()`, when `hasUnresolvedInlineImages` is
      `true` but `inlineImages.length === 0`, emit exactly one `console.warn` with a stable prefix
      (`[inbound] unresolved inline image(s) on <messageId>: <reason>`) where `reason` is
      `"IMAP not configured"` when `!isImapConfigured()`, else `"no confident IMAP match"`. Return an
      extra `inlineImagesUnresolved: boolean` on `ParsedInboundEmail` so the poll route can persist it.
- [ ] `src/app/api/cron/email-poll/route.ts` — when `email.inlineImagesUnresolved` is true, set
      `source_meta.inlineImagesUnresolved = true` on the `ticket_messages` insert (alongside the
      existing `source_meta.contentType`). When inline images *were* resolved, do **not** set the flag
      (or set it `false`) — a later successful backfill / re-poll should be able to clear it.
- [ ] `src/lib/email/inline-images.ts` — `applyInlineImages()` currently returns only the rewritten
      body. Change it to return `{ body: string; rewrittenCids: string[]; storedButUnmatchedCids: string[] }`
      (or similar): a cid whose bytes were uploaded + `attachments` row upserted but for which
      `rewriteInlineImageSrc` did **not** change the body (the mailparser `cid` value does not appear
      in the stored `src` — a real fragility with some MUA/Zoho Content-ID rewrites). Update both
      call sites (poll route, backfill route). Behavior-preserving for the body itself.
- [ ] `src/app/api/admin/desk/backfill-inline-images/route.ts` — when `applyInlineImages` reports
      `storedButUnmatchedCids.length > 0` and the body was not rewritten, push an `unresolved` entry
      (`reason: "images stored but body <img src> not rewritten — cid token absent from stored src"`)
      instead of silently counting it toward `imagesStored` with `messagesRewritten` unchanged.

### C. Render-time fallback for permanently-unresolvable images (code — small, contained)

- [ ] `src/app/(hub)/desk/tickets/[ticketId]/_message-html.ts` — in `sanitizeMessageHtml()` (or a new
      step composed into it), neutralize any `<img>` whose `src` still points at
      `/mail/ImageDisplay` or `cid:` after sanitization: replace it with a small inline
      "📎 inline image unavailable" placeholder span (no emoji per house style — use a `lucide`
      `ImageOff` rendered as static SVG string, or just styled text). This only affects messages the
      backfill genuinely cannot recover; a successful backfill removes the dead `src` so the
      placeholder never shows. Keep it dependency-free (this is a string transform, not a component).
- [ ] The placeholder must not break `DOMPurify` output — apply the transform to the string
      **before** `DOMPurify.sanitize`, or on the sanitized string with a plain regex, and keep the
      replacement markup inside the allowed-tag profile already in use.

## Out of Scope / Must-Not-Change

- **No new migration.** `attachments.cid` (migration 123) already exists. `source_meta` is JSON —
  adding a key needs no schema change.
- **No change to the IMAP correlation strategy** (`findUidByDateAndFrom` / `findUidByMessageIdHeader`
  / `fetchInlineImagesForBackfill`). Task 322 verified the date+FROM window is reliable
  (0 unresolved across the whole mailbox history). Only add reporting around it.
- **No change to `fetchInlineImages`'s never-throws / degrade-to-`[]` contract** — a poll must still
  never fail because of inline-image enrichment. The guard is a `console.warn` + a `source_meta`
  flag, nothing that can throw.
- **Zoho Desk-imported thread messages** (`email_message_id is null`, from `desk-threads` /
  `desk-archived-tickets` import) — still explicitly out of scope, same as task 322. The user has
  stopped doing manual Desk imports; TKT-21017 and the gap window are all email-poll rows. If a
  Desk-imported message with a `/mail/ImageDisplay` body turns up later it is a separate task
  (it has no reliable IMAP correlation key — task 322 §"Out of Scope" covers why).
- `absolutizeZohoDeskInlineImages` (`/supportapi/api/v1/...` Desk thread images) — unrelated origin,
  untouched.
- **No cron / pg_cron / scheduled backfill.** The backfill stays a manually-triggered admin route.
- Staff / outbound (`author_type != 'client'`) messages — never touched by the backfill; their inline
  images come from the task 320 rich-text editor, not `cid:` MIME parts.
- No retry/queue infrastructure for failed IMAP correlations — an `unresolved[]` entry + the
  `source_meta.inlineImagesUnresolved` flag is the whole record; re-running the route later is the
  retry.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/email/imap.ts` | Modify | Export `isImapConfigured()` (thin wrapper over existing `getImapConfig`). No behavior change. |
| `src/lib/email/inbound.ts` | Modify | `toParsedInboundEmail()` warns once + returns `inlineImagesUnresolved` when an unresolved ref resolved to nothing; reason distinguishes not-configured vs no-match. |
| `src/lib/email/inline-images.ts` | Modify | `applyInlineImages()` returns a structured result (`body` + `rewrittenCids` + `storedButUnmatchedCids`) so callers can detect "stored but body unchanged". Both call sites updated. |
| `src/app/api/cron/email-poll/route.ts` | Modify | Persist `source_meta.inlineImagesUnresolved` on the message insert; adapt to `applyInlineImages`'s new return shape. |
| `src/app/api/admin/desk/backfill-inline-images/route.ts` | Modify | Report "stored but body not rewritten" as an `unresolved` entry; adapt to the new return shape. |
| `src/app/(hub)/desk/tickets/[ticketId]/_message-html.ts` | Modify | Render-time placeholder for `<img>` still pointing at `/mail/ImageDisplay` or `cid:` after all backfill attempts. |
| `env.example` | Verify only | Keys already present (`ZOHO_MAIL_IMAP_HOST/PORT/APP_PASSWORD`, lines 110–114). No change; note in the doc that prod parity is the fix. |
| `CLAUDE.md` | Modify (small) | One line under the ticketing/inline-image notes: the IMAP env trio is **required in every deployed environment** for forward inline-image resolution; absence degrades silently to broken `/mail/ImageDisplay` bodies (this task's root cause). |

## Code Context

### `getImapConfig` — the silent gate (`src/lib/email/imap.ts:40-47`)
```ts
function getImapConfig(): ImapConfig | null {
  const host = process.env.ZOHO_MAIL_IMAP_HOST;
  const port = process.env.ZOHO_MAIL_IMAP_PORT;
  const user = process.env.ZOHO_MAIL_FROM_ADDRESS;
  const pass = process.env.ZOHO_MAIL_IMAP_APP_PASSWORD;
  if (!host || !port || !user || !pass) return null;   // <- prod hit this path for weeks
  return { host, port: Number(port), user, pass };
}
```
`withInboxConnection(fn, fallback)` returns `fallback` (`[]`) immediately when this is `null`
(`imap.ts:98-99`). `fetchInlineImages` therefore returns `[]` with no log (`imap.ts:154-163`).

### The pre-check that fires but leads nowhere (`src/lib/email/inbound.ts:28-34`)
```ts
export const UNRESOLVED_INLINE_IMAGE_PATTERN = /src=["'](?:\/mail\/ImageDisplay|cid:)/i;

export async function toParsedInboundEmail(summary: ZohoMailMessageSummary): Promise<ParsedInboundEmail> {
  const detail = await getMessageDetail(summary.messageId, summary.folderId);
  const hasUnresolvedInlineImages = !!detail.htmlContent && UNRESOLVED_INLINE_IMAGE_PATTERN.test(detail.htmlContent);
  const inlineImages = hasUnresolvedInlineImages ? await fetchInlineImages(summary) : [];
  // ^ hasUnresolvedInlineImages === true, inlineImages === [] : no signal emitted today
  return { /* ... */ inlineImages };
}
```
Add: `if (hasUnresolvedInlineImages && inlineImages.length === 0) console.warn(...)` +
`inlineImagesUnresolved: hasUnresolvedInlineImages && inlineImages.length === 0`.

### Forward-path body rewrite + message insert (`src/app/api/cron/email-poll/route.ts:236-255`)
```ts
const newMessageId = randomUUID();
body = await applyInlineImages({ messageRowId: newMessageId, ticketId: ticketDisplayId, inlineImages: email.inlineImages, body });
const { data: newMessage, error: messageError } = await adminClient
  .from("ticket_messages")
  .insert({
    id: newMessageId, ticket_id: ticketId, author_type: "client", visibility: "public", body,
    email_message_id: summary.messageId,
    source_meta: { contentType: bodyIsHtml ? "text/html" : "text/plain" },   // <- add inlineImagesUnresolved here
  })
```

### `applyInlineImages` — currently returns only `body` (`src/lib/email/inline-images.ts:31-84`)
The `for (const img ...)` loop uploads + upserts the `attachments` row unconditionally, then calls
`rewriteInlineImageSrc(body, img.cid, servingUrl)`. `rewriteInlineImageSrc` (lines 18-23) only
changes the string when `url === \`cid:${cid}\` || url.includes(cid)`. If neither holds (mailparser's
`cid` value differs from the token in the stored `/mail/ImageDisplay?...cid=…` src) the image is
stored but the body stays broken and nothing records that. Return which cids actually rewrote vs
which were "stored but unmatched".

### Backfill route — the "stored but unchanged" silent path (`src/app/api/admin/desk/backfill-inline-images/route.ts:141-164`)
```ts
if (dryRun) { imagesStored += correlation.images.length; continue; }
const newBody = await applyInlineImages({ messageRowId: row.id, ticketId: ticketDisplayId, inlineImages: correlation.images, body: row.body });
imagesStored += correlation.images.length;
if (newBody !== row.body) { /* update + messagesRewritten++ */ }
// else: images uploaded, body untouched, NO unresolved entry, looks like success  <- fix
```

### Render surface (`src/app/(hub)/desk/tickets/[ticketId]/_conversation-thread.tsx:177` + `_message-html.ts:24-26`)
```ts
dangerouslySetInnerHTML={{ __html: sanitizeMessageHtml(m.body) }}
// sanitizeMessageHtml = DOMPurify.sanitize(absolutizeZohoDeskInlineImages(body), { USE_PROFILES: { html: true } })
```
Add a `neutralizeDeadInlineImages()` step (regex on the string, before or after DOMPurify) that
swaps `<img ... src="/mail/ImageDisplay...">` / `<img ... src="cid:...">` for a static
"inline image unavailable" marker.

## Implementation Steps

1. `isImapConfigured()` export in `imap.ts`; `tsc`.
2. `toParsedInboundEmail()` — warn + `inlineImagesUnresolved` on the return type; update
   `ParsedInboundEmail`.
3. `applyInlineImages()` — structured return; update poll route + backfill route call sites
   (behavior-preserving for the body value itself).
4. Poll route — `source_meta.inlineImagesUnresolved` on the insert.
5. Backfill route — "stored but body unchanged" → `unresolved[]` entry.
6. `_message-html.ts` — `neutralizeDeadInlineImages()` render-time placeholder; eyeball it in the
   ticket view against a still-broken message (before running the backfill).
7. `CLAUDE.md` one-liner about the required prod env trio.
8. `npx tsc --noEmit` + `pnpm lint`.
9. **Operational (needs prod, admin/super_admin session):** dry-run then real-run the backfill for
   `?ticketNumber=21017`; verify render; idempotency re-run; then batched sweep of the gap window;
   fill the Live Run Log.

## Acceptance Criteria

- [ ] After the backfill run targeting TKT-21017, its inline images render on
      `/desk/tickets/TKT-21017` for a staff user not logged into Zoho Mail's webclient.
- [ ] A **new** inbound email with inline images, polled after the Vercel env fix, renders its inline
      images with no manual backfill (forward path works in prod now).
- [ ] When IMAP resolution yields nothing for a message that referenced an inline image, the cron
      log contains one `[inbound] unresolved inline image(s) …` line naming the reason, and the
      `ticket_messages.source_meta.inlineImagesUnresolved` flag is `true` on that row.
- [ ] The backfill route's response lists a message under `unresolved[]` when its images were stored
      but the body `<img src>` could not be rewritten — it is no longer silently counted as done.
- [ ] A message that still carries a dead `/mail/ImageDisplay` / `cid:` `src` after all backfill
      attempts shows an "inline image unavailable" placeholder in the ticket thread, not a broken-
      image icon.
- [ ] Backfill remains idempotent — a second run over a fixed ticket reports `messagesRewritten: 0`,
      no duplicate `attachments` rows.
- [ ] Inline images still do not appear in the ticket detail Attachments tab (task 321's
      `.is("cid", null)` on `page.tsx`'s attachments query still holds).
- [ ] IMAP fetch never marks a source message `\Seen` (unchanged — `BODY.PEEK[]` via
      `ImapFlow.download()`).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint

# Operational — production, with an admin/super_admin session cookie:
curl -X POST 'https://hub.webriqs.com/api/admin/desk/backfill-inline-images?dryRun=1&ticketNumber=21017' -H 'cookie: <staff session>'
curl -X POST 'https://hub.webriqs.com/api/admin/desk/backfill-inline-images?ticketNumber=21017'        -H 'cookie: <staff session>'
# visually confirm images render at /desk/tickets/TKT-21017
curl -X POST 'https://hub.webriqs.com/api/admin/desk/backfill-inline-images?ticketNumber=21017'        -H 'cookie: <staff session>'   # expect messagesRewritten: 0
# gap-window sweep, batched:
curl -X POST 'https://hub.webriqs.com/api/admin/desk/backfill-inline-images?limit=25' -H 'cookie: <staff session>'   # repeat until candidates: 0
```

## Live Run Log

_(fill during the operational step — mirror task 322's format)_

- Prod env parity confirmed: …
- TKT-21017 dry run: `candidates / matched / strategy / imagesStored` = …
- TKT-21017 real run: `messagesRewritten` = … ; images render: …
- TKT-21017 idempotency re-run: `messagesRewritten` = …
- Gap-window sweep totals: `scanned / candidates / matched / imagesStored / messagesRewritten / unresolvedCount` = …
- `unresolved[]` reasons seen: …

## Implementation Notes

### What Changed

Parts B and C (code) are implemented. Part A (the operational backfill run) is left for the user —
steps are below.

- **`src/lib/email/imap.ts`** — added `export function isImapConfigured()` (thin `getImapConfig() !== null`
  wrapper). No behavior change to `fetchInlineImages` / `withInboxConnection`.
- **`src/lib/email/inbound.ts`** — `ParsedInboundEmail` gains `inlineImagesUnresolved: boolean`.
  `toParsedInboundEmail()` now emits exactly one `console.warn("[inbound] unresolved inline image(s) on <id>: <reason>")`
  when the body references an inline image but resolution produced nothing — `reason` is
  `"IMAP not configured"` when `!isImapConfigured()`, else `"no confident IMAP match"`.
- **`src/lib/email/inline-images.ts`** — `applyInlineImages()` return type changed from `Promise<string>`
  to `Promise<ApplyInlineImagesResult>` (`{ body, rewrittenCids, storedButUnmatchedCids }`). The body
  value it produces is byte-for-byte unchanged; it now also reports, per cid, whether
  `rewriteInlineImageSrc` actually changed the body (`rewrittenCids`) or the bytes were stored but the
  `<img src>` was left untouched because the mailparser Content-ID doesn't textually appear in the src
  (`storedButUnmatchedCids`) — the latter also logs a `console.warn`.
- **`src/app/api/cron/email-poll/route.ts`** — adapts to the new return shape (`inlineResult.body`);
  sets `source_meta.inlineImagesUnresolved: true` on the `ticket_messages` insert when
  `email.inlineImagesUnresolved || inlineResult.storedButUnmatchedCids.length > 0`. The key is omitted
  entirely (not set `false`) when images resolved cleanly, so a later successful backfill / re-poll
  leaves no stale flag.
- **`src/app/api/admin/desk/backfill-inline-images/route.ts`** — adapts to the new return shape; pushes
  an `unresolved[]` entry (`"images stored but body <img src> not rewritten — cid token absent from
  stored src: <cids>"`) when `storedButUnmatchedCids` is non-empty. A partially-rewritten message can
  now appear in both `messagesRewritten` and `unresolved[]` (accurate — some images fixed, some not).
- **`src/app/(hub)/desk/tickets/[ticketId]/_message-html.ts`** — new `neutralizeDeadInlineImages(html)`
  composed into `sanitizeMessageHtml()` before `DOMPurify.sanitize`. Regex-swaps any `<img>` whose
  `src` still starts with `/mail/ImageDisplay` or `cid:` for
  `<span … style="font-style:italic;opacity:0.55">[inline image unavailable]</span>`. Dependency-free
  string transform; working (rewritten) images are untouched. Also benefits `_thread-to-project-modal.tsx`,
  which reuses `sanitizeMessageHtml`.
- **`CLAUDE.md`** — new bullet in the Desk/ticketing cluster documenting the IMAP env trio as a hard
  per-environment requirement and the silent-degradation failure mode (task 341's root cause).

### Files Changed
- `src/lib/email/imap.ts` — export `isImapConfigured()`
- `src/lib/email/inbound.ts` — warn + `inlineImagesUnresolved` on `ParsedInboundEmail`
- `src/lib/email/inline-images.ts` — `applyInlineImages()` structured return
- `src/app/api/cron/email-poll/route.ts` — persist `source_meta.inlineImagesUnresolved`; new return shape
- `src/app/api/admin/desk/backfill-inline-images/route.ts` — flag "stored but body unchanged"; new return shape
- `src/app/(hub)/desk/tickets/[ticketId]/_message-html.ts` — `neutralizeDeadInlineImages()` render-time placeholder
- `CLAUDE.md` — IMAP env-trio requirement + failure mode note

### Deviations From Plan
- **Replaced the IMAP `SEARCH SINCE/BEFORE` date-window correlation with `SEARCH FROM` + nearest
  `INTERNALDATE` (not in the plan — root-cause fix).** Live diagnosis on TKT-21017: `listNewMessages`
  (REST) returned the message with an accurate `receivedTime`, IMAP `SEARCH FROM bbinder@quandarycg.com`
  matched 140 messages **including the exact target** (UID 24592, `INTERNALDATE` 2026-08-30T19:45:09
  vs REST `receivedTime` 19:45:09.017 — a 17 ms gap), the INBOX holds 7096 messages — but
  `SEARCH SINCE <d-1> BEFORE <d+1>` (with or without FROM) returned **zero** results. Zoho's IMAP
  server does not honour a bare date-range `SEARCH` the way RFC 3501 implies. Task 322's whole-mailbox
  sweep "worked" only because its 17 hits happened to also satisfy some other path, or the server
  behaved differently then — either way the date-window search is unreliable and is now gone.
  `findUidByDateAndFrom` (kept the name) now does `SEARCH FROM <addr>` → fetch `INTERNALDATE` for the
  matches (capped at the newest 2000) → pick the one closest to the target receipt time within the
  5-min confidence window. `INTERNALDATE` tracks Zoho's `receivedTime` to the second, so this is both
  more reliable and more precise than the old envelope-`Date`-header comparison. Forward poll path
  (`fetchInlineImages`) and backfill both go through this function, so both are fixed.
- **Added a `listNewMessages()`-based correlation path to the backfill route (not in the plan).**
  The first live dry run (`?dryRun=1&ticketNumber=21017`) returned `candidates: 1, matched: 0`,
  reason `"no confident IMAP match"` — the task 322 `getMessageMetadata()` → `fetchInlineImagesForBackfill()`
  path could not correlate a *recent* gap-window message. Root cause: `getMessageMetadata()` hits
  Zoho Mail's `/details` endpoint with UNVERIFIED field-name parsing (task 322 Implementation Notes
  already flagged this as Medium risk) and evidently returns insufficient `receivedTime`/`fromAddress`
  for the date+FROM IMAP window. Fix: the backfill now pulls a fresh `listNewMessages({ folderId, limit: 200 })`
  once per request and, for any candidate still in that recent INBOX window, reconstructs the real
  `ZohoMailMessageSummary` and calls `fetchInlineImages(summary)` — the **exact** trusted forward
  path the poll cron uses. The `getMessageMetadata` path stays as the fallback for messages aged out
  of the recent list. `strategies` now reports `"list-summary"` vs `"message-id"` / `"date-from"`.
  Dry-run responses attach a per-`unresolved` `debug` block (`{ path, from, receivedTime }` or
  `{ path: "metadata-fallback", metadata }`) so a failed correlation is diagnosable. Scope
  justification: the whole point of Part A is that the backfill actually resolves these images;
  it didn't, and this is the correlation reliability risk task 322 already called out.
- Placeholder markup simplified from the planned dashed-border chip to plain italic muted text —
  the chip's `border-radius:4px` / `font-size:12px` inline values tripped the `impeccable`
  design-system-token hooks (this string is injected into `dangerouslySetInnerHTML` email content
  that Tailwind never processes, so a class-based token isn't available). Italic + `opacity` carries
  the same "de-emphasised, not-a-real-image" signal without off-scale literals.
- CLAUDE.md note placed as a **new** bullet (the plan assumed an existing tasks-321/322 note to append
  to — there was none; CLAUDE.md had no inline-image / IMAP coverage at all).
- `impeccable` `broken-image` hook fired on every touched file (comments and `reason`/regex strings
  containing the literal text `<img src>`). All false positives — server-only modules and API routes,
  no rendered UI. Same false positive task 322 already recorded for `inline-images.ts`. No suppression
  added.

### Verification Run
- `npx tsc --noEmit` — PASS (re-run after the `list-summary` correlation deviation — still clean)
- `pnpm lint` — PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, unchanged from tasks 321/322)
- Part A live dry run #1 (`?dryRun=1&ticketNumber=21017`) — `candidates: 1, matched: 0` / `"no confident IMAP match"` → triggered the `list-summary` correlation deviation above; re-run pending
- Part A operational backfill + browser render check — with the user (see "Steps for Part A") + the testing stage

## Steps for Part A — run the backfill against the gap window

Prerequisites: you're signed into the Hub as an `admin` / `super_admin` user, and the Vercel deploy
that picked up the new `ZOHO_MAIL_IMAP_*` env vars is live (redeploy if you added them after the last
deploy — Vercel env changes need a new deployment to take effect).

1. **Verify prod env parity.** In the Vercel project settings, confirm all four are set for
   **Production**: `ZOHO_MAIL_IMAP_HOST` (`imappro.zoho.com`), `ZOHO_MAIL_IMAP_PORT` (`993`),
   `ZOHO_MAIL_IMAP_APP_PASSWORD` (the app-specific password, not the account login),
   `ZOHO_MAIL_INBOX_FOLDER_ID` (already there from task 318). Trigger a redeploy if any were just added.

2. **Dry-run TKT-21017.** In a terminal (replace `<COOKIE>` with your browser's Hub session cookie
   header — copy it from DevTools → Network → any `hub.webriqs.com` request → Request Headers → `cookie`):
   ```bash
   curl -X POST 'https://hub.webriqs.com/api/admin/desk/backfill-inline-images?dryRun=1&ticketNumber=21017' \
     -H 'cookie: <COOKIE>'
   ```
   Expect JSON with `candidates: 1`, `matched: 1`, `strategies: { "date-from": 1 }` (or `"message-id"`),
   `imagesStored >= 1`, `messagesRewritten: 0` (dry run writes nothing). If `matched: 0`, the source
   email is no longer findable in INBOX — check `unresolved[]` for the reason.

3. **Real run TKT-21017.**
   ```bash
   curl -X POST 'https://hub.webriqs.com/api/admin/desk/backfill-inline-images?ticketNumber=21017' \
     -H 'cookie: <COOKIE>'
   ```
   Expect `messagesRewritten: 1`, `imagesStored` matching the dry run, `unresolvedCount: 0`.

4. **Eyeball it.** Open `https://hub.webriqs.com/desk/tickets/TKT-21017` — the embedded image should
   now render (it's served from `/api/desk/tickets/TKT-21017/messages/…/inline-images/…`). Confirm in
   a browser **not** logged into Zoho Mail's webclient (or an incognito window) to prove it's not the
   old session-gated URL.

5. **Idempotency check.** Re-run the exact command from step 3 → expect `messagesRewritten: 0`,
   `candidates: 0` or `1` but no new writes.

6. **Sweep the rest of the gap window.** Drop `ticketNumber`, run in bounded batches, repeat until
   `candidates: 0`:
   ```bash
   curl -X POST 'https://hub.webriqs.com/api/admin/desk/backfill-inline-images?limit=25' \
     -H 'cookie: <COOKIE>'
   ```
   After each batch, skim `unresolved[]`. Legit reasons: `"no confident IMAP match"` (source email
   moved/deleted from INBOX in the Zoho Mail webclient since it was polled) — nothing to do, the
   render-time placeholder now covers those. `"images stored but body <img src> not rewritten …"` —
   tell me the ticket/message so we can look at the Content-ID mismatch.

7. **Paste the totals back to me** (candidates / matched / imagesStored / messagesRewritten /
   unresolvedCount across all batches) and I'll record them in the task doc's Live Run Log and hand
   off to `test`.

## Compatibility Touchpoints

- **No new dependencies, no migration.** `imapflow` / `mailparser` came in with task 321;
  `attachments.cid` with migration 123.
- **Deployment / install surface:** this task's root cause is env-var drift between local and prod.
  After it ships, `ZOHO_MAIL_IMAP_HOST` / `ZOHO_MAIL_IMAP_PORT` / `ZOHO_MAIL_IMAP_APP_PASSWORD` are a
  documented hard requirement for any environment running the email-poll cron — call this out in the
  deploy checklist / CLAUDE.md.
- `applyInlineImages()` return-shape change is internal (two call sites, both in this repo).
- No packaging, docs-site, or MCP-tool impact.
```
