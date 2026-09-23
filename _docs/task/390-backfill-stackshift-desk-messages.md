# 390: Backfill Route — Force-Repair Already-Synced Desk/StackShift Tickets

**Created:** 2026-09-23
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep

---

## Overview

Task 389 fixed `desk-ticket-poll` (task 388's live cron) so that *going forward*, new StackShift
tickets sync their opening thread correctly, render HTML properly, and carry attachments. It did
**not** repair rows already written by the cron before that fix landed. Follow-up investigation
(during 389's review) found this repair does **not** happen automatically for most already-synced
tickets:

1. **The cron is purely incremental.** `desk-ticket-poll` only re-fetches a ticket when its
   Desk `modifiedTime` advances past the stored cursor (`email_poll_cursor` row
   `'stackshift-desk'`). A ticket that's already **closed/dormant** (e.g. the two examples from
   389's bug report — Quandary "Qaudary; Title and on-page content are misaligned", Maxton "PDF
   Updates on Adjustment Procedures and Troubleshooting Sections") never gets touched again by
   the cron, so it never gets reprocessed and never benefits from 389's fixes.
2. **Even a ticket that *does* get reprocessed won't have its stale `contentType` corrected.**
   `upsertInboxMessage()` (in `src/app/api/cron/desk-ticket-poll/route.ts`) treats an existing
   `inbox_messages` row (matched by `external_id`) as immutable and returns early without writing
   anything — by design, since Desk thread/comment *content* really is immutable once posted. But
   389's fix only changed what gets written for **new** rows; a message inserted before 389 keeps
   its old, wrong `source_meta.contentType` forever unless something explicitly patches it.
   (Missing-thread inserts and attachment backfills, by contrast, *do* already self-heal on any
   reprocess — see Code Context below — so the only genuinely new capability this task needs to
   add is a metadata-only repair path, plus a way to force a reprocess independent of the cursor.)

This task adds a manually-triggered, admin-only backfill route that forces a reprocess of
already-synced StackShift/Desk-poll tickets (bypassing the cursor) and repairs the one field that
doesn't already self-heal.

## Requirements

- [ ] **Extract the shared sync logic** out of `src/app/api/cron/desk-ticket-poll/route.ts` into a
      new module, `src/lib/desk/stackshift-message-sync.ts` (mirrors the existing
      `src/lib/desk/customer-view-access.ts` convention): `syncTicketMessages()`,
      `upsertInboxMessage()`, `syncMessageAttachments()`, `toIso()`, and the
      `DeskThread`/`DeskComment`/`DeskAttachment` types. Both the live cron route and the new
      backfill route call this one shared function — do not let the two drift into separate
      copies again (this is exactly the class of bug 389 fixed: task 388's route reimplementing
      logic instead of reusing an already-validated shared helper).
- [ ] Add an optional `repairExistingContentType` flag to `syncTicketMessages()`'s options
      (default `false`, so the live cron's steady-state behavior and API-call volume are
      unchanged unless explicitly opted in). When `true`, `upsertInboxMessage()`'s
      already-exists branch performs a targeted `UPDATE ... SET source_meta = source_meta ||
      jsonb_build_object('contentType', ...)` (or an equivalent read-then-patch in JS) that
      **only** touches `source_meta.contentType`, leaving `body`/`created_at`/`author_type`/every
      other field untouched — respecting the "Desk content is immutable" invariant for the actual
      message content while fixing the one field task 389 proved was wrong at ingestion time.
- [ ] New route: `POST /api/admin/desk/backfill-stackshift-messages` — mirror
      `src/app/api/admin/desk/backfill-inline-images/route.ts`'s established shape:
  - [ ] Auth: session + `admin`/`super_admin` role only (same guard as the sibling backfill
        routes).
  - [ ] Query params: `?dryRun=1` (report only, write nothing), `?limit=N` (cap tickets
        processed this call, default 25), `?ticketNumber=N` (restrict to one ticket — use this
        to verify against the two known-broken tickets before a wider run).
  - [ ] Target set (when no `ticketNumber` filter): paginate `inbox` rows where `channel = 'api'`
        (the exact marker `desk-ticket-poll` writes — task 388/389), using this repo's standard
        1000-row `.range()` pagination pattern (never an unbounded `.select()`).
  - [ ] For each targeted ticket, call the shared `syncTicketMessages(token, ticket.external_id,
        ticket.id, { repairExistingContentType: true })` — this alone handles: inserting any
        missing opening thread (self-heals via the existing 389 enrichment + insert-if-not-exists
        path), backfilling attachments on already-existing messages (already self-heals per Code
        Context below), and now also patching stale `contentType` on already-existing messages.
  - [ ] Response: a JSON summary object (not SSE — this route is bounded by `limit` the same way
        `backfill-inline-images` is, not expected to stream thousands of rows), reporting at
        least: `dryRun`, `ticketsProcessed`, `messagesInserted`, `contentTypeRepaired`,
        `attachmentsAdded`, `errors` (per-ticket, non-fatal — one ticket's failure must not abort
        the run).
  - [ ] `dryRun` must call through the same code path in a read-only mode (or compute what
        *would* change without writing) — not a separately-maintained parallel implementation,
        to avoid the dry-run/live-run drift risk this codebase has hit before.
- [ ] Re-running the route against an already-repaired ticket must be a no-op on its second pass
      (idempotent) — same external_id/attachment external_id keys already guarantee this for
      inserts; verify the new `contentType` patch is itself idempotent (patching an
      already-correct value is harmless).

## Out of Scope / Must-Not-Change

- **No change to the live cron's default behavior.** `desk-ticket-poll`'s recurring poll must
  keep calling the shared function *without* `repairExistingContentType` (default `false`) so
  routine 10-minute polls stay cheap and don't rewrite already-correct rows every run.
- **No repair of historically-imported (non-StackShift-poll) Desk tickets.** Tickets ingested via
  `desk-threads-import.ts`/`desk-comments-import.ts` (the one-time historical import, now also
  fixed by 389 to normalize `contentType`) are **not** in scope here — they can already be
  self-healed by re-running their existing admin import routes (true upsert on `external_id`).
  This task targets only `inbox.channel = 'api'` rows (the live-poll path).
- **No change to `body`, `author_type`, `created_at`, `visibility`, or any field other than
  `source_meta.contentType`** on an already-existing `inbox_messages` row — Desk content really
  is immutable once posted; only the ingestion-time metadata bug gets patched.
- **No new database migration** — no schema change is needed for this task.
- **No two-way sync, no changes to `webriq-pagebuilder/app`** — same boundary tasks 388/389
  already established.
- **No changes to `backfill-inline-images`/`backfill-archived-ticket-cf`** — separate, unrelated
  backfill routes; only their pattern is being mirrored, not their code.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/desk/stackshift-message-sync.ts` | Create | Shared `syncTicketMessages()` (+ helpers/types) extracted from the cron route, with a new `repairExistingContentType` option |
| `src/app/api/cron/desk-ticket-poll/route.ts` | Modify | Import the shared module instead of defining the logic inline; call without `repairExistingContentType` (unchanged default behavior) |
| `src/app/api/admin/desk/backfill-stackshift-messages/route.ts` | Create | New admin-only backfill route |

## Code Context

### Why missing-thread inserts and attachment backfills already self-heal on any reprocess

`src/app/api/cron/desk-ticket-poll/route.ts` (post-389), inside `syncTicketMessages()`:

```ts
const messageId = await upsertInboxMessage(inboxId, String(openingThread.id), { ... });
if (messageId) {
  currentToken = await syncMessageAttachments(currentToken, messageId, openingThread.attachments ?? []);
}
```

`upsertInboxMessage()` already returns the message id for **both** a newly-inserted row and a
pre-existing one:

```ts
if (existing) return existing.id as string; // idempotent — body/metadata are immutable once posted, but attachments may still need backfilling
```

So `syncMessageAttachments()` already runs unconditionally after either branch — an
already-existing message with no attachments yet gets them backfilled the moment its ticket is
reprocessed, no new code needed for that part. The one branch that does nothing on an existing
row is the early `return existing.id` itself — that's the exact spot the new
`repairExistingContentType` option needs to add a targeted `source_meta.contentType` patch
before returning.

### `src/app/api/admin/desk/backfill-inline-images/route.ts` — the pattern to mirror

Admin-only auth guard, `?dryRun`/`?limit`/`?ticketNumber` params (`ticketNumber` resolves via
`.eq("ticket_number", n)` against `inbox`), bounded per-call processing, single JSON summary
response with a per-item `unresolved`/error array. Reuse this shape rather than the SSE-streaming
shape used by `zoho-export`/`zoho-import` routes — this backfill isn't expected to process
thousands of rows in one call.

### `src/lib/desk/customer-view-access.ts` — precedent for the `src/lib/desk/` module location

Confirms `src/lib/desk/` already exists as the home for Desk-domain business logic that isn't a
raw API client wrapper (that's `src/lib/zoho/desk.ts`) and isn't a one-time import script (that's
`src/lib/migrate/`) — the new shared sync module belongs here.

## Implementation Steps

1. Create `src/lib/desk/stackshift-message-sync.ts`; move `syncTicketMessages()`,
   `upsertInboxMessage()`, `syncMessageAttachments()`, `toIso()`, and the
   `DeskThread`/`DeskComment`/`DeskAttachment` types into it verbatim, exporting
   `syncTicketMessages` as the public entry point. Add the `repairExistingContentType` option to
   its signature (default `false`) and thread it through to `upsertInboxMessage()`.
2. In `upsertInboxMessage()`'s `if (existing)` branch, when `repairExistingContentType` is true,
   read the existing row's `source_meta`, compute the normalized `contentType` from the freshly
   re-fetched Desk item, and `UPDATE` only that key if it differs from what's stored — skip the
   write entirely if it already matches (keeps repeated runs cheap and confirms idempotency).
3. Update `src/app/api/cron/desk-ticket-poll/route.ts` to import `syncTicketMessages` from the
   new module instead of defining it inline; confirm its call site doesn't pass
   `repairExistingContentType` (defaults to `false`).
4. Build `src/app/api/admin/desk/backfill-stackshift-messages/route.ts`: auth guard, param
   parsing, paginated `inbox` query (`channel = 'api'`, or the single `ticketNumber` match),
   per-ticket `try/catch` calling the shared sync function with `repairExistingContentType: true`,
   tallying the summary counters, JSON response.
5. Run verification (below), including a dry run and a live run against the two ticket numbers
   from task 389's bug report if reachable from the environment running this check.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] `desk-ticket-poll/route.ts` has no behavioral change for its normal cron invocation (no
      `repairExistingContentType` passed) — confirm by code review, since this environment has no
      live Desk data to verify against.
- [ ] Running the new route with `?ticketNumber=<Quandary's number>&dryRun=1` reports it would
      insert the missing opening-thread message and patch its `contentType`.
- [ ] Running it live (no `dryRun`) against that same ticket results in
      `/desk/inbox/[ticketId]` showing the opening message, correctly rendered HTML, and the
      correct author — matching 389's acceptance criteria, now applied retroactively.
- [ ] A second run against an already-repaired ticket reports zero further changes.
- [ ] The live cron's own request volume/behavior is unchanged (spot-check: no new Desk API
      calls added to its per-poll path).

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Live verification (needs a real Desk/StackShift account + admin session + `ZOHO_DESK_ORG_ID`):

```bash
curl -X POST "https://<hub-host>/api/admin/desk/backfill-stackshift-messages?dryRun=1&ticketNumber=<n>" \
  -H "Cookie: <admin session>"
```

Then re-run without `dryRun=1`, and browser-verify `/desk/inbox/[ticketId]` for both example
tickets from task 389's bug report.

## Implementation Notes

### What Changed
- Created `src/lib/desk/stackshift-message-sync.ts`, exporting `syncTicketMessages()` (plus the
  private `upsertInboxMessage()`/`syncMessageAttachments()`/`toIso()` helpers and the
  `DeskThread`/`DeskComment`/`DeskAttachment` types) — moved verbatim out of
  `desk-ticket-poll/route.ts`, with two behavioral additions:
  - `syncTicketMessages()` now takes an optional `opts: { repairExistingContentType?: boolean }`
    and returns a `SyncTicketMessagesResult` (`messagesInserted`/`contentTypeRepaired`/
    `attachmentsAdded` counters + the refreshed token) instead of `void`, so a caller can report
    what actually happened per ticket.
  - `upsertInboxMessage()`'s already-exists branch, when `repairExistingContentType` is true, now
    reads the existing row's `source_meta`, compares its `contentType` against the freshly
    computed normalized value, and issues a targeted `UPDATE` only when they differ — leaving
    `body`/`author_type`/`visibility`/`created_at` untouched. When false (the live cron's
    default), this branch behaves exactly as it did before task 390.
  - `syncMessageAttachments()` gained an existence check (`SELECT id FROM attachments WHERE
    external_id = ...`) before each download, so a backfill re-run against an already-repaired
    ticket does zero redundant Desk API/Storage calls for attachments it already has — this
    wasn't strictly required by the task doc but follows directly from its idempotency
    requirement and avoids wasted Zoho API quota on repeated sweeps.
- Updated `src/app/api/cron/desk-ticket-poll/route.ts` to import `syncTicketMessages` from the
  new shared module instead of defining it inline; its one call site is unchanged (no `opts`
  passed, so it keeps the pre-390 default behavior exactly). Removed the now-duplicated types,
  constants (`ATTACHMENTS_BUCKET`/`MAX_ATTACHMENT_SIZE`), and the `syncTicketMessages`/
  `upsertInboxMessage`/`syncMessageAttachments`/`toIso` functions from this file — it now ends
  right after `processTicket()`.
- Created `src/app/api/admin/desk/backfill-stackshift-messages/route.ts` — admin/super_admin-only
  `POST` route mirroring `backfill-inline-images`'s auth/param/response shape. Supports
  `?dryRun`, `?limit` (default 25), `?ticketNumber` (single-ticket, with a 400 guard rejecting a
  ticket whose `channel` isn't `"api"` — this route is scoped to StackShift/Desk-poll tickets
  only), and `?offset` (see Deviations). Loops the matched tickets calling the shared
  `syncTicketMessages(..., { repairExistingContentType: true })`, aggregating per-ticket results
  into a summary response; one ticket's failure is caught and reported in an `errors` array
  without aborting the rest of the run.

### Files Changed
- `src/lib/desk/stackshift-message-sync.ts` - new shared sync module (extracted + extended)
- `src/app/api/cron/desk-ticket-poll/route.ts` - now imports the shared module; dead code removed
- `src/app/api/admin/desk/backfill-stackshift-messages/route.ts` - new admin backfill route

### Deviations From Plan
- Added `?offset=N` to the backfill route beyond what the task doc's Requirements explicitly
  listed (`?dryRun`/`?limit`/`?ticketNumber` only). Rationale: the doc's own Requirements
  describe using `?ticketNumber` to verify against one ticket "before a wider run" — but without
  an offset, a second bounded call with just `?limit` would reprocess the *same* first N tickets
  (ordered by `id`) every time, since there's no SQL-expressible "still needs repair" predicate
  the way `backfill-inline-images` has (its candidate query filters on the body still containing
  a dead image pattern; this route's target set — `channel = 'api'` — doesn't shrink as tickets
  get repaired). `?offset` is the minimal addition needed to make "a wider run" actually sweep the
  full target set across multiple calls. Flagging this as a Minor deviation for visibility, not
  hiding it in the diff.
- `syncMessageAttachments()`'s pre-download existence check (see What Changed) is an efficiency
  addition not explicitly requested, kept because it directly serves the doc's own "re-running
  the route against an already-repaired ticket must be a no-op" requirement more cheaply than
  the original implementation (which would upsert into Storage again on every re-run, just with
  the same bytes).

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, unchanged by
  this task)
- Confirmed by code review that `desk-ticket-poll/route.ts`'s cron call site passes no `opts`,
  so its steady-state behavior/API-call volume is unchanged from pre-390.
- Live backfill run (dry run + live + re-run against the two example tickets from 389) - SKIPPED
  (no `ZOHO_DESK_ORG_ID`/Zoho OAuth/admin session/live ticket data reachable from this
  environment — same limitation noted in task 389's own Implementation Notes).

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Extraction is behavior-preserving for the cron's default path.** `desk-ticket-poll/route.ts`'s
  one call site (`await syncTicketMessages(token, externalId, inboxId);`) passes no `opts`, so
  every branch that previously ran unconditionally (thread enrichment, contentType
  normalization, attachment sync, insert-if-not-exists) still runs identically; the only new
  branch (`repairExistingContentType`'s patch-on-existing) is gated behind an option the cron
  never passes. Confirmed by reading both the new call site and the moved function — not just
  asserted.
- **No duplication reintroduced.** Both the cron route and the new backfill route import the
  same `syncTicketMessages` from `src/lib/desk/stackshift-message-sync.ts`; neither has a local
  copy of the thread/comment/attachment logic. This directly closes the gap that caused 389's
  bug (task 388's route reimplementing logic instead of reusing a shared, validated helper).
- **Clear responsibility split.** `stackshift-message-sync.ts` owns Desk-domain sync logic;
  `desk-ticket-poll/route.ts` owns cron auth + cursor bookkeeping; the new
  `backfill-stackshift-messages/route.ts` owns admin auth + target selection + result
  aggregation. No function does more than one job.
- **Naming is accurate.** `repairExistingContentType` describes exactly what it does and nothing
  more (doesn't imply a fuller "resync" it doesn't perform). `SyncTicketMessagesResult`'s three
  counters map 1:1 to the three things task 389 found broken.
- **Error handling is intentional, not swallowed.** Per-ticket `try/catch` in the backfill route
  reports failures in a typed `errors` array rather than aborting the run (matches
  `backfill-inline-images`'s `unresolved` convention); per-attachment fault isolation inside
  `syncMessageAttachments()` is unchanged from 389's already-reviewed version, just relocated.
- **No secrets logged, no `any`, no dead code.** Confirmed by re-reading all three changed files
  in full; `pnpm lint` reports 0 new warnings (same 2 pre-existing, unrelated ones as before this
  task).
- **`inbox` query in the paginated (non-`ticketNumber`) branch is correctly bounded** — it uses
  `.range(offset, offset + limit - 1)` with a small default `limit` (25), not an unbounded
  lookup-map-building query, so this repo's ">1000 rows silently truncated" convention doesn't
  apply here (that convention targets queries meant to enumerate *all* matching rows in one call,
  which this deliberately is not).
- No file in this task's scope exceeds a length that would call for further splitting; each new
  file has a single, narrow purpose.

### Deviations
- **Minor** — `?offset=N` query param added to the backfill route beyond the task doc's literal
  Requirements list (`?dryRun`/`?limit`/`?ticketNumber` only). Already disclosed in
  Implementation Notes with rationale (the target set doesn't shrink as tickets get repaired, so
  a second bounded call needs a way to advance past the tickets the first call already covered).
  Satisfies the doc's own intent ("a wider run" after single-ticket verification) rather than
  contradicting it — proceeding.
- **Minor** — `syncMessageAttachments()`'s pre-download existing-attachment check is an addition
  not explicitly requested, but directly serves the doc's own idempotency requirement
  ("re-running the route against an already-repaired ticket must be a no-op") more cheaply.
  Already disclosed in Implementation Notes — proceeding.
- No Medium or Major deviations found.

### Note on workflow adaptation
- Per this repo's durable no-git-commands instruction (including read-only `git diff`/`git
  status`), changed files were identified from the task document's own `Implementation Notes`
  rather than `git diff --name-only`, same adaptation used for task 389's quality gate.

## Live Testing Fix (post-quality-gate)

Live testing against a real ticket (Maxton, Hub `ticket_number` 21058, Zoho externalId
`300063000091410001`) surfaced a real bug in task 389's `contentType` fix, found via this
route's dry-run/live sequence:

- **What was observed**: the backfill's live run reported `messagesInserted: 1` and correctly
  inserted the previously-missing opening thread (author now shows "Guest", not "WebriQ" —
  confirming that part of 389's fix works). But the message still rendered as literal
  `<p>...</p><br><b>...</b>` text instead of formatted HTML.
- **Root cause**: task 389's `normalizeDeskContentType()` derived `"text/html"` only when
  Zoho's own `contentType` field equaled `"html"` — an assumption based on reading
  `webriq-pagebuilder/app`'s `create-ticket-comment.ts`, which only proves what StackShift's app
  *sends* when posting a comment, not what Zoho *returns* for an auto-created thread (a ticket's
  `description`, never posted through that code path). That assumption was flagged as
  unverified in task 388's own doc and turned out wrong for this case — the live thread's
  `contentType` field evidently isn't `"html"`, so the derived value fell through to
  `"text/plain"` and the renderer never treated the body as HTML.
- **Fix**: replaced `normalizeDeskContentType()` (in `src/lib/zoho/desk.ts`) with a constant,
  `DESK_MESSAGE_CONTENT_TYPE = "text/html"`, applied unconditionally at all 4 Desk-sourced write
  sites (`stackshift-message-sync.ts`'s thread + comment branches, `desk-threads-import.ts`,
  `desk-comments-import.ts`) — stops depending on Zoho's own `contentType` field entirely,
  rather than adding another guess about its values. Justification: every Desk thread/comment
  body observed so far (this Guest message, and the WebriQ reply from the original bug report)
  contains genuine HTML markup, and `desk-threads-import.ts`'s own long-standing comment already
  established threads never carry a `plainText` fallback either way — body is always HTML.
- **Retroactive effect**: task 390's `repairExistingContentType` patch mechanism (already built)
  handles re-correcting any row this backfill route already touched with the wrong value — no
  new backfill mechanism needed, just re-running the existing route against affected tickets
  after this fix deploys.
- **Files changed this round**: `src/lib/zoho/desk.ts` (function → constant),
  `src/lib/desk/stackshift-message-sync.ts`, `src/lib/migrate/desk-threads-import.ts`,
  `src/lib/migrate/desk-comments-import.ts`.
- **Verification**: `npx tsc --noEmit` PASS (0 errors), `pnpm lint` PASS (2 pre-existing
  unrelated warnings), confirmed zero remaining references to the removed
  `normalizeDeskContentType`.
- **Verified live** (local dev, real Desk credentials, Maxton ticket #21058): re-running the
  backfill after this fix correctly re-patched the contentType; browser confirmed both the
  Guest thread message and the WebriQ reply comment now render as formatted HTML with the
  correct author on each. Re-running a third time returned all zeros (`messagesInserted: 0,
  contentTypeRepaired: 0`), confirming idempotency holds.

## Attachments Gap — Confirmed Root Cause, Deferred to a New Task

Live diagnostic logging (added temporarily, then removed — see below) against the same Maxton
ticket confirmed why `attachmentsAdded` stayed `0` with no warn/error logs at all: it's not a
download failure, the thread/comment objects genuinely carry no attachment data.

Raw Zoho Desk response for the opening thread: `hasAttach: false, attachmentCount: -1,
attachments: []`. Same for the reply comment: `attachments: []`. Yet StackShift's own UI (the
original bug report) shows 10 PDF files attached to this exact ticket.

**Confirmed conclusion**: those files are Zoho Desk **ticket-level** attachments (a separate
`GET /tickets/{id}/attachments` endpoint), not thread- or comment-level ones. This is exactly
what task 388's original doc flagged and deliberately deferred: *"StackShift's attachment
flow... is a distinct API surface from Desk's own `/tickets/{id}/attachments`... confirm they
resolve to the same underlying Desk attachment objects before wiring this up."* That warning
is now confirmed correct — the assumption this task's `syncMessageAttachments()` was built on
(that `thread.attachments`/`comment.attachments` would carry StackShift-uploaded files) does not
hold for ticket-level uploads.

**Why this isn't a quick patch**: Hub's `attachments` table requires `entity_id` to point at a
specific `inbox_messages` row (`entity_type: 'inbox_message'`). A ticket-level attachment has no
natural single-message owner — attaching it to the opening thread message is a plausible
convention, but it's a real design decision (not an obvious fix) and needs its own scoped task:
fetch `/tickets/{id}/attachments`, decide the entity linkage, and wire it into
`stackshift-message-sync.ts` alongside the existing thread/comment attachment logic (which stays
correct and should be kept — a thread or comment *could* still carry its own attachments in
other tickets, this ticket's data just happens to have none there).

**Diagnostic logging added/removed this session**: temporary `console.log` calls dumping the raw
Zoho thread/comment object keys were added to `stackshift-message-sync.ts` to get this evidence,
then fully removed once the finding was confirmed — `npx tsc --noEmit` and `pnpm lint` both
re-verified clean after removal. No diagnostic code shipped.

**Follow-up**: scoped as a new task (392) via the `task` skill.

## Confirmed, Permanent Limitation — StackShift Comment Author Identity (Do Not Re-Investigate As a Bug)

Live testing on a second ticket (Hub `ticket_number` 21057, Zoho externalId
`300063000091410100`-series, "Uploading issues") surfaced what looked like a new bug: a comment
genuinely typed by the customer ("Guest" on StackShift, Sep 22 2026 10:13 PM: *"Thank you for
the error and we found that we can upload."*) displayed in the Hub as authored by **"WebriQ"**
and marked **Private**, instead of the customer and Public.

**Root cause confirmed via temporary diagnostic logging** (added to
`stackshift-message-sync.ts`, then fully removed — `npx tsc --noEmit`/`pnpm lint` re-verified
clean after removal, no diagnostic code shipped): every comment on this ticket, regardless of
who actually typed it in StackShift's UI, carries the **identical** `commenter` object from
Zoho Desk's API:

```json
{"name":"WebriQ","email":"helpdesk@webriq.us","type":"AGENT","roleName":"CEO"}
```

**This is not a bug in `stackshift-message-sync.ts`'s `isAgent`/`visibility` derivation.**
StackShift's own app posts *every* comment to Zoho Desk — whether typed by the actual customer
or by WebriQ staff replying through StackShift's interface — under one shared Desk agent
identity (`helpdesk@webriq.us`, `type: "AGENT"`). Zoho Desk's API exposes no field that
distinguishes these; the real end-user mapping exists only inside StackShift's own internal
"datahub" API, which Central Hub has no access to. Hub is correctly displaying exactly what
Zoho Desk itself records — `isAgent = commenter?.type !== "END_USER"` reads `"AGENT"` and
correctly returns `staff`; the underlying data source itself cannot distinguish the true author.
The `Private` label is the same story: that comment's Zoho `isPublic` field genuinely came back
`false` (StackShift's own choice when posting a guest follow-up as a comment), so Hub is
faithfully mirroring Zoho's own recorded state, not misreading it.

**This was already anticipated, not a new discovery** — task 388's original planning doc,
Finding 4, flagged this exact limitation before any of this code was written: *"The true
end-user identity behind a StackShift-authored comment is NOT always recoverable from Desk
alone... Central Hub has no access to that datahub... display whatever Desk itself returns."*
This entry exists to record that the anticipated limitation has now been **confirmed with real
live data**, not merely theorized.

**There is no fix available on Central Hub's side.** The only paths that would actually resolve
this both require a change in `webriq-pagebuilder/app` (a separate repo, StackShift's own team):
1. Post guest-authored comments to Zoho Desk as genuine `END_USER`-type comments instead of
   through the shared `helpdesk@webriq.us` agent identity, or
2. Expose StackShift's internal datahub author-mapping to Central Hub via some new API.

Neither is in scope for Central Hub. **Do not re-open this as a Hub-side bug** without one of
those two external changes landing first — re-deriving `isAgent`/`visibility` differently on
Central Hub's side cannot fix this, since the distinguishing information doesn't exist in any
data Central Hub receives.
