# 326: Desk Tickets — Zoho-Aligned Status Set, Zoho Ticket Numbers, Readable `ticket_id` Routing Key

**Created:** 2026-08-28
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Three related changes to the `tickets` data model and the Desk UI, all driven by `_from_zoho/desk-tickets.json`:

1. **Status set → Zoho Desk's own 4 values.** `tickets.status` currently carries a 6-value enum
   (`new | open | waiting_on_client | waiting_on_us | resolved | closed`) and `mapTicketStatus()`
   collapses Zoho's "On Hold" **and** "Escalated" both into `waiting_on_us`. Replace the enum with
   exactly **`open | on_hold | escalated | closed`** and map each Zoho `status`/`statusType`
   distinctly.
2. **Ticket number = Zoho's `ticketNumber`.** `tickets.ticket_number` is a Hub-internal `serial`;
   Zoho's real number (e.g. `20996`) lives only in `source_meta.ticketNumber`. Overwrite
   `ticket_number` on imported rows with the real Zoho `ticketNumber`, then advance the serial
   sequence past the max so live-created tickets continue after it.
3. **Readable `ticket_id` routing key.** Add a human-readable `tickets.ticket_id` in the format
   **`TKT-<ticket_number>`** (e.g. `TKT-20996`), mirroring the display-ID convention already used by
   Projects (`<cust>-PROJ-01`), Tasks (`<proj>-T0001`), Issues (`<proj>-I0001`), and Customers
   (`WRQ-CUST-XXXXXXXX`). Route the Desk ticket detail pages and `/api/desk/tickets/*` handlers by
   `ticket_id` instead of the bare number — the same deliberate "display value in the URL segment"
   exception already made for `/v2/projects/[projectId]` and its nested task route (tasks 188/190).

### Decisions locked with the user (2026-08-28)

| Question | Decision |
|----------|----------|
| `ticket_id` format | `TKT-<ticketNumber>` — derived directly from `ticket_number`, no separate counter. |
| Status enum | **Replace** with exactly `open \| on_hold \| escalated \| closed`. |
| Ticket number | **Overwrite** `ticket_number` with Zoho's `ticketNumber`; bump the serial sequence past the max. Breaking existing `/desk/tickets/<oldNumber>` links is accepted (same precedent as migration 088). |

### Ground truth from `_from_zoho/desk-tickets.json`

- 530 tickets, all with a non-null, unique `ticketNumber` (string), range `18345`–`20996`.
- `status` / `statusType` in the current export are only `Open` (9) and `Closed` (521). `On Hold`
  and `Escalated` do not appear in *this* file but are real Zoho Desk statuses that the archived
  export (task 325) and live email tickets will produce — the mapping and enum must handle them.
- Existing Hub-native (email-poll) tickets use low serial numbers (`#1`–`~#533`); Zoho numbers
  (`18345`+) do not overlap them, so the renumber is collision-free on current data. The migration
  must still guard against an overlap rather than assume it.

## Requirements

### A. Status set

- [ ] Migration `124`: drop the `tickets_status_check` constraint, remap existing rows, re-add the
      check as `status in ('open','on_hold','escalated','closed')`, and change the column default
      from `'new'` to `'open'`. Data remap:
      `new → open`, `open → open`, `waiting_on_client → open`, `waiting_on_us → on_hold`,
      `resolved → closed`, `closed → closed`.
      (`waiting_on_us` cannot be retroactively split into hold vs. escalated — no raw Zoho `status`
      was ever stored on those rows; re-running the import — Requirement B/D — restores the
      distinction for imported rows from the JSON.)
- [ ] `mapTicketStatus(status, statusType)` in `src/lib/migrate/zoho-import.ts` returns
      `"open" | "on_hold" | "escalated" | "closed"`:
      `closed` if either field contains `closed`; **`on_hold`** if either contains `hold`;
      **`escalated`** if either contains `escalat`; else `open` (drop the `new` fallback).
- [ ] Update every consumer of the old 6-value union to the new 4-value union:
  - `src/types/database.ts` — `tickets` Row / Insert / Update `status` type.
  - `src/app/(hub)/desk/tickets/_tickets-index.tsx` — `TicketStatus` type alias.
  - `src/app/(hub)/desk/tickets/_tickets-table.tsx` — `STATUS_LABELS`, `STATUS_TONE`.
  - `src/app/(hub)/desk/tickets/[ticketId]/_ticket-detail.tsx` — `STATUS_OPTIONS`, `STATUS_LABELS`,
    `STATUS_TONE`.
  - `src/app/api/desk/tickets/[ticketId]/status/route.ts` — `VALID_STATUSES`; `isResolvedOrClosed`
    becomes `status === "closed"` (still writes/clears `resolved_at`).
  - `src/lib/mcp/tools/list-tickets.ts` — `TICKET_STATUS`.
  - `src/lib/ai/ops-chat-tools.ts:316` — the `list_tickets` `status` enum.
- [ ] `src/app/api/cron/email-poll/route.ts` — new ticket insert uses `status: "open"` (was `"new"`).
- [ ] `src/app/(hub)/desk/tickets/_status-filter.ts` — `STATUS_FILTER_OPTIONS` becomes
      `open | on_hold | escalated | closed | overdue` (drop the stale "On Hold → waiting_on_us"
      comment); default (`parseStatusFilterParam(null)`) stays `["open"]`.
- [ ] `src/app/(hub)/desk/tickets/page.tsx` — `buildStatusOrClause`: `on_hold → status.eq.on_hold`,
      add `escalated → status.eq.escalated`, `overdue → and(sla_due_at.lt.<now>,status.neq.closed)`
      (drop the now-nonexistent `status.neq.resolved`).
- [ ] `src/app/(hub)/desk/tickets/_resolve.ts` — `isOverdue()` drops the `status === "resolved"`
      guard (keep `status === "closed"`).
- [ ] Chip tone mapping: `open → neutral`, `on_hold → warn`, `escalated → warn`, `closed → ok`
      (Chip only supports `ok | warn | neutral`).

### B. Ticket number

- [ ] Migration `124`: for rows where `external_id is not null` and
      `source_meta->>'ticketNumber'` is a positive integer, set
      `ticket_number = (source_meta->>'ticketNumber')::int` — **only** when that value does not
      already exist on another row (guard the `unique` constraint; log/skip collisions rather than
      failing the migration).
- [ ] Migration `124`: after the renumber,
      `select setval(pg_get_serial_sequence('tickets','ticket_number'), (select max(ticket_number) from tickets) + 1, false);`
      so the next serial-assigned (email-poll) ticket lands above every imported number.
- [ ] `src/app/api/admin/zoho-import/desk-tickets/route.ts` — write Zoho's `ticketNumber` into
      `ticket_number` (parsed int) on the upsert payload; keep `source_meta.ticketNumber` too;
      **add `source_meta.status`** (raw Zoho `status`) so future status backfills need no re-import.
      After the upsert loop, run the same `setval` bump (idempotent) so re-imports keep the sequence
      correct.
- [ ] Displayed number stays `#<ticket_number>` (now the real Zoho number). `resolveDisplayId()`
      keeps returning `` `#${ticket.ticket_number}` ``.

### C. Readable `ticket_id` routing key

- [ ] Migration `124`: `alter table tickets add column ticket_id text unique;`
- [ ] Migration `124`: backfill `ticket_id = 'TKT-' || ticket_number` for all rows (after the
      renumber in B), then a `before insert` trigger `generate_ticket_id()`:
      `if new.ticket_id is null then new.ticket_id := 'TKT-' || new.ticket_number; end if;`
      (`ticket_number`'s serial default is materialised before `before insert` triggers fire — same
      assumption migration 089's display-ID triggers rely on). Add `not null` after backfill.
- [ ] `src/app/api/admin/zoho-import/desk-tickets/route.ts` — set
      `ticket_id: 'TKT-' + ticketNumber` explicitly on the upsert payload so a re-import that
      changes `ticket_number` also refreshes `ticket_id` (the trigger's `is null` guard would
      otherwise leave a stale value on update).
- [ ] Rename the page route dir `src/app/(hub)/desk/tickets/[ticketNumber]/` →
      `src/app/(hub)/desk/tickets/[ticketId]/` (6 files) and the API route tree
      `src/app/api/desk/tickets/[ticketNumber]/` → `src/app/api/desk/tickets/[ticketId]/`
      (5 route files across 3 nested levels). Next.js forbids two different slug names for the same
      dynamic path, so this is all-or-nothing per tree.
- [ ] All renamed handlers: param is now the `TKT-…` string; look up with `.eq("ticket_id", param)`
      (drop the `Number()` / `Number.isInteger` validation; validate with a `^TKT-\d+$` check or
      just let the lookup miss → `notFound()` / 404).
- [ ] URL builders that currently interpolate `ticket_number`:
  - `src/app/(hub)/desk/tickets/_tickets-table.tsx` — `href={`/desk/tickets/${t.ticketId}`}`.
  - `src/app/(hub)/desk/tickets/[ticketId]/_ticket-detail.tsx` — status / notes / reply / attachment
    `fetch` URLs use `ticket.ticketId`.
  - `src/app/(hub)/desk/tickets/[ticketId]/_conversation-thread.tsx` &
    `_attachments-tab.tsx` — `ticketNumber` prop → `ticketId` string.
  - `src/lib/email/inline-images.ts` — `applyInlineImages({ ticketId })` (was `ticketNumber`);
    serving URL `/api/desk/tickets/${params.ticketId}/messages/...`.
  - `src/app/api/cron/email-poll/route.ts` — select `ticket_id` on the ticket insert/lookup and
    pass `ticketId` to `applyInlineImages`.
  - `src/app/api/admin/desk/backfill-inline-images/route.ts` — select `tickets(ticket_id)` and pass
    `ticketId` to `applyInlineImages`; the "cannot build serving URL" guard keys off `ticket_id`.
- [ ] `TicketListItem` / `TicketDetailData` carry a `ticketId: string` field (keep `ticketNumber`
      for the `#…` badge).
- [ ] `generateMetadata` in the detail page: title `Ticket #<number> · Desk` (resolve the number
      from the row, not the raw `TKT-…` param) — cosmetic, keep the `#number` form.

### D. Data / ops

- [ ] Re-run `POST /api/admin/zoho-import/desk-tickets` after migration `124` so imported rows pick
      up the new `mapTicketStatus` output and `source_meta.status`. Document in the task's
      Implementation Notes whether this was run against the live DB or only locally (same
      "live import pending" caveat as tasks 302/303).

## Out of Scope / Must-Not-Change

- **Ticket detail feature work** — conversation view, replies, notes, attachments (tasks 303/304/
  320/323/324) — untouched except for the mechanical `ticketNumber → ticketId` URL swap and the
  status-option list.
- **RLS policies** (`tickets_staff_all`, `tickets_client_read/insert`, migrations 026/048) — no
  policy references `status` or needs `ticket_id`; do not touch them. Note this explicitly in the
  migration header (the migration-114 precedent).
- **`resolved_at` column** — kept; still set when a ticket goes `closed`, cleared when reopened.
- **`waiting_on_client` / "waiting on the client" as a concept** — folded into `open`. Not
  re-introduced under a new name in this task.
- **Task 325 (archived tickets export/import)** — still separate; it will consume the updated
  `mapTicketStatus` / `importDeskTickets()` helper when built. Do not build any part of it here.
- **`zoho-export/desk-tickets` route** — reads from Zoho, does not push Hub `status`; no reverse
  mapping needed.
- **Priority enum** (`low | normal | high | critical`) — unrelated, unchanged.
- **`ticket_number` for existing low-numbered Hub-native tickets** — left as-is (e.g. `#8`, `#533`);
  only rows with `external_id` (imported) are renumbered.
- **Historic `/desk/tickets/<number>` links** — will 404 after the routing switch. Accepted; no
  redirect shim.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/124_desk_tickets_status_realign_zoho_number_ticket_id.sql` | Create | Status enum swap + data remap; renumber imported `ticket_number` to Zoho's + `setval`; add `ticket_id` + backfill + trigger + `not null`. |
| `src/lib/migrate/zoho-import.ts` | Modify | `mapTicketStatus` → 4-value output with distinct `on_hold` / `escalated`. |
| `src/app/api/admin/zoho-import/desk-tickets/route.ts` | Modify | Write `ticket_number` (Zoho's) + `ticket_id` (`TKT-…`) + `source_meta.status`; `setval` bump after upsert; update header comment (it currently says "Never writes Zoho's ticketNumber into tickets.ticket_number"). |
| `src/types/database.ts` | Modify | `tickets` Row/Insert/Update: `status` union → 4 values; add `ticket_id: string`. |
| `src/app/(hub)/desk/tickets/_tickets-index.tsx` | Modify | `TicketStatus` type; `TicketListItem.ticketId`. |
| `src/app/(hub)/desk/tickets/_tickets-table.tsx` | Modify | `STATUS_LABELS` / `STATUS_TONE` → 4 values; `href` → `ticketId`. |
| `src/app/(hub)/desk/tickets/_status-filter.ts` | Modify | `STATUS_FILTER_OPTIONS` (add Escalated, drop stale mapping comment). |
| `src/app/(hub)/desk/tickets/_resolve.ts` | Modify | `isOverdue` drops `resolved`. |
| `src/app/(hub)/desk/tickets/page.tsx` | Modify | `buildStatusOrClause` mapping; select `ticket_id`; build `TicketListItem` with `ticketId`. |
| `src/app/(hub)/desk/tickets/[ticketNumber]/` → `[ticketId]/` (6 files) | Rename + Modify | Route by `ticket_id`; `_ticket-detail.tsx` status options + fetch URLs; `_conversation-thread.tsx` / `_attachments-tab.tsx` prop rename; `page.tsx` lookup + metadata. |
| `src/app/api/desk/tickets/[ticketNumber]/` → `[ticketId]/` (5 route files) | Rename + Modify | `status`, `notes`, `reply`, `messages/.../attachments/.../file-url`, `messages/.../inline-images/...` — param + lookup by `ticket_id`; `status/route.ts` `VALID_STATUSES` + close logic. |
| `src/lib/email/inline-images.ts` | Modify | `applyInlineImages` param `ticketNumber: number` → `ticketId: string`; serving URL. |
| `src/app/api/cron/email-poll/route.ts` | Modify | `status: "open"`; select/propagate `ticket_id`; pass `ticketId` to `applyInlineImages`. |
| `src/app/api/admin/desk/backfill-inline-images/route.ts` | Modify | Select `tickets(ticket_id)`; pass `ticketId`; guard keys off `ticket_id`. |
| `src/lib/mcp/tools/list-tickets.ts` | Modify | `TICKET_STATUS` → 4 values. |
| `src/lib/ai/ops-chat-tools.ts` | Modify | `list_tickets` `status` enum → 4 values. |

## Code Context

### `src/lib/migrate/zoho-import.ts` — current `mapTicketStatus`

```ts
export function mapTicketStatus(
  status: string,
  statusType: string
): "new" | "open" | "waiting_on_client" | "waiting_on_us" | "resolved" | "closed" {
  const st = (statusType ?? "").toLowerCase();
  const s = (status ?? "").toLowerCase();
  if (st.includes("closed") || s.includes("closed")) return "closed";
  if (st.includes("hold") || s.includes("hold")) return "waiting_on_us";
  if (st.includes("escalat") || s.includes("escalat")) return "waiting_on_us";
  if (st.includes("open") || s.includes("open")) return "open";
  return "new";
}
```

New shape — order matters (`closed` wins, then `hold`, then `escalat`, else `open`):

```ts
export function mapTicketStatus(
  status: string,
  statusType: string
): "open" | "on_hold" | "escalated" | "closed" {
  const st = (statusType ?? "").toLowerCase();
  const s = (status ?? "").toLowerCase();
  if (st.includes("closed") || s.includes("closed")) return "closed";
  if (st.includes("hold") || s.includes("hold")) return "on_hold";
  if (st.includes("escalat") || s.includes("escalat")) return "escalated";
  return "open";
}
```

### `src/app/api/admin/zoho-import/desk-tickets/route.ts` — current row build (`~204-245`)

```ts
rows.push({
  customer_id: customerId,
  subject: ticket.subject,
  channel,
  priority: mapPriority(ticket.priority ?? ""),
  status: mapTicketStatus(ticket.status ?? "", ticket.statusType ?? ""),
  // ...
  external_id: externalId,
  source_meta: {
    ticketNumber: ticket.ticketNumber ?? null,   // stays
    statusType: ticket.statusType ?? null,
    // ADD: status: ticket.status ?? null,
    // ...
  },
});
```

Add to the payload: `ticket_number: Number.parseInt(ticket.ticketNumber ?? "", 10) || undefined` and
`ticket_id: ticket.ticketNumber ? 'TKT-' + ticket.ticketNumber : undefined`. The file header comment
("Never writes Zoho's ticketNumber into tickets.ticket_number — that column is a `serial` sequence")
is now obsolete — rewrite it to describe the renumber + `setval` contract.

### `src/app/(hub)/desk/tickets/page.tsx` — status filter → query (`~32-42`)

```ts
// Translates the curated filter selection into a PostgREST `.or()` clause.
function buildStatusOrClause(selected: string[], nowIso: string): string {
  const parts: string[] = [];
  if (selected.includes("open")) parts.push("status.eq.open");
  if (selected.includes("closed")) parts.push("status.eq.closed");
  if (selected.includes("on_hold")) parts.push("status.eq.waiting_on_us");   // → status.eq.on_hold
  // ADD: if (selected.includes("escalated")) parts.push("status.eq.escalated");
  if (selected.includes("overdue"))
    parts.push(`and(sla_due_at.lt.${nowIso},status.neq.closed,status.neq.resolved)`); // drop status.neq.resolved
  return parts.join(",");
}
```

### `src/app/api/desk/tickets/[ticketId]/status/route.ts` — current

```ts
const VALID_STATUSES = ["new", "open", "waiting_on_client", "waiting_on_us", "resolved", "closed"] as const;
// ...
const { ticketNumber: ticketNumberParam } = await params;
const ticketNumber = Number(ticketNumberParam);
if (!Number.isInteger(ticketNumber)) return NextResponse.json({ error: "Invalid ticket number" }, { status: 400 });
// ...
const isResolvedOrClosed = status === "resolved" || status === "closed";
const { data, error } = await adminClient
  .from("tickets")
  .update({ status, resolved_at: isResolvedOrClosed ? new Date().toISOString() : null })
  .eq("ticket_number", ticketNumber)
```

Becomes: `VALID_STATUSES = ["open", "on_hold", "escalated", "closed"]`; param is `ticketId` string
(validate `^TKT-\d+$` or skip and 404 on miss); `const isClosed = status === "closed"`;
`.eq("ticket_id", ticketId)`.

### `src/app/(hub)/desk/tickets/[ticketId]/_ticket-detail.tsx` — status option lists (`~51-73`)

```ts
const STATUS_OPTIONS: TicketDetailData["status"][] = ["open", "waiting_on_client", "waiting_on_us", "closed"];
const STATUS_LABELS: Record<...> = { open: "Open", /* waiting_on_client, waiting_on_us */ closed: "Closed" };
const STATUS_TONE: Record<..., "ok" | "warn" | "neutral"> = { open: "neutral", /* ... */ closed: "ok" };
```

Becomes `["open", "on_hold", "escalated", "closed"]` with labels `Open / On Hold / Escalated / Closed`
and tones `neutral / warn / warn / ok`. Fetch URLs at lines ~264/287/314 (`/status`, `/notes`,
`/reply`) and ~520/583 (attachments) switch `ticket.ticketNumber` → `ticket.ticketId`.

### `src/lib/email/inline-images.ts` (`~31-76`) & `email-poll/route.ts` (`~135-158`)

`applyInlineImages({ ticketNumber, ... })` → `applyInlineImages({ ticketId, ... })`; serving URL
`/api/desk/tickets/${params.ticketId}/messages/${params.messageRowId}/inline-images/${id}`.
`email-poll` inserts with `status: "open"` and `.select("id, ticket_number, ticket_id")`, then passes
`ticketId: newTicket.ticket_id` down. `backfill-inline-images/route.ts` selects
`tickets(ticket_id)` (was `ticket_number`) and threads `ticketId` through its `Unresolved` records +
`applyInlineImages` call.

### Display-ID convention precedent (CLAUDE.md)

- Projects: `<last 8 of customer_id>-PROJ-<2-digit seq>` — trigger, per-customer counter.
- Tasks / Issues (migration 089): `<10-char project base>-T####` / `-I####` — trigger + advisory
  lock + `max(seq)+1`, display-only **except** the `/v2/projects/[projectId]/tasks/[taskId]`
  route (tasks 188/190) where the URL segment holds the display value.
- Customers: `WRQ-CUST-XXXXXXXX`.
- **Tickets (this task):** `TKT-<ticket_number>` — no counter needed (derived from the number),
  and the URL segment *is* the display value, matching the projects/tasks route exception.

## Implementation Steps

1. **Migration 124** — write it first; header comment must cover: (a) the enum swap + why
   `waiting_on_us` can't be split retroactively, (b) the `ticket_number` renumber + `setval` +
   collision guard, (c) `ticket_id` add/backfill/trigger/`not null`, (d) an explicit "checked every
   `tickets` RLS policy — none reference `status` or need `ticket_id`" note.
2. `mapTicketStatus` in `zoho-import.ts` → 4-value output.
3. Import route: payload `ticket_number` / `ticket_id` / `source_meta.status`; post-loop `setval`;
   rewrite the stale header comment.
4. `src/types/database.ts` — `status` union (Row/Insert/Update) + `ticket_id`.
5. Rename `src/app/(hub)/desk/tickets/[ticketNumber]/` → `[ticketId]/`; update every file inside
   (lookup by `ticket_id`, status option lists, fetch URLs, metadata).
6. Rename `src/app/api/desk/tickets/[ticketNumber]/` → `[ticketId]/`; update all 5 route files.
7. `_tickets-index.tsx` / `_tickets-table.tsx` / `_status-filter.ts` / `_resolve.ts` /
   `page.tsx` — status unions, filter options, tone maps, `href`, `ticketId` on `TicketListItem`.
8. `email-poll/route.ts` — `status: "open"`, select/propagate `ticket_id`.
9. `inline-images.ts` + `backfill-inline-images/route.ts` — `ticketId` param.
10. `list-tickets.ts` + `ops-chat-tools.ts` — `TICKET_STATUS` enum.
11. `npx tsc --noEmit` → fix fallout (the 6→4 union change surfaces every stale reference).
12. `pnpm lint`.
13. Apply migration 124 to the DB, then re-run `POST /api/admin/zoho-import/desk-tickets`.
14. Browser acceptance (see below).

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `pnpm lint` both pass.
- [ ] Migration 124 applies cleanly on a DB holding both imported and Hub-native tickets; no
      `ticket_number` unique-constraint violation; `select max(ticket_number)` < the sequence's
      `last_value` afterward.
- [ ] After re-import: every imported row has `ticket_number` = its Zoho `ticketNumber`,
      `ticket_id` = `TKT-<that number>`, and `status ∈ {open, on_hold, escalated, closed}`.
- [ ] `/desk/tickets` list: status filter offers Open / On Hold / Escalated / Closed / Overdue,
      defaults to Open, Escalated filter returns only `escalated` rows, Overdue still works.
- [ ] Ticket ID column shows `#<zoho number>`; row links resolve to
      `/desk/tickets/TKT-<zoho number>` and the detail page loads.
- [ ] Detail page status dropdown lists the 4 values; changing to `closed` sets `resolved_at`,
      changing away from `closed` clears it (verify via `/api/desk/tickets/[ticketId]/status`).
- [ ] Inbound email (email-poll) creates a ticket with `status: "open"`, a serial `ticket_number`
      above the imported max, and `ticket_id` `TKT-<that serial>`; inline-image serving URLs
      (`/api/desk/tickets/TKT-…/messages/…`) resolve.
- [ ] `list_tickets` MCP tool + ops-chat `list_tickets` accept only the 4 status values.
- [ ] Old numeric URLs (`/desk/tickets/20996`) 404 — expected, not a regression.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: apply supabase/migrations/124_*.sql, then
#   curl -X POST localhost:3000/api/admin/zoho-import/desk-tickets  (authed session)
# Browser: /desk/tickets — filter tabs, row → detail, status change round-trip.
```

## Compatibility Touchpoints

- **Breaking:** any shared/bookmarked `/desk/tickets/<number>` URL and any external reference to a
  Hub ticket by its old internal serial. Accepted per the locked decision (migration 088 precedent).
- **CLAUDE.md** — add a "Key Conventions" bullet: `tickets.ticket_id` (`TKT-<ticket_number>`,
  display + routing key; `ticket_number` now holds Zoho's real number for imported rows, serial
  above the imported max for Hub-native) alongside the existing Projects/Tasks/Issues display-ID
  notes; note `tickets.status` is now `open | on_hold | escalated | closed`. Do this in the
  `document` stage, not during implementation.
- **Task 325** (archived tickets) — its planned `importDeskTickets()` helper extraction now also
  needs to carry the `ticket_number` / `ticket_id` / `setval` contract; flag in that task's doc.
- No packaging / install-surface impact.

## Implementation Notes

### What Changed

1. **Status enum → 4 values.** `tickets.status` is now `open | on_hold | escalated | closed`
   (migration 124 drops `tickets_status_check`, remaps existing rows —
   `new`/`waiting_on_client` → `open`, `waiting_on_us` → `on_hold`, `resolved` → `closed` — re-adds
   the constraint, and changes the default to `'open'`). `mapTicketStatus()` now returns the 4
   values with distinct `on_hold` / `escalated`. Every consumer updated: `database.ts` (Row/Insert/
   Update), list `TicketStatus` alias + table `STATUS_LABELS`/`STATUS_TONE`, detail
   `STATUS_OPTIONS`/`STATUS_LABELS`/`STATUS_TONE`, `status/route.ts` `VALID_STATUSES` (+ close logic
   `status === "closed"`), `_status-filter.ts` (added "Escalated"), `page.tsx` `buildStatusOrClause`
   (`status.eq.on_hold`, `status.eq.escalated`, overdue clause dropped `status.neq.resolved`),
   `_resolve.ts` `isOverdue` (dropped `resolved`), `list-tickets.ts` `TICKET_STATUS`,
   `ops-chat-tools.ts` `list_tickets` enum, `email-poll/route.ts` new-ticket insert (`"new"` → `"open"`).

2. **`ticket_number` = Zoho's `ticketNumber`.** Migration 124 renumbers imported rows
   (`external_id not null`, numeric `source_meta.ticketNumber`) to the real Zoho number, guarding
   the UNIQUE constraint (`raise warning` + skip on collision), then a new
   `sync_ticket_number_sequence()` SQL function `setval`s the serial past the max. `importDeskTickets()`
   now writes `ticket_number` + `ticket_id` on the upsert payload, stashes raw Zoho `status` in
   `source_meta.status`, and calls the rpc after the upsert loop. The `#<n>` badge
   (`resolveDisplayId`) now shows the real Zoho number.

3. **Readable `ticket_id` = `TKT-<ticket_number>`.** Migration 124 adds the column (backfill →
   `NOT NULL` → UNIQUE) plus a `before insert` trigger `generate_ticket_id()`. Both route trees
   renamed `[ticketNumber]` → `[ticketId]`:
   - `src/app/(hub)/desk/tickets/[ticketId]/` (page + 5 component files)
   - `src/app/api/desk/tickets/[ticketId]/` (status, notes, reply, messages/.../file-url,
     messages/.../inline-images)
   All handlers now validate `^TKT-\d+$` and look up `.eq("ticket_id", …)`. URL builders updated:
   list table `href`, detail-page `fetch` URLs (status/notes/reply), `ConversationThread` /
   `AttachmentsTab` props (`ticketNumber:number` → `ticketId:string`), `applyInlineImages()` param,
   `email-poll` (tracks `ticketDisplayId`, selects `ticket_id`), `backfill-inline-images`
   (`tickets(ticket_id)` embed, `Unresolved.ticketId`).

### Files Changed

- `supabase/migrations/124_desk_tickets_status_realign_zoho_number_ticket_id.sql` — new: status
  remap, ticket_number renumber + `sync_ticket_number_sequence()`, `ticket_id` column + trigger.
- `src/lib/migrate/zoho-import.ts` — `mapTicketStatus` 4-value return.
- `src/lib/migrate/desk-tickets-import.ts` — `TicketRow` adds `ticket_number`/`ticket_id`; row push
  writes them + `source_meta.status`; `sync_ticket_number_sequence` rpc after upsert; header.
  *(This file was created mid-implementation by the parallel task-325 session; task 326's import
  changes were layered onto it instead of the original route body — see Deviations.)*
- `src/app/api/admin/zoho-import/desk-tickets/route.ts` — header comment only (body is now the
  shared helper).
- `src/types/database.ts` — `tickets` Row/Insert/Update `status` union + `ticket_id`; new
  `sync_ticket_number_sequence` Functions entry.
- `src/app/(hub)/desk/tickets/_tickets-index.tsx` — `TicketStatus` (4), `TicketListItem.ticketId`.
- `src/app/(hub)/desk/tickets/_tickets-table.tsx` — status maps (4), `href` → `ticketId`.
- `src/app/(hub)/desk/tickets/_status-filter.ts` — filter options (+Escalated), comment.
- `src/app/(hub)/desk/tickets/_resolve.ts` — `isOverdue` drops `resolved`; comments.
- `src/app/(hub)/desk/tickets/page.tsx` — `buildStatusOrClause`, select `ticket_id`, map `ticketId`.
- `src/app/(hub)/desk/tickets/[ticketId]/**` (renamed from `[ticketNumber]`) — `page.tsx`
  (lookup + metadata + `ticketId` on `TicketDetailData`), `_ticket-detail.tsx` (status lists 4,
  fetch URLs, props), `_conversation-thread.tsx` + `_attachments-tab.tsx` (`ticketId` prop).
- `src/app/api/desk/tickets/[ticketId]/**` (renamed) — status/notes/reply/file-url/inline-images:
  param + lookup by `ticket_id`; `status/route.ts` `VALID_STATUSES` + close logic.
- `src/lib/email/inline-images.ts` — `applyInlineImages` param `ticketId: string`; serving URL.
- `src/app/api/cron/email-poll/route.ts` — `status: "open"`; `ticketDisplayId` tracking; passes
  `ticketId` to `applyInlineImages`.
- `src/app/api/admin/desk/backfill-inline-images/route.ts` — `tickets(ticket_id)` embed,
  `Unresolved.ticketId`, `ticketDisplayId` var, `applyInlineImages({ ticketId })`.
- `src/lib/mcp/tools/list-tickets.ts`, `src/lib/ai/ops-chat-tools.ts` — ticket status enum (4).

### Deviations From Plan

- **Concurrent refactor by the parallel task-325 session.** While implementing, the peer session
  (`webriq-central-hub-91`) extracted the `zoho-import/desk-tickets/route.ts` body into a new shared
  `src/lib/migrate/desk-tickets-import.ts` (`importDeskTickets()`), consumed by both the live route
  and a new `zoho-import/desk-archived-tickets/route.ts`. It had already aligned `TicketRow.status`
  to the 4-value enum. Task 326's remaining import-side changes (`ticket_number`, `ticket_id`,
  `source_meta.status`, `sync_ticket_number_sequence` rpc) were applied to that shared helper
  rather than the now-thin route file — so the archived-tickets import gets them for free. Confirmed
  with the peer before editing.
- **`backfill-inline-images` `?ticketNumber=N` query param** left as-is (still filters
  `.eq("ticket_number", n)`) — it's an admin convenience flag, `ticket_number` still exists, and it
  now resolves to the real Zoho number which is arguably more useful.

### Verification Run

- `npx tsc --noEmit` — PASS (after `rm -rf .next` to clear stale `[ticketNumber]` route validator
  types; clean on re-run).
- `pnpm lint` — PASS (2 pre-existing warnings in an unrelated file `_checklist-tab.tsx`).
- `pnpm build` — PASS (`✓ Compiled successfully`; routes register as
  `/desk/tickets/[ticketId]` and `/api/desk/tickets/[ticketId]/*`).
- Migration 124 apply against a live DB + re-run of `POST /api/admin/zoho-import/desk-tickets` —
  NOT RUN (no live DB access from this session; same "live import pending" caveat as tasks 302/303).
- Browser acceptance — NOT RUN (depends on the migration + re-import above).

### Stop-hook (vexp verify) note

The implement stop hook flagged ~10 `adminClient` "no longer exists in zoho-import.ts" import
errors plus `fetchAllDeskPages`/`ImportResult`/`buildUserCache` "you changed" warnings — all
**false positives** from a stale vexp index snapshot taken while the parallel task-325 session was
mid-refactor of `zoho-import.ts`. Verified: `adminClient` is re-exported at `zoho-import.ts:273`;
this session never touched `fetchAllDeskPages` et al.; `npx tsc --noEmit` exits 0 repo-wide.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No `any` / untyped escape hatches introduced. New `sync_ticket_number_sequence` typed in
  `database.ts` Functions; RPC call type-checks.
- No dead code left: removed the now-unread `TicketDetailData.ticketNumber` field (its last
  readers — the detail-page fetch URLs and child-component props — moved to `ticketId`), and the
  corresponding `page.tsx` mapping line. `ticket_number` is still selected/typed on
  `TicketDetailRow` because `resolveDisplayId()` consumes it.
- Route-param validation (`/^TKT-\d+$/`) is consistent across all 6 renamed handlers; each looks
  up `.eq("ticket_id", …)` and 404s on miss.
- Error handling intentional: the import's `sync_ticket_number_sequence` rpc failure is logged +
  pushed to `result.errors`, non-fatal (matches the existing chunk-upsert error posture).
- Migration 124: status remap is exhaustive (all pre-existing values map into the new 4-value
  set); `ticket_number` renumber guards the UNIQUE constraint with `raise warning` + skip and is
  idempotent; `ticket_id` add ordering is backfill → `NOT NULL` → UNIQUE → trigger.
- No secrets or debug logging in production paths.
- Conventions followed: migration numbered sequentially (124), header documents the RLS check,
  `_docs/task/` doc location, `pnpm` only, no git commands.

### Deviations
- **Minor** — Import-side changes were layered onto `src/lib/migrate/desk-tickets-import.ts`
  (a shared helper the parallel task-325 session extracted mid-implementation) rather than the
  original route body. Net effect matches the plan; the archived-tickets import inherits the
  behaviour. Coordinated with the peer session before editing. Already covered in Implementation
  Notes → Deviations.
- **Minor** — `backfill-inline-images` route: its JSON debug-response field `ticketNumber` was
  renamed to `ticketId`, and the `?ticketNumber=N` query param was kept as-is (still filters
  `.eq("ticket_number", n)` — the column still exists and now holds the Zoho number). Admin-only
  diagnostic endpoint; acceptable.
- **Minor** — Removed the dead `TicketDetailData.ticketNumber` field during this gate (see
  Standards Review).
- **Medium (observation, not fixed)** — The ticket-detail sidebar's "Zoho Ticket #" row
  (`_ticket-detail.tsx`, fed by `source_meta.ticketNumber`) is now visually redundant for imported
  rows: it shows the same number as the `#<n>` badge, because `ticket_number` now *is* the Zoho
  number. Left in place — restyling that row is outside the task's declared file-change scope and
  it renders harmlessly (`null` → hidden for Hub-native tickets). Flag for the test stage / user:
  consider dropping the row (and its `zohoTicketNumber` plumbing in `page.tsx` + `_ticket-detail.tsx`)
  as a fast follow-up.
- No Major deviations.

### Required Fixes
- None.

## Completion Note

**Marked complete at the user's explicit request on 2026-08-28**, from the Testing state — the
`test` / browser-acceptance stage was skipped.

Done: implementation + quality gate (PASS); `npx tsc --noEmit`, `pnpm lint`, `pnpm build` all
pass. **Live rollout performed by the user**: migration 124 applied to the production DB, Desk
tickets re-imported — `ticket_number` renumbered to the real Zoho numbers, `ticket_id`
(`TKT-<n>`) backfilled, statuses remapped, sequence synced.

A duplication issue surfaced during the live re-import (imported tickets vs. pre-existing
`external_id IS NULL` email-poll rows) — root-caused to email-poll's inability to id-match
imported tickets and split out as **task 327**, which also carries the one-time 45-orphan
cleanup runbook and the `email_poll_cursor` reset. Browser acceptance on `/desk/tickets`
(filter tabs, `TKT-…` routing, status round-trip) and the threads/comments re-import are
operator steps folded into that follow-up.
