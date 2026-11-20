# 489: Desk Inbox — Delete (soft) and Restore a thread

**Created:** 2026-11-19
**Priority:** MEDIUM
**Type:** feature (migration)
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

The Desk Inbox (`/desk/inbox`, `inbox` table) has no way to remove a thread. The UI has none, and the API has none either: the only `inbox` deletes are rollbacks in `src/lib/stackshift-support/create-ticket.ts:130,137`. Staff can only change the status (e.g. Closed). Spam, test emails and junk threads stay in the list.

This task adds a **soft delete**: Admins and PMs can delete a thread, which hides it everywhere in the Hub. A new **Deleted** filter view lists deleted threads, and a **Restore** action brings one back.

### Decisions (confirmed with the user, 2026-11-19)

| # | Decision |
|---|----------|
| D1 | **Soft delete, not hard delete.** New `inbox.deleted_at` / `inbox.deleted_by` columns. Why not a hard delete: (a) `attachments` is polymorphic (`entity_type='ticket_message'`), so a hard delete would leave orphan rows and Storage objects; (b) the Zoho Desk importer and poll upsert on `external_id` / `desk_ticket_id`, so a hard-deleted Desk thread would come back on the next run. |
| D2 | **Admin + PM only** (`admin`, `super_admin`, `pm`), the same gate as `PATCH /api/desk/tickets/[ticketId]/status`. Developers can't delete, even though the `inbox_staff_all` RLS policy allows them. The route checks the role explicitly. |
| D3 | **Filed tickets and tasks keep their links.** `tickets.source_inbox_id` and `tasks.inbox_id` are untouched, because the row still exists. **StackShift-direct threads (`channel = 'stackshift'`) can't be deleted.** The route returns 409 with "Close this ticket instead", so the StackShift app stays in sync. No StackShift outbox event is sent. |
| D4 | **A new inbound customer message restores the thread.** If the email poll or the Zoho Desk poll appends a customer message to a deleted thread, clear `deleted_at`/`deleted_by` so the thread shows up again. This happens alongside the existing reopen-on-reply logic (task 327). |
| D5 | **"Deleted" filter view + Restore button.** Add a "Deleted" option to the status filter. Like "Archived", it is exclusive and opt-in, and it is never part of "All". The thread detail page shows a Restore action when the thread is deleted. |

> **Why columns instead of `source_meta`:** task 450 hides retired rows with `source_meta.retiredInto`, but the Desk importer and the poll rewrite the whole `source_meta` object on upsert (`desk-tickets-import.ts:239`, `desk-ticket-poll/route.ts:344`). A `source_meta.deletedAt` flag would be wiped and the thread would come back. Real columns aren't in either upsert payload, so they survive.

## Requirements

- [ ] Migration `185_inbox_soft_delete.sql` (written, not applied): `inbox.deleted_at timestamptz null`, `inbox.deleted_by uuid null references auth.users(id) on delete set null`, plus a partial index `inbox_not_deleted_created_idx on inbox (created_at desc) where deleted_at is null`. Include a commented rollback block. No RLS change: hiding is done in app queries, so the Deleted view can still read the rows.
- [ ] `DELETE /api/desk/tickets/[ticketId]`: session + admin/super_admin/pm check, UUID check, 404 if missing, **409 if `channel = 'stackshift'`**, idempotent if already deleted. Sets `deleted_at = now()` and `deleted_by = user.id` through `adminClient` (same pattern as the status route).
- [ ] `POST /api/desk/tickets/[ticketId]/restore`: same gate; clears both columns; idempotent.
- [ ] Both routes return **503** `{ error: "Thread delete is not available yet (migration 185 not applied)" }` on Postgres `42703`.
- [ ] **Inbox list** (`desk/inbox/page.tsx`): hide deleted rows by default (`.is("deleted_at", null)`). The new "Deleted" filter value shows **only** deleted rows (`.not("deleted_at", "is", null)`) and ignores the other status/archived filters. The count and pagination follow the filter. **Degrade:** on `42703`, run the query again without the deleted filter so the Inbox keeps working before migration 185 is applied, and hide the "Deleted" option.
- [ ] **Detail page** (`desk/inbox/[inboxId]`): a "Delete thread" button (lucide `Trash2`, `aria-label`, loading state) inside a confirm step. The confirm step must be an inline/popover confirm in the page, never `window.confirm`. On success, redirect to `/desk/inbox` with a sonner toast "Thread deleted" plus an **Undo** action that calls restore. Hide or disable the button with a tooltip for `channel = 'stackshift'`. When the thread is deleted, show a "Deleted on {date} by {name}" banner and a **Restore** button instead of Delete. Reply/note actions stay available.
- [ ] **Other places that list threads hide deleted rows:** `desk/accounts/[id]/page.tsx`, `desk/contacts/[id]/page.tsx`, `src/lib/mcp/tools/list-tickets.ts`, `src/lib/ai/ops-chat-tools.ts` (list tickets), `src/app/api/v2/projects/[projectId]/tickets/route.ts` (if it lists inbox threads), and the inbox search/counts. Each of these also needs the same `42703` fallback.
- [ ] **Public customer view** (`(public)/tickets/[ticketId]` + `api/public/tickets/[ticketId]/view`): a deleted thread returns the existing not-found state.
- [ ] **Restore on inbound (D4):** in `src/app/api/cron/email-poll/route.ts`, next to the task 327 reopen (`~line 267`), clear `deleted_at`/`deleted_by` when the matched thread is deleted. In `src/app/api/cron/desk-ticket-poll/route.ts`, do the same when new customer threads or comments are synced into an existing row. Ignore a `42703` error here (pre-migration) so the pollers don't fail.
- [ ] Importers (`src/lib/migrate/desk-*-import.ts`, `reconcile.ts`) must **not** put `deleted_at` in their upsert payloads. Leaving it out is what stops a re-import from undeleting a thread.

## Out of Scope / Must-Not-Change

- No hard delete or purge of rows, messages, attachments or Storage objects.
- No delete for StackShift-direct threads, and no new StackShift outbox event type.
- No change to `inbox_staff_all` / `inbox_client_*` RLS policies, the `Archived` (Zoho archive) filter semantics, or the task 450 `retiredInto` / `?retired=1` behaviour.
- No change to filed `tickets` / `tasks` rows or their `source_inbox_id` / `inbox_id` links.
- Bulk delete from the list (checkboxes) is out of scope. It's a possible follow-up.
- Don't touch the StackShift reader paths (`src/lib/stackshift-support/*`). StackShift threads can't be deleted, so they never see a deleted row.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/185_inbox_soft_delete.sql` | Create | `deleted_at`, `deleted_by`, partial index, rollback comment |
| `src/app/api/desk/tickets/[ticketId]/route.ts` | Create | `DELETE`: soft delete (D2, D3) |
| `src/app/api/desk/tickets/[ticketId]/restore/route.ts` | Create | `POST`: restore |
| `src/lib/desk/inbox-deleted.ts` | Create | `isMissingColumn(err)` (42703) helper + `withoutDeleted(query)` / retry wrapper shared by readers |
| `src/app/(hub)/desk/inbox/_status-filter.ts` | Modify | `DELETED_FILTER_VALUE = "deleted"`, option "Deleted", kept out of `ALL_STATUS_VALUES` |
| `src/app/(hub)/desk/inbox/_inbox-index.tsx` | Modify | Mark "Deleted" exclusive, with a divider like Archived; hide it when the server reports the migration missing |
| `src/app/(hub)/desk/inbox/page.tsx` | Modify | Default exclude, Deleted-only branch, 42703 fallback |
| `src/app/(hub)/desk/inbox/[inboxId]/page.tsx` | Modify | Select `deleted_at, deleted_by` (+ deleter name), with a fallback |
| `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` | Modify | Delete button + inline confirm, deleted banner, Restore, toast with Undo |
| `src/app/(hub)/desk/accounts/[id]/page.tsx`, `src/app/(hub)/desk/contacts/[id]/page.tsx` | Modify | Exclude deleted |
| `src/lib/mcp/tools/list-tickets.ts`, `src/lib/ai/ops-chat-tools.ts` | Modify | Exclude deleted |
| `src/app/(public)/tickets/[ticketId]/page.tsx`, `src/app/api/public/tickets/[ticketId]/view/route.ts` | Modify | Deleted → not found |
| `src/app/api/cron/email-poll/route.ts`, `src/app/api/cron/desk-ticket-poll/route.ts` | Modify | Restore on inbound (D4) |
| `_docs/mcp-tools.md` | Modify | Note that `list_tickets` hides deleted Desk threads |

## Code Context

### Status route: the pattern to copy (`src/app/api/desk/tickets/[ticketId]/status/route.ts`)

```ts
const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (!["admin", "super_admin", "pm"].includes(profile?.role ?? "")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
const { ticketId } = await params;
if (!/^[0-9a-f]{8}-...$/i.test(ticketId)) return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
// write via adminClient.from("inbox").update(...).eq("id", ticketId).select("id").maybeSingle()
```

StackShift-direct check: `inbox.channel === "stackshift"` (see `enqueueStatusChanged` in `src/lib/stackshift-support/outbox.ts:15`).

### Inbox list filter (`src/app/(hub)/desk/inbox/page.tsx:111-139`)

The query is built with `.or(statusClause)` / `.or(NOT_ARCHIVED_OR)` / `.or(IS_ARCHIVED)` branches, then `.is("source_meta->retiredInto", null)` (task 450). Add the Deleted branch **before** the status branches: when `deleted` is selected, skip the status/archived logic and apply `.not("deleted_at", "is", null)`. Otherwise add `.is("deleted_at", null)`. The page already restricts to admin/super_admin/pm (line 98).

### Status filter (`src/app/(hub)/desk/inbox/_status-filter.ts`)

`ARCHIVED_FILTER_VALUE` is kept out of `ALL_STATUS_VALUES` and passed as `exclusiveValue` / `dividerBeforeValue` to `_filter-multi-select.tsx` (task 331). Give "Deleted" the same treatment. `_filter-multi-select` currently takes one `exclusiveValue`; extend it to accept a list.

### Detail status control (`src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx:397-419`)

The "Key Information" card holds the Status `<select>` and uses controlled `useState` + inline `fetch` + inline error. Use the same pattern for Delete/Restore (no react-hook-form). Hand-rolled styling only, matching the hex colours around it. Use `toast.*` only for the transient "Thread deleted · Undo".

### Reopen on reply (`src/app/api/cron/email-poll/route.ts:267-270`)

```ts
// Reopen a closed ticket when the customer replies (task 327).
if (matchedTicketStatus === "closed") {
  await adminClient.from("inbox").update({ status: "open" }).eq("id", ticketId);
}
```

Add D4 here: if the matched row has `deleted_at`, also send `{ deleted_at: null, deleted_by: null }`. That means selecting `deleted_at` in the match query, with a 42703 fallback.

### Foreign keys into `inbox` (from migrations 025/137/147/169)

- `inbox_messages.inbox_id`: on delete cascade (not triggered: soft delete)
- `stackshift_outbox.ticket_id`: on delete cascade (not triggered)
- `tickets.source_inbox_id`, `tasks.inbox_id`: on delete set null (not triggered; links kept, D3)
- `attachments` (`entity_type='ticket_message'`, `entity_id = inbox_messages.id`): polymorphic, no FK. This is the reason hard delete was rejected (D1).

## Implementation Steps

1. Write migration 185 with the rollback block. Don't apply it (the operator applies it).
2. Add `src/lib/desk/inbox-deleted.ts`: `isMissingColumn(error)` (code `42703`) and a small helper that runs a query builder with the deleted filter and runs it again without the filter on 42703.
3. Add the DELETE and restore routes (D2, D3, 503 degrade).
4. Status filter: add the "Deleted" value and option, exclusive handling in `_filter-multi-select` / `_inbox-index`.
5. Inbox list page: deleted branch, default exclude, fallback, and pass `deletedSupported` to hide the option.
6. Detail page + `_ticket-detail.tsx`: load the deleted fields; add Delete with inline confirm (blocked for stackshift), the banner, Restore, and the toast with Undo.
7. Exclude deleted rows in accounts, contacts, MCP list-tickets, ops-chat, public view and the project tickets route, each with the fallback.
8. Restore on inbound in email-poll and desk-ticket-poll (D4), ignoring 42703.
9. Confirm the importer and reconcile payloads don't include `deleted_at`.
10. Update `_docs/mcp-tools.md` and add a line to `_docs/context/zoho-desk-import.md` about soft delete surviving re-import.
11. Run `npx tsc --noEmit` and eslint on the changed files.

## Acceptance Criteria

- [ ] An Admin or PM can delete a non-StackShift thread from its detail page after confirming. They land on `/desk/inbox`, the thread is gone from the default list, and the toast's Undo restores it.
- [ ] A Developer calling `DELETE /api/desk/tickets/{id}` gets 403. Not signed in gets 401. A bad id gets 400. An unknown id gets 404. A `channel='stackshift'` thread gets 409, and the button is not offered in the UI.
- [ ] Deleting twice, or restoring a thread that isn't deleted, returns 200 and changes nothing.
- [ ] Filter → "Deleted" shows only deleted threads, the count matches, and choosing it clears the other statuses (and choosing "All" clears Deleted). Deleted threads never appear under "All", "Archived" or any status.
- [ ] A deleted thread's detail page shows the banner with date and name, and Restore brings it back into the default list.
- [ ] Deleted threads don't appear on account or contact pages, in MCP `list_tickets`, or in Ops Chat ticket lists. The public customer link shows not-found.
- [ ] Filed tickets and tasks created from a deleted thread still open, and their source link still resolves.
- [ ] A customer email reply to a deleted thread restores it (and reopens it if it was closed). A Desk poll that syncs a new customer thread restores it too.
- [ ] Re-running the Zoho Desk import, or a poll that only updates metadata, does **not** restore a deleted thread.
- [ ] **Before migration 185 is applied:** the Inbox, detail page, accounts/contacts pages, MCP, Ops Chat and both pollers work as before. The "Deleted" option is hidden. The delete and restore routes return 503 and the UI shows that error inline.

## Verification

```bash
npx tsc --noEmit
npx eslint "src/app/(hub)/desk/inbox" "src/app/api/desk/tickets" src/lib/desk src/lib/mcp/tools/list-tickets.ts src/lib/ai/ops-chat-tools.ts src/app/api/cron/email-poll src/app/api/cron/desk-ticket-poll
# Migration 185 + rollback on PGlite (same approach as 486/487): columns, index, idempotent re-run
```

Browser checks: run once **before** migration 185 is applied (degrade path: Inbox loads, no Deleted option, Delete → inline 503 error) and once **after** (all acceptance criteria). Use a test-flagged customer's thread where possible (`customers.is_test`). curl checks for the 401/403/400/404/409/200 matrix.

## Compatibility Touchpoints

- **Migration:** 185 is written, not applied. The code degrades on `42703`. Apply it after 182–184 (no dependency between them; it's just the next number).
- **MCP:** `list_tickets` behaviour changes (hides deleted rows). No new tool, but `_docs/mcp-tools.md` gets a note.
- **Docs:** `_docs/context/zoho-desk-import.md` gets a line saying soft-deleted threads survive re-import and come back on customer reply.
- **StackShift:** no contract change; direct threads can't be deleted.
- **Task 458** (Desk Inbox reply, Planned) touches `_ticket-detail.tsx`. Expect a merge in the Key Information / header area if both are in flight.

## Implementation Notes

### What Changed
- Migration 185 adds `inbox.deleted_at` / `deleted_by` (FK `auth.users`, on delete set null) and partial index `inbox_not_deleted_created_idx`, with a commented rollback. Written, not applied.
- New `excludingDeleted(run)` helper (same shape as `excludingChecklist()`): runs the query with `.is("deleted_at", null)` and re-runs it unfiltered on a `42703` that names `deleted_at`/`deleted_by`. It also returns `deletedSupported`. `restoreDeletedThread()` clears a soft delete and never throws.
- `DELETE /api/desk/tickets/[ticketId]` and `POST /api/desk/tickets/[ticketId]/restore` share `_soft-delete.ts`: 401/403 (admin, super_admin, pm only)/400/404, 409 for `channel = 'stackshift'` (delete only), idempotent, 503 before the migration.
- Inbox list: a new exclusive "Deleted" view (`DELETED_FILTER_VALUE`, kept out of "All", hidden while `deletedSupported` is false). Deleted rows are excluded everywhere else. The Deleted view has its own empty-state text. `FilterMultiSelect` (inbox copy) now takes `exclusiveValues[]` instead of `exclusiveValue`.
- Detail page: a "Delete thread" card at the bottom of the left column with an inline confirm (no `window.confirm`). On success: toast "Thread deleted" with **Undo**, then redirect to the Inbox. StackShift threads get a "close instead" note. A deleted thread shows a banner ("Deleted on … by …") with **Restore**.
- Deleted threads are hidden on account and contact pages, MCP `list_tickets`, Ops Chat `list_tickets`, and the public customer view (page + view API → not found).
- D4: email-poll restores a matched existing thread after the task 327 reopen. The Desk poll restores when `syncTicketMessages()` inserted at least one client message (new `clientMessagesInserted` counter).

### Files Changed
- `supabase/migrations/185_inbox_soft_delete.sql` - new columns and index
- `src/types/database.ts` - `inbox` Row/Insert/Update gain `deleted_at`, `deleted_by`
- `src/lib/desk/inbox-deleted.ts` - `excludingDeleted`, `isMissingDeletedColumn`, `restoreDeletedThread`
- `src/app/api/desk/tickets/[ticketId]/_soft-delete.ts`, `route.ts`, `restore/route.ts` - delete/restore API
- `src/app/(hub)/desk/inbox/_status-filter.ts`, `_filter-multi-select.tsx`, `_inbox-index.tsx`, `page.tsx` - Deleted view and exclusion
- `src/app/(hub)/desk/inbox/[inboxId]/page.tsx`, `_ticket-detail.tsx` - delete/restore UI
- `src/app/(hub)/desk/accounts/[id]/page.tsx`, `src/app/(hub)/desk/contacts/[id]/page.tsx` - exclude deleted
- `src/lib/mcp/tools/list-tickets.ts`, `src/lib/ai/ops-chat-tools.ts` - exclude deleted
- `src/app/(public)/tickets/[ticketId]/page.tsx`, `src/app/api/public/tickets/[ticketId]/view/route.ts` - deleted → not found
- `src/lib/desk/stackshift-message-sync.ts` - `clientMessagesInserted` in the sync result
- `src/app/api/cron/email-poll/route.ts`, `src/app/api/cron/desk-ticket-poll/route.ts` - restore on inbound (D4)
- `_docs/central-hub-mcp-tools.md`, `_docs/context/zoho-desk-import.md` - docs
- `_docs/task/489-inbox-soft-delete.sql-check.mjs` - PGlite migration check

### Deviations From Plan
- `src/app/api/v2/projects/[projectId]/tickets/route.ts` is **not changed**. Its only `inbox` read is the source-thread lookup used to email the customer when a ticket is filed from a thread. It isn't a listing, and D3 keeps links to deleted threads working.
- `src/lib/desk/stackshift-message-sync.ts` was not in the file list. The Desk poll needed a count of *customer* messages inserted, so D4 doesn't fire on staff replies or metadata refreshes. The change is additive: one new counter in the result type, and the backfill route ignores it.
- The MCP doc is `_docs/central-hub-mcp-tools.md`. The task doc and CLAUDE.md say `_docs/mcp-tools.md`, which doesn't exist.
- The importers and `reconcile.ts` were checked and needed no changes: none of them write `deleted_at`.

### Verification Run
- `npx tsc --noEmit` - PASS (only the pre-existing stale `.next/types/validator.ts` errors for `projects/[classification]/page.js`, same as task 488)
- `npx eslint` on all changed source paths - PASS (no output)
- PGlite check of migration 185 (`_docs/task/489-inbox-soft-delete.sql-check.mjs`, pglite 0.2.17): columns, index, idempotent re-run, `deleted_by` set null on user delete, rollback keeps rows - PASS
- Browser checks (before and after migration 185) and the curl status matrix - SKIPPED (left for the `test` stage; migration 185 not applied)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Files reviewed are the ones listed in Implementation Notes. `git diff` was not run because CLAUDE.md forbids git commands.
- No blocking issues. Logic is shared rather than repeated: one `_soft-delete.ts` body serves both routes, and every reader goes through `excludingDeleted()`, which mirrors the existing `excludingChecklist()` pattern. Errors are handled on purpose: 503 when the column is missing, logged 500s otherwise, and `restoreDeletedThread()` never throws so the pollers keep running. No `any`, no debug logging, no dead code.
- The UI follows shipped conventions: controlled `useState` + inline `fetch` + inline errors, `toast.*` only for the transient Delete/Undo/Restore messages, `<button>` elements with focus rings and loading spinners, lucide icons, and hand-rolled hex/`text-[..px]` classes that match the rest of `_ticket-detail.tsx`. Nothing uses `window.confirm`.
- The permission gate copies the status route (an explicit admin/super_admin/pm check, then `adminClient` for the write), which is the documented pattern for this API tree.
- Non-blocking observations:
  - The detail page makes two extra small queries: soft-delete state, plus the deleter's name only when the thread is deleted. This is on purpose, so the main select keeps working before migration 185.
  - `POST /api/public/tickets/[id]/view` checks the password before it checks for deletion. A deleted thread still returns 404 after a correct password, and the public page already shows "not found" before the form ever renders, so nothing leaks.
  - In the Deleted view, rows keep their editable Status dropdown and Send Notification button, the same as any other Inbox row. Restore stays on the detail page. That matches the spec.

### Deviations
- **Minor:** `api/v2/projects/[projectId]/tickets/route.ts` was left unchanged. It's a point lookup for the "ticket created" email, not a listing, and D3 keeps links to deleted threads working.
- **Minor:** `src/lib/desk/stackshift-message-sync.ts` gained an additive `clientMessagesInserted` counter. D4 ("customer message restores the thread") can't be done correctly in the Desk poll without it.
- **Minor:** the MCP doc that was updated is `_docs/central-hub-mcp-tools.md`. The `_docs/mcp-tools.md` path named in CLAUDE.md and the task doc does not exist. CLAUDE.md itself is not changed here; that's for the `document` stage.
- **Minor:** `_filter-multi-select.tsx` (inbox copy) changed its `exclusiveValue?: string` prop to `exclusiveValues?: readonly string[]`. The inbox index is its only caller, and the `desk/tickets` copy is untouched.

### Required Fixes
- None.
