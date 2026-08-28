# 329: Zoho Desk Ticket Custom-Field (`cf`) Enrichment — Export + Import

**Created:** 2026-08-28
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The Zoho Desk **Additional Information** panel on a ticket shows custom fields — confirmed
examples: **Business Name** (`Quandary Consulting Group`), **Classifications** (`Content`),
**StackShift Site** (`quandarycg-2025-scd7`). None of this data is anywhere in the Hub.

Root cause: `src/app/api/admin/zoho-export/desk-tickets/route.ts` calls
`fetchAllDeskPages("/tickets")`, which hits Zoho Desk's **List Tickets** endpoint. That
endpoint **never returns custom fields** — its `include` param only accepts
`contacts, products, departments, team, isRead, assignee` (verified against
`desk.zoho.com/DeskAPIDocument`). Custom fields (`cf` object) are only returned by
**Get Ticket** (`GET /api/v1/tickets/{ticket_id}`). Confirmed: all 538 rows in the current
`_from_zoho/desk-tickets.json` have no `cf` / `customFields` key, and `category` /
`subCategory` / `priority` are `null` on every row. Nothing in the codebase reads `cf`.

This task adds a per-ticket `GET /tickets/{id}` enrichment pass to the Desk Tickets export
(mirroring the existing `desk-threads` per-ticket SSE export), captures the returned `cf`
object into `_from_zoho/desk-tickets.json`, and persists it on import into
`tickets.source_meta`.

No new OAuth scope: `Desk.tickets.READ` (already granted) covers Get Ticket.

## Requirements

- [ ] Desk Tickets export enriches each ticket with its `cf` object from `GET /tickets/{id}`.
- [ ] Export is resilient: per-ticket `try/catch`, token carried forward across calls,
      `fetchZohoWithRetry` for 429 / rolling-throttle / 401, failed ticket IDs reported,
      partial results still downloadable if the stream dies (match `desk-threads` /
      `desk-archived-tickets` behaviour).
- [ ] Export shows progress (`current / total`, current ticket ID) in the migrate UI.
- [ ] Output `desk-tickets.json` remains a flat array of ticket objects, each with an added
      `cf` key (`{ cf_<slug>: value }`), plus `customFields` if Get Ticket returns it.
      Existing consumers (`importDeskTickets`, `desk-threads` export, `desk-archived-tickets`
      import) keep working unchanged — they only read known flat keys / `id`.
- [ ] `importDeskTickets()` stashes the whole `cf` object verbatim at `source_meta.cf`
      (and `source_meta.customFields` if present).
- [ ] The three known fields are promoted to stable named keys under `source_meta`
      (`businessName`, `classifications`, `stackShiftSite`) via a small slug map that is
      confirmed against a real Get Ticket response during implementation — **do not guess
      the `cf_*` slugs.**
- [ ] `npx tsc --noEmit` and `pnpm lint` pass for all touched files.

## Out of Scope / Must-Not-Change

- **No UI surfacing.** Rendering Business Name / Classifications / StackShift Site on the
  ticket detail page (`src/app/(hub)/desk/tickets/[ticketId]/`) is a follow-up. This task
  only gets the data into `source_meta`.
- **Do not change** the `tickets` table schema — everything lands in the existing
  `source_meta` JSONB. No migration.
- **Do not change** `mapPriority`, `mapTicketStatus`, customer-matching logic, the
  `external_id` upsert key, `CHUNK_SIZE`, or `sync_ticket_number_sequence()` behaviour.
- **Do not change** the archived-tickets export/import (`fetchAllArchivedTicketsForDept`,
  `desk-archived-tickets`) — the archived list endpoint is a separate concern; it can get
  the same treatment later if needed.
- **Do not add** a new OAuth scope. If label→slug mapping via
  `GET /api/v1/organizationFields?module=tickets` would need `Desk.settings.READ` /
  `Desk.fields.READ`, skip it and hardcode the confirmed 3-slug map instead.
- Do not fetch `cf` for accounts/contacts — same API limitation exists there but is not
  requested.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/desk-tickets/route.ts` | Modify | Convert from single JSON `GET` to an SSE stream: list pass (`fetchAllDeskPages("/tickets")`) then per-ticket `GET /tickets/{id}` to attach `cf`. Emit `progress` / `tickets` / `done` events like `desk-threads`. |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | Modify | Add a dedicated `handleDeskTicketsExport()` (SSE reader + blob assembly + progress/failed state), route the `desk-tickets` export button to it instead of the generic `handleExport`. Add a `DeskTicketsExportState` interface + state, and progress/warning render block, copied from the `desk-threads` implementation. Update the `desk-tickets` export `desc` string to mention per-ticket cf enrichment + runtime. |
| `src/lib/migrate/desk-tickets-import.ts` | Modify | Add `cf` / `customFields` to `DeskTicketRaw`; add `source_meta.cf`, `source_meta.customFields`, and promoted `source_meta.businessName` / `classifications` / `stackShiftSite` via a confirmed `CF_SLUGS` map. |

## Code Context

### Export route — current (to be replaced with SSE)

`src/app/api/admin/zoho-export/desk-tickets/route.ts`

```ts
let tickets: Record<string, unknown>[];
try {
  ({ items: tickets } = await fetchAllDeskPages("/tickets", token, "zoho-export/desk-tickets"));
} catch (e) { /* ... */ }
return new NextResponse(JSON.stringify(tickets, null, 2), { /* attachment headers */ });
```

### Pattern to mirror — `desk-threads` per-ticket SSE export

`src/app/api/admin/zoho-export/desk-threads/route.ts` (already in the repo): auth check →
`readFromZoho`? no — for tickets we run the list pass first → `ReadableStream` with
`send(obj)` writing `data: ${JSON.stringify(obj)}\n\n` → `for` loop over tickets,
per-ticket `try/catch`, `token = <carried forward>`, `send({ type: "progress", current, total, ticketId })`,
`send({ type: "tickets", tickets: [enriched] })`, final `send({ type: "done", total, failed_ticket_ids })`.

Per-ticket detail fetch uses `fetchDeskPage`:

```ts
const { res, token: detailToken, throttleExhausted } = await fetchDeskPage(
  `/tickets/${ticketId}`, token, {}, "zoho-export/desk-tickets-detail",
);
token = detailToken;
if (throttleExhausted) throw new Error("rolling throttle exhausted");
if (!res.ok) { failedTicketIds.push(ticketId); /* still emit stub */ }
const detail = (await res.json()) as { cf?: Record<string, unknown>; customFields?: unknown };
const enriched = { ...stub, cf: detail.cf ?? null, ...(detail.customFields ? { customFields: detail.customFields } : {}) };
```

### Client SSE handler pattern to copy

`src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` → `handleThreadsExport()` (lines ~211–278):
`fetch("/api/admin/zoho-export/desk-tickets")` → `res.body.getReader()` → split on `\n\n` →
parse `data: ` frames → accumulate `evt.tickets` → on `done` build a Blob, download as
`desk-tickets.json`, set done state `{ count, failed }`. Generic `handleExport()` (lines
119–139) must **no longer** handle `desk-tickets` — add `desk-tickets` to the same
special-cased rendering branch the other SSE exports use (see the `key === "desk-threads"`
render block near line ~700).

### Import helper

`src/lib/migrate/desk-tickets-import.ts`

```ts
// add to DeskTicketRaw:
cf?: Record<string, unknown> | null;
customFields?: unknown;

// confirmed against a live Get Ticket response during implementation — placeholder slugs:
const CF_SLUGS = {
  businessName: "cf_business_name",
  classifications: "cf_classifications",
  stackShiftSite: "cf_stackshift_site",
} as const;

// inside the row builder, extend source_meta:
cf: ticket.cf ?? null,
customFields: ticket.customFields ?? null,
businessName:    ticket.cf?.[CF_SLUGS.businessName]    ?? null,
classifications: ticket.cf?.[CF_SLUGS.classifications] ?? null,
stackShiftSite:  ticket.cf?.[CF_SLUGS.stackShiftSite]  ?? null,
```

`DeskTicketRaw` already has `[key: string]: unknown`, and `importDeskTickets` is shared with
the `desk-archived-tickets` import — archived rows simply have `ticket.cf === undefined`
(→ `null`), no special handling needed.

## Implementation Steps

1. **Confirm the `cf` slugs.** With a valid Zoho token, `GET /api/v1/tickets/{id}` for one
   ticket known to have the panel populated (e.g. ticket `21012` / the Quandary example).
   Record the exact `cf_*` keys for Business Name / Classifications / StackShift Site and
   whether the response also carries a `customFields` array. Put the real slugs in
   `CF_SLUGS`.
2. **Rewrite the export route** as an SSE stream: keep the auth + `ZOHO_DESK_ORG_ID` guards,
   run `fetchAllDeskPages("/tickets")` for the stub list, then loop stubs calling
   `fetchDeskPage(\`/tickets/${id}\`, token, {}, ...)`, carrying `token` forward, merging
   `cf` (+ `customFields`) onto each stub. Emit `progress` / `tickets` / `done`
   (`total`, `failed_ticket_ids`). On the list pass throwing, emit `{ type: "error", ... }`
   and close.
3. **Client:** add `DeskTicketsExportState`, `handleDeskTicketsExport()` (copy
   `handleThreadsExport`), wire the `desk-tickets` Export button + render branch, remove
   `desk-tickets` from the generic path. Update the `EXPORT_LEVELS` `desc` for `desk-tickets`
   ("All Zoho Desk tickets + per-ticket custom-field enrichment (Business Name,
   Classifications, StackShift Site) via Get Ticket — ~1 call/ticket, several minutes").
4. **Import:** extend `DeskTicketRaw` + `source_meta` in `desk-tickets-import.ts` per Code
   Context. Update the file header comment to note `cf` capture.
5. **Update the import `desc`** in `IMPORT_LEVELS` to mention `source_meta.cf` +
   promoted business name / classifications / stackshift site.
6. `npx tsc --noEmit` && `pnpm lint`.
7. Update `CLAUDE.md` "Key Conventions" — the `tickets` / `source_meta` note — to record
   that `source_meta.cf` (+ `businessName` / `classifications` / `stackShiftSite`) is
   populated from the Desk Tickets export's Get Ticket enrichment pass.

## Acceptance Criteria

- [ ] Running Desk Tickets export in `/admin/migrate` → Desk tab streams progress and
      downloads a `desk-tickets.json` where every ticket object has a `cf` key.
- [ ] For a ticket with the panel populated, `cf` contains the Business Name /
      Classifications / StackShift Site values.
- [ ] Tickets that fail their detail fetch still appear in the file (stub only, `cf: null`)
      and their IDs are listed in the export's "failed" summary.
- [ ] `desk-threads` and `desk-archived-tickets` exports still run (they read
      `desk-tickets.json` for `id` only).
- [ ] After Desk Tickets import, a spot-checked `tickets` row has
      `source_meta.cf`, `source_meta.businessName`, `source_meta.classifications`,
      `source_meta.stackShiftSite` populated; unmatched/archived rows have `source_meta.cf`
      = `null` without error.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual (needs live Zoho token + ZOHO_DESK_ORG_ID):
#  1. /admin/migrate → Desk tab → Export "Desk Tickets"; watch progress, inspect downloaded JSON
#  2. node -e "const t=require('./_from_zoho/desk-tickets.json'); console.log(t.find(x=>x.ticketNumber==='21012')?.cf)"
#  3. Import "Desk Tickets"; query one ticket:
#     select ticket_number, source_meta->'cf', source_meta->>'businessName' from tickets where source_meta ? 'cf' limit 5;
```

## Compatibility Touchpoints

- **Export route contract change:** `GET /api/admin/zoho-export/desk-tickets` goes from
  `application/json` attachment to `text/event-stream`. Only caller is the migrate UI
  (updated here). No other route depends on it.
- **No DB migration**, no schema change, no new env var, no new OAuth scope.
- **Runtime:** ~538 sequential Get Ticket calls (~1 credit each) — same order of magnitude
  as the existing `desk-threads` export. Subject to Zoho's rolling throttle; the export may
  take several minutes and can hit `throttleExhausted` on a bad day (surfaced as a failed
  ticket / error, not a silent skip).
- **Docs:** update `CLAUDE.md` Key Conventions (`source_meta.cf`) and the two `desc`
  strings in `_zoho-desk-tab.tsx`.

## Implementation Notes

### What Changed
- `GET /api/admin/zoho-export/desk-tickets` rewritten from a one-shot JSON attachment into
  an SSE stream: list pass via `fetchAllDeskPages("/tickets")`, then a per-ticket
  `GET /tickets/{id}` (`fetchDeskPage`) that grafts **only** `cf` (+ `customFields` when
  present) onto each list stub — record shape is otherwise byte-identical to the old export,
  so `importDeskTickets`, the `desk-threads` export, and the `desk-archived-tickets` import
  are unaffected. Events: `progress` / `tickets` (one enriched ticket per frame) /
  `done { total, failed_ticket_ids }` / `error`. Per-ticket failures push the ID to
  `failed_ticket_ids` and still emit the stub with `cf: null`; `throttleExhausted` is
  treated as a failure, not a silent skip.
- Migrate UI: new `DeskTicketsExportState` + `deskTicketsExport` state, dedicated
  `handleDeskTicketsExport()` (SSE reader, progress bar, partial-file download on early
  stream end / error — mirrors `handleArchivedTicketsExport`'s resilience), and a
  `key === "desk-tickets"` render branch. The generic `handleExport()` path no longer
  handles `desk-tickets`. Export + import `desc` strings updated.
- `desk-tickets-import.ts`: `DeskTicketRaw` gains `cf` / `customFields`; `source_meta` gains
  `cf` (verbatim), `customFields`, and promoted `businessName` / `classifications` /
  `stackShiftSite`.
- `CLAUDE.md`: new Key Conventions bullet for `tickets.source_meta.cf`.

### Deviations From Plan
- **Slug resolution:** plan step 1 called for confirming the exact `cf_*` slugs against a
  live Get Ticket response and hardcoding a `CF_SLUGS` map. No live Zoho token is available
  in this environment, so instead of a hardcoded map the promotion uses `resolveCfField()` —
  a defensive normalized-name matcher (`normalizeCfKey()` strips the `cf_` prefix + all
  non-alphanumerics + lowercases, then compares against target tokens
  `businessname` / `classifications`|`classification` / `stackshiftsite`). This works
  regardless of the portal's actual slug spelling and needs no live check. `source_meta.cf`
  always carries the full object verbatim, so nothing is lost if a promotion misses.
  **Still worth a live sanity check** (task doc Verification step 2/3) once a token is
  available — confirm the three fields land in `source_meta.businessName` etc.
- **Export route contract:** as planned, the route is now `text/event-stream`. No
  `maxDuration` / `runtime` export added — matches the existing `desk-threads` /
  `desk-archived-tickets` routes, which run the same per-ticket-count loop with no override.

### Files Changed
- `src/app/api/admin/zoho-export/desk-tickets/route.ts` — SSE per-ticket `cf` enrichment.
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` — SSE export handler + state + render
  branch + `desc` copy.
- `src/lib/migrate/desk-tickets-import.ts` — `cf` types, `resolveCfField()`, `source_meta`
  additions, header comment.
- `CLAUDE.md` — `tickets.source_meta.cf` convention bullet.

### Post-Testing Correction (live data)
- Ran a real export + import. The `cf` verbatim capture and the per-ticket enrichment work.
- The live portal has **only three ticket custom fields**: `cf_white_label` (289 tickets
  populated), `cf_stack_shift_site` (224), `cf_service_type` (0 — exists on the layout,
  never filled). There is **no `cf_business_name` / `cf_classifications`** anywhere — the
  original screenshot that named "Business Name / Classifications" was a different
  layout/portal not represented in this export.
- `CF_TARGETS` corrected to `{ whiteLabel, stackShiftSite }`; `source_meta` promotions are
  now `whiteLabel` + `stackShiftSite` (dropped `businessName` / `classifications` — no such
  fields exist in the portal). `cf_white_label` actually holds the client/business name
  (e.g. "Quandary Consulting Group"); the `source_meta` key stays `whiteLabel` (mirrors the
  Zoho slug) but the ticket UI shows it under the label **"Business Name"** (task 330).
  `cf_service_type` left unpromoted (0 populated) — still captured verbatim in
  `source_meta.cf` if it ever gets used. Export/import `desc` strings + CLAUDE.md bullet
  updated to match. **Re-run the Desk Tickets import only** (no re-export) to backfill the
  promoted keys.
- `normalized-name` match confirmed working: `cf_stack_shift_site` → `stackshiftsite` ✓,
  `cf_white_label` → `whitelabel` ✓.

### Verification Run
- `npx tsc --noEmit` — PASS (clean).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file
  `projects/v2/[projectId]/onboarding-workspace/_checklist-tab.tsx`).
- impeccable design hook flagged ~37 `design-system-font-size` findings on
  `_zoho-desk-tab.tsx` (`text-[11px]` / `text-[12px]` / `text-[13px]`). Left unchanged:
  these are the file's pervasive pre-existing convention and CLAUDE.md's "UI Polish
  Conventions" explicitly directs matching the hub's hand-rolled `text-[10-11px]` pattern
  for visual consistency with neighbouring UI; the new code copies the sibling
  `desk-threads` block verbatim. Not suppressed via ignore comments.
- Live Zoho export + import round-trip NOT run — needs a real Zoho token + `ZOHO_DESK_ORG_ID`
  + portal data. See Deviations re: slug confirmation.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Route** (`zoho-export/desk-tickets/route.ts`): clean. Auth gate (admin/super_admin),
  env guard, token carried forward across `fetchAllDeskPages` + every `fetchDeskPage`,
  `throttleExhausted` treated as failure (not silent skip), per-ticket `try/catch` still
  emits the stub with `cf: null`. Event vocabulary + `console.log` give-up line match the
  sibling `desk-threads` route exactly. No dead code, no secrets.
- **Import** (`desk-tickets-import.ts`): `resolveCfField()` returns `unknown` — correct, not
  an `any` escape hatch; `cf` values are genuinely heterogeneous and `source_meta` is
  `Record<string, unknown>`. `CF_TARGETS` `as const` + `readonly string[]` param typecheck
  cleanly. Guard-clause style, single responsibility. `normalizeCfKey` regex
  `/[^a-z0-9]/gi` is subtle (the `i` on a negated class preserves uppercase, then
  `.toLowerCase()`) but correct — a plain `/[^a-zA-Z0-9]/g` would read clearer (Minor, not
  blocking).
- **Client** (`_zoho-desk-tab.tsx`): `handleDeskTicketsExport` is a 4th near-duplicate of
  the file's per-export SSE handlers. This is the file's established (pre-task) pattern —
  extracting a shared SSE reader would touch 3 other working handlers and is out of scope
  here. New render branch + state copy the `desk-threads` block. Progress-bar division
  isn't `Math.max(total,1)`-guarded, matching the `desk-threads` branch (not
  `handleArchivedTicketsExport`); harmless `NaN%` width on a 0-ticket portal.
- impeccable `design-system-font-size` findings (`text-[NNpx]`) left unchanged — the file's
  pervasive pre-existing convention, explicitly endorsed by CLAUDE.md "UI Polish
  Conventions"; new markup copies the sibling block. Not silenced with ignore comments.
- No blocking issues.

### Deviations
- **Medium — slug promotion strategy.** Plan step 1 called for confirming the exact `cf_*`
  slugs against a live Get Ticket response and hardcoding a `CF_SLUGS` map. No live Zoho
  token is available in this environment, so promotion instead uses `resolveCfField()`, a
  defensive normalized-field-name matcher. This satisfies the requirement's intent ("do not
  guess the `cf_*` slugs" — it doesn't; it matches on the human field label) and is more
  robust to portal renames. The full `cf` object is always stored verbatim at
  `source_meta.cf`, so a missed promotion loses nothing. Risk acceptable. A live sanity
  check that the three fields land in `source_meta.businessName` / `.classifications` /
  `.stackShiftSite` is still owed (task doc Verification 2–3).
- **Minor — export route contract.** `GET /api/admin/zoho-export/desk-tickets` is now
  `text/event-stream` instead of a JSON attachment. Planned and expected; sole caller (the
  migrate UI) updated in the same change. No `maxDuration`/`runtime` override added —
  matches the existing `desk-threads` / `desk-archived-tickets` routes.
- **Minor — handler duplication** as noted above; follows existing file convention.

### Required Fixes
- None.
