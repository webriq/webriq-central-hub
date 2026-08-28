# 325: Zoho Desk Archived Tickets Export/Import (`/admin/migrate` → Desk tab)

**Created:** 2026-08-27
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

The Desk tab on `/admin/migrate` (task 296) exports tickets via `GET /api/v1/tickets`
(`fetchAllDeskPages("/tickets", …)`). That endpoint **only returns live (non-archived)
tickets** — it silently omits every archived ticket. The WebriQ portal has **15,000+
archived tickets** that are currently unreachable by the Hub migration and would be lost
on Zoho decommission.

**Yes — archived tickets can be exported via the API.** Zoho Desk exposes a dedicated
endpoint:

```
GET /api/v1/tickets/archivedTickets
  required: departmentId (long)
  optional: from (integer, range 0–4999), limit (integer, range 1–100),
            viewType (1=compact, 2=classic [default], 4=table),
            include (contacts,products,assignee,departments,isRead,team)
  headers:  orgId: <ZOHO_DESK_ORG_ID>, Authorization: Zoho-oauthtoken <token>
  OAuth scope: Desk.search.READ , Desk.tickets.READ
  credits: 3 / call (scales with how deep `from` reaches)
```

Response shape is the standard `{ "data": [ { …ticket… } ] }`. Ticket objects carry
`isArchived: true` plus the usual fields (`id`, `ticketNumber`, `subject`, `statusType`,
`status`, `priority`, `dueDate`, `createdTime`, `closedTime`, `departmentId`, …).

### Scope: 2025-01-01 → latest only (date filtering)

**The full archive is not wanted — only tickets from 2025 onward.** This is both the
product requirement and the thing that makes the export tractable.

The `archivedTickets` endpoint has **no server-side date-filter parameter** (only `from` /
`limit` / `departmentId` / `viewType` / `include`) and **no documented `sortBy`**. So the
date filter is applied **client-side in our export route**:

- The route takes a `createdAfter` query param, **default `2025-01-01T00:00:00.000Z`**,
  and keeps only tickets whose `createdTime >= createdAfter`.
- Zoho Desk list endpoints return **newest-first by default** (confirmed for the sibling
  threads endpoint: "sorting will be done in descending order by default"). The paginator
  therefore **stops early** for a department the moment it receives a full page whose
  every ticket predates the cutoff — no need to walk the whole archive.
- **Runtime must verify the order** against a real response before trusting the early
  stop (see Risks). If the order turns out not to be reliably date-descending, the
  fallback is to page the whole department (still bounded by the 4,999 cap) and filter
  without early-stop.

### The 5,000-per-department cap (mostly mooted by the date filter)

`from` is capped at **4,999** → at most **5,000 archived tickets per department**. With
the 2025-onward filter the recent slice is far smaller than the full ~15,000 backlog, so
the cap is unlikely to bite. The export still **loops every department**, and still
**detects + reports** if a department's 2025-onward set alone would exceed 5,000 (a
`warning` event). Recovery for a genuinely truncated department (Bulk Export API, or Zoho
Desk UI CSV export with a date range) is documented in "Open Questions / Risks" and is
**out of scope** unless the live run actually hits it.

### Landing the data

Per task 296's decision, archived tickets merge into the **same `tickets` table** (not a
separate archival table) — `source_meta.isArchived` already distinguishes them (task 302).
The archived-ticket payload is shape-compatible with the existing `desk-tickets` import,
so the import step reuses that logic against a new `desk-archived-tickets.json` file.

## Requirements

- [ ] New **"Desk Archived Tickets"** export row in the Desk tab (`_zoho-desk-tab.tsx`),
      SSE-streamed with a progress bar (same UX as "Desk Threads"), downloading
      `desk-archived-tickets.json`.
- [ ] New export route `GET /api/admin/zoho-export/desk-archived-tickets` that:
  - [ ] admin / super_admin gated (same guard as sibling routes),
  - [ ] accepts `?createdAfter=<ISO8601>`, **default `2025-01-01T00:00:00.000Z`**, and
        keeps only tickets whose `createdTime >= createdAfter`,
  - [ ] lists all Desk departments,
  - [ ] for each department, paginates `GET /api/v1/tickets/archivedTickets`
        (`limit=100`, `from` stepping 0 → 4900, `viewType=2`), **stopping that department
        early** once a full page arrives with every `createdTime < createdAfter`
        (newest-first order — verify at runtime), else until a short page or the 4,999 cap,
  - [ ] streams `progress` (department i/N + running kept-ticket count), `tickets` (batch,
        already date-filtered), `warning` (department's 2025-onward set hit the 5,000 cap
        → N unreachable; or response order not date-descending → early-stop disabled), and
        a final `done` event with total kept count + per-department breakdown +
        truncated-department list + failed-department list + the `createdAfter` value used,
  - [ ] **isolates per-department failure** — wraps each
        `fetchAllArchivedTicketsForDept(...)` call in `try/catch` (mirrors
        `desk-threads`' per-ticket `try/catch` + `failed_ticket_ids`): on a throw
        (rolling-throttle exhausted, non-OK status, network error) it logs, emits a
        `warning` event naming the department + reason, pushes the department id to a
        `failed_departments` list, and **continues the loop** — one bad department never
        aborts the whole export; the token still carries forward from the last successful
        page,
  - [ ] tags each ticket with `_zoho_department_id` (mirrors `desk-threads`'
        `_zoho_ticket_id` convention) so the import can trust the department even if the
        compact payload omits it,
  - [ ] routes every Zoho call through `fetchZohoWithRetry` (429 / rolling-throttle / 401).
- [ ] **Partial-result persistence in the client handler** — `handleArchivedTicketsExport()`
      does not wait for `done` to be useful: it accumulates `tickets` batches in a ref and,
      if the stream ends abnormally (reader throws, connection drops, or a `done` never
      arrives), still offers the accumulated subset as a `desk-archived-tickets.partial.json`
      download plus a visible "partial export — N departments done, re-run to resume from
      department M" notice. On a clean `done` it downloads `desk-archived-tickets.json` as
      normal. (There is no server-side resume; re-running restarts from department 1, but
      the operator keeps whatever completed.)
- [ ] New import row **"Desk Archived Tickets"** + route
      `POST /api/admin/zoho-import/desk-archived-tickets` that upserts
      `_from_zoho/desk-archived-tickets.json` into `tickets` (upsert on `external_id`),
      reusing the exact matching / `source_meta` logic of the current `desk-tickets`
      import (contact-first, account-name fallback, `isArchived` in `source_meta`).
- [ ] Extract the `desk-tickets` import body into a shared
      `importDeskTickets(rawTickets)` helper so both routes share one implementation.
- [ ] `EXPORT_LEVELS` / `IMPORT_LEVELS` descriptions and the in-tab "Run steps in order"
      note updated to mention archived tickets (and the 2025-onward default).
- [ ] Optional: a date input in the archived export row bound to `createdAfter`
      (prefilled `2025-01-01`); acceptable to ship with the hardcoded default and add the
      input only if the reviewer wants it.
- [ ] `env.example` / setup note: `Desk.search.READ` scope must be present on
      `ZOHO_REFRESH_TOKEN` (see Risks).

## Out of Scope / Must-Not-Change

- **Pre-2025 archived tickets.** Explicitly not wanted — the export defaults to
  `createdTime >= 2025-01-01`. (The param allows overriding the cutoff later without a
  code change.)
- **Archived ticket threads / comments / attachments.** Only the ticket records are in
  scope. Whether `/tickets/{id}/threads` and `/tickets/{id}/comments` work for archived
  tickets is unverified — filed as a follow-up.
- **Recovering a department whose 2025-onward set exceeds the 5,000 cap.** The export
  reports it; building the Bulk Export API path or a CSV-import fallback is a separate
  task, opened only if the live run actually hits the cap.
- The existing `desk-tickets` export/import behaviour for **live** tickets — unchanged
  (only refactored to expose the shared `importDeskTickets` helper; output identical).
- The `tickets` table schema — no migration. Archived rows use existing columns +
  `source_meta`.
- The Zoho Projects tab, and every non-archived Desk export/import.
- Do not switch the export off SSE — 150+ sequential paged calls with throttle backoff
  will exceed a normal request budget; streaming keeps the client informed (this is a
  localhost/dev migration action, same as `desk-threads`).
- **Server-side resume / checkpointing is out of scope.** The route has no memory of a
  prior partial run; re-running restarts from department 1. The resilience added here is
  (a) per-department fault isolation so one failure doesn't lose the others, and (b) a
  client-side partial download so an aborted stream still yields the completed departments.
  A true resume (persist a cursor, skip already-exported departments) is a follow-up, only
  if the live run shows the full pass is too flaky to complete in one go.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/zoho/desk.ts` | Modify | Add `fetchDeskDepartments(token, label)` and `fetchAllArchivedTicketsForDept(departmentId, token, label, { createdAfter })` — a paginator that respects the `from` 0–4999 cap, applies the `createdAfter` filter, early-stops on a fully-stale page, and returns `{ items, token, truncated, orderUnreliable }`. |
| `src/lib/migrate/desk-tickets-import.ts` | Create | `importDeskTickets(rawTickets: DeskTicketRaw[]): Promise<ImportResult & { matched; unmatched }>` — the current `desk-tickets` route body, lifted verbatim (lookup-map building + matching + chunked upsert). |
| `src/app/api/admin/zoho-import/desk-tickets/route.ts` | Modify | Reduce to auth guard + `readFromZoho("desk-tickets.json")` + `importDeskTickets(...)`. |
| `src/app/api/admin/zoho-import/desk-archived-tickets/route.ts` | Create | Auth guard + `readFromZoho("desk-archived-tickets.json")` + `importDeskTickets(...)`. |
| `src/app/api/admin/zoho-export/desk-archived-tickets/route.ts` | Create | SSE export: parse `?createdAfter` (default 2025-01-01) → departments loop, **each department wrapped in `try/catch` → `warning` + `failed_departments` on throw, loop continues** → per-dept date-filtered archived pagination → `progress`/`tickets`/`warning`/`done` (incl. `failed_departments`) events. |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | Modify | New `ArchivedTicketsExportState` (adds `failedDepartments` + `partial` flag) + `handleArchivedTicketsExport()` (clone of `handleThreadsExport`, **accumulate batches in a ref; on abnormal stream end still download `desk-archived-tickets.partial.json` + show a partial/resume notice**), new export row + import row, updated `EXPORT_LEVELS`/`IMPORT_LEVELS`/order note. |
| `env.example` | Modify | Comment near `ZOHO_DESK_ORG_ID`: archived-tickets export also needs `Desk.search.READ` on the refresh token. |

## Code Context

### `src/lib/zoho/desk.ts` — existing paginator (do not reuse as-is for archived)

```ts
// from is 1-indexed, 100/page, stops on a short page. Archived endpoint needs a
// 0–4999 hard stop + a `truncated` flag, so add a dedicated function.
export async function fetchAllDeskPages(path, token, label):
  Promise<{ items: Record<string, unknown>[]; token: string }> { … perPage=100 … }
```

New function sketch:

```ts
const ARCHIVED_FROM_MAX = 4999; // Zoho hard cap

export async function fetchAllArchivedTicketsForDept(
  departmentId: string,
  token: string,
  label: string,
  opts: { createdAfter: string }, // ISO8601; default set by the caller to 2025-01-01
): Promise<{
  items: Record<string, unknown>[];
  token: string;
  truncated: boolean;       // hit the 4,999 cap before exhausting the department
  orderUnreliable: boolean; // saw an older ticket followed by a newer one → early-stop disabled
}> {
  const perPage = 100;
  const cutoff = Date.parse(opts.createdAfter);
  let from = 0;                 // archived endpoint accepts from=0
  let currentToken = token;
  let orderUnreliable = false;
  let lastSeen = Infinity;      // for the descending-order sanity check
  const all: Record<string, unknown>[] = [];

  while (true) {
    const { res, token: next, throttleExhausted } = await fetchDeskPage(
      "/tickets/archivedTickets", currentToken,
      { from: String(from), limit: String(perPage), departmentId, viewType: "2" }, label
    );
    currentToken = next;
    if (throttleExhausted) throw new Error(`[${label}] rolling throttle exhausted`);
    if (res.status === 204) break;                       // Zoho returns 204 on empty page
    if (!res.ok) throw new Error(`[${label}] ${res.status}: ${await res.text()}`);

    const page = ((await res.json()) as { data?: Record<string, unknown>[] }).data ?? [];
    if (page.length === 0) break;

    const times = page.map((t) => Date.parse(String(t.createdTime ?? "")));
    // descending-order check: any timestamp greater than a prior one means not newest-first
    for (const ts of times) { if (Number.isFinite(ts) && ts > lastSeen) orderUnreliable = true; lastSeen = ts; }

    const kept = page.filter((_, i) => !Number.isFinite(times[i]) || times[i] >= cutoff);
    all.push(...kept.map((t) => ({ ...t, _zoho_department_id: departmentId })));

    // early stop only when we trust the order: a full page entirely before the cutoff
    const wholePageStale = times.length === perPage && times.every((ts) => Number.isFinite(ts) && ts < cutoff);
    if (!orderUnreliable && wholePageStale) return { items: all, token: currentToken, truncated: false, orderUnreliable };

    if (page.length < perPage) return { items: all, token: currentToken, truncated: false, orderUnreliable };
    from += perPage;
    if (from > ARCHIVED_FROM_MAX) return { items: all, token: currentToken, truncated: true, orderUnreliable };
  }
  return { items: all, token: currentToken, truncated: false, orderUnreliable };
}
```

If `orderUnreliable` comes back `true` the department was still fully paged (bounded by
the 4,999 cap) and correctly filtered — only the optimisation was lost; the route emits a
`warning` so the operator knows the run was slower / cap-exposed.

`fetchAllArchivedTicketsForDept` still **throws** on a genuinely unrecoverable page
(`throttleExhausted` after `fetchZohoWithRetry`'s own backoff, a non-OK status, a network
error). That throw must not kill the stream — the **export route** catches it per
department (see below), not the paginator.

Departments list: `GET /api/v1/departments` (`{ data: [{ id, name, … }] }`), scope
`Desk.departments.READ` — reuse `fetchDeskPage("/departments", token, { from:"1", limit:"100" }, label)`;
typical portals have < 20 departments so a single page is enough, but loop defensively.

### `src/app/api/admin/zoho-export/desk-threads/route.ts` — SSE pattern to mirror

```ts
const stream = new ReadableStream({
  async start(controller) {
    const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
    const failedDepartments: string[] = [];
    for (let d = 0; d < departments.length; d++) {
      const dept = departments[d];
      try {
        const r = await fetchAllArchivedTicketsForDept(dept.id, token, label, { createdAfter });
        token = r.token; // carry the refreshed token forward regardless
        send({ type: "tickets", tickets: r.items });
        if (r.truncated) send({ type: "warning", department: dept.name, reason: "5000-cap", unreachable: "unknown" });
        if (r.orderUnreliable) send({ type: "warning", department: dept.name, reason: "order-not-descending" });
      } catch (e) {
        // mirrors desk-threads' per-ticket catch: one bad department must not abort the run
        failedDepartments.push(dept.id);
        console.log(`[desk-archived-tickets] dept=${dept.id} failed:`, e instanceof Error ? e.message : e);
        send({ type: "warning", department: dept.name, reason: "fetch-failed", message: String(e) });
      }
      send({ type: "progress", current: d + 1, total: departments.length, ticketCount: kept });
    }
    send({ type: "done", total_tickets: kept, per_department, truncated_departments, failed_departments: failedDepartments, created_after: createdAfter });
    controller.close();
  },
});
return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
```

Client handler to clone: `handleThreadsExport()` in `_zoho-desk-tab.tsx` (lines ~191–258)
— frame split on `\n\n`, `data: ` prefix, accumulate `tickets` events **into a ref**, build
a Blob and click-download `desk-archived-tickets.json` on `done`. **Additionally** (new for
this row): wrap the reader loop in `try/catch/finally`; if the loop exits without having
seen a `done` event, still Blob-download the accumulated tickets as
`desk-archived-tickets.partial.json` and render a "partial — re-run to resume" notice with
the last-seen `progress.current`/`total`. Surface `warning` events as amber text listing
the affected departments.

### `src/app/api/admin/zoho-import/desk-tickets/route.ts` — logic to extract

`DeskTicketRaw` / `TicketRow` types, the paginated `contacts` + `customers` lookup-map
build (Supabase 1000-row cap → `.range()` loop), contact-first / account-name-fallback
matching, the full `source_meta` object (lines 219–244, includes `isArchived`,
`departmentId`), and the `CHUNK_SIZE = 50` upsert `onConflict: "external_id"`. Move all of
it into `importDeskTickets(rawTickets)`; the archived route feeds the same function.
`_zoho_department_id` from the export can populate `source_meta.departmentId` when the raw
`departmentId` field is absent.

### Auth guard (identical in every sibling route)

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return …401;
const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (profile?.role !== "admin" && profile?.role !== "super_admin") return …403;
const token = await getZohoAccessToken();           // refresh_token grant, src/lib/zoho/index.ts:24
if (!process.env.ZOHO_DESK_ORG_ID) return …500;
```

## Implementation Steps

1. **`desk.ts`:** add `fetchDeskDepartments()` and `fetchAllArchivedTicketsForDept()`
   (0–4999 cap, `createdAfter` filter + newest-first early-stop with an order sanity check,
   `truncated` / `orderUnreliable` flags, `_zoho_department_id` tag, `viewType=2`,
   `fetchDeskPage` under the hood so retry/throttle is inherited).
2. **Extract** `importDeskTickets(rawTickets)` into `src/lib/migrate/desk-tickets-import.ts`
   from the current `desk-tickets` import route; repoint that route at it; confirm
   `npx tsc --noEmit` and that the route's response JSON is byte-identical.
3. **Export route** `zoho-export/desk-archived-tickets/route.ts`: auth guard → parse
   `createdAfter` (`new URL(req.url).searchParams.get("createdAfter") ?? "2025-01-01T00:00:00.000Z"`,
   validate with `Date.parse`) → list departments → SSE stream: for each dept call
   `fetchAllArchivedTicketsForDept(id, token, label, { createdAfter })` **inside a
   `try/catch`** — on success forward the refreshed token + `send({type:"tickets", tickets})`
   + `send({type:"warning", …})` when `truncated`/`orderUnreliable`; on throw log,
   `send({type:"warning", reason:"fetch-failed", …})`, push to `failed_departments`, and
   `continue`. Always `send({type:"progress", current: deptIndex+1, total: deptCount,
   ticketCount})`. Final `done` carries `total_tickets`, `per_department` counts,
   `truncated_departments`, `failed_departments`, and `created_after`. (See the SSE sketch
   in Code Context.)
4. **Import route** `zoho-import/desk-archived-tickets/route.ts`: auth guard →
   `readFromZoho<DeskTicketRaw>("desk-archived-tickets.json")` → `importDeskTickets(...)` →
   return the `ImportResult`.
5. **`_zoho-desk-tab.tsx`:** add `ArchivedTicketsExportState` (with `failedDepartments`
   string[] + `partial` boolean), `handleArchivedTicketsExport` (clone of
   `handleThreadsExport`: accumulate `tickets` batches in a ref; `try/catch/finally` around
   the reader loop; if the loop ends without a `done` event, still Blob-download
   `desk-archived-tickets.partial.json` and set `partial: true` + a "re-run to resume from
   department M/N" notice; surface `warning` events as amber text naming the departments),
   render an export row (SSE branch, like `desk-threads`) and a plain import row; add
   `{ key: "desk-archived-tickets", label: "Desk Archived Tickets", desc: "Archived tickets
   created 2025-01-01 onward — separate endpoint the live Desk Tickets export skips;
   warns if a department's 2025+ set exceeds Zoho's 5,000/department API cap" }` to
   `EXPORT_LEVELS` and `IMPORT_LEVELS`; update the amber "Run steps in order" banner
   (archived export can run any time after Desk Accounts/Contacts; archived import after
   Desk Tickets import).
6. **`env.example`:** note the `Desk.search.READ` scope requirement.
7. Run `npx tsc --noEmit` + `pnpm lint`. Browser-test on `/admin/migrate` (see Verification).

## Acceptance Criteria

- [ ] `/admin/migrate` → Zoho Desk tab shows a **Desk Archived Tickets** export row with a
      live progress bar and a **Desk Archived Tickets** import row.
- [ ] Running the export downloads `desk-archived-tickets.json` — a flat JSON array of
      archived ticket objects, each with `isArchived: true` and `_zoho_department_id`, and
      **every `createdTime >= 2025-01-01`** (no pre-2025 rows).
- [ ] Every department is iterated; the final summary reports total kept tickets, a
      per-department breakdown, and the `createdAfter` value used.
- [ ] Passing `?createdAfter=2024-06-01T00:00:00.000Z` widens the window accordingly
      (spot check: earliest `createdTime` in the output moves back).
- [ ] If a department's 2025-onward set fills the 5,000 cap, the UI shows an amber warning
      naming the department and the unreachable count; the export still completes for the
      rest. Likewise if the response order is not newest-first (early-stop disabled).
- [ ] `429` / rolling-throttle / `401 token expired` mid-export are handled (inherited
      from `fetchZohoWithRetry`) — no crash, token refresh carries forward.
- [ ] **A department whose pagination throws after `fetchZohoWithRetry` gives up
      (throttle exhausted / non-OK / network error) does not abort the export** — its id
      appears in the `done` event's `failed_departments`, an amber warning names it, and
      every other department still exports. (Simulate by pointing one department id at a
      bogus value or forcing a throw.)
- [ ] **If the SSE stream ends without a `done` event** (kill the dev server mid-run, or
      drop the connection), the client still downloads `desk-archived-tickets.partial.json`
      with the departments completed so far and shows a partial/"re-run to resume" notice —
      the run is never a total loss.
- [ ] Placing the file at `_from_zoho/desk-archived-tickets.json` and running the import
      upserts into `tickets` (`external_id` conflict target), matched to customers by the
      same rules as the live `desk-tickets` import; unmatched rows import with
      `customer_id: null`; `source_meta.isArchived` is truthy on every archived row.
- [ ] Re-running the import is idempotent (upsert, no duplicates).
- [ ] The existing live `desk-tickets` export/import is unchanged in behaviour and output.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then, as an admin user:
```

- `/admin/migrate` → **Zoho Desk** tab → **Desk Archived Tickets** → **Export**. Watch the
  progress bar advance per department; confirm the downloaded JSON is the 2025-onward
  subset (not the full ~15,000), every `createdTime >= 2025-01-01`, and any
  truncation / order warning surfaces.
- `curl -N '.../api/admin/zoho-export/desk-archived-tickets?createdAfter=2024-01-01T00:00:00.000Z'`
  (with an admin cookie) → confirm the window widens.
- **Fault isolation:** temporarily force a throw for one department (bogus id, or a thrown
  error in the loop) → the SSE stream keeps going, that id lands in `done.failed_departments`,
  an amber warning names it, and the other departments' tickets are still in the download.
- **Partial download:** start the export, kill `pnpm dev` (or disconnect) before it
  finishes → the browser still saves `desk-archived-tickets.partial.json` with the
  completed departments and shows the "re-run to resume from department M/N" notice.
- Save to `_from_zoho/desk-archived-tickets.json`, click the archived **Import**. Verify
  in Supabase: `select count(*) from tickets where source_meta->>'isArchived' = 'true'
  and created_at >= '2025-01-01';` matches the export count (minus any skipped rows
  lacking `id`/`subject`).
- Spot-check 3–4 archived tickets against Zoho Desk (subject, status, created date,
  customer match).
- Re-run the import; confirm `imported` count is stable and no duplicate `external_id`.
- Regression: run the normal **Desk Tickets** export + import; confirm unchanged.

## Open Questions / Risks

1. **OAuth scope.** `GET /tickets/archivedTickets` needs `Desk.search.READ` (plus the
   already-granted `Desk.tickets.READ`). The Hub uses a `refresh_token` grant
   (`ZOHO_REFRESH_TOKEN`), so the scope set is fixed at token-generation time. If
   `Desk.search.READ` is not on the current token the endpoint returns `401
   INVALID_OAUTH` / `403` — **the refresh token must be regenerated with the added
   scope** before this feature works. First implementation step during the live run:
   probe one department with `from=0&limit=1` and surface a clear "scope missing" error.
2. **Date filter is client-side — the endpoint has no date param.** Confirmed against the
   official docs: `archivedTickets` query params are only `from` / `limit` /
   `departmentId` / `viewType` / `include`. So "2025 onward" is enforced by our route
   filtering on `createdTime`, relying on newest-first ordering for the early-stop
   optimisation. The order is **documented for the sibling threads endpoint** ("descending
   by default") but **not for `archivedTickets`** — the paginator includes a runtime
   order-sanity check and disables the early-stop (still filtering correctly, just paging
   the whole dept up to the cap) if the assumption fails. Verify the real order on the
   first live run.
3. **> 5,000 in one department, 2025-onward.** Much less likely now that the window is
   just 2025+, but still possible. If it happens the export reports it; fallbacks, not
   built here:
   - **Bulk Export API** (`module: tickets`, async, `exportId` + `callBackUrl`,
     `modifiedAfter` + `fieldConditions`/criteria-view filter on Created Time, returns a
     downloadable file) — no 5,000 cap and native date filtering, but a large async-job
     build.
   - **Zoho Desk UI** → Setup → Data Administration → Import/Export → Export → Tickets
     (CSV, supports a date range, includes archived, no cap) → CSV→JSON adapter into the
     archived import.
   Decision needed only if the live run reports truncation.
4. **Compact vs classic payload fields.** `viewType=2` (classic, the default) is assumed
   to return `contactId` / `accountId` / `departmentId` for customer matching. If the
   archived payload omits `contactId`/`accountId`, those tickets import unmatched
   (`customer_id: null`) — acceptable (same precedent as unmatched live tickets), but note
   it; `include=contacts,departments` can be added if needed.
5. **Empty-page signal.** Some Desk list endpoints return HTTP `204` (no body) rather than
   `{ data: [] }` when a page is empty — the paginator handles both.
6. **Runtime length.** With the 2025-onward filter + early-stop the call count drops
   sharply (only the recent slice per department), but a worst case with `orderUnreliable`
   still pages every department to the cap. Acceptable as a one-time localhost migration
   action (matches the `desk-threads` export precedent); not suitable for a deployed
   serverless timeout. Per-department `try/catch` + the client-side partial download mean a
   long run that dies partway still yields every completed department — but there is **no
   server-side resume**, so a genuinely flaky full pass may need several re-runs (each from
   department 1). Escalate to a checkpointed resume (out of scope above) only if that
   actually happens.
7. **API credits.** ~3 credits/call; the date filter cuts the call count well below the
   full-archive ~150+. Per the docs the per-call cost still rises as `from` goes deeper —
   watch the org's daily API credit budget during the run.

## Compatibility Touchpoints

- No DB migration, no schema change, no new env var (only a scope note on an existing one).
- No packaging / install-surface impact — internal admin migration tooling only.
- No new `server.registerTool` calls → `_docs/mcp-tools.md` unaffected.
- New `_from_zoho/desk-archived-tickets.json` artifact in the migration file set; the
  "Run steps in order" banner is the documentation surface.

## Implementation Notes

### What Changed
- **`src/lib/zoho/desk.ts`** — added `fetchDeskDepartments(token, label)` (paginated
  `GET /api/v1/departments`, 204-aware) and `fetchAllArchivedTicketsForDept(departmentId,
  token, label, { createdAfter })` — the 0–4999-capped paginator from the task sketch:
  `viewType=2`, client-side `createdTime >= createdAfter` filter, newest-first early-stop
  guarded by a runtime descending-order sanity check, `_zoho_department_id` tag on every
  kept row, `{ items, token, truncated, orderUnreliable }` return. Throws on
  `throttleExhausted` / non-OK / network error (caught per-department by the export route,
  not here). Both use `fetchDeskPage` → `fetchZohoWithRetry` so 429 / rolling-throttle /
  401-refresh is inherited.
- **`src/lib/migrate/desk-tickets-import.ts`** (new) — `importDeskTickets(tickets)` lifted
  from the `desk-tickets` import route body verbatim (accounts + paginated contacts/customers
  lookup maps, contact-first / account-name-fallback matching, full `source_meta`,
  `CHUNK_SIZE=50` upsert on `external_id`). Returns `ImportResult & { matched; unmatched }`.
  Also being extended in parallel by task 326 (see Deviations).
- **`src/app/api/admin/zoho-import/desk-tickets/route.ts`** — reduced to auth guard +
  `readFromZoho("desk-tickets.json")` + empty-check + `importDeskTickets(...)`. Response JSON
  shape unchanged.
- **`src/app/api/admin/zoho-import/desk-archived-tickets/route.ts`** (new) — same shape,
  reads `desk-archived-tickets.json`, calls the same helper.
- **`src/app/api/admin/zoho-export/desk-archived-tickets/route.ts`** (new) — SSE `GET`,
  `?createdAfter` (default `2025-01-01T00:00:00.000Z`, `Date.parse`-validated → 400 on
  garbage). Lists departments, then per-department **inside `try/catch`**: `tickets` batch
  event on success, `warning` events for `truncated` / `orderUnreliable`, and on a throw →
  `warning` + push to `failed_departments` + `continue`. `progress` after every department;
  final `done` carries `total_tickets`, `per_department`, `truncated_departments`,
  `failed_departments`, `created_after`. A departments-list failure emits `error` and closes.
- **`src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx`** — `ArchivedTicketsExportState`
  (`progress` incl. running kept count, `warnings[]`, `done` incl. `partial` +
  `failedDepartments` + `truncatedDepartments`, `error`); `handleArchivedTicketsExport()`
  cloned from `handleThreadsExport` with: batches accumulated in a local, `warning` events
  rendered as an amber list, and — if the reader loop ends (cleanly or via a thrown
  `reader.read()`) **without** a `done` event — a `desk-archived-tickets.partial.json`
  download of what completed plus a "re-run to resume (restarts from department 1)" notice.
  New SSE export row + plain import row; `EXPORT_LEVELS` / `IMPORT_LEVELS` entries; "Run
  steps in order" banner updated.
- **`env.example`** — note that `Desk.search.READ` + `Desk.departments.READ` must be on
  `ZOHO_REFRESH_TOKEN` for the archived export.

### Files Changed
- `src/lib/zoho/desk.ts` - new department + archived-ticket paginators
- `src/lib/migrate/desk-tickets-import.ts` - new shared import helper (co-owned with task 326)
- `src/app/api/admin/zoho-import/desk-tickets/route.ts` - slimmed to call the helper
- `src/app/api/admin/zoho-import/desk-archived-tickets/route.ts` - new import route
- `src/app/api/admin/zoho-export/desk-archived-tickets/route.ts` - new SSE export route
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` - export/import rows, handler, state, banner
- `env.example` - scope note

### Deviations From Plan
- **`TicketRow.status` type aligned to the live 4-value enum** (`open | on_hold | escalated
  | closed`) during the extraction, rather than carrying over the route's stale 6-value type.
  Not a behaviour change (`mapTicketStatus` already returns those values at runtime); it
  matches the current `database.ts` and clears a pre-existing `tsc` error at the old route's
  line 268. Response JSON is byte-identical.
- **`source_meta.departmentId` now reads `ticket.departmentId ?? ticket._zoho_department_id
  ?? null`** (task doc's stated intent). Live-ticket output is unchanged — live payloads
  never carry `_zoho_department_id`.
- **Concurrent task 326 edits (now landed).** A parallel session extended
  `importDeskTickets()` / `desk-tickets-import.ts` — writes `ticket_number` (Zoho's real
  `ticketNumber`), `ticket_id` (`TKT-<n>`), `source_meta.status` (raw Zoho status), and
  calls `sync_ticket_number_sequence()` (migration 124) after the upsert loop. Coordinated
  via cross-session message; the file is co-owned and now stable (task 326 in Testing).
  **The archived-tickets import inherits all of this** by calling the same helper — archived
  rows become first-class tickets with a readable `ticket_id`, which is the intended
  outcome. Task 325's export path and the archived route are otherwise unchanged by it.
- **`fetchAllArchivedTicketsForDept` order-check guard** — the sketch did `lastSeen = ts`
  unconditionally; implemented as `if (Number.isFinite(ts)) { …; lastSeen = ts; }` so a
  single unparseable `createdTime` can't poison the descending-order check.
- **`importDeskTickets()` dedupes `rows` by `external_id` before the chunked upsert** (added
  during live import-readiness testing — see Verification Run). Not in the original plan;
  the archived paginator's `from`-boundary overlap made it necessary. Co-owned shared helper,
  peer (task 326) notified; no-op for the live `desk-tickets` path.
- **Not run (needs live Zoho + the added OAuth scope, per Risk 1):** the actual export
  against the real portal, the archived-endpoint sort-order verification, and the import
  round-trip. Fault-isolation and partial-download are exercised by the Verification
  simulation steps but were not run live this session.
- Pre-existing `tsc` errors in `ops-chat-tools.ts` / `list-tickets.ts` / (transiently, from
  task 326's in-flight work) `backfill-inline-images/route.ts` are task-326 enum-migration
  fallout, not touched here. `_zoho-desk-tab.tsx` keeps the file's established `text-[11px]`
  / `text-[13px]` literal-size convention (CLAUDE.md "UI Polish" §: match the hand-rolled
  pattern, don't introduce a second one) — impeccable font-size hints on those lines left
  as-is by that rule.

### Verification Run
- `npx tsc --noEmit` - PASS for all task-325 files (`desk.ts`, `desk-tickets-import.ts`, the
  three routes, `_zoho-desk-tab.tsx` — none appear in the error list). Repo-wide `tsc` still
  reports pre-existing task-326 enum-migration errors in unrelated files + stale `.next`
  route-validator entries; none introduced by this task.
- `npx eslint <the 6 changed src files>` - PASS (exit 0)
- **Live export - PARTIAL PASS.** After regenerating `ZOHO_REFRESH_TOKEN` with
  `Desk.search.READ` + `Desk.departments.READ`, the export ran: 1567 archived tickets
  downloaded (`_from_zoho/desk-archived-tickets.json`), every `createdTime >= 2025-01-01`
  (oldest = #18775, 2025-01-01T15:17:03Z). **2 departments 403'd** ("FlyMyCommunity", "IT
  Specialists Support") with `FORBIDDEN / not authorized` — the token's Desk agent is not a
  member of those departments (a Zoho Desk config gap, not a scope/code issue). Per-department
  fault isolation worked exactly as designed: those 2 landed in `failed_departments` + amber
  warnings, the other departments still exported, and the full 1567-row file downloaded on
  `done` (not a `.partial.json`).
- **Import readiness verified against the live DB (REST probe):** migration 124 is applied
  (`tickets.ticket_id` column, 4-value `status` check, `sync_ticket_number_sequence` RPC all
  present); table holds 541 tickets (live `desk-tickets` import done, max `ticket_number`
  21012), 0 archived rows yet. Against the 1567-row file: **0 `ticket_number` / `ticket_id`
  collisions** with existing rows; 3 archived tickets already exist by `external_id` (upsert
  will update them); `status` is `Closed` on all → maps to `closed`; 0 rows missing
  `id`/`subject`. **Found: 1 exact-duplicate row** (Zoho id `300063000086489002`, #20320) from
  the paginator returning a `from`-boundary row twice → would fail one upsert chunk with "ON
  CONFLICT cannot affect row a second time". **Fixed:** `importDeskTickets()` now dedupes
  `rows` by `external_id` (last wins) before chunking (`dedupedRows`), with a log line;
  benefits the live import too. Shared helper - peer (task 326) notified. tsc + lint re-run
  clean.
- Contact match rate on the file: 299/1567 match a customer via contact; the rest import with
  `customer_id: null` (expected, same as unmatched live tickets — account-name fallback may
  catch a few more of the 538 rows that carry an `accountId`).
- Import round-trip (actually running the archived import) + the archived-endpoint sort-order
  check - still pending the operator's call.
