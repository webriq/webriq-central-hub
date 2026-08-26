# 315: Notes — Let "Add Collaborator" Work While Composing an Unsaved Note

**Created:** 2026-08-26
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Fourth follow-up on the Notes tab. The "Add collaborator" trigger in `_note-editor-modal.tsx` is currently hard-disabled (`disabled={!note}`) for the entire time a user is composing a brand-new, not-yet-saved note — it only becomes clickable after the note has been created, which today only happens when the composer is closed (task 311's "type first, save on close" design). This reads as "restricted" to the user even though the project has plenty of collaborators/members/assignees available to share with — the block isn't about who's available, it's that there's no `note_id` yet for a `note_collaborators` row to reference.

**Root cause, confirmed against the current code**:
- `_note-editor-modal.tsx:172` — `<NoteCollaboratorPicker ... disabled={!note} />`.
- `allMembers` (the candidate pool) is *not* project-scoped at all — `_get-project-detail-data.ts:80` fetches `profiles` where `role in ('developer','pm','admin','super_admin')` org-wide, so the candidate list itself is unrelated to this bug and already broad.
- `note_collaborators_insert`'s RLS (migration 120, patched by migration 121) requires a real `notes.id` to exist — sharing genuinely cannot be deferred into the create-time draft patch the way pin/color/folder can, since collaborators live in a separate table.

**Fix**: silently create the note the moment the user actually tries to share (clicks "Share (N)" inside the collaborator popover), using whatever title/content/color/folder/pin draft state already exists at that moment — then keep editing that now-real note for the rest of the modal session (pin/archive/color/folder/delete/further-share all retarget the created note's id instead of staying in draft mode). This mirrors what already happens implicitly on close, just triggered earlier and explicitly when sharing is the thing the user is trying to do.

### Scope decisions (please flag in review if any of these should change)

- **Trigger point is "Share", not "open the popover".** Opening "Add collaborator" and searching/selecting people doesn't need a note id — only the moment `onShare` is actually invoked does. Keeping the popover freely browsable while composing (never disabled) is simpler and matches Keep's own affordance (you can always open the share UI; only committing a share needs the note to exist).
- **`NoteCollaboratorPicker`'s share flow changes from "one `onShare` call per selected person" to "one `onShareMany` call with the full selected-id array".** This is necessary, not incidental: if the wrapping owner (`_note-editor-modal.tsx`) needs to create the note *once* before sharing to N people, that "create once" step has to happen outside the per-person loop, not be re-triggered N times by N independent `onShare` calls. A `useRef`-memoized in-flight creation promise additionally guards against a rapid double-click on "Share" firing two concurrent `POST` creates.
- **The modal tracks its own `activeNote` state, seeded from the `note` prop.** Every internal reference that currently reads `note` (permission calc, the id passed to `onTogglePin`/`onToggleArchive`/`onDelete`/`onChangeColor`/`onChangeFolder`/`onShare`/`onChangePermission`/`onUnshare`, and `handleClose`'s create-vs-save-draft branch) switches to `activeNote`. Once a share auto-creates the note, `activeNote` flips from `null` to the created row, and every other action in the same modal session (pin, archive, color change, delete, closing) correctly targets the real note from then on instead of silently no-op'ing against a stale `null`.
- **`_notes-tab.tsx`'s `createNote` starts returning the created `NoteRow` (or `null` on failure)** instead of being effectively `void`. The existing "create on close" call site doesn't need the return value and is unaffected; the new auto-create-on-share path does. It also updates `editingNote` to the created row so the parent's own notion of "what's open in the modal" stays in sync (defensive — the modal doesn't strictly need this since it tracks `activeNote` itself, but keeping parent state accurate is low-cost and avoids a stale-prop trap if the modal ever re-mounts).
- **`NoteCollaboratorPicker`'s now-unused `disabled` prop is removed** rather than left as dead plumbing — it was only ever driven by the `!note` gate this task removes, and the picker is already only rendered when `canManageSharing` is true (which is always true while composing, since a not-yet-created note has no other author/admin to conflict with).
- **Out of scope**: auto-creating the note on *any* interaction (typing, opening the color picker, etc.) — only sharing needs this, because it's the only action that can't be expressed as part of the create-time draft patch. Pin/color/folder selection during composition keep working exactly as before (held as local draft state, sent together in the initial `POST` whenever the note does get created — whether that's via this new share-triggered path or the existing close-triggered path). No change to `note_collaborators` RLS, no new API route.

## Requirements

- [ ] "Add collaborator" is never disabled while composing a new note — the popover opens and is fully usable (search, multi-select, select-all, permission choice) before the note has been saved.
- [ ] Clicking "Share (N)" while composing an unsaved note creates the note first (using the current title/content/color/folder/pin draft state), then shares it to all N selected people at the chosen permission.
- [ ] After that auto-create, the modal is now editing a real note: pin/archive/color/folder/delete/further sharing all work against it, and the "Shared with" list reflects the people just shared to.
- [ ] Closing the modal after an auto-create-via-share does not create a second, duplicate note — it saves title/content as a draft update to the already-created note, same as editing any existing note.
- [ ] Rapid double-clicking "Share" during the auto-create moment does not create two notes.
- [ ] Sharing on an already-existing note (the normal case, opened via a note card) is unaffected — same behavior as before.
- [ ] `npx tsc --noEmit` passes with no new errors.

## Out of Scope / Must-Not-Change

- No changes to `note_collaborators`/`notes` RLS, migrations, or any API route's request/response shape — the `POST /api/projects/[projectId]/notes` route already returns the full `NoteRow` shape needed here.
- No changes to `allMembers`/the candidate pool — confirmed unrelated to this bug.
- No auto-create on any trigger besides "Share" (not on typing, not on opening the color/folder controls).
- Do not change `_note-rich-text-editor.tsx`, `_note-card.tsx`, `_note-color-picker.tsx`, `_notes-board.tsx`, `_note-folder-rail.tsx`, or any API route.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_notes-tab.tsx` | Modify | `createNote` returns the created `NoteRow \| null`; also syncs `editingNote` to it |
| `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` | Modify | Track `activeNote` local state; add `ensureNoteCreated()` (memoized in-flight, race-safe); swap every internal `note` reference to `activeNote`; remove the `disabled={!note}` gate; wire the new `onShareMany` handler |
| `src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx` | Modify | `onShare` prop → `onShareMany: (userIds: string[], permission) => void`, called once by "Share" instead of looping per-id calls internally |

## Code Context

### Current disabled gate (`_note-editor-modal.tsx:166-177`, current state)

```tsx
{canManageSharing && (
  <NoteCollaboratorPicker
    collaborators={note?.collaborators ?? []}
    allMembers={allMembers}
    authorId={note?.created_by ?? currentUserId}
    currentUserId={currentUserId}
    disabled={!note}
    onShare={(userId, perm) => note && onShare(note.id, userId, perm)}
    onChangePermission={(userId, perm) => note && onChangePermission(note.id, userId, perm)}
    onUnshare={(userId) => note && onUnshare(note.id, userId)}
  />
)}
```

Becomes (illustrative — adapt to the `activeNote` state introduced below):

```tsx
{canManageSharing && (
  <NoteCollaboratorPicker
    collaborators={activeNote?.collaborators ?? []}
    allMembers={allMembers}
    authorId={activeNote?.created_by ?? currentUserId}
    currentUserId={currentUserId}
    onShareMany={handleShareMany}
    onChangePermission={(userId, perm) => activeNote && onChangePermission(activeNote.id, userId, perm)}
    onUnshare={(userId) => activeNote && onUnshare(activeNote.id, userId)}
  />
)}
```

### `activeNote` + `ensureNoteCreated` + `handleShareMany` to add (`_note-editor-modal.tsx`)

```tsx
const [activeNote, setActiveNote] = useState<NoteRow | null>(note);
const creatingRef = useRef<Promise<NoteRow | null> | null>(null);

async function ensureNoteCreated(): Promise<NoteRow | null> {
  if (activeNote) return activeNote;
  if (!creatingRef.current) {
    const trimmedTitle = title.trim() || null;
    const trimmedContent = contentEmpty ? null : content;
    creatingRef.current = onCreate({ title: trimmedTitle, content: trimmedContent, color, folder_id: folderId, is_pinned: isPinned });
  }
  const created = await creatingRef.current;
  if (created) setActiveNote(created);
  return created;
}

async function handleShareMany(userIds: string[], permission: "view" | "edit") {
  const target = await ensureNoteCreated();
  if (!target) return; // silently drop on failure — matches this app's existing convention (e.g. image upload)
  userIds.forEach((userId) => onShare(target.id, userId, permission));
}
```

Every other `note` reference in the file (permission calc at the top, `handleClose`, the Pin/Archive/Delete buttons, the folder `<select>`'s `onChange`, `NoteColorPicker`'s `onChange`) switches to `activeNote`. `handleClose` in particular needs no structural change beyond the rename — its existing `if (!note) { create } else { maybe save draft }` shape already does the right thing once `note` becomes `activeNote`: after an auto-create-via-share, `activeNote` is non-null, so closing takes the "save draft if changed" branch instead of creating a duplicate.

### `onCreate`'s new return type (`_note-editor-modal.tsx` prop signature, `_notes-tab.tsx:80-89` current implementation)

```tsx
// _notes-tab.tsx, current:
async function createNote(patch: NoteDraftPatch) {
  const res = await fetch(`/api/projects/${projectId}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  if (!res.ok) return;
  const created: NoteRow = await res.json();
  setNotes((prev) => [created, ...prev]);
}
```

Change the return type to `Promise<NoteRow | null>`, return `null` on `!res.ok`, return `created` on success, and add `setEditingNote(created);` right after `setNotes(...)` so the parent's own "note currently open in the modal" stays accurate. Update `NoteEditorModal`'s `onCreate` prop type to match: `onCreate: (patch: NoteDraftPatch) => Promise<NoteRow | null>;`.

### `_note-collaborator-picker.tsx`'s share handler to change (current `handleShare`)

```tsx
function handleShare() {
  selectedIds.forEach((id) => onShare(id, batchPermission));
  setSelectedIds(new Set());
  setSearch("");
}
```

Change the prop from `onShare: (userId: string, permission: "view" | "edit") => void;` to `onShareMany: (userIds: string[], permission: "view" | "edit") => void;`, and `handleShare` becomes:

```tsx
function handleShare() {
  onShareMany(Array.from(selectedIds), batchPermission);
  setSelectedIds(new Set());
  setSearch("");
}
```

Also remove the now-unused `disabled?: boolean` prop and its one usage on the trigger button (`disabled={disabled}` → drop the attribute entirely).

## Implementation Steps

1. `_notes-tab.tsx`: change `createNote`'s return type to `Promise<NoteRow | null>`, return `null` on failure, add `setEditingNote(created)` on success.
2. `_note-editor-modal.tsx`: add `activeNote` state + `creatingRef` + `ensureNoteCreated()` + `handleShareMany()` per Code Context; update the `onCreate` prop type; replace every `note` reference in the component body (not the `note` prop itself, which stays as the initial-value input) with `activeNote`; remove `disabled={!note}` from the `<NoteCollaboratorPicker>` call; pass `onShareMany={handleShareMany}` instead of `onShare={...}`.
3. `_note-collaborator-picker.tsx`: rename the `onShare` prop to `onShareMany` with the new signature, update `handleShare()`, remove the `disabled` prop and its usage.
4. Run `npx tsc --noEmit` and `pnpm lint`.
5. Manual browser pass (needs migrations 120+121 applied): open the composer on a project with 2+ staff accounts, type a title, click "Add collaborator" while the note is still unsaved (composer, not yet closed) — confirm it's clickable and the picker opens; select one or more people, pick a permission, click "Share" — confirm the note is created, appears in "All notes" after closing, and the shared account sees it in "Shared with me"; while still in the same modal session after sharing, toggle pin/color/archive and confirm they persist; close the modal without further edits — confirm no duplicate note was created; repeat starting from a fully empty composer (no title/content) and share — confirm an otherwise-empty note is still created and shared successfully (title/content stay null, matching what an empty close-to-create would produce).

## Acceptance Criteria

- [ ] "Add collaborator" is clickable at all times while composing, before the note is saved.
- [ ] Sharing from an unsaved composer creates exactly one note and shares it to every selected person at the chosen permission.
- [ ] All other actions (pin/archive/color/folder/delete/further share) work correctly against the auto-created note for the remainder of that modal session.
- [ ] Closing after an auto-create-via-share never creates a second note.
- [ ] Sharing on a pre-existing, already-saved note behaves exactly as before this change.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual browser pass (no test runner configured in this repo), migrations 120+121 applied:
# - New composer, type a title, click "Add collaborator" before closing — popover opens (not disabled)
# - Select 2 people, "Can edit", click Share — note gets created, both appear in "Shared with"
# - Still in the modal: pin it, change its color, archive/unarchive it — confirm each persists
# - Close the modal — confirm exactly one note exists (check "All notes"), not two
# - As one of the shared accounts, confirm the note shows in "Shared with me" at "edit" permission
# - Repeat with a fully empty composer (no title/content) shared immediately — note still created+shared
# - Open an existing, already-saved note and share it — unaffected, works as before
```

## Compatibility Touchpoints

- No DB/RLS/migration changes — reuses the existing `POST /api/projects/[projectId]/notes` and `POST .../collaborators` routes as-is.
- No changes to any non-Notes file.
- Zoho/MCP/cron surfaces untouched.

## Implementation Notes

### What Changed
- `_notes-tab.tsx`'s `createNote` now returns the created `NoteRow` (or `null` on failure) and also syncs `editingNote` to it.
- `_note-editor-modal.tsx` tracks its own `activeNote` state (seeded from the `note` prop), adds a race-safe `ensureNoteCreated()` (memoized in-flight promise via `useRef`) and `handleShareMany()`, and every internal action (pin/color/folder/archive/delete/share/close) now targets `activeNote` instead of the original `note` prop — so once sharing auto-creates the note mid-composition, every subsequent action in that same modal session correctly operates on the real row.
- `NoteCollaboratorPicker`'s `onShare` prop replaced with `onShareMany(userIds, permission)`, called once per "Share" click instead of once per selected person — this is what lets the owner create the note exactly once before fanning out the share calls. The now-unused `disabled` prop and its trigger-button usage were removed (the "Add collaborator" button is never disabled anymore).

### Files Changed
- `src/app/(hub)/projects/_shared/_notes-tab.tsx` - `createNote` returns `Promise<NoteRow | null>`, syncs `editingNote`
- `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` - `activeNote` state, `ensureNoteCreated()`, `handleShareMany()`, all internal `note` references switched to `activeNote`, `onCreate` prop type widened
- `src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx` - `onShare` → `onShareMany`, `handleShare()` updated, `disabled` prop removed

### Deviations From Plan
- One rename beyond the plan's literal Code Context: `handleShareMany`'s second parameter is named `sharePermission`, not `permission` — the plan's sketch used `permission` for both the outer `getNotePermission()`-derived constant and the new handler's parameter, which would shadow it. Renamed to avoid the shadow; no behavior change.
- No other deviations — followed the task doc's Code Context and Implementation Steps as written.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 remaining warnings are pre-existing, unrelated, in `onboarding-workspace/_checklist-tab.tsx`, same as tasks 311-314's own runs)
- Manual browser pass - SKIPPED: requires migrations 120+121 applied and a second staff account to actually receive a share — same standing setup requirement as prior Notes tasks. File-length check: largest file after changes is `_notes-tab.tsx` at 246 lines, still under the ~250-300 soft-warning threshold.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read all three changed files fresh, independently of the implementation pass. Grepped all three for `console.*`, `TODO`/`FIXME`, and `any`/`as any` — none found.
- Confirmed exactly the three files in the task doc's Proposed File Changes table were touched — no out-of-scope files, no API/DB/migration changes.
- **Found and fixed a real race condition against this task's own explicit acceptance criterion** ("Closing the modal after an auto-create-via-share does not create a second, duplicate note"): `handleClose()`'s create branch called `onCreate(...)` directly, bypassing `creatingRef`/`ensureNoteCreated()` entirely. Sequence that broke it: user clicks "Share" → `handleShareMany` starts `ensureNoteCreated()`, which kicks off an in-flight `POST` → before that resolves, the user clicks Close (or the backdrop) → `handleClose()` runs synchronously, sees `activeNote` still `null` (the share's creation hasn't resolved yet), and fires a *second*, independent `onCreate(...)` — resulting in two notes, only one of which ever gets shared. **Fixed** by gating `handleClose`'s create call on `!creatingRef.current` — if a share-triggered creation is already in flight, closing no longer starts a competing one; the in-flight creation completes and updates parent state (`setNotes`/`setEditingNote` in `_notes-tab.tsx`) on its own, which is safe to happen after the modal unmounts since that state lives in the parent, not the child. Re-ran `npx tsc --noEmit` after the fix — clean.
- Verified the other explicitly-listed race (rapid double-click on "Share" itself) is still correctly handled by the same `creatingRef` memoization — the second `ensureNoteCreated()` call sees `creatingRef.current` already set and awaits the same in-flight promise rather than starting a new `POST`.
- Verified `onShareMany`'s replacement of the old per-person `onShare` loop is complete — `_note-collaborator-picker.tsx` has zero remaining references to the old `onShare`/`disabled` props (removed cleanly, not left as dead plumbing).
- Verified every other `note`-prop reference inside `_note-editor-modal.tsx` was correctly switched to `activeNote` (pin, folder select, color picker, collaborator picker, archive, delete) — checked each one individually against the pre-edit version; none were missed, none left pointing at the stale `note` prop.
- File-length guideline check: largest file after all changes (including the race fix) is `_notes-tab.tsx` at 246 lines, `_note-editor-modal.tsx` at 245 lines — both still under the ~250-300 soft-warning threshold, though `_note-editor-modal.tsx` is now close to it; worth watching on the next Notes change to this file.
- Re-ran `npx tsc --noEmit` and `pnpm lint` fresh after the race-condition fix — both clean (lint's 2 warnings are the same pre-existing, unrelated `onboarding-workspace/_checklist-tab.tsx` warnings noted in tasks 311-314's own gates).

### Deviations
- Medium, fixed in-gate: the share-then-close race described above was a genuine violation of this task's own stated acceptance criterion, not a hypothetical — fixed directly since it was small (one added guard condition) and unambiguously in-scope (tightening the exact race condition the task doc already called out as a requirement, not a new behavior).
- Minor: `handleShareMany`'s parameter renamed to `sharePermission` to avoid shadowing the outer `permission` constant (already recorded in Implementation Notes).
- No other deviations from the task doc's Requirements, Code Context, Out-of-Scope boundaries, or Implementation Steps.

### Required Fixes
- None outstanding — the one finding from this review was fixed during the gate itself (see Deviations).

## Completion Note (2026-08-26)

Marked Completed at the user's explicit request. Code is finished and verified by inspection/`tsc`/`lint`, including the in-gate share-then-close race-condition fix. Migration 120 is applied on the remote database; migration 121 (task 311's RLS-recursion fix, a prerequisite for any Notes API call to succeed) is written but not yet applied. Live browser verification of this specific fix (sharing an unsaved note, the duplicate-note race, in-session pin/color/archive after auto-create) was not run — apply migration 121 first, then exercise this doc's own Verification checklist above with a second staff account.
