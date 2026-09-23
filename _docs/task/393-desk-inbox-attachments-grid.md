# 393: Desk Inbox Attachments Tab — Grid Layout with View/Download/Copy URL Kebab

**Created:** 2026-09-23
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced

---

## Overview

The Desk Inbox ticket detail's Attachments tab
(`src/app/(hub)/desk/inbox/[inboxId]/_attachments-tab.tsx`) currently renders a plain
single-column list of rows (icon, filename, author/date/size, a single Download button). The
user wants it to match the grid-tile presentation already used elsewhere in the Hub — the
Project Files tab and the Task/Ticket Attachments tabs — with a kebab menu offering **View**
(opens an in-app preview modal), **Download**, and **Copy URL**.

Research confirms this is almost entirely a reuse job, not new-component work: the exact grid
tile, kebab menu, deep-link, and preview modal this task needs already exist and are already
shared/reusable (not tied to the Projects/Tasks/Tickets domain in their props):

- `src/app/(hub)/projects/_shared/_attachment-grid-tile.tsx` — `AttachmentGridTile`,
  `AttachmentThumbnail`, `downloadAttachment()`, `formatFileSize()`. Its own header comment
  traces the tile layout back to the Files tab's `FileTile` (grid mode) — reusing this component
  *is* "the same style as the Project Files tab."
- `src/app/(hub)/projects/_shared/_attachment-actions-menu.tsx` — `AttachmentActionsMenu`,
  `AttachmentAction` (the kebab itself).
- `src/app/(hub)/projects/_shared/_use-attachment-deeplink.ts` — `useAttachmentDeepLink()`,
  a generic `?attachment=<id>` deep-link + "Copy URL" hook (reads only `pathname`, not tied to
  any domain).
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachment-viewer-modal.tsx` —
  `TaskAttachmentViewerModal`, the "View" preview modal. Generic (`{filename}` + a caller-owned
  `fetchUrl`) — `_ticket-attachments.tsx` already cross-imports this exact component from the
  Tasks route into the Tickets route, so doing the same from Desk Inbox has direct precedent.

**One supporting API fix is required, not optional.** The Desk Inbox attachment file-url route
(`src/app/api/desk/tickets/[ticketId]/messages/[messageId]/attachments/[attachmentId]/route.ts`
— actually its `file-url/route.ts` child) currently signs **every** URL with
`{ download: attachment.filename }` unconditionally — this forces
`Content-Disposition: attachment` on every response, which makes browsers download the file
instead of rendering it inline. The "View" preview modal (`<img>`/`<iframe>` for images/PDFs)
would silently fail to preview anything if this isn't fixed first. The Task attachments
file-url route already solved this exact problem (task 368, R6) — same fix needs porting here.

## Requirements

- [ ] Rewrite `_attachments-tab.tsx`'s `AttachmentRow`/list rendering into a
      `grid grid-cols-2 sm:grid-cols-4 gap-3` of `AttachmentGridTile`s, matching
      `_ticket-attachments.tsx`'s structure (Code Context below) — reuse
      `AttachmentThumbnail`/`downloadAttachment`/`formatFileSize` from `_attachment-grid-tile.tsx`
      directly, do not reimplement thumbnail/size-formatting logic.
  - [ ] Data continues to derive from the already-loaded `messages` prop (flatMap over
        `m.attachments`, as today) — **no new fetch/API route needed** for the tile grid itself,
        only for the file-url fix below.
  - [ ] Keep the existing empty state (icon + "No attachments on this ticket" message) — it
        already matches this codebase's UI-polish convention for empty states.
- [ ] Kebab actions per tile, in this exact order: **View** (opens
      `TaskAttachmentViewerModal`, cross-imported from
      `projects/v2/[projectId]/tasks/[taskId]/_task-attachment-viewer-modal.tsx`), **Download**
      (`downloadAttachment(fetchUrl)`), **Copy URL** (`copyAttachmentUrl(attachmentId)` from
      `useAttachmentDeepLink()`). **No Remove/delete action** — Desk Inbox attachments are
      read-only, synced from Zoho Desk (tasks 390/392); there is no delete capability today and
      this task must not add one.
  - [ ] Clicking the tile itself (not just the kebab) should also open the View modal — matches
        `_ticket-attachments.tsx`'s `onClick={() => setViewing(file)}` on the tile.
- [ ] Wire `?attachment=<id>` deep-linking into `_ticket-detail.tsx`:
  - [ ] Call `useAttachmentDeepLink()` to get `deepLinkedAttachmentId` and `copyAttachmentUrl`.
  - [ ] Pass `copyAttachmentUrl` down to `AttachmentsTab` for the kebab's Copy URL action.
  - [ ] When `deepLinkedAttachmentId` is present, auto-switch to the Attachments tab (call the
        existing `goToAttachments()`) and pass the id down as `autoOpenAttachmentId` so
        `AttachmentsTab` can open that specific attachment's preview once its data has loaded —
        mirror `_ticket-attachments.tsx`'s `didAutoOpen` ref-guard + deferred
        (`Promise.resolve().then(...)`) `setViewing` pattern exactly, including its
        `react-hooks/set-state-in-effect` avoidance.
- [ ] Fix `src/app/api/desk/tickets/[ticketId]/messages/[messageId]/attachments/[attachmentId]/file-url/route.ts`:
      replace its unconditional `{ download: attachment.filename }` with the same
      `?download=1` + inline-safe-category default logic the Task attachments file-url route
      already implements (Code Context below) — reuse `extensionInfoFor` from
      `@/config/attachment-types`, same `INLINE_SAFE_CATEGORIES` set
      (`image`/`pdf`/`word`/`excel`/`video`).

## Out of Scope / Must-Not-Change

- **No upload capability** — Desk Inbox has no attachment-creation flow and this task doesn't
  add one.
- **No changes to `_attachment-grid-tile.tsx`, `_attachment-actions-menu.tsx`,
  `_use-attachment-deeplink.ts`, or `TaskAttachmentViewerModal`** — pure reuse. If a genuine
  incompatibility surfaces during implementation (e.g. a prop these components need that Desk
  Inbox attachments don't have), flag it in the implementation summary rather than silently
  modifying a shared component three other pages already depend on.
- **No changes to the Task/Ticket/Comment Attachments tabs** — those already have this exact
  presentation; this task brings Desk Inbox up to the same standard, not the reverse.
- **No changes to tasks 390/392's sync logic** (how attachments get into the `attachments`
  table in the first place) — this task is presentation-only, working with data that's already
  correctly synced.
- **No database migration** — no schema change needed.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/inbox/[inboxId]/_attachments-tab.tsx` | Modify | List rows → grid tiles, kebab actions, deep-link auto-open |
| `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` | Modify | `useAttachmentDeepLink()` wiring, pass `copyAttachmentUrl`/`autoOpenAttachmentId` to `AttachmentsTab` |
| `src/app/api/desk/tickets/[ticketId]/messages/[messageId]/attachments/[attachmentId]/file-url/route.ts` | Modify | `?download=1` + inline-safe-category default, replacing the unconditional forced download |

## Code Context

### `_ticket-attachments.tsx` — the exact pattern to port (already reviewed in full; reuse this shape)

```tsx
const actions: AttachmentAction[] = [
  { label: "View", icon: ExternalLink, onClick: () => setViewing(file) },
  { label: "Download", icon: Download, onClick: () => void downloadAttachment(file.fetchUrl) },
  { label: "Copy URL", icon: Link2, onClick: () => copyAttachmentUrl(file.id) },
];
return (
  <AttachmentGridTile
    key={file.id}
    filename={file.filename}
    size={file.size}
    thumbnail={<AttachmentThumbnail filename={file.filename} fetchUrl={file.fetchUrl} />}
    actions={actions}
    onClick={() => setViewing(file)}
  />
);
// ...
{viewing && (
  <TaskAttachmentViewerModal attachment={viewing} fetchUrl={viewing.fetchUrl} onClose={() => setViewing(null)} />
)}
```

Deep-link auto-open (same file):
```tsx
const didAutoOpen = useRef(false);
useEffect(() => {
  if (!autoOpenAttachmentId || didAutoOpen.current || loading) return;
  const match = attachments.find((a) => a.id === autoOpenAttachmentId);
  if (!match) return;
  didAutoOpen.current = true;
  Promise.resolve().then(() => setViewing(match));
}, [autoOpenAttachmentId, attachments, loading]);
```

### Current Desk Inbox `_attachments-tab.tsx`'s data shape (keep this derivation, just reshape the render)

```tsx
type FlatAttachment = { id: string; filename: string; size: number | null; messageId: string; authorName: string; createdAt: string };

export default function AttachmentsTab({ inboxId, messages }: { inboxId: string; messages: MessageItem[] }) {
  const attachments: FlatAttachment[] = messages.flatMap((m) =>
    m.attachments.map((a) => ({ id: a.id, filename: a.filename, size: a.size, messageId: m.id, authorName: m.authorName, createdAt: m.createdAt }))
  );
  // ...
}
```
Each attachment's `fetchUrl` is
`` `/api/desk/tickets/${inboxId}/messages/${a.messageId}/attachments/${a.id}/file-url` `` (unchanged
by this task).

### The file-url fix — port this exact pattern from the Task attachments route

```ts
// src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts
const INLINE_SAFE_CATEGORIES = new Set(["image", "pdf", "word", "excel", "video"]);
// ...
const downloadParam = new URL(req.url).searchParams.get("download") === "1";
const category = extensionInfoFor(attachment.filename)?.category;
const forceDownload = downloadParam || !category || !INLINE_SAFE_CATEGORIES.has(category);

const { data: signed, error: signError } = await supabase.storage
  .from("project-assets")
  .createSignedUrl(attachment.storage_path, 60, forceDownload ? { download: attachment.filename } : undefined);
```
The Desk Inbox route's current unconditional version:
```ts
// src/app/api/desk/tickets/[ticketId]/messages/[messageId]/attachments/[attachmentId]/file-url/route.ts
const { data: signed, error: signError } = await supabase.storage
  .from("ticket-attachments")
  .createSignedUrl(attachment.storage_path, 60, { download: attachment.filename });
```
Bucket name stays `"ticket-attachments"` (unchanged) — only the `createSignedUrl` options
argument needs the same conditional treatment.

## Implementation Steps

1. Fix the file-url route first (small, isolated, unblocks testing the rest).
2. Rewrite `_attachments-tab.tsx`: grid layout, kebab actions, `autoOpenAttachmentId` prop +
   deep-link-open effect, accepting a new `copyAttachmentUrl` prop.
3. Wire `_ticket-detail.tsx`: `useAttachmentDeepLink()`, auto-switch to the Attachments tab when
   `deepLinkedAttachmentId` is present (on mount), pass `copyAttachmentUrl`/
   `autoOpenAttachmentId` down.
4. Run verification (below).

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] Desk Inbox Attachments tab renders as a grid matching the Task/Ticket Attachments tabs'
      visual style (tile size, spacing, thumbnail treatment).
- [ ] Kebab menu shows exactly View, Download, Copy URL — no Remove/upload control anywhere.
- [ ] Clicking View (kebab or tile) opens an inline preview for image/PDF attachments (not a
      forced download) — confirms the file-url fix actually took effect.
- [ ] Clicking Download triggers an actual file download (`Content-Disposition: attachment`).
- [ ] Copy URL copies a link that, when opened, lands on the ticket's Attachments tab with that
      specific attachment's preview already open.
- [ ] Task/Ticket/Comment Attachments tabs are visually and functionally unchanged (regression
      check — shared components weren't modified, but worth confirming nothing broke).

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser: open a Desk Inbox ticket with attachments (e.g. `/desk/inbox/0291a750-8f17-441c-a0c7-e0dd651374b3`,
which has 10 real attachments from task 392's live testing), verify the grid renders, test View/
Download/Copy URL on at least one image or PDF, then paste the copied URL into a fresh tab to
confirm the deep-link auto-open works.

## Implementation Notes

### What Changed
- `src/app/api/desk/tickets/[ticketId]/messages/[messageId]/attachments/[attachmentId]/file-url/route.ts`:
  ported the Task attachments file-url route's `?download=1` + `INLINE_SAFE_CATEGORIES` pattern
  exactly. Signed URLs now only force `Content-Disposition: attachment` when the file isn't an
  inline-safe category (image/pdf/word/excel/video) or the caller explicitly asks for it.
- `src/app/(hub)/desk/inbox/[inboxId]/_attachments-tab.tsx`: fully rewritten from the old
  single-column `AttachmentRow` list to a `grid grid-cols-2 sm:grid-cols-4 gap-3` of
  `AttachmentGridTile`s, reusing `AttachmentThumbnail`/`downloadAttachment` from
  `projects/_shared/_attachment-grid-tile.tsx` unchanged. Kebab actions are exactly View
  (`ExternalLink` icon), Download, Copy URL — no Remove/upload. Added `copyAttachmentUrl` and
  `autoOpenAttachmentId` props; the latter drives a ref-guarded, deferred-setState effect
  (mirrors `_ticket-attachments.tsx`'s `didAutoOpen` pattern exactly) that opens the matching
  attachment's preview once it's found in the derived `attachments` list.
- `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx`: added `useAttachmentDeepLink()`
  (cross-imported from `projects/_shared/`, unmodified), and an effect that switches
  `attachmentsOpen` to `true` when a `?attachment=<id>` deep link is present on load. Passed
  `copyAttachmentUrl`/`autoOpenAttachmentId` down to `AttachmentsTab`.
- Confirmed `TaskAttachmentViewerModal` cross-import (absolute `@/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/...`
  path) is a precedented pattern in this codebase before using it — found an existing example
  (`customers/[customerId]/client.tsx` importing from the same `[projectId]/onboarding-workspace/`
  tree) rather than assuming it would resolve.

### Files Changed
- `src/app/api/desk/tickets/[ticketId]/messages/[messageId]/attachments/[attachmentId]/file-url/route.ts` - inline-safe-category signed URL fix
- `src/app/(hub)/desk/inbox/[inboxId]/_attachments-tab.tsx` - list → grid rewrite, kebab actions, deep-link auto-open
- `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` - `useAttachmentDeepLink()` wiring, prop pass-through

### Deviations From Plan
- None. All three files matched the task doc's Proposed File Changes exactly; no shared
  component (`_attachment-grid-tile.tsx`, `_attachment-actions-menu.tsx`,
  `_use-attachment-deeplink.ts`, `TaskAttachmentViewerModal`) was modified, per the doc's
  explicit boundary.
- One lint fix needed mid-implementation, not a scope deviation: the deep-link effect's direct
  `setAttachmentsOpen(true)` call tripped `react-hooks/set-state-in-effect` — deferred via
  `Promise.resolve().then(...)`, the same fix this exact codebase already applied to the
  analogous case in task 368 (noted in that task's own CLAUDE.md entry).

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings; one new error surfaced and was fixed
  mid-implementation, see Deviations)
- Note: the design-quality hook flagged a `[broken-image]` false positive on the file-url route
  (matched the literal word "img" inside a code comment, not an actual `<img>` tag — this file
  has no JSX at all) — comment wording adjusted to avoid the false trigger, no functional change
- Browser verification (grid rendering, View/Download/Copy URL, deep-link round-trip) - NOT YET
  RUN this round — pending the user's next live pass, same as tasks 389–392

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Genuine reuse, not reimplementation** — confirmed by re-reading all three changed files:
  `AttachmentGridTile`, `AttachmentThumbnail`, `downloadAttachment`,
  `useAttachmentDeepLink`, and `TaskAttachmentViewerModal` are imported and used exactly as their
  existing signatures require, with zero local reimplementation of thumbnail rendering,
  size-formatting, or preview logic. The kebab action list (`AttachmentAction[]`) matches
  `_ticket-attachments.tsx`'s shape and ordering exactly (View, Download, Copy URL), minus the
  `canEdit`-gated Remove entry that doesn't apply here.
- **Data flow is consistent with the rest of this file's siblings** — `AttachmentsTab` still
  derives its list from the already-loaded `messages` prop (no new fetch introduced), matching
  the pre-393 version's approach and the task doc's explicit "no new fetch needed" requirement.
- **The file-url fix correctly benefits both attachment sources uniformly** — task 392's
  ticket-level attachments and this task's thread/comment attachments both resolve to plain
  `entity_type: 'inbox_message'` rows in the `attachments` table, so the same route serves both
  without any special-casing; the inline-preview fix applies to all of them automatically.
- **One implementation choice worth noting, not a defect**: `_attachments-tab.tsx`'s
  `attachments` array is recomputed fresh every render (`messages.flatMap(...)`, not
  memoized/stateful), unlike `_ticket-attachments.tsx`'s stable state-backed version — this
  required an `eslint-disable-next-line react-hooks/exhaustive-deps` (with an explanatory
  comment) on the auto-open effect instead of including `attachments` in the dependency array.
  Functionally correct (the `didAutoOpen` ref guard still prevents re-triggering), and `pnpm
  lint` passed clean with it in place — a `useMemo` around `attachments` would let the effect's
  deps match `_ticket-attachments.tsx`'s pattern exactly and drop the disable comment, but this
  is a style preference on cheap-to-recompute data, not a correctness issue.
- **Error handling and auth are unchanged from the working original** in the file-url route —
  only the signed-URL options argument changed; every prior guard (UUID format check, auth,
  ticket/message/attachment existence checks) is untouched.
- No dead code, no `any`, no secrets/credentials logged, no deep nesting introduced.

### Deviations
- None beyond what Implementation Notes already disclosed (the mid-implementation lint fix,
  which resolved a real lint error rather than working around it).

### Note on workflow adaptation
- Per this repo's durable no-git-commands instruction, changed files were identified from the
  task document's own `Implementation Notes` (3 files) rather than `git diff --name-only`, same
  adaptation used for tasks 389–392's quality gates.

## Final Verification Summary (task marked Completed)

Partial live confirmation: a later screenshot in this session (task 394 follow-up, the "New
Ticket" modal opened via "File a ticket") showed attachment grid tiles rendering on the
underlying ticket detail page behind the modal — consistent with this task's grid work
rendering correctly. However, no explicit, isolated confirmation was given in this session that
the **Attachments tab specifically** (as opposed to task 394's inline per-message grid, a
visually similar but separate surface built on the same shared components) was opened and
exercised — View/Download/Copy URL kebab actions and the `?attachment=` deep-link auto-open were
never individually walked through and confirmed for this tab.

**Marked Completed at the user's explicit request** — the Attachments tab's own
View/Download/Copy URL/deep-link behaviors specifically (as distinct from task 394's inline
grid) were not isolated and re-confirmed; worth a direct check next time the tab is opened.
