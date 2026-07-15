# 149: Onboarding Wizard — Drag-and-Drop Multi-File Upload

**Created:** 2026-07-14
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Every file-upload surface in the internal Onboarding Wizard
(`src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx`) is click-to-browse,
single-file-at-a-time. Two shared building-block components render every step's upload UI:

- `FileUploadBox` (lines 2423-2487) — used by Kickoff/Business Facts (line 1665), Outcome
  Target (130), Migration Checklist (131), Content Map (132), and Client Sign-Off (135), plus
  the generic Storage/KB "Add file" action (`handleUpload`).
- `HtmlMockupFileList` (lines 3989-4063) — used by the HTML Mockup step (133); same pattern
  plus an extra Edit action for HTML/Markdown files.

Both already render a working per-file **Remove** button (`onRemove`, `Trash2` icon) and
already `.map()` over a `files: AssetRow[]` array — so the multi-file *display* scaffolding
exists. What's missing on both is: (1) drag-and-drop onto the upload zone, and (2) selecting
more than one file at once via the file picker. The underlying `<input type="file">` has
neither `multiple` nor any `onDrop` handler (lines 2436, 4003).

Note: this wizard's uploads do **not** go through `src/hooks/use-file-upload.ts` /
`/api/upload` (that pair belongs to the separate, older public customer-facing onboarding
form at `src/components/onboarding/file-upload.tsx`, out of scope here — see below). Every
wizard step instead has its own near-identical two-request handler
(`handle*Upload(file: File)`, e.g. `handleBusinessFactsUpload` at line 696,
`handleOutcomeFileUpload` at 758, and five more like them): `POST
/api/customers/[customerId]/assets/upload` (raw file → Storage) followed by `POST
/api/customers/[customerId]/assets` (create the DB asset record), then append the result to
local state. Each handler already accepts one `File` and is called once per upload.

Because every `handle*Upload` already takes a single `File` and appends to state via a
functional `setState` update, the cleanest fix is entirely inside `FileUploadBox`/
`HtmlMockupFileList` themselves: add `multiple` to the file input and an `onDrop` handler,
and call the existing `onFile(file)` prop once per selected/dropped file — no changes needed
to any of the ~7 call sites' upload handlers or to the upload API route.

## Requirements

- [ ] `FileUploadBox`'s and `HtmlMockupFileList`'s upload zone accepts multiple files at once,
      both via the file picker (`<input multiple>`) and via drag-and-drop onto the dashed
      drop zone.
- [ ] Dropping/selecting N files triggers N independent upload calls (existing `onFile`
      callback, once per file) — each still succeeds/fails independently; one bad file (wrong
      type, too large) doesn't block the others from uploading.
- [ ] Visual drag-over state on the drop zone (border/background highlight while a file is
      dragged over it), matching the existing in-repo pattern at
      `src/components/hub/pm-tabs/tasks-tab.tsx:665-670` (`isDragOver` state,
      `onDragOver`/`onDragLeave`/`onDrop`).
- [ ] Existing Remove button behavior is unchanged (already implemented on both components —
      no regression).
- [ ] Non-file drags (e.g. dragging selected text) don't trigger the upload flow — only
      `DataTransfer.files` with actual `File` entries.
- [ ] `disabled` state (already a prop on both components, used for read-only PM view per task
      146) suppresses both the file input and drop handling exactly as it already suppresses
      click-to-browse.

## Out of Scope / Must-Not-Change

- Do not touch `src/hooks/use-file-upload.ts` or `/api/upload` — that pair is used only by the
  separate public customer-facing onboarding form (`src/components/onboarding/form-engine.tsx`
  → `form-field.tsx` → `file-upload.tsx`), a distinct, older flow this task's "Onboarding
  steps" wording does not refer to. That component (`file-upload.tsx`) already has drag-and-
  drop and remove, just single-file — leave as-is unless separately requested.
- Do not change `/api/customers/[customerId]/assets/upload` (single-file server route) — the
  client already calls it once per file for every existing multi-attachment flow in this repo
  (e.g. Storage/KB's `handleUpload`); no server-side batching is needed.
- Do not change the `StorageFileExplorer`'s own separate `<input type="file">` (line ~2895) —
  it already calls the shared `handleUpload(file, folderId)` per-file; if it's already
  single-select, extending it the same way is a natural follow-up but wasn't named in this
  request's four steps (129-135) — flag for a quick decision during planning rather than
  silently expanding scope.
- Do not add a client-side upload queue/progress UI beyond what each step's existing
  `uploading`/`*UploadError` state already renders — this task is about accepting multiple
  files and firing multiple already-working single-file requests, not building a new upload
  manager.
- Do not change `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE` in the upload route.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add `multiple` + drag-and-drop to `FileUploadBox` (lines 2423-2487) and `HtmlMockupFileList` (lines 3989-4063) |

## Code Context

### File: `_onboarding-wizard.tsx` (current, lines 2429-2448, `FileUploadBox`)

```tsx
  const inputRef = useRef<HTMLInputElement>(null);
  ...
  return (
    <div className="mt-2.5">
      {!disabled && (
        <>
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "w-full rounded-lg border-2 border-dashed py-4 text-center cursor-pointer transition-colors disabled:opacity-60",
              isDark ? "border-white/[0.12] bg-white/[0.02] hover:border-brand" : "border-slate-200 bg-slate-50 hover:border-brand"
            )}
          >
            <Upload size={16} className={cn("mx-auto mb-1.5", textMuted)} />
            <div className={cn("text-[11.5px]", textMuted)}>{uploading ? "Uploading…" : <>Click to <span className="text-brand font-medium">upload a document</span></>}</div>
          </button>
        </>
      )}
```

Reference drag-over pattern already in this codebase (`src/components/hub/pm-tabs/tasks-tab.tsx:665-670,682`):

```tsx
<div
  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
  onDragLeave={() => setIsDragOver(false)}
  onDrop={handleFileDrop}
  className={cn(..., isDragOver ? /* highlighted */ : /* default */)}
>
<input id="task-file-input" type="file" multiple className="hidden" onChange={handleFileInputChange} />
```

### Target shape for `FileUploadBox` (and identically for `HtmlMockupFileList`)

```tsx
function FileUploadBox({ files, uploading, onFile, onRemove, onView, viewingId, isDark, disabled }: {
  files: AssetRow[]; uploading: boolean; onFile: (file: File) => void; onRemove?: (id: string) => void;
  onView?: (id: string) => void; viewingId?: string | null; isDark: boolean; disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    Array.from(fileList).forEach((f) => onFile(f));
  }

  return (
    <div className="mt-2.5">
      {!disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
            className={cn(
              "w-full rounded-lg border-2 border-dashed py-4 text-center cursor-pointer transition-colors disabled:opacity-60",
              isDark
                ? isDragOver ? "border-brand bg-brand/[0.06]" : "border-white/[0.12] bg-white/[0.02] hover:border-brand"
                : isDragOver ? "border-brand bg-brand/[0.04]" : "border-slate-200 bg-slate-50 hover:border-brand"
            )}
          >
            <Upload size={16} className={cn("mx-auto mb-1.5", textMuted)} />
            <div className={cn("text-[11.5px]", textMuted)}>
              {uploading ? "Uploading…" : <>Drag files here or <span className="text-brand font-medium">click to upload</span></>}
            </div>
          </button>
        </>
      )}
      {/* files list + Remove button unchanged */}
```

`onFile` stays a single-file callback (`(file: File) => void`) — no change to its type or to
any of the ~7 call sites that pass their step-specific `handle*Upload` function as `onFile`.
`handleFiles` simply calls it once per `File` in the drop/selection.

## Implementation Steps

1. In `FileUploadBox` (line 2423): add `useState` for `isDragOver`, add `multiple` to the
   `<input>`, replace the single-file `onChange` extraction with a `handleFiles(fileList)`
   helper that iterates and calls `onFile` per file, wire `onDragOver`/`onDragLeave`/`onDrop`
   on the button/drop-zone element (calling `e.preventDefault()` in both `onDragOver` and
   `onDrop` — required for the browser to treat the element as a valid drop target and to
   suppress the default browser behavior of navigating to the dropped file), and add the
   `isDragOver` highlight classes (mirroring `tasks-tab.tsx`'s treatment, adapted to this
   component's existing `isDark` two-tone convention per this codebase's UI Polish
   Conventions — no `dark:` classes).
2. Apply the identical change to `HtmlMockupFileList` (line 3989) — same `handleFiles`/
   `isDragOver` pattern; its extra `onEdit`/`onView` actions and per-file mime-type-gated Edit
   button are untouched.
3. Update the drop-zone copy from "Click to upload a document"/"Click to upload the mockup" to
   something reflecting drag-and-drop is now supported (e.g. "Drag files here or click to
   upload").
4. No change needed to any `handle*Upload` function, the upload API route, or any call site
   passing `onFile={handle*Upload}` — they already accept and process one file per call
   correctly when called multiple times in quick succession (each uses the functional
   `setState((prev) => [...prev, newAsset])` form already, so concurrent per-file uploads
   won't clobber each other's state updates).

## Acceptance Criteria

- [ ] On any of the 6 wizard steps using `FileUploadBox` (Kickoff/Business Facts, Outcome
      Target, Migration Checklist, Content Map, Client Sign-Off) or `HtmlMockupFileList`
      (HTML Mockup), selecting multiple files via the file picker uploads all of them.
- [ ] Dragging multiple files from the OS file explorer onto the drop zone uploads all of
      them, with a visible drag-over highlight while hovering.
- [ ] Existing Remove button still works per file, unchanged.
- [ ] A `disabled` (read-only PM) rendering of these steps shows no drop zone/file input and
      ignores drops.
- [ ] One failing upload (e.g. unsupported type) in a multi-file drop doesn't prevent the
      other valid files in the same drop from completing.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: open a project's Onboarding Wizard as `admin`/`marketing`/`pm`, go to the
Kickoff step's Business Facts attachment, select 3 files at once via the file picker, confirm
all 3 appear in the list; then drag 2 more files from Finder/Explorer onto the drop zone and
confirm the drag-over highlight appears and both upload. Repeat on the HTML Mockup step. Test
one intentionally-unsupported file type mixed into a multi-file drop and confirm only that one
fails (inline error) while the rest succeed.

## Compatibility Touchpoints

- None — client-only change to two shared components inside one file; no schema, route, or
  packaging changes.

## Implementation Notes

### What Changed
- Added `multiple` to both upload `<input type="file">` elements and a shared `handleFiles(fileList)` helper (iterates `Array.from(fileList)`, calling the existing single-file `onFile` prop once per file — no change to `onFile`'s type or any of the ~7 call sites).
- Added `isDragOver` state + `onDragOver`/`onDragLeave`/`onDrop` handlers on the drop-zone `<button>` in both components, both calling `e.preventDefault()` as required for a valid HTML5 drop target; `onDrop` reads `e.dataTransfer.files` through the same `handleFiles` helper so non-file drags (text selections, etc., which produce an empty/irrelevant `FileList`) are naturally inert.
- Added `isDragOver` highlight classes following the existing `isDark` two-tone ternary convention (no `dark:` classes), matching the pattern already in `tasks-tab.tsx`.
- Updated both drop-zone copy strings from "Click to upload a document"/"Click to upload the mockup" to "Drag files here or click to upload".
- `disabled` continues to suppress the entire input/button block (unchanged `{!disabled && (...)}` wrapper), so drag-and-drop is inert in the read-only PM view exactly like click-to-browse already was.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — `FileUploadBox` and `HtmlMockupFileList` components updated per the plan; no other components, routes, or call sites touched.

### Deviations From Plan
- None. Implementation matches the task doc's "Target shape" code sample exactly, applied identically to both components.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser multi-file drag-and-drop verification - SKIPPED (no live dev/browser session run this task; deferred to user per established pattern for client-only UI changes in this session)
