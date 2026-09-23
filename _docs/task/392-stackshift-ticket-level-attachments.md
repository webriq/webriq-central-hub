# 392: Ingest Zoho Desk Ticket-Level Attachments for StackShift/Desk-Poll Tickets

**Created:** 2026-09-23
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced

---

## Overview

Task 390's attachment sync (`syncMessageAttachments()` in `src/lib/desk/stackshift-message-sync.ts`)
downloads `thread.attachments`/`comment.attachments` — attachment metadata embedded directly in
Zoho Desk's per-thread/per-comment API responses. Live testing (task 390's follow-up, ticket
#21058) confirmed this is **empty for files StackShift's own "Upload File" button attaches** —
diagnostic logging against a real ticket showed `hasAttach: false, attachmentCount: -1,
attachments: []` on both the opening thread and the reply comment, despite the ticket visibly
having 10 PDF attachments in StackShift's own UI.

This is exactly what task 388's original planning doc flagged and deliberately deferred:

> "No attachment ingestion for these tickets in this pass. StackShift's attachment flow
> (`ticket-attachments/[id]/upload.ts` in the pagebuilder app) is a distinct API surface from
> Desk's own `/tickets/{id}/attachments` that `email-poll` already knows how to download — confirm
> they resolve to the same underlying Desk attachment objects before wiring this up."

**Confirmed conclusion**: files uploaded via StackShift's ticket-level upload UI are Zoho Desk
**ticket-level** attachments (`GET /tickets/{id}/attachments`), not thread- or comment-level ones.
No code in this repo has ever called that endpoint — `syncMessageAttachments()`'s existing
thread/comment-embedded logic is correct and should be kept (a thread or comment *can* still carry
its own attachments on other tickets — this specific ticket's data just happened to have none
there), but it's not sufficient on its own.

## Requirements

- [ ] Add a new function to `src/lib/desk/stackshift-message-sync.ts` (or `src/lib/zoho/desk.ts`
      if it's purely a Desk API client concern — implementer's call, follow whichever this
      codebase's existing split favors once the response shape is known) that calls
      `GET /tickets/{ticketExternalId}/attachments` via the existing `fetchAllDeskPages()`
      helper.
  - [ ] **UNVERIFIED — confirm against a live account before relying on it**, same posture this
        codebase already takes for every other Zoho Desk field assumption: the exact field names
        this endpoint returns (`id`/`name`/`size`/`href` are the historical import's
        thread/comment-attachment field names — this ticket-level endpoint may or may not match).
        Recommend the same diagnostic-logging approach task 390's follow-up just used
        successfully (temporary `console.log` of the raw response, removed once confirmed) rather
        than guessing the shape from documentation alone.
  - [ ] Also confirm whether the response links each attachment to a specific `threadId` or
        `commentId` (some Desk API endpoints do carry this). If it does, prefer that real linkage
        over the fallback convention below — attaching each file to the message it actually
        belongs to is strictly better than a blanket convention.
- [ ] Decide and implement the `entity_id` linkage for ticket-level attachments that have **no**
      thread/comment linkage in the API response (expected to be the common case, given the
      original bug report's ticket had none):
  - [ ] **Default convention (use unless investigation finds a better signal): attach to the
        opening thread's `inbox_messages` row** — the closest conceptual owner (the files
        accompanied the customer's original request). Requires the opening thread to have already
        synced in this same `syncTicketMessages()` call (it always runs first, per the existing
        order) before ticket-level attachments are processed.
  - [ ] If a ticket has no opening thread yet (empty thread list — an edge case, not the common
        path), skip ticket-level attachment ingestion for that run and log why; it will pick up
        naturally on a later run once an opening thread exists. Do not invent a workaround entity
        for this edge case.
- [ ] Reuse the existing per-attachment download/upload/upsert logic (`ticket-attachments`
      bucket, `attachments` table, `entity_type: 'inbox_message'`, `external_id` = Zoho's
      attachment id as the idempotency key, per-attachment fault isolation, pre-download
      existing-attachment check) — do not duplicate it. Consider factoring the shared
      download/upload/upsert body out of `syncMessageAttachments()` into a small helper both the
      thread/comment path and this new ticket-level path can call, rather than copy-pasting it a
      third time.
- [ ] Wire the new ticket-level fetch into `syncTicketMessages()`, called once per ticket
      (unlike the existing per-message attachment sync, which runs once per thread/comment).
- [ ] Update `stackshift-message-sync.ts`'s `SyncTicketMessagesResult`'s `attachmentsAdded`
      counter to include ticket-level attachments too (single combined count is fine — the
      backfill route's response doesn't need to distinguish the two sources).

## Out of Scope / Must-Not-Change

- **Do not remove or alter the existing thread/comment-embedded attachment logic** — keep it,
  since it's correct for tickets where attachments genuinely are embedded there.
- **No new database migration or schema change** — reuses the existing `attachments` table
  exactly as-is (`entity_type: 'inbox_message'`).
- **No two-way sync, no changes to `webriq-pagebuilder/app`** — same boundary tasks 388–391
  already established.
- **Do not touch `desk-threads-import.ts`/`desk-comments-import.ts`** (the historical import) —
  this task is scoped to the live poll / backfill path (`stackshift-message-sync.ts`) only. If
  the historical import has the same gap, that's a separate follow-up, not silently bundled here.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/desk/stackshift-message-sync.ts` | Modify | New ticket-level attachment fetch + linkage-to-opening-thread convention, wired into `syncTicketMessages()` |

## Code Context

### `src/lib/desk/stackshift-message-sync.ts`'s existing `syncMessageAttachments()` — the pattern to extend, not duplicate

```ts
async function syncMessageAttachments(
  token: string,
  messageId: string,
  attachments: DeskAttachment[]
): Promise<{ token: string; added: number }> {
  if (attachments.length === 0) return { token, added: 0 };
  // ... deskHeaders(), per-attachment existence check, fetchZohoWithRetry, size check,
  // Storage upload, attachments table upsert, per-attachment try/catch ...
}
```

The new ticket-level fetch should produce a `DeskAttachment[]` from
`GET /tickets/{id}/attachments` and pass it to this same function (or a shared extraction of its
body) with `messageId` = the opening thread's `inbox_messages.id`.

### Confirmed live diagnostic evidence (task 390 follow-up, ticket #21058, externalId `300063000091410001`)

```
openingThread: hasAttach: false, attachmentCount: -1, attachments: []
comment:       attachments: []
```
Both empty, despite the ticket having 10 real PDF attachments visible in StackShift's own UI —
this is the evidence base for this task's premise.

### `src/app/api/admin/zoho-import/ticket-attachments/route.ts` — reference for the download shape (thread/comment path, for the reusable helper)

Confirms server-side fetch works for Zoho Desk attachment content generally (`href` → `fetchZohoWithRetry` → arrayBuffer → Storage upload → `attachments` upsert) — the same mechanics apply to a ticket-level attachment's `href`, whatever the exact field name turns out to be.

## Implementation Steps

1. Add a temporary diagnostic log (same approach as task 390's follow-up) calling
   `GET /tickets/{ticketExternalId}/attachments` for the known test ticket (#21058) to confirm
   the real field names and whether thread/comment linkage is present. Remove once confirmed.
2. Based on what's found, add the ticket-level fetch function, extract the shared
   download/upload/upsert body from `syncMessageAttachments()` if warranted, and wire it into
   `syncTicketMessages()`.
3. Implement the opening-thread-message linkage convention (or the real linkage, if the API
   provides one).
4. Run verification (below), including a live re-run against ticket #21058 to confirm all 10
   attachments now appear on `/desk/inbox/0291a750-8f17-441c-a0c7-e0dd651374b3`.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] No diagnostic/temporary logging remains in the shipped code.
- [ ] Re-running the backfill route against ticket #21058 (Hub `ticket_number` 21058) results in
      its attachments appearing on `/desk/inbox/0291a750-8f17-441c-a0c7-e0dd651374b3` — matching
      the 10 files visible in StackShift's own UI for this ticket.
- [ ] Re-running a second time adds zero duplicate attachment rows (idempotent).
- [ ] A ticket whose attachments genuinely are thread/comment-embedded (if one can be found for
      testing) still gets them correctly — confirms the existing path wasn't broken by this
      addition.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Live verification (needs the same local setup already in use this session — real
`ZOHO_DESK_ORG_ID`/Zoho OAuth, admin session):

```js
fetch(`/api/admin/desk/backfill-stackshift-messages?ticketNumber=21058`, { method: "POST" })
  .then(r => r.json()).then(console.log)
```
Then browser-check `/desk/inbox/0291a750-8f17-441c-a0c7-e0dd651374b3`'s Attachments tab.

## Implementation Notes

### What Changed
- Added temporary diagnostic logging (step 1 of the plan), had the user run it live against
  ticket #21058, then removed it once the response shape was confirmed — followed exactly the
  same two-phase approach that worked for task 390's contentType fix.
- **Confirmed live response shape** for `GET /tickets/{id}/attachments`: `{id, name, size, href,
  isPublic, createdTime, previewurl, creatorId}` — matches the existing `DeskAttachment` type
  (`id`/`name`/`size`/`href` + index signature) exactly, no new type needed. **Confirmed no
  `threadId`/`commentId` linkage field exists** on any of the 10 real attachments returned — so
  the task doc's fallback convention (attach to the opening thread's message) is the only
  available option, not a decision that needed further judgment.
- `syncTicketMessages()` in `src/lib/desk/stackshift-message-sync.ts` now tracks
  `openingThreadMessageId` (set once the opening thread's `upsertInboxMessage()` call succeeds).
  After the existing thread/comment loops, if `openingThreadMessageId` is set, fetches
  `GET /tickets/{id}/attachments` via the existing `fetchAllDeskPages()` and passes the results
  straight to the **existing** `syncMessageAttachments()` — no new download/upload/upsert logic
  was needed since the existing function already accepts a plain `DeskAttachment[]` and the
  real response matches that type directly. Per-ticket `try/catch` around the fetch so a failure
  here doesn't affect the message-sync results already computed.
- If there's no opening thread yet (`openingThreadMessageId` stays `null`), ticket-level
  attachment ingestion is skipped for that run — no workaround entity invented, matches the task
  doc's guidance.
- `attachmentsAdded` in `SyncTicketMessagesResult` now includes ticket-level attachments in the
  same combined count as thread/comment-level ones (no separate counter needed, per the doc).

### Files Changed
- `src/lib/desk/stackshift-message-sync.ts` - added `openingThreadMessageId` tracking + the new
  ticket-level attachment fetch/sync block; no diagnostic code left in the final state

### Deviations From Plan
- None that required a judgment call — the live data resolved every open question the doc
  flagged as needing investigation (field shape, linkage) definitively, so the "shared
  helper extraction" option the doc mentioned as a possibility wasn't needed: `syncMessageAttachments()`
  already worked as-is for the ticket-level case with no duplication.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings, unchanged by this task)
- `grep -n "DIAGNOSTIC" src/lib/desk/stackshift-message-sync.ts` - no matches, confirming no
  temporary logging shipped
- Live re-run against ticket #21058 (local dev, real Desk credentials) - PENDING user
  confirmation this round; the diagnostic run already proved the endpoint returns exactly the 10
  real attachments visible in StackShift's UI, so the remaining step is confirming they appear
  on `/desk/inbox/0291a750-8f17-441c-a0c7-e0dd651374b3`'s Attachments tab after this fix deploys

## Quality Gate Notes

### Result
PASS

### Standards Review
- **No duplication introduced.** The new ticket-level attachment fetch reuses the existing
  `fetchAllDeskPages()` and, critically, the existing `syncMessageAttachments()` unchanged — no
  parallel download/upload/upsert implementation was written. Confirmed by re-reading the full
  file: `syncMessageAttachments()`'s body (lines 305-385) is identical to its pre-392 state.
- **`openingThreadMessageId` is minimal, correctly scoped state.** Declared once, set only on a
  successful opening-thread upsert, consumed with an explicit null-guard
  (`if (openingThreadMessageId)`) before the ticket-level fetch — no risk of it being read before
  set, since it's declared and used within the same function body in a single top-to-bottom pass.
- **Type cast (`ticketAttachments as DeskAttachment[]`) matches an existing pattern** already used
  in this same file (`enrichedThreadItems as DeskThread[]`) — not a new risk introduced, and the
  cast is now backed by a confirmed-live response shape rather than an assumption.
- **Error handling is intentional and consistent** — the new `try/catch` around the ticket-level
  fetch mirrors the file's existing fault-isolation style (log via `console.error`/`console.warn`
  with the file's established `[desk-message-sync]` prefix, never throw past a single ticket's
  processing). A failure here doesn't lose the `messagesInserted`/`contentTypeRepaired` counts
  already accumulated earlier in the same call.
- **Comments explain confirmed facts, not assumptions** — both new comment blocks cite the
  specific live evidence (ticket #21058, 10 attachments, no linkage field) rather than restating
  what the code does; matches this file's established comment style throughout.
- **No dead code, no diagnostic logging, no unused variables** — confirmed via
  `grep -n "DIAGNOSTIC"` (no matches) and a full re-read of the file.
- **Worth noting, not a defect**: the ticket-level attachment list fetch (`GET
  /tickets/{id}/attachments`) runs unconditionally whenever a ticket's opening thread syncs — one
  extra Desk API call per actively-changing ticket per poll cycle, on top of the existing
  threads/comments calls. The actual download work stays cheap (existing-attachment check skips
  re-downloading), but the list call itself isn't gated the way `repairExistingContentType` gates
  the contentType-patch write. This matches what the task doc asked for ("wire it in, called once
  per ticket") and `desk-ticket-poll`'s incremental design already limits it to tickets with new
  activity, so this isn't flagged as a deviation — just worth knowing if Desk API quota ever
  becomes a constraint on the steady-state cron.

### Deviations
- None. Implementation matched the task doc's Requirements exactly — including the one place the
  doc left a decision open (shared-helper extraction "if warranted"), which live evidence made
  unnecessary rather than the implementer skipping it.

### Note on workflow adaptation
- Per this repo's durable no-git-commands instruction, changed files were identified from the
  task document's own `Implementation Notes` (one file: `src/lib/desk/stackshift-message-sync.ts`)
  rather than `git diff --name-only`, same adaptation used for tasks 389–391's quality gates.

## Live Verification (post-quality-gate)

Live re-run against ticket #21058 (local dev, real Desk credentials) after deploying the real
implementation:

```json
{ "attachmentsAdded": 10, "messagesInserted": 0, "contentTypeRepaired": 0, "errors": [] }
```

`attachmentsAdded: 10` — exact match against the 10 real PDF attachments confirmed present on
this ticket via the earlier diagnostic pass. `messagesInserted`/`contentTypeRepaired` correctly
stayed `0` (both messages already existed and were already correct from the prior round).
Acceptance criterion "attachments appear on `/desk/inbox/.../` matching the 10 files visible in
StackShift's own UI" — confirmed by count; visual Attachments-tab check and a second re-run
(to confirm zero-duplicate idempotency) still pending.

## Final Verification Summary (task marked Completed)

`attachmentsAdded: 10` confirmed via live API response, exact match against the real StackShift
attachment count for ticket #21058. Task 393's later grid UI rewrite gave a visual channel to
confirm these render correctly (screenshot evidence in this session's later conversation showed
attachment tiles present on this exact ticket). A dedicated explicit re-run specifically to
re-confirm zero-duplicate idempotency (separate from the general repeated backfill re-runs
already done for tasks 390/392 combined) was not isolated and re-verified on its own.

**Marked Completed at the user's explicit request.**
