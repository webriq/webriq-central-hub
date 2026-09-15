# 368: Task/Ticket Attachments — Grid-Style Comment Attachments + Trimmed Kebab + Unified Attachments Tab

**Created:** 2026-09-15
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Today, attachments uploaded **on a comment** (Task Detail's Comments tab, and Ticket/Issue Detail's Comments tab — "Ticket" here is the Projects-side rename of Issue from task 364, unrelated to Desk's helpdesk tickets) render as a plain vertical list row: file icon, filename, size, and a single "View" text link (Image 1 in the request). The user wants this switched to the same grid-tile card style already used by the Project Files tab / Onboarding Workspace `FileTile` (Image 2): a card with a header row (icon + truncated filename + kebab), a thumbnail body, and a footer with file size — but with the kebab (⋮) menu trimmed down to exactly **View, Download, Copy URL** (dropping Permissions/Rename/Move to folder/Remove from the `FileTile` reference, which don't apply to task/issue attachments — no per-file permission or folder model exists here, confirmed by task 273's Out-of-Scope).

Separately, the user wants every attachment — whether uploaded directly on the task/ticket or uploaded on one of its comments — to also show up in the shared **Attachments** tab (Image 3, the tab that sits alongside Comments/Time Logs). Investigation found this is **already implemented for Tickets** (`GET /api/v2/projects/[projectId]/tickets/[ticketId]/attachments` merges in `entity_type: "comment"` rows keyed off `issue_comments`, task 257 Requirement F) but **missing for Tasks** (`GET /api/v2/projects/[projectId]/tasks/[taskId]/attachments` only ever queried `entity_type: "task"`). This task closes that parity gap using the exact same merge pattern, and gives both Attachments tabs' tiles the same trimmed View/Download/Copy URL kebab.

There is only one API layer (`/api/v2/...`) shared by both the `/projects/v2/...` and `/projects/legacy/...` route groups — but the **client components are fully duplicated, byte-for-byte, per route group** (confirmed via diff: `_task-attachments.tsx`, `_task-comments.tsx`, `_task-attachments-comments-panel.tsx`, and their `_ticket-*` counterparts are identical between `v2` and `legacy`). Every UI change in this task must be applied to **all 4 client-side surfaces**: v2 Task Detail, v2 Ticket Detail, Legacy Task Detail, Legacy Ticket Detail.

"Copy URL" cannot copy the raw signed Supabase Storage URL — those expire in 60 seconds (see every `file-url` route below). The established precedent for a shareable, non-expiring attachment link is the Project Files tab's `?file=<assetId>` deep link (task 359, `_use-files-deeplink.ts`), which lands the viewer on the right screen and auto-opens the preview. This task adds the equivalent for task/ticket attachments: a `?attachment=<id>` query param on the Task/Ticket detail page that auto-switches the Comments/Attachments/Time Logs panel to the Attachments tab and auto-opens that attachment's viewer — working for both task/ticket-native and comment-sourced ids, since after this task both live in the same merged Attachments-tab list.

## Requirements

- [ ] **R1 — Grid-style comment attachments.** Attachments listed under a comment (Task Comments and Ticket Comments, v2 + legacy) render as grid tile cards (header icon+filename+kebab, thumbnail body, size footer) instead of the current single-column list row, visually matching the Files tab / `FileTile` reference (Image 2) at grid-tile scale.
- [ ] **R2 — Trimmed kebab everywhere in this task's scope.** Every attachment tile touched by this task (comment-embedded tiles on both Comments tabs, and the Task Attachments tab's tiles) exposes exactly three kebab actions: **View**, **Download**, **Copy URL**. No Permissions/Rename/Move to folder.
- [ ] **R3 — Task Attachments tab shows comment attachments too.** `GET /api/v2/projects/[projectId]/tasks/[taskId]/attachments` is extended to merge in attachments uploaded on that task's comments (`entity_type: "comment"` rows whose `entity_id` is one of the task's `task_comments.id`s), mirroring the ticket route's existing merge exactly (same `source`/`commentId`/`fetchUrl` shape). Response stays sorted by `created_at` ascending.
- [ ] **R4 — Task Attachments tab renders the merged list.** `TaskAttachments` (v2 + legacy) consumes the new `source`/`commentId`/`fetchUrl` fields (same shape `TicketAttachments` already consumes) and gains Download + Copy URL on its kebab (today it only has View).
- [ ] **R5 — Ticket Attachments tab kebab gets Download + Copy URL.** `TicketAttachments` (v2 + legacy) kebab gains Download + Copy URL alongside its existing View and its existing conditional "Remove" (ticket-native rows, `canEdit` only) — Remove is **preserved**, not part of what's being trimmed (see Out of Scope).
- [ ] **R6 — Real download regardless of file type.** A kebab "Download" always forces a real file download (`Content-Disposition: attachment`), even for image/PDF/office files that the existing `file-url` routes otherwise return as an inline-viewable signed URL. All four attachment `file-url` routes (task attachment, ticket attachment, task-comment attachment, ticket-comment attachment) accept a `?download=1` query param that forces `{ download: filename }` on `createSignedUrl` unconditionally, mirroring `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts`'s existing `?download=1` handling.
- [ ] **R7 — Copy URL copies a deep link, not a signed URL.** "Copy URL" writes an absolute `{detail-page pathname}?attachment=<id>` link to the clipboard via the existing `copyLink()` helper (`_copy-link-button.tsx`), with the same toast success/failure feedback as `_use-files-deeplink.ts`'s `copyTo`.
- [ ] **R8 — `?attachment=<id>` deep link.** Loading a Task or Ticket detail page with `?attachment=<id>` in the URL opens the Comments/Attachments/Time Logs panel directly on the Attachments tab and auto-opens that attachment's viewer modal once the (merged) attachments list has loaded and the id is found in it. An unresolvable id (deleted, or the viewer lacks access) just lands on the Attachments tab with nothing auto-opened — no error state needed.
- [ ] **R9 — Applied to all 4 duplicated surfaces.** Every change lands identically in `projects/v2/[projectId]/tasks/[taskId]/`, `projects/v2/[projectId]/tickets/[ticketId]/`, `projects/legacy/[projectId]/tasks/[taskId]/`, and `projects/legacy/[projectId]/tickets/[ticketId]/`.
- [ ] **R10 — Shared, not re-duplicated.** The new grid-tile card markup (currently near-identical between `_task-attachments.tsx` and `_ticket-attachments.tsx`, and about to gain a third near-identical copy in both Comments components) is factored into one shared component under `src/app/(hub)/projects/_shared/`, per `nextjs-file-length-best-practices.md` — new duplication should not be introduced across 4+ call sites when the existing `_shared/_attachment-actions-menu.tsx` / `_attachment-dropzone.tsx` precedent already established that pattern for this exact feature area.
- [ ] **R11** — `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Out of Scope / Must-Not-Change

- **No new upload/delete capability on the Task Attachments tab.** It stays read-only exactly as today (uploads only happen via the New Task modal at creation time) — it just shows more items now (its own + comment-sourced) and gains Download/Copy URL on the kebab.
- **Ticket Attachments tab's existing "Remove" action is preserved**, not stripped. The user's "only View, Download, and Copy URL" instruction is read as targeting (a) the new comment-attachment tiles (which have never had a Remove action) and (b) the previously View-only Task Attachments tab — not as an instruction to remove existing delete capability from the Ticket tab. **Flagging this reading for explicit confirmation at review**, since it's the one place this task's scope is genuinely ambiguous.
- **No schema/migration changes.** The polymorphic `attachments` table already has every column needed (`entity_type` ∈ `task | issue | comment`, `entity_id`, `storage_path`, `filename`, `size`, `created_at`). No new columns, no new tables.
- **Comment attachments remain non-deletable from the Comments tab UI** — that capability doesn't exist today and isn't requested.
- **Desk (helpdesk) ticket attachments** (`/desk/tickets/...`, `/desk/inbox/[ticketId]/_attachments-tab.tsx`) are a completely separate feature (Zoho Desk email tickets, unrelated `tickets`/`ticket_messages` tables) and are not touched by this task.
- **`src/app/(hub)/projects-old/`** is dead, unrouted reference code — only a couple of its shared helpers (`OwnerChip`, `normalizeZohoDescriptionHtml` from `_pm-shared.tsx`) are still imported by the live v2/legacy comment components. Not modified.
- **The Project Files tab / Onboarding Workspace `FileTile` component itself is reference-only** and is not modified — its permission badge, version badge, and Rename/Move/Permissions actions have no equivalent in the task/ticket attachment data model and stay exactly as-is.
- **No change to how comment posting / attachment upload during comment composition works** (`CommentComposer`, `_comment-editor.tsx`, the `POST .../comments/[commentId]/attachments` routes) — only the **display** of already-uploaded comment attachments changes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_attachment-grid-tile.tsx` | Create | Shared grid-tile card (header icon+filename+kebab, thumbnail slot, size footer) + `formatFileSize`/extension-category helpers, factored out of the near-duplicate JSX in `_task-attachments.tsx`/`_ticket-attachments.tsx`, now also used by both Comments components |
| `src/app/(hub)/projects/_shared/_use-attachment-deeplink.ts` | Create | `useAttachmentDeepLink()` — reads `?attachment=<id>` via `usePathname`/`useSearchParams`, exposes `deepLinkedAttachmentId` + `copyAttachmentUrl(id)` (mirrors `_use-files-deeplink.ts`'s `copyTo` pattern) |
| `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` | Modify | `GET` merges in `entity_type: "comment"` attachments keyed off `task_comments` for this task, mirroring the ticket route's existing merge (R3) |
| `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts` | Modify | Accept `?download=1` to force `{ download: filename }` unconditionally (R6) |
| `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/attachments/[attachmentId]/file-url/route.ts` | Modify | Same `?download=1` support (R6) |
| `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/[attachmentId]/file-url/route.ts` | Modify | Same `?download=1` support (R6) |
| `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId]/attachments/[attachmentId]/file-url/route.ts` | Modify | Same `?download=1` support (R6) |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachments.tsx` | Modify | Consume merged `source`/`commentId`/`fetchUrl` fields; render via shared grid tile; kebab → View/Download/Copy URL; accept `autoOpenAttachmentId`/`copyAttachmentUrl` props |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-attachments.tsx` | Modify | Identical change (R9) |
| `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-attachments.tsx` | Modify | Render via shared grid tile; kebab → View/Download/Copy URL + existing conditional Remove; accept `autoOpenAttachmentId`/`copyAttachmentUrl` props |
| `src/app/(hub)/projects/legacy/[projectId]/tickets/[ticketId]/_ticket-attachments.tsx` | Modify | Identical change (R9) |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Replace the `<ul>` list-row attachment rendering (current lines ~247–273) with the shared grid tile in a small grid; kebab → View/Download/Copy URL; accept `copyAttachmentUrl` prop |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Identical change (R9) |
| `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-comments.tsx` | Modify | Same list→grid change for ticket comment attachments; accept `copyAttachmentUrl` prop |
| `src/app/(hub)/projects/legacy/[projectId]/tickets/[ticketId]/_ticket-comments.tsx` | Modify | Identical change (R9) |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify | Use `useAttachmentDeepLink()`; initial tab = `"attachments"` when `?attachment=` present; thread `autoOpenAttachmentId`/`copyAttachmentUrl` to `TaskAttachments`/`TaskComments` |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify | Identical change (R9) |
| `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-attachments-comments-panel.tsx` | Modify | Same wiring for `TicketAttachments`/`TicketComments` |
| `src/app/(hub)/projects/legacy/[projectId]/tickets/[ticketId]/_ticket-attachments-comments-panel.tsx` | Modify | Identical change (R9) |

19 files (2 new, 17 modified). No migration, no `env.example`, no `CLAUDE.md` change expected (flag for the `document` stage only if the implementation stage surfaces a durable convention worth recording).

## Code Context

### Reference: the merge this task replicates for tasks (already shipped for tickets)

`src/app/api/v2/projects/[projectId]/tickets/[ticketId]/attachments/route.ts` (GET, lines 39–93) — copy this shape for the task route, substituting `issues`/`issue_comments`/`"issue"` → `tasks`/`task_comments`/`"task"` and the task-side comment attachment path (`/api/v2/tasks/${taskId}/comments/${a.entity_id}/attachments/${a.id}/file-url` — no `projectId` segment, per the existing task-comment-attachment route family):

```ts
const { data: comments } = await supabase.from("issue_comments").select("id").eq("issue_id", ticket.id);
const commentIds = (comments ?? []).map((c) => c.id);

type MergedAttachment = {
  id: string; filename: string; size: number | null; created_at: string;
  source: "ticket" | "comment"; commentId: string | null; fetchUrl: string;
};

const merged: MergedAttachment[] = (issueAttachments ?? []).map((a) => ({
  ...a, source: "ticket", commentId: null,
  fetchUrl: `/api/v2/projects/${projectId}/tickets/${ticketId}/attachments/${a.id}/file-url`,
}));

if (commentIds.length > 0) {
  const { data: commentAttachments } = await supabase
    .from("attachments")
    .select("id, filename, size, created_at, entity_id")
    .eq("entity_type", "comment")
    .in("entity_id", commentIds)
    .order("created_at", { ascending: true });

  for (const a of commentAttachments ?? []) {
    merged.push({
      id: a.id, filename: a.filename, size: a.size, created_at: a.created_at,
      source: "comment", commentId: a.entity_id,
      fetchUrl: `/api/v2/projects/${projectId}/tickets/${ticketId}/comments/${a.entity_id}/attachments/${a.id}/file-url`,
    });
  }
}
merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
```

`TicketAttachments` (`_ticket-attachments.tsx`) already consumes exactly this shape — use it as the reference for updating `TaskAttachments` to do the same (today `TaskAttachments`'s `AttachmentRow` is just `{ id, filename, size, created_at }` with no `source`/`fetchUrl`).

### Reference: `?download=1` force-download pattern

`src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts` (lines 44–50):

```ts
const download = new URL(request.url).searchParams.get("download") === "1";
const { data: signed, error: signError } = await adminClient.storage
  .from("customer-assets")
  .createSignedUrl(asset.file_path, 60, download ? { download: asset.file_name ?? true } : undefined);
```

The task/ticket attachment `file-url` routes already compute a `forceDownload` boolean from file category (`INLINE_SAFE_CATEGORIES`) — change that computation to `forceDownload = downloadParam || !category || !INLINE_SAFE_CATEGORIES.has(category)` so an explicit `?download=1` always wins regardless of category. The two comment-attachment `file-url` routes currently never pass a `download` option at all — add the same `?download=1`-driven conditional.

### Reference: deep-link + copy pattern to mirror

`src/app/(hub)/projects/_shared/_use-files-deeplink.ts` (lines 76–86) — the `copyTo`/`copyFileUrl` shape to replicate for attachments (new hook builds `${pathname}?attachment=${id}` instead of `?file=${id}`; no folder-resolution logic needed since there's no folder concept here):

```ts
const copyTo = useCallback(async (relativeUrl: string, label: string) => {
  const ok = await copyLink(relativeUrl);
  if (ok) toast.success(`${label} link copied`);
  else toast.error("Couldn't copy link");
}, []);
const copyFileUrl = useCallback((assetId: string) => copyTo(`${pathname}?file=${assetId}`, "File"), [copyTo, pathname]);
```

`autoPreview` ref-guard pattern to mirror for auto-opening the viewer once (from `_file-tile.tsx`, lines 135–141):

```ts
const didAutoPreview = useRef(false);
useEffect(() => {
  if (!autoPreview || didAutoPreview.current) return;
  didAutoPreview.current = true;
  handleView();
}, [autoPreview]);
```

### Current comment-attachment list to replace (Image 1 → Image 2)

`_task-comments.tsx` (and identically in `_ticket-comments.tsx`, v2 + legacy), current block (~lines 247–273) — replace this `<ul>` of list rows with a small grid of the new shared tile component, each tile's kebab built from `[{View}, {Download}, {Copy URL}]` via the existing `AttachmentActionsMenu` (`_shared/_attachment-actions-menu.tsx`, unchanged):

```tsx
{c.attachments.length > 0 && (
  <ul className="flex flex-col gap-1 mt-1.5">
    {c.attachments.map((file) => (
      <li key={file.id} className="flex items-center gap-2 rounded-[8px] border border-[#E2E7F2] bg-white px-2.5 py-1.5">
        {/* icon, filename, size, single "View" text button */}
      </li>
    ))}
  </ul>
)}
```

### Kebab action shape (unchanged mechanism, just a shorter list)

`AttachmentActionsMenu` (`_shared/_attachment-actions-menu.tsx`) already takes a generic `AttachmentAction[]`. Every tile in this task builds:

```ts
const actions: AttachmentAction[] = [
  { label: "View", icon: ExternalLink, onClick: () => setViewing(file) },
  { label: "Download", icon: Download, onClick: () => void handleDownload(file) },
  { label: "Copy URL", icon: Link2, onClick: () => copyAttachmentUrl(file.id) },
  // Ticket Attachments tab only, ticket-native + canEdit:
  ...(canEdit && file.source === "ticket" ? [{ label: "Remove", icon: Trash2, onClick: () => void handleDelete(file.id), danger: true }] : []),
];
```

`handleDownload(file)` follows `_file-tile.tsx`'s existing `handleDownload` shape (lines 148–163): `fetch(`${file.fetchUrl}?download=1`)` (or append `download=1` correctly if `fetchUrl` needs a `?`/`&` join), then open the returned signed URL via a temporary `<a>` click — do **not** rely on the `download` HTML attribute, since the signed URL is cross-origin.

## Implementation Steps

1. Create `_shared/_attachment-grid-tile.tsx`: extract the grid-tile card markup (header row with `FileText`/`Image` icon + truncated filename + `<AttachmentActionsMenu>` slot, thumbnail body slot, footer with formatted size) as a presentational component taking `filename`, `size`, a `thumbnail: ReactNode` slot, and an `actions: AttachmentAction[]` (or a slot for `<AttachmentActionsMenu>`); export `formatFileSize`/extension-category helpers currently duplicated across `_task-attachments.tsx`/`_ticket-attachments.tsx`.
2. Create `_shared/_use-attachment-deeplink.ts`: `useAttachmentDeepLink()` reading `?attachment=` via `usePathname`/`useSearchParams`, returning `{ deepLinkedAttachmentId, copyAttachmentUrl }`.
3. Update `GET .../tasks/[taskId]/attachments/route.ts` to merge in `task_comments`-scoped `entity_type: "comment"` attachments (mirrors the ticket route verbatim — see Code Context).
4. Add `?download=1` handling to all 4 `file-url` routes listed in Proposed File Changes.
5. Update `_task-attachments.tsx` (v2, then port identically to legacy): consume the new merged shape, render via the shared tile, kebab = View/Download/Copy URL, accept + wire `autoOpenAttachmentId` (auto-open effect, ref-guarded) and `copyAttachmentUrl` props.
6. Update `_ticket-attachments.tsx` (v2, then legacy): render via the shared tile, kebab = View/Download/Copy URL + existing conditional Remove, wire the same two new props.
7. Update `_task-comments.tsx` (v2, then legacy): replace the list `<ul>` with a grid of the shared tile per comment's `attachments`, kebab = View/Download/Copy URL, wire `copyAttachmentUrl` prop through from the panel.
8. Update `_ticket-comments.tsx` (v2, then legacy): same change.
9. Update all 4 `*-attachments-comments-panel.tsx` files: call `useAttachmentDeepLink()`, seed the tab `useState` initializer from `deepLinkedAttachmentId` (`"attachments"` vs `"comments"`), pass `autoOpenAttachmentId={deepLinkedAttachmentId}` to the Attachments child and `copyAttachmentUrl` to both children.
10. Manually re-diff each legacy file against its v2 counterpart after editing (`diff` returned empty before this task — confirm they're identical again after, since that parity is load-bearing for future maintenance per the existing convention).
11. Run `npx tsc --noEmit` and `pnpm lint`; fix any type errors from the new merged `AttachmentRow` shape.

## Acceptance Criteria

- [ ] On a Task's Comments tab, a comment with attachments shows them as grid tile cards (icon+filename+kebab header, thumbnail, size footer), not a list row.
- [ ] Each such tile's kebab shows exactly View, Download, Copy URL.
- [ ] Same for a Ticket's Comments tab (v2 and legacy).
- [ ] The Task's Attachments tab shows both attachments added directly to the task AND attachments uploaded on any of the task's comments, deduplicated and correctly sourced (no "From comment" mislabels).
- [ ] The Ticket's Attachments tab continues to show both ticket-native and comment-sourced attachments (unchanged behavior) with the kebab now additionally offering Download and Copy URL, and Remove still present for ticket-native rows when the viewer can edit.
- [ ] Clicking Download on an image or PDF attachment (previously inline-viewable only) triggers an actual file download, not a new-tab navigation.
- [ ] Clicking Copy URL copies a link that, when opened, lands on that Task/Ticket's detail page with the Attachments tab active and that attachment's viewer open — for both a task/ticket-native attachment and a comment-uploaded one.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual browser acceptance (both `/projects/v2/[projectId]/tasks/[taskId]` and `/projects/legacy/[projectId]/tasks/[taskId]`, and the ticket equivalents):
1. Post a comment with 1–2 attachments (one image, one non-image e.g. PDF/doc) → confirm grid tile rendering + 3-item kebab.
2. Switch to the Attachments tab → confirm the same files appear there too, alongside any task/ticket-native attachments.
3. Use Download from a comment tile and from an Attachments-tab tile → confirm a real file download for both an image and a non-image.
4. Use Copy URL from a comment tile → paste the link in a new tab → confirm it opens the detail page on the Attachments tab with that file's viewer open.
5. Repeat step 4 for a Copy URL taken from an Attachments-tab tile (task/ticket-native attachment).
6. Confirm the Ticket Attachments tab's existing Remove action (for a ticket-native attachment, as an admin/pm/developer-owner) still works.

## Compatibility Touchpoints

- No packaging, docs-adapter, or install-surface impact.
- No env vars, no migration.
- `CLAUDE.md`'s attachment-related notes are not currently detailed enough to need correction, but the `document` stage should consider adding a short note about the `?attachment=<id>` deep-link convention (mirroring the existing `?file=<id>` Files-tab note) once this ships.

## Implementation Notes

### What Changed
- Added `_shared/_attachment-grid-tile.tsx` (`AttachmentGridTile`, `AttachmentThumbnail`, `downloadAttachment`, `formatFileSize`, `extensionOf`) — the single grid-tile card now used by both Attachments tabs and both Comments tabs, replacing the near-duplicate JSX that used to live separately in `_task-attachments.tsx`/`_ticket-attachments.tsx` and the list-row markup in both Comments components.
- Added `_shared/_use-attachment-deeplink.ts` (`useAttachmentDeepLink`) — reads `?attachment=<id>`, exposes `deepLinkedAttachmentId` + `copyAttachmentUrl(id)`, mirroring `_use-files-deeplink.ts`'s `copyTo` pattern.
- `GET .../tasks/[taskId]/attachments` now merges in `entity_type: "comment"` attachments scoped to the task's `task_comments`, in the exact shape (`source`/`commentId`/`fetchUrl`) the ticket route already returned — closing the parity gap identified during planning.
- All 4 attachment `file-url` routes (task, ticket, task-comment, ticket-comment) accept `?download=1`, forcing `{ download: filename }` unconditionally regardless of file category.
- `TaskAttachments`/`TicketAttachments` (v2 + legacy) render via the shared tile, consume `fetchUrl`, and expose View/Download/Copy URL (+ Ticket's existing conditional Remove, preserved) on the kebab; both accept new `autoOpenAttachmentId`/`copyAttachmentUrl` props and auto-open the viewer once a deep-linked id is found in the loaded list.
- `TaskComments`/`TicketComments` (v2 + legacy) render each comment's real `attachments` as a small grid of the shared tile (View/Download/Copy URL kebab) instead of a single-column list row. Ticket Comments' separate `legacyAttachments` (Zoho-imported, no real file) list is untouched — it has no `fetchUrl`/downloadable file to attach these actions to.
- Both `*-attachments-comments-panel.tsx` files (task + ticket, v2 + legacy) call `useAttachmentDeepLink()`, seed the tab `useState` from `deepLinkedAttachmentId` (`"attachments"` vs `"comments"`), and thread `autoOpenAttachmentId`/`copyAttachmentUrl` to their children.
- Re-diffed all 6 duplicated v2/legacy component pairs after every edit — confirmed byte-identical throughout, preserving the existing convention.

### Files Changed
- `src/app/(hub)/projects/_shared/_attachment-grid-tile.tsx` - new shared grid-tile card + helpers (R1, R10)
- `src/app/(hub)/projects/_shared/_use-attachment-deeplink.ts` - new deep-link hook (R7, R8)
- `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` - GET merges in comment attachments (R3)
- `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts` - `?download=1` support (R6)
- `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/attachments/[attachmentId]/file-url/route.ts` - `?download=1` support (R6)
- `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/[attachmentId]/file-url/route.ts` - `?download=1` support (R6)
- `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId]/attachments/[attachmentId]/file-url/route.ts` - `?download=1` support (R6)
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachments.tsx` + legacy counterpart - merged shape, shared tile, Download/Copy URL, deep-link auto-open (R4, R8, R9)
- `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-attachments.tsx` + legacy counterpart - shared tile, Download/Copy URL added, Remove preserved, deep-link auto-open (R5, R8, R9)
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-comments.tsx` + legacy counterpart - grid tile replaces list row (R1, R2, R9)
- `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-comments.tsx` + legacy counterpart - grid tile replaces list row for real attachments only (R1, R2, R9)
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` + legacy counterpart - deep-link wiring (R8, R9)
- `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-attachments-comments-panel.tsx` + legacy counterpart - deep-link wiring (R8, R9)

### Deviations From Plan
- The auto-open effect in `TaskAttachments`/`TicketAttachments` originally called `setViewing(match)` directly in the effect body (as planned via the `_file-tile.tsx` `autoPreview` reference). `pnpm lint`'s `react-hooks/set-state-in-effect` rule flagged this as a new error (it does not fire on `_file-tile.tsx`'s own `handleView()` indirection, since that function's setState calls are followed by further async work, not a bare synchronous call). Fixed by deferring the call a microtask (`Promise.resolve().then(() => setViewing(match))`), matching the pattern every fetch-driven effect elsewhere in this codebase already uses (setState inside a `.then`, never bare in the effect body). No functional/timing difference perceptible to the user — the microtask resolves before the next paint.
- Everything else matches the plan as written; no scope changes.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing, unrelated warnings in `_checklist-tab.tsx` — same pair noted in prior tasks' lint runs)
- Manual browser acceptance (the step-by-step script in Verification above) - NOT RUN (no interactive browser session in this implementation pass)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Diffed every changed file individually (`git diff` per file, since the working tree also carries a large, unrelated pre-existing uncommitted diff from the in-progress issues→tickets rename — task 368's ticket-side files show as untracked/new in `git status` for that reason, not because of anything this task did). Every diff is minimal and additive to its stated purpose; no unrelated churn.
- No unused code: `formatFileSize`/`extensionOf`/`IMAGE_EXTENSIONS`/`FileText`/`ImageIcon` were removed from `_task-comments.tsx` and `_task-attachments.tsx` exactly where they became dead after extraction to the shared tile — confirmed by a clean `pnpm lint` (unused-import/no-unused-vars would have caught stragglers). `_ticket-comments.tsx` correctly kept its `IMAGE_EXTENSIONS`/`FileText`/`ImageIcon`/`formatFileSize` since the untouched `legacyAttachments` block still uses them.
- No dead code or commented-out implementation left behind.
- Types: no new `any`; the merged `AttachmentRow`/`MergedAttachment` shapes are fully typed and consistent between the task and ticket sides.
- File sizes stay well inside `nextjs-file-length-best-practices.md`'s soft-warning range (largest touched file is `_ticket-comments.tsx` at 394 lines, unchanged from its pre-existing 393 — this task added 1 net line there since only the real-attachment block was touched, not the file's overall shape).
- Naming is accurate (`AttachmentGridTile`, `useAttachmentDeepLink`, `downloadAttachment` all describe exactly what they do).
- Repeated logic (the grid-tile card markup, the thumbnail-fetch effect, `formatFileSize`) is now centralized in `_attachment-grid-tile.tsx` per R10 — confirmed by diff stat showing a net line reduction in `_task-attachments.tsx` (166 deletions vs 91 insertions) despite added functionality.
- Errors handled the same way the surrounding code already does (silent no-op on a failed thumbnail/download fetch, matching every existing sibling effect) — intentional, not an oversight, consistent with this codebase's established convention for low-stakes convenience actions.
- No secrets, credentials, or debug `console.log` introduced.
- All 6 v2/legacy duplicated component pairs re-verified byte-identical (`diff -q`) after every edit, per the task doc's own convention.

### Deviations
- **Minor** — R8's auto-open effect defers the `setViewing(match)` call a microtask (`Promise.resolve().then(...)`) instead of the plan's literal bare call, to satisfy `react-hooks/set-state-in-effect` (a lint rule not anticipated during planning; the plan's own `_file-tile.tsx` reference avoids it only because its indirection happens through a differently-shaped function). No functional or perceptible timing difference. Already recorded in Implementation Notes.
- **Medium, pre-flagged, not a new finding** — the Ticket Attachments tab's existing "Remove" action is preserved rather than trimmed to exactly View/Download/Copy URL. This was raised as an explicit, reasoned scope call during planning (R5 and the Out-of-Scope section) and the task doc already asks the user to confirm this reading at review — carrying it forward here rather than treating it as a new implementation-stage deviation.

### Required Fixes
- None.
