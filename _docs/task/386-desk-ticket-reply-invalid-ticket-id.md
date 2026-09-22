# 386: Desk Ticket Detail — Fix "Invalid ticket id" on Reply/Notes/Status/Attachments (Stale Routing Key After Task 382)

**Created:** 2026-09-22
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

A PM reported that replying to a customer from a Desk ticket (`/desk/inbox/[ticketId]`) fails with a toast/error reading **"Invalid ticket id"** — the reply never sends (screenshot: ticket `#21049`, "Updates site yesterday, reverted back.", reply to `laurent@lastlinesolutions.com`).

**Root cause:** Task 382 ("Desk Inbox/Tickets Table Routing Rename") migrated `/api/desk/tickets/[ticketId]/*` handlers (`status`, `notes`, `reply`, `resend-notification`, both `file-url`/`inline-images` routes) to validate/route by `inbox.id` (UUID) instead of the old `inbox.ticket_id` display key ("TKT-<n>"). Every one of those routes now does:

```ts
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) {
  return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
}
```

Task 382's own file-change list updated the server component (`(hub)/desk/inbox/[ticketId]/page.tsx`) to route the **page** by UUID, and updated the **list** page/table (`_inbox-index.tsx`/`_inbox-table.tsx`) to build links/API calls off the UUID. It did **not** update the ticket-detail client component's own fetch call sites. `page.tsx` still populates `TicketDetailData.ticketId` from `t.ticket_id` (the old "TKT-<n>" display string, see `page.tsx:218`), and `_ticket-detail.tsx` (plus its children `_attachments-tab.tsx` / `_conversation-thread.tsx`) still fetch using `ticket.ticketId` — so every status change, internal note, attachment download, and customer reply sent from the ticket detail page now 400s with "Invalid ticket id".

This is a same-shape bug to the one already fixed once in task 383 ("Origin's 'Inbox' link 404 — was routing by `inbox.ticket_id`, task 382 moved that route to `inbox.id`") — a leftover call site task 382 missed, not a new regression.

## Requirements

- [ ] Reply, status change, add-note, and attachment download (both the Attachments tab and inline conversation attachment chips) on `/desk/inbox/[ticketId]` all send the ticket's UUID (`inbox.id`) to their respective API routes, not the "TKT-<n>" display key.
- [ ] The `#<ticket_number>` badge shown in the UI (`ticket.displayId`, `_ticket-detail.tsx:433`) is unaffected — it already reads from `resolveDisplayId()`, unrelated to this fix.
- [ ] No behavior change to the routing of `/desk/inbox/[ticketId]` itself (already UUID, per task 382) or to the list page/table (already correct, per task 382).

## Out of Scope / Must-Not-Change

- Do not touch the API route handlers themselves (`status`, `notes`, `reply`, `resend-notification`, `file-url`, `inline-images`) — their UUID validation is correct per task 382; the bug is entirely on the client call sites.
- Do not touch `desk/inbox/page.tsx` (list) or `_inbox-index.tsx`/`_inbox-table.tsx` — already fixed in task 382/383.
- Do not change `resolveDisplayId()` or the `displayId` field/badge.
- Do not rename the `ticketId` prop on `AttachmentsTab` / `ConversationThread` / `AttachmentChip` — only change what value is passed into it.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/inbox/[ticketId]/page.tsx` | Modify | `TicketDetailData.ticketId` populated from `t.id` (UUID) instead of `t.ticket_id` (display key), at line 218 |
| `src/app/(hub)/desk/inbox/[ticketId]/_ticket-detail.tsx` | Modify (comment only, optional) | No functional change needed once `page.tsx` fixes the source value — `ticket.ticketId` is already consumed correctly at every call site (lines 255, 278, 305, 519, 582); verify after the fix |

## Code Context

### File: `src/app/(hub)/desk/inbox/[ticketId]/page.tsx` (lines 216–236)

```tsx
const ticket: TicketDetailData = {
  id: t.id,
  ticketId: t.ticket_id,        // <-- BUG: old "TKT-<n>" display key, not the UUID
  displayId: resolveDisplayId(t),
  subject: t.subject,
  ...
};
```

Fix: change `ticketId: t.ticket_id` to `ticketId: t.id`. Note `id` and `ticketId` will then hold the same UUID value — this is acceptable (matches the existing pattern where `ticketDbId={ticket.id}` is already passed alongside `ticketId={ticket.ticketId}` to `ConversationThread` for an unrelated purpose, `_ticket-detail.tsx:582-583`). Do not remove the `ticketId` field from the `TicketDetailData` type or rename it — that would touch every downstream consumer for no behavioral benefit; the one-line source fix is sufficient and lowest-risk.

### File: `src/app/api/desk/tickets/[ticketId]/reply/route.ts` (lines 22–26) — reference only, do not modify

```ts
// Task 382 — routes by inbox.id (UUID), not the "TKT-<n>" display key. See _resolve.ts.
const { ticketId } = await params;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) {
  return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
}
```

Every other affected route (`status`, `notes`, `resend-notification`, `file-url` ×2, `inline-images`) has the identical UUID-format guard.

### Call sites consuming `ticket.ticketId` in `_ticket-detail.tsx` (unchanged, will self-correct)

```tsx
fetch(`/api/desk/tickets/${ticket.ticketId}/status`, ...)   // line 255
fetch(`/api/desk/tickets/${ticket.ticketId}/notes`, ...)    // line 278
fetch(`/api/desk/tickets/${ticket.ticketId}/reply`, ...)    // line 305
<AttachmentsTab ticketId={ticket.ticketId} .../>             // line 519 -> file-url route
<ConversationThread ticketId={ticket.ticketId} ticketDbId={ticket.id} .../> // line 582 -> AttachmentChip file-url route
```

## Implementation Steps

1. In `src/app/(hub)/desk/inbox/[ticketId]/page.tsx`, change the `ticket` object construction (~line 218) from `ticketId: t.ticket_id` to `ticketId: t.id`.
2. Confirm `t.id` is already selected in the Supabase query (it is — `TicketDetailRow.id`, used for `id: t.id` on the line above).
3. Re-check `_ticket-detail.tsx` and its children for any place that expects `ticket.ticketId` to render as the "TKT-<n>" string rather than route with it — confirmed none exist (only `ticket.displayId` is rendered as text, at line 433); no further edits needed there.

## Acceptance Criteria

- [ ] Open a Desk ticket detail page, type a reply, click Send — reply sends successfully (200), no "Invalid ticket id" error, and the message appears in the conversation thread.
- [ ] Change ticket status from the detail page — succeeds (no 400).
- [ ] Add an internal note — succeeds (no 400).
- [ ] Download an attachment from the Attachments tab and from an inline conversation attachment chip — succeeds (no 400).
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Then browser-acceptance test against a live ticket with a prior inbound email (reply requires `inbox_messages.email_message_id` to be set on the latest message, per `reply/route.ts:60-71`) — reproduce the exact reported flow: open ticket #21049 (or any ticket with a prior message), reply, confirm send succeeds.

## Compatibility Touchpoints

- None — client-side data-plumbing fix only, no schema, migration, or API contract change.

## Implementation Notes

### What Changed
- `TicketDetailData.ticketId` (built in `page.tsx`) is now sourced from `t.id` (UUID) instead of `t.ticket_id` (the retired "TKT-<n>" display key), matching the UUID-based validation every `/api/desk/tickets/[ticketId]/*` route has enforced since task 382. `_ticket-detail.tsx` and its children needed no changes — they already consumed `ticket.ticketId` correctly; only the value they were fed was stale.

### Files Changed
- `src/app/(hub)/desk/inbox/[ticketId]/page.tsx` - one-line fix (`ticketId: t.ticket_id` → `ticketId: t.id`) plus an inline comment explaining why, at the `TicketDetailData` construction (~line 218)

### Deviations From Plan
- None. `_ticket-detail.tsx` was re-checked per step 3 and confirmed to need no edits, exactly as the plan anticipated.

### Verification Run
- `npx tsc --noEmit` - PASS (no output, 0 errors)
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx` — not touched by this change)
- Browser acceptance - SKIPPED (no live Claude in Chrome session this pass / no test ticket with a prior inbound email readily available). Reproduction steps are in the task doc's Verification section for a follow-up live check against the exact reported ticket flow.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Changed file scoped to exactly what the plan specified: `git diff --name-only` shows only `src/app/(hub)/desk/inbox/[ticketId]/page.tsx` touched for this task (five other files in the working tree are pre-existing task-385 changes, unrelated to 386, untouched by this implementation).
- The diff is the single approved line (`ticketId: t.ticket_id` → `ticketId: t.id`) plus a 3-line WHY comment (non-obvious constraint: routes now require UUID since task 382) — matches CLAUDE.md's comment policy and the codebase's existing "Task NNN —" comment convention used throughout this file.
- No new abstractions, no unused imports/vars introduced, no `any`, no secrets/debug logging.
- `npx tsc --noEmit` and `pnpm lint` both re-verified clean (0 errors; 2 pre-existing unrelated warnings).

### Deviations
- Minor, non-blocking: `TicketDetailRow.ticket_id` (and the corresponding `ticket_id` column in the Supabase `.select()` on ~line 96) is now unread anywhere in this file — `resolveDisplayId()` only consumes `ticket_number`, not `ticket_id`. This field was live-consumed before the fix (it fed the now-corrected `ticketId` assignment) and is incidentally orphaned by it. Leaving it in is harmless (one extra selected column, no runtime cost of consequence) and removing it was never part of the approved one-line plan — flagged here as an optional follow-up cleanup, not required for this task to pass.

### Required Fixes
- None.
