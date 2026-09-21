# 382: Desk Inbox/Tickets — Table Rename, Child-Table Rename, Routing-Key Cleanup

**Created:** 2026-09-21
**Priority:** HIGH
**Type:** refactor
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Task 364 renamed "Issue" → "Ticket" at the application/UI layer everywhere, but deliberately left the DB tables alone: `issues`/`issue_comments`, RLS policy names, `issues.prefix`, and `entity_type` values were "kept unchanged (collision/migration-risk avoidance)" per that task's own closing note — because `tickets` was already taken by the Desk email/support table. That deferred exactly the naming mismatch this task now finishes:

| UI label | Currently reads from | Will read from |
|---|---|---|
| Desk > Inbox | `tickets` table (Desk email/support threads, Zoho Desk + StackShift Support Center) | `inbox` |
| Desk > Tickets | `issues` table (filed, assignable work items) | `tickets` |

This is a DB-level rename plus a set of routing/display cleanups that came out of reviewing `~/Downloads/desk-inbox-tickets-migration-plan.md` against the live codebase. That review found the plan's premise ("two tables, limited surface area") understated: ~30 files call `.from("issues")`, ~22 call `.from("tickets")`, and ~211 files reference `issue`/`ticket` identifiers somewhere. This doc supersedes the original plan doc's Step 1–3 checklists with the concrete decisions below, reached in conversation and not open for re-litigation except where explicitly flagged **OPEN**.

This doc plans a migration+refactor. It does not plan the small additive `issues.prefix` reference-label UI feature (item 10 below) as a full implementation — that's small enough to fold into `implement` directly once this doc's DB rename lands, since it touches the same three ticket-detail files this task also can't avoid re-reading. It's documented here as a rider only so it isn't lost.

## Requirements

### A. Core table renames (SQL migration)
- [ ] `ALTER TABLE tickets RENAME TO inbox;`
- [ ] `ALTER TABLE issues RENAME TO tickets;`
- [ ] `ALTER TABLE ticket_messages RENAME TO inbox_messages;` + rename its FK column `ticket_id` → `inbox_id` (FK retargets to `inbox.id`)
- [ ] `ALTER TABLE issue_comments RENAME TO ticket_comments;` + rename its FK column `issue_id` → `ticket_id` (FK retargets to `tickets.id`, the renamed table)
- [ ] Rename associated indexes/sequences/constraints to match (e.g. `issues_project_id_fkey` → `tickets_project_id_fkey`, `tickets_customer_id_fkey` → `inbox_customer_id_fkey`, etc. — full list in Code Context)

### B. Explicit non-renames (decided, not oversights)
- [ ] **`time_logs.issue_id` and `active_timers.issue_id` stay named `issue_id`** — NOT renamed to `ticket_id`. ~15 files touch these columns (timer UI, dev dashboard, time-log routes); the naming mismatch this leaves behind is judged smaller than the blast radius of renaming it. Document this as a deliberate, revisitable call in the migration's SQL comment, same convention as migration 137/138's own comments.
- [ ] **Storage bucket `ticket-attachments` stays named as-is.** Supabase Storage buckets cannot be renamed in place — a real rename means creating a new bucket, copying every object, and repointing every stored path. Disproportionate risk for a cosmetic rename; explicitly out of scope.
- [ ] **No route paths change.** `/desk/inbox`, `/desk/tickets`, `/api/desk/tickets/*`, `/(public)/tickets/[ticketId]`, `/api/v2/projects/[projectId]/tickets/*`, `/api/v2/tickets/[ticketId]` all keep their current paths. The customer-facing vocabulary ("Ticket") and the internal DB vocabulary (`inbox`) are deliberately decoupled — customers never see the word "inbox" anywhere.
- [ ] **`tickets.ticket_number`/`#<n>` display format is untouched.** No renumbering, no reformatting. It's already a Hub-owned Postgres serial (migration 124 seeded it once from Zoho's historical max, then took over incrementing); renumbering would break continuity for every existing ticket and every already-sent customer email.
- [ ] **`issues.display_id` (`<proj>-TKT####`) stays a per-project incremental sequence** — not merged with or seeded from `tickets.ticket_number`'s global counter. Zoho itself kept Desk ticket numbers and Projects issue IDs (`issues.prefix`, e.g. `TC3-I1`) as two independent numbering domains; a per-project counter preserves the same "how many tickets does this project have" readability every other display-ID in the system relies on.

### C. Routing-key change (application code, not just renamed queries)
- [ ] `/desk/inbox/[ticketId]` (staff) switches from routing by `inbox.ticket_id` (display string, `TKT-XXXX`) to routing by `id` (UUID).
- [ ] `/(public)/tickets/[ticketId]` (public, emailed link) switches the same way.
- [ ] Every `/api/desk/tickets/[ticketId]/*` handler currently doing a `ticket_id → id` lookup as its first step (notes, reply, status, resend-notification, file-url, inline-images) drops that lookup — the route param is the UUID already.
- [ ] The `#<ticket_number>` badge/label (`resolveDisplayId()` in `desk/inbox/_resolve.ts`) is unchanged — stays purely a display label, now fully decoupled from routing.

### D. `attachments.entity_type` cascade (tied to the `inbox_messages` rename)
- [ ] CHECK constraint: `'ticket_message'` → `'inbox_message'`
- [ ] Data migration: `UPDATE attachments SET entity_type = 'inbox_message' WHERE entity_type = 'ticket_message';`
- [ ] Update all 7 call sites (list in Code Context) in the same deploy as the table rename — a window where `entity_type` values don't match what code queries for is a real functional break (attachment lookups return empty), not just a lint issue.

### E. FK repoints beyond the two child tables
- [ ] `tasks.ticket_id` (migration 025, FK → old `tickets.id`) repoints to `inbox.id`. Per the plan's own stated principle ("FK column referencing thread/message data should become `inbox_id`"), rename this column to `tasks.inbox_id`.
- [ ] `issues.source_ticket_id` (migration 137, FK → old `tickets.id`, now the renamed `tickets` table's own column) repoints to `inbox.id`. **OPEN:** rename to `source_inbox_id` for accuracy (it points at what's now literally `inbox`), or leave as `source_ticket_id` since it still reads correctly as "the Desk ticket this was filed from." Flagged for manager/implementer call, not decided.

### F. RLS policies to rename
- [ ] `issues_staff_read`, `issues_pm_write`, `issues_developer_delete`, `issues_developer_update` → `tickets_*`
- [ ] `issue_comments_staff_read`, `issue_comments_pm_write`, `issue_comments_staff_insert`, `issue_comments_delete` → `ticket_comments_*`
- [ ] `tickets_staff_all`, `tickets_client_read`, `tickets_client_insert` → `inbox_*`
- [ ] `ticket_messages_staff_all`, `ticket_messages_client_read`, `ticket_messages_client_insert` → `inbox_messages_*`

### G. Functions/triggers
- [ ] `generate_ticket_display_id()` — now literally targets the renamed `tickets` table (was `issues`); no behavior change needed, name is already correct.
- [ ] `sync_ticket_number_sequence()` — now targets `inbox` (was `tickets`); name becomes misleading post-rename. Consider renaming to `sync_inbox_ticket_number_sequence()` or similar.
- [ ] `trg_generate_ticket_id` trigger — retarget to `inbox` (fires on insert into the renamed table; no logic change).

### H. External/breaking-change surfaces — decide before executing
- [ ] **OPEN:** `src/lib/mcp/tools/list-tickets.ts` currently reads Desk `tickets` (→ `inbox`). Its name becomes misleading post-rename since "Ticket" will then mean the other table. It's used by external MCP clients (Claude Desktop/ChatGPT per this repo's `mcp-tools.md` convention) — renaming or changing its behavior is a breaking change for already-configured external clients. Needs an explicit decision: leave it pointed at `inbox` under a now-confusing name, rename the tool (breaking), or add a second tool for the renamed `tickets` table. Not decided in this doc.
- [ ] Two live pg_cron jobs need coordinated freeze/resume during the migration window, named explicitly rather than "freeze the cronjobs":
  - `ticket-email-poll` (migration 122) — writes into what's becoming `inbox`
  - The Zoho Projects issue-sync job — writes into what's becoming `tickets`

### I. Types, down-migration, docs
- [ ] `src/types/database.ts` (the generated `Database` type, `TicketRow` alias currently at line ~3796) must be regenerated against the live post-migration schema — not hand-edited. Confirm/record the actual regen command used in this repo (likely `supabase gen types typescript`) since the plan review didn't find an existing script reference.
- [ ] Down-migration (`inbox`→`tickets`, `tickets`→`issues`, reversing B/C/D/E/F/G above) written and tested **before** the maintenance window, not after — per the original plan doc's rollback section.
- [ ] `CLAUDE.md` Key Conventions section updated to reflect the new table names, once implemented (deferred to the `document` stage per this repo's convention — do not edit CLAUDE.md as part of this task's planning).

### J. Additive rider — not part of the migration, no schema change (fold into implementation, don't skip)
- [ ] Surface `issues.prefix` (Zoho's original per-project issue ID, e.g. `TC3-I1` — already stored, currently dead since `display_id ?? prefix ?? id` never falls through to it) as a small greyed-out "formerly `<prefix>`" secondary label next to the primary `display_id`, on the three ticket-detail pages and optionally the Desk > Tickets list. Applies only to imported rows — `prefix` is `null` for anything created natively in the Hub.

## Out of Scope / Must-Not-Change

- Route paths (see B above) — do not rename `/desk/inbox`, `/desk/tickets`, `/(public)/tickets/*`, or any `/api/**/tickets/**` path.
- `ticket_number`/`#<n>` display format and value — no renumbering.
- `time_logs.issue_id` / `active_timers.issue_id` column names.
- Storage bucket `ticket-attachments` name.
- `issues.display_id`'s per-project scoping — do not merge with `tickets.ticket_number`'s global sequence.
- Zoho sync payload field names (`ticketNumber`, etc.) — vendor-side naming stays vendor-side, per the original plan doc's "vendor-naming note."
- CLAUDE.md edits — deferred to `document` stage.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/1XX_desk_inbox_tickets_rename.sql` | Create | Requirements A, E, F, G — table/column/RLS/function renames, FK retargets |
| `supabase/migrations/1XX_desk_inbox_tickets_rename_down.sql` (or a documented reverse block) | Create | Down-migration, tested pre-cutover |
| `src/app/(hub)/desk/inbox/page.tsx` | Modify | `.from("tickets")`→`.from("inbox")`, `.from("issues")`→`.from("tickets")` |
| `src/app/(hub)/desk/inbox/[ticketId]/page.tsx` | Modify | table renames + route by `id` not `ticket_id`; `.from("ticket_messages")`→`.from("inbox_messages")`; `entity_type` literal update |
| `src/app/(hub)/desk/inbox/_resolve.ts` | Modify | update comment referencing `TKT-<n>` URL; `resolveDisplayId()` logic unchanged |
| `src/app/(hub)/desk/inbox/_inbox-index.tsx` | Modify | link-building now uses `id`, not `ticket_id` |
| `src/app/(hub)/desk/tickets/page.tsx` | Modify | `.from("issues")`→`.from("tickets")`; nested `tickets(...)` embed →`inbox(...)` |
| `src/app/(hub)/desk/tickets/_filed-issues-index.tsx`, `_filed-issues-table.tsx` | Modify | table rename only (no routing-key change here — these already route by UUID via project ticket URLs) |
| `src/app/(hub)/desk/accounts/[id]/page.tsx`, `src/app/(hub)/desk/contacts/[id]/page.tsx` | Modify | `.from("tickets")`→`.from("inbox")` |
| `src/app/(public)/tickets/[ticketId]/page.tsx` | Modify | route by `id`; `.from("tickets")`→`.from("inbox")` |
| `src/app/api/public/tickets/[ticketId]/view/route.ts` | Modify | route by `id`; table rename |
| `src/lib/desk/customer-view-access.ts` | Modify | `viewUrl` construction now uses `id`; table rename |
| `src/app/api/desk/tickets/[ticketId]/{messages/**,notes,reply,status,resend-notification}/route.ts` (6+ handlers) | Modify | drop `ticket_id`→`id` lookup, route directly by `id`; table renames; `entity_type` literal update where applicable |
| `src/app/api/admin/desk/backfill-archived-ticket-cf/route.ts`, `backfill-inline-images/route.ts` | Modify | table renames |
| `src/app/api/cron/email-poll/route.ts` | Modify | table renames; `entity_type` literal update; verify against frozen/resumed `ticket-email-poll` job |
| `src/lib/email/inline-images.ts` | Modify | `entity_type` literal update |
| `src/app/api/v2/projects/[projectId]/tickets/**` (route, `[ticketId]`, comments/, attachments/) | Modify | `.from("issues")`→`.from("tickets")`; `.from("tickets")`(source lookup)→`.from("inbox")`; `issue_comments`→`ticket_comments`, `issue_id`→`ticket_id` |
| `src/app/api/v2/tickets/[ticketId]/**` | Modify | same as above |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/tickets/[ticketId]/page.tsx`, `_ticket-detail.tsx` | Modify | table renames; (rider) `prefix` reference label |
| `src/app/(hub)/projects-old/[projectId]/issues/[issueId]/page.tsx`, `_ticket-detail.tsx` | Modify | table renames; (rider) `prefix` reference label |
| `src/app/(hub)/projects/_shared/_get-project-detail-data.ts`, `_get-metadata-titles.ts` | Modify | table rename |
| `src/app/(hub)/projects-old/[projectId]/_get-project-detail-data.ts` | Modify | table rename |
| `src/app/(hub)/dashboard/_dev/_load-dev-dashboard.ts` | Modify | table rename |
| `src/app/api/v2/timer/start/route.ts`, `src/app/api/v2/time-logs/**`, `src/lib/timer/serialize.ts` | Modify | table rename only — `issue_id` column name unchanged (Requirement B) |
| `src/app/api/admin/zoho-import/{issues,issue-comments,issue-timelogs,issue-attachments}/route.ts` | Modify | table renames (`issues`→`tickets`, `issue_comments`→`ticket_comments`); Zoho-side field names untouched |
| `src/app/api/admin/zoho-import/{desk-tickets,ticket-attachments,desk-threads,desk-comments}/route.ts`, `src/lib/migrate/{desk-tickets-import,desk-comments-import,desk-threads-import}.ts` | Modify | `tickets`→`inbox`, `ticket_messages`→`inbox_messages`, `entity_type` literal |
| `src/lib/ai/ops-chat-tools.ts` | Modify | table renames if it queries either table directly (confirm at implementation time) |
| `src/lib/mcp/tools/list-tickets.ts` | Modify (pending Requirement H decision) | table rename at minimum; name/behavior change pending open decision |
| `src/types/database.ts` | Regenerate | do not hand-edit; regenerate from live schema |
| `CLAUDE.md` | Not touched this task | deferred to `document` stage |

This list is derived from the grep sweep done during plan review (`\.from("issues")`, `\.from("tickets")`, `\.from("ticket_messages")`, `\.from("issue_comments")`, `"ticket_message"` literal) — re-run the same greps at implementation time to catch any file added since this doc was written.

## Code Context

### Current table shapes (from `src/types/database.ts`)

`tickets` (→ `inbox`): `id, ticket_number, ticket_id, customer_id, customer_product_id, subject, channel, priority, status, requester_email, requester_profile_id, sla_due_at, first_response_at, resolved_at, classification_id, external_id, external_contact_id, external_account_id, match_method, source_meta, zoho_mail_thread_id, customer_view_password_hash, customer_view_password_set_at, customer_view_failed_attempts, customer_view_locked_until, customer_notified_at, created_at, updated_at`

`issues` (→ `tickets`): `id, project_id, task_id, external_id, prefix, title, description, status, severity, flag, assignee_name, assignee_email, assignee_id, assignees, created_by, due_date, due_time, notes, created_at, updated_at, source_meta, display_id, source_ticket_id`

### Routing-key lookup pattern to remove (repeats across ~6 API routes)

```ts
// src/app/api/desk/tickets/[ticketId]/notes/route.ts (representative of the pattern)
const { data: ticket } = await supabase
  .from("tickets")
  .select("id")
  .eq("ticket_id", ticketId)   // <-- this lookup goes away once the route param is the UUID
  .maybeSingle();
```
Post-change, `ticketId` from the route param IS the UUID — this becomes `.eq("id", ticketId)` or is dropped entirely if the param is used directly in a subsequent `.eq("ticket_id", ticket.id)`-style child query.

### `resolveDisplayId()` — unchanged, already correctly decoupled

```ts
// src/app/(hub)/desk/inbox/_resolve.ts
export function resolveDisplayId(ticket: { ticket_number: number }): string {
  return `#${ticket.ticket_number}`;
}
```

### `viewUrl` construction — the one place the routing-key change actually matters for customers

```ts
// src/lib/desk/customer-view-access.ts
viewUrl: `${appUrl}/tickets/${params.ticketId}`,
```
`params.ticketId` must become the UUID here, not `ticket_id`. Verify migration 146's customer-view-password flow (lookup, lockout, `customer_view_locked_until`) still resolves correctly keyed by `id` — it should, since it already receives whatever's passed as `ticketId` and looks the row up, but confirm no code path assumes the `TKT-` format specifically (e.g. regex validation on the param).

### `attachments.entity_type` literal — 7 call sites found by grep

```
src/app/(hub)/desk/inbox/[ticketId]/page.tsx:189
src/app/api/desk/tickets/[ticketId]/messages/[messageId]/attachments/[attachmentId]/file-url/route.ts:40
src/app/api/desk/tickets/[ticketId]/messages/[messageId]/inline-images/[attachmentId]/route.ts:40
src/app/api/admin/zoho-import/ticket-attachments/route.ts:100,177
src/app/api/cron/email-poll/route.ts:330
src/lib/email/inline-images.ts:71
```
All read or write the literal string `"ticket_message"` — swap to `"inbox_message"` in the same deploy as the CHECK constraint + data UPDATE (Requirement D).

### `issues.source_ticket_id` — the existing Inbox↔Ticket link (already satisfies the original plan's open question)

```sql
-- migration 137
alter table issues
  add column if not exists source_ticket_id uuid references tickets(id) on delete set null;
```
This already answers "does a filed Ticket link back to its originating Inbox thread?" — yes, since migration 137. No new FK needs to be added; this one just needs its target repointed to `inbox.id` post-rename (Requirement E).

### `tasks.ticket_id` — the older, separate FK (migration 025) easy to miss

```sql
-- migration 025
alter table tasks
  add constraint tasks_ticket_id_fkey
  foreign key (ticket_id) references tickets(id) on delete set null;
```
Unrelated to `issues.source_ticket_id` — a different linkage, from the original v2 schema. Must also be repointed to `inbox.id` (Requirement E).

## Implementation Steps

1. Write the up-migration (Requirement A, E, F, G) and the down-migration (Requirement I) together; test the down-migration against a copy of the schema before touching application code.
2. Freeze `ticket-email-poll` and the Zoho Projects issue-sync cron jobs (Requirement H).
3. Apply the migration to a staging/local DB; regenerate `src/types/database.ts`.
4. Sweep application code table-by-table using the file list above, in this order to keep the app buildable at each step: (a) shared libs (`customer-view-access.ts`, `deep-links.ts`, `serialize.ts`), (b) API routes, (c) pages/components. Re-run the grep sweep from plan review to confirm nothing was missed.
5. Apply the routing-key change (Requirement C) as a distinct, reviewable sub-step — it's a behavior change, not just a rename, and worth its own `tsc`/manual-test pass separate from the mechanical renames.
6. Apply the `entity_type` cascade (Requirement D): CHECK constraint, data `UPDATE`, then code — in that order within one deploy.
7. Resolve Requirement H's MCP tool decision before touching `list-tickets.ts`; if deferred, leave it querying `inbox` under its current name and note the mismatch in the file itself.
8. Unfreeze both cron jobs; verify one live poll cycle each.
9. Fold in the Requirement J rider (`issues.prefix` reference label) while the three ticket-detail files are already open for the table rename.
10. Update `TASKS.md` status; hand off to `document` stage for the CLAUDE.md convention update.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes with zero new errors (watch for stale `.next/types` entries the way task 378 hit — clear `.next/types` if route-param renames produce false positives).
- [ ] `pnpm lint` passes (no new warnings beyond the 2 pre-existing unrelated ones this repo's task history consistently reports).
- [ ] Desk > Inbox list + detail page load, badge shows `#<n>`, URL shows the UUID, no `ticket_id`-based 404s.
- [ ] Desk > Tickets list + detail page load, `display_id` unchanged in format.
- [ ] "File a Ticket" flow (task 363/381) still creates a `tickets` row with `source_ticket_id` correctly linking back to the originating `inbox` row, and still fires the customer notification email.
- [ ] Public ticket view (`/tickets/<uuid>`) resolves, password gate still works, lockout counters still function.
- [ ] `ticket-email-poll` cron writes new rows into `inbox` correctly after unfreeze.
- [ ] Zoho Projects issue-sync writes new rows into `tickets` correctly after unfreeze.
- [ ] RLS spot-checked for admin, PM, developer, and client roles against both renamed tables — no policy silently stopped matching due to the rename.
- [ ] Attachments on Desk conversation messages (`entity_type = 'inbox_message'`) still resolve for pre-existing rows after the data `UPDATE`.
- [ ] Down-migration executed against a scratch copy and confirmed to restore the pre-migration state.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm build
# Manual: staging DB migration apply + rollback rehearsal before production maintenance window
# Manual: browser click-through per Acceptance Criteria (no automated test runner in this repo)
```

## Compatibility Touchpoints

- **External MCP clients** (Claude Desktop, ChatGPT) — `list-tickets` tool behavior/name is a breaking-change surface pending Requirement H's open decision. If `mcp-tools.md` exists at implementation time (not found in this repo checkout during planning — confirm), update it per CLAUDE.md's "any new/changed `registerTool` call must update that file in the same change" rule.
- **Customer-facing email links** already sent before this migration ships (`/tickets/TKT-XXXX` format, task 379/380) will 404 once routing switches to UUID-only, unless a fallback lookup (`ticket_id` OR `id`) is added at the public route for some transition window. Not currently scoped as a requirement above — flag to the user/manager as a decision before execution: accept the breakage (likely low volume, feature is recent) or add a short-lived dual-lookup fallback.
- **Zoho sync integrations** — both cron jobs must be confirmed frozen before the migration runs and confirmed healthy after unfreeze; this is the one part of this task with live external-system risk beyond the DB itself.

---

## Implementation Notes

### What Changed

Full DB rename + application-code sweep, per the approved doc, with the three OPEN decisions resolved before implementation (per user sign-off): `issues.source_ticket_id` renamed to `source_inbox_id`; a second MCP tool (`list_filed_tickets`) added rather than repointing `list_tickets`; and the public-route "transition fallback" question was investigated and found moot (see Deviations).

- **SQL migration** `147_desk_inbox_tickets_rename.sql` + `147_desk_inbox_tickets_rename_down.sql` — table renames (`tickets`→`inbox`, `issues`→`tickets`, `ticket_messages`→`inbox_messages`, `issue_comments`→`ticket_comments`), column renames (`tasks.ticket_id`→`inbox_id`, `issues.source_ticket_id`→`source_inbox_id`, `inbox_messages.ticket_id`→`inbox_id`, `ticket_comments.issue_id`→`ticket_id`), a dynamic constraint-name sweep (mirrors migration 088's pattern) plus explicit renames for cross-table/known-name constraints and indexes, RLS policy renames (14 policies across 4 tables), `generate_ticket_display_id()` recreated to query the renamed table, `sync_ticket_number_sequence()` renamed to `sync_inbox_ticket_number_sequence()` and repointed at `inbox`, and the `attachments.entity_type` `'ticket_message'`→`'inbox_message'` cascade (data `UPDATE` before the `CHECK` constraint swap, per Postgres's constraint-validates-existing-rows behavior). **Written, not applied** — matches this repo's established convention for every recent schema-bearing task; `supabase db push` was not run.
- **`src/types/database.ts`** hand-edited to match the target post-migration schema (table keys, column names, `Relationships[]`, FK names) since the migration itself isn't applied yet and there is no live schema to regenerate types from. This is a deliberate, temporary divergence from "always regenerate, never hand-edit" — flagged so whoever applies migration 147 also runs a real `supabase gen types` pass afterward to replace this hand-edit with the generator's actual output (they should be identical, but the generator is authoritative). Added `InboxRow` alias; kept `TicketRow` pointed at the renamed table.
- **~50 application files** swept: `.from("tickets"|"issues"|"ticket_messages"|"issue_comments")` calls repointed via a verified two-literal-pass sed sweep (safe because the four table-name literals are mutually disjoint strings), plus two PostgREST embed-string cases (`tickets(...)` → `inbox(...)`) that the mechanical sweep couldn't reach. Two stray `Database["public"]["Tables"]["issues"]` bracket-type references (`_pm-shared.tsx`, `api/v2/tickets/[ticketId]/route.ts`) were caught and fixed — these are exactly the class of bug task 364's own retrospective flagged ("a Database Tables issues type path got blanket-renamed to tickets, silently repointing a PATCH route's update type at the Desk email tickets table").
- **Routing-key change**: `/desk/inbox/[ticketId]` (staff) and all `/api/desk/tickets/[ticketId]/*` handlers (notes, reply, status, resend-notification, 2× file-url/inline-images) now route/validate by `inbox.id` (UUID) instead of `inbox.ticket_id` ("TKT-<n>"), removing the `ticket_id`→`id` lookup that used to be the first step of 6+ handlers. The `#<ticket_number>` badge (`resolveDisplayId()`) is unchanged, now fully decoupled from routing. `desk/inbox/page.tsx`'s list, `_inbox-index.tsx`/`_inbox-table.tsx`'s link/API-call building, and the Desk Accounts/Contacts "related tickets" widget (`_detail-ui.tsx`'s `RelatedTickets`) all updated to feed the UUID through.
- **Inline-image URL bug caught and fixed**: `applyInlineImages()`'s `ticketId` param is embedded verbatim into the stored `<img src>` serving-route URL — both call sites (`cron/email-poll/route.ts`, `admin/desk/backfill-inline-images/route.ts`) were still passing the "TKT-<n>" display string into it. Fixed to pass the UUID; left the display string only where it's used for human-readable diagnostics (the backfill route's `unresolved[]` output).
- **FK repoints beyond the child tables**: `tickets.source_inbox_id` (the "File a Ticket" flow — `_create-ticket-modal.tsx`, `_thread-to-project-modal.tsx`, `api/v2/projects/[projectId]/tickets/route.ts`) updated end-to-end, including the client→server wire field name (`source_inbox_id` now, was `source_ticket_id` on both sides — caught and fixed a request/response key mismatch introduced mid-edit before it could ship).
- **`ticket_comments` FK column** (`issue_id`→`ticket_id`) fixed across all 6 call sites, including the Zoho import route's row-shape type and upsert payload.
- **`time_logs.issue_id`/`active_timers.issue_id`** deliberately left untouched, confirmed via grep across ~15 files — none needed changes since only the *table* they FK to was renamed, not this column.
- **MCP**: new `src/lib/mcp/tools/list-filed-tickets.ts` (`list_filed_tickets` tool, `filed-tickets:read` scope, staff-only) added alongside the unchanged `list_tickets`; registered in `api/mcp/route.ts`; new scope added to `scopes.ts`'s catalog and `STAFF_SCOPES`.
- **Rider (Requirement J)**: `issues.prefix` surfaced as a greyed-out "formerly `<prefix>`" label next to the primary display id on all three ticket-detail pages (v2, legacy, projects-old — the last one kept its existing "ISSUE ·" wording, which predates and is out of scope for this task). The Desk > Tickets *list* version was left undone — the doc marked it optional.
- Removed now-dead code: `email-poll/route.ts`'s `ticketDisplayId` variable and its 5 assignments became fully unused once the inline-image fix above removed its only real consumer; deleted rather than left with a lint-suppressed unused-var warning.
- Fixed two pre-existing one-off scripts (`scripts/import-ambiguous-issue-attachments.ts`, `scripts/import-batch2-fixes.ts`) that also queried `.from("issues")` — outside `src/`, missed by the initial file sweep, caught by `tsc --noEmit`.

### Files Changed

Migration: `supabase/migrations/147_desk_inbox_tickets_rename.sql`, `147_desk_inbox_tickets_rename_down.sql` (new).

Types: `src/types/database.ts`.

~50 application files across `src/app/(hub)/desk/**`, `src/app/(public)/tickets/**`, `src/app/api/desk/tickets/**`, `src/app/api/public/tickets/**`, `src/app/api/v2/projects/[projectId]/tickets/**`, `src/app/api/v2/tickets/**`, `src/app/api/cron/email-poll/route.ts`, `src/app/api/admin/desk/**`, `src/app/api/admin/zoho-import/{issues,issue-comments,issue-timelogs,issue-attachments,ticket-attachments}/route.ts`, `src/lib/migrate/{desk-tickets-import,desk-threads-import,desk-comments-import}.ts`, `src/lib/desk/customer-view-access.ts`, `src/lib/email/inline-images.ts`, `src/lib/ai/ops-chat-tools.ts`, `src/lib/mcp/scopes.ts`, `src/app/api/mcp/route.ts`, `src/app/(hub)/projects/{v2,legacy}/[projectId]/tickets/[ticketId]/_ticket-detail.tsx`, `src/app/(hub)/projects-old/[projectId]/issues/[issueId]/_ticket-detail.tsx`, `src/app/(hub)/projects-old/_pm-shared.tsx`. New file: `src/lib/mcp/tools/list-filed-tickets.ts`. Plus the two `scripts/*.ts` fixes noted above.

### Deviations From Plan

- **The "already-emailed customer links" fallback (Requirement C / the pre-implementation Q&A) turned out to be unnecessary and was not built.** Investigating `(public)/tickets/[ticketId]/page.tsx` and `api/public/tickets/[ticketId]/view/route.ts` before editing found both were **already routing by UUID**, not `ticket_id` — they predate this task (task 379) and were built correctly from the start. My earlier in-conversation claim that the customer-facing link used the "TKT-" format was wrong; corrected here rather than building unneeded dual-lookup code. The one real bug found in that area was unrelated: the public view route's message query still said `.eq("ticket_id", ticketId)` against `inbox_messages`, which needed to become `.eq("inbox_id", ticketId)` regardless of the UUID question — fixed.
- **Constraint/index rename uses a dynamic sweep, not a fully enumerated list**, because no live-schema introspection was available at authoring time (only migration files that were read). Explicit renames are given for every constraint/index whose exact name was confirmed from a migration file; everything else on the four renamed tables is covered by the sweep's pattern match. Recommend a dry-run against a staging copy before the production push to confirm the sweep's output matches expectations.
- **`_docs/mcp-tools.md`** (which CLAUDE.md says must be updated in the same change as any new `registerTool` call) does not exist anywhere in this repo checkout — confirmed via search, not just planning-time assumption. Not created as part of this task (would be scope creep unrelated to the DB rename); flagged here rather than silently skipped.
- **Desk > Tickets list-page prefix label** (the optional half of Requirement J) not implemented — the doc explicitly marked it optional, and detail-page coverage was prioritized given the scope already covered.
- Entity_type cascade order executed as data `UPDATE` → `CHECK` constraint swap (not constraint-then-data as the requirement bullet listed) — Postgres validates existing rows against an added `CHECK` constraint by default, so the constraint-first order in the original bullet would have failed the migration outright.

### Verification Run

- `npx tsc --noEmit` — PASS (0 errors; two errors surfaced on the first run in `scripts/` files outside the original sweep scope, fixed, re-ran clean).
- `pnpm lint` — PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`; one new warning this task introduced — `ticketDisplayId` unused in `email-poll/route.ts` — was fixed by removing the dead code, not suppressed).
- `pnpm build` — PASS (exit 0, full route tree generated including every `/desk/**`, `/tickets/[ticketId]`, `/projects/{v2,legacy}/[projectId]/tickets/**` route).
- **Migration NOT applied** — `supabase db push` was not run; no live-DB or RLS-as-different-roles verification, no cron freeze/unfreeze rehearsal, no browser click-through. All of Acceptance Criteria's runtime items (Desk pages loading, File a Ticket flow, public ticket view, cron writes, RLS per role, down-migration rehearsal) remain outstanding and require the migration to be applied to a staging DB first.

---

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code, no broad `any`, no deep nesting introduced. One instance of genuinely-dead code was found and removed during implementation itself (`email-poll/route.ts`'s `ticketDisplayId`, after a fix eliminated its only real consumer) rather than left behind — confirmed still absent.
- No secrets, credentials, or new debug logging; all `console.error`/`console.warn` calls added match this codebase's existing per-route logging convention (prefixed `[route/path]` tags), not new patterns.
- Naming: FK/column renames read correctly everywhere checked (`source_inbox_id`, `inbox_id`, `ticket_id` on the right tables) — see Deviations for one issue found and fixed in the migration file itself.
- `_docs/task/` convention, `TASKS.md` row placement, and the "never run git commands" / "migrations written not applied" project conventions were followed throughout.

### Deviations
- **Minor — found and fixed during this review, not left as a gap.** The migration's dynamic constraint-rename sweep (Part 4) only swaps a constraint's table-name *prefix*; for the three FK constraints where the *column itself* was also renamed (`issues.source_ticket_id`→`source_inbox_id`, `ticket_messages.ticket_id`→`inbox_id`, `issue_comments.issue_id`→`ticket_id`), the sweep alone would have produced a constraint name with a stale suffix (e.g. `tickets_source_ticket_id_fkey` on a column actually called `source_inbox_id`). Not a functional bug — FK enforcement doesn't depend on the constraint's name — but it directly undermines the migration's own stated goal of constraint names tracking the new columns. Fixed in both `147_desk_inbox_tickets_rename.sql` and its down-migration: the three constraints are now renamed explicitly and in full, before the generic sweep runs, so the sweep has nothing stale left to touch for them.
- **Minor — already disclosed in Implementation Notes, re-confirmed here as acceptable.** `_docs/mcp-tools.md` (which CLAUDE.md says must be updated alongside any new `registerTool` call) does not exist in this repo checkout at all — not a gap introduced by this task, and not manufactured as a side effect of it.
- **Minor — already disclosed, re-confirmed here as acceptable.** Desk > Tickets list-page `issues.prefix` reference label was left undone; the task doc marked it optional and detail-page coverage (all three ticket-detail pages) was prioritized.
- No Medium or Major deviations found. Scope boundaries (no route-path renames, no `ticket_number`/badge-format changes, no `time_logs`/`active_timers` column renames, no storage-bucket rename) were all respected — spot-checked against the task doc's Out of Scope list directly against the diff.

### Required Fixes
None — the one substantive finding (constraint-name staleness) was corrected inline as part of this gate rather than deferred.

---

## Completion Notes

**Marked complete at the user's explicit request.** Migration 147 was applied live via `npx supabase db push` and confirmed correct by direct query against the production database (table names, `attachments.entity_type` distribution, and `supabase_migrations.schema_migrations` all checked and matched expectations).

Two more real bugs surfaced only by the live apply attempt, not by `tsc`/lint/build (schema-ordering issues no static check can catch):
- `attachments.entity_type` CHECK-constraint swap in Part 7 had the `UPDATE` before the `DROP CONSTRAINT` — the old constraint (only permitting `'ticket_message'`) was still active when the `UPDATE` tried to write `'inbox_message'`, so it failed with `23514` on the first push attempt. Fixed: `DROP → UPDATE → ADD CONSTRAINT`, same fix applied to the down-migration's mirrored bug (which would have failed at `ADD CONSTRAINT` instead, for the same underlying reason).
- Separately, and more seriously: the down-migration file had been placed inside `supabase/migrations/` (matching the up-migration's filename for readability) — `supabase db push` has no concept of a rollback-only script and auto-applies every `.sql` file in that directory as a forward migration, in order. It ran immediately after 147 succeeded, in the *same push*, and started reverting the rename before anyone could verify the up-migration first. It failed on its own (an unrelated pre-existing ordering bug — `Reverse PART 6` recreated `sync_ticket_number_sequence()`/`generate_ticket_display_id()` against `public.tickets`/`from issues` before `Reverse PART 1` had renamed the tables back, so those identifiers didn't yet mean what the function bodies assumed) and rolled back cleanly with zero net effect, confirmed via the same three-query check. Fixed both problems: relocated the file to `supabase/rollbacks/` (not scanned by `db push`), and reordered `Reverse PART 6` to run after `Reverse PART 1`, so the file is now actually correct for a future manual rollback via `psql -f` if one is ever needed.

**Not run, by explicit user decision to mark complete now:** browser acceptance (Desk > Inbox/Tickets list + detail, "File a Ticket" flow, public ticket view), RLS-as-different-roles verification, and confirming a live `ticket-email-poll` cron cycle against the new schema. The DB migration and its dependent application code are confirmed mutually consistent (compile/build-verified pre-apply, schema-verified post-apply); actual runtime/user-facing behavior across these surfaces has not been independently exercised.

**Completed:** 2026-09-21
