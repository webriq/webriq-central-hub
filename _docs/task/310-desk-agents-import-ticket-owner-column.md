# 310: Zoho Desk Agents Import + Ticket Owner Column

**Created:** 2026-08-25
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Follow-up to task 309 (Desk Tickets List View). During that task's post-testing review, the user asked for an "Owner" column on the Tickets table. It's not buildable today: `tickets` only carries Zoho's raw `assigneeId` inside `source_meta` (written by `desk-tickets` import, task 296/302 — see `src/app/api/admin/zoho-import/desk-tickets/route.ts:243`), with **zero name resolution** anywhere in the Hub. Unlike `issues.assignee_id` (which resolves via email match against Hub `auth.users`, see `zoho-import/issues/route.ts:136`), no Desk Agents data has ever been imported — there is no `desk-agents.json` export, no import route, and no table to hold agent id → name/email.

This task builds that missing piece: a Zoho Desk Agents export/import (mirroring the already-shipped, simplest-possible Desk Accounts pattern — a flat list, no per-item looping, no OAuth scope needed since `Desk.agents.READ` was already granted on day one per task 117's doc), landing in a new small `desk_agents` table shaped like `contacts`. Task 309's Tickets page then resolves `source_meta.assigneeId` against it for a real Owner column, with a graceful "Unassigned" fallback for tickets with no assignee or an unresolved agent id.

### Zoho Desk Agents API — unconfirmed details to verify during implementation

`GET /api/v1/agents` — list endpoint, same `fetchAllDeskPages()` pagination every other Desk list level already uses. The exact real field names (`firstName`/`lastName` vs. a single `name`; agent `status` values; whether `email` is always present) were **not** confirmed against a live response for this task doc — confirm them by running the export once and inspecting `_from_zoho/desk-agents.json` before finalizing the import route's field mapping, the same way task 296/302 confirmed real ticket field shapes before finalizing `mapTicketStatus`.

## Requirements

- [ ] `supabase/migrations/NNN_desk_agents_table.sql` — new `desk_agents` table: `id` (uuid pk), `external_id` (text unique, Zoho agent id — the import dedupe key), `email`, `full_name`, `source_meta` (jsonb, for fields with no first-class column — status, role, associated departments, etc.), `created_at`/`updated_at`. RLS mirrors `contacts` exactly (migration 056): `desk_agents_staff_read` (admin/super_admin/pm/developer select), `desk_agents_pm_write` (admin/super_admin/pm all). Index on `email` where not null.
- [ ] `src/types/database.ts` — add the `desk_agents` table type (Row/Insert/Update/Relationships).
- [ ] `GET /api/admin/zoho-export/desk-agents` — admin-gated, mirrors `zoho-export/desk-accounts/route.ts` exactly: `fetchAllDeskPages("/agents", token, "zoho-export/desk-agents")`, downloads `desk-agents.json`. No new OAuth scope needed.
- [ ] `POST /api/admin/zoho-import/desk-agents` — admin-gated, mirrors `zoho-import/desk-contacts/route.ts`'s simple (non-matching) shape: reads `desk-agents.json`, upserts into `desk_agents` (`onConflict: "external_id"`), chunked (`CHUNK_SIZE = 50`, same as every other import route).
- [ ] `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` — add `"desk-agents"` to both `EXPORT_LEVELS` and `IMPORT_LEVELS` (see Code Context for the exact array shape to extend), wired through the tab's existing generic `handleExport`/`handleImport` handlers (same pattern every other simple level already uses — no new UI plumbing needed beyond the two array entries + whatever generic dispatch already keys off `level.key`).
- [ ] `src/app/(hub)/desk/tickets/page.tsx` — new scoped `desk_agents` lookup (same "only this page's rows" discipline as the existing `contacts` lookup): collect distinct `source_meta.assigneeId` values from the current page's tickets, `.in("external_id", ids)` against `desk_agents`, resolve to `full_name ?? email ?? "Unassigned"`.
- [ ] `_tickets-index.tsx` / `_tickets-table.tsx` / `loading.tsx` — add an "Owner" column (between Account and Responded, per the reference screenshot's information order) to the `TicketListItem` type, table header, table rows, and the loading skeleton's grid template.

## Out of Scope / Must-Not-Change

- **Owner-based filtering** ("My Tickets", "Unassigned Open Tickets" from the original Views screenshots) — this task only adds the column; filtering by owner is a further follow-up once the column itself is live and useful.
- **Matching Desk Agents to Hub `profiles`/`auth.users`** — unlike `issues.assignee_id`, which resolves to a real Hub user (internal devs), Desk Agents may not correspond 1:1 to Hub accounts at all (could be historical/departed agents, or agents who only ever used Zoho Desk). Display the Zoho agent's own name/email as-is; do not attempt profile matching in this pass.
- **Assigning/reassigning tickets from the Hub UI** — read-only import + display, matching task 309's existing read-only scope for the whole Tickets list.
- **Agent avatars/photos** — text-only Owner column (name, or email if no name, or "Unassigned").
- **Any change to `tickets`/`ticket_messages` schema** — `source_meta.assigneeId` is read as-is; no new column added to `tickets` itself (`desk_agents` is a separate lookup table, same shape decision task 296 made for `contacts` vs. tickets).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/NNN_desk_agents_table.sql` | Create | `desk_agents` table + RLS, mirrors `contacts` (migration 056). |
| `src/types/database.ts` | Modify | Add `desk_agents` table type. |
| `src/app/api/admin/zoho-export/desk-agents/route.ts` | Create | Mirrors `desk-accounts` export exactly. |
| `src/app/api/admin/zoho-import/desk-agents/route.ts` | Create | Mirrors `desk-contacts` import's simple (non-matching) shape. |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | Modify | Add `"desk-agents"` to `EXPORT_LEVELS`/`IMPORT_LEVELS`. |
| `src/app/(hub)/desk/tickets/page.tsx` | Modify | Scoped `desk_agents` lookup Map; resolve Owner per ticket. |
| `src/app/(hub)/desk/tickets/_tickets-index.tsx` | Modify | `TicketListItem.owner` field. |
| `src/app/(hub)/desk/tickets/_tickets-table.tsx` | Modify | Owner column header + cell. |
| `src/app/(hub)/desk/tickets/loading.tsx` | Modify | Grid template gains one more skeleton column. |

## Code Context

### `src/app/api/admin/zoho-export/desk-accounts/route.ts` — exact template for the new `desk-agents` export (swap `/accounts` → `/agents`, filename)

```ts
const token = await getZohoAccessToken();
// ...
let agents: Record<string, unknown>[];
({ items: agents } = await fetchAllDeskPages("/agents", token, "zoho-export/desk-agents"));
return new NextResponse(JSON.stringify(agents, null, 2), {
  headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="desk-agents.json"' },
});
```

### `src/app/api/admin/zoho-import/desk-contacts/route.ts` — structural template for `desk-agents` import (drop the account/customer matching entirely — agents don't match to a Hub customer)

```ts
const rows = agents.map((a) => ({
  external_id: String(a.id),
  email: a.email ?? null,
  full_name: a.firstName || a.lastName ? [a.firstName, a.lastName].filter(Boolean).join(" ") : (a.name ?? null),
  source_meta: { status: a.status ?? null, roleId: a.roleId ?? null /* confirm real fields live */ },
}));
// chunked upsert, onConflict: "external_id" — same CHUNK_SIZE = 50 pattern as every other import route
```

### `supabase/migrations/056_contacts_table.sql` — RLS naming/shape to mirror exactly

```sql
create table desk_agents (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  email text,
  full_name text,
  source_meta jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table desk_agents enable row level security;
create policy "desk_agents_staff_read" on desk_agents for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
create policy "desk_agents_pm_write" on desk_agents for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));
create index desk_agents_email_idx on desk_agents(email) where email is not null;
```

### `src/app/(hub)/desk/tickets/page.tsx` — existing scoped-lookup pattern to replicate for `desk_agents` (same shape as the current `contacts` lookup at lines 129-142)

```ts
const contactExternalIds = [...new Set(ticketRows.map((t) => t.external_contact_id).filter((v): v is string => !!v))];
const contactByExternalId = new Map<string, ContactRow>();
if (contactExternalIds.length > 0) {
  const { data: contactRows } = await supabase.from("contacts")
    .select("external_id, full_name, first_name, last_name, email")
    .in("external_id", contactExternalIds);
  for (const c of contactRows ?? []) { if (c.external_id) contactByExternalId.set(c.external_id, c); }
}
```
Replicate for `assigneeId` (pulled out of each ticket's `source_meta`, coerced to `String()`) against `desk_agents.external_id`.

## Implementation Steps

1. Write and apply the `desk_agents` migration; update `database.ts`.
2. Build the `desk-agents` export route (copy `desk-accounts`, swap endpoint/filename).
3. Run the export once against real data; inspect `_from_zoho/desk-agents.json` to confirm real field names before finalizing the import route's mapping (per the unconfirmed-details note above).
4. Build the `desk-agents` import route using the confirmed shape.
5. Add the `"desk-agents"` entries to `_zoho-desk-tab.tsx`'s `EXPORT_LEVELS`/`IMPORT_LEVELS`.
6. Run export → import once against real data; spot-check a few rows.
7. Add the scoped `desk_agents` lookup + `owner` field to `page.tsx`; add the Owner column to `_tickets-index.tsx`/`_tickets-table.tsx`/`loading.tsx`.
8. Manual browser check: Owner column shows real agent names for assigned tickets, "Unassigned" for tickets with no `assigneeId`, and doesn't crash on an `assigneeId` with no matching `desk_agents` row (unresolved id — treat the same as unassigned, i.e. fall back to "Unassigned" rather than showing a raw opaque id).

## Acceptance Criteria

- `/admin/migrate` Desk tab shows a "Desk Agents" export level and a "Desk Agents" import level, both admin-gated, following the existing generic handler pattern.
- Exporting downloads `desk-agents.json` with every portal agent; importing populates `desk_agents` with `external_id` set and is idempotent (re-running doesn't duplicate rows).
- `/desk/tickets`'s table shows a new Owner column: real agent name/email for tickets whose `source_meta.assigneeId` resolves to an imported agent, `"Unassigned"` for tickets with no assignee or an unresolved agent id.
- `npx tsc --noEmit` and `pnpm lint` pass.
- Existing Tickets page behavior (search, status filter, pagination) is unaffected — Owner is additive only.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Manual, admin-logged-in: run Desk Agents export → import against real data; confirm row count and spot-check a few agents in Supabase.
- Manual browser check of `/desk/tickets`'s new Owner column against real imported data (assigned + unassigned tickets both represented).

## Implementation Notes

### What Changed
- New `desk_agents` table (migration 118) mirroring `contacts`' shape/RLS: `external_id` unique dedupe key, `email`, `full_name`, `source_meta` jsonb, indexed on `email`.
- `desk_agents` table type added to `database.ts` (Row/Insert/Update, no Relationships — agents don't FK to anything).
- New `GET /api/admin/zoho-export/desk-agents` — exact mirror of `desk-accounts`'s export route (`fetchAllDeskPages("/agents", ...)`, admin-gated, no new OAuth scope).
- New `POST /api/admin/zoho-import/desk-agents` — mirrors `desk-contacts`'s simple (non-matching) import shape: reads `desk-agents.json`, upserts by `external_id` in chunks of 50. Field mapping (`firstName`/`lastName` composed into `full_name`, fallback to `name`; `status`/`roleId`/`associatedDepartmentIds` into `source_meta`) follows the task doc's template but is **unconfirmed against a live response** — no `desk-agents.json` export has been run yet (see Deviations below).
- `_zoho-desk-tab.tsx` — added `"desk-agents"` to both `EXPORT_LEVELS` and `IMPORT_LEVELS`, wired through the existing generic `handleExport`/`handleImport` handlers (no new UI plumbing).
- `/desk/tickets/page.tsx` — added a scoped `desk_agents` lookup (same discipline as the existing `contacts` lookup): collects distinct `source_meta.assigneeId` values from the current page's tickets, queries `desk_agents` `.in("external_id", ids)`, resolves via new `resolveOwnerName()` to `full_name ?? email ?? "Unassigned"`. Unresolved/missing assignee ids fall back to "Unassigned" (the lookup Map simply has no entry — `resolveOwnerName` treats `undefined` the same as an assigneeless ticket).
- `_tickets-index.tsx` — added `owner: string` to `TicketListItem`.
- `_tickets-table.tsx` — added an "Owner" column between Account and Responded; `GRID_COLS` widened from 7 to 8 tracks (`130px` for Owner).
- `loading.tsx` — skeleton grid template and bone count updated to match the new 8-column layout.

### Files Changed
- `supabase/migrations/118_desk_agents_table.sql` - new `desk_agents` table + RLS
- `src/types/database.ts` - added `desk_agents` table type
- `src/app/api/admin/zoho-export/desk-agents/route.ts` - new export route
- `src/app/api/admin/zoho-import/desk-agents/route.ts` - new import route
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` - added Desk Agents export/import levels
- `src/app/(hub)/desk/tickets/page.tsx` - scoped `desk_agents` lookup, `owner` field, `resolveOwnerName()`
- `src/app/(hub)/desk/tickets/_tickets-index.tsx` - `TicketListItem.owner`
- `src/app/(hub)/desk/tickets/_tickets-table.tsx` - Owner column header + cell, widened grid
- `src/app/(hub)/desk/tickets/loading.tsx` - skeleton grid gains a column

### Deviations From Plan
- Migration 118 has **not yet been applied** to the remote Supabase database — file written only, matching this repo's established convention of applying migrations as a separate manual step (same pattern as tasks 306/302).
- The Desk Agents export has **not yet been run against real data**, so the import route's field mapping (`firstName`/`lastName`/`name`, `status`, `roleId`, `associatedDepartmentIds`) is unconfirmed against a live Zoho Desk Agents API response, per the task doc's own flagged unconfirmed-details note. Confirm real field names in `_from_zoho/desk-agents.json` after running the export, and adjust the import route's mapping if any field name differs, before relying on the Owner column in production.
- Manual browser verification of the Owner column against real imported data has not been run in this session (requires the migration applied + a live admin-authenticated export/import round-trip first).

### Post-Implementation Fix — Real Field Name Confirmed (Desk Agents Export Run)
- User ran migration 118 against the remote database and produced a real `_from_zoho/desk-agents.json` export (6 agents). Reviewing it against the import route's mapping surfaced one bug: the route read `agent.email`, but the real Desk Agents payload uses **`emailId`**, not `email` — a different key than Desk Contacts/Accounts use for the same concept. Every real row would have imported with `email: null`.
- Fixed in `src/app/api/admin/zoho-import/desk-agents/route.ts`: `DeskAgentRaw.email` renamed to `emailId`, and the row-mapping now reads `agent.emailId ?? null`.
- Everything else in the mapping was confirmed correct against the real export: `id`, `firstName`, `lastName`, `name`, `status`, `roleId`, `associatedDepartmentIds` all present exactly as assumed. `name` is always populated and pre-composed by Zoho; `firstName`/`lastName` are sometimes split unevenly (one real row has `firstName: ""` with the full name in `lastName`), but the existing `firstName || lastName` fallback still resolves correctly since at least one of the two always holds the complete name. All 6 real rows have a non-empty `id`, so none are skipped.
- `npx tsc --noEmit` re-run after the fix — PASS.
- The live export/import round-trip and browser check are still pending (see Verification Run below) — the export has now been run and reviewed, but the import itself (writing rows into `desk_agents`) and the `/desk/tickets` browser check have not.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, no errors)
- Migration 118 applied to remote DB - DONE (user-run)
- Desk Agents export run against real data - DONE (user-run); reviewed and one field-name bug fixed (see above)
- Manual admin import of `desk-agents.json` into `desk_agents` - PASS (user-run, post-fix)
- Manual browser check of `/desk/tickets` Owner column - PASS (user-confirmed: real agent names resolve correctly, unassigned/unresolved tickets show "Unassigned")

## Task Complete

All Requirements and Acceptance Criteria are met: `desk_agents` table live in the remote database, Desk Agents export/import levels working in `/admin/migrate`'s Desk tab (including the post-implementation `emailId` field-name fix), and the Tickets list's Owner column resolving real agent names with a correct "Unassigned" fallback — confirmed in the browser against real imported data by the user. Closed out 2026-08-25.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation in any changed file.
- No broad `any` — the new import route's `DeskAgentRaw` type uses the same typed-shape-plus-`[key: string]: unknown` escape hatch as the sibling `desk-contacts` route it mirrors; consistent with existing convention, not a new pattern.
- No deep nesting; guard clauses (`if (!externalId) { skip; continue; }`) match sibling import routes.
- Names accurately describe behavior (`resolveOwnerName`, `agentByExternalId`, `assigneeIds`).
- The Owner lookup in `page.tsx` (`assigneeIds` collection + `agentByExternalId` Map) duplicates the existing Contact lookup's structure rather than sharing a helper — intentional: each lookup is ~10 lines, used exactly once, and the codebase's own convention (CLAUDE.md: "three similar lines is better than a premature abstraction") already accepts this duplication for the pre-existing Contact lookup it mirrors.
- Errors handled intentionally: both new routes return typed error JSON with status codes (401/403/400/502), matching sibling routes exactly.
- No secrets, credentials, or unusual debug logging — `console.log`/`console.error` usage matches every sibling import/export route already in the codebase.
- Scoped `.in()` lookups (Contact, Owner) are correctly not paginated with `.range()` — they're bounded by the current page's ticket count (≤ 100), not an unbounded table scan, matching the codebase's own stated exception for this pattern.
- Migration SQL, RLS policy names, and table shape are a verbatim match to the task doc's provided template.

### Deviations
- **Minor** — Migration 118 not yet applied to the remote database, and no live Desk Agents export has been run to confirm real field names (`firstName`/`lastName` vs. `name`, whether `email` is always present). Both are pre-flagged by the task doc itself as requiring live-data confirmation, and this repo's established convention (tasks 302/304/306) is to land code in Testing with these live steps documented as pending rather than blocking the quality gate on them. No scope violation — the code implements the documented best-guess mapping and is structured so a field-name correction (if needed) is a one-line change in the import route's `rows.push(...)` block.
- No other deviations from the task doc's Requirements, Proposed File Changes, or Out of Scope list — all items implemented as specified, and no Out-of-Scope item (owner-based filtering, profile matching, ticket reassignment, avatars, tickets/ticket_messages schema changes) was touched.

### Required Fixes
- None.
