# 301: Comment/Attachment Bug Parity (Task Comments + v2) + Collapsible Attachment Composer Redesign

**Created:** 2026-08-25
**Priority:** HIGH
**Type:** bugfix / enhancement
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Follow-up to task 299. Testing task 299's fix on the **Task Comments** panel (legacy) surfaced the same bug family there, plus one bug 299 didn't catch:

1. **Attachment upload RLS failure** — identical `storage.upload()` → `project-assets` bucket RLS rejection as task 299, this time on `POST /api/v2/tasks/{taskId}/comments/{commentId}/attachments`. Confirmed via code inspection: this route uses the exact same `createClient()` + `storage.from("project-assets").upload(...)` pattern as the issue-comment-attachments route task 299 fixed, and the **same bucket**. Migration 115 (task 299) already covers this — it's bucket-level, not route-specific — so **no new migration is needed**; this is very likely migration 115 still not applied to the remote database yet (299's Testing note already flagged it as pending). First implementation step is to confirm/re-confirm it's applied before doing anything else.
2. **`onCountChange`-inside-`setState`-updater warning** ("Cannot update a component while rendering a different component") — task 299 only fixed this in the **legacy issue** comments/attachments files. The identical unfixed pattern is confirmed present in 6 more files: legacy task comments, legacy task attachments, v2 task comments, v2 task attachments, v2 issue comments, v2 issue attachments.
3. **New bug — duplicate comment key** ("Encountered two children with the same key"). Root cause: a race between the realtime `commentsChannel` subscription and the component's own optimistic UI update. In `postComment()`, the local optimistic append (`setComments((prev) => [...prev, created])`) only happens **after** all attachment files finish uploading. But the comment row is inserted into the DB — and its Postgres realtime `INSERT` event fires — as soon as the initial `POST .../comments` call succeeds, well before attachment uploads complete. If that realtime event arrives during the gap (which attachment uploads make wide enough to hit in practice), the handler's dedupe guard (`commentsRef.current.some((c) => c.id === row.id)`) finds nothing yet (local state hasn't been optimistically updated), so it calls `fetchComments()` and adds the comment via a full server refetch. Then, once `postComment()`'s own attachment uploads finish, its **still-pending** optimistic append adds the *same* comment a second time — two array entries with the same `id`, hence React's duplicate-key warning (and the comment could render twice). This exact architecture (delayed optimistic append + realtime dedupe-by-ref guard) is shared by **all four** `*-comments.tsx` files (legacy/v2 × task/issue), so all four carry this latent bug, not just Task Comments — it was likely just easier to trigger there because attaching a file adds the delay needed to open the race window, and task 299's testing pass happened not to hit it.

Additionally, this task **redesigns the comment composer** across all four comment surfaces to match a Zoho-style reference layout the user provided:
- The attachment picker becomes **collapsible/expandable, default collapsed**, toggled by an "Attach Files" control (paperclip icon) placed in the **same row as the post/clear buttons, left-aligned** (mirroring Zoho's own layout).
- The current "Cancel"-less composer gains a **"Clear"** button (not "Cancel") that clears both the draft text and any staged attachment files.
- The current user's **avatar** appears to the **left of the rich-text editor** (mirroring the Zoho reference image), using the existing `avatar_url`-with-initials-fallback pattern (task 289) via the already-shared `Avatar` component in `dashboard-shared.tsx`.

Since this exact composer chrome is identical across all four comment files, it's extracted into one new shared component rather than hand-duplicated a fourth/fifth time — directly serving the user's ask to follow `nextjs-file-length-best-practices.md` (the two issue-comments files are already 368–371 lines, past the doc's 250–300-line soft-warning zone; extracting the composer footer brings them back down instead of growing them further).

## Requirements

- [ ] Migration 115 is confirmed applied to the remote database (implementation step 1) — without it, nothing else in this task fixes the reported upload error.
- [ ] Uploading an attachment on a Task Comment (legacy and v2) succeeds for a developer-role user, matching the fix already verified for Issue Comments.
- [ ] No "Cannot update a component while rendering a different component" console warning from any of: legacy task comments, legacy task attachments, v2 task comments, v2 task attachments, v2 issue comments, v2 issue attachments (legacy issue comments/attachments already clean from task 299).
- [ ] No "Encountered two children with the same key" console warning, and no duplicate comment rendered, when posting a comment with one or more attachments on any of the four comment surfaces (legacy task, v2 task, legacy issue, v2 issue).
- [ ] The attachment picker on all four comment composers is collapsed by default and expands/collapses via an "Attach Files" toggle.
- [ ] The toggle sits in the same row as the post/clear buttons, left-aligned; post/clear stay right-aligned (matching the provided Zoho reference).
- [ ] A "Clear" button (not "Cancel") is present on all four composers and clears both the draft text and any staged attachment files.
- [ ] The current user's avatar (or initials fallback, per the existing `avatar_url` pattern) renders to the left of the rich-text editor on all four composers.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.
- [ ] No regression to existing comment/attachment functionality (posting, deleting an issue comment, viewing an attachment, realtime sync, tab counts) on any of the four surfaces.

## Out of Scope / Must-Not-Change

- No new storage migration — the RLS fix is already covered by migration 115 (task 299); this task only needs it *applied*, not re-authored.
- `_task-attachment-picker.tsx`'s internals (dropzone, file-type icons, per-file remove) — reused as-is inside the new collapsible wrapper, not modified.
- The four Tiptap editor components (`_comment-editor.tsx` ×2, `_issue-comment-editor.tsx` ×2) — not merged or refactored. They stay separate per-tree files; only the surrounding composer chrome (avatar, attach toggle, footer buttons) is unified into a new shared component. Merging the editors themselves would be a materially larger, unrequested architecture change.
- `legacy/issues/[issueId]/_issue-comments.tsx` and `_issue-attachments.tsx`'s already-shipped task-299 purity fix — not reverted; only the new duplicate-key race fix and composer swap are added on top.
- Task Comments' lack of a delete button — task 206 Decision #6 deliberately left task-comment delete out of scope; not added here.
- No change to the "Post comment" button's label — the user asked to rename "Cancel" → "Clear", not the submit button.
- `legacyAttachments` (Zoho-imported metadata-only attachments, issue comments only) — rendering in the comment list is unaffected; the composer redesign only touches the *new*-comment composer, not the list.
- No change to `OwnerChip` (existing comment-author avatar in the list) — task 289 explicitly left this out of scope, and this task's avatar request is specifically "left of the RTE" (the composer's own current-user avatar), not the list.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_comment-composer.tsx` | Create | New shared component: avatar + editor slot + collapsible attachment picker + footer row (Attach Files toggle left, Clear + Post right). Used by all 4 comment files below. |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Fix duplicate-key race in `postComment` (reorder optimistic append before attachment upload, merge attachments after); remove `onCountChange`-in-updater pattern (fetch `.then` + `postComment`), add count-reporting effect; accept `currentUserName`/`currentUserAvatarUrl` props; swap composer JSX for `CommentComposer`. |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Identical changes (file is currently byte-identical to the legacy version). |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-attachments.tsx` | Modify | Same `onCountChange`-out-of-updater consolidation task 299 applied to `_issue-attachments.tsx` (fetch `.then`, realtime INSERT/DELETE, `handleDelete`), plus a count-reporting effect. No composer changes (this is the plain Attachments tab, not the comment composer). |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachments.tsx` | Modify | Identical changes (file is currently byte-identical to the legacy version). |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-comments.tsx` | Modify | Apply task 299's purity fix (currently unfixed, file is byte-identical to legacy's pre-299 state) **plus** the duplicate-key race fix in `postComment`, **plus** composer swap + avatar props. |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-attachments.tsx` | Modify | Apply task 299's purity fix (currently unfixed, byte-identical to legacy's pre-299 state). |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-comments.tsx` | Modify | Already has the 299 purity fix — add only the duplicate-key race fix in `postComment` and the composer swap + avatar props. |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify | Accept new `currentUserName`/`currentUserAvatarUrl` props (and `currentUserId`, not currently threaded at all here), pass to `TaskComments` only. |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify | Identical changes (file is currently byte-identical to the legacy version). |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-attachments-comments-panel.tsx` | Modify | Accept new `currentUserName`/`currentUserAvatarUrl` props, pass to `IssueComments` only (already passes `currentUserId`/`currentUserRole`). |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-attachments-comments-panel.tsx` | Modify | Identical changes. |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Accept new `currentUserName`/`currentUserAvatarUrl` props from `page.tsx`; pass `currentUserId` + the two new props to `TaskAttachmentsCommentsPanel` (currently only passes `projectId`/`taskId`/`timeLogsRefreshKey`). |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Identical changes. |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Accept new `currentUserName`/`currentUserAvatarUrl` props; pass through to `IssueAttachmentsCommentsPanel` (already passes `currentUserId`/`currentUserRole`). |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Identical changes. |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/page.tsx` | Modify | Extend the current-user profile query from `.select("role")` to `.select("role, full_name, avatar_url")`; pass `currentUserName`/`currentUserAvatarUrl` to `TaskDetailClient`. |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/page.tsx` | Modify | Identical changes. |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/page.tsx` | Modify | Extend the current-user profile query from `.select("role")` to `.select("role, full_name, avatar_url")`; pass `currentUserName`/`currentUserAvatarUrl` to `IssueDetailClient`. |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/page.tsx` | Modify | Identical changes. |

That's 1 new shared component and 21 modified files — large in file count, but every change is either a small, uniform prop-threading hop (13 files) or a repeat of an already-proven fix pattern (8 files).

## Code Context

### RLS — confirm, don't re-fix

`src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts` (current):

```ts
const { error: uploadError } = await supabase.storage
  .from("project-assets")
  .upload(storagePath, buffer, { contentType: file.type, upsert: false });
```

Same bucket, same pattern task 299's migration 115 already fixed at the RLS layer:

```sql
-- supabase/migrations/115_project_assets_developer_insert.sql (already written, task 299)
create policy "project_assets_developer_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'project-assets' and get_my_role() = 'developer');
```

If the upload error is still reproducible after confirming this migration is applied, stop and re-investigate rather than assuming a second gap — but code inspection shows no route-specific difference that would explain a second cause.

### Duplicate-key race — current (buggy) `postComment` shape, `_task-comments.tsx`

```tsx
async function postComment() {
  if (draftEmpty) return;
  setPosting(true);
  setAttachmentWarning(null);
  const res = await fetch(`/api/v2/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: draftHtml }),
  });
  if (res.ok) {
    const created: Omit<CommentRow, "attachments"> = await res.json();
    let attachments: CommentAttachment[] = [];

    if (attachmentFiles.length > 0) {
      // ... uploads all files, awaits Promise.allSettled ...
    }

    // BUG: this optimistic append happens only after the attachment uploads above finish —
    // by which time the realtime commentsChannel INSERT handler may already have added the
    // same comment via its own fetchComments() call, since the comment row was inserted (and
    // its realtime event fired) as soon as the POST above succeeded, long before this line runs.
    setComments((prev) => {
      const next = [...prev, { ...created, attachments }];
      onCountChange?.(next.length);
      return next;
    });
    setAttachmentFiles([]);
    setResetKey((k) => k + 1);
  }
  setPosting(false);
}
```

### Duplicate-key race — target shape (apply to all 4 `*-comments.tsx` files, adapted per file's `CommentRow` shape)

```tsx
async function postComment() {
  if (draftEmpty) return;
  setPosting(true);
  setAttachmentWarning(null);
  const res = await fetch(`/api/v2/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: draftHtml }),
  });
  if (res.ok) {
    const created: Omit<CommentRow, "attachments"> = await res.json();

    // Append immediately, before any attachment upload, so the realtime INSERT handler's
    // dedupe guard (commentsRef) already recognizes this id well before its own event can
    // arrive over the network — the old order (append after upload) left a race window where
    // the realtime handler's own fetchComments() could land the comment first, and this
    // append would then add a second, duplicate-keyed copy (task 301).
    setComments((prev) => [...prev, { ...created, attachments: [] }]);

    if (attachmentFiles.length > 0) {
      const results = await Promise.allSettled(attachmentFiles.map((file) => {
        const fd = new FormData();
        fd.append("file", file);
        return fetch(`/api/v2/tasks/${taskId}/comments/${created.id}/attachments`, { method: "POST", body: fd })
          .then((r) => (r.ok ? r.json() : Promise.reject()));
      }));
      const attachments = results
        .filter((r): r is PromiseFulfilledResult<CommentAttachment> => r.status === "fulfilled")
        .map((r) => r.value);
      const failed = results.length - attachments.length;
      if (failed > 0) {
        setAttachmentWarning(`Comment posted — ${failed} of ${attachmentFiles.length} attachment(s) failed to upload.`);
      }
      if (attachments.length > 0) {
        // Merge into the already-added comment — never a second append.
        setComments((prev) => prev.map((c) => (c.id === created.id ? { ...c, attachments } : c)));
      }
    }

    setAttachmentFiles([]);
    setResetKey((k) => k + 1);
  }
  setPosting(false);
}
```

`onCountChange` is no longer referenced inside `postComment` at all — it's reported solely by the count-reporting `useEffect` (same pattern task 299 introduced), which fires whenever `comments.length` changes, covering both the optimistic append and the later merge (merge doesn't change `.length`, so no extra/duplicate count report either — a correctness detail worth preserving, not "fixing").

### New shared component — `src/app/(hub)/projects/_shared/_comment-composer.tsx`

```tsx
"use client";

import { useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import { TaskAttachmentPicker } from "./_task-attachment-picker";

function initialsFromName(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function CommentComposer({
  editor,
  currentUserName,
  currentUserAvatarUrl,
  files,
  onFilesChange,
  allowedMimeTypes,
  warning,
  posting,
  disabled,
  onPost,
  onClear,
  postLabel = "Post comment",
}: {
  editor: React.ReactNode;
  currentUserName: string | null;
  currentUserAvatarUrl: string | null;
  files: File[];
  onFilesChange: (files: File[]) => void;
  allowedMimeTypes?: string[];
  warning?: string | null;
  posting: boolean;
  disabled: boolean;
  onPost: () => void;
  onClear: () => void;
  postLabel?: string;
}) {
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-[#EDF0F7]">
      <div className="flex items-start gap-2.5">
        <Avatar initials={initialsFromName(currentUserName)} avatarUrl={currentUserAvatarUrl} size={8} />
        <div className="flex-1 min-w-0">{editor}</div>
      </div>

      {attachmentsExpanded && (
        <TaskAttachmentPicker files={files} onFilesChange={onFilesChange} allowedMimeTypes={allowedMimeTypes} />
      )}
      {warning && <p className="text-[11px] text-[#8A5A00]">{warning}</p>}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAttachmentsExpanded((v) => !v)}
          aria-expanded={attachmentsExpanded}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
        >
          <Paperclip size={13} />
          Attach Files{files.length > 0 ? ` (${files.length})` : ""}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={posting}
            className="px-3.5 py-1.5 rounded-full border border-[#E2E7F2] text-[#5F6A88] text-[12px] font-semibold hover:bg-[#F4F6FB] disabled:opacity-45 cursor-pointer transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onPost}
            disabled={disabled || posting}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#007BFF] text-white text-[12px] font-semibold",
              "hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors"
            )}
          >
            {posting ? <Loader2 size={13} className="animate-spin" /> : null}
            {postLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note the `Avatar` import path — it's the existing task-289 component in `dashboard-shared.tsx`, already used outside the dashboard tree (e.g. `dashboard/timelogs/_time-logs-table.tsx`), so this is consistent reuse, not a new cross-boundary import pattern.

### Parent usage — target shape, e.g. `_issue-comments.tsx`

```tsx
function handleClear() {
  setDraftHtml("");
  setDraftEmpty(true);
  setAttachmentFiles([]);
  setAttachmentWarning(null);
  setResetKey((k) => k + 1);
}
```

```tsx
<CommentComposer
  key={resetKey}
  editor={
    <IssueCommentEditor
      key={resetKey}
      projectId={projectId}
      issueId={issueId}
      onChange={setDraftHtml}
      onEmptyChange={setDraftEmpty}
    />
  }
  currentUserName={currentUserName}
  currentUserAvatarUrl={currentUserAvatarUrl}
  files={attachmentFiles}
  onFilesChange={setAttachmentFiles}
  allowedMimeTypes={COMMENT_ATTACHMENT_MIME_TYPES}
  warning={attachmentWarning}
  posting={posting}
  disabled={draftEmpty}
  onPost={() => void postComment()}
  onClear={handleClear}
/>
```

`key={resetKey}` on `CommentComposer` itself (not just the inner editor) so the composer's own internal `attachmentsExpanded` state resets to collapsed after every successful post and every Clear — consistent with "default collapsed" applying fresh each time, not just on first mount.

### Prop-threading shape (repeat across both task-tree files and both issue-tree files)

`page.tsx`, current:
```ts
const { data: profile } = currentUserId
  ? await supabase.from("profiles").select("role").eq("id", currentUserId).maybeSingle()
  : { data: null };
const currentUserRole = profile?.role ?? null;
```
Target:
```ts
const { data: profile } = currentUserId
  ? await supabase.from("profiles").select("role, full_name, avatar_url").eq("id", currentUserId).maybeSingle()
  : { data: null };
const currentUserRole = profile?.role ?? null;
const currentUserName = profile?.full_name ?? null;
const currentUserAvatarUrl = profile?.avatar_url ?? null;
```
...then pass `currentUserName`/`currentUserAvatarUrl` as two new props alongside the existing `currentUserId`/`currentUserRole` down through `*DetailClient` → `*AttachmentsCommentsPanel` → `*Comments`. For the task tree, `*DetailClient` (`_task-detail.tsx`) does not currently forward `currentUserId` into `TaskAttachmentsCommentsPanel` at all (`<TaskAttachmentsCommentsPanel projectId={projectId} taskId={task.id} timeLogsRefreshKey={timeLogsRefreshKey} />`) — add `currentUserId`, `currentUserName`, `currentUserAvatarUrl` there too (issue tree already threads `currentUserId`, only the two new props are needed).

## Implementation Steps

1. **Confirm migration 115 is applied to the remote database** (ask the user if unsure — do not proceed to attribute the repro to a new cause until this is verified either way).
2. Create `src/app/(hub)/projects/_shared/_comment-composer.tsx` per the Code Context above.
3. Fix the 6 files still carrying the `onCountChange`-inside-updater pattern (legacy task comments, legacy task attachments, v2 task comments, v2 task attachments, v2 issue comments, v2 issue attachments) using the exact consolidation pattern task 299 already applied to `_issue-comments.tsx`/`_issue-attachments.tsx` (legacy issues) — remove from fetch `.then`, remove from every `setState` updater, add one count-reporting `useEffect`, drop the now-stale `eslint-disable-next-line react-hooks/exhaustive-deps` comments.
4. Fix the duplicate-key race in `postComment()` in all 4 `*-comments.tsx` files (legacy task, v2 task, legacy issue, v2 issue) per the target shape above — reorder the optimistic append before attachment upload, merge attachments in afterward instead of re-appending.
5. Thread `currentUserName`/`currentUserAvatarUrl` (and, for the task tree only, `currentUserId` — issues already have it) from each `page.tsx` through `*-detail.tsx` and `*-attachments-comments-panel.tsx` into each `*-comments.tsx`.
6. In each of the 4 `*-comments.tsx` files, add a `handleClear()` function, replace the existing composer JSX (editor + `TaskAttachmentPicker` + lone Post button) with `<CommentComposer key={resetKey} ...>` per the Code Context above.
7. Run `npx tsc --noEmit` and `pnpm lint`.
8. Browser-verify, as a developer-role account, on all 4 surfaces (legacy task, v2 task, legacy issue, v2 issue): post a comment with an attachment (upload succeeds, no console warnings, no duplicate rendered comment), confirm the attach-files toggle starts collapsed and expands/collapses correctly, confirm Clear empties both text and staged files, confirm the avatar renders (with initials fallback if the account has no `avatar_url`), confirm tab counts still update live, confirm the plain Attachments tab (non-comment) still works for add/delete with no console warnings.

## Acceptance Criteria

- [ ] Migration 115 confirmed applied; developer-role attachment upload succeeds on both Task Comments and Issue Comments (legacy + v2).
- [ ] Zero "Cannot update a component while rendering a different component" warnings across all 4 comment surfaces + all 4 attachment-tab surfaces.
- [ ] Zero "Encountered two children with the same key" warnings, and no visually duplicated comment, when posting a comment with an attachment on any of the 4 comment surfaces.
- [ ] Attach Files toggle: collapsed by default, left-aligned in the same row as Post/Clear, expands/collapses the picker.
- [ ] Clear button present (not Cancel), clears both draft text and staged files.
- [ ] Avatar (or initials fallback) renders left of the RTE on all 4 composers.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `pnpm lint` — 0 errors (pre-existing unrelated warnings acceptable, per task 299's precedent).
- [ ] No regression: comment posting/deleting (issues), attachment view/delete, realtime sync, and tab-label counts all still work on every surface.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-check all 4 comment surfaces + all 4 attachment tabs as a developer-role account,
           # per Implementation Step 8
```

## Compatibility Touchpoints

- No new database migration — depends entirely on migration 115 (task 299) being applied; flag this dependency explicitly if the RLS symptom persists after implementation.
- New shared component (`_comment-composer.tsx`) lives in `_shared/`, the established location for cross-tree (legacy+v2, task+issue) UI already used by `_task-attachment-picker.tsx` — no new sharing convention introduced.
- Prop-threading additions (`currentUserName`, `currentUserAvatarUrl`, and `currentUserId` for the task tree) are purely additive — no existing prop is removed or renamed, so no other caller of `*-detail.tsx` / `*-attachments-comments-panel.tsx` breaks.
- `Avatar` (`dashboard-shared.tsx`) is reused as-is, no changes to its implementation — confirmed already used outside the dashboard route tree, so this isn't a new cross-boundary dependency.

## Implementation Notes

### What Changed
- Created `src/app/(hub)/projects/_shared/_comment-composer.tsx` — the new shared composer chrome (avatar via the existing task-289 `Avatar` component, editor slot, collapsible `TaskAttachmentPicker` default-collapsed behind an "Attach Files" toggle, footer row with the toggle left-aligned and Clear/Post right-aligned).
- Fixed the duplicate-comment-key race in `postComment()` in all 4 `*-comments.tsx` files (legacy task, v2 task, legacy issue, v2 issue): the optimistic append now happens immediately after the comment POST succeeds (before attachment uploads start), and successful attachment uploads are merged into the already-added comment via `.map()` instead of appending a second time.
- Fixed the `onCountChange`-inside-`setState`-updater pattern (task 299's fix, replicated) in the 6 files that still had it: legacy task comments, legacy task attachments, v2 task comments, v2 task attachments, v2 issue comments, v2 issue attachments. Each now reports its count via a dedicated `useEffect` keyed on the list's `.length`, with the stale `eslint-disable-next-line react-hooks/exhaustive-deps` comments removed alongside.
- Threaded `currentUserName`/`currentUserAvatarUrl` (and, for the task tree, `currentUserId` — issues already had it) from each of the 4 `page.tsx` files, through `*-detail.tsx` and `*-attachments-comments-panel.tsx`, into each `*-comments.tsx`. Each `page.tsx`'s profile query was extended from `.select("role")` to `.select("role, full_name, avatar_url")`.
- Swapped the composer JSX (editor + `TaskAttachmentPicker` + lone Post button) for `<CommentComposer key={resetKey} ...>` in all 4 `*-comments.tsx` files, and added a `clearDraft()`/`handleClear` function that resets draft text, staged files, the attachment warning, and remounts the composer (collapsing the attachment section again).
- Removed the now-unused `Loader2` import from `_task-comments.tsx` (legacy + v2) — task comments have no delete button, so once the inline Post-button spinner moved into `CommentComposer`, `Loader2` had no remaining use in either file. `_issue-comments.tsx`'s `Loader2` import stays — it's still used by the per-comment delete spinner.

### Files Changed
- `src/app/(hub)/projects/_shared/_comment-composer.tsx` — new shared composer component.
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-comments.tsx` — race fix, purity fix, composer swap, new props.
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-comments.tsx` — identical changes.
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-attachments.tsx` — purity fix only.
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachments.tsx` — purity fix only.
- `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-comments.tsx` — purity fix, race fix, composer swap, new props.
- `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-attachments.tsx` — purity fix only.
- `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-comments.tsx` — race fix, composer swap, new props (purity fix already present from task 299).
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx`, `.../v2/.../_task-attachments-comments-panel.tsx` — new `currentUserName`/`currentUserAvatarUrl` props threaded to `TaskComments`.
- `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-attachments-comments-panel.tsx`, `.../v2/.../_issue-attachments-comments-panel.tsx` — same, threaded to `IssueComments`.
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx`, `.../v2/.../_task-detail.tsx` — accept + forward new props (and `currentUserId`, not previously forwarded) to the panel.
- `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-detail.tsx`, `.../v2/.../_issue-detail.tsx` — accept + forward new props to the panel.
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/page.tsx`, `.../v2/.../page.tsx`, `.../legacy/.../issues/[issueId]/page.tsx`, `.../v2/.../issues/[issueId]/page.tsx` — extended profile query, pass new props to `*DetailClient`.

### Deviations From Plan
- None — matches the task document's Proposed File Changes, Code Context, and Implementation Steps exactly.
- Migration 115 (task 299) applied/not-applied status was **not independently re-confirmed** during this implementation pass — no tool available in this session queries the remote Supabase database directly. This is the same dependency already flagged in task 299's Testing note. Flagging again here per Implementation Step 1's instruction to confirm before attributing the RLS symptom to a new cause; the code-level fix (all 8 files) is complete and correct regardless, but the RLS symptom itself will persist until migration 115 is confirmed applied.
- Pre-existing `impeccable` design-hook findings (literal font-size values off the documented type ramp, and pre-existing dynamic-`src` `<img>` elements in issue-comments' lightbox) fired on nearly every edited file. All are pre-existing conditions unrelated to this task's scope and were left unchanged per the task document's Out-of-Scope boundary and CLAUDE.md's UI Polish conventions — same precedent as task 299.

### Verification Run
- `npx tsc --noEmit` - PASS (no output, no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing `no-unused-vars` warnings in `onboarding-workspace/_checklist-tab.tsx`, a file this task never touched — unrelated)
- Post-edit grep sweep - PASS: zero remaining `onCountChange?.(next.length)`/`onCountChange?.(data.length)` occurrences across all 8 target files; `CommentComposer` imported in all 4 `*-comments.tsx` files with no leftover direct `TaskAttachmentPicker` import (only an unchanged prose comment mentioning it); `currentUserName` threaded through all 4 `*-attachments-comments-panel.tsx` files.
- `pnpm dev` browser spot-check - SKIPPED (not run interactively during this pass). Recommend the human reviewer, as a developer-role account: (1) confirm migration 115 is applied to the remote DB, (2) post a comment with an attachment on all 4 surfaces (legacy task, v2 task, legacy issue, v2 issue) and confirm upload succeeds with no console warnings and no duplicated comment, (3) confirm the Attach Files toggle starts collapsed, expands/collapses, and shows a `(n)` count once files are staged, (4) confirm Clear empties both the draft text and staged files, (5) confirm the avatar (or initials fallback) renders left of the RTE, (6) confirm tab-label counts still update live on both tabs, (7) exercise the plain (non-comment) Attachments tab's add/delete flow on all 4 surfaces with no console warnings.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Cross-checked every legacy/v2 file pair with `diff` post-edit: `_task-comments.tsx`, `_task-attachments.tsx`, `_task-attachments-comments-panel.tsx`, and `_issue-attachments-comments-panel.tsx` are byte-identical between trees (matching this codebase's established parallel-tree convention); `_issue-comments.tsx`/`_issue-attachments.tsx` differ by only a one-word comment-attribution string (see Deviations); `_task-detail.tsx`/`_issue-detail.tsx`/page.tsx pairs differ only in pre-existing, unrelated `/projects/legacy/` vs `/projects/v2/` route strings that predate this task.
- `CommentComposer` is single-purpose (composer chrome only), all props are typed (no `any`), and every `setComments`/`setAttachments` call site across all 8 target files is now a pure updater (verified by reading each file in full, not just the lines the task doc called out) — the `onCountChange`-inside-updater anti-pattern is completely gone.
- Confirmed no leftover dead code: the `Loader2` import was correctly dropped from both `_task-comments.tsx` files (no other usage remains there — task comments have no delete button) and correctly retained in both `_issue-comments.tsx` files (still used by the per-comment delete spinner). No unused imports, no orphaned `TaskAttachmentPicker` import (only an accurate prose comment referencing it survives, since `CommentComposer` now wraps it internally).
- Traced the `postComment()` race fix's full lifecycle in all 4 comment files: optimistic append happens synchronously right after the POST resolves (before any `await` on attachment uploads), attachments are merged into the same row via `.map()` afterward (never a second `push`/spread-append), and `setAttachmentFiles([])`/`setResetKey()` fire only after the merge — no stale-closure or ordering issue found.
- `key={resetKey}` is applied to both `CommentComposer` and the inner editor element in all 4 files, so a successful post and a Clear both correctly reset the editor content *and* collapse the attachment section back to default — verified this wasn't just applied to the editor (which would have left `attachmentsExpanded` stuck open after a post).
- Prop-threading chain (`currentUserName`/`currentUserAvatarUrl`, plus `currentUserId` newly threaded for the task tree) verified end-to-end for all 4 surfaces: `page.tsx` → `*-detail.tsx` → `*-attachments-comments-panel.tsx` → `*-comments.tsx`, with no broken links or typos in prop names at any hop.
- No secrets, credentials, or debug logging in any diff.

### Deviations
- Minor — `_issue-comments.tsx`/`_issue-attachments.tsx`: the count-reporting effect's comment reads `(task 299)` in the legacy files (untouched text carried over from task 299, since only the `postComment`/`deleteComment` bodies and composer JSX needed edits there) versus `(task 299/301)` in the newly-rewritten v2 files. Purely a comment-attribution string, no functional difference — not worth a churn-only edit after all other checks already passed.
- Minor — Migration 115's applied status on the remote database was not (and could not be) independently re-verified during this implementation or quality-gate pass — no tool in this session queries the remote Supabase database. This is an external, out-of-code-scope dependency already flagged identically in task 299; the code-level fix in all 8 files is complete and correct regardless of migration status.
- No Medium or Major deviations found. Scope, requirements, and the Out-of-Scope boundaries (editors left unmerged, `_task-attachment-picker.tsx` internals untouched, `_task-comments.tsx`/`_task-attachments.tsx` legacy-vs-v2 pair not further refactored beyond what was planned, no new storage migration written) all held.

### Required Fixes
None — no Major deviations found.

## Follow-Up Changes (Post-Quality-Gate)

Three additional rounds were requested directly against the shipped composer, after the quality gate above had already passed. All three apply uniformly to the same 4 comment surfaces (legacy/v2 × task/issue) via the shared `_comment-composer.tsx` and the 4 per-tree editor files, so each was a single logical change replicated identically across the file pairs — not a scope change to the original task.

### Round 1 — Attachment section alignment

**Report:** the collapsible attachment picker and footer row (Attach Files toggle, Clear/Post) spanned the full composer width instead of lining up under the RTE, since the avatar+editor row and the picker/footer were separate flex siblings.

**Fix:** restructured `_comment-composer.tsx` into a genuine two-column layout — `[Avatar] [flex-1 column: editor, attachment picker, warning, footer row]` — so everything to the right of the avatar shares one left edge. `items-start` on the outer row keeps the avatar pinned to the top when the editor grows.

- `src/app/(hub)/projects/_shared/_comment-composer.tsx` — sole file changed.

### Round 2 — Attachment-only comments (no text required)

**Report:** a comment should be postable with just an attachment and no RTE text, and vice versa; only truly empty (no text AND no attachment) should block posting. The existing Clear button (added in the base implementation) needed the identical enablement rule.

**Root cause found during investigation:** both comment-creation API routes rejected an empty `body` with a hard `400 "body is required"` before this change — relaxing only the client-side guard would not have been sufficient; an attachment-only submission would have failed server-side on the very first request (the comment row has to exist before an attachment can be uploaded against its id).

**Fix:**
- `CommentComposer` prop renamed `disabled` → `isEmpty` (`{editor: React.ReactNode; ...; isEmpty: boolean; ...}`), now gating **both** the Clear and Post buttons (`disabled={isEmpty || posting}` on each) instead of only Post.
- All 4 `*-comments.tsx` files compute `const isEmpty = draftEmpty && attachmentFiles.length === 0;` once, use it as `postComment()`'s early-return guard (was `if (draftEmpty) return;`), and pass it to `<CommentComposer isEmpty={isEmpty} .../>`.
- `src/app/api/v2/tasks/[taskId]/comments/route.ts` and `src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/route.ts` — removed the `if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });` guard. `body` stays `text not null` at the DB level (migrations 025/052) but an empty string satisfies `not null`, so **no migration was needed** — this was a route-level validation relaxation only.

Files touched: `_comment-composer.tsx`, all 4 `*-comments.tsx`, both comment `route.ts` files (8 total).

### Round 3 — Lock the composer while posting

**Report:** during the posting/loading state, an already-staged attachment must not be removable, no new file may be attached or dropped, and the RTE must not be editable — all three need a `cursor-not-allowed` affordance.

**Fix:**
- `_attachment-dropzone.tsx` — added `disabled:cursor-not-allowed` alongside the existing `disabled:opacity-60` on the browse/drop button (the component already accepted and correctly wired a `disabled` prop that blocks drag/drop and the file input; it just had no matching cursor style).
- `_task-attachment-picker.tsx` — added a new `disabled?: boolean` prop, threaded to `AttachmentDropzone`, and applied to each staged file's remove (X) button (`disabled={disabled}` + conditional `cursor-not-allowed`/dimmed styling instead of the hover-red state).
- `_comment-composer.tsx` — passes `disabled={posting}` into `TaskAttachmentPicker`.
- All 4 editor components (`_comment-editor.tsx` ×2, `_issue-comment-editor.tsx` ×2) — added a `disabled?: boolean` prop:
  - `editable: !disabled` at creation, plus a `useEffect` calling `editor.setEditable(!disabled)` on change — required because the editor instance stays mounted across a posting cycle (only a successful post/Clear remounts it via the parent's `resetKey`), so the create-time `editable` option alone can't react to `posting` toggling mid-session.
  - `handlePaste`/`handleDrop` (used for paste/drag-to-embed an inline image) read a `disabledRef` (kept in sync via `useEffect`) rather than the `disabled` prop directly, since those callbacks are bound once at editor creation and would otherwise capture a stale value from first render.
  - The Bold/Italic/Bullet-list toolbar buttons get `disabled={disabled}` (which alone prevents their `onClick`, so no extra guard needed inside the mark actions) plus `cursor-not-allowed` styling.
  - The outer bordered box gets `cursor-not-allowed opacity-70` when disabled (replacing the focus-ring styling); `EditorContent` gets `cursor-not-allowed pointer-events-none` as a second, defensive layer against residual interaction.
- All 4 `*-comments.tsx` files pass `disabled={posting}` to their respective editor element.

Files touched: `_attachment-dropzone.tsx`, `_task-attachment-picker.tsx`, `_comment-composer.tsx`, 4 editor files, 4 `*-comments.tsx` files (11 total, several overlapping Round 2's list).

### Round 4 — Post comment button → brand-orange CTA

**Report:** the Post comment button should use the brand-orange CTA style, since it's one of the main actions on the Task/Issue Detail page — applies to both v2 and legacy, tasks and issues.

**Investigation:** DESIGN.md §5 Buttons documents exactly one CTA treatment — `bg-[#FB914E]` (orange) with `#471F02` text, hover `#E2762F` background with white text — under an explicit "One CTA per screen, maximum" rule. Confirmed via grep that no orange CTA currently exists anywhere on any of the 4 Task/Issue Detail pages (`_task-detail.tsx` ×2, `_issue-detail.tsx` ×2, and their panel/comment subtree only use blue `#007BFF` for links/active-tab state) — so making Post comment the page's one CTA doesn't conflict with that rule or compete with a second orange button.

**Fix:** since the Post comment button lives in the shared `_comment-composer.tsx` (used by all 4 comment surfaces since the base implementation), this was a single-file change — swapped the button's `bg-[#007BFF] text-white hover:bg-[#0063D6]` for the established `bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white` CTA classes (same exact hex values already used by every other CTA in this codebase — onboarding wizard, New Project wizard, Members tab, Time Logs tab, Task Timer button, etc.). No per-tree duplication needed.

Files touched: `_comment-composer.tsx` (1 file — covers all 4 surfaces automatically).

### Verification (all four rounds)
- `npx tsc --noEmit` — PASS after every round, no errors.
- `pnpm lint` — PASS after every round (same 2 pre-existing, unrelated warnings in `onboarding-workspace/_checklist-tab.tsx` throughout).
- Post-edit `diff` checks confirmed the legacy/v2 file pairs stayed identical (or differed only in the same pre-existing, unrelated route-string differences already noted in the base Quality Gate Notes) after each round.
- `pnpm dev` browser spot-check — SKIPPED for all four rounds, consistent with the base implementation; no interactive browser session was available in this environment. Recommend the human reviewer additionally confirm, as part of the existing Step-8 checklist: attachment section visually aligns under the RTE; a comment with only an attachment (no text) and a comment with only text (no attachment) both post successfully; Clear stays disabled with nothing entered and becomes enabled the moment either text or a file is present; while a comment is posting, the attach-files dropzone/browse button, each staged file's remove (X), the RTE's toolbar buttons, and direct typing/paste/drop into the RTE are all inert with a `not-allowed` cursor, and everything re-enables once posting finishes; the Post comment button renders with the orange CTA styling (orange fill, dark-brown text, hover to darker orange + white text) on all 4 surfaces.

## Final Status

Marked **Completed** at the user's explicit request, without an independent `test`-stage browser pass in this session (no interactive browser was connected here across the base implementation or any of the four follow-up rounds). The one dependency outside this session's control remains **migration 115** (task 299) — confirm it is applied to the remote database; without it, the attachment-upload RLS fix this task builds on does not take effect regardless of how correct the client-side code is.
