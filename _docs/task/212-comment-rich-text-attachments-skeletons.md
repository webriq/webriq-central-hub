# 212: Task Comments — Rich Text Editor (Paste Images), File Attachments, Loading-Skeleton Verification

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

Direct follow-up to task 211's just-shipped Attachments/Comments tabbed panel (`_task-attachments-comments-panel.tsx`) on `/v2/projects/[projectId]/tasks/[taskId]`. Three asks against the current `TaskComments` component (`_task-comments.tsx`, task 206):

1. **Rich text comment body** — the comment composer is a plain `<textarea>`; the posted body renders as `whitespace-pre-wrap` plain text. Upgrade it to the same Tiptap rich-text stack already used for the task Description field (`_task-description-field.tsx`, task 206), including paste/drop-to-embed images, and render posted comments as formatted HTML instead of plain text.
2. **File attachments on comments** — there is currently no way to attach a discrete file to a comment (separate from an inline pasted image in the body). Add an optional attachment picker to the composer and a way to view a posted comment's attached files.
3. **Loading skeletons** — verify the skeleton loading states already shipped for Attachments (task 211: pulsing grid cells) and Comments (task 206: two pulsing bars) still render correctly inside task 211's new tabbed panel, and add loading affordances for the two new async actions this task introduces (pasted-image upload, staged-attachment upload on post) — not full skeletons, since those are point-in-time actions, not initial-load fetches.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Does `attachments.entity_type` need a new value ("comment"), and does that require a migration? | **No migration needed — already reserved.** Read `supabase/migrations/049_attachments_index_constraint.sql`: the original `attachments_entity_type_check` constraint was written as `check (entity_type in ('task', 'project', 'comment'))` with the comment explicitly noting *"'comment' [is] reserved for anticipated future parents (not built in this task)"*. Migration 054 later added `'issue'` to the same list. `'comment'` has been a legal value in the DB since migration 049 — this task is simply the first to use it. |
| 2 | Does `task_comments.body` need a schema change to hold HTML? | **No.** It's already `text not null` (migration 025) — no type constraint prevents storing an HTML string, exactly the same situation Description was in before task 206 (a `text` column already capable of holding HTML, just never rendered as such). |
| 3 | Who can insert a comment attachment — same role gate as the task-level attachments route? | **Simpler — rely on RLS alone, no app-level check needed.** `attachments_developer_insert` (migration 026, never dropped/overridden) already allows any `developer`-role user to insert an attachment row where `uploaded_by = auth.uid()`; `attachments_pm_write` covers admin/super_admin/pm. Unlike the task-level attachments POST route (which needed an app-level "own task" check because a developer can only attach to a task *they created*), a comment attachment's owner is always the comment's own author — RLS's `uploaded_by = auth.uid()` already enforces exactly that, so the new route can just insert with no extra role/ownership branching. |
| 4 | Who can upload a **pasted/embedded image** into a comment body — same gate as the existing task-description-images route? | **No — broader.** The existing `POST /api/v2/projects/[projectId]/tasks/description-images` route (task 205) is gated to `["admin", "super_admin", "pm"]`, excluding `developer`. But `task_comments_staff_insert` RLS (migration 048) already lets `admin/super_admin/pm/developer` post comments — gating image-paste more tightly than text-posting would silently break image paste for developers with no explanation. The new comment-scoped image route uses the same role set as comment posting (`admin/super_admin/pm/developer`), matching `task_comments_staff_insert` exactly. Not reusing/widening the existing description-images route — that stays scoped to the Description field's own (narrower, PM+-only) editing permission, unrelated to this decision. |
| 5 | New comment-image upload route path? | `POST /api/v2/tasks/[taskId]/comments/description-images` — mirrors the existing `.../tasks/description-images` route's naming, scoped one level deeper under the specific task's comments (the task already exists at this point on the page, unlike the New Task modal's creation-time flow, so scoping under `[taskId]` is natural and consistent with the sibling `comments/route.ts`). |
| 6 | How does the composer reset after posting (Tiptap has no simple `value` reset like a controlled `<textarea>`)? | **Remount via a `resetKey` counter.** The parent (`_task-comments.tsx`) increments a `resetKey` state after a successful POST and passes it as the new `_comment-editor.tsx`'s React `key` — a full remount reinitializes Tiptap with empty content. Simpler and more reliable than calling `editor.commands.clearContent()` imperatively through a ref, and needs no new imperative API surface. |
| 7 | How does the parent know the composer's current HTML (to know if "Post comment" should be enabled, and what to send)? | The new `_comment-editor.tsx` takes an `onChange: (html: string) => void` prop wired to Tiptap's `onUpdate` (not `onBlur`, unlike the read/edit Description field — a composer needs live tracking, not save-on-blur). The parent keeps `draftHtml` in state from that callback. **Emptiness check uses `editor.isEmpty`, not `draftHtml.trim().length`** — an empty Tiptap doc still serializes to `<p></p>\n`, which is non-empty by string length but visually empty; gating "Post comment" on string length would let users submit blank comments. `_comment-editor.tsx` exposes `onEmptyChange: (isEmpty: boolean) => void` (called from the same `onUpdate` handler) so the parent can gate its own Post button without reaching into Tiptap internals from outside the editor component. |
| 8 | Does `TaskAttachmentViewerModal` (task 211) need to change to support viewing a comment's attachment? | **Yes — generalize its prop contract.** It currently builds its own fetch URL internally from `projectId`/`taskId`/`attachment.id`, hardcoded to the task-attachments endpoint shape. Change it to accept a single `fetchUrl: string` prop (the full signed-URL endpoint to call) instead of `projectId`/`taskId`, so both the existing task-attachments grid and the new comment-attachments UI can share one component. `_task-attachments.tsx`'s existing call site updates mechanically (`fetchUrl={`/api/v2/projects/${projectId}/tasks/${taskId}/attachments/${viewing.id}/file-url`}`) with no behavior change. |
| 9 | How does the comment list response include each comment's attachments — N+1 per-comment fetch, or batched? | **Batched, mirroring the existing author-name-resolution pattern in the same route.** `GET /api/v2/tasks/[taskId]/comments` already does a second query to resolve author names for all comments in one round trip (`profiles.select(...).in("id", authorIds)`); attachments are resolved the same way — one extra `attachments.select(...).eq("entity_type", "comment").in("entity_id", commentIds)` query, grouped client-side into each comment's `attachments: AttachmentRow[]` field. Avoids N separate requests for N comments. |
| 10 | Where does the new `_comment-editor.tsx` live, and is it shared with the Description field? | **New, separate, co-located file** (`tasks/[taskId]/_comment-editor.tsx`) — same reasoning task 206 already used for not sharing `_task-description-editor.tsx` (the creation-time editor) with `_task-description-field.tsx` (the detail-page editor): different save/reset lifecycle (`onUpdate`+remount vs. `onBlur`), different toolbar hint copy, different container sizing (a composer is visually smaller than a full Description panel). Same Tiptap extensions/toolbar shape, rebuilt locally rather than imported. |
| 11 | Are posted comments' attachments viewable/removable after posting? | **Viewable only — read-only, matching the task-level attachments convention exactly** (task 211's Attachments tab is also read-only after upload). No edit/delete UI for a comment's attachments in this pass. |

## Requirements

### A — Rich text comment composer with paste/drop image embedding
- [ ] Create `_comment-editor.tsx` (colocated in `tasks/[taskId]/`): same Tiptap stack as `_task-description-field.tsx` (`StarterKit.configure({ link: { openOnClick: false } })` + `Image`), same toolbar (Bold/Italic/Bullet list) and same `[&_img]:max-w-full [&_img]:rounded-[8px]` content classes, sized as a composer (`min-h-[70px]` instead of `min-h-[100px]`, placeholder-style empty-state text "Add a comment…"). Wires `onUpdate` to call both `onChange(editor.getHTML())` and `onEmptyChange(editor.isEmpty)` (Decision #7). Paste/drop-image handlers upload via the new endpoint (Requirement A's route below) and `editor.chain().focus().setImage({ src: url }).run()`, mirroring `_task-description-field.tsx`'s `uploadAndInsertImage` exactly.
- [ ] Create `src/app/api/v2/tasks/[taskId]/comments/description-images/route.ts` — near-identical to `src/app/api/v2/projects/[projectId]/tasks/description-images/route.ts` (same `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE`/`task-content` bucket/public-URL response shape), but role-gated to `["admin", "super_admin", "pm", "developer"]` instead of `["admin", "super_admin", "pm"]` (Decision #4), and storage path scoped as `${taskId}/${timestamp}_${safeFilename}` instead of `${project.id}/...` (comment images belong to a task, not a project-level namespace).
- [ ] In `_task-comments.tsx`: replace the `<textarea>` with `<CommentEditor key={resetKey} onChange={setDraftHtml} onEmptyChange={setDraftEmpty} />`; "Post comment" is disabled when `draftEmpty || posting` (not `!draft.trim()`); on successful post, increment `resetKey` (remounts the editor empty, Decision #6) instead of `setDraft("")`.
- [ ] Render each posted comment's `body` as rendered HTML (a small read-only Tiptap instance, or `dangerouslySetInnerHTML` with the same `[&_img].../[&_a]...` content classes as `_task-description-field.tsx`'s read-only rendering) instead of the current `<p className="whitespace-pre-wrap">{c.body}</p>`. Existing plain-text comments (posted before this task) still render correctly — a plain-text string has no tags to interpret, so it displays unchanged either way.

### B — File attachments on comments
- [ ] In `_task-comments.tsx`'s composer: add an `Attachments (optional)` section reusing `TaskAttachmentPicker` from `[projectId]/_task-attachment-picker.tsx` as-is (already a generic `{ files, onFilesChange }` component with no task/project coupling — no changes needed to that file).
- [ ] Create `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts`:
  - `POST` — mirrors `.../tasks/[taskId]/attachments/route.ts`'s upload mechanics (same `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE`/`project-assets` bucket) but simplified per Decision #3: no app-level role/ownership check, just `entity_type: "comment"`, `entity_id: commentId`, `uploaded_by: user.id`, `storage_path: comments/${commentId}/${timestamp}_${safeFilename}` — RLS (`attachments_developer_insert`/`attachments_pm_write`) enforces who's allowed.
  - `GET` — list, same shape as the task-level `GET` (`id, filename, size, created_at`), filtered `entity_type: "comment"`, `entity_id: commentId`.
- [ ] Create `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/[attachmentId]/file-url/route.ts` — 60s signed URL, mirrors the existing task-attachment `file-url` route exactly (session-bound client, no `adminClient`).
- [ ] In `src/app/api/v2/tasks/[taskId]/comments/route.ts`'s `GET`: after resolving author names, batch-fetch attachments for all returned comment IDs in one query (Decision #9) and include `attachments: { id, filename, size }[]` on each comment in the response.
- [ ] In `_task-comments.tsx`'s post-comment flow: after `POST .../comments` succeeds, if `attachmentFiles.length > 0`, loop-upload them to the new `[commentId]/attachments` route (mirrors `CreateTaskModal.submit()`'s `Promise.allSettled` upload-loop and its `attachmentWarning` partial-failure message exactly); clear `attachmentFiles` alongside the editor reset.
- [ ] In `_task-comments.tsx`'s comment list rendering: below a comment's body, if `c.attachments.length > 0`, render a small file-chip row (compact — reuse `_task-attachment-picker.tsx`'s read-only chip visual: icon + filename + size, no remove button) with a "View" action per file that opens the (now-generalized, Requirement C) `TaskAttachmentViewerModal`.

### C — Generalize `TaskAttachmentViewerModal` for reuse
- [ ] In `_task-attachment-viewer-modal.tsx`: change props from `{ attachment, projectId, taskId, onClose }` to `{ attachment, fetchUrl, onClose }`; the internal `useEffect` fetches `fetchUrl` directly instead of constructing a task-attachments-specific URL.
- [ ] In `_task-attachments.tsx`: update the one existing call site to pass `fetchUrl={`/api/v2/projects/${projectId}/tasks/${taskId}/attachments/${viewing.id}/file-url`}` instead of `projectId`/`taskId` — no other behavior change.
- [ ] In `_task-comments.tsx`: use the same modal, passing `fetchUrl={`/api/v2/tasks/${taskId}/comments/${commentId}/attachments/${attachment.id}/file-url`}` for a comment attachment's "View".

### D — Loading-state verification + new async affordances
- [ ] Confirm (manual browser check, Implementation Step 8) that task 211's Attachments grid skeleton and task 206's Comments two-bar skeleton still render correctly on initial load inside the tabbed panel — no code change expected here unless a regression is found.
- [ ] Add a small inline "Uploading image…" indicator in `_comment-editor.tsx`'s toolbar-hint row while `uploadAndInsertImage` is in flight (a local `uploading` state swaps the existing static hint text), matching CLAUDE.md's UI Polish Convention ("every async action needs a loading state").
- [ ] The "Post comment" button's existing `posting`-disabled + `Loader2` spinner state already covers the comment-creation-plus-attachment-upload sequence end to end (it stays `true` until both the comment POST and any attachment uploads finish) — no separate indicator needed for the attachment-upload leg specifically.

## Out of Scope / Must-Not-Change

- **Editing or deleting a posted comment** — still deliberately deferred (task 206 Decision #6); unaffected by this task.
- **Editing or removing an attachment already posted on a comment** — read-only after posting (Decision #11), matching the task-level Attachments tab's own convention.
- **`_task-description-field.tsx` / `_task-description-editor.tsx`** — untouched; `_comment-editor.tsx` is a new, separate component (Decision #10).
- **The existing `POST /api/v2/projects/[projectId]/tasks/description-images` route** — untouched; its role gate stays PM+-only, unrelated to the new comment-scoped route (Decision #4/#5).
- **No new Supabase migration** — `entity_type: 'comment'` is already a legal value (Decision #1); `task_comments.body` needs no schema change (Decision #2).
- **`issue_comments` table** — unrelated, not touched.
- **`_task-attachments.tsx`'s own list/grid/upload logic** — unchanged except the one mechanical `fetchUrl` prop update at its `TaskAttachmentViewerModal` call site (Requirement C).
- **Task 211's column-swap / tab-switcher layout** — unchanged; this task only touches what renders inside the existing "Comments" tab (plus the shared modal's prop contract).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_comment-editor.tsx` | Create | Tiptap rich-text composer with paste/drop image embedding (Requirement A) |
| `src/app/api/v2/tasks/[taskId]/comments/description-images/route.ts` | Create | Upload endpoint for images pasted/dropped into a comment body (Requirement A) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Swap in `CommentEditor`, attachment picker, attachment-upload-on-post, HTML body rendering, attachment chip rendering (Requirements A/B/D) |
| `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts` | Create | `POST` upload / `GET` list for a comment's attachments (Requirement B) |
| `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/[attachmentId]/file-url/route.ts` | Create | On-demand signed URL for one comment attachment (Requirement B) |
| `src/app/api/v2/tasks/[taskId]/comments/route.ts` | Modify | `GET` batches and includes each comment's `attachments` (Requirement B, Decision #9) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachment-viewer-modal.tsx` | Modify | Generalize to `fetchUrl` prop instead of `projectId`/`taskId` (Requirement C) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` | Modify | Update the one `TaskAttachmentViewerModal` call site to pass `fetchUrl` (Requirement C) |

## Code Context

### `_task-description-field.tsx` — the exact Tiptap shape to mirror for `_comment-editor.tsx` (full file already read this session)
Key pieces to replicate: `useEditor({ extensions: [StarterKit.configure({ link: { openOnClick: false } }), Image], ... })`, the `marks` toolbar array (Bold/Italic/Bullet list), `handlePaste`/`handleDrop` image-upload interception, and the `uploadAndInsertImage` shape (`FormData` → `POST` → `editor.chain().focus().setImage({ src: url }).run()`). Differences for the composer: `onUpdate` instead of `onBlur`; no `readOnly` mode; smaller `min-h`.

### Current `_task-comments.tsx` composer to replace (`_task-comments.tsx:76-93`, full file already read this session)
```tsx
<div className="flex flex-col gap-2 pt-1 border-t border-[#EDF0F7]">
  <textarea
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    rows={2}
    placeholder="Add a comment…"
    className="..."
  />
  <button onClick={() => void postComment()} disabled={!draft.trim() || posting} ...>
    {posting ? <Loader2 .../> : null} Post comment
  </button>
</div>
```
`postComment()` currently does one `fetch(... , { method: "POST", body: JSON.stringify({ body: trimmed }) })` and appends the response to local state — this shape is preserved, just extended to also loop-upload staged attachment files after the comment POST succeeds (mirroring `CreateTaskModal.submit()`'s existing attachment-upload-after-create pattern).

### `attachments_entity_type_check` constraint history — why no migration is needed (Decision #1)
```sql
-- 049_attachments_index_constraint.sql
alter table attachments add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment'));
-- 054_attachments_issue_entity_type.sql later widened this to also include 'issue'
```

### `attachments_developer_insert` RLS — why the new comment-attachments POST route needs no app-level ownership check (Decision #3)
```sql
-- 026_rls_policies_v2.sql, never dropped/overridden by 048
create policy "attachments_developer_insert"
  on attachments for insert to authenticated
  with check (get_my_role() = 'developer' and uploaded_by = auth.uid());
```

### Existing `description-images` route to mirror for the new comment-image route (`src/app/api/v2/projects/[projectId]/tasks/description-images/route.ts`, full file already read this session)
Same `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE`/`task-content` bucket/`getPublicUrl` response shape (`{ url, filename, size }`); the new route changes only the role check (Decision #4) and the storage path prefix (`${taskId}/...` instead of `${project.id}/...`).

### `TaskAttachmentViewerModal`'s current URL construction to generalize (`_task-attachment-viewer-modal.tsx:41-49`, this session's own prior work)
```tsx
useEffect(() => {
  const ctrl = new AbortController();
  fetch(`/api/v2/projects/${projectId}/tasks/${taskId}/attachments/${attachment.id}/file-url`, { signal: ctrl.signal })
    ...
}, [projectId, taskId, attachment.id]);
```
Becomes `fetch(fetchUrl, { signal: ctrl.signal })` with `fetchUrl` as a prop, dependency array `[fetchUrl]`.

### `TaskAttachmentPicker` — already generic, reused as-is for the comment composer (`[projectId]/_task-attachment-picker.tsx`, full file already read this session)
`{ files: File[]; onFilesChange: (files: File[]) => void }` — no task/project coupling in its props; safe to drop directly into `_task-comments.tsx` with its own local `attachmentFiles` state, exactly the same usage shape as `CreateTaskModal`'s.

## Implementation Steps

1. `_comment-editor.tsx`: build the Tiptap composer per Requirement A / Decision #7 (`onChange`, `onEmptyChange`, uploading-indicator state for Requirement D).
2. `src/app/api/v2/tasks/[taskId]/comments/description-images/route.ts`: create, per Decision #4/#5.
3. `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts` + `.../[attachmentId]/file-url/route.ts`: create, per Requirement B / Decision #3.
4. `src/app/api/v2/tasks/[taskId]/comments/route.ts`: extend `GET` to batch-include attachments per comment (Decision #9).
5. `_task-attachment-viewer-modal.tsx`: generalize to `fetchUrl` prop (Requirement C).
6. `_task-attachments.tsx`: update its one call site for the new prop (Requirement C).
7. `_task-comments.tsx`: swap in `CommentEditor` + `TaskAttachmentPicker`; extend `postComment()` to upload staged attachments after the comment POST (mirroring `CreateTaskModal`'s pattern) and reset via `resetKey` (Decision #6); render comment bodies as HTML; render each comment's attachment chips with "View" wired to the generalized modal.
8. Manually verify in the browser: open the Comments tab, confirm the two-bar skeleton still shows briefly on load; type formatted text (bold/italic/bullet) and paste an image into the composer, confirm an "Uploading image…" hint appears and the image embeds; attach a file via the picker; post the comment and confirm the composer clears, the new comment appears with formatted body + embedded image + a "View"-able attachment chip; reload the page and confirm everything persisted; repeat as a `developer`-role user to confirm they can also paste images and attach files (Decision #4).

## Acceptance Criteria

- [ ] The comment composer supports Bold/Italic/Bullet-list formatting and pasting/dropping an image, which uploads and embeds inline.
- [ ] Posted comment bodies render as formatted HTML (not raw markup, not `whitespace-pre-wrap` plain text); pre-existing plain-text comments still display correctly.
- [ ] The composer has an optional file-attachment picker; attached files upload after the comment posts and appear as a "View"-able chip on that comment.
- [ ] A `developer`-role user can paste an image and attach a file to their own comment (not just admin/super_admin/pm).
- [ ] "Post comment" is disabled for a visually-empty draft (an editor containing only an empty paragraph does not count as postable content) and re-enables once real content is entered.
- [ ] After posting, the composer resets to empty (formatting toolbar, any pasted image, and any staged attachment all clear).
- [ ] The Attachments tab's grid skeleton and the Comments tab's list skeleton both still render correctly on initial load.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser verification (no test runner configured) — see Implementation Step 8. Requires a session with a role in `admin/super_admin/pm/developer` to exercise comment posting, and ideally a second session as a `developer`-role user specifically to confirm Decision #4's broadened image-paste permission.

## Compatibility Touchpoints

- No new Supabase migration (Decisions #1/#2).
- No new npm dependencies — reuses the already-installed `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`.
- `TaskAttachmentViewerModal`'s prop contract changes (`projectId`/`taskId` → `fetchUrl`) — its only existing caller (`_task-attachments.tsx`) is updated in the same task, so this is not a breaking change to any other file.
- `GET /api/v2/tasks/[taskId]/comments`'s response shape gains a new `attachments` field per comment — additive, no existing field removed or renamed.
- No MCP tool inventory changes (`_docs/mcp-tools.md`) — none of the new routes are `server.registerTool(...)` calls.
- No env var changes.

## Implementation Notes

### What Changed
- Added `_comment-editor.tsx` — Tiptap rich-text composer (`StarterKit.configure({ link: { openOnClick: false } })` + `Image`, same toolbar/paste/drop-upload shape as `_task-description-field.tsx`), wired via `onUpdate` to report live HTML (`onChange`) and emptiness (`onEmptyChange`) to the parent instead of `onBlur`-saving; shows an inline "Uploading image…" toolbar hint while a pasted/dropped image is uploading.
- Added `POST /api/v2/tasks/[taskId]/comments/description-images` — near-identical to the existing project-scoped description-images route, but role-gated to `admin/super_admin/pm/developer` (matching `task_comments_staff_insert`, broader than the existing route's PM+-only gate — Decision #4) and storage-path-scoped under the task id.
- Added `POST`/`GET /api/v2/tasks/[taskId]/comments/[commentId]/attachments` and `GET .../attachments/[attachmentId]/file-url` — mirror the existing task-level attachment routes; the POST route skips the app-level ownership check the task-level route needs, since `attachments_developer_insert` RLS's `uploaded_by = auth.uid()` already scopes a comment attachment to its own author (Decision #3).
- Extended `GET /api/v2/tasks/[taskId]/comments` to batch-fetch every returned comment's attachments in one extra query (mirroring the existing author-name-resolution pattern in the same route) and include them as an `attachments` array on each comment.
- Generalized `_task-attachment-viewer-modal.tsx` (task 211) — swapped its `{ projectId, taskId }` props for a single `fetchUrl: string` prop the caller constructs, and narrowed its local `AttachmentRow` type to `{ filename: string }` (the only field the modal actually reads — confirmed by grep before narrowing, not assumed). `_task-attachments.tsx`'s one call site updated mechanically to pass `fetchUrl` instead.
- Rewrote `_task-comments.tsx` — swapped the plain `<textarea>` for `<CommentEditor>` (remounted via a `resetKey` counter after each successful post, per Decision #6); added `TaskAttachmentPicker` (reused as-is, no changes needed) for staging files; `postComment()` now uploads staged files to the new per-comment attachments route after the comment POST succeeds (mirroring `CreateTaskModal.submit()`'s `Promise.allSettled` pattern and its partial-failure warning message); posted comment bodies now render via `dangerouslySetInnerHTML` with the same content classes as the Description field's read rendering instead of `whitespace-pre-wrap` plain text; each comment's attachments render as a small file-chip list below its body, with "View" opening the generalized `TaskAttachmentViewerModal`.

### Files Changed
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_comment-editor.tsx` — new file, per plan (Requirement A)
- `src/app/api/v2/tasks/[taskId]/comments/description-images/route.ts` — new route, per plan (Requirement A)
- `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts` — new route, per plan (Requirement B)
- `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/[attachmentId]/file-url/route.ts` — new route, per plan (Requirement B)
- `src/app/api/v2/tasks/[taskId]/comments/route.ts` — `GET` now batch-includes attachments, per plan (Requirement B)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachment-viewer-modal.tsx` — generalized to `fetchUrl` prop, per plan (Requirement C)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` — one call-site update for the new prop, per plan (Requirement C)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` — rewritten per plan (Requirements A/B/D)

### Deviations From Plan
- **`CommentEditor`'s originally-planned `resetKey: number` prop was dropped from the component's own prop type.** The plan described passing `resetKey` both as the React `key` (to force a remount) and as a regular prop; `pnpm lint` correctly flagged the regular prop as unused inside the component (only the `key=` usage on the parent's JSX actually does anything — a component never reads its own `key`). Removed the redundant prop; the remount-via-`key` mechanism from Decision #6 is otherwise unchanged.
- **`TaskAttachmentViewerModal`'s `AttachmentRow` type was narrowed to `{ filename: string }` instead of reusing the task-attachments' 4-field shape**, surfaced by a `tsc` error when `_task-comments.tsx`'s `CommentAttachment` type (`{ id, filename, size }`, matching what the comments API actually returns — no `created_at`) didn't satisfy the modal's original `{ id, filename, size, created_at }` requirement. Grepped the modal's body first to confirm `filename` is the only field it reads (the id/URL work is now entirely the caller's responsibility via `fetchUrl`, per Decision #8) before narrowing — not a guess. This is a strictly more correct expression of Decision #8's "generalize for reuse" intent, not a scope change.
- No deviations touching the Out of Scope boundaries — confirmed `_task-description-field.tsx`/`_task-description-editor.tsx`, the existing project-scoped `description-images` route, `_task-attachments.tsx`'s own list/upload logic (beyond the one mechanical prop update), and comment edit/delete UI are all untouched.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors, after narrowing `AttachmentRow`)
- `pnpm lint` - PASS (no warnings or errors, after removing the unused `resetKey` prop and an unnecessary `eslint-disable` comment for a rule this project's config doesn't enable)
- impeccable design-lint hook - fired after every file write/edit; all findings were `design-system-font-size` on literal pixel values copied verbatim from already-shipped sibling patterns in this same directory (`_task-description-field.tsx`'s toolbar-hint size, the original `_task-comments.tsx`'s own sizes, `_task-attachments.tsx`'s file-chip sizes from task 211). All classified false positives per this codebase's documented convention (CLAUDE.md "UI Polish Conventions"); none required a change.
- Manual/browser verification (Implementation Step 8) - SKIPPED (deferred to the `test` stage per the implement skill's workflow — this stage runs typecheck/lint only, no dev server was started during implementation)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation — confirmed via `git diff`/full reads of all 8 changed/new files; the two lint-flagged issues from implementation (unused `resetKey` prop, unnecessary `eslint-disable`) were already fixed before this pass and re-confirmed absent.
- No `any` or untyped escape hatches — all new components/routes are fully typed (`CommentAttachment`, `CommentRow`, `AttachmentRow` narrowed to its actual usage, the three new route handlers' `params` shapes).
- No deep nesting — all three new API routes use the same flat early-return guard-clause chain as every sibling route in this codebase (401 → 404 comment-lookup → 400 validation → 500 on storage/DB failure); `_comment-editor.tsx`'s paste/drop handlers are simple single-level conditionals, matching `_task-description-field.tsx`'s identical shape exactly.
- Each file has one clear responsibility: `_comment-editor.tsx` (rich-text compose + inline-image upload only), the two new attachment routes (list/upload, sign-one-url), `description-images/route.ts` (one upload endpoint), `_task-comments.tsx` (list + compose + post, same scope as before task 212 — no scope creep into e.g. edit/delete).
- Names accurately describe behavior (`uploadAndInsertImage`, `attachmentsByComment`, `resolveAuthorName` unchanged, `postComment`).
- Repeated logic: `formatFileSize` is duplicated once more (now in `_task-comments.tsx` alongside its existing appearances in `_task-attachments.tsx`/`_task-attachment-picker.tsx`) — consistent with this codebase's own established precedent (task 206's Quality Gate Notes already accepted this exact 4-line-helper duplication rather than introducing a shared-utility module for it); the `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE` list is likewise duplicated between the new comment-attachments route and the existing task-attachments route, matching task 205's own accepted client/server duplication precedent.
- Errors handled intentionally and consistently: a failed inline-image paste silently no-ops (matches `_task-description-field.tsx`'s own documented "silently drop" convention exactly, not a new gap); a failed comment POST leaves the draft/staged attachments in place for retry (matches the pre-task-212 version's identical no-op-on-failure behavior — confirmed by diff, not a regression); partial attachment-upload failures on posting surface a visible warning message (`attachmentWarning`), mirroring `CreateTaskModal.submit()`'s identical pattern; genuine server-side failures (storage upload, DB insert, URL signing) log via `console.error` only, matching every sibling route.
- No secrets, credentials, or debug logging in production paths.
- Fixed-hex token styling throughout, no `dark:` classes, no unjustified `style={{}}`.
- `npx tsc --noEmit` and `pnpm lint` both re-confirmed PASS during this review (rerun, not just trusted from Implementation Notes).
- File sizes stay well within `nextjs-file-length-best-practices.md`'s guidance: new/rewritten files range 39–178 lines, all comfortably under the 250–300 soft-warning threshold.

### Deviations
- Both deviations already documented in Implementation Notes were reviewed and confirmed correct, not scope changes: dropping `CommentEditor`'s unused `resetKey` prop (Minor — lint-driven cleanup, remount mechanism unaffected), and narrowing `TaskAttachmentViewerModal`'s shared `AttachmentRow` type to `{ filename: string }` (Minor — a stricter, more accurate expression of the plan's own "generalize for reuse" decision, verified by grep before narrowing rather than assumed).
- No deviations touching Out of Scope boundaries — confirmed via `git status`/`git diff --name-only` that `_task-description-field.tsx`, `_task-description-editor.tsx`, the existing project-scoped `description-images` route, comment edit/delete UI, `issue_comments`, and task 211's column-swap/tab-switcher layout are all untouched by this task's diff.
- No new npm dependencies or Supabase migrations introduced, matching the task doc's Compatibility Touchpoints exactly.
