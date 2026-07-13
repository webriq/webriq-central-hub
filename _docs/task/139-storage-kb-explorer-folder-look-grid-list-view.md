# 139: Storage/KB File Explorer — Real Folder Look + Grid/List View Toggle (Default Grid)

**Created:** 2026-07-13
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced

---

## Overview

Task 134 shipped a Finder-*inspired* browser for the Storage/KB step — a compact
sidebar list of folders (icon + name + count, one per row) and a file list to its
right (icon + name + size + actions, one per row). Per the user's follow-up feedback,
it should look more like an actual folder browser:

1. **Folders should read as real folders** — larger folder-icon tiles (Finder/Windows
   Explorer style: a big folder glyph with the name and count underneath/beside it),
   not a compact sidebar row list.
2. **Files need a Grid view and a List view, defaulting to Grid** — a toggle lets Bert
   switch between a card/thumbnail grid (icon-forward, Finder icon-view style) and the
   existing compact row list (already built in task 134, kept as the List option).

This task redesigns `StorageFileExplorer` (task 134's component,
`_onboarding-wizard.tsx`) visually; no data model, permissions, or upload/remove logic
changes — those are already correct from task 134 (and, if tasks 137/138 land first,
should already include per-project storage paths and per-user sharing without further
change here).

## Requirements

- [ ] The folder browser is two-level: a **folder grid/tiles view** (large folder icon
      + name + file count, arranged in a responsive grid of tiles) is shown first;
      clicking a folder tile navigates into it, showing that folder's files with a
      "Back to folders" affordance (breadcrumb or back button) to return to the tile
      view. This replaces the current always-visible two-column sidebar+list layout.
- [ ] Inside a folder, a **view toggle** (Grid / List, icon buttons) switches between:
  - **Grid** (default): file cards in a responsive grid, each showing a file-type icon
    or thumbnail (image files may show an actual thumbnail via the existing signed-URL
    mechanism; non-image types show a representative icon), file name (truncated,
    wrapping to 2 lines if needed), size, and permission badge, with View/Permissions/
    Remove actions accessible via a hover overlay or a small action row under the card.
  - **List**: the existing task-134 compact row layout (icon + name + size + badge +
    inline actions) — reused as-is, not rebuilt.
- [ ] The Grid/List preference is a simple in-memory UI state (not persisted to the
      server) — defaults to Grid every time the step is opened, per the literal ask
      ("default to Grid").
- [ ] All existing behavior is preserved: View opens the shared in-app viewer,
      Permissions opens the existing inline expandable panel (extended per task 138 if
      that lands first, otherwise task 134's role-only version), Remove works the same,
      "Add file" still uploads into the currently-open folder's context (tagged
      `label: "Documents"` when added from a non-"Documents" folder — unchanged from
      task 134, no new categorization logic).
- [ ] DNS access / credentials textareas remain completely untouched (same as task
      134's own boundary).

## Out of Scope / Must-Not-Change

- No changes to `folderForAsset()`/`ASSET_FOLDER_BY_LABEL` categorization logic — same
  folders, same assignment rules, only the *presentation* changes.
- No drag-and-drop, no rename/move, no nested sub-folders — same boundary as task 134.
- No new upload/remove/view/permissions API calls — reuses task 134's (and, if
  applicable, task 138's) handlers exactly as they exist.
- No changes to `kickoff`, `outcome-target`, `migration-checklist`, `content-map`,
  `html-mockup`, `client-signoff`.
- No persistence of the Grid/List choice (e.g. to `wizard_data` or localStorage) — pure
  in-memory default-to-Grid, per the literal ask; add persistence only if asked later.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Redesign `StorageFileExplorer`'s folder-list into a tile grid, add a folder-drill-down navigation state, add a Grid/List view toggle with a new grid-card file renderer. |

## Code Context

### Current folder sidebar to replace (`_onboarding-wizard.tsx`, task 134's `StorageFileExplorer`)

```tsx
<div className="p-2 flex sm:flex-col gap-1 ... border-b sm:border-b-0 sm:border-r ...">
  {folders.map((folder) => (
    <button onClick={() => setSelectedFolder(folder)} className="... flex items-center justify-between ...">
      <span className="flex items-center gap-1.5 truncate"><Folder size={13} /> {folder}</span>
      <span className="... rounded-full ...">{count}</span>
    </button>
  ))}
</div>
```

Replace with a tile grid, e.g.:

```tsx
{!activeFolder ? (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
    {folders.map((folder) => (
      <button
        key={folder}
        onClick={() => setActiveFolder(folder)}
        className="flex flex-col items-center gap-1.5 p-3 rounded-lg cursor-pointer border-none bg-transparent hover:bg-slate-100 transition-colors"
      >
        <Folder size={40} className="text-brand" fill="currentColor" fillOpacity={0.12} />
        <span className="text-[12px] font-medium text-center truncate w-full">{folder}</span>
        <span className="text-[10px] text-slate-400">{grouped.get(folder)?.length ?? 0} file{grouped.get(folder)?.length === 1 ? "" : "s"}</span>
      </button>
    ))}
  </div>
) : (
  /* file view for activeFolder, with a "← Folders" back button and the Grid/List toggle */
)}
```

`Folder` is already imported (task 134); `fill`/`fillOpacity` give a subtler "folder
icon" look than a plain outline at large size — adjust to taste, this is a starting
point, not a pixel-exact spec.

### View toggle — same icon-pill pattern already used for the HTML Mockup editor's Desktop/Tablet/Mobile toggle (task 133, `_onboarding-wizard.tsx`'s `HtmlEditorModal`)

```tsx
const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
// ... two icon buttons (Grid3x3/List icons from lucide-react — add to the existing import list), active-state pill styling identical to PREVIEW_SIZES' toggle buttons.
```

### Grid card file renderer — new, models the existing list row's data but as a card

Reuse the same per-file data (`f.file_name`, `formatFileSize(f.file_size)`, permission
badge, View/Permissions/Remove) — only the layout changes to a card (icon/thumbnail on
top, name below, actions in a footer row or on hover). For image files, the existing
"View" flow already fetches a signed URL on click; a Grid thumbnail would need its own
signed-URL fetch per visible image card (batched or on-mount per card) — reasonable to
just show a generic file-type icon for all types in Grid view initially, with a `TODO`
if live thumbnails turn out to matter, since the literal ask was "provide a grid and
list view," not necessarily "with live image thumbnails" — confirm with the user if this
distinction matters before investing in per-card thumbnail fetching.

## Implementation Steps

1. Add `activeFolder`/`viewMode` state to `StorageFileExplorer` (replacing task 134's `selectedFolder` derivation, which auto-selected the first folder — this version starts with no folder selected, showing the tile grid).
2. Build the folder-tiles view (grid of large folder icons + name + count).
3. Build a "Back to folders" affordance shown once a folder is open.
4. Add the Grid/List toggle, defaulting to `"grid"`.
5. Build the Grid card renderer (file icon, name, size, badge, actions) alongside the existing List row renderer (reused from task 134, gated behind `viewMode === "list"`).
6. `npx tsc --noEmit` and `pnpm lint`.
7. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] The Storage/KB step first shows a grid of folder tiles (icon + name + count), not an always-visible sidebar list.
- [ ] Clicking a folder tile navigates into it; a "Back to folders" control returns to the tile grid.
- [ ] Inside a folder, Grid is the default view; a toggle switches to List and back.
- [ ] Grid view shows each file as a card (icon, name, size, permission badge) with working View/Permissions/Remove actions.
- [ ] List view is functionally and visually identical to task 134's original row layout.
- [ ] "Add file" still uploads correctly from within an open folder.
- [ ] All other steps and the DNS/credentials textareas are unaffected.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new packages needed.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000, a Phase 1 project with files across multiple folders:
#   - Navigate to Storage folder + KB (Step 6) -> confirm folder tiles show with correct counts
#   - Click into a folder -> confirm it defaults to Grid view
#   - Toggle to List -> confirm it matches task 134's original row layout
#   - Toggle back to Grid -> confirm no state loss (files still there, actions still work)
#   - Upload a new file from within a folder -> confirm it appears in both view modes
#   - Click "Back to folders" -> confirm it returns to the tile grid
```

## Compatibility Touchpoints

- None — purely presentational, no API/DB changes.

## Implementation Notes

### What Changed
- Replaced the always-visible two-column sidebar+list layout with a two-level Finder-style navigation: a folder-tiles grid (large `Folder` icon with subtle fill, name, file count, responsive `grid-cols-2 sm:grid-cols-3 md:grid-cols-4`) shown first, with no folder auto-selected on mount (unlike task 134's version, which auto-picked the first folder).
- Clicking a folder tile opens it, showing an "← Folders" back button, the folder name, a Grid/List view toggle (icon pill pair, same active/inactive styling convention already used elsewhere in this file, e.g. the HTML Mockup editor's Desktop/Tablet/Mobile toggle from task 133), and the "Add file" upload control.
- **Grid** (default) renders each file as a card: icon, name (`line-clamp-2` for long names), size, permission badge, and the View/Permissions/Remove actions in a row beneath. **List** is byte-for-byte the same row layout task 134 shipped, just relocated inside the per-folder view instead of always-visible.
- Per-file permission info (`roleRestricted`/`userRestricted`/`restricted`/`permissionBadge`) and the expandable permissions panel were factored into two small helpers (`getPermissionInfo`, `renderPermissionsPanel`) shared by both view modes, so the task 138 per-user-sharing UI didn't need to be duplicated — it works identically in Grid and List.
- View/Permissions/Remove action buttons were similarly factored into a shared `fileActions(f)` helper, reused by both view modes.
- Grid/List preference (`viewMode`) is plain in-memory `useState`, defaulting to `"grid"` on every mount — not persisted anywhere, per the task's explicit scope boundary.
- No thumbnails for image files in Grid view (a generic file icon is shown for all types) — flagged in the task doc itself as a "confirm before investing" item, not built here since the literal ask was "provide a grid and list view."

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — added `Grid3x3`/`LayoutList` to the `lucide-react` import list; rewrote `StorageFileExplorer` entirely (folder-tiles view, Grid/List toggle, factored `getPermissionInfo`/`renderPermissionsPanel`/`fileActions`/`uploadInput` helpers). No other files touched — `folderForAsset()`/`ASSET_FOLDER_BY_LABEL` and all upload/remove/view/permissions handlers in the parent component are unchanged.

### Deviations From Plan
- None — implementation matches the task document's Code Context and Implementation Steps. The permissions-panel/file-actions factoring (not explicitly spelled out in the doc) was a straightforward DRY choice to avoid duplicating the sizeable expandable-panel JSX across two view modes, not a scope change.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- `pnpm build` — PASS; confirms the substantial JSX rewrite compiles correctly in production.
- Manual browser verification — **SKIPPED**, same standing reason as the rest of this batch: live verification requires a logged-in Hub session, and entering the user's password to authenticate is a prohibited action regardless of authorization. Verified instead by code review: the folder-tile → per-folder navigation state (`activeFolder`) and view-mode state (`viewMode`) are both plain `useState` with no interaction with any async/network state, so their correctness is verifiable by reading the render logic directly; the shared helpers were traced to confirm they receive/return identical data in both branches; all upload/remove/view/permissions handlers passed down from the parent are completely untouched (same props, same call sites, only the JSX consuming them was restructured).
