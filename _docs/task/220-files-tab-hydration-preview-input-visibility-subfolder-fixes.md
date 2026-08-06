# 220: Files Tab Fixes — Nested-Button Hydration Errors, In-App Preview on View, Invisible Search/New-Folder Text, Enter-to-Save + Duplicate-Name Confirm, Equal Folder Tile Heights, Sub-Folders

**Created:** 2026-08-06
**Priority:** HIGH
**Type:** bugfix + enhancement
**Recommended Tier:** deep

---

## Overview

Six independent fixes against the Files tab (`_files-tab.tsx` + `_file-tile.tsx`) of the Onboarding Workspace v2 sandbox at `/v2/portfolio-tracker/[projectId]/v2`:

1. **Hydration errors** — `<button> cannot be a descendant of <button>` / `<button> cannot contain a nested <button>`, thrown from `FileTile` in both grid and list view.
2. **"View" action** currently opens the file in a new browser tab (`window.open`) — should open the same in-app preview modal already used elsewhere in this feature (`FilePreviewModal`, `_file-previews.tsx`).
3. **Search bar and New Folder input text are invisible** — both `<input>`s render with no explicit text color and inherit an unreadable near-white ambient color.
4. **New Folder field UX** — no button exists, but there's no "Press Enter to save" hint either; and there's no duplicate-name handling beyond a silent failure. Need a below-field hint plus a friendly confirm-and-auto-number ("Name (1)", "Name (2)", …) flow when a sibling with the same name already exists.
5. **Folder tile heights are uneven** — the inline "Same name as another folder" warning pill (only shown on duplicates) adds an extra line, making those tiles taller than their siblings. Move the warning to a small icon beside (before) the kebab menu with a tooltip instead.
6. **Sub-folders** — a folder can currently only ever be one level deep (open a root folder → see its files; no folder-in-folder). Add the ability to create a folder inside an already-open folder, browse into it, and see grouped folders+files at each level, matching how the (non-v2) Onboarding Wizard's Storage folder + KB step already does this (`../_onboarding-wizard.tsx`).

### Investigation summary

- **#1 root cause confirmed:** `VersionBadge` (`_file-tile.tsx:179-203`) renders a `<button>` trigger. It's used at `_file-tile.tsx:269` (list view) and `:311` (grid view), both **inside** `FileTile`'s own outer `<button type="button" onClick={onToggleSelect}>...</button>` (list: `:251-271`; grid: `:290-315`). A `<button>` nested inside another `<button>` is invalid HTML and is exactly what both console errors point at (`_file-tile.tsx (183:7) @ VersionBadge`, `_file-tile.tsx (290:9) @ FileTile`). `ActionsMenu`'s own `<button>` (kebab trigger) is **not** nested — it's rendered in a sibling `<div className="absolute ...">` outside the selection button in both `FileTile` and `FolderTile` — so it needs no change.
- **#2:** `FilePreviewModal` already exists and is fully built (`_file-previews.tsx:213-274`) — it's the same component task 219 already wired up in `_business-info-tab.tsx`'s `NoteFileCard` (see `handlePreview`/`fetchFileUrl` pattern at `_business-info-tab.tsx:100-190`) to match the original (non-v2) Onboarding Wizard's file viewer exactly (framer-motion shell, Office Online embed, Escape-to-close, `interactive` iframes). `FileTile`'s "View" action just needs to open the same modal instead of `window.open`, using the identical open-modal-before-fetch pattern (avoids the "lag" task 219 already found and fixed once).
- **#3 root cause confirmed:** `_shared-ui.tsx`'s `fieldInputCls` (the established convention for every other text input in this feature area) explicitly sets `text-[#0B1533] placeholder:text-[#5F6A88]` with a comment noting this whole feature area is deliberately light-only, not the ambient dark-first `--foreground` (`globals.css` — "Hub is dark-first"). The search input (`_files-tab.tsx:200-208`) and the New Folder inline input (`_files-tab.tsx:399-407`) are the only two `<input>`s in this file that were built without that explicit color — they silently inherit the ambient (near-white) foreground color instead, which is unreadable against their light backgrounds (`bg-[#F4F6FB]` / `bg-white`).
- **#4/#6:** The folders API (`assets/folders/route.ts` POST, already unedited/existing) **already accepts `parent_folder_id`** and already hard-blocks true duplicate names with a unique-constraint 400 (`error.code === "23505"` → `"A folder with that name already exists here"`). No backend change is needed for either sub-folders or duplicate blocking — only client wiring: (a) thread `parentFolderId` through `onCreateFolder` so sub-folder creation is possible at all, and (b) add a client-side pre-check + friendly confirm-and-auto-number modal so users get the append-`(1)`/`(2)` flow described, instead of hitting the API's blunt reject.
- **#5:** `FolderTile`'s inline duplicate pill (`_file-tile.tsx:154-158`) is the only thing that varies tile height — removing it and adding an `AlertTriangle` icon beside `ActionsMenu` (both inside the same absolute-positioned corner wrapper) fixes the height variance without needing an explicit `min-h`.
- **#6 folder delete is already nested-safe:** `assets/folders/[folderId]/route.ts` DELETE already refuses to delete a folder with any child folders or files (`childFolderCount`/`assetCount` check, `_folderId]/route.ts:129-151`) — no backend change needed there either.

## Requirements

- [ ] **Hydration fix.** `VersionBadge`'s trigger element is no longer an HTML `<button>` nested inside `FileTile`'s outer `<button>`. Replace it with a non-button interactive element (`<span role="button" tabIndex={0}>` + `onClick`/`onKeyDown` for Enter/Space) that preserves the existing click-to-toggle "earlier uploads" popover behavior and its existing `stopPropagation` guard. No console hydration/nesting errors in either grid or list view, with or without a versioned file present.
- [ ] **View → in-app preview.** `FileTile`'s "View" action opens `FilePreviewModal` in place (no new tab), using the open-before-fetch pattern from `_business-info-tab.tsx`'s `NoteFileCard.handlePreview` (open modal immediately with a loading state, fetch the signed URL after). Works for both grid and list view, and from both the kebab menu and the right-click context menu (both already route through the same `actions` array built once per `FileTile`).
- [ ] **Search bar + New Folder input text visible.** Both inputs get explicit `text-[#0B1533] placeholder:text-[#5F6A88]` (matching `fieldInputCls`'s established color pair for this feature area).
- [ ] **"Press Enter to save" hint.** A small `textMuted`-styled caption appears directly below the New Folder input while it's open (both at root and, per #6, inside an open folder).
- [ ] **Duplicate-name confirm-and-auto-number.** On Enter (or blur-to-save) in the New Folder input, case-insensitively check the name against existing sibling folders at the *current location* (root, or the currently open folder if creating a sub-folder). If a match exists, show a confirmation modal (new component, matching this feature's existing modal shell — see `_rename-move-modals.tsx`) stating the folder already exists here, offering Cancel and a primary action that creates it as `"{name} (n)"` where `n` is the lowest integer ≥ 1 not already taken by a sibling (checks `"{name} (1)"`, `"{name} (2)"`, … in order). If no match, create with the typed name directly, unchanged from today. Both the Enter-key path and the existing blur-to-save path go through this same check.
- [ ] **Equal folder tile heights.** Remove the inline "Same name as another folder" pill from inside `FolderTile`'s card body. Add a small `AlertTriangle` icon in the same absolute top-right corner wrapper as the kebab menu, positioned *before* it (to its left), wrapped in `IconTip` with the label `"Same name as another folder"`, shown only when that folder is a duplicate at its own level. All folder tiles at a given grid row are the same height regardless of duplicate state.
- [ ] **Sub-folders — create.** Inside an open folder, a "New folder" tile (same `NewFolderTile` component, same Enter-to-save + duplicate-confirm flow) lets an editor create a folder scoped to `parent_folder_id = openFolderId`.
- [ ] **Sub-folders — browse.** Opening a folder shows that folder's child folders (as `FolderTile`s, same interactions: open, rename, delete, permissions, drag-and-drop upload) together with its files, folders first — matching "group the folders and files inside the parent folder" from the request and the non-v2 wizard's existing behavior.
- [ ] **Sub-folders — breadcrumb.** The breadcrumb reflects the full ancestor chain (`Files > Parent > Child > …`), not just one level, built by walking `parent_folder_id` up to root (same technique already used in `../_onboarding-wizard.tsx:3685-3692`). Every breadcrumb segment is clickable and navigates to that level.
- [ ] **Sub-folders — duplicate detection is per-level.** The duplicate-name warning (tile icon/tooltip) and the create-time confirm flow both scope "siblings" to the current parent (root or the currently open folder), not to the whole folder list.
- [ ] **Sub-folders — move target.** `MoveModal` lists nested folders too (indented flat list, current folder excluded), so a file can be moved into any folder including a newly created sub-folder — otherwise a sub-folder could only ever receive files via direct upload/drag-drop while it's open.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- No change to the folders/assets API routes — both already support everything needed (`parent_folder_id` on create, unique-constraint duplicate rejection, empty-only nested-safe delete). Do not add new endpoints or modify existing ones.
- No change to `_business-info-tab.tsx`'s `NoteFileCard`/its own `FilePreviewModal` usage (task 219's scope) — this task only adds a *second* call site for the same shared component from `_file-tile.tsx`.
- No schema/migration changes — `customer_asset_folders.parent_folder_id` already exists and is already wired end-to-end server-side.
- Do not touch the version-grouping logic itself (`versionGroups` in `_files-tab.tsx:98-108`) — only `VersionBadge`'s trigger element changes, not what it displays or when.
- Do not add folder depth limits, breadcrumb truncation, or any other behavior not explicitly requested — match the non-v2 wizard's existing unlimited-depth model.
- Bulk actions (`BulkToolbar`) and drag-and-drop upload behavior are unaffected — both already operate on whatever `openFolderId` currently is, which keeps working unchanged once that id can point at any depth.

## Proposed File Changes

| File | Action | Purpose |
|---|---|---|
| `.../v2/_file-tile.tsx` | Modify | Fix `VersionBadge`'s nested-button hydration bug; `FileTile`'s "View" action opens `FilePreviewModal` in place instead of `window.open`; `FolderTile` — remove inline duplicate pill, add warning icon+tooltip beside the kebab menu. |
| `.../v2/_files-tab.tsx` | Modify | Explicit text color on search + New Folder inputs; "Press Enter to save" hint; duplicate-name pre-check + confirm-modal wiring; multi-level breadcrumb; render child folders inside an open folder; scope `duplicateFolderNames` per level; thread `parentFolderId` through `onCreateFolder`; `NewFolderTile` usable inside an open folder too. |
| `.../v2/_rename-move-modals.tsx` | Modify | New export `DuplicateFolderModal` (confirm/append-number dialog, same shell as `RenameModal`); `MoveModal` lists nested folders (indented flat tree) instead of root-only. |
| `.../v2/_onboarding-wizard-v2.tsx` | Modify | `handleCreateFolder(name, parentFolderId)` — thread `parent_folder_id` into the POST body (API already accepts it; only the client call needs the new argument). |

No API route, migration, or type changes — `AssetFolder.parent_folder_id` (`_wizard-v2-types.ts:36`) and the folders POST/DELETE routes already support everything this task needs.

## Code Context

### `_file-tile.tsx` — `VersionBadge` (current, the hydration bug)
```tsx
function VersionBadge({ versionCount, olderVersions }: { versionCount: number; olderVersions: AssetRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="...">
        <History size={9} /> v{versionCount} · latest
      </button>
      {open && ( /* ...popover... */ )}
    </span>
  );
}
```
Rendered at `:269` (list) and `:311` (grid), both inside `FileTile`'s outer `<button onClick={onToggleSelect}>`. Fix — swap the inner `<button>` for a non-button element that keeps the same visuals/behavior:
```tsx
<span
  role="button"
  tabIndex={0}
  onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); } }}
  className="font-mono text-[9px] font-semibold text-[#5F6A88] bg-[#EDF0F7] px-1.5 py-0.5 rounded-[4px] cursor-pointer inline-flex items-center gap-1"
>
  <History size={9} /> v{versionCount} · latest
</span>
```
(The outer wrapping `<span onClick={stopPropagation}>` can be dropped since the trigger now stops propagation itself, or kept — either is fine as long as no `<button>` ends up inside `FileTile`'s outer `<button>`.)

### `_file-tile.tsx` — `FileTile.handleView` (current — opens a new tab)
```tsx
const handleView = async () => {
  try {
    const res = await fetch(`/api/customers/${customerId}/assets/${asset.id}/file-url`);
    if (!res.ok) throw new Error();
    const data: { url: string } = await res.json();
    window.open(data.url, "_blank", "noopener,noreferrer");
  } catch { /* ... */ }
};
```
Replace with the open-before-fetch pattern already established in `_business-info-tab.tsx:118-127`:
```tsx
const [previewOpen, setPreviewOpen] = useState(false);
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
const [previewLoading, setPreviewLoading] = useState(false);
const [previewError, setPreviewError] = useState<string | null>(null);

const handleView = () => {
  setPreviewOpen(true);
  setPreviewUrl(null);
  setPreviewError(null);
  setPreviewLoading(true);
  fetch(`/api/customers/${customerId}/assets/${asset.id}/file-url`)
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then((data: { url: string }) => setPreviewUrl(data.url))
    .catch(() => setPreviewError("Failed to load file preview."))
    .finally(() => setPreviewLoading(false));
};
```
Import `FilePreviewModal` from `./_file-previews` (already exported, `_file-previews.tsx:213`); render it once per `FileTile` (works for both the grid and list `return` branches — hoist the modal render to a shared spot or render it in both branches identically):
```tsx
{previewOpen && (
  <FilePreviewModal
    fileName={asset.file_name ?? asset.label}
    mimeType={asset.file_mime_type ?? ""}
    url={previewUrl}
    loading={previewLoading}
    error={previewError}
    onClose={() => setPreviewOpen(false)}
  />
)}
```

### `_files-tab.tsx` — search + New Folder inputs (current, no text color)
```tsx
<input
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  placeholder={openFolder ? "Search files" : "Search folders"}
  className="w-full text-[12px] rounded-full border border-[#E2E7F2] bg-[#F4F6FB] pl-8 pr-3 py-2 outline-none transition-colors focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
/>
```
Add `text-[#0B1533] placeholder:text-[#5F6A88]` to the class list. Same fix for the `NewFolderTile` input (`:399-407`).

### `_files-tab.tsx` — `NewFolderTile` (current — no hint, no duplicate handling)
```tsx
function NewFolderTile({ open, name, onOpen, onNameChange, onCreate, onCancel }: { ... }) {
  if (open) {
    return (
      <div className="... min-h-26">
        <input
          autoFocus value={name} onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onCreate(); if (e.key === "Escape") onCancel(); }}
          onBlur={() => (name.trim() ? onCreate() : onCancel())}
          placeholder="Folder name"
          className="w-full text-[12.5px] rounded-[8px] border border-[#A8C6F5] bg-white px-2.5 py-2 outline-none text-center"
        />
      </div>
    );
  }
  ...
}
```
Add the hint paragraph and the color fix; `onCreate` stays a plain callback (the duplicate check moves up into `_files-tab.tsx`'s `handleCreateFolder`, which is what `onCreate` already points at):
```tsx
<input .../* + text-[#0B1533] placeholder:text-[#5F6A88] */ />
<p className={cn("text-[10.5px] mt-1", textMuted)}>Press Enter to save</p>
```

### `_files-tab.tsx` — `handleCreateFolder` (current, root-only, no duplicate handling)
```tsx
const handleCreateFolder = async () => {
  if (!newFolderName.trim()) return;
  await onCreateFolder(newFolderName.trim());
  setNewFolderName("");
  setNewFolderOpen(false);
};
```
New shape — scope siblings to the current location, pre-check, and route through the new confirm modal on collision:
```tsx
const [duplicatePrompt, setDuplicatePrompt] = useState<{ name: string; parentId: string | null; suggested: string } | null>(null);

const siblingNamesAt = (parentId: string | null) =>
  folders.filter((f) => f.parent_folder_id === parentId).map((f) => f.name);

function nextAvailableName(base: string, existing: string[]): string {
  const lower = new Set(existing.map((n) => n.trim().toLowerCase()));
  if (!lower.has(base.trim().toLowerCase())) return base;
  let n = 1;
  while (lower.has(`${base} (${n})`.toLowerCase())) n += 1;
  return `${base} (${n})`;
}

const submitCreateFolder = async (parentId: string | null) => {
  const name = newFolderName.trim();
  if (!name) return;
  const existing = siblingNamesAt(parentId);
  if (existing.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
    setDuplicatePrompt({ name, parentId, suggested: nextAvailableName(name, existing) });
    return;
  }
  await onCreateFolder(name, parentId);
  setNewFolderName("");
  setNewFolderOpen(false);
};
```
`DuplicateFolderModal`'s confirm handler calls `onCreateFolder(duplicatePrompt.suggested, duplicatePrompt.parentId)` then clears both `duplicatePrompt` and the open input state.

### `_files-tab.tsx` — root-only folder listing (current)
```tsx
const rootFolders = useMemo(() => folders.filter((f) => f.parent_folder_id === null), [folders]);
const openFolder = openFolderId ? folders.find((f) => f.id === openFolderId) ?? null : null;
```
Generalize to any depth (breadcrumb chain + current-level children), same technique as `../_onboarding-wizard.tsx:3682-3692`:
```tsx
const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
const childrenOf = (parentId: string | null) => folders.filter((f) => f.parent_folder_id === parentId);

const breadcrumb = useMemo(() => {
  const chain: AssetFolder[] = [];
  let cur = openFolderId ? foldersById.get(openFolderId) ?? null : null;
  while (cur) { chain.unshift(cur); cur = cur.parent_folder_id ? foldersById.get(cur.parent_folder_id) ?? null : null; }
  return chain;
}, [openFolderId, foldersById]);

const currentLevelFolders = childrenOf(openFolderId); // folders visible at the currently open location (root when openFolderId is null)
```
Render the breadcrumb as a `.map()` over `breadcrumb` (each segment a button calling `onOpenFolder(folder.id)`) instead of the current single "Files › {openFolder.name}" pair. Inside an open folder, render `currentLevelFolders` as `FolderTile`s (plus, if `canEdit`, a `NewFolderTile` scoped to `openFolderId`) above the existing file grid/list, before the empty-state / file checks.

### `_file-tile.tsx` — `FolderTile` (current — inline pill + kebab-only corner)
```tsx
<div className="min-w-0 w-full">
  <p ...>{folder.name}</p>
  <p ...>{fileCount} {fileCount === 1 ? "file" : "files"}</p>
  {duplicateWarning && (
    <span className="inline-flex items-center gap-1 mt-1.5 text-[9.5px] font-bold text-[#8A5A00] bg-[#FFF3D6] rounded-[5px] px-1.5 py-0.5">
      <AlertTriangle size={9} /> Same name as another folder
    </span>
  )}
</div>
...
<div className="absolute top-2 right-2"><ActionsMenu actions={actions} /></div>
```
New shape:
```tsx
<div className="min-w-0 w-full">
  <p ...>{folder.name}</p>
  <p ...>{fileCount} {fileCount === 1 ? "file" : "files"}</p>
</div>
...
<div className="absolute top-2 right-2 flex items-center gap-1">
  {duplicateWarning && (
    <IconTip label="Same name as another folder">
      <span className="inline-flex text-[#8A5A00] cursor-help p-1"><AlertTriangle size={12} /></span>
    </IconTip>
  )}
  <ActionsMenu actions={actions} />
</div>
```

### `_rename-move-modals.tsx` — `MoveModal` (current, root-only targets)
```tsx
const targets = folders.filter((f) => f.parent_folder_id === null && f.id !== currentFolderId);
```
Replace with an indented flat tree (same flattening technique as `../_onboarding-wizard.tsx:3697-3704`), excluding the current folder:
```tsx
const flatten = (parentId: string | null, depth: number, acc: { folder: AssetFolder; depth: number }[]) => {
  for (const f of folders.filter((x) => x.parent_folder_id === parentId)) {
    if (f.id !== currentFolderId) { acc.push({ folder: f, depth }); flatten(f.id, depth + 1, acc); }
  }
  return acc;
};
const targets = flatten(null, 0, []);
// render: style={{ paddingLeft: 14 + depth * 16 }} on each button, label unchanged (folder.name)
```

### `_onboarding-wizard-v2.tsx` — `handleCreateFolder` (current, no parent arg)
```tsx
const handleCreateFolder = async (name: string) => {
  const res = await fetch(`/api/customers/${project.customer_id}/assets/folders`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: project.id, phaseNumber: 1, name }),
  });
  ...
};
```
Add the argument and pass it through (route already accepts `parent_folder_id`, `assets/folders/route.ts:191-224`):
```tsx
const handleCreateFolder = async (name: string, parentFolderId: string | null = null) => {
  const res = await fetch(`/api/customers/${project.customer_id}/assets/folders`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: project.id, phaseNumber: 1, name, parent_folder_id: parentFolderId }),
  });
  ...
};
```
`FilesTab`'s `onCreateFolder` prop type updates from `(name: string) => Promise<void>` to `(name: string, parentFolderId: string | null) => Promise<void>`.

## Implementation Steps

1. `_file-tile.tsx`: fix `VersionBadge`'s nested-button (span+role="button"); verify no other `<button>` is nested inside `FileTile`'s or `FolderTile`'s outer button by re-reading both return branches after the change.
2. `_file-tile.tsx`: rewrite `FileTile.handleView` to the open-before-fetch pattern with local preview state; import and render `FilePreviewModal`; remove the now-unused `ExternalLink` import if it was only used for that action's icon (check — `ExternalLink` is still used as the "View" action's menu icon, keep it).
3. `_file-tile.tsx`: `FolderTile` — remove the inline duplicate pill; add the warning icon + `IconTip` beside `ActionsMenu` in the shared corner wrapper.
4. `_files-tab.tsx`: add explicit text-color classes to both inputs.
5. `_files-tab.tsx`: add the "Press Enter to save" hint under `NewFolderTile`'s input.
6. `_files-tab.tsx`: implement `siblingNamesAt`/`nextAvailableName`/`submitCreateFolder`/`duplicatePrompt` state; wire `NewFolderTile`'s `onCreate` (Enter key and blur) through `submitCreateFolder`; render the new `DuplicateFolderModal` when `duplicatePrompt` is set.
7. `_rename-move-modals.tsx`: add `DuplicateFolderModal` export (shell copied from `RenameModal`'s pattern — header with `AlertTriangle` + title, body message naming the existing folder and the suggested `"{name} (n)"`, Cancel + primary "Create as … (n)" button).
8. `_files-tab.tsx`: generalize folder navigation — `foldersById`/`childrenOf`/`breadcrumb`/`currentLevelFolders`; replace the single-level `openFolder`/root-only rendering with the multi-level breadcrumb and child-folders-then-files layout inside an open folder; scope `duplicateFolderNames` to `currentLevelFolders` instead of `rootFolders`; add a `NewFolderTile` inside an open folder (parentId = `openFolderId`) alongside the existing root-level one.
9. `_onboarding-wizard-v2.tsx`: extend `handleCreateFolder`'s signature and POST body; update `FilesTab`'s `onCreateFolder` prop type in `_files-tab.tsx`'s props destructure.
10. `_rename-move-modals.tsx`: extend `MoveModal` to a flattened, indented, current-folder-excluded tree.
11. `npx tsc --noEmit` / `pnpm lint`.
12. Manual browser QA (see Verification).

## Acceptance Criteria

- [ ] No hydration/nested-`<button>` console errors anywhere in the Files tab, grid or list view, with a versioned file present.
- [ ] Clicking "View" (kebab menu or right-click context menu) on any file opens the in-app `FilePreviewModal` — no new tab opens.
- [ ] Search bar text and New Folder input text are both clearly readable (dark ink on light background) while typing.
- [ ] The New Folder input shows "Press Enter to save" beneath it while open.
- [ ] Typing a folder name that already exists at the current location and pressing Enter shows a confirmation modal offering to create it as `"{name} (1)"` (or the next free number); confirming creates that folder; canceling leaves the input open/unsaved.
- [ ] Typing a non-colliding name and pressing Enter creates it immediately, unchanged from today.
- [ ] Folder tiles with a duplicate-name warning are the same height as their non-duplicate siblings; the warning now shows as a small icon left of the kebab menu with a "Same name as another folder" tooltip on hover.
- [ ] A folder can be created inside an already-open folder; opening it shows its own child folders (if any) followed by its files; the breadcrumb shows every ancestor level and each segment navigates correctly.
- [ ] A file can be moved (via the kebab/context "Move to folder" action) into a sub-folder, not just a root-level folder.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual, browser-based (no test runner configured per CLAUDE.md):
# 1. Open the Files tab with a folder containing a re-uploaded (versioned) file — confirm no
#    hydration console errors in grid or list view, and the version badge popover still opens.
# 2. Right-click / kebab-menu "View" a file of a few representative types (image, pdf, html,
#    csv, docx) — confirm each opens the in-app modal, not a new tab.
# 3. Confirm search input and New Folder input text is visible while typing in both.
# 4. Create a folder with a brand-new name — creates immediately, hint text visible while typing.
# 5. Create a folder with a name matching an existing root folder — confirm modal appears with a
#    "(1)" suggestion; confirm creates it; cancel leaves the field open.
# 6. Repeat step 5 with two existing duplicates already present ("Test", "Test") — confirm the
#    suggested name is "Test (1)" if free, else "Test (2)", etc.
# 7. Confirm duplicate folder tiles are the same height as non-duplicate ones, with a hoverable
#    warning icon beside the kebab (not an inline pill).
# 8. Open a folder, create a sub-folder inside it, open that sub-folder, upload a file into it —
#    confirm the breadcrumb shows all levels and each segment navigates correctly.
# 9. From a file at root, use "Move to folder" and confirm the new sub-folder appears as a target
#    (indented under its parent).
```

## Compatibility Touchpoints

- No API/DB changes — purely client-side, so no migration to apply.
- `FilesTab`'s `onCreateFolder` prop signature changes (adds a required second argument) — its only two call sites are `_files-tab.tsx` (internal) and `_onboarding-wizard-v2.tsx` (updated in this task); confirm no other consumer exists (`_onboarding-wizard-v2.tsx` is currently the only file importing `FilesTab`).
- Does not touch task 219's Notes-card preview modal, task 217's shipped Files-tab baseline beyond what's listed above, or any other tab (`_business-info-tab.tsx`, `_access-tab.tsx`, `_checklist-tab.tsx`) except through the shared, unmodified `FilePreviewModal`/`IconTip` exports they already both depend on.

## Implementation Notes

### What Changed
- `VersionBadge` (`_file-tile.tsx`) — trigger element changed from `<button>` to `<span role="button" tabIndex={0}>` with click/keydown handlers, eliminating the nested-`<button>` hydration errors. Popover open/close behavior verified unchanged (browser-tested).
- `FileTile.handleView` — rewritten to the open-before-fetch pattern (matches `_business-info-tab.tsx`'s `NoteFileCard.handlePreview`); renders the existing `FilePreviewModal` (`_file-previews.tsx`) in place for both grid and list view, replacing `window.open`.
- `FolderTile` — inline "Same name as another folder" pill removed from the card body; an `AlertTriangle` icon + `IconTip` tooltip now sits beside (before) the kebab menu in the same absolute corner wrapper, shown only when `duplicateWarning` is true. Tile heights are now uniform regardless of duplicate state.
- `_files-tab.tsx` search input and `NewFolderTile`'s input both gained explicit `text-[#0B1533] placeholder:text-[#5F6A88]`, matching `fieldInputCls`'s established color pair for this feature area.
- `NewFolderTile` gained a "Press Enter to save" caption below the input.
- New duplicate-name flow: `submitCreateFolder` case-insensitively checks the typed name against siblings at the current location (root or the open folder); on a collision it opens a new `DuplicateFolderModal` (`_rename-move-modals.tsx`) offering to create the folder as `"{name} (n)"` (lowest free suffix, via `nextAvailableFolderName`); on confirm it creates directly (skipping the re-check, since the suggested name is already known-unique against the siblings checked when the prompt was raised).
- Sub-folder support: `_files-tab.tsx` now computes `currentLevelFolders` (children of `openFolderId`, root when null) and a full `breadcrumbChain` (walks `parent_folder_id` to root), replacing the old root-only `rootFolders`/single-level breadcrumb. Opening any folder now renders its own child folders (as `FolderTile`s, with a scoped `NewFolderTile` for creating further sub-folders) above its files. `duplicateFolderNames` is scoped to `currentLevelFolders` so the warning is per-level, not global.
- `handleCreateFolder` (`_onboarding-wizard-v2.tsx`) now accepts and forwards `parentFolderId` in the POST body — the API route already supported `parent_folder_id`, so this was the only missing link for sub-folder creation.
- `MoveModal` (`_rename-move-modals.tsx`) now lists an indented flat tree of all folders (via `flattenFolders`) instead of root-only, so files can be moved into sub-folders too. The current folder is excluded from the list, but its own children still recurse in as valid targets (see Deviations below).

### Files Changed
- `.../v2/_file-tile.tsx` — `VersionBadge` hydration fix; `FileTile.handleView` + in-app preview modal wiring (both grid and list branches); `FolderTile` duplicate-warning relocation.
- `.../v2/_files-tab.tsx` — input text-color fixes; "Press Enter to save" hint; duplicate-name pre-check + `DuplicateFolderModal` wiring; multi-level breadcrumb; nested folder browsing/creation inside an open folder; per-level duplicate scoping; `onCreateFolder` prop type widened to accept `parentFolderId`.
- `.../v2/_rename-move-modals.tsx` — new `DuplicateFolderModal` export; `MoveModal` rewritten to a flattened, indented, current-folder-excluded tree via a new `flattenFolders` helper.
- `.../v2/_onboarding-wizard-v2.tsx` — `handleCreateFolder(name, parentFolderId)` threads `parent_folder_id` into the POST body.

### Deviations From Plan
- **Bug found and fixed during browser verification, not anticipated in the task doc's code sample:** the first version of `flattenFolders` used `continue` when it hit the excluded (current) folder, which skipped *both* adding that folder's row *and* recursing into its children — meaning any sub-folders nested inside the folder a file currently lives in became unreachable as move targets (e.g. a file in "Branding" couldn't be moved into "Branding/Logos"). Fixed by only skipping the row push for the excluded folder, while still recursing into its children (at the same depth the excluded row would have occupied, since there's no visible parent row above them). Caught by manually testing "Move to folder" from inside a folder that had its own sub-folder — the sub-folder was silently missing from the list before the fix, present and correctly indented after.
- Everything else matches the approved task doc's Requirements/Proposed File Changes with no scope changes.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors), run twice (once after the initial implementation, once after the `flattenFolders` fix found during browser testing).
- `pnpm lint` — PASS (0 errors, 0 warnings; one `react-hooks/exhaustive-deps` warning surfaced mid-implementation on `currentLevelFolders`'s `useMemo` and was fixed by inlining the filter instead of calling a re-created-per-render `childrenOf` helper).
- `git status` — confirms only `.../v2/_file-tile.tsx`, `.../v2/_files-tab.tsx`, `.../v2/_rename-move-modals.tsx`, and `.../v2/_onboarding-wizard-v2.tsx` were touched by this implementation (plus this task doc and `TASKS.md`); every other dirty file in the working tree (`_business-info-tab.tsx`, `_checklist-tab.tsx`, `_file-previews.tsx`, `_programme-track.tsx`, `_shared-ui.tsx`, `_wizard-v2-types.ts`, `_workspace-header.tsx`, `database.ts`, migration 096) is pre-existing uncommitted work from task 219's prior session, not touched here.
- `impeccable` design-hook findings — every finding surfaced during this pass was a pre-existing line in an already-touched file (font-size literals matching this feature area's established sub-13/14px micro-type scale, or the pre-existing signed-URL `<img>` broken-image lint), re-flagged only because the surrounding function was edited. None were new, unprecedented drift; none required a fix.
- **Full manual browser QA completed in this pass** (not deferred) against a live project (`Trident Roof Solutions`, `/v2/portfolio-tracker/67CC38C5-PROJ-04/v2`, Files tab), using Chrome automation:
  - Search input and New Folder input text confirmed visible while typing (dark ink on light background).
  - "Press Enter to save" hint and the duplicate-name `DuplicateFolderModal` (with correct `"Notes (1)"` suggestion, "Creating…" loading state, and successful creation) all confirmed working exactly as designed.
  - Opening "Business Files" revealed its 3 pre-existing sub-folders (Collateral, Proposals, Branding) — previously unreachable in the shipped single-level UI — confirming the sub-folder browse/breadcrumb fix; navigated a third level deep (Files › Business Files › Branding) and created a new sub-sub-folder ("Logos") successfully.
  - Uploaded the same test file twice into "Branding" to produce a `v2 · latest` version badge — confirmed **zero hydration/console errors** throughout (checked via `read_console_messages`, including `onlyErrors: true`), and confirmed the version popover still opens (visible in list view; visually clipped in grid view by a pre-existing `overflow-hidden` on the tile, unrelated to this fix — same clipping would have existed before this change since the popover's positioning/markup context didn't change, only the trigger tag).
  - Kebab-menu "View" confirmed to open the in-app `FilePreviewModal` in place (showing the .txt file's real content), not a new browser tab.
  - "Move to folder" confirmed to list nested folders with correct indentation (found and fixed the `flattenFolders` bug described above during this exact check).
  - All test folders/files created during verification were deleted afterward, restoring the project to its pre-test state.
