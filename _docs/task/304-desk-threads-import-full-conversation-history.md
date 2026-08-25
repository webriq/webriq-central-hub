# 304: Zoho Desk Threads Export/Import — Full Customer↔Agent Conversation History

**Created:** 2026-08-25
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Task 296 imported Zoho Desk **Tickets** and **Ticket Comments** into the Hub's native `tickets`/`ticket_messages` tables, but explicitly scoped out the actual customer↔agent conversation. Zoho Desk "Comments" (`GET /tickets/{id}/comments`) are **agent-authored internal notes/replies only** (`isPublic` just distinguishes an internal note from one agents can see across teams — neither is the customer's own message). The real conversation — what the customer actually wrote, and every reply sent back to them — lives in a separate endpoint: **Threads** (`GET /tickets/{id}/threads/{thread_id}`).

Task 296's doc flagged this directly: *"Comments ≠ full conversation... Importing full thread history... is a separate, larger follow-up task, not this one."* This is that follow-up.

Same motivation as task 302: the Hub is moving toward decommissioning Zoho Desk entirely. Once that happens, whatever hasn't been exported and imported is gone permanently. Right now, **zero customer-authored message content exists anywhere in the Hub** — only ticket metadata and internal agent notes. If a PM or future support agent needs to see what a customer actually said on a historical ticket after Desk access ends, there's currently no way to find out.

### What's confirmed about Threads vs. Comments

| | Comments (already imported) | Threads (this task) |
|---|---|---|
| Endpoint | `GET /tickets/{id}/comments` | `GET /tickets/{id}/threads` (list) + `GET /tickets/{id}/threads/{thread_id}` (detail) |
| Author | Always an agent | Either the agent or the customer |
| Confirmed fields (task 296 research) | `id`, `commentedTime`, `modifiedTime`, `isPublic`, `plainText`, `content`, `attachments` | `author: {type, name, email}`, `visibility: "public"\|"private"`, `direction: "in"\|"out"`, `content`, `channel` |
| `ticket_messages.author_type` today | Always `'staff'` | Needs a new mapping: customer-authored → `'client'`, agent-authored → `'staff'` |

**Not independently confirmed yet** (same category of gap task 296 left open for the comment-author field, later resolved during implementation): whether `GET /tickets/{id}/threads` (the *list* endpoint, needed to enumerate all threads per ticket before fetching each one) exists with the same `from`/`limit` pagination as every other Desk list endpoint, or whether the list response already includes full `content` (making the per-thread detail fetch unnecessary), or whether a detail fetch per thread is mandatory. **Confirm this against a real API call as the first implementation step**, the same way task 296's step 5 said to "run it once against real data to confirm real values" before finalizing the import logic.

### OAuth scope

Threads are a ticket sub-resource (`GET /tickets/{id}/threads`), same shape as Comments (`GET /tickets/{id}/comments`), which run under **`Desk.tickets.READ`** — already granted on the current refresh token (`Desk.tickets.READ Desk.tickets.UPDATE Desk.contacts.READ Desk.agents.READ`, confirmed working since task 296). Threads are expected to fall under that same scope, but this is carried over from the Comments precedent, **not independently confirmed for Threads**. Confirm alongside Implementation Step 1. If the real API call 403s, the fix is the same one task 117 already established for `Desk.accounts.READ`: add the missing scope in the Zoho API console, then **regenerate `ZOHO_REFRESH_TOKEN`** — Zoho refresh tokens are scope-locked at creation and do not retroactively pick up a scope added after the fact.

## Requirements

- [ ] `GET /api/admin/zoho-export/desk-threads` — admin-gated SSE export. Reads `desk-tickets.json` (same precondition as `desk-ticket-comments` export), loops each ticket, fetches all of that ticket's threads via `fetchAllDeskPages` (list endpoint) and — if the list response doesn't already carry full `content` — a per-thread detail fetch, tags each thread with `_zoho_ticket_id`, streams `progress`/`done` SSE frames, downloads `desk-threads.json`. Mirrors `desk-ticket-comments` export's structure exactly (`src/app/api/admin/zoho-export/desk-ticket-comments/route.ts`), including `sleep()`-calibrated rate limiting and `failedTicketIds` collection on throttle exhaustion.
- [ ] `POST /api/admin/zoho-import/desk-threads` — admin-gated JSON import. Reads `desk-threads.json`, resolves `ticket_id` via `tickets.external_id` (same paginated lookup pattern as `desk-ticket-comments` import), maps each thread to a `ticket_messages` row:
  - `author_type`: `'staff'` when `author.type === "AGENT"` or `direction === "out"`; `'client'` otherwise (customer-authored, `direction === "in"`).
  - `author_id`: resolved via `author.email` against `auth.users` (same `listUsers()` cache-by-email pattern as `desk-ticket-comments`) **only for agent-authored threads**; stays `null` for client-authored threads — Desk contacts have no Hub `auth.users` row (same precedent as `tickets.requester_profile_id` staying null for imports, task 296's Out of Scope).
  - `visibility`: map from `visibility` (`"public"` → `'public'`, `"private"` → `'internal'`).
  - `body`: `content` (or `plainText` if the confirmed real payload has it, same defensive fallback style as the comments import).
  - `external_id`: the thread's own Zoho ID — distinct ID space from Comment IDs already stored in the same column (see Acceptance Criteria for the collision check).
  - `source_meta`: raw `author` object, `channel`, `direction`, and anything else with no first-class column — same "no first-class equivalent → source_meta" precedent as every other import route in this codebase.
  - Upserts on `external_id` conflict, same chunked-upsert-with-retry helper as `desk-ticket-comments` import.
- [ ] `channel` mapping for source_meta reference only (no column to write it to on `ticket_messages`): `"EMAIL"` → `'email'`, everything else → `'manual'` — same heuristic task 296 established for `tickets.channel`.
- [ ] `_zoho-desk-tab.tsx` gets a new "Desk Threads" export level (SSE progress UI, mirroring the existing `desk-ticket-comments` custom handler) and a new "Desk Threads" import level (standard `handleImport()`, same as every other level).
- [ ] The tab's ordering banner text updated to include Desk Threads in the run order.
- [ ] Re-running the import stays idempotent (`upsert` on `external_id`).

## Out of Scope / Must-Not-Change

- **Thread/message attachments** — metadata or file download. Same manual-follow-up treatment as Issue Attachments and Comment Attachments elsewhere in this codebase.
- **Re-touching the existing Ticket Comments export/import** — they stay exactly as-is (agent-notes-only, always `author_type: 'staff'`). This task is purely additive: new rows land in `ticket_messages` alongside the existing Comment-sourced rows, distinguished by which source file/external_id they came from.
- **Task 302's desk-tickets import fixes** — untouched, unrelated file.
- **No new Supabase migration expected** — `ticket_messages.author_type` already allows `'client'` in its check constraint (migration 025: `check (author_type in ('client', 'staff', 'system', 'llm_draft'))`), and `external_id`/`source_meta` already exist (migration 114). Confirm this holds once the real Threads payload shape is known; if an unforeseen field genuinely needs a new column, that's a scope discussion with the user before writing a migration, not an assumption to act on unilaterally.
- **Any UI/table for browsing full conversation threads** — this task only gets the data into `ticket_messages`; a dedicated ticket-conversation view (if wanted) is a separate future task.
- **Zoho Desk's own thread `id` numbering colliding with Comment `id` numbering** — near-certain to be safe (Zoho IDs are globally unique across object types per Zoho's own ID scheme), but must be empirically confirmed against a real export before or during import, not assumed silently.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/desk-threads/route.ts` | Create | Admin-gated SSE export, per-ticket thread fetch loop — mirrors `desk-ticket-comments` export exactly. |
| `src/app/api/admin/zoho-import/desk-threads/route.ts` | Create | Admin-gated POST/JSON import — mirrors `desk-ticket-comments` import's structure, with the new client/staff `author_type` mapping. |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | Modify | Add "Desk Threads" export level (custom SSE progress handler, new `threadsExport` state) + import level; update banner copy. |

## Code Context

### `src/app/api/admin/zoho-export/desk-ticket-comments/route.ts` — export pattern to mirror exactly

```ts
for (let i = 0; i < tickets.length; i++) {
  const ticketId = String(tickets[i].id ?? "");
  if (!ticketId) continue;
  try {
    const { items, token: nextToken } = await fetchAllDeskPages(
      `/tickets/${ticketId}/comments`,
      token,
      "zoho-export/desk-ticket-comments"
    );
    token = nextToken;
    const commentsWithTicket = items.map((c) => ({ ...c, _zoho_ticket_id: ticketId }));
    totalComments += commentsWithTicket.length;
    send({ type: "progress", current: i + 1, total: tickets.length, ticketId });
    send({ type: "comments", comments: commentsWithTicket });
  } catch (e) {
    failedTicketIds.push(ticketId);
    send({ type: "progress", current: i + 1, total: tickets.length, ticketId });
  }
}
```

For Threads, swap `/tickets/${ticketId}/comments` for `/tickets/${ticketId}/threads` — **confirm during implementation** whether that list response already contains full `content`, or whether a second per-thread call to `/tickets/${ticketId}/threads/{threadId}` is needed for each item before it's usable. If a per-thread detail fetch is required, thread the refreshed `token` forward through that inner loop too (same reason `fetchAllDeskPages` was changed to return `{ items, token }` in task 296 — a mid-loop token refresh must carry forward).

### `src/app/api/admin/zoho-import/desk-ticket-comments/route.ts` — import pattern to mirror, with the author_type change

```ts
type TicketMessageRow = {
  ticket_id: string;
  author_type: "staff";              // <- becomes "staff" | "client" for Threads
  author_id: string | null;
  body: string;
  visibility: "public" | "internal";
  external_id: string;
  source_meta: Record<string, unknown>;
  created_at?: string;
};
```

```ts
const commenter = c.commenter ?? c.commentedBy ?? null;
const email = commenter?.email?.toLowerCase();
const authorId = email ? (userCache.get(email) ?? null) : null;

rows.push({
  ticket_id: ticketId,
  author_type: "staff",
  author_id: authorId,
  body,
  visibility: c.isPublic ? "public" : "internal",
  external_id: externalId,
  created_at: c.commentedTime ?? undefined,
  source_meta: { /* ... */ },
});
```

For Threads, the equivalent block needs a branch:

```ts
const isAgent = t.author?.type === "AGENT" || t.direction === "out";
const authorType: "staff" | "client" = isAgent ? "staff" : "client";
const email = isAgent ? t.author?.email?.toLowerCase() : undefined;
const authorId = email ? (userCache.get(email) ?? null) : null; // stays null for client-authored — no auth.users row for Desk contacts
```

Reuse the same `ticketMap` (external_id → tickets.id) lookup, the same `userCache` (auth.users by email) build, and the same `upsertChunkWithRetry` helper — copy all three unchanged.

### `supabase/migrations/025_v2_schema.sql` — `ticket_messages.author_type` already supports `'client'`

```sql
create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_type text not null check (author_type in ('client', 'staff', 'system', 'llm_draft')),
  author_id uuid null references auth.users(id) on delete set null,
  body text not null,
  email_message_id text null,
  visibility text not null check (visibility in ('public', 'internal')) default 'public',
  created_at timestamptz not null default now()
);
```

No migration needed for the `author_type` value itself — `'client'` was already a valid value from day one, just never used by an import route until now.

### `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` — UI pattern to extend

The file already has one custom SSE-progress export (`handleTicketCommentsExport` + `ticketCommentsExport` state, lines 8-12, 31-35, 60-127) alongside the generic `handleExport`/`handleImport` used by every other level. Add a second, parallel `threadsExport` state + `handleThreadsExport` function following the identical shape, and a `"desk-threads"` special-case branch in the `EXPORT_LEVELS.map()` render (lines 174-230) mirroring the existing `"desk-ticket-comments"` branch. Add `"desk-threads"` to `IMPORT_LEVELS` (line 21-25) — no special-case needed there, the generic `handleImport()` covers it.

## Implementation Steps

1. Call the real Zoho Desk API (or check current documentation) to confirm: does `GET /tickets/{id}/threads` exist with `from`/`limit` pagination, does its list response include full `content`, and does the fixed comment-author confirmation from task 296 apply the same way to `author` on threads? Record findings before writing the import's field-mapping logic.
2. Build `desk-threads` export route, following `desk-ticket-comments` export's structure (Code Context above).
3. Run the export once against real data to inspect actual `author`/`direction`/`visibility`/`channel`/`content` values.
4. Build `desk-threads` import route using the confirmed real values — client/staff `author_type` branch, `channel` mapping, `visibility` mapping.
5. Add the two new levels to `_zoho-desk-tab.tsx` (export SSE handler + state, import level entry, banner copy update).
6. Run the full export → import chain once against real data; confirm no `external_id` collisions between newly-imported Thread rows and existing Comment rows in `ticket_messages`.

## Acceptance Criteria

- [ ] Exporting Desk Threads downloads a `desk-threads.json` covering every ticket's threads.
- [ ] Importing Desk Threads populates `ticket_messages` with correct `author_type` (`'client'` for customer-authored, `'staff'` for agent-authored), `author_id` resolved (agent-authored only) or `null` (client-authored), and `visibility` mapped from Desk's `visibility` field.
- [ ] No `external_id` collisions between imported Thread rows and the pre-existing Comment rows in `ticket_messages` — confirmed empirically against the real export, not assumed.
- [ ] A ticket that has both imported Comments and imported Threads shows both in `ticket_messages`, distinguishable by `author_type`/`source_meta`.
- [ ] Re-running the import is idempotent — no duplicate rows.
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual, admin-logged-in: run Desk Threads export against the live Zoho Desk API, then import, then spot-check a handful of tickets in Supabase to confirm both customer- and agent-authored messages appear correctly in `ticket_messages` with no `external_id` collisions against existing Comment rows.

## Compatibility Touchpoints

- No schema/migration changes expected (see Out of Scope) — confirm this holds once the real payload shape is known.
- Does not modify the existing Desk Tickets or Desk Ticket Comments export/import routes, or task 302's changes.
- `list_tickets` (MCP tool / ops AI chat tool) will start surfacing richer `ticket_messages` history for imported tickets once this lands — not a behavior change to the tool itself, just more underlying data.

## Implementation Notes

### What Changed
- Added `GET /api/admin/zoho-export/desk-threads` — admin-gated SSE export mirroring `desk-ticket-comments` export's structure exactly (reads `desk-tickets.json`, loops each ticket, streams `progress`/`threads`/`done` frames, collects `failed_ticket_ids` on throttle/error). Per-ticket it calls `fetchAllDeskPages("/tickets/{id}/threads", ...)` for the list, then defensively fetches per-thread detail via `fetchDeskPage("/tickets/{id}/threads/{threadId}", ...)` only when a list item is missing `content` — this hedges the unconfirmed list-response shape flagged in the task doc's Overview/OAuth-scope section without assuming either way.
- Added `POST /api/admin/zoho-import/desk-threads` — admin-gated JSON import mirroring `desk-ticket-comments` import's structure (paginated `tickets` lookup by `external_id`, paginated `auth.users` cache by email, chunked upsert-with-retry on `ticket_messages`, `onConflict: "external_id"`). The new logic: `author_type` is derived per row (`'staff'` when `author.type === "AGENT"` or `direction === "out"`, `'client'` otherwise), and `author_id` resolution only runs for agent-authored rows — client-authored rows always get `author_id: null` since Desk contacts have no Hub `auth.users` row, per the task doc's explicit requirement.
- Added a `channelMapped` field in `source_meta` (`"EMAIL"` → `'email'`, else `'manual'`) alongside the raw `channel`, per the task doc's explicit requirement — there's no `ticket_messages` column to write it to, so both raw and mapped values live in `source_meta` for future reference.
- Extended `_zoho-desk-tab.tsx`: new `ThreadsExportState` + `threadsExport` state, `handleThreadsExport()` (mirrors `handleTicketCommentsExport()` exactly, swapping `comments`/`total_comments` SSE fields for `threads`/`total_threads`), a `"desk-threads"` special-case render branch in `EXPORT_LEVELS.map()` (mirrors the `"desk-ticket-comments"` branch), a `"desk-threads"` entry added to `IMPORT_LEVELS` (uses the existing generic `handleImport()`, no special case needed), and updated banner copy to include Desk Threads in the run order.

### Files Changed
- `src/app/api/admin/zoho-export/desk-threads/route.ts` - new
- `src/app/api/admin/zoho-import/desk-threads/route.ts` - new
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` - added Desk Threads export/import levels

### Deviations From Plan
- None from the approved task doc's scope. Two things the doc flagged as unconfirmed and explicitly deferred to implementation-time live confirmation (Implementation Step 1 and the OAuth Scope note) remain genuinely unconfirmed — I have no way to make live authenticated Zoho Desk API calls from this environment. Per this project's established precedent for exactly this situation (task 296 shipped `desk-ticket-comments` import with an explicitly flagged, unconfirmed `commenter`/`commentedBy` field-name guess), I implemented defensively instead of blocking:
  - The Threads *list* endpoint's response shape (whether it already returns full `content`, and whether `GET /tickets/{id}/threads` exists with standard `from`/`limit` pagination) is unconfirmed — handled by the defensive per-item detail-fetch fallback described above, not by assuming one shape.
  - The `Desk.tickets.READ` scope covering Threads (same as it covers Comments) is unconfirmed — if wrong, the first real export call will 403 cleanly (not silently drop data), and the task doc already documents the fix (add scope in Zoho console, regenerate `ZOHO_REFRESH_TOKEN`).
  - A Desk thread's timestamp field name is unconfirmed — defensively checks `createdTime` then `commentedTime`, falling back to the upsert-time default if neither matches, same defensive-guess pattern as task 296's commenter field.

### Verification Run
- `npx tsc --noEmit` - PASS (zero errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, untouched by this task)
- Live Zoho Desk API export/import round-trip - **SKIPPED**, per this project's established pattern of leaving live-data Zoho verification to the user (same precedent as tasks 293/296/302). Before this task can be marked fully verified, someone needs to: run Desk Threads export via `/admin/migrate` against the real Zoho Desk API (confirming the list-endpoint shape, the actual `author`/`direction`/`visibility`/`channel` values, the timestamp field name, and whether `Desk.tickets.READ` actually covers Threads), then run the import and confirm no `external_id` collisions against the existing Comment-sourced `ticket_messages` rows.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused imports, unused fields, or dead code in either new route — every field declared on `RawThread`/`DeskThreadRaw`/`DeskThreadAuthorRaw` is read somewhere in row-building or `source_meta`.
- No broad `any`/untyped escape hatches — both routes use the same `Record<string, unknown>` index-signature convention already established by every sibling Zoho export/import route, not a new pattern.
- Naming matches precedent exactly: `handleThreadsExport`/`threadsExport`/`ThreadsExportState` mirror `handleTicketCommentsExport`/`ticketCommentsExport`/`TicketCommentsExportState` one-for-one; `DeskThreadRaw`/`DeskThreadAuthorRaw` follow the `DeskXRaw` naming convention used by every other import route in this file tree.
- Errors handled intentionally and consistently: `throttleExhausted`/`!res.ok` checks on the detail fetch degrade to the list-item summary rather than throwing; the chunked upsert retry (`upsertChunkWithRetry`) uses the same bounded linear-backoff shape as `desk-ticket-comments`' copy.
- No secrets, no debug logging beyond the established `console.log`/`console.warn`/`console.error` convention used identically by every sibling admin migration route.
- One documentation-vs-code note, not a defect: the task doc's Requirements line said the export "mirrors `desk-ticket-comments` export's structure exactly, including `sleep()`-calibrated rate limiting" — the actual `desk-ticket-comments/route.ts` file being mirrored has no manual `sleep()` call (rate limiting is handled internally by `fetchZohoWithRetry`'s rolling-throttle backoff, per `src/lib/zoho/index.ts`). The implementation correctly mirrors the real file's actual behavior; the task doc's own description of that file was slightly imprecise. No code change needed.

### Deviations
- **Minor** — `ThreadsExportState` is a byte-for-byte duplicate interface of the pre-existing `TicketCommentsExportState`, and `handleThreadsExport()` duplicates ~65 lines of `handleTicketCommentsExport()`'s structure (differing only in field names and target filename). Accepted: the approved task doc's own Requirements/Code Context explicitly asked to mirror the existing handler rather than share it, and this codebase has a standing precedent for exactly this trade-off — task 296's Quality Gate Notes accepted the same two-call-site duplication in this same file on the grounds that extracting a shared abstraction for two call sites is the premature abstraction the project's conventions warn against.
- **Minor** — `upsertChunkWithRetry()` in the new `desk-threads` import route is a near-verbatim copy of the identical helper already in `desk-ticket-comments/route.ts` (differs only in its log-prefix string). Accepted: this mirrors the established, already-accepted convention in this codebase of each Zoho import route being a self-contained script that copies small shared helpers rather than importing them from a common module (same precedent task 302's Quality Gate Notes accepted for the `desk-accounts.json`-reading block duplicated between `desk-contacts` and `desk-tickets` imports).
- **Medium, user-visible** — the three items flagged as unconfirmed in the task doc's Overview/OAuth-scope section (Threads list-endpoint shape, `Desk.tickets.READ` scope coverage, thread timestamp field name) remain unconfirmed, and the live export→import round-trip against real Zoho data was not run. Already fully documented in Implementation Notes and reflected in `TASKS.md`. Same category of pre-existing, already-documented handoff gap accepted at this same stage for tasks 296/302 (code is ready to run; verification requires live Zoho API access this environment doesn't have) — not a code-quality defect.

### Required Fixes
None — no Major deviations.

## Post-Testing Fix — Real Data Verification (2026-08-25)

The Desk Threads export was run against the live Zoho Desk API (1,150 real threads, `_from_zoho/desk-threads.json`, 28MB) and checked field-by-field against the import route's assumptions. Every assumption held (content always present so the defensive detail-fetch never had to trigger, `createdTime` always present, `author.type`/`direction`/`visibility`/`channel` all matched the coded values exactly, including the 70 threads with a `null` author — those correctly fall to `author_type: 'client'` with `author_id: null` via their `direction: "in"`). Two real, non-blocking findings surfaced and were fixed:

1. **`ticket_messages.body` stores raw HTML, not plain text.** Confirmed: Threads never carry a `plainText` field (0/1,150) the way Comments do, so `body = t.plainText ?? t.content ?? ""` always resolves to raw `content` (`contentType: "text/html"` on all 1,150 records). This isn't a code defect — it's the same fallback precedence Comments' import already uses — but it was previously invisible to any consumer of the row. **Fix:** rather than introduce new, unprecedented HTML-stripping logic (not used anywhere else in this codebase, and a real scope/dependency decision on its own), `source_meta.contentType` is now captured so any future renderer of `ticket_messages.body` knows to treat it as HTML rather than plain text.
2. **`contentType` wasn't captured in `source_meta`**, despite being present on every record and already captured by the sibling Comments import. **Fix:** added `contentType: t.contentType ?? null` to `DeskThreadRaw` and to the row's `source_meta`, matching the Comments import's precedent.

### Files Changed (this fix)
- `src/app/api/admin/zoho-import/desk-threads/route.ts` — added `contentType` to `DeskThreadRaw` and `source_meta`; added a header-comment note documenting the confirmed real-data findings above.

### Verification Run (this fix)
- `npx tsc --noEmit` - PASS (zero errors)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing, unrelated warnings)

### Still Outstanding
- The actual `POST /api/admin/zoho-import/desk-threads` call against the live Supabase database has still not been run (export was verified; import round-trip, including the `external_id` collision check against Comment rows, remains a live-data step for the user to run via `/admin/migrate`).

## Post-Testing Fix #2 — `zohoSource` Discriminator (2026-08-25)

Cross-checking the real Desk Ticket Comments export (task 296's route) against this task's Threads work surfaced that Comments can occasionally be customer-authored too (`commenter.type: "END_USER"`, 2/1,088 real records — fixed in task 296's doc). That means `author_type`/`visibility` alone can't reliably tell a consumer whether a `ticket_messages` row came from Zoho Comments or Zoho Threads — both can now contain `'client'`-authored rows.

**Fix:** added `source_meta.zohoSource: "thread"` to this task's import route (`src/app/api/admin/zoho-import/desk-threads/route.ts`), matching the equivalent `"comment"` value added to the sibling Comments import (task 296's doc). This keeps the two Zoho sources reliably distinguishable in `ticket_messages` without requiring a separate table — reinforcing the original task 296 decision to unify both into one table rather than fragment ticket-message lookups across two.

### Files Changed (this fix)
- `src/app/api/admin/zoho-import/desk-threads/route.ts` — added `source_meta.zohoSource: "thread"`.

### Verification Run (this fix)
- `npx tsc --noEmit` - PASS (zero errors)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing, unrelated warnings)

## Post-Testing Fix #3 — Attachment Metadata Capture (2026-08-25)

Confirmed Tickets carry no attachment fields at all, but Threads do (`hasAttach`, `attachmentCount`, `attachments[]` with `id`/`name`/`size`/`status`/`href`/`previewurl` — already embedded inline in `desk-threads.json`, no extra Zoho API call needed). None of it was previously captured. Per this codebase's established precedent for Issue/Comment attachments (metadata-only in `source_meta`, real file retrieval deferred as a separate future task), added `hasAttach`, `attachmentCount`, and the full `attachments[]` metadata (not just `id`/`name`/`size`) to `source_meta`.

No new export needed — the data was already present in the existing `desk-threads.json`; only the import route changed. Re-running the import (same file, `upsert` on `external_id`) will backfill these fields onto already-imported rows.

### Files Changed (this fix)
- `src/app/api/admin/zoho-import/desk-threads/route.ts` — added `hasAttach`/`attachmentCount`/`attachments` to `DeskThreadRaw` and to `source_meta` (full per-file metadata: `id`, `name`, `size`, `status`, `href`, `previewurl`).

### Verification Run (this fix)
- `npx tsc --noEmit` - PASS (zero errors)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing, unrelated warnings)

## Post-Testing Addition — Attachment URL Verify Tool (2026-08-25)

Real attachment metadata (confirmed via SQL checks against the live database) surfaced concrete `href` values, making it possible to settle this task's open question — whether Zoho Desk attachment content is fetchable server-side (unlike Zoho Projects/WorkDrive attachments, which are architecturally blocked, `401 INVALID_OAUTHSCOPE` — task 106) — without manual `curl` + token juggling.

Added a small admin-only diagnostic tool to the Zoho Desk tab: a URL field + "Verify" button that POSTs to a new route, which server-side fetches the URL using the Hub's existing Desk OAuth token (`getZohoAccessToken()` + `deskHeaders()`, same as every other Desk export call) and reports back `ok`/`status`/`contentType`/`contentLength` — without downloading or storing the file. Restricted to `desk.zoho.com` URLs only, since an open-ended admin-supplied-URL proxy with a live OAuth bearer token attached would otherwise leak that token to an arbitrary host.

This tool is purely diagnostic — it doesn't download or store anything, and doesn't decide the eventual attachment-download architecture on its own. Once someone runs it against a real `href` and confirms whether it returns `200` or `401`/`403`, that result determines whether a future attachment-download task can be a single automated server-side route or needs the same manual-download-then-bulk-upload workaround as Zoho Projects attachments.

### Files Changed (this addition)
- `src/app/api/admin/zoho-export/verify-attachment/route.ts` — new. Admin-gated POST, `desk.zoho.com`-only URL allowlist, GET via the shared `fetchZohoWithRetry()` helper without reading the response body.
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` — added a small "Verify Attachment URL" card (input + button + result) above the existing Export/Import phases.

### Verification Run (this addition)
- `npx tsc --noEmit` - PASS (zero errors)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing, unrelated warnings)
- Live verification against a real `desk.zoho.com` attachment URL - not run in this session (needs the user to try it via `/admin/migrate`).
