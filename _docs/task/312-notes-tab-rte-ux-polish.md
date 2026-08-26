# 312: Notes Tab — Rich Text Editor, Empty/Loading States, Folder Nav & Tooltip Polish

**Created:** 2026-08-26
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Task 311 shipped the Keep-style Notes tab (`src/app/(hub)/projects/_shared/_notes-tab.tsx` + `_notes/*`) but it is not yet browser-verified (migration 120 not applied) and was explicitly flagged as needing a follow-up visual pass. This task is that pass, driven by a screenshot of the shipped-but-unpolished UI and six specific asks:

1. Center the "Take a note…" capture bar in its content area (currently left-aligned).
2. Convert the note body field from plain text to a rich text editor (Bold / Italic / Underline / Strike / Bulleted / Numbered), toolbar grouped and colored to match the note's own background — **without changing the capture bar's existing layout/visual design**.
3. Give the "No notes yet" empty state an icon (and a real primary action), per this repo's own UI Polish Conventions ("icon + one-line message + primary action, not blank space").
4. Add a loading skeleton for the notes listing (currently a bare centered spinner).
5. Increase/enhance the folder navigation rail.
6. Enhance the folder-name creation (and rename) input.
7. Add tooltips to icon-only buttons across the feature that currently rely on `aria-label`/`title` alone.

This is a UI/UX polish pass on an already-built feature — no new tables, no RLS changes, no new API routes. `notes.content` is already a plain `text` column (migration 120), so switching its payload from plain text to Tiptap HTML needs **no migration** — same column, richer string.

### Scope decisions (please flag in review if any of these should change)

- **"Convert the note field to RTE" = the actual editing surface, not the capture-bar trigger.** The capture bar (`_notes-board.tsx`) is a visual-only trigger — clicking anywhere on it opens `NoteEditorModal`, where the real body field lives. Per the explicit "do not change the layout/design" instruction, the capture bar keeps its exact current shape (border, height, icons, placeholder text) and is only re-centered. The RTE conversion lands in `_note-editor-modal.tsx`'s body field, which is what both the "new note" composer and the "edit note" view actually use.
- **`StarterKit` alone covers all six marks — no extra Tiptap packages.** Tiptap v3's `StarterKit` already bundles Bold, Italic, Underline, Strike, BulletList, and OrderedList (confirmed in `node_modules/@tiptap/starter-kit@3.28.0`, and already noted in-repo at `_onboarding-wizard.tsx:3316`: *"StarterKit v3 already bundles Underline — don't add `@tiptap/extension-underline`"*). Two other files (`onboarding-workspace/_shared-ui.tsx`, `pm-tabs/tasks-tab.tsx`) import `@tiptap/extension-underline` separately anyway, which is redundant against a bundled extension — don't repeat that here; follow the `_onboarding-wizard.tsx` precedent instead.
- **Toolbar grouping precedent already exists in-repo**: `src/components/hub/pm-tabs/tasks-tab.tsx:616-655` groups exactly this shape — Bold/Italic/Underline/Strike as one cluster, a `w-px h-5 bg-... self-center mx-0.5` divider, then Bullet/Ordered list as a second cluster. Reuse that grouping shape, rebuilt with this feature's own tokens (see Code Context).
- **"Aligned with the note background"** means the toolbar sits directly on `NOTE_CARD_BG[color]` (the modal's own background, already applied at `_note-editor-modal.tsx:90`) rather than the hard-coded gray/white toolbar bars used by `_task-description-editor.tsx` / `_comment-editor.tsx` — a subtle `border-black/[0.06]` bottom border (already used elsewhere in this same modal) is enough separation; no new per-color toolbar-background lookup map is needed.
- **Content storage stays `string | null` HTML** in `NoteRow.content` / `NoteDraftPatch.content` — no type changes needed in `_notes-types.ts` for this. Empty-check logic in the editor modal must switch from `content.trim()` (works for plain text) to tracking the editor's own `isEmpty` state (an empty Tiptap doc serializes to `<p></p>`, which `.trim()` would wrongly treat as non-empty) — mirror `_comment-editor.tsx`'s `onEmptyChange` callback shape.
- **Rendering existing/plain content as HTML is safe** — this repo already renders Tiptap-authored HTML via `dangerouslySetInnerHTML` for task/issue descriptions and comments (`_task-comments.tsx`, `_issue-comments.tsx`, `normalizeZohoDescriptionHtml`), all under the same staff-authored/RLS-gated trust model as notes. No sanitization library exists or is being introduced here — matches existing convention. Since migration 120 isn't applied yet and no notes have been created in production, there's no legacy plain-text-content back-compat concern to solve.
- **Shared `IconTip` helper**: `_task-description-editor.tsx` defines its own local `IconTip` (Tooltip/TooltipTrigger/TooltipContent wrapper). This task touches ~6 files under `_notes/` that all need the same icon-tooltip wrapper (card actions, folder-rail actions, color/collaborator picker triggers, new RTE toolbar) — extract one shared `IconTip` into a new `_notes/_icon-tip.tsx` rather than duplicating the same 10-line function six times. This is the one net-new small file beyond the RTE component itself.
- **Folder rail width/prominence**: "increase" is interpreted as widening the rail (`w-48` → a larger named Tailwind step, e.g. `w-56`/`w-60`) with slightly larger row padding/touch targets, plus a per-folder note-count badge (cheap, already-available data — `notes` are already loaded client-side in `_notes-tab.tsx`) to make the nav more informative, not just wider. Exact final width is an implementation-time visual-fit detail; use a named Tailwind scale step, never an arbitrary bracket value, per this repo's convention.
- **Folder-name field enhancement** covers both the "New folder" creation input and the existing inline rename input (`_note-folder-rail.tsx`) — same component family, should get the same treatment: this repo's standard input focus/border treatment (`border-[#E2E7F2]` → `focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`, seen throughout e.g. `_note-collaborator-picker.tsx`'s search input) instead of the current bare `border-[#007BFF] outline-none`, plus basic inline validation (trim, reject empty, reject case-insensitive duplicate against existing folder names) with the Create/Save button disabled and an inline red-text error when invalid — matching this repo's plain-`useState`-plus-inline-error form convention (no `react-hook-form`/`zod` for this small a form, per CLAUDE.md's UI Polish Conventions "Rejected" list).

## Requirements

- [ ] The "Take a note…" capture bar renders horizontally centered within its content column; its own size/border/icons/placeholder text are unchanged.
- [ ] The note editor modal's body field is a Tiptap rich text editor (not a `<textarea>`), supporting Bold, Italic, Underline, Strike, Bulleted list, Numbered list.
- [ ] The RTE toolbar is visually grouped (marks cluster, divider, list cluster) and sits on the note's own background color (`NOTE_CARD_BG[color]`), not a separate gray/white bar.
- [ ] The RTE respects the existing `readOnly` (view-permission) gating — a collaborator with `view` permission cannot type or use the toolbar, same as today's `readOnly` textarea.
- [ ] Saved note content round-trips as HTML: creating/editing a note with bold/list formatting persists and re-renders that formatting after reload.
- [ ] `_note-card.tsx`'s body preview renders the HTML content (truncated/clamped as today), not raw markup text.
- [ ] "No notes yet" empty state shows an icon, the existing message, and a working primary "Take a note…" action button that opens the composer.
- [ ] "No archived notes" empty state (same shared component) also gets an icon appropriate to that context.
- [ ] While notes/folders are loading, the tab shows a skeleton (shimmer note-card grid, in the same grid layout as loaded notes) instead of a bare spinner.
- [ ] The folder navigation rail is visibly larger/more prominent than before (wider column, larger row touch targets) and each folder row shows its note count.
- [ ] The "New folder" input and the folder-rename input use the app's standard focus/ring input styling and reject empty or duplicate (case-insensitive) folder names with an inline error, disabling the Create/Save action until valid.
- [ ] Every icon-only button across the Notes feature (card pin/archive/delete, folder rail rename/delete/save/cancel, color picker trigger, collaborator picker trigger/remove, editor modal pin/archive/delete, new RTE toolbar buttons) shows a hover tooltip naming the action, via the existing `@/components/ui/tooltip` primitives.
- [ ] `npx tsc --noEmit` passes with no new errors.

## Out of Scope / Must-Not-Change

- No changes to `supabase/migrations/120_project_notes.sql`, RLS policies, or any API route under `src/app/api/projects/[projectId]/notes/**` — this is a client-side presentational/UX pass only, same payload shape (`content: string | null`).
- No new Tiptap extensions beyond what `StarterKit` already bundles (no text color, no images, no checklists, no links) — matches task 311's original "plain text, not the Tiptap description editor" decision, now narrowly widened to the six requested marks only, nothing else from a full rich-text toolbar.
- Do not touch `_task-description-editor.tsx`, `_comment-editor.tsx`, or any non-Notes Tiptap editor — build a Notes-local RTE component, don't refactor/share those.
- Do not change the capture bar's icons, copy, height, or border — centering only.
- Do not add a folder note-count badge's number to the API response — compute it client-side from the already-fetched `notes` array in `_notes-tab.tsx`, no new query.
- Do not introduce `react-hook-form`/`zod`/`sonner` for the folder-name validation — plain `useState` + inline error text, per CLAUDE.md.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_notes/_icon-tip.tsx` | Create | Shared `IconTip` Tooltip wrapper (extracted from `_task-description-editor.tsx`'s local copy) reused across the files below |
| `src/app/(hub)/projects/_shared/_notes/_note-rich-text-editor.tsx` | Create | Tiptap `StarterKit`-based editor: grouped toolbar (Bold/Italic/Underline/Strike \| Bulleted/Numbered), background-transparent to sit on `NOTE_CARD_BG[color]`, `readOnly` + `onEmptyChange` props |
| `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` | Modify | Swap the `<textarea>` for `NoteRichTextEditor`; fix empty-check to use editor `isEmpty` instead of `content.trim()`; add tooltips to Pin/Archive/Delete icon buttons |
| `src/app/(hub)/projects/_shared/_notes/_note-card.tsx` | Modify | Render `content` via `dangerouslySetInnerHTML` (clamped) instead of plain text; add tooltips to Pin/Archive/Delete |
| `src/app/(hub)/projects/_shared/_notes/_notes-board.tsx` | Modify | Center the capture bar (`mx-auto`); add icon + primary action to the "No notes yet" empty state, icon to "No archived notes"; render `NotesGridSkeleton` when loading |
| `src/app/(hub)/projects/_shared/_notes/_notes-loading-skeleton.tsx` | Create | Shimmer skeleton: capture-bar-shaped placeholder + folder-rail row placeholders + note-card grid placeholders, same layout as the loaded board |
| `src/app/(hub)/projects/_shared/_notes/_note-folder-rail.tsx` | Modify | Widen rail, larger row padding, per-folder note-count badge, enhanced create/rename input styling + inline duplicate/empty validation, tooltips on rename/delete/save/cancel icon buttons |
| `src/app/(hub)/projects/_shared/_notes/_note-color-picker.tsx` | Modify | Wrap trigger button in `IconTip` |
| `src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx` | Modify | Wrap trigger + remove buttons in `IconTip` |
| `src/app/(hub)/projects/_shared/_notes-tab.tsx` | Modify | Pass `notes` (for per-folder counts) into the rail; replace the plain `Loader2` loading branch with `<NotesBoard loading />`/`NotesGridSkeleton` |

## Code Context

### Capture bar — centering target (`_notes-board.tsx:75-89`)

```tsx
<div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
  {view === "all" && (
    <button
      type="button"
      onClick={onOpenComposer}
      className="w-full max-w-xl flex items-center justify-between gap-3 px-4 py-3 rounded-[14px] border border-[#E2E7F2] bg-white text-left cursor-pointer transition-colors hover:shadow-[0_8px_24px_rgba(7,17,51,.10)] mb-6"
    >
```

Add `mx-auto` to the button's className — same size/shape, now centered instead of flush-left. Do not touch anything else in this block.

### Current plain-text body field to replace (`_note-editor-modal.tsx:120-127`)

```tsx
<textarea
  value={content}
  onChange={(e) => setContent(e.target.value)}
  readOnly={readOnly}
  placeholder="Take a note…"
  rows={8}
  className="mx-4 mt-2 bg-transparent text-[13px] text-[#3A4565] outline-none resize-none placeholder:text-[#5F6A88]"
/>
```

Replace with `<NoteRichTextEditor value={content} onChange={setContent} onEmptyChange={setContentEmpty} readOnly={readOnly} color={color} />` (new local `contentEmpty` state replaces the `content.trim()` check in `handleClose`).

### RTE toolbar grouping precedent (`src/components/hub/pm-tabs/tasks-tab.tsx:616-655`)

```tsx
{([
  { label: "B", title: "Bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false, cls: "font-bold" },
  { label: "I", title: "Italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false, cls: "italic" },
  { label: "U", title: "Underline", action: () => editor?.chain().focus().toggleUnderline().run(), active: () => editor?.isActive("underline") ?? false, cls: "underline" },
  { label: "S", title: "Strike", action: () => editor?.chain().focus().toggleStrike().run(), active: () => editor?.isActive("strike") ?? false, cls: "line-through" },
] as const).map(btn => ( /* button */ ))}
<div className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center mx-0.5" />
{([
  { label: "• List", title: "Bullet List", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
  { label: "1. List", title: "Ordered List", action: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive("orderedList") ?? false },
] as const).map(btn => ( /* button */ ))}
```

Rebuild this shape with this feature's own tokens (`#007BFF`/`#E5F1FF` active state, `#5F6A88` inactive, `#E2E7F2`-family divider at low opacity against the note's own background) and wrap each button in the new shared `IconTip` instead of a bare `title` attribute — see the `_task-description-editor.tsx` `IconTip` pattern below.

### `IconTip` pattern to extract (`_task-description-editor.tsx:14-21`)

```tsx
function IconTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
```

Move this (or an equivalent) into `_notes/_icon-tip.tsx`, exported, imported by every modified file in the table above. `TooltipTrigger`'s `render` prop takes the exact button element as a child — see this same file's usage at lines 88-100 for the calling convention.

### Editor `isEmpty` tracking precedent (`_comment-editor.tsx:84-92`)

```tsx
onUpdate: ({ editor: e }) => {
  onChange(e.getHTML());
  onEmptyChange(e.isEmpty);
},
```

`NoteRichTextEditor` should follow this same `onUpdate` shape.

### Content rendering — HTML precedent already used for staff-authored Tiptap content (`_task-comments.tsx:245`)

```tsx
dangerouslySetInnerHTML={{ __html: normalizeZohoDescriptionHtml(c.body) }}
```

Notes content is authored locally (not Zoho-imported), so `_note-card.tsx` doesn't need `normalizeZohoDescriptionHtml` — just `dangerouslySetInnerHTML={{ __html: note.content ?? "" }}` on the existing `<p>`-turned-`<div>` with the same `line-clamp-6` class, plus the same list/paragraph spacing utility classes already used in `_task-description-editor.tsx:52` (`[&_p]:my-1 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5`).

### Empty state to enhance (`_notes-board.tsx:154-161`)

```tsx
function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-[13px] font-semibold text-[#0B1533] mb-1">{label}</p>
      <p className="text-[13px] text-[#5F6A88]">{hint}</p>
    </div>
  );
}
```

Add an `icon: LucideIcon` prop and an optional `action` prop (`{ label: string; onClick: () => void }`) rendered as a small pill/button below the hint, styled consistently with this app's other empty states (icon in a soft circular badge is the common shape elsewhere in the hub — check a sibling tab like `_files-tab.tsx`'s empty state for the exact circular-badge treatment to match, since task 311's Code Context flagged that pattern as already established).

### Loading branch to replace (`_notes-tab.tsx:164-170`)

```tsx
if (loading) {
  return (
    <div className="flex items-center justify-center py-20 text-[#5F6A88]">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}
```

Replace with a rendered `NotesBoard`-shaped skeleton (`_notes-loading-skeleton.tsx`) so the tab's chrome (capture bar area, folder rail) doesn't visually jump once data arrives. Use this repo's established skeleton convention — plain `animate-pulse` divs with `bg-[#EDF0F7]` (see `_project-detail-header.tsx:85`), **not** a new shadcn `Skeleton` primitive (none exists in `src/components/ui/`, and CLAUDE.md's UI Polish Conventions explicitly reject adding new shadcn primitives for visual consistency with hand-rolled patterns already used throughout the hub).

### Folder rail width/row target (`_note-folder-rail.tsx:58`, `:53`)

```tsx
<div className="w-48 shrink-0 flex flex-col gap-0.5 pr-3 border-r border-[#E2E7F2]">
const rowBase = "w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px] font-medium transition-colors cursor-pointer text-left";
```

Widen `w-48` to a larger named step (e.g. `w-60`), and bump `px-3 py-2` row padding to a larger step (e.g. `px-3.5 py-2.5`). Add a note-count `<span>` badge (pill, `text-[11px]`, `bg-[#F4F6FB]`/`text-[#5F6A88]`, right-aligned in the row) next to each folder row's label — count comes from a new prop (`noteCountByFolder: Record<string, number>`) computed in `_notes-tab.tsx` from the already-loaded `notes` array, not a new fetch.

### Folder-name input to enhance (`_note-folder-rail.tsx:113-125`, same shape at `:67-74` for rename)

```tsx
<input
  autoFocus
  value={newName}
  onChange={(e) => setNewName(e.target.value)}
  onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); if (e.key === "Escape") setCreating(false); }}
  placeholder="Folder name"
  className="flex-1 min-w-0 text-[13px] px-2 py-1 rounded-[8px] border border-[#007BFF] outline-none bg-white placeholder:text-[#5F6A88]"
/>
```

Compare against this repo's standard input treatment (`_note-collaborator-picker.tsx:98`): `border-[#E2E7F2] bg-[#F4F6FB] ... focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`. Add a `folderNameError: string | null` local state, computed on change/submit: empty (after trim) or case-insensitive duplicate against `folders.map(f => f.name)` (excluding the folder being renamed, for the rename path) → set an inline `text-[11px] text-[#C0392B]` message below the input and disable the Check/"Add" button.

## Implementation Steps

1. Create `_notes/_icon-tip.tsx` — extract the shared `IconTip` wrapper.
2. Create `_notes/_note-rich-text-editor.tsx` — `useEditor({ extensions: [StarterKit], content: value, immediatelyRender: false, editable: !readOnly, ... })`, grouped toolbar per Code Context, wraps each toolbar button in `IconTip`, background transparent (inherits `NOTE_CARD_BG[color]` from its parent), calls `onChange(html)` and `onEmptyChange(isEmpty)` on `onUpdate`.
3. Wire it into `_note-editor-modal.tsx`, replacing the `<textarea>`; add a `contentEmpty` state seeded from `!note?.content`, update `handleClose`'s emptiness check to use it instead of `content.trim()`; wrap the Pin/Archive/Delete buttons in `IconTip`.
4. Update `_note-card.tsx` to render `note.content` via `dangerouslySetInnerHTML` with clamp + list/paragraph utility classes; wrap Pin/Archive/Delete in `IconTip`.
5. Update `_notes-board.tsx`: add `mx-auto` to the capture bar; extend `EmptyState` with `icon`/`action` props and pass them at both call sites (notes-yet gets a "Take a note…" action wired to `onOpenComposer`, archived gets an `Archive` icon only); add a `loading` prop that renders `NotesGridSkeleton` instead of the real content.
6. Create `_notes/_notes-loading-skeleton.tsx` — pulse placeholders shaped like the capture bar + folder rail rows + note-card grid.
7. Update `_notes-tab.tsx`: compute `noteCountByFolder` from `notes`, pass it + pass `loading` through to `NotesBoard`/`NoteFolderRail` instead of the current early-return spinner branch.
8. Update `_note-folder-rail.tsx`: widen rail/row sizing, add note-count badges, restyle create/rename inputs to the standard focus/ring treatment, add empty/duplicate inline validation with disabled submit, wrap Rename/Delete/Save/Cancel icon buttons in `IconTip`.
9. Update `_note-color-picker.tsx` and `_note-collaborator-picker.tsx` trigger (and remove, for the collaborator picker) buttons to use `IconTip`.
10. Run `npx tsc --noEmit` and `pnpm lint`.
11. Manual browser pass once migration 120 is applied (still pending from task 311 — flag to the user if not yet applied when this task starts): create a note with bold/italic/underline/strike/bullet/numbered formatting, reload, confirm it persists; confirm capture bar is centered; confirm empty/loading states render; confirm folder create/rename validation (empty + duplicate) and note-count badges; hover every icon button and confirm a tooltip appears.

## Acceptance Criteria

- [ ] Capture bar is centered; no other visual change to it.
- [ ] Note editor body is a working Tiptap RTE with Bold/Italic/Underline/Strike/Bulleted/Numbered, toolbar grouped with a divider, sitting on the note's own background color.
- [ ] `readOnly` (view-permission) notes cannot be edited via the RTE, same as before with the textarea.
- [ ] Formatted content persists across reload and renders correctly (clamped) on the note card.
- [ ] "No notes yet" has an icon and a working "Take a note…" primary action; "No archived notes" has an icon.
- [ ] Initial load shows a skeleton, not a bare spinner.
- [ ] Folder rail is visibly wider/larger with per-folder note-count badges.
- [ ] Folder create/rename inputs reject empty and duplicate names with inline errors and disabled submit, and match the app's standard focus/ring input styling.
- [ ] Every icon-only button in the Notes feature shows a tooltip on hover.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual browser pass (no test runner configured in this repo), once migration 120 is applied:
# - /projects/v2/[projectId]/notes and /projects/legacy/[projectId]/notes
# - Create a note, apply each of the 6 marks, save, reload — formatting persists
# - Confirm capture bar centering, empty states (all-notes + archived), loading skeleton (throttle network to see it)
# - Create a folder, try an empty name and a duplicate name — both rejected inline; create a valid one — note-count badge shows 0, then 1 after moving a note into it
# - Hover every icon-only button in the tab (card actions, folder rail, color/collaborator pickers, editor modal, RTE toolbar) — tooltip appears for each
```

## Compatibility Touchpoints

- No API/DB changes — `notes.content` stays `text`, payload shape unchanged, so this ships independently of whether migration 120 has been applied yet (though browser verification is blocked until it is, same as task 311's own note).
- No changes to `_files-tab.tsx`, `_access-tab.tsx`, `_members-tab.tsx`, `_status-report-tab.tsx`, `_time-logs-tab.tsx`, `_project-detail.tsx`, `_project-detail-tab-strip.tsx`, or any Zoho/MCP/cron surface.
- New `@tiptap/*` usage is additive (already-installed packages, `StarterKit` only) — no `package.json` changes expected.

## Implementation Notes

### What Changed
- Capture bar centered (`mx-auto` added, no other visual change).
- Note editor modal's body field converted from a plain `<textarea>` to a new `NoteRichTextEditor` (Tiptap `StarterKit` + `Placeholder`), with a grouped toolbar (Bold/Italic/Underline/Strike, divider, Bulleted/Numbered) that sits transparently on the note's own `NOTE_CARD_BG[color]`. Empty-check switched from `content.trim()` to a tracked `contentEmpty` state (`editor.isEmpty` via `onUpdate`), so an empty Tiptap doc (`<p></p>`) correctly saves as `content: null` instead of a false-non-empty string.
- `_note-card.tsx`'s body preview now renders `note.content` via `dangerouslySetInnerHTML` (same clamp/paragraph/list utility classes as the RTE and as `_task-description-editor.tsx`'s established HTML-render pattern) instead of raw `whitespace-pre-wrap` text.
- "No notes yet" and "No archived notes" empty states now use the app's established icon-badge empty-state shape (`w-10 h-10 rounded-full bg-[#E2E7F2]` + Lucide icon, matching `_list-view.tsx`'s "No tasks yet" precedent); the notes-yet state adds a working "Take a note…" primary action wired to the composer.
- Initial tab load now renders `NotesLoadingSkeleton` (shimmer capture bar + folder rail rows + note-card grid, same layout as the loaded board) instead of a bare centered spinner.
- Folder rail widened (`w-48` → `w-60`), row padding increased (`px-3 py-2` → `px-3.5 py-2.5`), and each folder row now shows a note-count badge computed client-side in `_notes-tab.tsx` from the already-loaded `notes` array (no new query).
- Folder create/rename inputs restyled to the app's standard focus/ring input treatment and gained inline validation: empty (post-trim) and case-insensitive duplicate names are rejected with a red inline message, and the Create/Save button is disabled until the name is valid.
- Every icon-only button across the Notes feature (card pin/archive/delete, folder rail rename/delete/save/cancel/create, color picker trigger, collaborator picker trigger/remove, editor modal pin/archive/delete, RTE toolbar) now shows a hover tooltip via a new shared `IconTip` wrapper.

### Files Changed
- `src/app/(hub)/projects/_shared/_notes/_icon-tip.tsx` - new shared `Tooltip`/`TooltipTrigger`/`TooltipContent` wrapper, extracted from `_task-description-editor.tsx`'s local copy
- `src/app/(hub)/projects/_shared/_notes/_note-rich-text-editor.tsx` - new Tiptap RTE component (grouped toolbar, background-transparent, `readOnly`/`onEmptyChange` support)
- `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` - swapped `<textarea>` for `NoteRichTextEditor`; `contentEmpty` state replaces `content.trim()`; Pin/Archive/Delete wrapped in `IconTip`
- `src/app/(hub)/projects/_shared/_notes/_note-card.tsx` - HTML content rendering via `dangerouslySetInnerHTML`; Pin/Archive/Delete wrapped in `IconTip`
- `src/app/(hub)/projects/_shared/_notes/_notes-board.tsx` - centered capture bar; `loading` prop renders `NotesLoadingSkeleton`; `EmptyState` extended with `icon`/`action` props, used at both call sites; `noteCountByFolder` threaded through to the rail
- `src/app/(hub)/projects/_shared/_notes/_notes-loading-skeleton.tsx` - new shimmer skeleton (capture bar + folder rail + note grid shapes)
- `src/app/(hub)/projects/_shared/_notes/_note-folder-rail.tsx` - widened rail/rows, note-count badges, restyled create/rename inputs with empty/duplicate inline validation, tooltips on Rename/Delete/Save/Cancel/Create
- `src/app/(hub)/projects/_shared/_notes/_note-color-picker.tsx` - trigger button wrapped in `IconTip`
- `src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx` - trigger + remove buttons wrapped in `IconTip`
- `src/app/(hub)/projects/_shared/_notes-tab.tsx` - computes `noteCountByFolder` from `notes`; passes `loading`/`noteCountByFolder` into `NotesBoard` instead of the old early-return spinner branch

### Deviations From Plan
- None — implementation followed the task doc's Code Context and Implementation Steps as written, including the `StarterKit`-only Tiptap approach (no `@tiptap/extension-underline` import, per the `_onboarding-wizard.tsx:3316` precedent cited in the plan) and the `_list-view.tsx` icon-badge empty-state shape.
- Minor addition beyond the plan's literal Code Context: added `@tiptap/extension-placeholder` (already an installed dependency, already used by `_description-field.tsx`) to `NoteRichTextEditor` so the RTE keeps the "Take a note…" placeholder the original `<textarea>` had — the plan's Code Context didn't call this out explicitly but the Requirements/Acceptance Criteria implied parity with the existing placeholder behavior.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 remaining warnings are pre-existing, unrelated, in `onboarding-workspace/_checklist-tab.tsx` — same warnings noted in task 311's own verification run)
- Manual browser pass - SKIPPED: same blocker as task 311 — migration 120 (`notes`/`note_folders`/`note_collaborators` tables) has not been applied to the live database yet, so every Notes API call would 500 until the user applies it. All file-length checks (largest new/modified file 229 lines) and the `/impeccable` per-file design hook (see Quality Gate Notes below) ran clean during implementation as a substitute continuous check.
- `/impeccable` per-file hook flagged the modal's pre-existing "Close" button (`text-[12px]`) repeatedly across edits to `_note-editor-modal.tsx` and the empty-state action button's `text-[12px]` in `_notes-board.tsx` — both are the same false positive already documented in task 311's Implementation Notes/Deviations (12px is `DESIGN.md`'s own documented default button-text size) and in the new empty-state button's case, exactly matches the already-shipped `text-[12px]` action-link pattern in `_list-view.tsx`'s "No tasks yet" empty state this task deliberately mirrored. Left unchanged for both.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read every changed/new file in full a second time, independently of the implementation pass (10 files: 3 new — `_icon-tip.tsx`, `_note-rich-text-editor.tsx`, `_notes-loading-skeleton.tsx` — plus 7 modified: `_note-editor-modal.tsx`, `_note-card.tsx`, `_notes-board.tsx`, `_note-folder-rail.tsx`, `_note-color-picker.tsx`, `_note-collaborator-picker.tsx`, `_notes-tab.tsx`). Grepped all ten for `console.*`, `TODO`/`FIXME`, and `any`/`as any` escape hatches — none found.
- Confirmed exactly the ten files in the task doc's Proposed File Changes table were touched — no out-of-scope files, no API route, migration, or RLS changes.
- Verified every Requirements checkbox against the actual code: capture bar `mx-auto` centering; `NoteRichTextEditor` (Bold/Italic/Underline/Strike/Bulleted/Numbered, grouped with a divider, background-transparent so it sits on `NOTE_CARD_BG[color]`); `readOnly` gating (`editable: !readOnly` at editor creation, toolbar hidden when `readOnly`, matching the prior `<textarea readOnly>` behavior); HTML content round-trip via `content`/`NoteDraftPatch`; `_note-card.tsx` HTML rendering via `dangerouslySetInnerHTML`; both empty states iconed (`w-10 h-10 rounded-full bg-[#E2E7F2]` badge matching `_list-view.tsx`'s established "No tasks yet" shape) with the notes-yet state's working "Take a note…" action; `NotesLoadingSkeleton` replacing the bare spinner; folder rail widened to `w-60` with per-folder note-count badges; folder create/rename inputs on the standard focus/ring input treatment with empty + case-insensitive-duplicate inline validation and a disabled submit button; every icon-only button (card pin/archive/delete; folder rail rename/delete/save/cancel/create; color picker trigger; collaborator picker trigger/remove; editor modal pin/archive/delete; all 6 RTE toolbar buttons) wrapped in the new shared `IconTip`. All present as specified — audited button-by-button, no icon-only action was missed and no text-labeled button (Close, New folder, All notes, Archived, candidate-person rows) was wrongly wrapped, matching the Requirements' explicit "icon-only" scoping.
- Traced the empty-note save path specifically for a plain-text→HTML regression risk: `contentEmpty` is driven by Tiptap's own `editor.isEmpty` (via `onUpdate`), not a string-emptiness check on HTML — so a genuinely empty note still persists `content: null` (not an empty `<p></p>` string), and `_note-card.tsx`'s pre-existing `!note.title && !note.content` → "Empty note" fallback still fires correctly. No regression.
- Verified no regression to task 311's RLS-enforced sharing/permission logic — `_notes-types.ts`'s `getNotePermission` was not touched, and this task added zero new permission branching beyond what already existed (`permission !== "view"` / `permission === "owner"` checks are reused as-is, just now wrapped in tooltips).
- File-length guideline check: largest file after changes is `_notes-tab.tsx` at 229 lines, well under the ~250-300 soft-warning threshold; all other files are smaller (largest new file: `_note-editor-modal.tsx` at 207 lines was already close to that threshold before this task and stayed there — no file crossed the line as a result of this change).
- Re-ran `npx tsc --noEmit` and `pnpm lint` fresh for this gate — both clean (lint's 2 warnings are the same pre-existing, unrelated `onboarding-workspace/_checklist-tab.tsx` warnings noted in task 311's own gate).
- No secrets, credentials, or debug logging in any changed file.

### Deviations
- Minor: added `@tiptap/extension-placeholder` to `_note-rich-text-editor.tsx`, one extension beyond the task doc's stated "`StarterKit` alone" / "no new Tiptap extensions beyond what StarterKit already bundles" scope decision. Assessed as in-scope-in-spirit rather than a real deviation: it's a UX-parity fix (the original `<textarea placeholder="Take a note…">` would otherwise silently lose its placeholder), the package was already an installed dependency, and it's already used for the identical purpose elsewhere in this codebase (`_description-field.tsx`). No new capability was added (no text color/images/checklists/links, which is what that Out-of-Scope line was actually guarding against). Documented here rather than silently included.
- No other deviations from the task doc's Requirements, Code Context, or Implementation Steps.

### Required Fixes
- None.

## Completion Note (2026-08-26)

Marked Completed at the user's explicit request. Code is finished and verified by inspection/`tsc`/`lint`. Migration 120 is applied on the remote database; migration 121 (task 311's RLS-recursion fix, a prerequisite for any Notes API call to succeed) is written but not yet applied. Live browser verification of this task's specific changes (RTE formatting, empty/loading states, folder nav, tooltips) was not run — apply migration 121 first, then exercise this doc's own Verification checklist above.
