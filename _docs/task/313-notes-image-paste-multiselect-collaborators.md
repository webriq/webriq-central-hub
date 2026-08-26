# 313: Notes — Paste-Image in the RTE, Multi-Select "Add Collaborator" with Select-All

**Created:** 2026-08-26
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Second follow-up pass on the Notes tab (after 311 shipped the feature and 312 did the RTE/empty-state/tooltip polish). Two asks:

1. **Paste an image into the note body.** `_note-rich-text-editor.tsx` (added in task 312) is a Tiptap `StarterKit`-only editor with no image support at all. This repo already has the exact pattern to copy: `_task-description-editor.tsx`'s `Image` extension + `handlePaste`/`handleDrop` + an upload API route that stores to the public `task-content` bucket and inserts the returned URL via `editor.chain().focus().setImage(...)`.
2. **"Add collaborator" becomes multi-select with select-all.** `_note-collaborator-picker.tsx` (from task 311) currently shares to exactly one person per click, immediately, always at `view` permission — there's no way to share to several people in one action, and no "share to everyone on the project" shortcut. This task turns the candidate list into a checkbox multi-select (search stays), adds a "Select all" control, adds a permission choice (`view`/`edit`) that applies to the batch, and a "Share" button that confirms the whole selection at once.

Both changes are additive to task 311/312's existing files — no new tables, no RLS changes. "Share to all members of the project" is deliberately implemented as "select all candidates" rather than a separate all-or-nothing mode: selecting every checkbox and sharing *is* sharing to the whole project team, and it stays consistent with (and reuses) the exact same per-person RLS-enforced share call already in place — no bulk-share special case needed server-side.

### Scope decisions (please flag in review if any of these should change)

- **Image upload: new route, reused bucket.** A new `src/app/api/projects/[projectId]/notes/description-images/route.ts` is added, closely mirroring `src/app/api/v2/projects/[projectId]/tasks/description-images/route.ts` — same MIME allowlist (`image/jpeg|png|gif|webp`), same 10MB cap, same public `task-content` storage bucket (migration 091, already exists — no new bucket/migration). Storage path is namespaced `notes/{projectId}/{timestamp}_{filename}` (vs. that route's `{projectId}/{timestamp}_{filename}`) purely so notes-uploaded images are visually distinguishable in the bucket from task/issue description images; no functional difference. **Auth check differs from the copied precedent**: the task route gates on `["admin","super_admin","pm"]` (task-description convention); this route gates on the Notes feature's own staff set, `["admin","super_admin","pm","developer"]`, matching migration 120's RLS and every other Notes route's role check — copy the shape, not the literal role array.
- **This route is under `/api/projects/[projectId]/notes/...`** (not `/api/v2/...`), so `[projectId]` is `project.id` (the UUID), per the Notes routes' own established convention (task 311's Code Context) — **not** the `project_id` display-column lookup the `/api/v2/...` precedent route does. Do not copy that lookup; just use `projectId` directly in the storage path, same as every other Notes route already does.
- **No per-note permission check on the upload route.** Uploading an image only writes to storage and returns a URL — it doesn't touch the `notes` table. The note's own RLS (insert/update policies) still gates whether that URL can actually be saved into a note's `content`. This matches the copied precedent, which also only checks role, not per-task permission.
- **Multi-select sharing reuses the existing single-share endpoint — no new API route.** `POST .../notes/[noteId]/collaborators` already upserts one `(note_id, user_id)` row per call and is safe to call concurrently for distinct users (no conflicting rows). The picker fans out one `onShare(userId, permission)` call per selected person via `Promise.all` — `_notes-tab.tsx`'s existing `shareNote` function and the modal's existing `onShare` wiring need no changes at all.
- **"Select all" selects all current search-filtered candidates** (project members not already a collaborator, minus the author), not literally every `allMembers` entry regardless of the search box — this is the standard "select all filtered results" pattern and avoids a confusing mismatch between what's visible and what a bare "select all" would silently also select.
- **Batch permission is one choice for the whole batch**, not per-person — a segmented `view`/`edit` control next to the "Share" button, defaulting to `view` (same safe default the single-add flow already used). Changing an individual already-shared person's permission afterward still uses the existing per-row dropdown in the "Shared with" list — unchanged.
- **Out of scope**: image resizing/cropping, an explicit "insert image" toolbar button (paste/drop only, matching `_task-description-editor.tsx`'s own scope — it has no button either), removing/replacing the existing single-click-to-add interaction model's underlying data flow (only the picker's UI/interaction changes), and any change to `note_collaborators`' RLS or schema (already generically supports many rows per note — no change needed).

## Requirements

- [ ] Pasting an image (clipboard) into the note editor uploads it and inserts it inline at the cursor, same UX as `_task-description-editor.tsx`.
- [ ] Dragging and dropping an image file onto the note editor does the same.
- [ ] Non-image paste/drop content is unaffected (falls through to Tiptap's default handling, same as the copied precedent).
- [ ] Uploaded images persist in saved note content and re-render correctly (`_note-card.tsx`'s `dangerouslySetInnerHTML` already renders arbitrary HTML from task 312, including `<img>`, but its clamp/list utility classes need an `[&_img]` rule added so an embedded image doesn't blow out card layout).
- [ ] The "Add collaborator" popover shows a checkbox next to each candidate person (not-yet-shared project member, excluding the author), filterable by the existing search box.
- [ ] A "Select all" control selects/deselects every currently-filtered candidate.
- [ ] A permission choice (`Can view` / `Can edit`) is presented for the selected batch before confirming.
- [ ] A "Share" action shares the note with every selected person at once, at the chosen permission, and the popover's "Shared with" list updates to reflect all of them.
- [ ] Existing single-person-already-shared management (per-row permission dropdown, remove) is unchanged.
- [ ] `npx tsc --noEmit` passes with no new errors.

## Out of Scope / Must-Not-Change

- No new Supabase Storage bucket, no migration — reuse `task-content` (already public, already sized for this).
- No changes to `note_collaborators`/`notes`/`note_folders` RLS or schema.
- No new bulk-share API route — client-side fan-out over the existing single-share endpoint only.
- No image toolbar button, no resize/crop UI, no other new RTE marks beyond image paste/drop.
- Do not touch `_task-description-editor.tsx`, `_comment-editor.tsx`, or their upload routes — build Notes-local files only, following their shape.
- Do not change `_note-folder-rail.tsx`, `_notes-board.tsx`, `_notes-loading-skeleton.tsx`, `_icon-tip.tsx` — task 312 already covered those; this task is scoped to the RTE and the collaborator picker only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/projects/[projectId]/notes/description-images/route.ts` | Create | Upload endpoint for pasted/dropped note images — mirrors `api/v2/projects/[projectId]/tasks/description-images/route.ts`, staff-role-gated, writes to `task-content` bucket under a `notes/` prefix |
| `src/app/(hub)/projects/_shared/_notes/_note-rich-text-editor.tsx` | Modify | Add `@tiptap/extension-image` + paste/drop upload handlers (needs `projectId` prop, currently not passed in) |
| `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` | Modify | Pass `projectId` through to `NoteRichTextEditor` |
| `src/app/(hub)/projects/_shared/_notes-tab.tsx` | Modify | Pass `projectId` (already in scope as a prop) down to `NoteEditorModal` |
| `src/app/(hub)/projects/_shared/_notes/_note-card.tsx` | Modify | Add `[&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5` to the content-render utility classes so embedded images don't overflow the card |
| `src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx` | Modify | Checkbox multi-select candidate list, "Select all", batch permission choice, "Share" confirm action |

## Code Context

### Paste/drop-to-upload precedent to copy (`_task-description-editor.tsx:32-71`, already read in full during task 311/312 planning)

```tsx
async function uploadAndInsertImage(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/v2/projects/${projectId}/tasks/description-images`, { method: "POST", body: fd });
  if (!res.ok) return; // silently drop — a failed inline image paste isn't fatal to the form
  const { url } = await res.json();
  editor?.chain().focus().setImage({ src: url }).run();
}

const editor = useEditor({
  extensions: [StarterKit, Image],
  // ...
  editorProps: {
    // ...
    handlePaste(_view, event) {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((i) => i.type.startsWith("image/"));
      if (!imageItem) return false;
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (file) void uploadAndInsertImage(file);
      return true;
    },
    handleDrop(_view, event) {
      const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return false;
      event.preventDefault();
      void uploadAndInsertImage(file);
      return true;
    },
  },
});
```

Add this shape to `_note-rich-text-editor.tsx` verbatim (same silent-drop-on-failure behavior, same `handlePaste`/`handleDrop` signature), adding `Image` to the existing `extensions: [StarterKit, Placeholder.configure(...)]` array and a new required `projectId: string` prop threaded from `_note-editor-modal.tsx` ← `_notes-tab.tsx` (which already receives `projectId`, just isn't passing it into the modal today).

### Upload route to copy, with the changes noted in Scope Decisions (`api/v2/projects/[projectId]/tasks/description-images/route.ts`, full file already read during this task's planning — see file contents above in this doc's earlier tool output if needed, or re-read the file directly)

Key deltas from the copied file:
- Role check: `["admin", "super_admin", "pm", "developer"]` instead of `["admin", "super_admin", "pm"]`.
- No `project_id` display-column lookup — `projectId` from the route param is already the UUID; use it directly in the storage path.
- Storage path: `notes/${projectId}/${timestamp}_${safeFilename}` instead of `${projectId}/${timestamp}_${safeFilename}`.
- Same bucket (`task-content`), same MIME allowlist, same 10MB limit, same response shape (`{ url, filename, size }`, 201).

### Card content-render classes to extend (`_note-card.tsx:64-68`, current post-312 state)

```tsx
{note.content && (
  <div
    className="text-[13px] text-[#3A4565] line-clamp-6 flex-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5"
    dangerouslySetInnerHTML={{ __html: note.content }}
  />
)}
```

Add `[&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5` (same image-utility classes `_task-description-editor.tsx:52` and `_comment-editor.tsx:61` already use) to this className.

### Collaborator picker to redesign (`_note-collaborator-picker.tsx`, full file already read during task 311/312 planning)

Current candidate rendering (single-click-to-share):

```tsx
{candidates.map((person) => (
  <button
    key={person.id}
    type="button"
    onClick={() => { onShare(person.id, "view"); setSearch(""); }}
    className={cn("flex items-center justify-between gap-2 px-2 py-1.5 rounded-[10px] text-left cursor-pointer transition-colors hover:bg-[#F0F7FF]", person.id === currentUserId && "opacity-60")}
  >
    <span className="text-[13px] text-[#3A4565] truncate">{person.full_name ?? "Unnamed"}</span>
    <span className="text-[10px] font-semibold text-[#5F6A88] uppercase shrink-0">{person.role}</span>
  </button>
))}
```

Redesign to: each row becomes a label wrapping a checkbox + name + role (checkbox toggles membership in a local `selectedIds: Set<string>` state, not an immediate share call); add a "Select all" row above the list wired to `candidates.every(c => selectedIds.has(c.id))` / toggling all filtered `candidates` ids at once; add a `batchPermission: "view" | "edit"` local state (default `"view"`) rendered as a small segmented control or `<select>` (match the existing per-row permission `<select>`'s style at line 71-78 of the current file for visual consistency) next to a "Share" button that is disabled when `selectedIds.size === 0` and, on click, calls `onShare(id, batchPermission)` for every id in `selectedIds`, then clears `selectedIds` and `search`. Keep the existing "Shared with" list (lines 65-91 of the current file) and its per-person permission dropdown / remove button unchanged.

### `NoteRichTextEditor` current signature to extend (`_note-rich-text-editor.tsx:18-28`, post-312 state)

```tsx
export function NoteRichTextEditor({
  value,
  onChange,
  onEmptyChange,
  readOnly,
}: {
  value: string;
  onChange: (html: string) => void;
  onEmptyChange: (isEmpty: boolean) => void;
  readOnly: boolean;
}) {
```

Add `projectId: string` to the prop list; `_note-editor-modal.tsx` doesn't currently receive `projectId` either — it must be added to that component's own props and threaded from `_notes-tab.tsx`'s existing `<NoteEditorModal ...>` call (which already has `projectId` in scope as its own prop, just isn't passing it down).

## Implementation Steps

1. Create `src/app/api/projects/[projectId]/notes/description-images/route.ts` per Code Context (copy `api/v2/projects/[projectId]/tasks/description-images/route.ts`, apply the four deltas listed).
2. Add `projectId: string` to `NoteEditorModal`'s props (`_note-editor-modal.tsx`) and pass it through to `NoteRichTextEditor`.
3. Add `projectId` to the `<NoteEditorModal ...>` call in `_notes-tab.tsx` (the component already receives `projectId` as its own prop).
4. In `_note-rich-text-editor.tsx`: add `projectId` to the prop signature, import `Image` from `@tiptap/extension-image`, add it to the `extensions` array, add `uploadAndInsertImage` + `handlePaste`/`handleDrop` per Code Context, add an `[&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5` rule to the editor's own content class list (parity with the card).
5. In `_note-card.tsx`, extend the content-render className with the same `[&_img]` rules.
6. Redesign `_note-collaborator-picker.tsx`'s candidate list into a checkbox multi-select with "Select all", a batch permission control, and a "Share" button, per Code Context — keep the "Shared with" section and its existing per-person controls unchanged.
7. Run `npx tsc --noEmit` and `pnpm lint`.
8. Manual browser pass once migration 120 is applied (still pending — same standing blocker as tasks 311/312, flag to the user if not yet applied): paste an image into a note, reload, confirm it renders and doesn't overflow the card; drag-drop an image; open "Add collaborator" on a note with several project members, search, multi-select a few, toggle "Select all", pick `edit`, click Share, confirm all selected people appear in "Shared with" at `edit` permission; confirm per-person permission change/remove in that list still works.

## Acceptance Criteria

- [ ] Paste and drag-drop of an image into the note editor both upload and insert inline.
- [ ] Uploaded image URLs persist through save/reload and render on both the card (clamped, non-overflowing) and in the editor.
- [ ] Non-image clipboard/drop content still behaves as before (no regression to plain paste/typing).
- [ ] Collaborator picker candidate rows are checkboxes; search still filters them.
- [ ] "Select all" selects/deselects all currently-filtered candidates.
- [ ] A chosen batch permission (`view`/`edit`) applies to every person shared in one "Share" click.
- [ ] Sharing to "all members" (select-all + Share) results in a `note_collaborators` row for every eligible project member, each independently readable/editable per existing RLS.
- [ ] Existing single-person permission-change and remove controls in "Shared with" are unaffected.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual browser pass (no test runner configured in this repo), once migration 120 is applied:
# - Open a note, paste a screenshot into the body — image uploads and appears inline
# - Drag an image file onto the body — same
# - Save, reload — image still renders; check the note card grid — image doesn't overflow the card
# - Open "Add collaborator" on a note in a project with 3+ members — search, check a couple of
#   boxes, toggle "Select all", pick "Can edit", click Share — confirm all appear in "Shared with"
# - As one of the shared accounts, confirm access matches the chosen permission (view vs edit)
# - Change one person's permission and remove another from "Shared with" — confirm those still work
```

## Compatibility Touchpoints

- No DB/RLS/migration changes — reuses migration 120's existing `note_collaborators` table and the existing `task-content` storage bucket (migration 091).
- No changes to any non-Notes file, no changes to the Notes API's request/response shapes for existing endpoints (only one new route is added).
- Zoho/MCP/cron surfaces untouched.

## Implementation Notes

### What Changed
- Added a new notes-scoped image upload route reusing the public `task-content` bucket, under a `notes/` path prefix.
- `NoteRichTextEditor` now supports paste/drop image upload-and-insert (Tiptap `Image` extension), same shape as `_task-description-editor.tsx`. `projectId` threaded down from `_notes-tab.tsx` → `_note-editor-modal.tsx` → `_note-rich-text-editor.tsx`.
- `_note-card.tsx`'s content-render class gained `[&_img]` rules so embedded images render clamped/rounded instead of overflowing the card.
- `_note-collaborator-picker.tsx`'s candidate list redesigned from single-click-shares-immediately into a checkbox multi-select with a "Select all" (scoped to the current search-filtered candidates) and a batch `view`/`edit` permission control gated behind a "Share (N)" button. The existing "Shared with" section (per-person permission dropdown + remove) is unchanged.

### Files Changed
- `src/app/api/projects/[projectId]/notes/description-images/route.ts` - new upload route (staff-role-gated: admin/super_admin/pm/developer; `task-content` bucket; `notes/{projectId}/{timestamp}_{filename}` path)
- `src/app/(hub)/projects/_shared/_notes/_note-rich-text-editor.tsx` - added `projectId` prop, `Image` extension, `uploadAndInsertImage` + `handlePaste`/`handleDrop`, `[&_img]` content classes
- `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` - added `projectId` prop, passed through to `NoteRichTextEditor`
- `src/app/(hub)/projects/_shared/_notes-tab.tsx` - passes its own `projectId` prop into `<NoteEditorModal>`
- `src/app/(hub)/projects/_shared/_notes/_note-card.tsx` - added `[&_img]` rules to the content-render className
- `src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx` - checkbox multi-select candidates, "Select all", batch permission + "Share" action; `closePopover()` helper resets pending selection/search on close (called directly from the outside-click handler and the trigger toggle, not from a `useEffect` keyed on `open`)

### Deviations From Plan
- One lint-driven fix beyond the plan's literal Code Context: the plan didn't anticipate resetting selection state on close via an effect running afoul of this repo's `react-hooks/set-state-in-effect` rule (`pnpm lint` caught it as an error, not just a warning). Replaced the effect-based reset with a `closePopover()` function called directly from the two places that actually close the popover (outside-click handler, trigger button toggle) — same end-user behavior (fresh state each time the popover reopens), no synchronous cascading setState. Documented here since it changes the internal implementation shape from what Code Context sketched, though not the observable behavior or scope.
- No other deviations — followed the task doc's Code Context and Implementation Steps as written, including the "no new bulk API route" decision (client-side `selectedIds.forEach(id => onShare(id, batchPermission))` fan-out over the existing single-share endpoint).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS after the `closePopover()` fix above (initial run caught one error from the effect-based reset, fixed, re-ran clean); 2 remaining warnings are pre-existing, unrelated, in `onboarding-workspace/_checklist-tab.tsx` (same warnings noted in tasks 311/312's own verification runs)
- Manual browser pass - SKIPPED: same standing blocker as tasks 311/312 — migration 120 (`notes`/`note_folders`/`note_collaborators` tables) has not been applied to the live database yet, so every Notes API call would 500 until the user applies it. File-length check: largest file after changes is `_notes-tab.tsx` at 230 lines, well under the ~250-300 soft-warning threshold.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read all six changed/new files fresh, independently of the implementation pass. Grepped all six for `console.*`, `TODO`/`FIXME`, and `any`/`as any` — the one `console.error` hit (`description-images/route.ts:53`) is intentional server-side error logging on a failed storage upload, matching the exact same pattern in the copied precedent route (`api/v2/projects/[projectId]/tasks/description-images/route.ts`) — not a finding.
- Confirmed the new upload route's two documented deltas from its copied precedent are both actually present in the code: role check is `["admin","super_admin","pm","developer"]` (not the precedent's `["admin","super_admin","pm"]`), and `projectId` is used directly with no `project_id` display-column lookup (the precedent route does that lookup because it lives under `/api/v2/...`; this one is under `/api/projects/...`, matching every other Notes route's established UUID-as-path-segment convention).
- Traced the `readOnly` boundary specifically for the new paste/drop feature, since it's a new interaction surface layered onto an existing permission model: found that `editable: !readOnly` (Tiptap's native-typing gate) does **not** block the `handlePaste`/`handleDrop` editorProps handlers or the programmatic `setImage` transaction inside `uploadAndInsertImage` — `handleDrop` in particular doesn't require focus, so a view-only collaborator could drag an image onto a read-only note and trigger a real storage upload (gated only by staff role, not by per-note permission) plus a locally-visible, if unsaved, content mutation. **Fixed during this gate**: both handlers now bail early with `if (readOnly) return false;`, mirroring the toolbar's own `{!readOnly && (...)}` gating. Re-ran `npx tsc --noEmit` after the fix — clean.
- Verified `_note-collaborator-picker.tsx`'s multi-select correctness: `selectedIds` persists across search-text changes (a person selected, then filtered out of view by a new search term, stays selected — `toggleSelectAll` only ever touches the currently-filtered `candidates` array, never clobbers selections outside that set); `allFilteredSelected` correctly returns `false` when `candidates` is empty (guarded explicitly, avoiding a vacuous-truth `.every()` on an empty array marking "Select all" as checked with nothing to select); `handleShare` fans out one `onShare(id, batchPermission)` call per selected id and clears local selection/search afterward, matching the task doc's "no new bulk API route" decision.
- Verified no out-of-scope files were touched — exactly the six files in the task doc's Proposed File Changes table.
- Verified no regression to task 311/312's existing behavior: the "Shared with" per-person permission-change/remove controls, the RTE's text-formatting toolbar and its own `readOnly` gating from task 312, and the note-card empty/loading states are all unmodified by this task's diffs.
- File-length guideline check: largest file after all changes (including the readOnly-guard fix) is `_notes-tab.tsx` at 230 lines and `_note-collaborator-picker.tsx` at 210 lines, both comfortably under the ~250-300 soft-warning threshold.
- Re-ran `npx tsc --noEmit` and `pnpm lint` fresh for this gate, after the readOnly fix — both clean (lint's 2 warnings are the same pre-existing, unrelated `onboarding-workspace/_checklist-tab.tsx` warnings noted in tasks 311/312's own gates).

### Deviations
- Medium, fixed in-gate: the paste/drop `readOnly` gap described above was a real functional gap against this feature's own established invariant (view-permission collaborators cannot edit note content) — not called out explicitly in the task doc's Requirements, but implied by carrying forward task 312's `readOnly` contract into a new editing surface. Fixed directly rather than deferred, since it was a small, obviously-in-scope tightening (two `if (readOnly) return false;` guards) with no product-scope expansion.
- Minor: the effect-based selection-reset → `closePopover()` refactor noted in Implementation Notes (lint-driven, no behavior change).
- No other deviations from the task doc's Requirements, Code Context, Out-of-Scope boundaries, or Implementation Steps.

### Required Fixes
- None outstanding — the one finding from this review was fixed during the gate itself (see Deviations).

## Completion Note (2026-08-26)

Marked Completed at the user's explicit request. Code is finished and verified by inspection/`tsc`/`lint`, including the in-gate `readOnly` paste/drop fix. Migration 120 is applied on the remote database; migration 121 (task 311's RLS-recursion fix, a prerequisite for any Notes API call to succeed, including image upload and collaborator sharing) is written but not yet applied. Live browser verification of this task's specific changes (paste/drop image upload, multi-select "Select all" sharing) was not run — apply migration 121 first, then exercise this doc's own Verification checklist above with a second staff account.
