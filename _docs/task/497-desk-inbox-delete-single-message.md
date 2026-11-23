# 497: Desk Inbox — Delete a single message instead of the whole thread

**Created:** 2026-11-23
**Priority:** MEDIUM
**Type:** enhancement (+ small migration, written-not-applied)
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

On the Desk Inbox ticket detail page (`/desk/inbox/[inboxId]`), the sidebar **Delete thread** button (task 489) soft-deletes the whole conversation (`inbox.deleted_at`). That isn't what users want. They want to delete **one message** in the conversation: a stray customer email, a duplicate reply, a wrong internal note. Everything else in the thread should stay.

This task adds a per-message soft delete (`inbox_messages.deleted_at` / `deleted_by`) with a Delete action on each message card and an Undo toast. It also removes the sidebar "Delete thread" button.

### Decisions (confirmed with the user, 2026-11-23)

| # | Decision |
|---|----------|
| D1 | **Replace the thread button.** Remove the sidebar "Delete thread" block from the detail page. Each message gets its own Delete. Keep the 489 API (`DELETE /api/desk/tickets/[id]`, `POST …/restore`), the Inbox "Deleted" filter view, and the deleted-thread banner + **Restore** on the detail page, so threads that were already deleted can still be found and restored. |
| D2 | **Any message can be deleted** (customer message, staff reply, internal note, imported Zoho comment/thread). The exception is **StackShift-direct threads (`inbox.channel = 'stackshift'`)**: they return 409 and the UI shows no Delete, the same as 489 D3, so the StackShift app stays in sync. |
| D3 | **Soft delete + Undo toast.** New `inbox_messages.deleted_at` / `deleted_by`. Same reasons as 489 D1: the Zoho Desk importer and poll upsert on external ids and would recreate a hard-deleted row, and `attachments` (`entity_type='ticket_message'`) is polymorphic, so a hard delete would orphan attachment rows and their files. The new columns are never in an upsert payload, so re-import never undeletes. |

## Requirements

- [ ] **Migration 190** `supabase/migrations/190_inbox_messages_soft_delete.sql` (written, not applied): `alter table inbox_messages add column if not exists deleted_at timestamptz null, add column if not exists deleted_by uuid null references auth.users(id) on delete set null;` plus column comments and a rollback block in the header. No RLS change. Copy the shape of `185_inbox_soft_delete.sql`. (189 is taken by task 496.)
- [ ] **API** `DELETE /api/desk/tickets/[ticketId]/messages/[messageId]` (soft delete) and `POST /api/desk/tickets/[ticketId]/messages/[messageId]/restore`:
  - gate with `requireInboxStaff()` (admin/super_admin/pm); both ids must match `INBOX_ID_RE` (400 otherwise);
  - read the message with `adminClient` joined to its thread (`inbox_messages` → `inbox.channel`), and **require `inbox_id = ticketId`** (404 if it doesn't match or isn't found);
  - delete on a `stackshift` thread → 409 `"StackShift messages can't be deleted."` (D2). Restore is allowed on any thread, so it is never stuck;
  - idempotent (if the message is already in the requested state, return `{ ok: true }`);
  - 42703 on `deleted_at`/`deleted_by` → 503 `"Message delete is not available yet (migration 190 not applied)"`.
  - Shared body goes in `messages/[messageId]/_soft-delete.ts`, mirroring `tickets/[ticketId]/_soft-delete.ts`.
- [ ] **Detail page reader** (`page.tsx`): the `inbox_messages` select excludes deleted rows via the existing `excludingDeleted()` helper (`src/lib/desk/inbox-deleted.ts`). Its 42703 test matches `deleted_(at|by)` on any table. Pass `messageDeleteSupported` (from the helper's `deletedSupported`) into `TicketDetail`. Deleted messages and their attachments then disappear from the Conversations/Threads/Comments views, counts and the Attachments tab, because all of them derive from `messages`.
- [ ] **Public ticket view** (`api/public/tickets/[ticketId]/view/route.ts`): exclude deleted messages, with the same 42703 fallback.
- [ ] **Reply quote** (`reply/route.ts` ~line 173, the `lastPublic` query used for the quoted "Re:" body): exclude deleted messages, with the 42703 fallback. **Do not** change the `email_message_id` threading lookup (~line 136). Email headers still need to thread off the real last email even if it's hidden in the Hub.
- [ ] **UI: per-message Delete** (`_conversation-thread.tsx`): in `MessageCard`'s header row, as a sibling of the toggle button and `ThreadMessageActions` (never nested inside the toggle), add an icon-only `Trash2` button with `aria-label="Delete message"`, a hover state and a focus ring. Clicking it shows an inline confirm ("Delete this message?" with **Delete** / **Cancel**, a spinner while busy, and an inline error). Show it only when `canDeleteMessages` (`messageDeleteSupported && channel !== "stackshift"`) is passed down from `TicketDetail`.
- [ ] **On success:** `toast.success("Message deleted", { action: { label: "Undo", onClick: restore → router.refresh() } })`, then `router.refresh()`. The user stays on the thread; there is no redirect.
- [ ] **Remove the thread button** (`_ticket-detail.tsx` ~lines 544–592): delete the sidebar block, `confirmingDelete`, `handleDelete` and `canDelete`. Keep `restoreThread`, `handleRestore`, `deleteBusy`/`deleteError` (the banner uses them), and the deleted-thread banner (~line 597).

## Out of Scope / Must-Not-Change

- 489 thread-level API routes, the Inbox "Deleted" filter, the deleted-thread banner/Restore, and the D4 restore-on-inbound logic stay unchanged.
- No "show deleted messages" view. Undo is only in the toast (see Open Decisions).
- Pollers, importers, backfills, `sent-ingest`, `stackshift-support/*` and the attachment/inline-image routes keep reading **all** messages, deleted ones included. Their dedupe must still see deleted rows, otherwise the message would be re-inserted.
- `inbox.unread_count` (task 490 trigger) isn't recomputed on message delete.
- No StackShift outbox event.
- No hard delete. Attachment rows and files are kept.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/190_inbox_messages_soft_delete.sql` | Create | `deleted_at`/`deleted_by` columns (D3) |
| `src/app/api/desk/tickets/[ticketId]/messages/[messageId]/_soft-delete.ts` | Create | Shared delete/restore body |
| `src/app/api/desk/tickets/[ticketId]/messages/[messageId]/route.ts` | Create | `DELETE` |
| `src/app/api/desk/tickets/[ticketId]/messages/[messageId]/restore/route.ts` | Create | `POST` restore |
| `src/app/(hub)/desk/inbox/[inboxId]/page.tsx` | Modify | Exclude deleted messages; pass `messageDeleteSupported` |
| `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` | Modify | Remove the sidebar thread delete; pass `canDeleteMessages` to `ConversationThread` |
| `src/app/(hub)/desk/inbox/[inboxId]/_conversation-thread.tsx` | Modify | Per-message Delete + inline confirm + Undo toast |
| `src/app/api/public/tickets/[ticketId]/view/route.ts` | Modify | Exclude deleted |
| `src/app/api/desk/tickets/[ticketId]/reply/route.ts` | Modify | Quote excludes deleted |
| `src/types/database.ts` | Modify | Add the two columns to `inbox_messages` Row/Insert/Update |
| `src/lib/desk/inbox-deleted.ts` | Optional | Add a `MESSAGE_DELETE_UNAVAILABLE_MESSAGE` constant next to the thread one |

## Code Context

### Pattern to copy: `src/app/api/desk/tickets/[ticketId]/_soft-delete.ts` (task 489)
`requireInboxStaff()` → `INBOX_ID_RE` check → `adminClient` read with `isMissingDeletedColumn(readError)` → 503 → 404 → stackshift 409 on delete → idempotent short-circuit → update patch `{ deleted_at, deleted_by: gate.userId }` / `{ null, null }`. The route files are 5-line wrappers (`route.ts`, `restore/route.ts`). `messages/[messageId]/` has no `route.ts` today, only `attachments/` and `inline-images/` subfolders.

### Degrade helper: `src/lib/desk/inbox-deleted.ts`
```ts
export function isMissingDeletedColumn(error) { return error?.code === "42703" && /\bdeleted_(at|by)\b/.test(error.message ?? ""); }
export async function excludingDeleted(run: (exclude: boolean) => PromiseLike<R>): Promise<R & { deletedSupported: boolean }>
```
Usage: `excludingDeleted((ex) => { let q = supabase.from("inbox_messages").select(…).eq("inbox_id", t.id); if (ex) q = q.is("deleted_at", null); return q.order("created_at", { ascending: true }); })`.

### Detail page message read (`page.tsx:160-165`)
```ts
const { data: messagesData } = await supabase.from("inbox_messages")
  .select("id, author_type, author_id, body, visibility, source_meta, created_at, email_message_id")
  .eq("inbox_id", t.id).order("created_at", { ascending: true });
```
The page is already gated to admin/super_admin/pm (`page.tsx:101-103`), so every viewer can delete. The server re-checks anyway.

### Thread delete UI to remove (`_ticket-detail.tsx`)
- `:222` `const canDelete = ticket.deletedSupported && ticket.channel !== "stackshift";`
- `:338-365` `handleDelete()` (remove); `:330` `restoreThread()` and `:367` `handleRestore()` (keep, the banner uses them)
- `:544-592` sidebar block with the "Delete thread" button (remove)
- `:789-796` `<ConversationThread … />` (add `canDeleteMessages`)

### Message card header (`_conversation-thread.tsx:185-217`)
A flex row containing the toggle `<button>` plus `{m.authorType === "client" && <ThreadMessageActions …/>}`. Add the Delete control as another sibling after it, for every author type. `ConversationThread` is keyed on `convView`, and `router.refresh()` re-renders it with the new `messages`.

### Readers of `inbox_messages` (grep `inbox_messages` in `src/`)
Change only the three user-visible readers: `(hub)/desk/inbox/[inboxId]/page.tsx`, `api/public/tickets/[ticketId]/view/route.ts`, and `api/desk/tickets/[ticketId]/reply/route.ts` (quote only). Leave everything else alone (cron/email-poll, migrate/desk-*-import, email/*, stackshift-support/*, admin backfills, attachment/inline-image routes): they're ingest/dedupe or StackShift paths, and StackShift threads can't be deleted.

## Implementation Steps

1. Write migration 190 and add the columns to `src/types/database.ts`.
2. Write `messages/[messageId]/_soft-delete.ts` + `route.ts` (DELETE) + `restore/route.ts` (POST).
3. Switch the `page.tsx` message read to `excludingDeleted`, then thread `messageDeleteSupported` into the `ticket` prop.
4. Exclude deleted messages in the public view route and in the reply-quote query, each with a 42703 retry.
5. `_conversation-thread.tsx`: add the per-message Delete control, inline confirm and Undo toast, and the `canDeleteMessages` prop.
6. `_ticket-detail.tsx`: remove the sidebar thread delete and pass `canDeleteMessages`.
7. `npx tsc --noEmit` + eslint on the changed files.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` and `npx eslint` on changed files | No new errors (stale `.next` types excepted, as in 489/490) | pre-merge |
| 2 | `grep -n "Delete thread" "src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx"` | No matches | pre-merge |
| 3 | PGlite: apply 190 twice on a table shaped like `inbox_messages`, then run the rollback | Columns added, re-run is a no-op, rollback drops both (same approach as `_docs/task/489-inbox-soft-delete.sql-check.mjs`) | pre-merge |
| 4 | Browser (admin, migration 190 applied): open an email thread with ≥3 messages, click Delete on the middle message → Delete | Toast "Message deleted" with Undo; message gone; the other messages and the thread itself remain; URL unchanged | post-deploy |
| 5 | Same, click **Undo** in the toast | Message reappears in its original position | post-deploy |
| 6 | `curl -X DELETE …/api/desk/tickets/<A>/messages/<message of thread B>` (staff session) | 404; message B untouched | post-deploy |
| 7 | DELETE a message on a `channel='stackshift'` thread | 409; the UI shows no Delete button on StackShift threads | post-deploy |
| 8 | DELETE as a `developer` session | 403 (from `requireInboxStaff`) | post-deploy |
| 9 | Before migration 190 is applied: open any thread | Page loads with all messages; no per-message Delete buttons; DELETE route returns 503 | pre-merge (local, unapplied DB) |
| 10 | Delete a public customer message, then load the public ticket view (`/api/public/tickets/<id>/view`) | The deleted message is not in `messages` | post-deploy |
| 11 | **No regression:** open a thread soft-deleted under 489 | Banner + **Restore** still shown and working; Inbox "Deleted" filter still lists it | post-deploy |
| 12 | **No regression:** run the Desk poll / email poll for a thread with a deleted message | The deleted message is not re-inserted (row count for that `inbox_id` unchanged) and stays deleted | post-deploy, manual (needs live poll) |
| 13 | **No regression:** reply on an email thread whose last email was deleted | Email still threads (`In-Reply-To` set); a fresh "Re:" quote, if used, quotes the last *visible* public message | post-deploy, manual (needs Zoho Mail) |

## Verification

```bash
npx tsc --noEmit
npx eslint "src/app/(hub)/desk/inbox/[inboxId]" "src/app/api/desk/tickets/[ticketId]" "src/app/api/public/tickets/[ticketId]/view"
node _docs/task/497-inbox-messages-soft-delete.sql-check.mjs   # AC3, modelled on 489's check
```
Then run the browser checks 4–5, 7, 9–11 on the dev server, and curl checks 6–8.

## Coordination

- **489** (Testing): this task removes 489's sidebar Delete button from `_ticket-detail.tsx` and reuses `inbox-deleted.ts`. Shared files: `_ticket-detail.tsx`, `page.tsx`, `api/public/tickets/[ticketId]/view/route.ts`. **Land after 489.** Update 489's doc / user guide to say the thread delete button was replaced by 497.
- **490** (Testing): also edits `_ticket-detail.tsx` and `page.tsx`. **Land after 490.**
- **458** (Planned; its code is already in the working tree): edits `reply/route.ts`, `_conversation-thread.tsx`, `_ticket-detail.tsx` and `page.tsx`. The `lastPublic` quote query this task touches *is* 458's code. **Land after 458**, and edit on top of its working-tree version.
- **321** (In Progress): owns `messages/[messageId]/inline-images/*`. This task adds sibling files under `messages/[messageId]/` and doesn't touch 321's files. No ordering needed.
- **496** (Testing) took migration number 189, so this task uses **190**.

## Open Decisions

- **NON-BLOCKING — N1: no "show deleted messages" view.** Default: once the Undo toast is gone, a deleted message can only be recovered with SQL (`update inbox_messages set deleted_at = null, deleted_by = null where id = …`) or a call to the restore route. A "N deleted · Show" toggle could be a follow-up if users ask for one.
- **NON-BLOCKING — N2: what happens to the thread-level API.** Default: keep `DELETE /api/desk/tickets/[id]` even though no UI calls it any more. Removing it can be a separate cleanup once 489 ships.

## Operator Steps

1. Apply `supabase/migrations/190_inbox_messages_soft_delete.sql` in the Supabase SQL editor (after 185, which is also not applied yet). Until then the per-message Delete stays hidden and the route returns 503.
2. Deploy: only the Hub Next.js app. Found by grep: every changed file is under `src/app` or `src/lib/desk`; no edge functions or other deployables import `inbox-deleted.ts`.

## Compatibility Touchpoints

- No MCP tool changes (`api/mcp/route.ts` doesn't read `inbox_messages`), so `_docs/mcp-tools.md` stays unchanged.
- User-facing docs: the Desk Inbox section that describes "Delete thread" (489) needs updating in the document stage.

## Baseline (before changes, 2026-11-23)
- `npx tsc --noEmit`: 0 errors.
- AC2 `grep -c "Delete thread" _ticket-detail.tsx`: 1 (fails first, as expected).
- AC3: migration 190 did not exist.

## Implementation Notes

### What Changed
- Migration 190 adds `inbox_messages.deleted_at` / `deleted_by` (FK `auth.users`, on delete set null). Written, not applied.
- New `DELETE /api/desk/tickets/[ticketId]/messages/[messageId]` and `POST …/restore`, sharing `_soft-delete.ts`. Checks: staff gate, both ids must be UUIDs (400), the message must belong to the thread (404), delete on a StackShift thread returns 409 (restore stays allowed), idempotent, 503 until migration 190 is applied.
- The detail page, the public ticket view and the reply route's `lastPublic` quote now read through `excludingDeleted()`. The `email_message_id` threading lookup in the reply route is unchanged.
- Each message card has an icon-only Delete (`aria-label="Delete message"`) with an inline confirm, a spinner, an inline error, and an Undo toast followed by `router.refresh()`. It shows only when `messageDeleteSupported && channel !== "stackshift"`.
- The sidebar "Delete thread" block, `handleDelete` and `confirmingDelete` are removed from `_ticket-detail.tsx`. `restoreThread` / `handleRestore` and the deleted-thread banner are kept.

### Files Changed
- `supabase/migrations/190_inbox_messages_soft_delete.sql` - columns (D3)
- `_docs/task/497-inbox-messages-soft-delete.sql-check.mjs` - PGlite check (AC3)
- `src/types/database.ts` - `inbox_messages` Row/Insert/Update columns
- `src/lib/desk/inbox-deleted.ts` - `MESSAGE_DELETE_UNAVAILABLE_MESSAGE`
- `src/app/api/desk/tickets/[ticketId]/messages/[messageId]/_soft-delete.ts`, `route.ts`, `restore/route.ts` - API
- `src/app/(hub)/desk/inbox/[inboxId]/page.tsx` - hide deleted messages, pass `messageDeleteSupported`
- `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` - thread Delete removed, `canDeleteMessages` passed down
- `src/app/(hub)/desk/inbox/[inboxId]/_conversation-thread.tsx` - `MessageDeleteControl`
- `src/app/api/public/tickets/[ticketId]/view/route.ts` - hide deleted messages
- `src/app/api/desk/tickets/[ticketId]/reply/route.ts` - quote skips deleted messages

### Deviations From Plan
- The API reads the message and the thread channel in two queries instead of a join, to avoid depending on a typed relationship in `database.ts`. Same behaviour.
- `TicketDetailData.deletedSupported` (489) was dead after the thread Delete was removed; the quality gate removed it (see Quality Gate Notes).

### Verification Run
- `npx tsc --noEmit` - PASS (baseline 0 → now 0)
- `npx eslint` on changed dirs + `inbox-deleted.ts` - PASS (no output)
- AC2 grep - PASS (baseline 1 → now 0)
- AC3 PGlite `node 497-inbox-messages-soft-delete.sql-check.mjs …/190_…sql` - PASS (apply + re-run, soft delete / FK set null, rollback)
- Dev-server smoke check (`pnpm dev -p 3497`), no session: `DELETE /api/desk/tickets/<uuid>/messages/<uuid>` → `401 {"error":"Unauthorized"}`, same as the 489 `DELETE /api/desk/tickets/<uuid>`. Confirms the route compiles and is gated.
- AC4–AC13 - SKIPPED. They need a signed-in admin session, migration 190 applied, and live Zoho polls/Mail. They belong to the test stage.

### Attempts That Failed
- The first smoke curl loop returned bare `400`s with empty bodies on all three calls, including the restore call. On a second run against a freshly started server, the same request returned a proper `401` JSON response. The first readiness wait most likely raced the server's compile of the route. Not a code issue; nothing was changed.

### Operator Steps
- Apply `supabase/migrations/190_inbox_messages_soft_delete.sql`. It's independent of 185, but apply 185 too for the 489 banner and filter. Until 190 is applied, the per-message Delete is hidden and the route returns 503.
- Deploy: the Hub Next.js app only. The diff touches only `src/app/**`, `src/lib/desk/inbox-deleted.ts` and `src/types/database.ts`. `grep -rl inbox-deleted src supabase/functions` turns up only Hub app files.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Fixed in gate:** `TicketDetailData.deletedSupported` and its computation in `page.tsx` had no readers once the sidebar thread Delete was removed, and the field's comment ("Delete is hidden then") was false. Removed the field, the `deletedSupported` variable, the unused `deletedError` destructure and the `isMissingDeletedColumn` import in `page.tsx`. A 42703 still leaves `deletedRow` null, so the banner is hidden pre-185, which is the same behaviour as before. Re-ran `npx tsc --noEmit` (0 errors) and eslint on the changed dirs (clean).
- `_soft-delete.ts` mirrors the 489 shape: gate, then id validation, then the ownership-scoped read (`eq inbox_id`), then 503/404, then the StackShift 409, then the idempotent write. Errors are logged with a route tag. No `any`, no debug logging.
- `MessageDeleteControl` stays page-scoped in `_conversation-thread.tsx` (CLAUDE.md rule). It's a sibling of the toggle `<button>` (no nested buttons), with `aria-label`, hover and focus ring, a loading state and an inline error, built with Tailwind + static classes. Hex/`[..px]` values match the surrounding file's existing palette.
- The `excludingDeleted` reuse in three readers repeats one 5-line `let q … if (exclude) …` shape. Acceptable: it's the documented usage of the helper (same as 489's readers).
- `restoreThread()` now has a single caller (`handleRestore`). Kept as-is because it is 489's code and inlining it gains nothing.

### Acceptance-criteria coverage
- AC1–AC3 have runnable checks, and all of them passed. AC2 failed first (baseline 1 → 0).
- **Weak/unrun:** AC9 (pre-migration page hides Delete) needs a signed-in admin, so the only pre-merge evidence is the 401 smoke check plus typecheck. AC12/AC13 are `manual` (they need live polls / Zoho Mail), as stated in the plan.

### Deviations
- **Minor:** the API uses two queries (message, then thread channel) instead of a join. Behaviour is unchanged.
- **Minor:** the gate removed the dead 489 `deletedSupported` prop. This is a deletion only, with no behaviour change. It touches 489's file, which 497 already edits, so there's no new coordination.

### Required Fixes
- None.

## Post-gate change (2026-11-23, user request)
- The per-message Delete now opens the shared `ConfirmDialog` modal (`src/components/ui/confirm-dialog.tsx`, the same one Delete Project uses). It replaces the inline "Delete this message?" confirm in the header row.
- **Dialog text:** title "Delete this message?"; the body says only this message is removed and that Undo is available.
- **While deleting:** the confirm label shows "Deleting…" and the button is disabled. Cancel is ignored until the request finishes.
- **On failure:** `ConfirmDialog` has no error slot, so the error goes to `toast.error` and the dialog stays open for a retry.
- **On success:** the dialog closes and the "Message deleted" toast with Undo appears, as before.
- `npx tsc --noEmit` and eslint on `_conversation-thread.tsx`: PASS. The browser check (AC4/AC5) is still pending migration 190.
