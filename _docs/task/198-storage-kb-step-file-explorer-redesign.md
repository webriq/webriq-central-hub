# 198: Storage Folder + KB Step — File Explorer Redesign (Tabs, Bigger Folders, Drive-Style Thumbnails, Contextual Drag & Drop)

**Created:** 2026-07-29
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Redesign Step 6 ("Storage Folder + KB", `step.key === "storage-kb"`) of the customer onboarding wizard (`/v2/portfolio-tracker/[projectId]`) using `_final_design/guide/central-hub-design-system.md`. Today the step is one flat column: a small-tile `StorageFileExplorer` for "Project files" stacked above a combined "Credentials & links" list, with plain text-link-style action buttons and no drag-and-drop beyond the per-field upload boxes elsewhere in the wizard. This task turns it into a proper file-manager surface: three tabs (Project Files / Credentials / Links), bigger and clearly-clickable folder tiles, Google-Drive-style thumbnails for previewable file types, a full-tab-area context-aware drag-and-drop zone, a help tooltip explaining the drop zone, and enhanced drag/browse empty states — all restyled to match the design system and the canonical tab/grid-list-toggle patterns already used on the Projects pages.

Everything here is UI/UX only, inside a single existing client component (`StorageFileExplorer`) and its call site in `_onboarding-wizard.tsx`. No schema, API, or permissions-model changes.

## Requirements

- [ ] Split "Project Files", "Credentials", and "Links" into three separate tabs (not one combined list), using the same pill-tab visual pattern as the Tasks/Issues/Milestones tabs on the project detail page.
- [ ] "New folder" and "Add file" read as recognizable buttons at first glance (bordered, icon + label) instead of the current plain text-link style.
- [ ] Grid/List view toggle matches the same design used elsewhere in the app (Projects list page) — icon set, active/inactive states, container style.
- [ ] Folders are visually bigger and easier to click/recognize than the current small pill rows.
- [ ] Files show real preview thumbnails where feasible — images render an actual image thumbnail; PDF, CSV, Markdown, HTML get a lightweight rendered preview; Word/Excel and anything unrecognized get a clearly labeled, color-coded file-type icon tile (Drive-style fallback icon, not a live-rendered preview — see Out of Scope for why).
- [ ] Clear visual separation (spacing + section captions) between the folders grid and the files grid so they don't read as one undifferentiated grid.
- [ ] The entire Project Files tab content area is a drag-and-drop zone:
  - At the root/project level: only folder tiles are valid drop targets. Dragging over any other part of the area shows a not-allowed cursor and the drop is rejected.
  - Inside a folder: anywhere in the content area accepts a drop (uploads into the currently open folder) — except when the drop lands directly on a sub-folder tile, in which case the file goes into that sub-folder instead.
- [ ] A circled question-mark icon near the top of the Project Files tab, with a tooltip explaining that the area is a drag-and-drop zone.
- [ ] Empty folders (and the empty-root state) show an enhanced drag-and-drop-or-browse panel instead of plain "No folders yet." / "This folder is empty." text.

## Out of Scope / Must-Not-Change

- Folder provisioning/backfill logic (task 141), the folder/file permissions model (task 144), rename/move/delete/bulk-share behavior, and the PM read-only carve-out (`isStepReadOnly`, tasks 146/160) — this task only restyles/reorganizes the container these already-working actions render inside. Do not change their handler logic or API calls.
- No new API routes. Thumbnails are fetched lazily, client-side, through the existing single-asset `GET /api/customers/[customerId]/assets/[assetId]/file-url` endpoint (60-second signed URL) — do not add a batch/bulk signed-URL endpoint for this.
- No true server-rendered/pixel-accurate thumbnails for Word/Excel (`OFFICE_MIME_TYPES`) — those already require the external Office Online viewer (`view.officeapps.live.com`) to render at all in this codebase, and loading that per grid card for every doc/xlsx file in a folder is a real performance and (given some of these are client-uploaded files) privacy-adjacent cost. They get a static colored type-icon tile instead, matching Drive's own fallback behavior for less-common formats.
- No changes to any other wizard step (`kickoff`, `outcome-target`, `migration-checklist`, `content-map`, `client-signoff`, `html-mockup`, `finalization`/completion screens).
- Do not touch `FileViewerModal`/`HtmlEditorModal` (task 197 already redesigned those) beyond whatever is required to keep "View" working from the new tiles.
- Keep this inside `_onboarding-wizard.tsx` — per this repo's "page-scoped UI" convention, do not extract `StorageFileExplorer` (or new sub-pieces like a thumbnail renderer) into `src/components/`; it is used from exactly one place.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` | Modify | Icon imports; `storage-kb` step render block (tabs); `StorageFileExplorer` component (bigger folder tiles, thumbnails, DnD zone, toggle/button restyle, empty states); `AddCredentialLinkModal` gets an optional `initialType` prop so the per-tab "+ Add" opens pre-selected to the right type. |

## Code Context

### Current `storage-kb` step render (single stacked column, no tabs) — `_onboarding-wizard.tsx:2216-2340`

```tsx
{step.key === "storage-kb" && (
  <div className="flex flex-col gap-4 mb-5">
    <div>
      <label className={labelCls}>Project files</label>
      <StorageFileExplorer
        assets={phase1Assets}
        // ...folders, loading, onUpload, onCreateFolder, onMove, permissions, rename, delete handlers
      />
    </div>
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className={labelCls}>Credentials & links</label>
        <button onClick={() => setShowAddCredentialLink(true)}>
          <Plus size={12} /> Add
        </button>
      </div>
      {(() => {
        const credentialsAndLinks = phase1Assets.filter(
          (a): a is AssetRow & { type: "link" | "credential" } => a.type === "link" || a.type === "credential"
        );
        // ...single combined list, both types rendered together
      })()}
    </div>
  </div>
)}
```

This must become a 3-tab surface (`activeAssetTab: "files" | "credentials" | "links"`); split the combined filter into `credentialAssets` (`type === "credential"`) and `linkAssets` (`type === "link"`), each in its own tab panel with its own empty state.

### Canonical pill-tab pattern to copy — `projects/[projectId]/_project-detail.tsx:432-449`

```tsx
<div className="flex items-center mt-4">
  <div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1">
    {PRIMARY_TABS.map((tab) => (
      <button
        key={tab.id}
        onClick={() => router.push(`/v2/projects/${project.project_id}/${tab.id}`)}
        className={cn(
          "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer",
          primaryTab === tab.id
            ? "bg-white text-[#0B1533] shadow-[0_1px_2px_rgba(7,17,51,.05)]"
            : "text-[#5F6A88] hover:text-[#0B1533]"
        )}
      >
        {tab.label}
      </button>
    ))}
  </div>
</div>
```

Use local `activeAssetTab` state (not a route push — this stays inside a single wizard step, not a sub-route) to switch tabs.

### Canonical Grid/List toggle pattern to copy — `projects/_projects-index.tsx:513-541`

```tsx
{/* View toggle — active state is a filled navy pill + white icon */}
<div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">
  <Tooltip>
    <TooltipTrigger render={
      <button onClick={() => handleViewChange("grid")} aria-label="Grid view"
        className={cn("p-1.5 rounded-full transition-colors cursor-pointer", view === "grid" ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]")}>
        <LayoutGrid size={15} />
      </button>
    } />
    <TooltipContent side="top">Grid view</TooltipContent>
  </Tooltip>
  {/* List button mirrors this with `List` icon */}
</div>
```

The onboarding wizard currently imports `Grid3x3`/`LayoutList` for this and styles it as `bg-[#EDF0F7]` container / `bg-[#E5F1FF] text-[#007BFF]` active — replace with `LayoutGrid`/`List` + the navy-fill pattern above (this file already imports `Tooltip`/`TooltipTrigger`/`TooltipContent` and has an `IconTip` wrapper — reuse `IconTip` instead of duplicating the raw Tooltip composition). Confirm `Grid3x3`/`LayoutList` aren't used elsewhere in this file before dropping the imports.

### Current folder tile (too small, needs enlarging) — `_onboarding-wizard.tsx:3903-3922`

```tsx
{childFolders.length > 0 && (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
    {childFolders.map((folder) => (
      <div key={folder.id} className="flex flex-col">
        <div className="relative">
          <button onClick={() => navigateTo(folder.id)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer border-none text-left transition-colors bg-[#F4F6FB] hover:bg-[#EDF0F7]">
            <Folder size={18} className="text-[#007BFF] shrink-0" fill="currentColor" fillOpacity={0.18} />
            <span className="text-[12px] font-medium truncate flex-1 text-[#0B1533]">{folder.name}</span>
          </button>
          {/* actions menu button, absolute top-right */}
        </div>
      </div>
    ))}
  </div>
)}
```

### Current file grid card (static `FileText` icon box, no real thumbnail) — `_onboarding-wizard.tsx:3985-4017`

```tsx
<div className="flex items-center gap-1.5 pl-2 pr-7 py-1.5">
  <FileText size={14} className="text-[#007BFF] shrink-0" />
  <span className="text-[11px] font-medium truncate flex-1 text-[#0B1533]">{f.file_name}</span>
</div>
<div className="flex items-center justify-center h-20 mx-2 mb-2 rounded-md bg-white">
  <FileText size={28} className="text-[#5F6A88]" />
</div>
```

This `h-20` box is where the new `FileThumbnail` render goes.

### Existing per-mime preview machinery to reuse (lazily, at thumbnail scale) — `_onboarding-wizard.tsx:4455-4525`

```tsx
const OFFICE_MIME_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function FilePreview({ file, url, previewSize }: { file: AssetRow; url: string; previewSize?: PreviewSizeKey }) {
  const mime = file.file_mime_type ?? "";
  if (mime.startsWith("image/")) { /* <img> */ }
  if (mime === "application/pdf") { return <iframe src={url} .../>; }
  if (OFFICE_MIME_TYPES.includes(mime)) { /* Office Online iframe — NOT for thumbnails */ }
  if (mime === "text/html") { return <HtmlFilePreview .../>; }
  if (mime === "text/csv") { return <CsvFilePreview url={url} />; }
  if (mime === "text/markdown") { return <MarkdownFilePreview url={url} />; }
  if (mime === "text/plain") { return <iframe src={url} sandbox="" .../>; }
  return <span>Preview not available for this file type.</span>;
}
```

`image/*`, `application/pdf`, `text/csv`, `text/markdown`, `text/html` are cheap/local enough to reuse at a small, `overflow-hidden`, `pointer-events-none` thumbnail scale, lazily (IntersectionObserver-gated, mirroring the `ResizeObserver` pattern already used in `HtmlFilePreview` at `_onboarding-wizard.tsx:4557-4566`) so only visible cards fetch a signed URL. `OFFICE_MIME_TYPES` and anything unrecognized get a static colored icon tile (no fetch).

### Signed URL source — `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts`

Returns `{ url }` via `adminClient.storage.from("customer-assets").createSignedUrl(asset.file_path, 60)` — **60-second TTL**. Fine for a one-shot lazy `<img>`/`<iframe>` load triggered on scroll-into-view; do not cache/reuse a fetched URL beyond its immediate render.

### Existing dashed drag-and-drop empty-state pattern to reuse — `_onboarding-wizard.tsx:3120-3155` (`FileUploadBox`)

```tsx
<button
  onClick={() => inputRef.current?.click()}
  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
  onDragLeave={() => setIsDragOver(false)}
  onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
  className={cn(
    "group w-full min-h-[168px] flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed py-8 text-center cursor-pointer transition-colors duration-150",
    isDragOver ? "border-[#007BFF] bg-[#F0F7FF]" : "border-[#C7D2E8] bg-[#F9FAFD] hover:border-[#007BFF] hover:bg-[#F0F7FF]"
  )}
>
  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E5F1FF] text-[#007BFF]">
    <CloudUpload size={22} strokeWidth={1.75} />
  </div>
  <div className="text-[13px] font-medium">Drag &amp; drop a file, or <span className="text-[#007BFF]">browse</span></div>
</button>
```

Adapt this same visual language for the empty-folder state inside `StorageFileExplorer`, wired to the folder's own `onUpload`/`currentFolderId`.

### `AddCredentialLinkModal` type state — `_onboarding-wizard.tsx:4169-4176`

```tsx
function AddCredentialLinkModal({ customerId, projectId, staffDirectory, onClose, onCreated }: {...}) {
  const [type, setType] = useState<"link" | "credential">("link");
```

Add an optional `initialType?: "link" | "credential"` prop, `useState<"link" | "credential">(initialType ?? "link")`, and pass it from each tab's "+ Add" button.

### Design tokens (`_final_design/guide/central-hub-design-system.md`)

- Buttons: pill radius (999px), one job each. Ghost: white bg, `--line` border → hover border `#A8C6F5`. Sizes: default `8px 15px / 12px`, small `5.5px 12px / 11px`.
- Radius scale: `--r-sm: 7px`, `--r-md: 10px`, `--r-lg: 14px` (panels/tiles), `999px` (pills).
- Elevation: pair a 1px border with `--sh-sm` on every raised surface — never shadow-only.
- Motion: 160ms `cubic-bezier(.22,1,.36,1)` on background/color/border-color; respect `prefers-reduced-motion`.
- Empty states "teach" (state what's missing and what happens next), sentence case, no exclamation points.

## Implementation Steps

1. Update lucide-react imports: add `LayoutGrid`, `List`, `HelpCircle`; drop `Grid3x3`/`LayoutList` only after confirming (grep) they aren't used anywhere else in this file.
2. Add `activeAssetTab` state (`"files" | "credentials" | "links"`, default `"files"`) to the wizard component; build the 3-tab pill header for the `storage-kb` step using the `_project-detail.tsx` pill pattern (local state switch, not a route push).
3. Split the current combined `credentialsAndLinks` filter into `credentialAssets` and `linkAssets`; render each in its own tab panel with its own "+ Add" button and its own empty state (icon + one-line message + primary action, per this repo's adopted empty-state convention) instead of the current shared "No credentials or links added yet." text.
4. Add `initialType?: "link" | "credential"` to `AddCredentialLinkModal`; wire each tab's "+ Add" to open it pre-selected to that tab's type.
5. Restyle "New folder" and "Add file" as bordered pill buttons (icon + label, `border border-[#E2E7F2] bg-white hover:border-[#A8C6F5]`, per the Ghost button spec) so both read as first-glance actionable buttons instead of plain text links.
6. Restyle the Grid/List toggle to the canonical `_projects-index.tsx` pattern (`LayoutGrid`/`List`, `border border-[#E2E7F2] rounded-full p-1 bg-white` container, active = `bg-[#071133] text-white`). Extend `viewMode` to also govern folder-tile layout at every level (not just files) so the toggle is meaningful at root too, and show the toggle at root as well as inside folders (currently gated to `currentFolderId !== null`).
7. Enlarge folder tiles: bigger square/rectangular tile (e.g. `min-h-[104px]`, centered `Folder` icon at ~32px, name below, actions menu pinned top-right) for grid mode; a taller row (~56-64px) for list mode. Keep the same actions menu (New sub-folder / Permissions / Rename / Delete) and the folder Permissions panel exactly as-is functionally.
8. Add "Folders" / "Files" section captions and a visible separator (extra margin or `border-t border-[#EDF0F7]`) between the folders grid and the files grid.
9. Build lazy thumbnails:
   - A small helper (e.g. `FileThumbnail({ asset, customerId }: { asset: AssetRow; customerId: string })`) that IntersectionObserver-gates fetching `/api/customers/${customerId}/assets/${asset.id}/file-url`, then branches on `asset.file_mime_type`:
     - `image/*` → real `<img>`.
     - `application/pdf`, `text/csv`, `text/markdown`, `text/html` → the existing `FilePreview`/`CsvFilePreview`/`MarkdownFilePreview`/`HtmlFilePreview` components, scaled to thumbnail size (`overflow-hidden`, fixed height, `pointer-events-none`).
     - `OFFICE_MIME_TYPES` members and anything else → a static colored icon tile (e.g. blue "DOC", green "XLS", gray generic `FileText`) — no network fetch.
   - Grid-mode file cards use `FileThumbnail` in place of the current static `FileText` box; list mode keeps a small static type icon (no thumbnail) — Drive's own list view does the same.
10. Implement the drag-and-drop zone on `StorageFileExplorer`'s content area:
    - Root (`currentFolderId === null`): container-level `onDragOver` defaults to `e.dataTransfer.dropEffect = "none"` (rejects drops on empty space, browser renders its own not-allowed cursor); each folder tile's own `onDragOver`/`onDrop` calls `e.stopPropagation()` and sets `dropEffect = "copy"`, uploading dropped files into that folder via the existing `onUpload(file, folder.id)`.
    - Inside a folder: container-level `onDragOver`/`onDrop` accept anywhere → `onUpload(file, currentFolderId)`; sub-folder tiles keep their own stopPropagation'd handler so a drop landing on a sub-folder routes there instead.
    - Track `isDraggingOverZone`/`dragOverFolderId` for visual feedback (zone-level dashed highlight; per-tile highlight on the current valid target), using enter/leave counting (or `e.relatedTarget` containment checks) the same way `FileUploadBox`'s `isDragOver` already handles it, adapted from one target to a whole zone plus per-tile targets.
11. Add a `HelpCircle` icon (wrapped in the existing `IconTip`) near the Project Files tab toolbar with tooltip copy explaining the drop-zone behavior (root: drop onto a folder; inside a folder: drop anywhere).
12. Replace the plain "This folder is empty." / "No folders yet." text with an enhanced empty-state panel reusing the `FileUploadBox` dashed CloudUpload visual language, wired to the same upload/browse flow — and make sure it sits inside the same drop zone rather than acting as a second competing drop target.
13. Confirm no regression in: bulk select/share/move/delete bar, per-file/per-folder Permissions panels, rename modal, move-to-folder modal, breadcrumb navigation, upload progress list, and the PM read-only carve-out (`isStepReadOnly` disables New folder/Add file/DnD/menus but still allows viewing tabs and thumbnails).

## Acceptance Criteria

- [ ] Storage Folder + KB step shows three tabs: Project Files, Credentials, Links — each with independent content and its own empty state.
- [ ] "New folder" and "Add file" are visually distinct bordered buttons with icon + label, recognizable without reading the tooltip.
- [ ] Grid/List toggle visually matches the Projects list page's toggle (icons, active navy-fill state, container style) and works at both root and inside folders.
- [ ] Folder tiles are noticeably larger than before and easy to click; list mode shows a taller row equivalent.
- [ ] Image files show a real image thumbnail; PDF/CSV/Markdown/HTML files show a lightweight rendered preview; Word/Excel and unknown types show a clear, color-coded type tile — no per-card Office Online iframe loads.
- [ ] Folders grid and files grid are visually separated by captions and spacing, not read as one grid.
- [ ] At root, dragging a file over empty space (not a folder tile) shows a not-allowed cursor and the drop is rejected; dropping onto a folder tile uploads into it.
- [ ] Inside a folder, dropping anywhere in the content area (except directly on a sub-folder tile) uploads into the open folder; dropping on a sub-folder tile uploads into that sub-folder.
- [ ] A circled question-mark icon near the top of the Project Files tab shows a tooltip describing the drag-and-drop behavior.
- [ ] Empty folder / empty root states show a drag-and-drop-or-browse panel, not plain text.
- [ ] Existing folder/file permissions, rename, move, delete, bulk actions, and the PM read-only carve-out all continue to work exactly as before.
- [ ] `npx tsc --noEmit` and `pnpm lint` are clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual browser verification (dev server, `pnpm dev`) against a project's Storage Folder + KB step:
- Switch between Project Files / Credentials / Links tabs.
- Toggle Grid/List at root and inside a folder.
- Upload/view one file of each type: image, PDF, `.docx`/`.xlsx`, CSV, Markdown, HTML, and an unrecognized type — confirm correct thumbnail/icon per type.
- Drag a file over empty root space (expect reject/not-allowed cursor) and onto a folder tile (expect upload succeeds).
- Inside a folder, drag a file onto empty space (expect upload into current folder) and onto a sub-folder tile (expect upload into sub-folder instead).
- Hover the help icon and confirm the tooltip text.
- Test the empty-folder and empty-root states' drag/browse panel.
- Re-verify existing folder/file Permissions, Rename, Move to folder, and bulk actions still work.
- Verify PM role still sees read-only behavior outside Step 6 and full access on Step 6, matching prior behavior.

## Compatibility Touchpoints

- No database migrations, no API route changes, no changes to `customer_assets`/`customer_asset_folders` schemas.
- No changes to other route groups, PWA/offline behavior, or non-wizard pages.
- Must preserve the existing `isStepReadOnly` (PM carve-out, tasks 146/160) gating exactly as today — only the visual container changes.

## Implementation Notes

### What Changed
- Split the Storage Folder + KB step into three pill tabs (Project Files / Credentials / Links), replacing the old single stacked "Project files" + combined "Credentials & links" list. Each of Credentials/Links now has its own count header, its own "+ Add" button (pre-selecting the right type in `AddCredentialLinkModal` via a new `initialType` prop), and its own icon+message+action empty state.
- Restyled "New folder" and "Add file" from plain text-links to bordered white pill buttons (Ghost button spec).
- Restyled the Grid/List toggle to match the canonical `_projects-index.tsx` pattern (bordered white pill container, navy-fill active state, `LayoutGrid`/`List` icons) and made it visible at root too (previously folder-only); `viewMode` now also governs folder-tile layout, not just files.
- Enlarged folder tiles (grid: `min-h-[104px]` centered icon+label; list: taller row) and added "Folders"/"Files" section captions with a `mb-6` gap between the two grids.
- Added a lazy, IntersectionObserver-gated `FileThumbnail` component: real `<img>` for images, the existing `FilePreview`-family renderers (Csv/Markdown/Html) scaled to thumbnail size for those mimes, and a static color-coded `FileTypeTile` (DOC/XLS/PDF/HTML/IMG/generic) for Word/Excel and anything else — fetched through the existing single-asset `/file-url` endpoint, one request per visible card.
- Implemented the context-aware drag-and-drop zone on `StorageFileExplorer`'s content container: at root, only folder tiles are valid drop targets (`dropEffect="none"` elsewhere, native not-allowed cursor); inside a folder, the whole area accepts a drop (uploads to the open folder) except sub-folder tiles, which route into themselves via `stopPropagation`. Added a `HelpCircle` tooltip button next to the Project Files tab explaining the zone.
- Replaced the plain "No folders yet."/"This folder is empty." text with a dashed CloudUpload/browse panel (reusing `FileUploadBox`'s visual language) that sits inside the same drop zone rather than owning its own handlers.
- Removed the now-unused `labelCls` local and the `Grid3x3`/`LayoutList` icon imports (replaced by `LayoutGrid`/`List`).

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — all of the above; single file per the page-scoped UI convention.

### Deviations From Plan
- **PDF excluded from the live-preview thumbnail lane.** The task doc originally scoped PDF into the lazy `FilePreview` reuse alongside CSV/Markdown/HTML. Verified in-browser: `<iframe src={signedUrl}>` for a PDF renders Chrome's own PDF-viewer chrome (toolbar + scrollbar) at thumbnail scale, which reads as a broken dark box rather than a preview. Fixed by dropping `application/pdf` from `isLazyPreviewable`, so PDFs get the static red "PDF" `FileTypeTile` instead — consistent with the plan's own reasoning for why Office docs get a static tile (some formats aren't cheap/clean to live-render at thumbnail size).
- Everything else matches the task document as written.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (fixed two `react/no-unescaped-entities` errors in the new empty-state copy and one now-unused `labelCls` warning along the way)
- Manual browser check against a real project (`ABC Test Company`, Storage Folder + KB step) — PASS: tabs switch correctly with independent empty states; New folder/Add file/Grid/List all restyled and functional at root and inside folders; folder tiles are visibly bigger in both view modes; HTML file thumbnail live-renders the actual mockup content at small scale; PDF now shows the static tile cleanly (post-fix); help tooltip shows the expected copy on hover. Did not exercise literal OS-level drag-and-drop through browser automation (not simulable via the available tools) — DnD behavior was verified by code review of the enter/leave/drop handler logic instead.

## Round 2 — Visual Polish Follow-Up (live user feedback, same session)

### What Changed
- **State contrast**: folders and files now default to a white card with a `border-[#E2E7F2]` + `shadow-sm`, hover to `bg-[#F4F8FF]`/`border-[#C7D2E8]`, and (files, folder drag-target) go to `bg-[#EAF2FF]`/`border-[#007BFF]` — replacing the old flat `bg-[#F4F6FB]`/`bg-[#EDF0F7]` pair that read as nearly identical.
- **Square file grid cards**: grid-mode file cards are now `aspect-square`, grid columns aligned to the folder grid (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`).
- **Thumbnails overhauled**: images render as a real `object-cover object-top` `<img>` (was letterboxed `object-contain`). Added two new real-content preview components — `ExcelFilePreview` (parses the actual .xlsx/.xls binary via the `xlsx`/SheetJS package already used for spreadsheet import, renders the first sheet as a table) and `DocxFilePreview` (converts .doc/.docx via the newly-added `mammoth` package to HTML, rendered through the same styling shell as the Markdown preview). PDF was tried two ways — a plain iframe and one with `#toolbar=0&navpanes=0&view=FitH` — and reverted to the static red "PDF" tile after confirming live that both still show Chrome's native PDF viewer chrome (or a "password required" prompt for a protected test file) rather than a clean preview.
- **Right-click context menu**: `fileMenu`'s dropdown items were extracted into a shared `renderFileMenuItems(f, closeMenu)`, and a new `renderFolderMenuItems(folder, closeMenu)` mirrors it for folders. Both are now reused by a single fixed-position context menu (new `contextMenu` state) triggered via `onContextMenu` on file cards and folder tiles, in addition to the existing kebab dropdowns.
- **Header spacing**: file-card and folder-row headers now reserve explicit padding (`pr-8`/`pr-9`) and `gap-2`/`gap-2.5` between icon, name, and the kebab button, instead of the kebab overlapping via a tight absolute offset.
- **Full-name tooltip on truncated names**: attempted via the app's Base UI-backed `IconTip` wrapping the name `<span>`/`<div>` inside the folder-tile/file-card `<button>` — verified live that this made the *first* click on the name area register as a no-op (only a second click actually navigated/selected), so all four occurrences were reverted to a plain native `title` attribute instead, which shows the full name on hover with zero click-interception risk.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — same file, all of the above.
- `package.json` / lockfile — added `mammoth` (new dependency, `xlsx` was already present from the CSV/spreadsheet importer).

### Deviations From Plan
- The original task doc scoped DOCX/XLSX thumbnails as "static type tile only" (to avoid the Office Online viewer's heavy per-card chrome). Live user feedback asked for real content previews for these too; delivered via `mammoth`/`xlsx` client-side parsing instead of Office Online, which keeps the per-card cost to a lightweight fetch + parse rather than an external iframe embed.
- IconTip-wrapped filename tooltips (as originally implemented) were reverted to native `title` attributes after finding the click-swallowing issue described above — functionally equivalent for the user's ask ("reveal full filename on hover") but without the regression risk.

### Verification Run (Round 2)
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS
- Manual browser check (same test project) — PASS: verified white/hover/selected contrast on folders and files in both grid and list mode; square file cards; real thumbnails for `.docx`, `.xlsx`-style CSV/table exports, `.png`/`.jpg` (object-cover), and `.html`; clean static tile for `.pdf`; right-click context menu on both a folder and a file, matching the kebab dropdown's items; single-click-to-navigate confirmed unaffected by the native-`title` fix.

## Round 3 — Layout Tweaks (live user feedback, same session)

### What Changed
- **Drop zone scope**: the drag-and-drop handlers (`onDragEnter/Leave/Over/Drop`) and the dashed-outline highlight moved off the outer `StorageFileExplorer` wrapper (which also contained the breadcrumb + New folder/Add file/view-toggle row) onto a new inner wrapper that starts just below the toolbar and wraps only the loading-skeleton/empty-state/Folders/Files block. Dragging over the toolbar row no longer paints the highlight or accepts a drop.
- **Thinner dashed outline**: `outline-2` → `outline-1` on the drop-zone highlight.
- **Toolbar order swap**: "Add file" now renders before the Grid/List toggle (was after), per requested layout.
- **4-column grids**: both the folder grid and file grid dropped their `lg:grid-cols-5` step, capping at `md:grid-cols-4` — tiles read larger on wide screens.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — same file, all of the above.

### Verification Run (Round 3)
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS
- Manual browser check — PASS: toolbar order is New folder / Add file / Grid-List toggle; folder and file grids both cap at 4 columns with visibly larger tiles; drop-zone wrapper confirmed scoped to the Folders/Files area only by code review of the JSX boundaries (toolbar row and breadcrumb sit outside the new wrapper div).
