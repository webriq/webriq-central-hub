# 314: Notes — Built-in "Shared with me" Nav Item

**Created:** 2026-08-26
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Third follow-up pass on the Notes tab (after 311 shipped the feature, 312 did RTE/empty-state/tooltip polish, 313 added image paste and multi-select collaborator sharing). This one adds a built-in, always-present nav row in the folder rail — alongside "All notes" and "Archived" — that filters to notes shared *with* the current user: notes where they appear in `note_collaborators`, whether shared individually or via 313's "Select all" batch-share, but which they did not author themselves.

This is a "constant/ready" folder in the sense the user asked for: unlike user-created folders (`note_folders` rows), it's not stored, not renamable, not deletable — it's a fourth fixed `NotesView` state (alongside `"all"`/`"archived"`) computed client-side from data the app already has loaded (`NoteRow.collaborators`, already embedded on every notes list response since task 311). No new table, no new API route, no new query.

### Scope decisions (please flag in review if any of these should change)

- **Named "Shared with me"** — standard terminology for this exact concept (Google Drive/Keep/Docs all use it), and unambiguous next to "All notes"/"Archived".
- **Filter**: `!note.is_archived && note.created_by !== currentUserId && note.collaborators.some(c => c.user_id === currentUserId)`. Excludes the user's own notes (they already see those in "All notes" — a note's author is never their own collaborator anyway, since the collaborator picker already excludes the author from candidates, but the explicit `created_by !== currentUserId` check keeps the filter self-evidently correct without relying on that invariant holding elsewhere) and excludes archived notes (archived stays exclusive to the "Archived" view, matching how "All notes" already excludes archived).
- **Flat grid, no Pinned/Others split** — unlike "All notes", this is a filtered cross-cutting view, not a primary browsing mode. Render it the same simple way "Archived" already renders (one grid, no section split), not the pinned/others two-section layout.
- **No composer bar on this view** — "Take a note…" only shows for `view === "all"` today; stays that way. A new note always starts unshared, so offering the composer from "Shared with me" doesn't make sense.
- **Ignores the active folder filter** — like "Archived" already does (`archivedNotes` in `_notes-tab.tsx` is computed from the full `notes` array, not the folder-scoped `scoped` array). Shared notes can live in any folder or none; showing them regardless of which folder is selected elsewhere in the rail matches the existing Archived precedent and avoids an awkward "no results because you're inside someone else's folder view" trap.
- **No count badge** on the nav row itself, matching "Archived"'s current treatment (folders get badges via task 312; "All notes"/"Archived" don't) — avoids an inconsistent one-off addition to a single row.
- **Placement**: directly below "All notes" and above the user-created folder list, before the divider that currently separates folders from "Archived" — this keeps the two built-in "smart" views (Shared, and eventually more) visually grouped near the top, with user-created folders and Archived following, similar to how Keep groups Notes/Reminders above Labels.
- **Out of scope**: a per-note "shared by X" filter/breakdown, unread/seen-state tracking on shared notes, notifications when a note is shared, and any change to who *can* see a note (this is a client-side view filter over data the RLS-enforced API already returned — no permission model changes).

## Requirements

- [ ] A "Shared with me" row appears in the folder rail, between "All notes" and the user-created folder list, always present (not tied to whether any notes are currently shared).
- [ ] Clicking it shows exactly the notes where the current user is a collaborator (individually or via a prior "select all" share) and is not the author, excluding archived notes.
- [ ] The row highlights as active the same way "All notes"/"Archived" do when selected.
- [ ] An empty state (icon + message) shows when nothing is shared with the current user yet — no primary action (nothing to "create" from this view, matching "No archived notes"'s no-action treatment).
- [ ] Switching to/from this view behaves like switching to/from "Archived" today (no folder-selection side effects, no composer bar).
- [ ] `npx tsc --noEmit` passes with no new errors.

## Out of Scope / Must-Not-Change

- No new table, migration, or API route — purely a client-side filter over already-fetched `NoteRow[]` data.
- No changes to `note_collaborators` RLS, the collaborator picker (`_note-collaborator-picker.tsx`), or any API route.
- No count badge on the new nav row.
- No pinned/others sectioning inside the new view — flat grid only.
- Do not change `_note-editor-modal.tsx`, `_note-rich-text-editor.tsx`, `_note-card.tsx`, `_note-color-picker.tsx`, or any API route — this task touches only the rail/board/tab wiring.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_notes/_note-folder-rail.tsx` | Modify | Extend `NotesView` to include `"shared"`; add the "Shared with me" row + `onSelectShared` prop |
| `src/app/(hub)/projects/_shared/_notes/_notes-board.tsx` | Modify | Add `sharedNotes`/`onSelectShared` props; render the flat-grid "shared" view (same shape as "archived") |
| `src/app/(hub)/projects/_shared/_notes-tab.tsx` | Modify | Compute `sharedNotes` via `useMemo` from the already-loaded `notes` array; wire `onSelectShared` |

## Code Context

### `NotesView` + rail structure to extend (`_note-folder-rail.tsx:9`, `:76-81`, `:173-178`, current post-313 state)

```tsx
export type NotesView = "all" | "archived";
// ...
<div className="w-60 shrink-0 flex flex-col gap-0.5 pr-3 border-r border-[#E2E7F2]">
  <button type="button" onClick={onSelectAll} className={cn(rowBase, view === "all" && !activeFolderId ? rowActive : rowInactive)}>
    <StickyNote size={15} />
    All notes
  </button>
  {folders.map((folder) => ( /* ... */ ))}
  {/* New folder input/button */}
  <div className="h-px bg-[#E2E7F2] my-1.5" />
  <button type="button" onClick={onSelectArchived} className={cn(rowBase, view === "archived" ? rowActive : rowInactive)}>
    <Archive size={15} />
    Archived
  </button>
</div>
```

Change to `export type NotesView = "all" | "archived" | "shared";`, add a new `onSelectShared: () => void` prop, and insert a "Shared with me" row (import `Users` from `lucide-react`, same icon `_note-card.tsx` already uses for the collaborator-count chip) directly after the "All notes" button:

```tsx
<button type="button" onClick={onSelectShared} className={cn(rowBase, view === "shared" ? rowActive : rowInactive)}>
  <Users size={15} />
  Shared with me
</button>
```

### Board rendering to extend (`_notes-board.tsx:95-124`, current post-313 state — note this task also removes the capture-bar icon row, already shipped separately; the `view === "archived" ? ... : (...)` structure below is what matters here)

```tsx
{view === "archived" ? (
  archivedNotes.length === 0 ? (
    <EmptyState icon={ArchiveIcon} label="No archived notes" hint="Notes you archive will show up here." />
  ) : (
    <NoteGrid notes={archivedNotes} {...gridProps} />
  )
) : (
  <>
    {/* Pinned/Others sections for "all" */}
  </>
)}
```

Add a third branch before the final `else`:

```tsx
{view === "archived" ? (
  /* unchanged */
) : view === "shared" ? (
  sharedNotes.length === 0 ? (
    <EmptyState icon={Users} label="No notes shared with you" hint="Notes teammates share with you will show up here." />
  ) : (
    <NoteGrid notes={sharedNotes} {...gridProps} />
  )
) : (
  /* unchanged: Pinned/Others/"All notes" empty state */
)}
```

Add `sharedNotes: NoteRow[]` and `onSelectShared: () => void` to `NotesBoard`'s props, and pass `onSelectShared` through to `NoteFolderRail` alongside the existing `onSelectAll`/`onSelectArchived`.

### `_notes-tab.tsx` — where to compute the filter (`_notes-tab.tsx:50-57`, current post-313 state)

```tsx
const { pinnedNotes, otherNotes, archivedNotes } = useMemo(() => {
  const scoped = notes.filter((n) => !activeFolderId || n.folder_id === activeFolderId);
  return {
    pinnedNotes: scoped.filter((n) => !n.is_archived && n.is_pinned),
    otherNotes: scoped.filter((n) => !n.is_archived && !n.is_pinned),
    archivedNotes: notes.filter((n) => n.is_archived),
  };
}, [notes, activeFolderId]);
```

Add a sibling `useMemo` (or fold into this one, returning a fourth field) computing `sharedNotes` from the full `notes` array (not `scoped`, matching `archivedNotes`'s own folder-agnostic precedent):

```tsx
const sharedNotes = useMemo(
  () => notes.filter((n) => !n.is_archived && n.created_by !== currentUserId && n.collaborators.some((c) => c.user_id === currentUserId)),
  [notes, currentUserId]
);
```

Wire `onSelectShared={() => setView("shared")}` into the `<NotesBoard>` call (`_notes-tab.tsx:188-190`'s sibling `onSelectAll`/`onSelectArchived` handlers), matching `onSelectArchived`'s exact shape (no `activeFolderId` reset, same as that existing handler).

## Implementation Steps

1. In `_note-folder-rail.tsx`: extend `NotesView`, import `Users`, add the `onSelectShared` prop, add the "Shared with me" row between "All notes" and the folder list.
2. In `_notes-board.tsx`: import `Users`, add `sharedNotes`/`onSelectShared` props, add the `view === "shared"` render branch, pass `onSelectShared` through to `NoteFolderRail`.
3. In `_notes-tab.tsx`: add the `sharedNotes` `useMemo`, pass `sharedNotes` and `onSelectShared` into `<NotesBoard>`.
4. Run `npx tsc --noEmit` and `pnpm lint`.
5. Manual browser pass (migration 120/121 must both be applied — 121 was needed to fix the RLS recursion bug found during 313's testing): as one staff account, share a note to a second staff account (individually, and separately via "Select all"); as that second account, open "Shared with me" and confirm the note(s) appear; archive one of the shared notes as the author and confirm it drops out of the second account's "Shared with me"; confirm the second account's own authored notes never appear in their own "Shared with me".

## Acceptance Criteria

- [ ] "Shared with me" row always visible in the rail, positioned between "All notes" and the folder list.
- [ ] Selecting it shows only notes where the current user is a collaborator and not the author, excluding archived notes.
- [ ] Empty state (icon + message, no action button) when nothing is shared with the current user.
- [ ] Active-row highlighting matches "All notes"/"Archived"'s existing visual treatment.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual browser pass (no test runner configured in this repo), migrations 120+121 must be applied:
# - Share a note to a second staff account (both individual-select and "Select all" paths)
# - As that account, click "Shared with me" — confirm the shared note(s) appear, own notes don't
# - Archive a shared note as its author — confirm it disappears from the collaborator's "Shared with me"
# - Unshare a note — confirm it disappears from "Shared with me" for that person
```

## Compatibility Touchpoints

- No DB/RLS/migration/API changes — pure client-side view filter over already-fetched data.
- No changes to any non-Notes file.
- Zoho/MCP/cron surfaces untouched.

## Implementation Notes

### What Changed
- `NotesView` extended from `"all" | "archived"` to `"all" | "archived" | "shared"`.
- New "Shared with me" row added to the folder rail, positioned between "All notes" and the user-created folder list, using the same active/inactive row styling as "All notes"/"Archived".
- `_notes-board.tsx` renders a flat grid (no Pinned/Others split) for the `"shared"` view, with its own empty state, matching the existing "Archived" branch's shape.
- `_notes-tab.tsx` computes `sharedNotes` via `useMemo` from the already-loaded `notes` array: non-archived notes where the current user is a collaborator but not the author. No new fetch.

### Files Changed
- `src/app/(hub)/projects/_shared/_notes/_note-folder-rail.tsx` - extended `NotesView`, added `onSelectShared` prop, added the "Shared with me" row
- `src/app/(hub)/projects/_shared/_notes/_notes-board.tsx` - added `sharedNotes`/`onSelectShared` props, wired through to `NoteFolderRail`, added the `view === "shared"` render branch
- `src/app/(hub)/projects/_shared/_notes-tab.tsx` - added the `sharedNotes` `useMemo`, passed `sharedNotes`/`onSelectShared` into `<NotesBoard>`

### Deviations From Plan
- None — followed the task doc's Code Context and Implementation Steps as written.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 remaining warnings are pre-existing, unrelated, in `onboarding-workspace/_checklist-tab.tsx`, same as tasks 311-313's own runs)
- Manual browser pass - SKIPPED: requires both migration 120 and the 121 RLS-recursion fix applied, plus a second staff account to actually receive a share — same standing setup requirement as prior Notes tasks. File-length check: largest file after changes is `_notes-tab.tsx` at 240 lines, still under the ~250-300 soft-warning threshold.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read all three changed files fresh, independently of the implementation pass. Grepped all three for `console.*`, `TODO`/`FIXME`, and `any`/`as any` — none found.
- Confirmed exactly the three files in the task doc's Proposed File Changes table were touched — no out-of-scope files, no API/DB/migration changes.
- Verified the `sharedNotes` filter logic in `_notes-tab.tsx` against the Requirements: excludes archived notes (`!n.is_archived`), excludes the current user's own notes (`n.created_by !== currentUserId`), includes any note where the user appears in `note.collaborators` regardless of whether they were added individually or via task 313's "Select all" batch-share (the filter only checks membership, not how the row was created — both paths write an identical `note_collaborators` row).
- Verified `onSelectShared` matches "Archived"'s existing handler shape exactly (`() => setView("shared")`, no `activeFolderId` reset) — consistent with the task doc's explicit "ignores the active folder filter" scope decision, and confirmed `sharedNotes` (like `archivedNotes`) is derived from the full `notes` array, not the folder-scoped `scoped` array, so switching folders elsewhere in the rail can't hide shared notes.
- Verified the new nav row's active-state styling (`rowActive`/`rowInactive` via the existing `cn()` helper) matches "All notes"/"Archived" exactly — same `rowBase` class, same conditional.
- Made one small in-gate fix: `_note-folder-rail.tsx`'s top-of-file doc comment (task 311-era) still only described "All notes, one row per folder..., Archived" and didn't mention the new built-in row — added a one-line Task 314 addendum so the comment stays accurate for future readers. No functional change.
- File-length guideline check: largest file after changes is `_notes-tab.tsx` at 240 lines, still under the ~250-300 soft-warning threshold.
- Re-ran `npx tsc --noEmit` and `pnpm lint` fresh after the comment fix — both clean (lint's 2 warnings are the same pre-existing, unrelated `onboarding-workspace/_checklist-tab.tsx` warnings noted in tasks 311-313's own gates).

### Deviations
- Minor: the doc-comment accuracy fix noted above (no behavior change).
- No other deviations from the task doc's Requirements, Code Context, Out-of-Scope boundaries, or Implementation Steps.

### Required Fixes
- None.

## Completion Note (2026-08-26)

Marked Completed at the user's explicit request. Code is finished and verified by inspection/`tsc`/`lint`. Migration 120 is applied on the remote database; migration 121 (task 311's RLS-recursion fix, a prerequisite for any Notes API call to succeed) is written but not yet applied. Live browser verification of the "Shared with me" nav item was not run — apply migration 121 first, then exercise this doc's own Verification checklist above with a second staff account (share a note, confirm it appears in that account's "Shared with me").
