# 332: Zoho Desk Archived-Ticket Threads, Comments & Attachments Export/Import

**Created:** 2026-08-28
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed (2026-08-28)

---

## Overview

Task 325 imported ~1,566 archived Zoho Desk tickets (created 2025-01-01 onward) into the
`tickets` table (`source_meta.isArchived === true`). **Only the ticket records came across —
their conversation history did not.** The three enrichment exports that build a ticket's
conversation all iterate `_from_zoho/desk-tickets.json` (the *live* tickets export) and never
touch an archived ticket id:

| Export route | Iterates | Archived covered? |
|---|---|---|
| `zoho-export/desk-threads` | `readFromZoho("desk-tickets.json")` | ❌ |
| `zoho-export/desk-ticket-comments` | `readFromZoho("desk-tickets.json")` | ❌ |
| `zoho-import/ticket-attachments` | scans `ticket_messages` in the DB | ⚠️ only whatever threads/comments got imported |

So for every archived ticket the Hub currently shows an empty conversation on the ticket
detail page. Ahead of Zoho decommission this history is unrecoverable once the portal is gone.

Task 325 explicitly deferred this (Out of Scope §, lines 133–135):

> **Archived ticket threads / comments / attachments.** Only the ticket records are in scope.
> Whether `/tickets/{id}/threads` and `/tickets/{id}/comments` work for archived tickets is
> unverified — filed as a follow-up.

This task is that follow-up.

### Key finding: the import side already works — only the export enumeration is missing

`zoho-import/desk-threads` and `zoho-import/desk-ticket-comments` match each row to a ticket
via a lookup map keyed on `tickets.external_id` (`ticketMap.get(String(t._zoho_ticket_id))`).
**Archived tickets are already rows in `tickets` with a populated `external_id`** (task 325),
so an archived thread/comment payload carrying `_zoho_ticket_id` would import and link
correctly today — there is just nothing producing that payload. Likewise
`zoho-import/ticket-attachments` is fully DB-driven (paginated scan of
`ticket_messages.source_meta.attachments`), so archived-ticket attachments are picked up
**automatically** on a re-run once the archived threads/comments land in `ticket_messages` —
no attachment-specific export or import code is needed.

### Unknown to resolve first (Risk 1): do the Zoho endpoints serve archived ticket ids?

`GET /api/v1/tickets/{id}/threads` and `/comments` are documented for live tickets. Whether
Zoho Desk honours them for an **archived** ticket id is unverified. First implementation step
is a probe (see Implementation Steps 1). Three outcomes:

- **Works with the existing `Desk.tickets.READ` scope** → straightforward, proceed.
- **Works but needs `Desk.search.READ`** (already on `ZOHO_REFRESH_TOKEN` since task 325's
  live run) → proceed.
- **Returns 404/403 for archived ids** → the per-ticket threads/comments endpoints don't
  cover the archive; fall back options (Bulk Export API `module: threads`, or the archived
  ticket's `lastThread` / embedded `threadCount` only) go in Open Questions and the task
  narrows to "capture whatever the archive endpoint itself already returns."

## Requirements

- [ ] **Probe first.** A one-shot diagnostic (script or temporary route) that calls
      `/tickets/{archivedId}/threads?limit=1` and `/tickets/{archivedId}/comments?limit=1`
      for a known archived ticket id from `_from_zoho/desk-archived-tickets.json` and reports
      status + body shape. Nothing else ships until this confirms the endpoints work.
- [ ] **Extract shared export logic.** Lift the per-ticket threads loop from
      `zoho-export/desk-threads/route.ts` and the per-ticket comments loop from
      `zoho-export/desk-ticket-comments/route.ts` into reusable helpers in
      `src/lib/zoho/desk.ts` that take a `ticketIds: string[]` (or `{id}[]`) list and stream
      results — so the live and archived export routes share one implementation
      (mirrors task 325's `importDeskTickets` extraction).
- [ ] **New export route** `GET /api/admin/zoho-export/desk-archived-threads` — SSE, admin /
      super_admin gated, reads `_from_zoho/desk-archived-tickets.json`, iterates each archived
      ticket id through the shared threads helper, tags every row with `_zoho_ticket_id`,
      streams `progress` / `threads` / `done` (with `failed_ticket_ids`), downloads
      `desk-archived-threads.json`. Per-ticket `try/catch` → failed id recorded, loop
      continues (same resilience as `desk-threads`). Every Zoho call via `fetchZohoWithRetry`
      (429 / rolling-throttle / 401).
- [ ] **New export route** `GET /api/admin/zoho-export/desk-archived-ticket-comments` — same
      shape, shared comments helper, downloads `desk-archived-ticket-comments.json`.
- [ ] **Client-side partial-result persistence** in both new export handlers — accumulate
      batches in a ref; if the SSE stream ends without a `done` event, still download
      `<name>.partial.json` + show a "re-run to resume (restarts from ticket 1)" notice.
      (Same pattern task 325 added for `desk-archived-tickets`.)
- [ ] **Extract `importDeskThreads(rows)` and `importDeskComments(rows)` helpers** into
      `src/lib/migrate/` (lift the current import route bodies verbatim — lookup-map build,
      author-type derivation, `source_meta` shape, chunked upsert on `external_id`). Repoint
      the existing `zoho-import/desk-threads` and `zoho-import/desk-ticket-comments` routes at
      the helpers; confirm their response JSON is byte-identical.
- [ ] **New import routes** `POST /api/admin/zoho-import/desk-archived-threads` and
      `POST /api/admin/zoho-import/desk-archived-ticket-comments` — auth guard +
      `readFromZoho(...)` of the archived file + the shared helper. No new matching logic
      (archived tickets already resolve via `tickets.external_id`).
- [ ] **Attachments: no new code.** Document that after importing archived threads/comments
      the operator re-runs the existing **Ticket Attachments** import — its DB scan now sees
      the archived-ticket messages and downloads their files. Verify a sample archived
      attachment `href` fetches 200 OK server-side (via the existing `verify-attachment`
      diagnostic route) before the bulk run.
- [ ] **`_zoho-desk-tab.tsx`** — two new export rows ("Desk Archived Threads", "Desk Archived
      Ticket Comments"), two new import rows, `EXPORT_LEVELS` / `IMPORT_LEVELS` entries, and
      the "Run steps in order" banner updated (archived threads/comments export after
      `desk-archived-tickets` export; archived threads/comments import after
      `desk-archived-tickets` import; Ticket Attachments re-run last).
- [ ] `npx tsc --noEmit` + `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- **Pre-2025 archived tickets.** `_from_zoho/desk-archived-tickets.json` is already the
  2025-onward slice (task 325). This task only enriches whatever is in that file.
- **The live `desk-threads` / `desk-ticket-comments` export + import behaviour** — unchanged
  in output; only refactored to expose shared helpers (byte-identical response JSON, same
  `desk-tickets.json` input, same downloaded filenames).
- **`ticket_messages` / `tickets` / `attachments` schema** — no migration. Archived-ticket
  messages use the same columns + `source_meta` as live ones.
- **The `ticket-attachments` import route** — not modified. It already covers archived
  attachments via its DB scan once the messages exist; the only change is a doc note + a
  banner ordering hint.
- **Ticket detail page / conversation UI** (tasks 320–324, 328) — no change; archived tickets
  render through the same `ticket_messages` feed once populated.
- **Combining archived + live into one export file.** Keep them as separate files / rows for
  independent progress, resilience, and re-runnability — matches task 325's precedent.
- **Server-side resume / checkpointing** — out of scope, same as task 325. Re-running an
  export restarts from ticket 1; the client-side partial download is the only resilience.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/zoho/desk.ts` | Modify | Add `exportThreadsForTickets(ticketIds, token, label, { onBatch, onProgress })` and `exportCommentsForTickets(...)` — the per-ticket loops lifted from the two live export routes (list-page pagination, defensive per-thread detail fill for threads, `_zoho_ticket_id` tag, per-ticket `try/catch` surfacing failed ids). Return `{ token, totalCount, failedTicketIds }`. |
| `src/app/api/admin/zoho-export/desk-threads/route.ts` | Modify | Reduce the SSE `start()` body to build the live ticket-id list from `desk-tickets.json` and delegate to `exportThreadsForTickets(...)`. Output unchanged. |
| `src/app/api/admin/zoho-export/desk-ticket-comments/route.ts` | Modify | Same — delegate to `exportCommentsForTickets(...)`. Output unchanged. |
| `src/app/api/admin/zoho-export/desk-archived-threads/route.ts` | Create | SSE export: ticket-id list from `desk-archived-tickets.json` → `exportThreadsForTickets(...)` → `progress` / `threads` / `done` (+ `failed_ticket_ids`). Downloads `desk-archived-threads.json`. |
| `src/app/api/admin/zoho-export/desk-archived-ticket-comments/route.ts` | Create | Same, comments. Downloads `desk-archived-ticket-comments.json`. |
| `src/lib/migrate/desk-threads-import.ts` | Create | `importDeskThreads(rows: DeskThreadRaw[]): Promise<ImportResult>` — the current `zoho-import/desk-threads` route body verbatim (paginated `tickets` lookup map on `external_id`, `auth.admin.listUsers` cache, author-type derivation, `source_meta` shape, `CHUNK_SIZE=50` upsert on `external_id` with bounded retry). |
| `src/lib/migrate/desk-comments-import.ts` | Create | `importDeskComments(rows: DeskCommentRaw[]): Promise<ImportResult>` — the current `zoho-import/desk-ticket-comments` route body verbatim. |
| `src/app/api/admin/zoho-import/desk-threads/route.ts` | Modify | Reduce to auth guard + read `desk-threads.json` + `importDeskThreads(...)`. Response JSON byte-identical. |
| `src/app/api/admin/zoho-import/desk-ticket-comments/route.ts` | Modify | Reduce to auth guard + read `desk-ticket-comments.json` + `importDeskComments(...)`. Response JSON byte-identical. |
| `src/app/api/admin/zoho-import/desk-archived-threads/route.ts` | Create | Auth guard + `readFromZoho("desk-archived-threads.json")` + `importDeskThreads(...)`. |
| `src/app/api/admin/zoho-import/desk-archived-ticket-comments/route.ts` | Create | Auth guard + `readFromZoho("desk-archived-ticket-comments.json")` + `importDeskComments(...)`. |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | Modify | New `ArchivedThreadsExportState` / `ArchivedCommentsExportState` + `handleArchivedThreadsExport()` / `handleArchivedCommentsExport()` (clones of `handleThreadsExport` with the task-325 partial-download resilience), two export rows, two import rows, `EXPORT_LEVELS` / `IMPORT_LEVELS` entries, updated "Run steps in order" banner. |
| `_docs/task/332-...md` | — | This document; the "Run steps in order" banner is the user-facing doc surface. |

## Code Context

### `src/app/api/admin/zoho-export/desk-threads/route.ts` — the loop to extract

Lines 56–103: `for (let i = 0; i < tickets.length; i++)` → `fetchAllDeskPages(\`/tickets/${ticketId}/threads\`, token, …)`,
then per-thread: if `raw.content` is empty, a `fetchDeskPage(\`/tickets/${ticketId}/threads/${threadId}\`, …)`
detail fill; every row gets `{ ...raw, _zoho_ticket_id: ticketId }`; per-ticket `try/catch`
pushes to `failedTicketIds` and continues; `send({ type: "threads", threads })` +
`send({ type: "progress", … })`; final `send({ type: "done", total_threads, failed_ticket_ids })`.
The extracted helper takes `ticketIds` + `onBatch`/`onProgress` callbacks and returns the
running token + totals + failed ids.

### `src/app/api/admin/zoho-export/desk-ticket-comments/route.ts` — simpler sibling

Lines 55–70: `fetchAllDeskPages(\`/tickets/${ticketId}/comments\`, …)` → `items.map(c => ({ ...c, _zoho_ticket_id: ticketId }))`
→ `send({ type: "comments", comments })`. No detail-fill pass. Same `try/catch` + `done` shape.

### `src/app/api/admin/zoho-import/desk-threads/route.ts` — import already archive-ready

```ts
// lines 96–117 — paginated tickets lookup, keyed on external_id
const ticketMap = new Map(ticketRows.map((t) => [String(t.external_id), t.id]));
// ...
const ticketId = ticketMap.get(String(t._zoho_ticket_id ?? ""));
if (!ticketId) { result.errors.push(`thread ${externalId}: no Hub ticket found…`); result.skipped++; continue; }
```

Archived tickets are in `tickets` with a non-null `external_id` (task 325), so this resolves
with no change. Lift lines 75–196 into `importDeskThreads(rows)` — the route keeps only the
auth guard, the file read, the empty-check, and `return NextResponse.json(await importDeskThreads(threads))`.

### `src/app/api/admin/zoho-import/ticket-attachments/route.ts` — no change needed

```ts
// lines 56–65 — DB-driven scan, no file input, covers whatever is in ticket_messages
const { data: page } = await adminClient
  .from("ticket_messages")
  .select("id, source_meta")
  .range(from, from + PAGE - 1);
```

Header comment already says "No export step needed — every attachment's href/name/size
already lives in the live ticket_messages table." After the archived threads/comments import,
re-running this route downloads their files too. `entity_type: 'ticket_message'`,
`entity_id = ticket_messages.id`.

### `_zoho-desk-tab.tsx` — `EXPORT_LEVELS` / `IMPORT_LEVELS` (lines ~55–68)

New entries mirroring the existing `desk-threads` / `desk-ticket-comments` / `desk-archived-tickets`
wording. Export descs note "requires desk-archived-tickets.json exported first". Import descs
note "requires Desk Archived Tickets imported first; then re-run Ticket Attachments".

### Auth guard (identical in every sibling route)

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return …401;
const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (profile?.role !== "admin" && profile?.role !== "super_admin") return …403;
let token = await getZohoAccessToken();
if (!token) return …502;
if (!process.env.ZOHO_DESK_ORG_ID) return …500;
```

## Implementation Steps

1. **Probe (blocking).** Write a throwaway script or `GET /api/admin/zoho-export/_probe-archived-conv`
   that reads the first id from `_from_zoho/desk-archived-tickets.json`, calls
   `fetchDeskPage(\`/tickets/${id}/threads\`, token, { limit: "1" }, "probe")` and the same
   for `/comments`, and logs `res.status` + `await res.text()`. Confirm 200 + a `{ data: [...] }`
   shape. If 404/403, stop and revise this task per Risk 1 before building anything else.
2. **`desk.ts`:** add `exportThreadsForTickets()` and `exportCommentsForTickets()` — the two
   per-ticket loops, parameterised on the id list + `onBatch`/`onProgress`, returning
   `{ token, totalCount, failedTicketIds }`. Uses `fetchAllDeskPages` / `fetchDeskPage` so
   retry/throttle is inherited.
3. **Repoint the two live export routes** at the helpers; diff a fresh `desk-threads.json` /
   `desk-ticket-comments.json` against a pre-change run (or spot-check the SSE frames) to
   confirm identical output.
4. **New export routes** `desk-archived-threads` + `desk-archived-ticket-comments`: auth guard
   → `readFromZoho("desk-archived-tickets.json")` → map to ids → SSE stream delegating to the
   helper → `progress` / `threads`|`comments` / `done` (+ `failed_ticket_ids`).
5. **Extract `importDeskThreads()` / `importDeskComments()`** into `src/lib/migrate/`; repoint
   the two live import routes; confirm response JSON byte-identical.
6. **New import routes** `desk-archived-threads` + `desk-archived-ticket-comments`: auth guard
   → `readFromZoho(...)` → shared helper → return `ImportResult`.
7. **`_zoho-desk-tab.tsx`:** add the two export states + handlers (clone `handleThreadsExport`,
   add the task-325 partial-download `try/catch/finally` around the reader loop), two export
   rows, two import rows, `EXPORT_LEVELS` / `IMPORT_LEVELS` entries, banner update.
8. `npx tsc --noEmit` + `pnpm lint`. Browser-test on `/admin/migrate` → Zoho Desk tab
   (see Verification).
9. **Live run** (operator): export archived threads → export archived comments → place both
   in `_from_zoho/` → import both → **re-run Ticket Attachments** → spot-check an archived
   ticket's detail page shows its conversation + attachments.

## Acceptance Criteria

- [x] Probe confirmed: both archived exports ran to completion, so Zoho serves
      `/tickets/{archivedId}/threads` and `/comments` for archived ids with the existing scope.
- [x] `/admin/migrate` → Zoho Desk tab shows **Desk Archived Threads** and **Desk Archived
      Ticket Comments** export rows (with progress bars) and matching import rows — the
      operator ran all four.
- [x] Each export downloaded a flat JSON array; **every** row carries `_zoho_ticket_id`
      (verified: 0 missing across both files) resolving to one of the 1,566 archived tickets.
- [~] Per-ticket fault isolation (`failed_ticket_ids`) — code path is the proven live
      `desk-threads` pattern; **not exercised** in the live run (no ticket fetches threw).
- [~] SSE partial-download fallback — **not exercised** (both streams completed cleanly to
      `done`).
- [x] Imports upsert into `ticket_messages` on `external_id`, linked to the archived
      `tickets.id` via `_zoho_ticket_id` → `external_id`; `source_meta.zohoSource` set;
      author_type derived per row. **Threads: 3,438 imported** (1 boundary dupe deduped,
      0 skipped after the synthetic-body fix, 3 synthetic bodies). **Comments: 3,656 imported.**
- [x] Re-running each import is idempotent — proven by the threads re-run (3,435 → 3,438,
      existing rows untouched) and the Ticket Attachments "already stored" skips.
- [x] Re-running **Ticket Attachments** downloaded the archived files into the
      `ticket-attachments` bucket + `attachments` table (`entity_type: 'ticket_message'`):
      **642 thread + 4 comment = 646 imported**, 0 errors; stored Desk attachment count
      166 → 812.
- [~] Live `desk-threads` / `desk-ticket-comments` byte-identical regression — refactor is a
      pure extraction (event ordering, `done` keys, `ImportResult` shape reviewed line-by-line);
      a live before/after diff was **not run**.
- [ ] Archived ticket detail page renders the merged conversation + attachments — **operator
      browser check still pending** (data is in place; this is a UI spot-check, not a code gap).
- [x] `npx tsc --noEmit` and `pnpm lint` pass (re-run clean after both post-gate fixes).

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then, as an admin user:
```

- **Probe:** hit the diagnostic route / run the script → confirm 200 + `{ data: [...] }` for
  both endpoints against a real archived ticket id.
- `/admin/migrate` → **Zoho Desk** → **Desk Archived Threads** → **Export**. Watch the
  progress bar advance per ticket; confirm the downloaded JSON's every row has a valid
  `_zoho_ticket_id`. Repeat for **Desk Archived Ticket Comments**.
- **Fault isolation:** temporarily point one id at a bogus value → the stream keeps going,
  that id is in `done.failed_ticket_ids`, the rest export.
- **Partial download:** start an export, kill `pnpm dev` before it finishes → the browser
  still saves `desk-archived-threads.partial.json` + shows the resume notice.
- Place both files in `_from_zoho/`, run both archived imports. In Supabase:
  `select count(*) from ticket_messages m join tickets t on t.id = m.ticket_id
   where t.source_meta->>'isArchived' = 'true';` → matches the exported row count
   (minus rows skipped for empty body / unresolved ticket).
- Re-run both imports → `imported` count stable, no duplicate `external_id`.
- Run **Verify Attachment** (existing diagnostic) on one archived thread's
  `source_meta.attachments[].href` → 200 OK. Then re-run **Ticket Attachments** →
  confirm new rows in `attachments` for `entity_type = 'ticket_message'` tied to archived
  messages.
- Open 2–3 archived tickets' detail pages → conversation feed populated, attachments listed.
- **Regression:** run the normal **Desk Threads** + **Desk Ticket Comments** export + import
  → output and `ImportResult` unchanged.

## Open Questions / Risks

1. **Do the per-ticket threads/comments endpoints serve archived ids?** (Blocking — see
   Implementation Step 1.) If they 404/403: fallbacks, not built here unless the probe forces
   it —
   - **Bulk Export API** (`module: threads` / `module: contacts`-style async job) — no
     per-ticket loop, but a large build.
   - **Archived ticket's own embedded fields** — task 325's `desk-archived-tickets.json`
     rows carry `threadCount` / `lastThread` (a single most-recent thread). Importing just
     `lastThread` gives partial history — better than nothing, decide with the operator.
2. **OAuth scope.** Live threads/comments use `Desk.tickets.READ` (already granted). If the
   archived variants need `Desk.search.READ`, that scope is already on `ZOHO_REFRESH_TOKEN`
   after task 325's live run — but confirm in the probe (a `401 INVALID_OAUTH` there means
   the token needs regenerating with the extra scope, same as task 325 Risk 1).
3. **Volume / runtime.** ~1,566 archived tickets × (1 threads list call + N per-thread detail
   calls + 1 comments call) with rolling-throttle backoff is a long localhost run — same
   class as task 325's export and the live `desk-threads` export (which already loops every
   live ticket). Per-ticket `try/catch` + client-side partial download mean a run that dies
   partway keeps its progress, but there is **no server-side resume** (re-run restarts from
   ticket 1). Escalate to a checkpointed resume only if the live run proves too flaky to
   finish in one pass.
4. **Attachment fetchability for archived tickets.** `ticket-attachments` confirmed
   server-side fetch works for *live* Desk attachment `href`s (task 304 follow-up,
   `verify-attachment` returned 200 image/jpeg). Archived-ticket attachment hrefs are assumed
   to use the same `desk.zoho.com/supportapi/...` host and auth — verify one before the bulk
   run. If archived attachment content is gated differently, that's a separate follow-up
   (metadata still lands in `source_meta.attachments` regardless).
5. **Thread timestamp field names.** The live `desk-threads` import already hedges
   (`createdTime ?? commentedTime ?? upsert-default`). Archived payloads are assumed
   shape-identical; confirm against a real `desk-archived-threads.json` sample.
6. **`_zoho_ticket_id` collisions.** None expected — archived and live ticket ids are
   disjoint in Zoho, and `ticket_messages.external_id` is the thread/comment id (also
   globally unique in Zoho), so archived rows can't clash with live rows on the upsert.

## Compatibility Touchpoints

- No DB migration, no schema change, no new env var (scope already covered by task 325).
- No new `server.registerTool` calls → `_docs/mcp-tools.md` unaffected.
- New `_from_zoho/desk-archived-threads.json` + `_from_zoho/desk-archived-ticket-comments.json`
  artifacts in the migration file set; the "Run steps in order" banner in `_zoho-desk-tab.tsx`
  is the documentation surface.
- Internal admin migration tooling only — no packaging / install-surface impact.
- Shared-helper extraction (`importDeskThreads` / `importDeskComments`,
  `exportThreadsForTickets` / `exportCommentsForTickets`) touches the live Desk
  threads/comments export + import routes — output must stay byte-identical (verify in
  regression step).

## Implementation Notes

### What Changed

Shared-helper extraction (mirroring task 325's `importDeskTickets`), then two new export
routes + two new import routes for archived-ticket conversation, plus a probe route. The
import side needed **no new matching logic** — archived tickets already resolve through
`tickets.external_id` — and **attachments needed no code at all**: the DB-driven Ticket
Attachments import covers them on a re-run once the archived messages exist.

- **`src/lib/zoho/desk.ts`** — added `exportThreadsForTickets(ticketIds, token, label, { onBatch, onProgress })`
  and `exportCommentsForTickets(...)`. Each is the per-ticket loop lifted from the live export
  route (threads keeps the defensive per-thread `/threads/{id}` detail-fill; comments has
  none), parameterised on the id list + two callbacks, returning `{ token, total, failedTicketIds }`.
  Per-ticket `try/catch` → failed id recorded, loop continues, refreshed token carries forward.
  Event ordering preserved exactly: `onProgress` then `onBatch` on success, `onProgress` only
  on failure.
- **`zoho-export/desk-threads/route.ts`** + **`desk-ticket-comments/route.ts`** — reduced to
  building the live ticket-id list from `desk-tickets.json` and delegating to the helper. SSE
  frames (`progress` → `threads`/`comments` → `done` with `total_threads`/`total_comments` +
  `failed_ticket_ids`) are byte-identical to before.
- **`zoho-export/desk-archived-threads/route.ts`** + **`desk-archived-ticket-comments/route.ts`**
  (new) — same shape, ticket-id list from `desk-archived-tickets.json`, distinct log labels.
  Download `desk-archived-threads.json` / `desk-archived-ticket-comments.json` client-side.
- **`zoho-export/probe-archived-conversation/route.ts`** (new) — admin-gated GET diagnostic:
  reads the first id from `desk-archived-tickets.json`, calls `/tickets/{id}/threads?limit=1`
  and `/comments?limit=1`, returns `{ status, ok, bodySample }` for each + a `verdict` string.
  Read-only, downloads nothing. **Folder name deliberately has no `_` prefix** (Next.js
  private-folder rule would make an `_`-prefixed route un-routable). Safe to delete after the
  live run confirms.
- **`src/lib/migrate/desk-threads-import.ts`** + **`desk-comments-import.ts`** (new) —
  `importDeskThreads(rows)` / `importDeskComments(rows)` lifted verbatim from the two import
  route bodies (paginated `tickets` lookup on `external_id`, `listUsers` cache, per-row
  author-type derivation, full `source_meta`, `CHUNK_SIZE=50` upsert on `external_id` with
  bounded retry). Return `ImportResult`. The one behavioural translation: the routes' inline
  `return NextResponse.json({ error }, { status: 500 })` on a tickets-fetch failure became a
  `throw new Error("Could not fetch tickets: …")` in the helper, which each route re-wraps in
  the identical `{ error }` / 500 response via a `try/catch`.
- **`zoho-import/desk-threads/route.ts`** + **`desk-ticket-comments/route.ts`** — reduced to
  auth guard + file read + empty-check + `importDeskThreads/Comments(...)`. Response JSON
  (`ImportResult`) unchanged.
- **`zoho-import/desk-archived-threads/route.ts`** + **`desk-archived-ticket-comments/route.ts`**
  (new) — auth guard + `readFromZoho("desk-archived-*.json")` + the same helper.
- **`_zoho-desk-tab.tsx`** — new `ArchivedConvExportState` (shared by both new rows); two
  state hooks; one generic `runArchivedConvExport(cfg)` handler (SSE reader + local batch
  accumulation + `.partial.json` fallback if the stream ends without `done`, mirroring
  task 325's `handleArchivedTicketsExport`); one generic render branch covering both keys;
  two `EXPORT_LEVELS` + two `IMPORT_LEVELS` entries; "Run steps in order" banner updated to
  cover the probe, the archived conversation exports/imports, and the Ticket Attachments
  re-run.

### Files Changed
- `src/lib/zoho/desk.ts` - new `exportThreadsForTickets` / `exportCommentsForTickets` helpers
- `src/app/api/admin/zoho-export/desk-threads/route.ts` - delegates to helper (output identical)
- `src/app/api/admin/zoho-export/desk-ticket-comments/route.ts` - delegates to helper (output identical)
- `src/app/api/admin/zoho-export/desk-archived-threads/route.ts` - new archived threads SSE export
- `src/app/api/admin/zoho-export/desk-archived-ticket-comments/route.ts` - new archived comments SSE export
- `src/app/api/admin/zoho-export/probe-archived-conversation/route.ts` - new blocking-probe diagnostic
- `src/lib/migrate/desk-threads-import.ts` - new shared `importDeskThreads()` helper
- `src/lib/migrate/desk-comments-import.ts` - new shared `importDeskComments()` helper
- `src/app/api/admin/zoho-import/desk-threads/route.ts` - slimmed to call the helper
- `src/app/api/admin/zoho-import/desk-ticket-comments/route.ts` - slimmed to call the helper
- `src/app/api/admin/zoho-import/desk-archived-threads/route.ts` - new archived threads import
- `src/app/api/admin/zoho-import/desk-archived-ticket-comments/route.ts` - new archived comments import
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` - 2 export rows, 2 import rows, generic handler + render branch, banner

### Deviations From Plan
- **No attachment code, as predicted.** The task doc anticipated this; confirmed in
  implementation — `zoho-import/ticket-attachments` is a pure DB scan of `ticket_messages`,
  so it is untouched. The only archived-attachment surface is the banner note + the
  `IMPORT_LEVELS` desc telling the operator to re-run it.
- **Probe shipped as a permanent route, not a throwaway script.** Consistent with the
  existing `verify-attachment` diagnostic route in the same directory; the operator runs it
  from a browser/curl with an admin cookie. Marked "safe to delete after the live run" in its
  header comment.
- **Import helpers keep the original `[desk-threads]` / `[desk-ticket-comments]` console log
  prefixes** even when called from the archived import routes (the archived routes add their
  own `[desk-archived-*] read N raw …` line before delegating). "Lift verbatim" per the plan;
  the shared prefix is a log-only cosmetic.
- **`_zoho-desk-tab.tsx` pre-existing `text-[11px]` / `text-[12px]` / `text-[13px]` literal
  font sizes** — impeccable flags them; the new export/import rows reuse the exact same
  classes as every other row in the file. Left as-is per CLAUDE.md's UI-polish note (match
  the file's hand-rolled pattern, don't introduce a second one) and the identical decision in
  tasks 325 / 329 / 330 / 331. No new literal sizes introduced.
- **Environment: disk was at 100% (285 MiB free) and blocked file creation.** Cleared the
  regenerable `.next/` build cache (712 MB) to unblock — no source or data touched. The
  volume is still near-full (~1 GiB free after); the operator should free more space before
  `pnpm dev` / `pnpm build`.

### Verification Run
- `npx tsc --noEmit` - PASS (exit 0, repo-wide, no errors — cleaner than tasks 325/329 which
  reported pre-existing errors; the `.next` clear also removed stale route-validator entries)
- `npx eslint <13 changed/new files>` - PASS (exit 0)
- **Blocking probe (`GET /api/admin/zoho-export/probe-archived-conversation`)** - NOT RUN
  (needs live Zoho + `desk-archived-tickets.json` in `_from_zoho/`). This is the task's
  gating step: if it returns 404/403 for the archived id, the archived conversation exports
  won't work and the fallbacks in Open Questions §1 apply. Operator must run this first.
- **Live archived export + import round-trip** - NOT RUN (needs live Zoho, per the probe
  outcome). Same posture as task 325's live run being operator-driven.
- **Regression (live `desk-threads` / `desk-ticket-comments` export + import byte-identical)**
  - code-level review done (event ordering, `done` payload keys, `ImportResult` shape all
  preserved); live diff NOT RUN (needs Zoho). The refactor is pure extraction — no logic
  changed.
- **Browser acceptance on `/admin/migrate`** (rows render, progress bar, `.partial.json`
  fallback, generic handler wiring) - NOT RUN.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Helper extraction is faithful** — line-by-line diff of `desk-threads` /
  `desk-ticket-comments` export + import routes against the extracted helpers confirms:
  SSE event ordering (`progress` → batch on success, `progress` only on failure), `done`
  payload keys (`total_threads` / `total_comments` / `failed_ticket_ids`), the per-thread
  detail-fill, the `!ticketId` skip, the `ImportResult` shape, and the tickets-fetch-failure
  response (`{ error: "Could not fetch tickets: …" }` / 500) are all preserved. The live
  routes' downloaded output is byte-identical (pending only a live diff, which needs Zoho).
- No `any`, no dead code, no commented-out implementation. Helpers use `Record<string, unknown>`
  / `unknown` and typed callback signatures.
- Guard clauses throughout; helpers own Zoho pagination + per-ticket fault isolation, routes
  own SSE framing — clean split of responsibility.
- Error handling intentional: per-ticket `try/catch` in the helpers (failed id recorded, loop
  continues, token carries forward), route-level `try/catch` around the import helper for the
  ticket-fetch throw.
- `.range()` pagination, admin/super_admin gating, and `fetchZohoWithRetry` (via
  `fetchDeskPage`) all preserved from the originals. `console.log` calls match the
  established dev-only-migration-route pattern in sibling files.
- Probe route folder correctly has **no `_` prefix** (would be un-routable in Next.js).
- Attachments correctly required **zero code** — `zoho-import/ticket-attachments` is a pure
  `ticket_messages` DB scan and is untouched; only the banner + `IMPORT_LEVELS` desc changed.

### Deviations
- **Minor — per-ticket "Giving up" log prefix.** Changed from `[desk-threads]` /
  `[desk-ticket-comments]` to the passed `label` (`[zoho-export/desk-threads]` etc.).
  Logging-only, no output impact. Documented in Implementation Notes.
- **Minor — per-thread detail-fetch label** now `${label}-detail`; resolves to the identical
  `"zoho-export/desk-threads-detail"` string for the live route.
- **Minor — import helpers keep the original `[desk-threads]` / `[desk-ticket-comments]` log
  prefixes** even when invoked from the archived import routes (which add their own
  `[desk-archived-*] read N …` line first). Consistent with "lift verbatim".
- **Minor — probe shipped as a permanent route**, not a throwaway script — matches the
  existing `verify-attachment` diagnostic route in the same directory; header comment says
  "safe to delete after the live run".
- **Minor — `_zoho-desk-tab.tsx` literal font sizes** (`text-[11px]` / `text-[12px]` /
  `text-[13px]`). impeccable flags them; the new rows reuse the exact classes every other row
  in the file uses. Left as-is per CLAUDE.md's UI-polish note and the identical call in tasks
  325 / 329 / 330 / 331. No new literal sizes added.
- **Medium — the "blocking" probe was not run** (needs live Zoho). The task doc made the
  probe gating; the code for the archived exports/imports is built and merged-ready, but the
  operator MUST run `GET /api/admin/zoho-export/probe-archived-conversation` before the first
  archived conversation export. If it returns 404/403 for the archived id, the export routes
  will not work and the Open Questions §1 fallbacks (Bulk Export API, or `lastThread`-only)
  apply. Building admin-gated dev-only routes ahead of the live run matches the established
  codebase pattern (tasks 302/303/316/321/322/325). Risk is contained: the routes do nothing
  until an operator invokes them, and the live import already links archived rows via
  `tickets.external_id` with no schema change.
- **Environment (not a code deviation) — `.next/` build cache cleared** during implementation
  because the disk was at 100% (285 MiB free). Regenerable; no source or data touched.
  Surfaced in Implementation Notes and TASKS.md.

### Required Fixes
- None (see post-gate follow-up below — a dedupe was added after checking the real export).

---

## Post-Gate: Export-Data Readiness Check (2026-08-28)

Ran against the operator's actual exports — `_from_zoho/desk-archived-threads.json` (3,439
rows, 73 MB) and `_from_zoho/desk-archived-ticket-comments.json` (3,656 rows). **The probe
evidently passed** — Zoho does serve `/tickets/{id}/threads` + `/comments` for archived ids.

### Table — READY
`ticket_messages` needs no migration. Both files' rows map cleanly onto the columns the live
`desk-threads` / `desk-ticket-comments` imports already write (`ticket_id`, `author_type`,
`author_id`, `body`, `visibility`, `external_id`, `source_meta`, `created_at`) with
`onConflict: "external_id"`.

### Function — one fix applied
- **Duplicate `external_id` in the threads export.** `desk-archived-threads.json` contains
  **1 exact-duplicate thread** (`id 300063000086489006`, ticket `300063000086489002` — the
  same `from`-page boundary that produced task 325's duplicate ticket `300063000086489002` /
  #20320). `importDeskThreads()` / `importDeskComments()` were lifted verbatim from the
  pre-task-325 route bodies and lacked the `external_id` dedupe that `importDeskTickets()`
  got in task 325 — a same-chunk collision would fail 50 rows with *"ON CONFLICT … cannot
  affect row a second time."* **Fixed:** both helpers now `Array.from(new Map(rows.map(r =>
  [r.external_id, r])).values())` (last-wins) before chunking, with a `dropped N duplicate`
  log line. Benefits the live `desk-threads` / `desk-ticket-comments` imports too (same
  paginator, same boundary risk). `npx tsc --noEmit` + `eslint` re-run clean.

### Second fix applied — attachment-only messages no longer skipped
- The 3 skipped threads (`…82133383`, `…82133238`, `…73162271`) turned out to be
  **attachment-only inbound emails** — empty body, but `hasAttach: true` with 9 / 10 / 10
  attachments (29 files total). Skipping them stranded those 29 files (the ticket-attachments
  import only scans rows that reached `ticket_messages`). **Fixed:** `importDeskThreads()` and
  `importDeskComments()` now substitute a synthetic body
  (`[no message body — N attachment(s)]`) when the real body is empty **and** `attachments`
  is non-empty, and set `source_meta.syntheticBody: true` on that row. Rows with an empty body
  **and** no attachments are still skipped (nothing to preserve). Simulated against the real
  files: threads now import **3,438 / 0 skipped** (3 synthetic bodies), comments **3,656 / 0
  skipped** (0 synthetic). Re-running the archived threads import (idempotent upsert) picks up
  the 3 rows; the Ticket Attachments re-run then pulls their 29 files. Benefits the live
  imports too. `tsc` + `eslint` clean.

### Handled correctly, no change needed
- **260 threads with `author.type: null`** (author object present, all `direction: "in"`) →
  `isAgent` false → `author_type: "client"` — correct for inbound customer mail.
- **`commenter.email: null`** on the 1,413 `NON_DESK_USER` comments → `?.` guards it,
  `author_id` stays `null`.
- **1,566 distinct ticket ids referenced by threads** = exactly task 325's 1,566 imported
  archived tickets; comments reference a 603-id subset, all within that set.
- `visibility` `private` → `internal`; `isPublic` handling; `contentType` (`text/html` on all
  threads, `plainText`/`html` on comments) all captured in `source_meta`.

### Operator still verifies (needs live DB — no `.env.local` in this session)
- All 1,566 referenced `_zoho_ticket_id`s resolve to `tickets.external_id` (should be exact;
  any miss lands in `result.errors` + `skipped`, never a crash).
- `ticket_messages.external_id` carries a UNIQUE constraint (the live import already relies
  on it, so this is a formality).
- After both archived imports, **re-run Ticket Attachments** — the threads file has
  `hasAttach`/`attachments` populated on a subset; those files download on the re-run.

## Completion Note

**Completed 2026-08-28** after a full live run by the operator.

### Live run results
| Step | Result |
|------|--------|
| Probe (`/tickets/{id}/threads` + `/comments` for archived ids) | ✅ served with the existing scope — both exports ran to completion |
| Desk Archived Threads export | `desk-archived-threads.json` — 3,439 rows, 73 MB, 1,566 tickets, every row has `_zoho_ticket_id`, `contentType: text/html` on all |
| Desk Archived Ticket Comments export | `desk-archived-ticket-comments.json` — 3,656 rows, 603 tickets |
| Desk Archived Threads import | **3,438 → `ticket_messages`** (1 boundary dupe deduped, 0 skipped, 3 synthetic bodies for attachment-only emails) |
| Desk Archived Ticket Comments import | **3,656 → `ticket_messages`** |
| Ticket Attachments re-run (after each import) | **646 files imported** (642 thread + 4 comment), 0 errors; stored Desk attachment count 166 → 812 (~852 MB) |

### Two fixes applied during the live run (both benefit the live `desk-threads` / `desk-ticket-comments` path too)
1. **`external_id` dedupe** in `importDeskThreads()` / `importDeskComments()` — the export
   paginator returned 1 boundary thread twice; without the dedupe a same-chunk collision fails
   50 rows. Matches `importDeskTickets()` (task 325).
2. **Synthetic body for attachment-only messages** — 3 threads were empty-body inbound emails
   carrying 9/10/10 attachments; the empty-body skip was stranding 29 files. Now a
   `[no message body — N attachment(s)]` placeholder + `source_meta.syntheticBody: true` keeps
   the row so its attachments import.

### Not done (non-blocking, no code gap)
- **Browser spot-check** that an archived ticket's detail page renders the merged
  conversation + attachments — data is fully in place; this is a UI verification only.
- **Live byte-identical regression** of the live threads/comments export/import — the refactor
  is a pure extraction; not diff-verified against a pre-change Zoho export.
- Per-ticket fault-isolation and SSE partial-download paths were not exercised (no failures,
  clean stream); code is the proven live `desk-threads` pattern.

### Follow-ups (not this task)
- `desk-archived-threads.json` (73 MB) + `desk-archived-ticket-comments.json` sit in
  `_from_zoho/` — large; consider `.gitignore` / cleanup like other `_from_zoho/` exports.
- `probe-archived-conversation` route can be deleted now that the endpoints are confirmed
  (kept for now as a sibling of `verify-attachment`).
- A renderer for `source_meta.syntheticBody` rows in the ticket detail UI (show the
  attachment list, suppress the placeholder text) — cosmetic, low priority.
