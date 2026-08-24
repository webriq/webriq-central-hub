# 296: Zoho Desk Tickets Export/Import + Split Migrate Page into Projects/Desk Tabs

**Created:** 2026-08-24
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Task 117 imported Zoho Desk Contacts (matched to `customers` via Desk Account name) and explicitly scoped **Zoho Desk Tickets out**: *"`Desk.tickets.READ`/`Desk.tickets.UPDATE` scopes were granted but are unrelated to this task's goal (contacts/accounts only); do not build ticket fetching here."* Now that Contacts are done, Tickets are next — this is the largest remaining category of Zoho Desk data that must be preserved before Desk can be decommissioned.

Two decisions were made with the user before writing this spec:

1. **`src/app/(hub)/admin/migrate/page.tsx` is a single flat 2,400-line component** (every Zoho Projects export/import level plus the two Desk levels tacked on at the end) with no tab structure — there is no "Desk tab" in the codebase today. Per the referenced file-length guide and the user's explicit ask to "activate the Desk Tab," this task splits the page into a **"Zoho Projects" / "Zoho Desk" tab switcher**, moving the existing Projects-related UI into its own file and building a new Desk tab file that holds Desk Accounts, Desk Contacts (both already exist, just relocated), and the two new Desk Tickets levels. **The page loads with the Zoho Desk tab active by default** (that's the literal "activate" ask). Decomposing the ~2,200-line Projects tab's internals further (e.g., deduplicating its nine near-identical SSE export handlers into a shared hook) is explicitly out of scope — see Out of Scope.
2. **Scope is Tickets + Ticket Comments**, matching the existing Issues + Issue Comments pattern (not attachments — those stay a manual follow-up, same as Issue Attachments).

### Where imported tickets land — the more consequential decision

The Hub already has a **native `tickets` + `ticket_messages` schema** (migration 025, part of the v2.0 schema), live-wired into two staff-facing tools: the MCP `list_tickets` tool (`src/lib/mcp/tools/list-tickets.ts`, scope `tickets:read`) and the ops AI chat's `list_tickets` tool (`src/lib/ai/ops-chat-tools.ts:310`). Unlike `tasks` (which shipped with an `external_id` column from day one, anticipating Zoho import), `tickets` has no `external_id`/`source_meta` columns yet.

The user chose to **merge imported Zoho Desk tickets into the native `tickets`/`ticket_messages` tables** rather than create separate archival tables — unifying historical and future live tickets in one place, following the same "import into the existing native table" precedent `tasks` already set (Zoho Projects tasks import directly into the pre-existing `tasks` table, not a separate `zoho_tasks` table).

This has one real schema consequence worth flagging clearly: **`tickets.customer_id` is currently `not null`**. Task 117 found only 200 of 1,627 Desk contacts (12.3%) matched to a Hub customer by account name — the rest imported anyway with `customer_id: null` as a review queue. The same match rate should be expected for tickets, so importing "before decommissioning" completeness requires making `tickets.customer_id` nullable. This was checked against every RLS policy on `tickets`/`ticket_messages` (migration 026, `026_rls_policies_v2.sql:150-192`): `tickets_client_read`/`tickets_client_insert` filter on `customer_id = get_my_customer_id()`, which naturally evaluates to false for `NULL` — no client can ever see an unmatched imported ticket. `tickets_staff_all` has unconditional access regardless of `customer_id`, so admin/PM/developer can still review and manually assign unmatched tickets later. **Safe to widen.**

### Zoho Desk Tickets API facts confirmed for this task (from `https://desk.zoho.com/DeskAPIDocument`)

- **No new OAuth scope needed** — unlike Desk Accounts (task 117's blocker), `Desk.tickets.READ` was already granted in the current API client's scope from day one (task 117's doc: *"current API client scope (`Desk.tickets.READ Desk.tickets.UPDATE Desk.contacts.READ Desk.agents.READ`)"*). No `ZOHO_REFRESH_TOKEN` regeneration required.
- `GET /api/v1/tickets` — list all tickets. Same `from`/`limit` (max 100/page) pagination as every other Desk list endpoint — `fetchAllDeskPages()` in `src/lib/zoho/desk.ts` already implements this loop. OAuth scope `Desk.tickets.READ`.
- Ticket fields confirmed from real response examples: `id`, `ticketNumber`, `subject`, `status`, `statusType` (e.g. `"Open"`), `priority` (e.g. `"High"`), `channel` (e.g. `"Email"`), `channelCode`, `dueDate`, `responseDueDate`, `closedTime`, `onholdTime`, `createdTime`, `customerResponseTime`, `sharedCount`, `threadCount`, `commentCount`, `isSpam`, `isRead`, `language`, `webUrl`, `productId`, `departmentId`, `department: {id, name}`, `team: {id, name, logoUrl}`, `contactId`, `accountId`, `email`, `phone`, `assigneeId`, `assignee: {...}`, and — importantly — a **nested `contact: {id, firstName, lastName, email, phone, mobile, type, account: {id, accountName, website}}`** object already inline on the ticket. This means ticket→customer matching does **not** need a separate `desk-accounts.json` cross-reference the way Desk Contacts import did — the account name is already on the ticket.
- `GET /api/v1/tickets/{ticket_id}/comments` — list comments on one ticket. Params: `from` (offset, ≥0), `limit` (required, default 50, 1–100), `sortBy` (`commentedTime`), `include` (`mentions`, `plainText`). OAuth scope `Desk.tickets.READ`. Confirmed fields: `id`, `commentedTime`, `modifiedTime`, `isPublic` (boolean), `plainText`, `content`, `attachments: [{id, name, size, href}]`. **The exact "who wrote this" field name was not confirmed from documentation excerpts in this research pass — confirm the commenter/author field shape against one real `desk-ticket-comments` API response during implementation**, the same way task 107/108 confirmed real Zoho status values before finalizing `mapTaskStatus`.
- **Important distinction — Comments ≠ full conversation.** Zoho Desk's `/comments` endpoint is agent-authored notes/replies (public or private via `isPublic`), not the customer's own messages — those live in a separate, larger `/threads` endpoint (confirmed via `GET /api/v1/tickets/{ticket_id}/threads/{thread_id}`, fields `author: {type: "AGENT"|..., name, email}`, `visibility: "public"|"private"`, `direction: "in"|"out"`, `content`, `channel`). Importing full thread history (the actual customer↔agent email/forum conversation) is a **separate, larger follow-up task**, not this one — flagged explicitly in Out of Scope so nobody mistakes "Ticket Comments imported" for "full ticket conversation history imported."

## Requirements

- [ ] `src/app/(hub)/admin/migrate/page.tsx` becomes a thin tab-switcher shell (`"projects" | "desk"`, defaulting to `"desk"`) rendering one of two extracted components.
- [ ] `_zoho-projects-tab.tsx` holds all existing Zoho Projects export/import UI, moved verbatim (same behavior, same file-scoped state) — no functional changes.
- [ ] `_zoho-desk-tab.tsx` holds Desk Accounts + Desk Contacts (moved, unchanged behavior) plus two new levels: **Desk Tickets** (export + import) and **Desk Ticket Comments** (export + import).
- [ ] `GET /api/admin/zoho-export/desk-tickets` — admin-gated, paginates `GET /api/v1/tickets` via `fetchAllDeskPages`, downloads `desk-tickets.json`.
- [ ] `GET /api/admin/zoho-export/desk-ticket-comments` — admin-gated, SSE stream, reads `desk-tickets.json`, loops each ticket calling `GET /api/v1/tickets/{id}/comments?include=plainText`, downloads `desk-ticket-comments.json`.
- [ ] `POST /api/admin/zoho-import/desk-tickets` — admin-gated, reads `desk-tickets.json`, resolves customer via ticket's `contactId` → `contacts.external_id` → `contacts.customer_id` (primary path, reuses task 117's already-vetted matches) with a fallback via the ticket's inline `contact.account.accountName` → `normalizeCompanyName()` → `customers.company_name`, maps status/priority/channel onto the native enums, upserts into `tickets` (`onConflict: "external_id"`). Unmatched tickets import anyway with `customer_id: null` (review queue, same precedent as task 117).
- [ ] `POST /api/admin/zoho-import/desk-ticket-comments` — admin-gated, reads `desk-ticket-comments.json`, resolves `ticket_id` via `tickets.external_id`, resolves `author_id` via commenter email against `auth.users` (same `listUsers()` cache pattern as `issue-comments` import), maps `isPublic` → `visibility` (`public`/`internal`), sets `author_type: 'staff'` (Desk Comments are always agent-authored), upserts into `ticket_messages` (`onConflict: "external_id"`).
- [ ] Migration adds `external_id` (unique), `external_contact_id`, `external_account_id`, `match_method`, `source_meta` to `tickets`, and widens `tickets.customer_id` to nullable. Adds `external_id` (unique) and `source_meta` to `ticket_messages`.
- [ ] `src/types/database.ts` — `tickets` and `ticket_messages` table types updated to match.
- [ ] `src/lib/zoho/desk.ts` — `fetchAllDeskPages` returns `{ items, token }` instead of a bare array, so the refreshed access token can thread forward across the per-ticket comments-export loop (today's two callers, `desk-accounts` and `desk-contacts` export routes, each call it exactly once per request so this was never needed before).

## Out of Scope / Must-Not-Change

- **Zoho Desk Threads** (the actual customer↔agent email/forum conversation content) — a separate, larger endpoint and a separate follow-up task. Do not build thread fetching here; do not describe "Ticket Comments" as "full conversation history" anywhere in UI copy.
- **Ticket/comment attachments** — metadata or file download. Same manual-follow-up treatment as Issue Attachments.
- **Decomposing the ~2,200-line Zoho Projects tab's internals** (e.g. collapsing its nine near-identical SSE export handlers into one parameterized hook). This task only relocates that code into its own file unchanged — a deeper refactor risks regressing actively-used migration tooling for a task whose actual goal is Desk Tickets. Flag as a follow-up, don't attempt it here.
- **Filtering the `list_tickets` MCP/AI-chat tools** to hide imported historical tickets from live queries. Not requested; `status` (mostly `'closed'`) already differentiates old Desk history from active work. If it turns out noisy in practice, that's a fast follow-up, not part of this task.
- **`tickets.ticket_number`** (a `serial` sequence) — never write Zoho's own `ticketNumber` into it; that would either collide with or corrupt the auto-increment sequence. Zoho's `ticketNumber` goes into `source_meta` only, for display/reference.
- **No `assignee_id` column exists on `tickets`** — don't add one. Desk's `assigneeId`/`assignee` info is historical-record-only; store it in `source_meta`, not a new FK column (scope creep beyond what's needed).
- **`tickets.requester_profile_id`** stays `null` for every imported ticket — Desk contacts have no Hub `auth.users` row (they live in the separate `contacts` table from task 117), so there's nothing to resolve it to. Only `requester_email` (plain text) gets populated.
- **Desk Accounts / Desk Contacts export+import routes and the `contacts` table** — untouched, just relocated into the new Desk tab file with identical behavior.
- **`src/lib/zoho/index.ts`'s Zoho Projects functions** and the Projects tab's existing SSE handlers — behavior-identical after the move; do not refactor while relocating.
- **`tickets_staff_all`/`tickets_client_read`/`ticket_messages_*` RLS policies** (migration 026/048) — already correctly handle `customer_id IS NULL` (verified above); do not modify.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/114_tickets_ticket_messages_zoho_desk_import_columns.sql` | Create | Nullable `tickets.customer_id`; add `external_id`/`external_contact_id`/`external_account_id`/`match_method`/`source_meta` to `tickets`; add `external_id`/`source_meta` to `ticket_messages`. |
| `src/lib/zoho/desk.ts` | Modify | `fetchAllDeskPages` returns `{ items, token }`; update its two existing callers. |
| `src/lib/migrate/zoho-import.ts` | Modify | Add `mapTicketStatus(status, statusType)` helper (mirrors `mapTaskStatus`); reuse existing `mapPriority()` and `normalizeCompanyName()` as-is. |
| `src/app/api/admin/zoho-export/desk-tickets/route.ts` | Create | Admin-gated, `fetchAllDeskPages("/tickets", ...)`, downloads `desk-tickets.json` — mirrors `desk-accounts`/`desk-contacts` export exactly. |
| `src/app/api/admin/zoho-export/desk-ticket-comments/route.ts` | Create | Admin-gated, SSE, per-ticket `fetchAllDeskPages("/tickets/{id}/comments", ...)` loop threading the refreshed token forward — mirrors `issue-comments` export's structure. |
| `src/app/api/admin/zoho-import/desk-tickets/route.ts` | Create | Admin-gated, plain POST/JSON response — mirrors `issues` import's structure (project/customer lookup maps, chunked upsert). |
| `src/app/api/admin/zoho-import/desk-ticket-comments/route.ts` | Create | Admin-gated, plain POST/JSON response — mirrors `issue-comments` import's structure exactly (including its chunk-upsert retry helper). |
| `src/types/database.ts` | Modify | Update `tickets`/`ticket_messages` `Row`/`Insert`/`Update` types. |
| `src/app/(hub)/admin/migrate/page.tsx` | Modify | Reduce to a tab-switcher shell; default tab `"desk"`. |
| `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` | Create | Existing Projects UI, relocated verbatim. |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | Create | Desk Accounts/Contacts (relocated) + new Desk Tickets/Ticket Comments UI. |
| `src/app/(hub)/admin/migrate/_shared.tsx` | Create | Shared `ImportResult`/`CardState`/`CardStatus` types + `ResultChip`/`StateIcon` components, used by both tab files (currently defined once at the top of `page.tsx`). |

## Code Context

### `src/lib/zoho/desk.ts` — current `fetchAllDeskPages` (change return shape)

```ts
export async function fetchAllDeskPages(
  path: string,
  token: string,
  label: string
): Promise<Record<string, unknown>[]> {
  const perPage = 100;
  let from = 1;
  let currentToken = token;
  const all: Record<string, unknown>[] = [];
  while (true) {
    const { res, token: nextToken, throttleExhausted } = await fetchDeskPage(path, currentToken, { from: String(from), limit: String(perPage) }, label);
    currentToken = nextToken;
    // ...
  }
  return all; // <- token refresh is silently dropped here
}
```

Change to `Promise<{ items: Record<string, unknown>[]; token: string }>`, returning `{ items: all, token: currentToken }`. Update the two existing callers (`desk-accounts/route.ts`, `desk-contacts/route.ts`) to destructure `{ items }`. The new `desk-ticket-comments` export route needs the returned `token` to carry forward into the next ticket's call — today's callers never needed this because they each call it exactly once per request.

### `src/app/api/admin/zoho-export/issue-comments/route.ts` — pattern to mirror for `desk-ticket-comments`

Per-parent-entity SSE loop with `send({ type: "progress", ... })` / `send({ type: "comments", ... })` / `send({ type: "done", ... })` frames, `sleep()` calibrated to stay under Zoho's rolling rate limit, `failedIssueIds` collection on throttle exhaustion. Swap the Projects-API `fetchZohoWithRetry` + manual URL-building for `fetchAllDeskPages(\`/tickets/${ticketId}/comments\`, token, "desk-ticket-comments")` per ticket, threading the returned `token` into the next iteration.

### `supabase/migrations/056_contacts_table.sql` / `058_contacts_generic_external_id.sql` — naming precedent

Use `external_id` from the start (not a Zoho-specific name) — migration 058 had to rename `zoho_desk_contact_id` → `external_id` after the fact once contacts stopped being Zoho-only. Don't repeat that mistake for `tickets`/`ticket_messages`.

### `supabase/migrations/025_v2_schema.sql:96-129` — `tickets`/`ticket_messages` current schema

```sql
create table tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number serial unique,
  customer_id text not null references customers(customer_id) on delete cascade,  -- widen to nullable
  customer_product_id uuid references customer_products(id) on delete set null,
  subject text not null,
  channel text not null check (channel in ('portal', 'email', 'manual')),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')) default 'normal',
  status text not null check (status in ('new', 'open', 'waiting_on_client', 'waiting_on_us', 'resolved', 'closed')) default 'new',
  requester_email text,
  requester_profile_id uuid references profiles(id) on delete set null,  -- always null for imports
  sla_due_at timestamptz,       -- map from Desk dueDate
  first_response_at timestamptz, -- no clean Desk equivalent, leave null
  resolved_at timestamptz,       -- map from Desk closedTime
  classification_id uuid references classification_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_type text not null check (author_type in ('client', 'staff', 'system', 'llm_draft')),  -- always 'staff' for Desk Comments
  author_id uuid null references auth.users(id) on delete set null,
  body text not null,           -- Desk plainText, fallback content
  email_message_id text null,   -- always null, not applicable to Comments
  visibility text not null check (visibility in ('public', 'internal')) default 'public',  -- map from isPublic
  created_at timestamptz not null default now()
);
```

`channel` has no Desk equivalent beyond a coarse guess — map Desk's `channel === "EMAIL"` → `'email'`, everything else (`PHONE`, `CHAT`, `FORUMS`, `SOCIAL`, `WEB`, ...) → `'manual'` (never `'portal'` — that specifically means Hub-native onboarding-created tickets).

### `src/app/api/admin/zoho-import/issue-comments/route.ts` — chunk-retry helper and `auth.users` lookup pattern to reuse

`upsertChunkWithRetry()` (3 attempts, linear backoff) and the `adminClient.auth.admin.listUsers()` paginated cache-by-email pattern — copy both into `desk-ticket-comments` import unchanged.

## Implementation Steps

1. Write and apply migration 114 (nullable `tickets.customer_id`, new columns on both tables).
2. Update `src/types/database.ts` for both tables.
3. Extend `fetchAllDeskPages` return shape; fix its two existing callers.
4. Add `mapTicketStatus()` to `zoho-import.ts`.
5. Build `desk-tickets` export route; run it once against real data to confirm `ticketNumber` type, real `status`/`statusType`/`priority`/`channel` values, and whether `include=contacts` is needed to get the nested `contact`/`account` object (or if it's already present by default, as the docs examples suggest).
6. Build `desk-tickets` import route using the confirmed real values from step 5.
7. Build `desk-ticket-comments` export route; run it once to confirm the commenter/author field shape.
8. Build `desk-ticket-comments` import route using the confirmed shape from step 7.
9. Extract `_shared.tsx`, `_zoho-projects-tab.tsx`, `_zoho-desk-tab.tsx` from the current `page.tsx`; reduce `page.tsx` to the tab shell (default `"desk"`).
10. Add the four new levels to the Desk tab's export/import UI, following the existing `EXPORT_LEVELS`/`IMPORT_LEVELS` + generic `handleExport`/`handleImport` pattern for Desk Tickets (simple, single-shot) and a custom SSE handler for Desk Ticket Comments export (mirroring `handleIssueCommentsExport`).

## Acceptance Criteria

- `/admin/migrate` loads with the "Zoho Desk" tab active by default; a "Zoho Projects" tab switches to the relocated, behavior-unchanged Projects UI.
- Desk tab shows Desk Accounts, Desk Contacts, Desk Tickets, Desk Ticket Comments export levels, and Desk Contacts, Desk Tickets, Desk Ticket Comments import levels.
- Exporting Desk Tickets downloads a `desk-tickets.json` with every portal ticket.
- Importing Desk Tickets populates `tickets` with `external_id` set, `customer_id` populated where a match exists (via `contacts` or account-name fallback) and `null` otherwise, correct status/priority/channel mapping, and no writes to `ticket_number`.
- Exporting Desk Ticket Comments streams progress per ticket and downloads `desk-ticket-comments.json`.
- Importing Desk Ticket Comments populates `ticket_messages` with `author_type: 'staff'`, correct `visibility` from `isPublic`, and `ticket_id` resolved via `external_id`.
- Re-running any of the four import routes is idempotent (upsert on `external_id`, no duplicate rows).
- `npx tsc --noEmit` passes.
- Existing Zoho Projects export/import flows on the relocated tab still work identically (spot-check 2–3 levels in-browser).

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Manual, admin-logged-in: run Desk Tickets export → import, then Desk Ticket Comments export → import, against real data; confirm counts and a few spot-checked rows in Supabase.
- Confirm `tickets_client_read`/`tickets_client_insert` RLS still behaves correctly for a `client`-role account (cannot see unmatched imported tickets; can still create/read their own new tickets).

## Implementation Notes

### What Changed
- Split `admin/migrate/page.tsx` into a thin tab-switcher shell (default tab: Zoho Desk) plus `_zoho-projects-tab.tsx` (existing Projects UI relocated verbatim via a scripted line-range extraction, not hand-retyped, to guarantee byte-for-byte behavior parity) and `_zoho-desk-tab.tsx` (Desk Accounts/Contacts relocated + two new levels). Shared `ImportResult`/`CardState`/`CardStatus`/`ResultChip`/`StateIcon` factored into `_shared.tsx`.
- Added Desk Tickets and Desk Ticket Comments export (GET) + import (POST) routes, following the desk-accounts/desk-contacts and issue-comments patterns respectively.
- `fetchAllDeskPages()` now returns `{ items, token }` instead of a bare array, so the refreshed Zoho access token threads forward across the per-ticket comments-export loop; updated its two pre-existing callers.
- Added `mapTicketStatus()` to `zoho-import.ts`.
- Migration 114: widened `tickets.customer_id` to nullable, added `external_id`/`external_contact_id`/`external_account_id`/`match_method`/`source_meta` to `tickets`, added `external_id`/`source_meta` to `ticket_messages`. Imported Zoho Desk tickets merge into the existing native `tickets`/`ticket_messages` tables rather than a separate archival table.
- `src/types/database.ts` updated for both tables.

### Files Changed
- `supabase/migrations/114_tickets_ticket_messages_zoho_desk_import_columns.sql` - new columns + nullable customer_id (see Migration note below — **not yet applied**)
- `src/lib/zoho/desk.ts` - `fetchAllDeskPages` return shape change
- `src/app/api/admin/zoho-export/desk-accounts/route.ts` - updated for new `fetchAllDeskPages` return shape
- `src/app/api/admin/zoho-export/desk-contacts/route.ts` - updated for new `fetchAllDeskPages` return shape
- `src/lib/migrate/zoho-import.ts` - added `mapTicketStatus()`
- `src/app/api/admin/zoho-export/desk-tickets/route.ts` - new
- `src/app/api/admin/zoho-export/desk-ticket-comments/route.ts` - new
- `src/app/api/admin/zoho-import/desk-tickets/route.ts` - new
- `src/app/api/admin/zoho-import/desk-ticket-comments/route.ts` - new
- `src/types/database.ts` - `tickets`/`ticket_messages` type updates
- `src/app/(hub)/admin/migrate/page.tsx` - reduced to tab-switcher shell
- `src/app/(hub)/admin/migrate/_shared.tsx` - new
- `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` - new (relocated Projects UI)
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` - new (relocated Desk Accounts/Contacts + new Tickets/Ticket Comments UI)

### Deviations From Plan
- None from the approved task doc's scope. One thing the doc flagged as unconfirmed and left for implementation-time verification remains genuinely unconfirmed: the exact "who wrote this" field name on a Desk ticket comment (`commenter`/`commentedBy` are defensive guesses in the import route) — see Migration/Data Verification note below.

### Migration / Data Verification Note (not run — needs the user or a follow-up session)
Per this project's established pattern (e.g. task 293's note: *"migration 113 written but not yet applied to the remote database (user will apply manually)"*), migration 114 was **written but not applied** to the remote Supabase database — I don't run schema migrations against the live database as part of implementation. Consequently, the real Zoho Desk API calls this task depends on for full verification were **not exercised live**:
- Desk Tickets/Ticket Comments export against the real Zoho Desk API (to confirm the real `status`/`statusType`/`priority`/`channel` values, whether `include=contacts` is needed for the nested `contact`/`account` object, and the actual ticket-comment commenter field shape) — the user explicitly declined this live test during implementation (asked via AskUserQuestion) once UI verification passed.
- Import routes against real exported JSON (can't run without migration 114 applied first — `tickets.external_id`/`match_method`/`source_meta` columns don't exist yet on the live database).

**Before this task can be marked done**, someone needs to: apply migration 114, run Desk Tickets export once and sanity-check real field values against `mapTicketStatus()`/`mapPriority()`/the channel-mapping heuristic, then run the full export→import chain for both new levels.

### Verification Run
- `npx tsc --noEmit` - PASS (zero errors)
- `pnpm lint` - PASS (0 errors, 3 pre-existing warnings in unrelated files — none introduced by this task)
- Browser, admin-logged-in (`/admin/migrate`): Zoho Desk tab loads active by default with all 4 export levels + 3 import levels rendering correctly; switched to Zoho Projects tab — renders identically to the pre-split page (banner text, all 13 export + 13 import levels, from/to/since inputs) — PASS
- Console check on both tabs - PASS (no errors)
- Live Zoho Desk API export/import round-trip - SKIPPED (user declined; blocked on migration 114 not yet applied to the remote database)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed one inconsistency found during review: `desk-ticket-comments` export route mixed `NextResponse.json()` (one call site) with `new Response(JSON.stringify(...))` (every other error return in the same file). Changed the outlier to match the file's own established style and removed the now-unused `NextResponse` import. Re-ran `tsc --noEmit` and `pnpm lint` after — both still pass clean (0 errors; the 2 remaining warnings are pre-existing, in an unrelated file, untouched by this task).
- No unused code, no `any`/untyped escape hatches, no dead code, no debug artifacts (`TODO`/`FIXME`/`debugger`/stray `console.debug`) — grepped for all of these across every new/changed file, none found.
- `console.log`/`console.error` progress logging matches the established convention identically used by every sibling Zoho export/import route (`issues`, `issue-comments`, `desk-contacts`, etc.) — not debug logging left behind, it's this codebase's normal pattern for these admin-only migration routes.
- Naming is accurate and consistent with precedent: `mapTicketStatus()` mirrors `mapTaskStatus()`'s signature/heuristic style; `TicketRow`/`TicketMessageRow` are self-describing; route/table/column names follow the `external_id`-not-Zoho-prefixed convention migration 058 established.
- Migration 114's `alter column customer_id drop not null` matches migration 061's exact precedent syntax for the same kind of change.

### Deviations
- **Minor** — `_zoho-desk-tab.tsx` re-declares its own small `handleExport`/`handleImport` generic handlers (~20 lines each) rather than sharing them with `_zoho-projects-tab.tsx` through `_shared.tsx`. Accepted: the approved task doc's Out of Scope section explicitly ruled out refactoring the Projects tab's handler duplication while relocating it, and factoring a shared abstraction for just two call sites (one old, one new) would be the same kind of premature abstraction the task doc warned against elsewhere.
- **Minor** — the Desk ticket comment's commenter/author field name (`commenter`/`commentedBy`) is a defensive guess, not a confirmed field name. This is not a new gap introduced during implementation — the approved task doc itself flagged this exact uncertainty under "Zoho Desk Tickets API facts confirmed for this task" and scoped its resolution to implementation-time confirmation against real data (Implementation Step 7). It remains open because the live API test was declined (documented below).
- **Medium, user-visible** — Migration 114 has not been applied to the remote database, and the live Zoho Desk API export/import round-trip has not been exercised end-to-end. Both are explicitly documented in Implementation Notes and reflected in the `TASKS.md` row annotation. This is a real completion gap, not a code-quality defect — the code is ready to run, but hasn't been run against production data yet.

### Required Fixes
None — no Major deviations. The Medium item (migration application + live verification) is a pre-existing, already-documented handoff item, not a code fix.
