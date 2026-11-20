# 490: Desk Inbox — "new message" indicator, per-thread unread count and a live counter

**Created:** 2026-11-19
**Priority:** MEDIUM
**Type:** feature (migration)
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

Staff can't see when a customer writes in. A new thread or a customer reply on an existing thread looks the same as any other row, and replies on old threads are buried, because the Inbox sorts by when the thread was created (`created_at`). The Hub has no read/unread tracking for `inbox` threads at all. The only "read" state is the per-user `notifications` bell, which is unrelated.

This task adds:
- an **unread indicator and count on each Inbox row** (e.g. a dot + "3 new"),
- a **total counter** of threads with new customer messages, shown as a badge on the sidebar Desk › Inbox item and in the Inbox page header,
- **live updates** through Supabase Realtime,
- **mark as read** when someone opens the thread.

### Decisions (confirmed with the user, 2026-11-19)

| # | Decision |
|---|----------|
| D1 | **Read state is shared by the whole team.** When any Admin or PM opens a thread, it stops being new for everyone. It's stored on the `inbox` row; there's no per-user table. |
| D2 | **Only customer messages count as new**, meaning `inbox_messages.author_type = 'client'`. That covers a brand-new thread's opening message and customer replies arriving through email, the Zoho Desk poll or StackShift. Staff replies, internal notes, system and draft messages never mark a thread new. |
| D3 | **Counter on the sidebar and the Inbox page, updated live.** The sidebar Desk › Inbox child shows a badge, and the Inbox header shows "N new". Both update through Realtime and on navigation. |
| D4 | **Existing threads start as read.** The migration sets `seen_at = now()` on every existing row, so only customer messages arriving after rollout show as new. |

### Design choices the implementer must keep

- **Counting happens in the database.** A trigger on `inbox_messages` `AFTER INSERT` (customer messages only) increments `inbox.unread_count` and sets `last_client_message_at`. A trigger catches every way messages get in (email poll, Desk poll and its message sync, StackShift inbound, importers and backfills), so none of those code paths change.
- **History never lights up.** The trigger only counts a message when `NEW.created_at > now() - interval '48 hours'` **and** `NEW.created_at > coalesce(inbox.seen_at, '-infinity')`. A historical Zoho import or backfill inserts old customer messages, and they must not count as new. The Desk poll is idempotent on `external_id`, so re-syncs never double count.
- **What "new" means for the counter:** threads with `unread_count > 0` that appear in the **default Inbox view**: not archived (`source_meta.isArchived`), not retired (`source_meta.retiredInto`), and not soft-deleted (`deleted_at`, task 489, if that migration is applied). The badge counts threads, not messages. Each row shows its own message count.
- **Test data:** `inbox` has no `is_test` RLS, and the Inbox list doesn't filter test customers. The counter matches the Inbox list (it is not a dashboard metric), so it applies no extra test-data filter.

## Requirements

- [ ] **Migration `186_inbox_unread.sql`** (written, not applied):
  - `inbox.unread_count integer not null default 0`, `inbox.last_client_message_at timestamptz null`, `inbox.seen_at timestamptz null`, `inbox.seen_by uuid null references auth.users(id) on delete set null`.
  - Baseline (D4): `update inbox set seen_at = now()` for existing rows. `last_client_message_at` is backfilled from `max(inbox_messages.created_at) where author_type='client'`, for display and sorting only, and leaves `unread_count = 0`.
  - `inbox_count_client_message()` SECURITY DEFINER trigger function with `set search_path = public`, and an `AFTER INSERT ON inbox_messages FOR EACH ROW WHEN (NEW.author_type = 'client')` trigger that applies the 48h + `seen_at` guard above.
  - A partial index `inbox_unread_idx on inbox (id) where unread_count > 0`.
  - Add `inbox` to the `supabase_realtime` publication, guarded with `if not exists` the way migration 159 does it.
  - A commented rollback block.
- [ ] **`POST /api/desk/tickets/[ticketId]/read`**: session + admin/super_admin/pm (the same gate as the status route); sets `unread_count = 0`, `seen_at = now()`, `seen_by = user.id`. Idempotent, and a no-op when `unread_count` is already 0 (it still bumps `seen_at`). Returns **503** on `42703`, which the client ignores silently.
- [ ] **`GET /api/desk/inbox/unread`**: same gate; returns `{ count: number }`, the number of threads in the default Inbox view with `unread_count > 0`. Returns `{ count: 0, supported: false }` on `42703`. Uses the session client, not `adminClient`. Developers get 403. The sidebar only asks for the count when the Desk group is visible (not developers).
- [ ] **Shared count query** in `src/lib/desk/inbox-unread.ts`: `countUnreadThreads(client)` holds the exclusions (archived, retired, deleted with the task 489 `42703` fallback) so the API route and the Inbox page compute the same number.
- [ ] **Live hook** `useInboxUnreadCount()` in `src/components/desk/use-inbox-unread.ts`: it fetches on mount and on path change, subscribes to `postgres_changes` on `public.inbox` (INSERT + UPDATE), and refetches with a 1.5s debounce. It removes the channel on unmount and returns `{ count, supported }`.
- [ ] **Sidebar** (`v2-hub-sidebar.tsx`): child nav items accept an optional `badge?: number`. The Desk › Inbox child shows a rounded-full pill (`99+` cap, `aria-label="N threads with new messages"`). When the Desk group is collapsed, show a small dot on the Desk parent row. Show nothing when the count is 0 or the feature isn't supported.
- [ ] **Inbox page**:
  - Select `unread_count`, with a `42703` fallback that drops the column.
  - Each row with `unread_count > 0` gets a blue dot before the Contact, a semibold subject and an "N new" pill next to the subject. Color is never the only signal: the pill carries text and the dot has an `sr-only` "Unread".
  - The header reads "{total} tickets · {N} new". The "N new" part is a `<button>` that toggles `?unread=1`, which filters to `unread_count > 0`; the toggle state shows on the button.
  - Realtime: when the hook's count changes while the page is open, call `router.refresh()` (debounced) so the row indicators update.
- [ ] **Detail page**: on mount, if `ticket.unreadCount > 0`, POST `/read` once, then `router.refresh()`. The page doesn't change otherwise. New customer messages since the last view are not highlighted; that's out of scope.

## Out of Scope / Must-Not-Change

- Per-user read state, "Mark as unread", and highlighting which messages inside a thread are new.
- Counting staff or other-agent messages, and notifications (bell, email, Cliq) for new messages.
- Changing the Inbox sort order. The list still sorts by `created_at desc`; the `?unread=1` filter is how you find replies on old threads.
- The message ingest code paths (email-poll, desk-ticket-poll, stackshift-message-sync, `stackshift-support/*`, importers). The trigger handles counting, so none of them change.
- The Desk › Tickets (filed tickets) page, and the `notifications` table and bell.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/186_inbox_unread.sql` | Create | Columns, baseline, trigger, index, realtime publication, rollback |
| `src/types/database.ts` | Modify | `inbox` Row/Insert/Update: `unread_count`, `last_client_message_at`, `seen_at`, `seen_by` |
| `src/lib/desk/inbox-unread.ts` | Create | `countUnreadThreads()`, `isMissingUnreadColumn()` |
| `src/app/api/desk/inbox/unread/route.ts` | Create | `GET` count |
| `src/app/api/desk/tickets/[ticketId]/read/route.ts` | Create | `POST` mark read |
| `src/components/desk/use-inbox-unread.ts` | Create | Live count hook (Realtime + debounce) |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Child `badge`, Desk parent dot |
| `src/app/(hub)/desk/inbox/page.tsx` | Modify | Select `unread_count`, `?unread=1` filter, pass the count |
| `src/app/(hub)/desk/inbox/_inbox-index.tsx` | Modify | Header "N new" toggle, `unreadCount` on `TicketListItem`, refresh on live change |
| `src/app/(hub)/desk/inbox/_inbox-table.tsx` | Modify | Row dot, bold subject, "N new" pill |
| `src/app/(hub)/desk/inbox/[inboxId]/page.tsx` | Modify | Load `unread_count` (with fallback) |
| `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` | Modify | Mark read on mount |

## Code Context

### Message authors (`inbox_messages.author_type`, migration 025)

`check (author_type in ('client', 'staff', 'system', 'llm_draft'))`. Customer messages are `'client'`:
- email-poll inserts customer emails as `client`.
- `stackshift-message-sync.ts` sets `author_type: isAgent ? "staff" : "client"` for Desk threads and comments.
- Hub replies and notes (`api/desk/tickets/[ticketId]/reply|notes`) insert `staff`.

### Realtime publication: the pattern to copy (`supabase/migrations/159_realtime_timeline_tables.sql`)

```sql
if not exists (select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inbox') then
  alter publication supabase_realtime add table public.inbox;
end if;
```

### Realtime client usage (`src/app/(hub)/customers/_customers-index.tsx:132-141`)

```ts
const supabase = createClient();
const channel = supabase
  .channel("v2_customers_products")
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customer_products" }, (payload) => { ... })
  .subscribe();
return () => { supabase.removeChannel(channel); };
```

RLS applies to Realtime: the hub's staff roles pass `inbox_staff_all`, so they receive the events.

### Inbox list exclusions (`src/app/(hub)/desk/inbox/page.tsx`)

Default view: `.or(NOT_ARCHIVED_OR)` + `.is("source_meta->retiredInto", null)` + (task 489) `.is("deleted_at", null)` through `excludingDeleted()`. `countUnreadThreads()` must apply the same three conditions, using `{ count: "exact", head: true }`.

### Sidebar child rendering (`src/app/(hub)/_components/v2-hub-sidebar.tsx:30-37, 326-356`)

`NavItem.children?: { label; href }[]`. Each child is a `<Link>` with `<span className="flex-1 text-left">{child.label}</span>`. Put the badge pill after that span. The sidebar uses inline `style` for its dark theme (an existing exception); the new pill should use Tailwind classes.

### Inbox table row (`src/app/(hub)/desk/inbox/_inbox-table.tsx:43-75`)

`GRID_COLS = "grid-cols-[170px_1fr_150px_150px_120px_130px_40px]"`. The Contact cell is a `<Link>`, and the Subject cell is a `flex min-w-0 items-center gap-2` div. Put the dot inside the Contact cell (no new column) and the pill in the Subject cell.

## Implementation Steps

1. Write migration 186 (columns → baseline → trigger function + trigger → index → publication → rollback comment). Don't apply it.
2. Add the new columns to the `inbox` types in `src/types/database.ts`.
3. `src/lib/desk/inbox-unread.ts`: `isMissingUnreadColumn()` (`42703` naming `unread_count`/`seen_at`/`last_client_message_at`) and `countUnreadThreads(client)`.
4. API: `GET /api/desk/inbox/unread` and `POST /api/desk/tickets/[ticketId]/read`.
5. `useInboxUnreadCount()` hook.
6. Sidebar: child badge + collapsed-parent dot, wired to the hook for non-developer roles.
7. Inbox page + index + table: `unread_count` select/fallback, `?unread=1`, header toggle, row indicators, live refresh.
8. Detail page: `unreadCount` on `TicketDetailData`, mark read on mount.
9. Add a PGlite SQL check (`_docs/task/490-inbox-unread.sql-check.mjs`): baseline, client increments, staff/system don't, a historical (>48h) insert doesn't, an insert dated before `seen_at` doesn't, idempotent re-run, rollback.
10. Run `npx tsc --noEmit` and eslint on the changed files.

## Acceptance Criteria

- [ ] After migration 186, no existing thread shows as new and the sidebar badge is hidden (count 0).
- [ ] A new customer email creates a thread whose row shows a dot, a bold subject and "1 new". The sidebar badge and header counter go up by 1 **without a page reload**, within a few seconds.
- [ ] A customer reply on an old thread (email or Desk poll) marks that thread new and increments its "N new". `?unread=1` ("N new" in the header) lists it even though it sorts far down the default list.
- [ ] A staff reply, an internal note, or a system message never changes `unread_count`.
- [ ] Re-running the Zoho Desk import or a message backfill (old `created_at`) never marks anything new.
- [ ] Opening the thread clears it for **everyone** (D1): the row indicator, the header and the sidebar badge update live in another staff member's open tab.
- [ ] Archived, retired and soft-deleted (489) threads are never counted.
- [ ] A Developer sees no badge and gets 403 from both endpoints. A signed-out caller gets 401.
- [ ] **Before migration 186 is applied:** the Inbox, detail page and sidebar work as they do today. No badge, dots or "N new" appear, and nothing logs errors in a loop. The mark-read 503 is ignored silently.
- [ ] Accessibility: the badge has an `aria-label`, the row dot has `sr-only` text, the "N new" toggle is a `<button>` with `aria-pressed`, and color is never the only signal.

## Verification

```bash
npx tsc --noEmit
npx eslint "src/app/(hub)/_components/v2-hub-sidebar.tsx" "src/app/(hub)/desk/inbox" "src/app/api/desk" src/lib/desk/inbox-unread.ts src/components/desk
# Migration 186 on PGlite: node _docs/task/490-inbox-unread.sql-check.mjs supabase/migrations/186_inbox_unread.sql
```

Browser checks, before and after migration 186. Use two browser sessions (two staff users) for the shared-read and live-update criteria. Create a customer message with a test email to the support mailbox, then run the email-poll cron with `x-cron-secret`. curl checks for the 401/403/200/503 matrix on both endpoints.

## Compatibility Touchpoints

- **Migrations:** 186 is written, not applied, and the code degrades on `42703`. It's independent of 185 (task 489), but the counter uses 489's `deleted_at` exclusion when that column exists. Land after 489.
- **Realtime:** adding `inbox` to `supabase_realtime` broadcasts inbox row changes to subscribed sessions, with RLS applied (`inbox_staff_all`, plus `inbox_client_read` for client-role sessions, which never open the hub). The Desk poll's upserts produce bursts of UPDATE events, which the 1.5s debounce absorbs.
- **Docs:** add an "Unread / new messages" bullet to `_docs/context/zoho-desk-import.md` (trigger, 48h guard, shared read state).
- **Task 458** (Desk Inbox reply, Planned) and **489** both touch `_ticket-detail.tsx` and the Inbox page, so expect merges in the same areas.

## Implementation Notes

### What Changed
- Migration 186 adds `inbox.unread_count`, `last_client_message_at`, `seen_at` and `seen_by`; baselines every existing thread as read (`seen_at = now()`, `last_client_message_at` backfilled); adds the SECURITY DEFINER `inbox_count_client_message()` trigger on `inbox_messages` (customer messages only, < 48h old and newer than `seen_at`); adds the partial index `inbox_unread_idx`; and adds `inbox` to `supabase_realtime` (guarded). There's a commented rollback block. Written, not applied.
- `src/lib/desk/inbox-unread.ts`: `isMissingUnreadColumn()`, `countUnreadThreads()` (excludes archived, retired and deleted rows, with the 489 fallback), and `NOT_ARCHIVED_OR`, moved here from the Inbox page so the list and the counter share it.
- `src/lib/desk/inbox-staff-gate.ts`: `requireInboxStaff()` (session + admin/super_admin/pm; returns the session client or a 401/403) plus `INBOX_ID_RE`. The task 489 `_soft-delete.ts` now uses it too.
- `GET /api/desk/inbox/unread` returns `{ count, supported }` using the session client. `POST /api/desk/tickets/[ticketId]/read` sets `unread_count = 0`, `seen_at` and `seen_by` through `adminClient`; it returns 400/404, or 503 before migration 186.
- `useInboxUnreadCount(enabled)` fetches on mount and on navigation, and refetches 1.5s after an `inbox` INSERT/UPDATE arrives over Realtime. Each caller gets its own channel name (`useId`).
- Sidebar: a live pill on Desk › Inbox (`99+` cap, `aria-label`) for admin/super_admin/pm, and a blue dot with `sr-only` text on the parent icon while the Desk group is folded or the sidebar is collapsed.
- Inbox: rows show a dot and bold contact/subject plus an "N new" pill. The header shows "{total} tickets · N new" as an `aria-pressed` toggle for `?unread=1`; turning it on also sets `status=all`, so the list matches the counter. The empty state has its own unread text. When the live count changes, the list calls `router.refresh()`.
- Detail: `unreadCount` is loaded separately (it falls back to 0 on 42703). On mount, the page POSTs `/read` once and refreshes; failures are ignored.

### Files Changed
- `supabase/migrations/186_inbox_unread.sql` - columns, baseline, trigger, index, realtime publication
- `src/types/database.ts` - `inbox` gains the four columns
- `src/lib/desk/inbox-unread.ts` (new), `src/lib/desk/inbox-staff-gate.ts` (new)
- `src/app/api/desk/inbox/unread/route.ts` (new), `src/app/api/desk/tickets/[ticketId]/read/route.ts` (new)
- `src/app/api/desk/tickets/[ticketId]/_soft-delete.ts` - switched to `requireInboxStaff()` (task 489 file)
- `src/components/desk/use-inbox-unread.ts` (new) - live count hook
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` - badge + folded-group dot
- `src/app/(hub)/desk/inbox/page.tsx`, `_inbox-index.tsx`, `_inbox-table.tsx` - row indicators, header toggle, live refresh
- `src/app/(hub)/desk/inbox/[inboxId]/page.tsx`, `_ticket-detail.tsx` - load unread count, mark read on open
- `_docs/context/zoho-desk-import.md` - "Unread / new messages" bullet
- `_docs/task/490-inbox-unread.sql-check.mjs` - PGlite check

### Deviations From Plan
- **Sidebar badge wiring:** the badge comes from a `badgeFor(href)` lookup in the sidebar component, not a `badge?: number` field on the child nav items. `getNavGroups()` builds static data, and the count is live React state. The result is the same.
- **Live row refresh:** the Inbox list refreshes when the live **thread count** changes. If a thread that is already unread gets another customer message, the count doesn't change, so that row's "N new" updates on the next navigation or refresh, not live. The sidebar badge and header stay correct. Making it fully live would mean refreshing the list on every `inbox` update, and the Desk poll's upsert bursts would then trigger frequent server re-renders.
- **Shared staff gate:** `requireInboxStaff()` reads the role with the session client. The 489 route read it with `adminClient`, like the status route. The Inbox pages already read `profiles.role` through the session client, so RLS allows it, and this follows the "no adminClient for regular reads" rule. Only the 489 route was moved over; the status route is unchanged (out of scope).
- **`?unread=1` sets `status=all`:** the header counter counts every status, so the toggle shows every status too. Otherwise the default "Open" filter would hide unread on-hold or escalated threads that are part of the count.

### Verification Run
- `npx tsc --noEmit` - PASS (only the pre-existing stale `.next/types/validator.ts` errors)
- `npx eslint` on the sidebar, `desk/inbox`, `api/desk`, `inbox-unread.ts`, `inbox-staff-gate.ts`, `components/desk` - PASS (no output)
- PGlite check of migration 186 (`_docs/task/490-inbox-unread.sql-check.mjs`): baseline, customer-only counting, 48h/`seen_at` guard, new thread counts, mark-read, idempotent re-run, rollback - PASS
- Browser checks (two sessions, live badge, before and after migration 186) and the curl 401/403/200/503 matrix - SKIPPED (left for the `test` stage; migration 186 not applied)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Reviewed the files listed in Implementation Notes. `git diff` was not run because CLAUDE.md forbids git commands.
- No blocking issues. The pieces each do one job: a count helper shared by the API and the page, a shared staff gate (now also used by 489's routes, which removes the duplicated gate code), and one hook used by the sidebar and the Inbox. No `any`, no debug logging, no dead code. Degrading on `42703` is handled on purpose everywhere: list, detail, count, mark-read (503), and the hook's `supported` flag.
- **Migration safety:** there are no triggers on `inbox` (checked across all migrations), so the one-time baseline `UPDATE` of every row only writes the new columns. The trigger function is `SECURITY DEFINER` with a pinned `search_path` and only fires `WHEN (new.author_type = 'client')`. Adding `inbox` to the realtime publication is guarded and happens after the baseline, so the baseline doesn't broadcast a flood of events.
- **Realtime exposure:** `postgres_changes` sends whole `inbox` rows to subscribers, filtered by RLS. The roles that receive them (`inbox_staff_all`, plus clients on their own rows through `inbox_client_read`) can already select the same rows through PostgREST, so Realtime exposes nothing new.
- UI conventions are followed: `<button aria-pressed>` for the toggle, `aria-label` on the badge, `sr-only` text on the dots, text pills so color is never the only signal, `cn()` with static classes, and Tailwind for the new sidebar pill (the sidebar's existing inline `style` is left as it was).
- Non-blocking observations:
  - On the Inbox page, the sidebar and the page each run the hook. That means two lightweight subscriptions and two head-count fetches per navigation. Sharing them through context would add plumbing for little gain.
  - A small race in mark-read: if a customer message arrives in the moment between the page loading and the `/read` POST, the POST's `seen_at = now()` makes the trigger skip that message, so it never counts as new. The message itself is fine and shows in the thread on the next refresh.
  - The 48h window depends on each ingest path's `created_at`. The documented caveat (pollers down for more than 48h means that gap isn't counted) is in `_docs/context/zoho-desk-import.md`.

### Deviations
- **Minor:** the sidebar badge uses a `badgeFor(href)` lookup instead of a `badge` field on the child nav items. Same output; the nav config stays static.
- **Medium (accepted):** the Inbox rows refresh live only when the *thread* count changes. A further customer message on a thread that's already unread updates the sidebar and header live, but that row's "N new" waits for the next navigation or refresh. This keeps the Desk poll's upsert bursts from triggering repeated server re-renders. The user should know about it; there's a follow-up option if they want fully live rows.
- **Minor:** `requireInboxStaff()` reads `profiles.role` with the session client, and 489's `_soft-delete.ts` was moved onto it. That follows the "no adminClient for regular reads" rule and matches how the Inbox pages already read the role.
- **Minor:** `?unread=1` also sets `status=all`, so the filtered list matches the counter, which counts every status.

### Required Fixes
- None.

## Follow-up (2026-11-20): `GET /api/desk/inbox/unread` returned 500 with migration 186 not applied
- **Symptom:** the dev log showed `[api/desk/inbox/unread] count failed: ` with an empty message, then a 500, on every page load. The sidebar badge poll hits this route.
- **Cause:** `countUnreadThreads()` counted with `select("id", { count: "exact", head: true })`.
  - A HEAD response has no body, so supabase-js reports the PostgREST error with an empty `code` and `message`.
  - Neither degrade path could recognise the missing column: `excludingDeleted()` for `deleted_at` (migration 185) and `isMissingUnreadColumn()` for `unread_count` (migration 186).
  - So the error was rethrown and surfaced as a 500, not `{ count: 0, supported: false }`.
- **Fix:** `src/lib/desk/inbox-unread.ts` now uses a GET with `{ count: "exact" }` and `.limit(1)`, so errors keep their body and the 42703 fallbacks work. The count is unchanged (`count=exact` is independent of the row limit).
- **Checked:** `npx tsc --noEmit` (no errors outside the stale `.next` types), eslint clean. Other `excludingDeleted` callers don't use `head: true`.
- **Still to confirm in the browser:** with 185 and 186 unapplied, the route returns 200 `{ count: 0, supported: false }` and the log stays quiet.
