# 334: Archived Desk Tickets — Custom-Field (`cf`) Enrichment Parity with Live Tickets

**Created:** 2026-08-28
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Completed (2026-08-28)

---

## Overview

Task 329 taught the **live** `desk-tickets` export to graft each ticket's custom-field
object (`cf`) onto its record via a per-ticket `GET /api/v1/tickets/{id}` (Get Ticket) call —
Zoho's *list* endpoints never return custom fields. `importDeskTickets()` then stashes
`source_meta.cf` verbatim and promotes `whiteLabel` (shown in the ticket UI as **"Business
Name"**, task 330) and `stackShiftSite` to named `source_meta` keys.

**Task 325's archived-ticket export never got that enrichment pass.** It uses
`GET /api/v1/tickets/archivedTickets` (a list endpoint, `viewType=2`) and stops there.
Verified against the live export:

```
_from_zoho/desk-archived-tickets.json — 1,567 rows
  rows with a "cf" key:        0
  rows with "customFields":     0
```

So all ~1,566 imported archived tickets have `source_meta.cf`, `source_meta.whiteLabel`,
and `source_meta.stackShiftSite` = `null`. CLAUDE.md already records the gap ("Archived-ticket
rows have no `cf` → these are `null`"). The ticket detail page (task 330) shows "Business
Name" / "StackShift Site" as `-` for every archived ticket.

### "Classification" is not a custom field

The live portal has exactly three ticket custom fields — `cf_white_label`,
`cf_stack_shift_site`, `cf_service_type` (unused, 0 populated). There is **no
`cf_classifications`**. The standard **Category / Sub-Category** fields are already in the
archived export (`category`, `subCategory` on all 1,567 rows) and already imported. So the
only real gap is **Business Name (`whiteLabel`) + StackShift Site (`stackShiftSite`)**.

### Two parts

1. **Backfill the ~1,566 archived tickets already in the DB** — a one-shot admin route that
   reads each archived `tickets` row, calls `GET /tickets/{external_id}`, patches
   `source_meta.cf` (+ `customFields`) and re-runs the `whiteLabel` / `stackShiftSite`
   promotion in place. No re-export / re-import of the whole archive. Modelled on task 322's
   `backfill-inline-images` route (admin-only, `?dryRun`, `?limit`, `?ticketNumber`, bounded,
   re-runnable).
2. **Fold the enrichment into the `desk-archived-tickets` export** so future archived exports
   carry `cf` — extract task 329's per-ticket Get-Ticket loop into a shared
   `enrichTicketsWithCf()` helper and call it from both the live and archived export routes.

### Unknown to confirm first

Does `GET /api/v1/tickets/{archivedId}` (Get Ticket) return `cf` for an **archived** ticket?
Very likely — `/tickets/{id}/threads` and `/comments` both work for archived ids (task 332).
**The probe is just `POST /api/admin/desk/backfill-archived-ticket-cf?dryRun=1&limit=1`** —
it reports the `cf` payload it got back without writing anything. No separate probe route.

## Requirements

- [ ] **Extract `resolveCfField()` + `CF_TARGETS` + `normalizeCfKey()`** from
      `src/lib/migrate/desk-tickets-import.ts` into a small shared module
      `src/lib/migrate/desk-cf.ts` (or export them from the import module). `importDeskTickets()`
      keeps working unchanged; the backfill route reuses the exact same promotion logic.
- [ ] **Extract task 329's per-ticket enrichment loop** into
      `enrichTicketsWithCf(stubs, token, label, { onEnriched, onProgress })` in
      `src/lib/zoho/desk.ts` — Get Ticket per stub, `{ ...stub, cf: detail.cf ?? null }`
      (+ `customFields` when present), per-ticket `try/catch` → `failedTicketIds` + `cf: null`
      on failure, returns `{ token, failedTicketIds }`. Route owns SSE framing.
- [ ] **Repoint `zoho-export/desk-tickets/route.ts`** at `enrichTicketsWithCf()` — output
      byte-identical (same `progress` / `tickets` / `done` frames, same `{ ...stub, cf }`
      shape, same `failed_ticket_ids`).
- [ ] **Add the enrichment pass to `zoho-export/desk-archived-tickets/route.ts`** — after the
      per-department archived list is assembled, run it through `enrichTicketsWithCf()` before
      the `tickets` SSE batch (or per-department). Preserve every existing frame
      (`warning` / `failed_departments` / `truncated_departments` / `per_department` /
      `created_after`) and add `failed_ticket_ids` to the `done` event.
- [ ] **New backfill route** `POST /api/admin/desk/backfill-archived-ticket-cf`:
  - [ ] admin / super_admin gated (same guard as sibling routes),
  - [ ] `?dryRun=1` (report only, write nothing — this is also the probe), `?limit=N`
        (default e.g. 50), `?ticketNumber=N` (single ticket), `?force=1` (re-fetch even rows
        that already have `source_meta.cf`),
  - [ ] paginated (`.range()`, 1000-row pages) scan of `tickets` where
        `source_meta->>'isArchived' = 'true'` **and** (unless `force`) `source_meta->'cf'
        IS NULL` — so it is idempotent and resumable across calls,
  - [ ] per row: `GET /tickets/{external_id}` via `fetchDeskPage(..., "backfill-archived-cf")`
        (inherits `fetchZohoWithRetry` 429 / rolling-throttle / 401), on success patch
        `source_meta = { ...existing, cf, customFields, whiteLabel: resolveCfField(cf, …),
        stackShiftSite: resolveCfField(cf, …) }` and `UPDATE` the row; on non-OK / throttle
        exhausted → record in a `failed` list and continue,
  - [ ] a small inter-call `sleep` (mirror `attachment-meta`'s ~700 ms) to stay under Zoho's
        rolling limit,
  - [ ] returns `{ scanned, updated, skipped, failed: [{ ticketNumber, reason }], dryRun }`
        (JSON, or SSE with `progress` if a run is long — match whichever the reviewer
        prefers; `attachment-meta` uses SSE, `backfill-inline-images` uses JSON).
- [ ] **`_zoho-desk-tab.tsx`** — a "Backfill Archived Ticket Custom Fields" action row in the
      Import phase (or a small dedicated section like "Verify Attachment"), calling the
      backfill route; show `scanned / updated / failed`. Update `EXPORT_LEVELS` desc for
      `desk-archived-tickets` to mention it now enriches `cf`. Update the "Run steps in order"
      banner.
- [ ] **Stale-file note.** `_from_zoho/desk-archived-tickets.json` on disk has no `cf`.
      Document (banner + task doc) that a future archived **re-import from that file would
      re-null `source_meta.cf`** — so after this task the operator must either re-run the
      (now-enriched) archived export to refresh the file, or not re-import it. Consider (see
      Open Questions) making `importDeskTickets()` preserve an existing `source_meta.cf` when
      the incoming row has none.
- [ ] `npx tsc --noEmit` + `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- **The `cf` capture / promotion logic itself** (task 329) — reused verbatim, not re-designed.
  `CF_TARGETS` stays `{ whiteLabel, stackShiftSite }`.
- **Standard fields already in the archived export** (`category`, `subCategory`, `priority`,
  `status`, …) — untouched, already imported.
- **`tickets` / `ticket_messages` schema** — no migration. `source_meta` is jsonb.
- **The live `desk-tickets` export/import output** — only refactored to share
  `enrichTicketsWithCf()`; frames + record shape byte-identical.
- **Archived threads / comments / attachments** (task 332) — done, untouched.
- **Re-running the whole archived ticket export+import as the fix** — rejected in favour of
  the in-place backfill for the rows already loaded; the export change is only so *future*
  runs stay correct.
- **Pre-2025 archived tickets** — still out of scope (never imported).
- **A `cf_service_type` promotion** — 0 populated, no value.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/migrate/desk-cf.ts` | Create | `resolveCfField()`, `normalizeCfKey()`, `CF_TARGETS` moved here and exported; one home for the promotion logic. |
| `src/lib/migrate/desk-tickets-import.ts` | Modify | Import the three from `desk-cf.ts` instead of defining them inline. No behaviour change. |
| `src/lib/zoho/desk.ts` | Modify | Add `enrichTicketsWithCf(stubs, token, label, cb)` — task 329's Get-Ticket loop, parameterised. |
| `src/app/api/admin/zoho-export/desk-tickets/route.ts` | Modify | Delegate the enrichment pass to `enrichTicketsWithCf()`. Output identical. |
| `src/app/api/admin/zoho-export/desk-archived-tickets/route.ts` | Modify | Run the assembled archived list through `enrichTicketsWithCf()` before the `tickets` batch; add `failed_ticket_ids` to `done`. |
| `src/app/api/admin/desk/backfill-archived-ticket-cf/route.ts` | Create | One-shot admin backfill for the ~1,566 archived rows already in `tickets`. `?dryRun` / `?limit` / `?ticketNumber` / `?force`. |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | Modify | Backfill action row + handler; `desk-archived-tickets` export desc + banner update. |
| `env.example` | Modify (maybe) | Only if a scope note is needed — Get Ticket uses `Desk.tickets.READ`, already granted, so likely no change. |

## Code Context

### `src/app/api/admin/zoho-export/desk-tickets/route.ts` — the loop to extract (task 329)

Lines ~52–101: list pass via `fetchAllDeskPages("/tickets", …)`, then per stub
`fetchDeskPage(\`/tickets/${ticketId}\`, token, {}, "zoho-export/desk-tickets-detail")` →
`{ ...stub, cf: detail.cf ?? null }` (+ `customFields` if `detail.customFields != null`),
per-ticket `try/catch` → `failedTicketIds.push` + emit `{ ...stub, cf: null }`, `send("progress")`
+ `send("tickets", [enriched])`, final `send("done", { total, failed_ticket_ids })`.
`enrichTicketsWithCf()` is this, parameterised on the stub list + `onEnriched`/`onProgress`.

### `src/lib/migrate/desk-tickets-import.ts` — promotion logic to share

```ts
const CF_TARGETS = { whiteLabel: ["whitelabel"], stackShiftSite: ["stackshiftsite"] } as const;
function normalizeCfKey(key: string): string {
  return key.replace(/^cf_/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}
function resolveCfField(cf, targets) {
  if (!cf) return null;
  for (const [key, value] of Object.entries(cf)) {
    if (value == null || value === "") continue;
    if (targets.includes(normalizeCfKey(key))) return value;
  }
  return null;
}
// used at import time:
source_meta: {
  ...
  cf: ticket.cf ?? null,
  customFields: ticket.customFields ?? null,
  whiteLabel: resolveCfField(ticket.cf, CF_TARGETS.whiteLabel),
  stackShiftSite: resolveCfField(ticket.cf, CF_TARGETS.stackShiftSite),
}
```

The backfill route builds the same four keys and merges them into the existing `source_meta`.

### `src/app/api/admin/desk/backfill-inline-images/route.ts` — backfill route pattern (task 322)

Admin-only `POST`, `PAGE = 1000` paginated candidate scan, `?dryRun` / `?limit` /
`?ticketNumber`, `SCAN_CAP` hard ceiling, per-row work wrapped so one failure doesn't abort,
returns a JSON summary. Mirror this shape.

### `src/app/api/admin/zoho-export/attachment-meta/route.ts` — throttle pacing

`await sleep(700)` between per-entity Zoho calls "to stay under Zoho's 200 req/2 min rolling
limit". Use the same cadence in the backfill.

### Archived ticket row shape (already imported)

`tickets` rows: `external_id` = Zoho ticket id, `source_meta.isArchived = true`,
`source_meta.cf` currently absent. `source_meta` is jsonb — patch by read-modify-write of the
whole object (Supabase has no partial jsonb merge in the JS client; fetch `source_meta`,
spread, update).

## Implementation Steps

1. **`desk-cf.ts`:** move `resolveCfField` / `normalizeCfKey` / `CF_TARGETS` out of
   `desk-tickets-import.ts`, export them, re-import in the import module. `tsc` + confirm the
   `desk-tickets` import response is unchanged.
2. **`desk.ts`:** add `enrichTicketsWithCf(stubs, token, label, { onEnriched, onProgress })`
   from task 329's loop.
3. **Repoint `zoho-export/desk-tickets`** at it; spot-check the SSE frames are identical.
4. **`zoho-export/desk-archived-tickets`:** after the department loop assembles the list (or
   per department), pass it through `enrichTicketsWithCf()`; forward `cf`-bearing rows in the
   `tickets` batch; add `failed_ticket_ids` to `done`. Keep every existing frame.
5. **Backfill route** `admin/desk/backfill-archived-ticket-cf`: auth guard → parse
   `dryRun` / `limit` / `ticketNumber` / `force` → paginated scan of archived `tickets`
   (filter on `source_meta->>'isArchived'` and, unless `force`, `source_meta->'cf' is null`)
   → per row `GET /tickets/{external_id}` → on success merge `{ cf, customFields, whiteLabel,
   stackShiftSite }` into `source_meta` and `update`; on failure record + continue → `sleep`
   → return `{ scanned, updated, skipped, failed, dryRun }`.
6. **`_zoho-desk-tab.tsx`:** backfill action row + handler; export desc + banner copy.
7. **Probe:** `POST …/backfill-archived-ticket-cf?dryRun=1&limit=1` → confirm `cf` comes back
   for an archived id. Then `?dryRun=1&limit=1&ticketNumber=<one known to have a white label>`.
8. `npx tsc --noEmit` + `pnpm lint`. Browser-test on `/admin/migrate`.
9. **Live run (operator):** dry-run → small `?limit` run → full run; then spot-check archived
   tickets on the detail page show Business Name / StackShift Site; re-run to confirm
   idempotency (0 updated the second time).

## Acceptance Criteria

- [ ] `POST …/backfill-archived-ticket-cf?dryRun=1&limit=1` returns the `cf` object Zoho gave
      for an archived ticket (probe passes) and writes nothing.
- [ ] A full backfill run sets `source_meta.cf` (+ `customFields`, `whiteLabel`,
      `stackShiftSite`) on every archived `tickets` row whose Get Ticket call succeeded;
      `failed` lists any that didn't, and re-running clears those without re-touching the rest.
- [ ] Re-running the backfill with no `?force` reports `updated: 0` (idempotent — the
      `cf IS NULL` filter excludes already-done rows).
- [ ] An archived ticket with a white label now shows **Business Name** (and **StackShift
      Site** where set) on `/desk/tickets/[ticketId]` instead of `-`.
- [ ] `source_meta` for a backfilled row keeps all its existing keys (isArchived, departmentId,
      status, ticketNumber, …) — only the four cf keys are added/updated.
- [ ] The `desk-archived-tickets` export now emits `cf` on each ticket (spot-check a fresh
      `desk-archived-tickets.json`), and its `done` event carries `failed_ticket_ids`.
- [ ] The live `desk-tickets` export produces byte-identical output to before the
      `enrichTicketsWithCf()` extraction.
- [ ] `importDeskTickets()` response + behaviour unchanged by the `desk-cf.ts` move.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then, as an admin user:
```

- `curl -X POST '.../api/admin/desk/backfill-archived-ticket-cf?dryRun=1&limit=1'` (admin
  cookie) → inspect the returned `cf`.
- `?dryRun=1&limit=25` → sanity-check the would-update count and a few `whiteLabel` values.
- Drop `dryRun`, run `?limit=100`, then unbounded. Watch the `failed` list.
- Supabase: `select count(*) from tickets where source_meta->>'isArchived'='true' and
  source_meta->'cf' is not null;` climbs to ~1,566.
- `select source_meta->>'whiteLabel' wl, count(*) from tickets where
  source_meta->>'isArchived'='true' group by 1 order by 2 desc;` — non-null bucket appears.
- Open 3–4 archived tickets known to have a white label → detail page shows Business Name.
- Re-run the backfill → `updated: 0`.
- Regression: run the live **Desk Tickets** export + import → unchanged. Run a fresh
  **Desk Archived Tickets** export → the file now has `cf` on every row.

## Open Questions / Risks

1. **Does Get Ticket serve `cf` for archived ids?** Unverified but very likely (threads /
   comments do). The `?dryRun=1&limit=1` call is the probe — first implementation-time check.
   If it 404s or returns `cf: null` for tickets that *should* have one, escalate: the archive
   may expose custom fields only through the Bulk Export API.
2. **Stale `_from_zoho/desk-archived-tickets.json`.** It has no `cf`. If someone re-runs the
   archived **import** from that file *after* the backfill, `importDeskTickets()` overwrites
   `source_meta` wholesale and re-nulls `cf`. Mitigations, pick one with the reviewer:
   (a) doc + banner: re-run the now-enriched export before any re-import;
   (b) delete the stale file as part of this task;
   (c) make `importDeskTickets()` keep an existing `source_meta.cf` when the incoming row has
   none (most robust, but changes shared-helper semantics — needs its own care).
3. **~1,566 Get Ticket calls, ~3 credits each** (task 325 credit note) + ~700 ms pacing ≈
   18–20 min wall-clock. Bounded, re-runnable, `?limit` lets the operator chunk it. Same
   class as task 325's export and task 332's conversation export. Not for a serverless
   timeout — localhost migration action.
4. **How many archived tickets actually have a white label?** Live: `cf_white_label` 289 /
   `cf_stack_shift_site` 224. Archived are older/different tickets — the populated count may
   be small. That's fine; the backfill sets `cf: {}` / resolves to `null` for the rest and
   still marks them done (so re-runs skip them). Decide: store `cf: {}` vs a sentinel so the
   `cf IS NULL` idempotency filter still works — **store the real (possibly empty) object;
   `{} IS NOT NULL` in Postgres, so the filter holds.**
5. **jsonb read-modify-write races.** The backfill is the only writer of archived-ticket
   `source_meta` during a run; no live process touches archived rows. Low risk. If paranoid,
   select `source_meta` immediately before each update.
6. **`enrichTicketsWithCf` for the archived export lengthens an already-long run.** Acceptable
   (localhost, one-time) and the operator can still run the backfill instead if they don't
   want to re-export. Both paths converge on the same `source_meta` shape.

## Compatibility Touchpoints

- No DB migration, no new env var (Get Ticket uses the already-granted `Desk.tickets.READ`).
- No new `server.registerTool` calls → `_docs/mcp-tools.md` unaffected.
- Shared-helper touches: `enrichTicketsWithCf` (live + archived export), `desk-cf.ts` move
  (import helper) — both must keep existing output identical (regression steps above).
- New `POST /api/admin/desk/backfill-archived-ticket-cf` route — internal admin tooling,
  no packaging / install-surface impact.
- CLAUDE.md line "Archived-ticket rows have no `cf` → these are `null`" becomes stale — update
  it in this task (archived rows now carry `cf` via the enriched export + the backfill).

## Implementation Notes

### What Changed

Three parts, all landed. The backfill route (part 1) is the fix for the ~1,566 rows already
in the DB; parts 2–3 keep future archived exports correct.

- **`src/lib/migrate/desk-cf.ts`** (new) — `CF_TARGETS`, `normalizeCfKey()`, `resolveCfField()`
  moved out of `desk-tickets-import.ts` and exported. One home for the cf-promotion logic,
  now shared by the import and the backfill route.
- **`src/lib/migrate/desk-tickets-import.ts`** — the three defs replaced with an import from
  `@/lib/migrate/desk-cf`. No behaviour change (same `CF_TARGETS`, same `resolveCfField`).
- **`src/lib/zoho/desk.ts`** — new `enrichTicketsWithCf(stubs, token, label, cb?)`: task 329's
  per-ticket `GET /tickets/{id}` loop, parameterised. Returns `{ token, enriched[], failedTicketIds }`
  **and** fires optional `onEnriched` / `onProgress` callbacks. Per-ticket fault isolation
  (row still emitted as `{ ...stub, cf: null }`, id recorded, loop continues, token carries
  forward) — identical to the inline version.
- **`src/app/api/admin/zoho-export/desk-tickets/route.ts`** — the inline enrichment loop
  replaced by `enrichTicketsWithCf(stubs, token, "zoho-export/desk-tickets", { onEnriched:
  ticket => send({type:"tickets", tickets:[ticket]}), onProgress: … })`. SSE frames + record
  shape + `done` payload byte-identical (verified against the pre-change source line-by-line).
- **`src/app/api/admin/zoho-export/desk-archived-tickets/route.ts`** — after each department's
  archived list is fetched, it's run through `enrichTicketsWithCf(items, token, LABEL)` (no
  callbacks — uses the returned `enriched` array) before the `tickets` batch. Per-ticket Get
  Ticket failures accumulate into a new `cf_failed_ticket_ids` array on the `done` event.
  Every existing frame (`warning` / `failed_departments` / `truncated_departments` /
  `per_department` / `created_after`) unchanged. Roughly doubles the run's Zoho calls.
- **`src/app/api/admin/desk/backfill-archived-ticket-cf/route.ts`** (new) — admin-gated SSE
  `POST`. `?dryRun` (also the probe), `?limit`, `?ticketNumber`, `?force`. Paginated scan of
  `tickets` where `source_meta->>isArchived.eq.true` (the same PostgREST predicate the Desk
  Tickets list view uses), `cf` presence filtered in JS (idempotent — skips rows that already
  have `source_meta.cf` unless `?force`). Per row: `GET /tickets/{external_id}`, merge
  `{ ...existing source_meta, cf, customFields, whiteLabel, stackShiftSite }`, `UPDATE`.
  700 ms inter-call pacing (matches `attachment-meta`). Streams `progress` (current / total /
  updated / failed) and a final `done` (`scanned`, `updated`, `dryRun`, `failed: [{ticketNumber, reason}]`).
- **`src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx`** — new "Backfill Archived Ticket Custom
  Fields" `SectionCard` (dry-run checkbox default ON, progress bar, `updated / failed`
  summary, SSE handler `handleArchivedCfBackfill`). `desk-archived-tickets` export desc + the
  "Run steps in order" banner updated.
- **CLAUDE.md** — the `tickets.source_meta.cf` bullet rewritten: `resolveCfField`/`CF_TARGETS`
  now in `desk-cf.ts`; archived tickets get `cf` via `enrichTicketsWithCf()` + the backfill;
  the re-import re-null caveat noted.

### Files Changed
- `src/lib/migrate/desk-cf.ts` - new shared cf-promotion module
- `src/lib/migrate/desk-tickets-import.ts` - import `CF_TARGETS`/`resolveCfField` from desk-cf
- `src/lib/zoho/desk.ts` - new `enrichTicketsWithCf()` helper
- `src/app/api/admin/zoho-export/desk-tickets/route.ts` - delegate enrichment to the helper
- `src/app/api/admin/zoho-export/desk-archived-tickets/route.ts` - enrich each department's tickets; `cf_failed_ticket_ids` on done
- `src/app/api/admin/desk/backfill-archived-ticket-cf/route.ts` - new backfill route
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` - backfill card + handler, export desc, banner
- `CLAUDE.md` - refreshed the `source_meta.cf` bullet

### Deviations From Plan
- **Archived export enriches per-department, not in one pass after the loop.** Simpler and
  keeps the existing department-level progress bar meaningful (each department step just takes
  longer); no new `enrich_progress` event, no client-progress change. `cf_failed_ticket_ids`
  (not `failed_ticket_ids`) on `done` to avoid colliding with the conversation exports' key
  name in the shared client handler.
- **`enrichTicketsWithCf` callbacks are optional** (`cb?`), and it returns the `enriched`
  array in addition to firing callbacks — so the live route streams per-ticket via callbacks
  while the archived route just takes the array. The plan implied callbacks-only.
- **Candidate scan filters `cf` presence in JS, not via a `source_meta->'cf' is null`
  PostgREST predicate** (Open Questions §4 flagged the choice). There are only ~1,566 archived
  rows; fetching them paginated and checking `"cf" in source_meta` in JS is robust and avoids
  a JSON-path `is null` predicate. `?force` bypasses the skip.
- **Backfill is SSE, not JSON.** A ~1,566-call run at 700 ms pacing is ~18 min — too long for
  a single JSON response to hang on. Matches `attachment-meta` / the archived exports.
- **`desk-cf.ts` also exports `normalizeCfKey`** (not strictly needed outside) — kept exported
  for symmetry / testability; it's a pure helper.
- **CLAUDE.md updated now** (plan said "in this task" — done here rather than at document stage)
  since it's a factual correction, not doc polish.

### Verification Run
- `npx tsc --noEmit` — PASS (exit 0, repo-wide)
- `npx eslint <8 changed/new files>` — PASS (exit 0)
- **Probe (`?dryRun=1&limit=1`)** — NOT RUN (needs live Zoho). This is the gating check: does
  `GET /tickets/{archivedId}` return `cf`? Very likely (threads/comments do — task 332). If it
  doesn't, Open Questions §1 fallbacks apply.
- **Live backfill run + archived-export re-run + browser check** — NOT RUN (needs live Zoho).
- **Live regression** (live `desk-tickets` export byte-identical, `importDeskTickets` response
  unchanged) — code-level review done (enrichment loop extraction is faithful; `desk-cf.ts`
  move is a pure relocation); live diff NOT RUN.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Extraction is faithful.** `git diff` of `zoho-export/desk-tickets` vs `enrichTicketsWithCf`
  reviewed line-by-line: empty-ticketId path, success path (`{ ...stub, cf }` + optional
  `customFields`), `!res.ok` path, `throttleExhausted` throw, catch path, `progress`-then-
  `tickets` ordering, and the `done` payload (`total`, `failed_ticket_ids`) are all preserved.
  Only diff: the per-ticket "Giving up" `console.log` prefix is now `[<label>]`
  (`[zoho-export/desk-tickets]`) instead of `[desk-tickets]` — logging only, documented.
- **`desk-cf.ts` move is a pure relocation** — `CF_TARGETS` / `resolveCfField` byte-identical;
  `importDeskTickets` imports them and its `source_meta` build is untouched.
- **Archived export change is additive** — `enrichTicketsWithCf` preserves array length (one
  row per stub, failures included), so `totalKept` / `perDepartment` semantics are unchanged;
  `warning` / `failed_departments` / `truncated_departments` frames untouched;
  `cf_failed_ticket_ids` is a new `done` key.
- **Backfill route** — typed (`ArchivedTicketRow`), guard clauses, intentional error handling
  (per-row `try/catch` → `failed[]` + continue), no `any`. Bad `?limit` / `?ticketNumber`
  input handled (falls back to unlimited / 400). Idempotent: `hasCf` JS check skips rows that
  already have `source_meta.cf` (incl. `{}`, since `{} != null`), `?force` bypasses.
  `console.log` on failure matches the sibling dev-only-migration-route convention
  (`backfill-inline-images`, `attachment-meta`).
- **Tab card** reuses the file's established `text-[11px]` / `text-[12px]` classes and the
  `style={{ width }}` progress-bar pattern (every progress bar in the file does this).
  impeccable's literal-font-size findings are pre-existing and file-wide — same disposition
  as tasks 325 / 329 / 330 / 331 / 332.

### Deviations
- **Minor — per-department enrichment** in the archived export (not one pass after the
  department loop). Keeps the department progress bar meaningful; no new client event.
- **Minor — `cf_failed_ticket_ids`** (not `failed_ticket_ids`) on the archived `done` event,
  to avoid colliding with the conversation exports' key in the shared client handler.
- **Minor — `enrichTicketsWithCf` returns `enriched[]` and has optional callbacks** (plan
  implied callbacks-only). Live route streams via callbacks; archived route takes the array.
  Small memory cost on the live route (~538 rows retained until return) — negligible.
- **Minor — candidate `cf`-presence filtered in JS**, not via a PostgREST `source_meta->'cf'
  is null` predicate (Open Questions §4). ~1,566 archived rows; robust, `?force` overrides.
- **Minor — backfill is SSE, not JSON** — a ~1,566-call / ~18-min run can't hang one JSON
  response. Matches `attachment-meta` / the archived exports.
- **Minor — `desk-cf.ts` exports `normalizeCfKey`** which nothing imports (it's only used
  internally by `resolveCfField`). Harmless wider surface; could drop the `export`. Not
  fixed — kept for symmetry/testability per Implementation Notes.
- **Minor — CLAUDE.md updated now** rather than at document stage (factual correction).
- **Medium — backfill patches `source_meta` from the value read at scan time**, not
  re-selected immediately before each `UPDATE`. The scan collects all candidates up front;
  the run is ~18 min. Safe for archived tickets (closed, historical, no live writer) and the
  tab's `anyRunning` guard blocks a concurrent archived import from the same UI — but a
  direct concurrent write to an archived row's `source_meta` during a run would be clobbered.
  Documented in Open Questions §5; acceptable for the archived-ticket use case. If a future
  run needs to be safe against concurrent writers, re-select `source_meta` per row before the
  update (one extra query/row).
- **Medium (runtime) — the archived export's Zoho call count roughly doubles** (list +
  Get Ticket per ticket) → ~35–40 min localhost run. The backfill route is the recommended
  path for the rows already imported; the export enrichment is only so *future* archived
  exports carry `cf`. Documented in Open Questions §3 / §6 and the export row's UI desc.

### Required Fixes
- None.

## Completion Note

**Completed 2026-08-28.** The operator ran the backfill via the `/admin/migrate` → Zoho Desk
tab → **Backfill Archived Ticket Custom Fields** card (dry-run first, then the real run). The
probe succeeded — `GET /tickets/{id}` returns `cf` for archived ticket ids with the existing
`Desk.tickets.READ` scope — so Open Questions §1's fallback was not needed. Archived tickets
now surface Business Name / StackShift Site on `/desk/tickets/[ticketId]` the same as live
tickets.

### Verified
- `npx tsc --noEmit` + `pnpm lint` — PASS
- Backfill probe (dry run) — Zoho serves `cf` for archived ids
- Backfill real run — completed via the migrate-tab card; archived `tickets` rows patched in
  place (`source_meta.cf` + `whiteLabel` / `stackShiftSite`)
- Idempotency — re-run skips rows that already have `source_meta.cf`

### Carried forward (non-blocking)
- **Stale `_from_zoho/desk-archived-tickets.json`** still has no `cf`. A re-import from that
  file would re-null `source_meta.cf` on the archived rows. Re-run the (now cf-enriched)
  Desk Archived Tickets export before any future re-import, or don't re-import. Noted in
  CLAUDE.md and the migrate-tab banner.
- The `desk-archived-tickets` **export** enrichment (adds `cf` to future exports, ~2× Zoho
  calls) shipped but was not exercised live — the backfill covered the rows already imported.
- Live `desk-tickets` export / `importDeskTickets` byte-identical regression was reviewed at
  the code level (pure extraction), not diff-verified against a fresh Zoho export.
