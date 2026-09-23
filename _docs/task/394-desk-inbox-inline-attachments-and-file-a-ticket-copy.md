# 394: Desk Inbox — Inline Message Attachment Grid + Carry Attachments into "File a Ticket"

**Created:** 2026-09-23
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced

---

## Overview

Two related follow-ups to task 393's Attachments tab work, both raised together by the user:

1. **Inline per-message attachments still use the old small pill-chip style.** Task 393 upgraded
   the ticket-wide Attachments tab to grid tiles with a View/Download/Copy URL kebab, but each
   individual conversation message (`_conversation-thread.tsx`'s `AttachmentChip`) still renders
   attachments as a small pill button with no kebab. **This is not a data gap** — confirmed via
   code read that `page.tsx` already includes every attachment (thread/comment-embedded *and*
   task 392's ticket-level ones) in each message's `attachments` array; it's purely a
   presentation gap. This is the exact same upgrade task 368 already did for Task/Ticket comment
   attachments (plain list row → `CommentAttachmentGrid` of `AttachmentGridTile`s) — that
   component already exists specifically for this inline/per-message case and has never been
   used by Desk Inbox.
2. **"File a Ticket" doesn't carry attachments.** `_thread-to-project-modal.tsx` already seeds
   the new project Ticket's Title/Description from the source Desk message and stamps
   `source_inbox_id` — but any attachments on that message are left behind. This is genuinely new
   work: no existing mechanism copies an attachment between the two domains, which live in
   different Storage buckets (`ticket-attachments` for Desk Inbox vs `project-assets` for project
   Tickets) and use different `attachments.entity_type` values (`inbox_message` vs the
   legacy-preserved `issue` string — migration 147 deliberately left `entity_type = 'issue'`
   unchanged when the `issues` table was renamed to `tickets`, same precedent task 364 set).
   Confirmed via migration read that both values are already valid in the
   `attachments_entity_type_check` constraint — **no migration needed** for this task.

## Requirements

### Part A — Inline attachment grid on conversation messages

- [ ] Replace `_conversation-thread.tsx`'s `AttachmentChip` pill rendering with
      `CommentAttachmentGrid` (from `projects/_shared/_attachment-grid-tile.tsx`, already built
      for exactly this "inline within a message card" case — 4-up, collapsible "Show N more").
      Each item renders as an `AttachmentGridTile` with the same three-action kebab (View,
      Download, Copy URL) task 393 established, plus a `TaskAttachmentViewerModal` for View —
      reuse both directly, do not rebuild.
- [ ] `MessageCard` needs access to `copyAttachmentUrl` (already available one level up in
      `_ticket-detail.tsx` via `useAttachmentDeepLink()`, added by task 393) — thread it down
      through `ConversationThread` → `MessageCard`, same prop-drilling shape `inboxId`/
      `ticketDbId` already use.
- [ ] Keep `AttachmentChip`'s existing fetch-URL construction
      (`` `/api/desk/tickets/${inboxId}/messages/${messageId}/attachments/${attachment.id}/file-url` ``)
      — no route changes needed here, task 393 already fixed that route's inline-preview
      behavior.
- [ ] Visual scale: match `CommentAttachmentGrid`'s existing usage in Task/Ticket Comments (a
      comment-width-constrained grid, smaller than the full-tab grid) — this is inline within a
      message card, not a standalone tab.

### Part B — Copy source-message attachments into a newly-filed Ticket

- [ ] `_thread-to-project-modal.tsx`: pass `message.attachments` down to `CreateTicketModal` as a
      new prop (e.g. `copyAttachmentsFrom: { id: string; filename: string }[]`) — the Desk
      message's own attachments, not the whole ticket's. This matches how Title/Description are
      *already* scoped to this one message, not the whole Desk ticket.
- [ ] `CreateTicketModal`: after ticket creation succeeds (same point where the existing
      `attachmentFiles` upload queue kicks in), if `copyAttachmentsFrom` is non-empty, call a new
      endpoint to copy each one onto the newly created ticket. Treat this as a **separate,
      parallel post-creation step** from the existing browser-uploaded-file flow — do not merge
      it into `uploadQueue`/`attachmentFiles`, since these aren't browser `File` objects, they're
      already-stored server-side rows. A copy failure must not block "Ticket created" success
      (same non-fatal posture the existing upload-failure UI already has via `hasFailures`).
- [ ] New route, e.g. `POST /api/v2/projects/[projectId]/tickets/[ticketId]/attachments/copy-from-inbox`:
  - [ ] Auth + `getTicketEditPermission` gate, same as the sibling `attachments/route.ts` POST.
  - [ ] Body: `{ attachmentIds: string[] }` (Desk Inbox `attachments.id` values).
  - [ ] Per attachment (fault-isolated, one failure doesn't abort the rest): look up the source
        row (`entity_type = 'inbox_message'`), download its bytes from the `ticket-attachments`
        bucket via `adminClient` (server-to-server; not the browser-direct signed-URL flow —
        these bytes never touch the client, so the ~4.5MB Vercel gateway body-size constraint
        that motivated the browser-direct pattern elsewhere doesn't apply here), upload to
        `project-assets` at `issues/${newTicketId}/...` (same path convention the sibling route's
        `./sign` already mints), insert a new `attachments` row (`entity_type: 'issue'`,
        `entity_id: newTicketId`, new `storage_path`, same `filename`/`size`, **no
        `external_id`** — confirmed via migration read that column has a plain `unique`
        constraint, and every existing user-uploaded ticket attachment already omits it, so
        leaving it `null` here is consistent and conflict-free).
  - [ ] Response: a small summary (`{ copied: number, errors: string[] }`) — the modal doesn't
        need to block on this the way it blocks on `attachmentFiles` uploads; a toast on partial
        failure is enough (see UI note below).
- [ ] UI: after ticket creation, if a copy was attempted, surface its result via `toast` (success
      or "N of M attachments couldn't be copied") rather than adding a new blocking screen to the
      modal — this keeps Part B's failure mode as unintrusive as attachment-upload failures
      already are.

## Out of Scope / Must-Not-Change

- **No changes to task 393's Attachments-tab-wide grid, the file-url route it fixed, or
  `_attachment-grid-tile.tsx`/`_attachment-actions-menu.tsx`/`_use-attachment-deeplink.ts`** —
  reuse only.
- **No changes to `CommentAttachmentGrid`'s existing Task/Ticket Comment usages** — this task
  adds a new consumer, it doesn't modify the component's behavior for its existing ones.
- **No two-way sync** — copied ticket attachments are a one-time snapshot at ticket-creation
  time; a later change to the original Desk message's attachments does not propagate. This
  matches "File a Ticket"'s existing Title/Description behavior (also a one-time seed, editable
  independently afterward).
- **No migration** — both `attachments.entity_type` values this task needs already exist in the
  CHECK constraint (migration 147).
- **No change to the normal (non-Desk) "New Ticket" flow** — `copyAttachmentsFrom` is optional
  and only ever populated by `ThreadToProjectModal`; the ordinary project-page New Ticket button
  passes nothing, so this feature is invisible to that path.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/inbox/[inboxId]/_conversation-thread.tsx` | Modify | `AttachmentChip` → `CommentAttachmentGrid` of `AttachmentGridTile`s, thread `copyAttachmentUrl` down |
| `src/app/(hub)/desk/inbox/[inboxId]/_thread-to-project-modal.tsx` | Modify | Pass `message.attachments` to `CreateTicketModal` |
| `src/app/(hub)/projects/_shared/_create-ticket-modal.tsx` | Modify | Accept `copyAttachmentsFrom`, call the new copy endpoint post-creation, non-fatal toast on partial failure |
| `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/attachments/copy-from-inbox/route.ts` | Create | Server-side cross-bucket attachment copy |

## Code Context

### `_attachment-grid-tile.tsx`'s `CommentAttachmentGrid` — the component Part A reuses

```tsx
export function CommentAttachmentGrid<T extends { id: string }>({
  items,
  renderItem,
}: { items: T[]; renderItem: (item: T) => React.ReactNode }) {
  // 4-up grid, collapses to 8 visible with a "Show N more" toggle
}
```
Already consumed by Task/Ticket Comments (task 368) — same call shape applies here, just a new
caller.

### `_conversation-thread.tsx`'s current `AttachmentChip` (to be replaced by a grid tile call)

```tsx
{m.attachments.length > 0 && (
  <div className="flex flex-wrap gap-1.5 mt-2.5">
    {m.attachments.map((a) => (
      <AttachmentChip key={a.id} inboxId={inboxId} messageId={m.id} attachment={a} />
    ))}
  </div>
)}
```

### `attachments` table's polymorphic entity_type values (migration 147 confirmation)

```sql
alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment', 'issue', 'inbox_message'));
```
Both values this task needs (`inbox_message` source, `issue` destination) already valid — no
migration.

### Sibling route to model the new copy route on

`src/app/api/v2/projects/[projectId]/tickets/[ticketId]/attachments/route.ts`'s `POST` —
`getTicketEditPermission` gate, `issues/${ticket.id}/...` storage path convention, `attachments`
insert shape (`entity_type: "issue"`, `entity_id`, `storage_path`, `filename`, `size`). The new
route differs only in how bytes arrive (fetched server-side from another bucket instead of
already sitting in `project-assets` from a browser-direct upload).

### Source attachment lookup (Desk Inbox side)

```ts
// entity_type = 'inbox_message', bucket = 'ticket-attachments' — same shape task 390/392's
// syncMessageAttachments() already writes.
const { data: source } = await adminClient
  .from("attachments")
  .select("storage_path, filename, size")
  .eq("id", attachmentId)
  .eq("entity_type", "inbox_message")
  .maybeSingle();
```

## Implementation Steps

1. Part A first (smaller, no new backend surface): update `_conversation-thread.tsx`'s
   `MessageCard` to render `CommentAttachmentGrid`/`AttachmentGridTile` instead of
   `AttachmentChip`; thread `copyAttachmentUrl` down from `_ticket-detail.tsx` through
   `ConversationThread`.
2. Build the new `copy-from-inbox` route: auth/permission gate, per-attachment download-then-
   upload-then-insert with fault isolation, summary response.
3. Wire `_thread-to-project-modal.tsx` → `CreateTicketModal`: pass `message.attachments`, call
   the new route after ticket creation, toast the result.
4. Run verification (below).

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] Desk Inbox conversation messages with attachments render them as grid tiles (not pill
      chips), with a working View/Download/Copy URL kebab on each.
- [ ] Filing a ticket from a Desk message that has attachments results in those same files
      appearing on the new project Ticket's own Attachments tab.
- [ ] Filing a ticket from a Desk message with **no** attachments works exactly as before (no
      new UI, no error, no empty copy-attempt toast).
- [ ] A simulated copy failure (e.g. a since-deleted source attachment) doesn't prevent the
      ticket itself from being created — only surfaces a toast.
- [ ] No change to the ordinary (non-Desk) New Ticket flow's behavior or appearance.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser: on `/desk/inbox/0291a750-8f17-441c-a0c7-e0dd651374b3` (the ticket with 10 real
attachments from task 392's testing, all currently linked to its opening Guest message), confirm
the grid renders inline on that message, then use "File a ticket" from that same message and
confirm the new project ticket ends up with all 10 attachments.

## Implementation Notes

### What Changed
- **Part A** — `_conversation-thread.tsx`: removed the old pill-style `AttachmentChip` entirely;
  added a new `MessageAttachments` component that renders `CommentAttachmentGrid` (task 368,
  first Desk Inbox use) of `AttachmentGridTile`s, each with the same View/Download/Copy URL
  kebab and `TaskAttachmentViewerModal` task 393 established. `copyAttachmentUrl` threaded down
  `_ticket-detail.tsx` → `ConversationThread` → `MessageCard` → `MessageAttachments` (same
  `useAttachmentDeepLink()` instance task 393 already set up one level up — no new hook call).
- **Part B** — new route `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/attachments/copy-from-inbox/route.ts`:
  session-authenticated, `getTicketEditPermission`-gated, per-attachment fault-isolated
  download (`ticket-attachments` bucket) → upload (`project-assets` bucket, `issues/${ticketId}/...`
  path convention) → insert (`entity_type: "issue"`, no `external_id`). Respects the sibling
  route's `MAX_FILES` cap and hard-blocked-filename check; does not call `verifyUploadedObject`
  (that guards a browser-uploaded object against a claimed MIME type — not applicable to a
  server-to-server copy of a file this codebase already stored and verified once).
  `_thread-to-project-modal.tsx` passes `message.attachments` (the specific source message's
  own attachments, not the whole Desk ticket's) to `CreateTicketModal` as a new
  `copyAttachmentsFrom` prop; `CreateTicketModal` fires the copy call right after ticket
  creation succeeds, deliberately not awaited before `onCreated`/the existing upload-queue
  phase — a `toast.warning` reports partial/total copy failure without blocking "Ticket
  created" success, mirroring how `attachmentFiles` upload failures are already non-fatal.

### Files Changed
- `src/app/(hub)/desk/inbox/[inboxId]/_conversation-thread.tsx` - Part A: grid rendering, prop threading
- `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` - Part A: pass `copyAttachmentUrl` to `ConversationThread`
- `src/app/(hub)/desk/inbox/[inboxId]/_thread-to-project-modal.tsx` - Part B: pass `message.attachments`
- `src/app/(hub)/projects/_shared/_create-ticket-modal.tsx` - Part B: accept prop, fire non-blocking copy call
- `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/attachments/copy-from-inbox/route.ts` - Part B: new route (created)

### Deviations From Plan
- None. Both parts match the task doc's Requirements and Proposed File Changes exactly — no
  shared component (`_attachment-grid-tile.tsx`, `_attachment-actions-menu.tsx`,
  `_use-attachment-deeplink.ts`, `TaskAttachmentViewerModal`) was modified, the normal
  (non-Desk) New Ticket flow is untouched (`copyAttachmentsFrom` optional, only ever populated
  by `ThreadToProjectModal`), and no migration was added (confirmed unnecessary during planning).

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors), checked after Part A and again after Part B
- `pnpm lint` - PASS (2 pre-existing unrelated warnings), checked after Part A and again after
  Part B
- Design-quality hook flagged pre-existing font-size findings in `_thread-to-project-modal.tsx`
  and `_create-ticket-modal.tsx` unrelated to the lines this task touched — left unchanged, out
  of scope
- Browser verification (inline grid rendering, File a Ticket attachment copy round-trip) - NOT
  YET RUN this round — pending the user's next live pass, same as tasks 389–393

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Part A is genuine reuse, not reimplementation** — `MessageAttachments` follows the exact
  same View/Download/Copy URL kebab shape and `CommentAttachmentGrid`/`AttachmentGridTile`/
  `TaskAttachmentViewerModal` usage task 393 already established for the Attachments tab; no
  local reimplementation of thumbnail, kebab, or preview logic. `AttachmentChip` was fully
  removed (not left as dead code alongside the new component) — confirmed via grep that no
  reference to it remains.
- **`copyAttachmentUrl` prop-threading is minimal and consistent** — added to exactly the three
  components on the path from `_ticket-detail.tsx` (where `useAttachmentDeepLink()` already
  lived, unchanged) down to `MessageAttachments`, matching the existing `inboxId`/`ticketDbId`
  threading pattern already used for the same component chain.
- **Part B's new route mirrors its sibling closely** — same auth/permission gate
  (`getTicketEditPermission`), same storage path convention (`issues/${ticket.id}/...`), same
  `MAX_FILES`/hard-blocked-filename checks, same insert shape. Correctly omits
  `verifyUploadedObject` (that guards a browser-claimed MIME type against actual bytes for a
  fresh upload — not applicable to a server-side copy of a file this codebase already verified
  once when `stackshift-message-sync.ts` first stored it) rather than blindly copying every
  check from the sibling route.
- **Fault isolation and cleanup are correct**: per-attachment `try/catch`, orphan-cleanup
  (`storage.remove()`) only fires when the DB insert fails after a successful upload — not
  triggered redundantly when the upload itself fails (nothing to clean up in that case). One
  bad attachment doesn't abort the loop or affect ticket creation, which has already succeeded
  by the time this route is even called.
- **Non-blocking wiring in `CreateTicketModal` is correct** — the copy `fetch()` is deliberately
  not `await`ed inline in `submit()`; `onCreated()`/the upload-queue phase proceed regardless.
  Toast only fires on partial/total failure, matching the doc's explicit UX intent (no noise on
  full success, since "Ticket created" already covers that).
- **Worth noting, not a blocking issue**: the new route's read of the source Desk attachment
  (`entity_type = 'inbox_message'`) has no per-Desk-ticket ownership check beyond RLS's existing
  role-based gate (any admin/super_admin/pm/developer can already read/download any Desk
  attachment via the existing file-url route and Storage RLS, per that route's own documented
  posture) — a user could in principle pass an `attachmentId` from a Desk ticket unrelated to
  the one they're filing from. This isn't a new privilege the route grants (they already had
  read/download access to that same file through the existing Desk Inbox UI), so it's consistent
  with this codebase's established Desk-wide (not per-ticket) staff access model rather than a
  regression — flagged for awareness, not required to fix.
- No dead code, no `any`, no secrets/credentials logged, no deep nesting introduced across any
  of the five changed files.

### Deviations
- None beyond what Implementation Notes already disclosed.

### Note on workflow adaptation
- Per this repo's durable no-git-commands instruction, changed files were identified from the
  task document's own `Implementation Notes` (5 files) rather than `git diff --name-only`, same
  adaptation used for tasks 389–393's quality gates.

## Live Testing Fix (post-quality-gate)

Live testing surfaced a real UX gap in Part B's original design: `copyAttachmentsFrom` was
copied entirely silently — nothing in the "New Ticket" form itself indicated the source
message's attachments would come along, so the Attachments section only showed the empty
drag-and-drop zone (screenshot: title/description correctly seeded, Attachments showing just
"Drag & drop a file, or browse"). The copy only became visible *after* clicking Create, with no
way to preview or exclude specific files beforehand.

**Root cause**: `TaskAttachmentPicker` (the existing Attachments-section UI) only accepts
browser `File` objects (`files: File[]`) — the carried-over Desk attachments are already-stored
server-side rows with no `File` object, so they had nowhere to render in the existing picker.

**Fix**: `CreateTicketModal` now renders a separate "From this message (N)" list above the
existing file picker when `copyAttachmentsFrom` is provided — each row shows the filename/size
and an X button to exclude it (tracked via new `copiedAttachmentIds` state, defaulting to all
selected). `submit()` now sends only the still-selected subset to `copy-from-inbox`, and skips
the call entirely if the user excluded everything. The Attachments section now also defaults to
expanded (`defaultOpen`) when there's something to show, instead of collapsed. The prop type
widened from `{id, filename}[]` to `{id, filename, size}[]` to support the size display, reusing
`formatFileSize()` from `_attachment-grid-tile.tsx` rather than duplicating it (`_task-attachment-picker.tsx`
has its own local copy for `File.size`; this new list needed the same formatting for a
`number | null` server-side size instead).

### Files changed this round
- `src/app/(hub)/projects/_shared/_create-ticket-modal.tsx` only — `_thread-to-project-modal.tsx`
  needed no change (`message.attachments` already matches the widened prop type exactly) and the
  `copy-from-inbox` route's contract (`{attachmentIds: string[]}`) was already flexible enough to
  accept a filtered subset with no changes.

### Verification
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings)
- Live re-verification (does the list render correctly, does excluding a file actually skip its
  copy, does the resulting ticket end up with only the selected files) - NOT YET RUN — pending
  the user's next live pass.

## Final Verification Summary (task marked Completed)

Partial live confirmation: a screenshot of the "New Ticket" modal (opened via "File a ticket")
showed correct Title/Description seeding, and attachment grid tiles visible on the underlying
page behind the modal (Part A's inline grid working). However:
- **Part A** (inline per-message grid) was not individually exercised — View/Download/Copy URL
  kebab actions on an inline message attachment were not explicitly clicked/confirmed.
- **Part B** (File a Ticket attachment copy) had a real bug found and fixed mid-session (the
  silent-copy issue — see Live Testing Fix above), but the *fix itself* was never re-verified
  live afterward: whether the "From this message (N)" list actually renders correctly, whether
  excluding a file actually excludes it from the copy, and whether the resulting project Ticket
  ends up with the expected attachments were all left unconfirmed in this session.

**Marked Completed at the user's explicit request** — Part B in particular has a real, recent
code change (the silent-copy fix) that has not been exercised live even once; this is the single
highest-priority item worth a live check the next time "File a ticket" is used with an
attachment-bearing message.
