# 388: StackShift Support Center Tickets — Live Ingestion into Desk > Inbox

**Created:** 2026-09-22
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

The StackShift Support Center (a separate app, `webriq-pagebuilder/app`) lets StackShift
customers file support tickets. It creates those tickets **directly in Zoho Desk** via its own
API integration (`web/pages/api/support_desk/create-ticket.ts` → `POST
https://desk.zoho.com/api/v1/tickets`), tagging every ticket with `cf.cf_stack_shift_site:
<projectName>`. Central Hub has no live path that pulls these into its own `inbox` table —
only a one-time/manual historical import (`src/lib/migrate/desk-tickets-import.ts`) has ever
captured them, and only up to whenever that import was last run. Anything StackShift creates in
Desk after that stays invisible to `/desk/inbox` and every PM/staff workflow built on it.

Migration 147's own header comment already names `inbox` as "Desk email/support threads — Zoho
Desk + StackShift" — i.e. this ingestion path was anticipated but never built. Since Zoho Desk
is on a decommissioning path for this project, and StackShift's own app is not being changed as
part of this task, the fix is a **live poll on Central Hub's side** that pulls
`cf_stack_shift_site`-tagged Desk tickets (and their messages) into `inbox`/`inbox_messages`,
mirroring how `src/app/api/cron/email-poll/route.ts` already does this for the Zoho Mail
channel.

**Decided with the user before this doc was written (do not re-litigate):**
- **One-way only.** Hub displays these tickets; no write-back to Desk from Hub replies. Two-way
  sync is an explicitly deferred, bigger follow-up.
- **Same Zoho Desk org.** StackShift's `APP_ZOHO_DESK_ORG_ID` is the same org Central Hub
  already has API access to (`ZOHO_DESK_ORG_ID`, "webriqgoesmad"). No new Zoho OAuth
  app/credentials are needed — reuse `src/lib/zoho/desk.ts` + `src/lib/zoho/index.ts`'s existing
  token flow.

**⚠️ This is a bridge, not a permanent solution — depends entirely on Zoho Desk staying up.**
Both StackShift and this poll only work *through* Zoho Desk as an intermediary: StackShift's
`create-ticket.ts` POSTs to `desk.zoho.com` to create the ticket, and this task's poll separately
queries `desk.zoho.com/api/v1/tickets/search` to read it back. Neither side talks to the other
directly. Since this project has Zoho Desk on a decommissioning path, **if/when Desk is actually
turned off, this entire mechanism stops working** — StackShift's own ticket creation breaks first
(its POST to Desk just fails), and this poll starts 502ing on every run right alongside it. This
task deliberately does not fix that — it was scoped as "StackShift's own app is not being changed
as part of this task," which is correct for closing today's live-ingestion gap, but is not a
design that survives Desk's full removal.

**The real permanent fix, when Desk decommissioning reaches this point:** change StackShift's own
app (`webriq-pagebuilder/app` — a separate repo) to call **Central Hub directly** instead of
Zoho Desk — e.g. a new secret-authed webhook route here (`/api/webhooks/stackshift-support` or
similar), mirroring the pattern this codebase already uses for `/api/webhooks/stackshift-order`
(the StackShift Order Form webhook). That webhook would create `inbox`/`inbox_messages` rows
directly from the submission, with Zoho Desk out of the picture entirely on both sides. That is a
bigger, cross-repo task (touches `webriq-pagebuilder/app`'s `create-ticket.ts` /
`create-ticket-comment.ts` / `update-ticket.ts` too) and should be scoped as its own follow-up
task when Desk's actual shutdown date is known — not attempted piecemeal now. Until then, this
task's cron-poll bridge is the correct interim design.

## Non-obvious findings from investigating `webriq-pagebuilder/app` (local read-only, not edited)

These drove the design below — re-derive from the live repo if anything here goes stale:

1. **StackShift scopes "its" tickets by custom field, not channel/department.**
   `web/pages/api/support_desk/list-all-tickets-v2.ts` filters
   `GET /api/v1/tickets/search?customField1=cf_stack_shift_site:${notempty}` (URL-encoded
   `${notempty}` is Zoho's Desk-search DSL for "field is non-empty", not a literal value) — an
   admin sees all such tickets, a normal user gets `cf_stack_shift_site:<comma-joined site names>`
   instead. Central Hub's poll should use this exact filter to scope to StackShift-origin
   tickets and stay out of Desk's other traffic (email, other automation, other departments).
2. **The opening message lives in a thread, not a comment.** `POST /tickets` is called with a
   `description` field; Zoho auto-creates the first **thread** from it. StackShift's own
   `ticket-threads/index.ts` (`getThreadStarter`) confirms this — it fetches
   `/tickets/{id}/threads?sortBy=sendDateTime` and takes the first row as "the" opening message.
3. **All follow-up conversation lives in comments, not threads.**
   `create-ticket-comment.ts` posts new customer replies to `POST
   /tickets/{id}/comments` (`{content, contentType:"html"}`), and `list-all-ticket-comments.ts`
   reads them back the same way. So a live poll needs **both** endpoints — thread[0] for the
   opening message, all comments for the ongoing timeline — not just one.
4. **True end-user identity for comments is NOT fully recoverable from Desk alone.**
   `create-ticket-comment.ts` also POSTs `{ticket_id, comment_id, user_id, email, name}` to a
   separate internal API (`APP_DATAHUB_API_URL`) that StackShift uses to correlate a Desk
   comment id back to the actual app user who wrote it. Central Hub has no access to that
   datahub. Desk's own comment object only exposes its own commenter/agent identity fields —
   good enough to display the message and timeline correctly, but the "From" name/email on a
   StackShift-originated comment may not always resolve to the true customer the way an
   email-channel ticket's `requester_email` does. Document this as a known limitation, don't try
   to solve it in this task.
5. **`inbox.channel`'s check constraint** (`portal | email | manual`) has no value that fits
   "created via Desk API by StackShift" — see Requirements below for the decision on this.

## Requirements

- [ ] New cron route (e.g. `src/app/api/cron/desk-ticket-poll/route.ts`) that:
  - [ ] Authenticates via the existing cron pattern (`x-cron-secret` matching
        `CRONJOB_SECRET_KEY`, or a valid staff session) — same shape as `email-poll/route.ts`.
  - [ ] Calls Zoho Desk's `/tickets/search` (via `fetchDeskPage`/`fetchAllDeskPages` in
        `src/lib/zoho/desk.ts`) with `customField1=cf_stack_shift_site:${notempty}`, sorted by
        `-modifiedTime`, filtered client-side to rows modified after the stored cursor value
        (Desk's search endpoint has no reliable "since" filter for this custom-field query — same
        caveat `listNewMessages()` already documents for Zoho Mail).
  - [ ] Tracks its own cursor. **Reuse the existing `email_poll_cursor` table** with a new row
        (`id = 'stackshift-desk'`) rather than a new migration/table — the column is just a text
        cursor value, not literally email-specific in structure. Note the minor naming mismatch
        (`last_received_time` for a `modifiedTime` cursor) in a code comment rather than renaming
        the column, to avoid touching the email poll's existing row.
  - [ ] Seeds that cursor row to "now" (not null) on creation — an unseeded/null start would
        re-ingest every historical StackShift ticket the one-time import already captured,
        mirroring the exact caveat migration 122 already documents for the email cursor's
        null-start backfill behavior.
  - [ ] For each in-scope ticket: upsert into `inbox` keyed by `external_id` (same conflict key
        `desk-tickets-import.ts` already uses), so re-polling / already-imported historical rows
        never duplicate.
  - [ ] For each ticket: fetch `/tickets/{id}/threads` (take the first, sorted by
        `sendDateTime`, as the opening message) **and** all `/tickets/{id}/comments`, merge by
        time, upsert into `inbox_messages`. Use `inbox_messages.email_message_id` as the
        idempotency key by storing a synthetic value (e.g. `desk-thread-<id>` /
        `desk-comment-<id>`) — that column is only ever used for dedup lookups in this codebase,
        never validated as a real email Message-ID, so this reuse is safe; note it in a comment
        rather than adding a new column.
  - [ ] Does **not** run these tickets/messages through `src/lib/email/intake-filter.ts` — that
        filter targets email-channel automation noise; Desk-API tickets created by StackShift are
        already legitimate support requests.
  - [ ] Does **not** call `notifyCustomerTicketCreated()` (`src/lib/desk/customer-view-access.ts`)
        for these — the customer already got StackShift's own confirmation UX; sending Central
        Hub's separate "ticket created" email would be redundant/confusing. Explicit must-not.
  - [ ] Resolves `customer_id` the same simple way `email-poll/route.ts` already does (single
        `contacts` email `ilike` lookup) — not the heavier bulk contact/account-name matching
        `desk-tickets-import.ts` uses for its one-time bulk import; that's disproportionate for a
        per-ticket live poll.
- [ ] Decide + implement the `inbox.channel` value for these rows. **Recommendation: add `'api'`**
      via a small additive migration widening the check constraint
      (`portal | email | manual | api`), rather than reusing `'manual'`. Reasoning: `channel` is
      rendered as plain capitalized text on the ticket detail page
      (`_ticket-detail.tsx:401`, `{ticket.channel}`) — showing "Manual" for a ticket a customer
      filed themselves through StackShift would visibly mislead staff into thinking a human
      typed it in by hand. `'api'` reads correctly there once a friendly-label map is added (see
      below). If the migration is judged unnecessary, `'manual'` (matching the historical
      import's existing convention) is the fallback — flag whichever is chosen in the implement
      stage's summary.
  - [ ] `_ticket-detail.tsx`: replace the raw `{ticket.channel}` render with a small label map
        (`{ email: "Email", portal: "Portal", manual: "Manual", api: "StackShift" }` or similar)
        so the new value (and existing ones) read naturally. Low-risk, additive.
- [ ] `source_meta` on the upserted `inbox` row should carry the same shape
      `desk-tickets-import.ts` already writes for these fields — `cf`, `customFields`,
      `stackShiftSite` (via `resolveCfField(ticket.cf, CF_TARGETS.stackShiftSite)` from
      `src/lib/migrate/desk-cf.ts`), `channel`, `departmentId`, `webUrl`, etc. — so the UI/data
      shape is consistent whether a row came from the historical import or this new live poll.
- [ ] Register a new pg_cron job (new migration, e.g. `148_stackshift_desk_ticket_poll.sql`)
      calling the new route, same Vault-secret pattern as migration 122's `ticket-email-poll`
      job. Suggested cadence: every 10 minutes (StackShift tickets are lower-volume/less
      time-sensitive than the primary support inbox; adjust if the implementer finds otherwise).
- [ ] (Nice-to-have, not required for acceptance) A small "StackShift" source badge in
      `/desk/inbox`'s list (`_inbox-table.tsx`) when `source_meta.stackShiftSite` is present —
      confirmed via code read that channel is not currently rendered anywhere in the list table,
      so this is purely additive with nothing existing to conflict with.
- [ ] Update `CLAUDE.md`'s "Key Conventions" with the new cron route + the `inbox.channel`
      decision, following this repo's existing documentation convention for new cron jobs.

## Out of Scope / Must-Not-Change

- **No changes to `webriq-pagebuilder/app`** (a separate repo/app) — this task is entirely
  self-contained to Central Hub.
- **No two-way sync** — Hub-authored replies/comments on these tickets must not be pushed back
  to Desk in this task.
- **No attachment ingestion for these tickets in this pass.** StackShift's attachment flow
  (`ticket-attachments/[id]/upload.ts` in the pagebuilder app) is a distinct API surface from
  Desk's own `/tickets/{id}/attachments` that `email-poll` already knows how to download —
  confirm they resolve to the same underlying Desk attachment objects before wiring this up.
  Explicitly deferred; note it as a follow-up in the implementation summary, don't build it
  silently.
- **Do not touch `desk-tickets-import.ts`** (the historical/manual import) — this task adds a
  parallel *live* path, it does not replace or modify the existing import job.
- **Do not change StackShift's own Zoho Desk OAuth app, department id, or scopes** — this task
  only reads via Central Hub's *own* existing Desk API credentials.
- **Do not attempt to resolve the true StackShift end-user identity behind a Desk comment** (see
  Finding 4 above) — out of reach without access to StackShift's own datahub API; display
  whatever Desk itself returns.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/cron/desk-ticket-poll/route.ts` | Create | New live poll: Desk `/tickets/search` (cf_stack_shift_site) → upsert `inbox` + `inbox_messages` |
| `supabase/migrations/148_stackshift_desk_ticket_poll.sql` | Create | Seed `email_poll_cursor` row `stackshift-desk`; register `stackshift-desk-ticket-poll` pg_cron job; widen `inbox.channel` check constraint to add `'api'` (if that option is taken) |
| `src/app/(hub)/desk/inbox/[ticketId]/_ticket-detail.tsx` | Modify | Friendly label map for `ticket.channel` instead of raw capitalized text |
| `src/app/(hub)/desk/inbox/_inbox-table.tsx` | Modify (optional) | "StackShift" source badge from `source_meta.stackShiftSite` |
| `CLAUDE.md` | Modify | Document the new cron route + `inbox.channel` convention |

## Code Context

### `src/lib/zoho/desk.ts` — reusable Desk API helpers (already exist, no new client needed)

```ts
export function deskHeaders(): Record<string, string> {
  const orgId = process.env.ZOHO_DESK_ORG_ID;
  if (!orgId) throw new Error("ZOHO_DESK_ORG_ID not configured");
  return { orgId };
}

export async function fetchDeskPage(path, token, params, label) {
  const url = `${DESK_API_BASE}${path}?${new URLSearchParams(params)}`;
  return fetchZohoWithRetry(url, token, { label, headers: deskHeaders() });
}

export async function fetchAllDeskPages(path, token, label, opts = {}) { /* from/limit pagination, 429/401 handled by fetchZohoWithRetry */ }
```

Call with `path: "/tickets/search"`, `opts.params: { customField1: "cf_stack_shift_site:${notempty}", sortBy: "-modifiedTime" }` — `URLSearchParams` will correctly percent-encode the literal `$`, `{`, `}` characters in that DSL token; StackShift's own code pre-encodes the same string manually (`%24%7Bnotempty%7D`) because it bypasses `URLSearchParams`. **Confirm this against a live call before relying on it** (same "unverified, confirm against live account" posture this codebase already uses for Zoho Mail field names in `src/lib/zoho/mail.ts`).

### `src/app/api/cron/email-poll/route.ts` — the pattern to mirror

Cron auth (`x-cron-secret` / session), per-message `try/catch` that logs and continues rather than aborting the whole poll, cursor advance only after successful processing, `external_id`/idempotency-key based dedupe, `adminClient` usage throughout (no user session in a cron route — same documented exception as onboarding routes).

### `supabase/migrations/122_ticketing_zoho_mail_migration.sql` — cursor table to reuse

```sql
create table if not exists email_poll_cursor (
  id text primary key default 'helpdesk',
  last_received_time text,
  updated_at timestamptz not null default now()
);
```
`id` is a free-text primary key — inserting a second row (`'stackshift-desk'`) needs no schema change.

### `src/lib/migrate/desk-cf.ts` — custom-field promotion (reuse, don't reimplement)

```ts
export const CF_TARGETS = { whiteLabel: ["whitelabel"], stackShiftSite: ["stackshiftsite"] } as const;
export function resolveCfField(cf, targets): unknown { /* normalized-name match */ }
```

### `src/lib/migrate/desk-tickets-import.ts` — `source_meta` shape to match for consistency

```ts
source_meta: {
  ticketNumber: ticket.ticketNumber ?? null,
  status: ticket.status ?? null,
  channel: ticket.channel ?? null,
  departmentId,
  cf: ticket.cf ?? null,
  customFields: ticket.customFields ?? null,
  stackShiftSite: resolveCfField(ticket.cf, CF_TARGETS.stackShiftSite),
  // ...
}
```

### `webriq-pagebuilder/app` reference points (read-only — do not edit that repo)

- `web/config/deskAPIRoutes.ts` — `LIST_TICKETS_SEARCH = "https://desk.zoho.com/api/v1/tickets/search"`, `CREATE_TICKET`, scope list.
- `web/pages/api/support_desk/list-all-tickets-v2.ts` — the `customField1=cf_stack_shift_site:${notempty}` filter to mirror.
- `web/pages/api/support_desk/create-ticket.ts` — confirms `cf.cf_stack_shift_site` is the tagging field and that `description` becomes the opening thread.
- `web/pages/api/support_desk/ticket-threads/index.ts` (`getThreadStarter`) — confirms opening message = first thread by `sendDateTime`.
- `web/pages/api/support_desk/create-ticket-comment.ts` / `list-all-ticket-comments.ts` — confirms ongoing conversation = Desk comments, not threads.

## Implementation Steps

1. Decide and record the `inbox.channel` approach (`'api'` via migration vs. reuse `'manual'`) —
   default to `'api'` per the Requirements recommendation unless the implementer finds a reason
   not to.
2. Write migration `148_stackshift_desk_ticket_poll.sql`: seed `email_poll_cursor` row
   `('stackshift-desk', <now as epoch ms text>)`; widen `inbox.channel` check constraint if
   taking the `'api'` route; register the `stackshift-desk-ticket-poll` pg_cron job (mirror
   migration 122's `net.http_post` block, new job name, new route path). Leave it **written, not
   applied** per this repo's established convention — flag for the user to apply.
3. Build `src/app/api/cron/desk-ticket-poll/route.ts`:
   a. Cron auth guard (copy `email-poll`'s pattern).
   b. Get access token via `getZohoAccessToken()` (`src/lib/zoho/index.ts`).
   c. `fetchAllDeskPages("/tickets/search", token, label, { params: { customField1: "cf_stack_shift_site:${notempty}", sortBy: "-modifiedTime" } })`, filter client-side to `modifiedTime > cursor`.
   d. Per ticket: resolve `customer_id` (simple `contacts` email lookup), build `source_meta`,
      upsert `inbox` on `external_id`.
   e. Per ticket: `fetchAllDeskPages("/tickets/{id}/threads", ...)` → take first by
      `sendDateTime`; `fetchAllDeskPages("/tickets/{id}/comments", ...)` → all; merge by time;
      upsert `inbox_messages` using the synthetic `email_message_id` dedupe key.
   f. Advance the cursor only after a ticket's processing succeeds (mirror `email-poll`'s
      per-message try/catch + cursor-advance ordering).
4. Update `_ticket-detail.tsx`'s channel render with the label map.
5. (If doing the nice-to-have) add the StackShift badge to `_inbox-table.tsx`.
6. Update `CLAUDE.md`.
7. Run verification (below). Flag anything that needs a live Desk account to confirm (the
   `customField1` DSL encoding, `sendDateTime` sort behavior, comment `isPublic`/author shape)
   the same way this codebase already flags unverified Zoho field assumptions elsewhere.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] Calling the new route with a valid `x-cron-secret` against real `cf_stack_shift_site`-tagged
      Desk tickets creates/updates the expected `inbox` + `inbox_messages` rows, with no
      duplicates on a second run (idempotency via `external_id` / synthetic message keys).
- [ ] A StackShift-origin ticket's `channel` renders as something other than a plain "Manual"
      label on `/desk/inbox/[ticketId]`.
- [ ] Re-running the poll against already-historically-imported StackShift tickets does not
      duplicate `inbox` rows (upsert conflict key holds).
- [ ] Migration is written (not required to be applied for this criterion) and reviewed for
      correctness against migration 122/147's established patterns.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual, once a Desk account/session is available:
curl -X POST http://localhost:3000/api/cron/desk-ticket-poll -H "x-cron-secret: $CRONJOB_SECRET_KEY"
# Then inspect the `inbox`/`inbox_messages` rows created for a known StackShift ticket id.
```

## Compatibility Touchpoints

- New pg_cron job (written, not applied until the user pushes the migration — same posture as
  most recent migrations in this repo).
- No packaging/docs-adapter surface affected. `CLAUDE.md` gets an additive convention note.

## Implementation Notes

### What Changed
- New live cron route `POST /api/cron/desk-ticket-poll` that searches Zoho Desk's
  `/tickets/search` for `cf_stack_shift_site`-tagged tickets modified since a stored cursor,
  upserts them into `inbox` (`channel: 'api'`), and pulls each ticket's opening thread + all
  comments into `inbox_messages`.
- Migration 148 (written, not applied): seeds a second `email_poll_cursor` row
  (`'stackshift-desk'`), widens `inbox_channel_check` to add `'api'`, registers the
  `stackshift-desk-ticket-poll` pg_cron job (every 10 minutes).
- `database.ts`: widened all three `inbox` table `channel` type unions
  (`Row`/`Insert`/`Update`) to include `"api"`.
- `_ticket-detail.tsx`: added a `CHANNEL_LABELS` map so `channel` renders "StackShift" for
  `'api'` instead of the raw capitalized value; replaced the previous
  `capitalize` + `{ticket.channel}` render.
- `CLAUDE.md`: added the new cron route to the "Cron auth pattern" list, and a new Key
  Conventions bullet documenting the poll, the idempotency approach, the author-type
  convention, and the deferred attachment/identity limitations.

### Files Changed
- `src/app/api/cron/desk-ticket-poll/route.ts` — new poll route (created)
- `supabase/migrations/148_stackshift_desk_ticket_poll.sql` — new migration (created)
- `src/types/database.ts` — `inbox.channel` type widened to include `"api"`
- `src/app/(hub)/desk/inbox/[ticketId]/_ticket-detail.tsx` — friendly channel label map
- `CLAUDE.md` — new cron route + `inbox.channel` convention documented

### Deviations From Plan
- **Idempotency key switched from the plan's proposed synthetic `email_message_id` value
  (`desk-thread-<id>` / `desk-comment-<id>`) to `inbox_messages.external_id`.** While
  investigating the exact field names to use, found that `src/lib/migrate/desk-threads-import.ts`
  and `desk-comments-import.ts` (the historical import's own thread/comment ingestion) already
  use a real, purpose-built `external_id text unique` column on this exact table for this exact
  purpose (raw Desk thread/comment id) — added by migration 114 specifically for Desk-import
  correlation, separate from the email-specific `email_message_id` column the plan proposed
  reusing. Using the already-established column is more correct and avoids overloading a
  column semantically tied to email. No functional difference in outcome (still idempotent),
  but a cleaner fit with existing conventions.
- **Author-type/visibility field names refined against the historical import's already
  live-validated shapes.** The plan's Finding 4 correctly flagged `commenter.type` as
  UNVERIFIED; while implementing, found `desk-comments-import.ts` already encodes the exact,
  live-tested convention (`isAgent = commenter?.type !== "END_USER"` — default to staff/agent
  unless explicitly END_USER, since most Desk comments are agent-authored) and
  `desk-threads-import.ts` likewise for threads (`author?.type === "AGENT" || direction === "out"`,
  plus a top-level `visibility` string rather than `isPublic`). Adopted both verbatim instead of
  inventing new logic, for consistency and because they're already confirmed against real data
  (tasks 296/304). This is a refinement within Finding 4's spirit, not a scope change — the
  underlying identity-resolution limitation the plan called out still applies.
- Everything else implemented as specified: `'api'` channel value via migration (not `'manual'`),
  cursor reuse on `email_poll_cursor`, seeded-to-now start, simple email-based customer
  matching, no intake-filter, no `notifyCustomerTicketCreated()` call, no attachment ingestion,
  no two-way sync, no changes to `webriq-pagebuilder/app` or `desk-tickets-import.ts`.
- Skipped the "nice-to-have" StackShift badge on the `/desk/inbox` list table (`_inbox-table.tsx`)
  — while reading `_ticket-detail.tsx`/`page.tsx` for the channel fix, found the ticket detail
  page **already has a dedicated "StackShift Site" field** driven by
  `source_meta.stackShiftSite` (task 330), which this poll populates automatically with zero
  additional UI work. The list-table badge would be a second, redundant way to see the same
  fact, so it was left out as genuinely optional per the doc's own framing ("not required for
  acceptance").

### Verification Run
- `npx tsc --noEmit` — PASS (0 errors)
- `pnpm lint` — PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, untouched by
  this change)
- Manual `curl` against the live route / live Desk account — SKIPPED (no live Zoho Desk session
  available this pass; the `customField1` DSL encoding, `modifiedTime` sort behavior, and
  `commenter`/`author` field shapes remain UNVERIFIED against a real account, flagged inline in
  the route's own comments, same posture as this codebase's other Zoho API assumptions)
- Migration 148 apply — NOT RUN (written, not applied, per this repo's established convention —
  needs the user to run it before the cron/channel value take effect)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation found in `route.ts` — every
  function (`fetchTicketsSinceCursor`, `processTicket`, `syncTicketMessages`, `toIso`,
  `upsertInboxMessage`) is called, each with a single clear responsibility.
- No broad `any` — the two `as DeskThread[]` / `as DeskComment[]` casts on `fetchAllDeskPages()`'s
  `Record<string, unknown>[]` return are narrow, named-type assertions, consistent with how the
  rest of this codebase's Zoho import files (`desk-threads-import.ts`, `desk-comments-import.ts`)
  already cast raw Desk JSON.
- No deep nesting — guard clauses (`if (!externalId || !ticket.subject) return;`) keep control
  flow flat throughout.
- Error handling is intentional and matches `email-poll/route.ts`'s established shape: a
  ticket-level failure throws (aborting that ticket's message sync, since syncing messages for a
  ticket that failed to upsert makes no sense) and is caught per-ticket in the poll loop so one
  bad ticket doesn't block the rest; a message-level insert failure only logs (`console.error`),
  matching the non-blocking-per-item precedent `email-poll`'s attachment loop already sets.
- No secrets, credentials, or debug logging — `console.error` calls log ticket/message ids only,
  never tokens.
- `database.ts`, `_ticket-detail.tsx`, and `CLAUDE.md` diffs are minimal and surgical — confirmed
  via `git diff`, no unrelated changes slipped in.
- Migration 148's `inbox_channel_check` constraint name was verified (not assumed) against
  migration 147's Part 4 dynamic rename derivation (`tickets_channel_check` →
  `inbox_channel_check` via its documented `substring(... from 9)` rule) before being hardcoded
  into a `drop constraint` statement — a wrong name here would have made the migration fail
  outright on apply.

### Deviations
- **Minor** — idempotency key for `inbox_messages` uses the pre-existing `external_id` column
  (already used by `desk-threads-import.ts`/`desk-comments-import.ts` for this exact purpose)
  instead of the plan's proposed synthetic `email_message_id` value. Documented in
  Implementation Notes with rationale; same functional outcome (idempotent upsert), better fit
  with established schema intent. Does not change scope, requirements, or acceptance criteria.
- **Minor** — author-type/visibility resolution for threads/comments was refined to match the
  exact field names and default-bias already validated by the historical import
  (`commenter.type !== "END_USER"` defaulting to staff; `author.type`/`direction`/top-level
  `visibility` for threads) rather than the plan's more speculative Finding-4 guess. Still
  explicitly flagged as best-effort/unverified against a live account, per the plan's own
  limitation. No scope change.
- **Minor** — skipped the doc's optional `_inbox-table.tsx` "StackShift" badge. The doc itself
  marked this "nice-to-have, not required for acceptance," and it was found to be redundant with
  an existing "StackShift Site" field already on the ticket detail page (task 330) that this
  poll's `source_meta.stackShiftSite` populates automatically. No acceptance criterion depends
  on it.
- No Medium or Major deviations. Every "Out of Scope / Must-Not-Change" boundary was checked
  against the actual diff (`git diff --name-only`) and confirmed untouched:
  `webriq-pagebuilder/app` (not in this repo, not touched), `desk-tickets-import.ts` (absent from
  the changed-files list), no write-back calls to Desk anywhere in `route.ts`, no attachment
  handling, no new Zoho OAuth app/scope/department references.
