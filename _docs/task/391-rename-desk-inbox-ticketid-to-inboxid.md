# 391: Rename Desk Inbox Detail Route Param `[ticketId]` → `[inboxId]`

**Created:** 2026-09-23
**Priority:** LOW
**Type:** chore
**Recommended Tier:** fast

---

## Overview

`src/app/(hub)/desk/inbox/[ticketId]/` routes the Desk Inbox ticket detail page. The param name
`ticketId` is a naming leftover from before migration 147 (task 382), which renamed the
underlying Desk table `tickets` → `inbox` (to free up the `tickets` name for the unrelated
project-work-item domain, formerly `issues`). Migration 147's own header comment documents this
was a **deliberate, not-yet-done** cleanup:

> Application-code routing-key change (not part of this SQL, tracked in task 382 doc):
> /desk/inbox/[ticketId] and the public /tickets/[ticketId] view switch from routing by
> the display string (old tickets.ticket_id, "TKT-XXXX") to routing by `id` (UUID). This
> migration does not touch that column.

Task 382 already switched **what value** the segment routes by (UUID `inbox.id`, not the old
`"TKT-XXXX"` display string — confirmed live in `page.tsx:82`'s UUID-format validation). It did
**not** rename the segment itself. This task finishes that: renaming the param from `ticketId` to
`inboxId` so it matches what it actually identifies today.

**Purely a naming change — no behavior, no URL-path change.** Next.js dynamic segment names
(`[ticketId]` vs `[inboxId]`) only affect the internal `params` object key a page destructures;
they do not appear in the rendered URL path itself (`/desk/inbox/<uuid>` renders identically
either way). Every existing link/bookmark/hardcoded href to `/desk/inbox/<uuid>` keeps working
unchanged.

## Requirements

- [ ] Rename the folder `src/app/(hub)/desk/inbox/[ticketId]/` → `src/app/(hub)/desk/inbox/[inboxId]/`.
- [ ] Update `page.tsx`'s two `params: Promise<{ ticketId: string }>` type annotations
      (`generateMetadata` and the default export) to `Promise<{ inboxId: string }>`, and their
      `const { ticketId } = await params;` destructures to `inboxId`.
- [ ] Propagate the rename through this route's own component tree so the whole feature is
      internally consistent (not just the top-level param) — every occurrence of `ticketId` that
      represents this same inbox-row UUID, in:
  - `page.tsx` (including the `TicketDetailData.ticketId` field it constructs)
  - `_ticket-detail.tsx` (the `TicketDetailData.ticketId` type field + every
    `ticket.ticketId`/`ticketId` reference, including the three `fetch(`/api/desk/tickets/${...}`)`
    call sites — only the interpolated variable name changes, the URL path string itself does
    not)
  - `_attachments-tab.tsx` (both `AttachmentRow`/`AttachmentsTab` prop declarations + usages)
  - `_conversation-thread.tsx` (the `ticketId` prop declarations/usages — **not**
    `ticketDbId`, a separate prop; see Out of Scope)
- [ ] Verify `npx tsc --noEmit` passes after the rename (a missed reference to the old param name
      inside `page.tsx` would be a compile error, but a missed reference in a client component
      that still hardcodes the prop name `ticketId` internally would **not** necessarily error —
      review each touched file by eye, don't rely on tsc alone to catch every spot).

## Out of Scope / Must-Not-Change

- **`src/app/api/desk/tickets/[ticketId]/*`** (6 route files: `notes`, `reply`,
  `resend-notification`, `status`, `messages/[messageId]/attachments/[attachmentId]/file-url`,
  `messages/[messageId]/inline-images/[attachmentId]`) — a **separate** route tree from the page
  route this task covers. Its `ticketId` also refers to `inbox.id` today, so it has the same
  naming staleness, but renaming it is a larger, separate blast radius (6 more files, plus every
  caller across the codebase that builds a `/api/desk/tickets/${...}/...` fetch URL — the fetch
  URL *path* wouldn't change, but a full consistency sweep would still touch more surface than
  this task's scope). Flagged as a candidate follow-up task — **do not include it here** unless
  the user explicitly asks for it in review.
- **`(public)/tickets/[ticketId]`** and **`src/app/api/public/tickets/[ticketId]/view/route.ts`**
  — the customer-facing public ticket view (task 379). Migration 147's comment above suggests
  this was meant to be covered by the same task-382 cleanup, but this task has not verified what
  identifier this specific route currently uses (UUID vs. some other public-safe token) — do not
  assume it matches the internal route's semantics without checking first. Out of scope here;
  flag as a candidate follow-up alongside the API routes above.
- **`ticketDbId`** — a separate, already-distinctly-named prop threaded through
  `_conversation-thread.tsx` → `_thread-message-actions.tsx` / `_thread-to-project-modal.tsx`
  (feeds `sourceTicketId` for the "File a Ticket" flow). It happens to hold the exact same value
  as `ticket.ticketId` today (both are `inbox.id`), which is itself minor naming debt, but
  collapsing that redundancy is a separate decision from this task's narrow rename — do not
  touch `ticketDbId` or attempt to merge it with the renamed `inboxId` prop.
- **`/projects/legacy/[projectId]/tickets/[ticketId]/*`, `/projects/v2/[projectId]/tickets/[ticketId]/*`,
  `/api/v2/projects/[projectId]/tickets/[ticketId]/*`, `/api/v2/tickets/[ticketId]/*`** — a
  **completely different, unrelated domain**. This is the project-work-item `tickets` table
  (renamed from `issues` by the same migration 147), where `ticketId` is **already correctly
  named** (`tickets.id`). These share the string `ticketId` with the Desk domain purely by
  coincidence of two different migration-147 renames landing on similar-sounding names — **must
  not be touched**, renaming them would be actively wrong.
- No database change, no migration — this is a route-param naming change only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/inbox/[ticketId]/` → `src/app/(hub)/desk/inbox/[inboxId]/` | Rename (directory) | Match the actual identity of what's routed (`inbox.id`) |
| `.../[inboxId]/page.tsx` | Modify | `params` type + destructure; `TicketDetailData.ticketId` field |
| `.../[inboxId]/_ticket-detail.tsx` | Modify | `TicketDetailData` type field + 3 fetch call sites + 2 prop-passing sites |
| `.../[inboxId]/_attachments-tab.tsx` | Modify | 2 prop declarations + usages |
| `.../[inboxId]/_conversation-thread.tsx` | Modify | 3 prop declarations + usages (leave `ticketDbId` alone) |

## Code Context

### Current `page.tsx` params handling (lines 71, 73, 79, 81-82)

```ts
export async function generateMetadata({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  ...
}

export default async function TicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  ...
  const { ticketId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) notFound();
```

### `_ticket-detail.tsx`'s duplicate-value props (line 591-596)

```tsx
<ConversationThread
  key={convView}
  ticketId={ticket.ticketId}
  ticketDbId={ticket.id}
  subject={ticket.subject}
  messages={shownMessages}
/>
```

`ticket.ticketId` and `ticket.id` are literally the same value today (both set to `t.id` in
`page.tsx`, per task 386's fix) — rename `ticketId` → `inboxId` here too, but leave
`ticketDbId={ticket.id}` exactly as-is (separate prop, out of scope per above).

## Implementation Steps

1. Rename the directory `src/app/(hub)/desk/inbox/[ticketId]/` to
   `src/app/(hub)/desk/inbox/[inboxId]/` (a plain filesystem rename — do not recreate files by
   hand, since that risks silently dropping content).
2. In `page.tsx`: update both `params` type annotations and destructures to `inboxId`; update the
   `TicketDetailData` object literal's `ticketId: t.id` field to `inboxId: t.id` — but see step 3
   before renaming the type field, since `_ticket-detail.tsx` defines `TicketDetailData` and
   consumes this field too.
3. In `_ticket-detail.tsx`: rename the `TicketDetailData.ticketId` type field to `inboxId`, and
   every `ticket.ticketId` reference (3 fetch call sites, 2 prop-passing sites) to
   `ticket.inboxId`.
4. In `_attachments-tab.tsx`: rename both `ticketId` prop declarations and their usages to
   `inboxId`.
5. In `_conversation-thread.tsx`: rename the `ticketId` prop declarations/usages to `inboxId`
   (three places — the outer component and the two it passes down to, not counting
   `ticketDbId`, which stays untouched).
6. Run verification (below).

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] `/desk/inbox/<uuid>` still resolves to the ticket detail page (folder rename doesn't change
      the URL shape — spot check in a browser or via the dev server).
- [ ] No remaining `ticketId` references inside the renamed `[inboxId]/` directory except
      `ticketDbId` (a distinct, intentionally-untouched prop).
- [ ] No files outside `src/app/(hub)/desk/inbox/[inboxId]/` were modified.

## Verification

```bash
npx tsc --noEmit
pnpm lint
grep -rn "ticketId" "src/app/(hub)/desk/inbox/[inboxId]/"   # should only show ticketDbId lines
```

Browser: visit any existing `/desk/inbox/<uuid>` URL and confirm the page still loads correctly
(status change, reply, notes, attachments tab all still work — these all go through
`/api/desk/tickets/[ticketId]/*`, which this task deliberately leaves unchanged).

## Implementation Notes

### What Changed
- Renamed the directory `src/app/(hub)/desk/inbox/[ticketId]/` → `src/app/(hub)/desk/inbox/[inboxId]/`
  via a plain filesystem `mv` (all 9 files moved intact, none recreated by hand).
- `page.tsx`: both `params` type annotations (`generateMetadata` + default export) and their
  destructures renamed `ticketId` → `inboxId`; the `.eq("id", ...)` lookup and the
  `TicketDetailData` field construction (`ticketId: t.id` → `inboxId: t.id`) updated to match.
  Left the existing comment referencing `/api/desk/tickets/[ticketId]/*` unchanged (accurate —
  that route tree really is still named that) and added a note clarifying the two names now
  intentionally differ.
- `_ticket-detail.tsx`: `TicketDetailData.ticketId` type field renamed to `inboxId`; the three
  `fetch(`/api/desk/tickets/${...}`)` call sites (status/notes/reply) now interpolate
  `ticket.inboxId` — only the local variable changed, the URL path string is identical; the two
  prop-passing sites (`<AttachmentsTab>`, `<ConversationThread>`) updated to pass `inboxId={...}`
  once their target components' prop names were renamed (see below). `ticketDbId={ticket.id}`
  left untouched.
- `_attachments-tab.tsx`: both `AttachmentRow`'s and `AttachmentsTab`'s `ticketId` prop
  (declaration + fetch-URL usage + pass-through) renamed to `inboxId`.
- `_conversation-thread.tsx`: `MessageCard`'s and `ConversationThread`'s `ticketId` prop
  (declaration + fetch-URL usage + pass-through, including the `AttachmentChip` call site)
  renamed to `inboxId`. `ticketDbId` (a distinct prop feeding `ThreadMessageActions`/
  `ThreadToProjectModal`) left untouched throughout, exactly as scoped.
- Cleared a stale `.next/types` cache after the directory rename — `npx tsc --noEmit` initially
  failed with `Cannot find module '.../[ticketId]/page.js'` (Next.js's generated route-type
  validator still pointing at the old path). This is the same class of issue task 378 already
  documented (stale `.next/types` entries surviving a route rename) — not a real code error.

### Files Changed
- `src/app/(hub)/desk/inbox/[ticketId]/` → `src/app/(hub)/desk/inbox/[inboxId]/` - directory rename
- `.../[inboxId]/page.tsx` - param/field rename
- `.../[inboxId]/_ticket-detail.tsx` - type field + fetch calls + prop-passing rename
- `.../[inboxId]/_attachments-tab.tsx` - prop rename (both components)
- `.../[inboxId]/_conversation-thread.tsx` - prop rename (both components)

### Deviations From Plan
- None. Scope matched the task doc exactly: the 4 in-scope files were the only ones touched;
  `ticketDbId`, the sibling `/api/desk/tickets/[ticketId]/*` API route tree, the public ticket
  view, and the unrelated project-Tickets `[ticketId]` routes were all left untouched as planned.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors) after clearing the stale `.next/types` cache
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, unchanged by
  this task)
- `grep -rn "ticketId" "src/app/(hub)/desk/inbox/[inboxId]/"` - only 3 comment lines remain
  (accurately describing the still-unrenamed sibling API route and this rename's own history) —
  no code references
- Browser verification of `/desk/inbox/<uuid>` - SKIPPED (no live session/data reachable from
  this environment, same limitation as tasks 389/390)

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Rename is complete and consistent** — re-verified by re-reading all 4 changed files in full
  after implementation: every `ticketId` occurrence within the renamed directory's own scope
  (params, type fields, fetch-URL interpolation, prop declarations, prop pass-throughs) now
  reads `inboxId`, with matching values threaded correctly end-to-end (`page.tsx`'s `inboxId` →
  `TicketDetailData.inboxId` → `_ticket-detail.tsx`'s `ticket.inboxId` → `AttachmentsTab`/
  `ConversationThread` props → `AttachmentRow`/`MessageCard`/`AttachmentChip`). No stale
  half-renamed prop name left connecting two components.
- **`ticketDbId` correctly left untouched** throughout (`_conversation-thread.tsx`,
  `_thread-message-actions.tsx`, `_thread-to-project-modal.tsx`, and the
  `ticketDbId={ticket.id}` call site in `_ticket-detail.tsx`) — confirmed via the final grep
  pass, no accidental collision or merge with the renamed `inboxId` prop.
- **No URL-path or runtime-behavior change** — this is the class of rename where it would be easy
  to accidentally touch a literal route string (e.g. in a `fetch()` call or a `<Link href>`) and
  break something; re-checked that every changed `fetch()` call only had its *interpolated
  variable* renamed, not the surrounding URL path template, and that the sibling
  `/api/desk/tickets/[ticketId]/*` route tree's own path segments are untouched.
- **Comments were updated accurately, not just code** — `page.tsx`'s two remaining comment
  references to `[ticketId]` correctly describe the still-unrenamed *API* route tree (accurate,
  not stale), and a new comment explains why the page's own param and that API route's segment
  now intentionally differ — avoids leaving a comment that would confuse the next reader.
- **Stale `.next/types` cache handled correctly** — recognized as the same known class of
  post-rename artifact documented in task 378 rather than treated as a real type error; cleared
  it and re-verified `tsc` was clean, rather than working around it some other way.
- No unused code, no dead code, no `any`, no deep nesting introduced — this was a pure
  find-and-rename within existing structure.

### Deviations
- None. Implementation matched the task doc's Requirements and Proposed File Changes exactly:
  same 4 files, same out-of-scope boundaries respected (API routes, public ticket view,
  `ticketDbId`, the unrelated project-Tickets domain — none touched).

### Note on workflow adaptation
- Per this repo's durable no-git-commands instruction, changed files were identified from the
  task document's own `Implementation Notes` rather than `git diff --name-only`, same adaptation
  used for tasks 389/390's quality gates.
