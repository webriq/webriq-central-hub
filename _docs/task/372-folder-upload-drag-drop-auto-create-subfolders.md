# 372: Folder Upload — Drag & Drop / Picker Auto-Creates Folders, Sub-Folders, and Uploads Files (Files Tab)

**Created:** 2026-09-17
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed (2026-09-17) — marked complete at the user's explicit request; browser acceptance testing not run this session. See Quality Gate Notes and the scope-addition note below.

---

## Overview

Both Files tab surfaces — the Project Files tab (`_shared/_files-tab.tsx`, used by legacy and v2 project-detail routes) and the Onboarding Workspace Files tab (`onboarding-workspace/_onboarding-wizard-v2.tsx`) — render the same presentational `FilesTab` component (`onboarding-workspace/_files-tab.tsx`). Today that component only accepts **flat file uploads**: drag-and-drop of individual files onto an open folder or onto a folder tile, or a file-input picker (`multiple`, no directory support). Dropping or selecting a local **folder** either does nothing useful (the browser hands back a zero-byte directory "file" that fails the type check) or is not possible at all via the picker.

This task adds folder upload: dragging a local folder (with nested sub-folders) onto either Files tab, or selecting one via a new "Upload folder" picker button, should recreate the same folder/sub-folder structure in `customer_asset_folders` and upload each contained file into its matching folder automatically — no manual per-folder clicking.

## Requirements

- [ ] Drag-and-drop of a local folder (containing nested sub-folders and files) onto the open-folder drop zone creates the matching folder tree and uploads every file into its corresponding folder.
- [ ] Drag-and-drop of a local folder onto a specific folder tile creates the tree as a sub-tree of that folder.
- [ ] Drag-and-drop of a local folder at the root level (no folder open) creates it as a new top-level folder (with its sub-tree).
- [ ] A new "Upload folder" toolbar button opens the OS folder picker (`<input webkitdirectory>`) as an alternative to drag-and-drop, with identical resulting behavior.
- [ ] All four of the above work identically on **both** Files tab locations (Project Files tab and Onboarding Workspace Files tab) since both render the same presentational component — implement once, not twice.
- [ ] If a dropped/selected folder's name matches an existing folder at the same parent (case-insensitive, trimmed), reuse that existing folder (merge) instead of creating a duplicate — this differs deliberately from the existing manual "New Folder" flow, which prompts a duplicate-name modal (`DuplicateFolderModal`). Bulk tree uploads must not prompt once per conflicting folder.
- [ ] Files that fail the existing `ALLOWED_UPLOAD_TYPES` / `MAX_FILE_SIZE` checks (`_file-upload-constants.ts`) are skipped individually — the rest of the batch still uploads — and reported via one aggregated toast (e.g. "Skipped 3 files — unsupported type or too large"), not the existing single-slot `rejectedFile` UI (which isn't built for bulk results).
- [ ] Per-file upload progress reuses the existing `useUploadQueue` / `UploadQueuePanel` machinery — no new progress UI primitive.
- [ ] Plain (non-folder) file drag-and-drop and the existing file picker continue to work exactly as before (regression check).
- [ ] New/modified files follow `nextjs-file-length-best-practices.md` (soft warn ~250–300 lines; split logic into a pure tree-building util + an orchestration hook rather than growing `_files-tab.tsx`, which is already 376 lines).

## Out of Scope / Must-Not-Change

- No changes to the upload/sign API route (`/api/customers/[customerId]/assets/upload/sign`), the `customer-assets` Storage bucket, or the `customer_assets` / `customer_asset_folders` schema — this is a client-side orchestration feature on top of existing endpoints (`uploadViaSignedUrl`, `POST /assets`, `POST /assets/folders`).
- No changes to folder/asset permission defaults, RLS, or `allowed_roles`/`allowed_user_ids` — folders/files created via folder-upload get the same defaults as any manually created folder/file.
- No changes to the manual single "New Folder" flow or its duplicate-name modal (`NewFolderTile`, `DuplicateFolderModal`, `submitCreateFolder`) — that stays prompt-based; only the new tree-upload path merges silently.
- No changes to the Onboarding Workspace's separate name-path deep-link scheme (`_workspace-url-params.ts`) or the Project Files tab's Copy-URL/deep-link scheme (task 359, `_use-files-deeplink.ts`).
- No ZIP download, folder move/drag-reorder, or other unrelated Files-tab features.
- No exhaustive cross-browser matrix — Chrome/Edge/Firefox drag-and-drop directory entries (`webkitGetAsEntry`) and `webkitdirectory` picker are the target; if a browser can't resolve directory entries, degrade gracefully (treat the drop as unsupported / fall back to nothing rather than a broken partial upload) instead of full compatibility engineering.
- Comment-attachment and task/issue-attachment upload flows (`_attachment-dropzone.tsx`, `_upload-queue.tsx`'s legacy multipart path) are untouched — this is scoped to the customer-assets Files tab only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_folder-upload-tree.ts` | Create | Pure helpers: build a nested folder tree from a `webkitdirectory` `FileList` (`webkitRelativePath`) or from a `DataTransferItemList` (recursive `FileSystemDirectoryEntry`/`FileSystemFileEntry` traversal). No React, no fetch. |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_use-folder-upload.ts` | Create | Hook: BFS walk of the tree, find-or-create each folder (reuse by name at that parent, else `onCreateFolder`), then `enqueue()` that folder's files via the existing `useUploadQueue`. Surfaces a "preparing folders" status and a skipped-files toast. |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab.tsx` | Modify | Wire the new hook into: the open-folder drop zone, each folder tile's drop handler, a new root-level drop handler, and the new "Upload folder" button. Branch drop handling on directory-vs-file entries. Widen `onCreateFolder` prop type to return the created folder. |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-toolbar.tsx` | Modify | Add "Upload folder" button + a second hidden `<input webkitdirectory multiple>`, shown under the same `openFolder && canEdit` gate as the existing Upload button. |
| `src/app/(hub)/projects/_shared/_use-customer-assets.ts` | Modify | `handleCreateFolder` returns the created `AssetFolder` instead of `Promise<void>`. |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx` | Modify | Same signature change for its own inline `handleCreateFolder` (this route doesn't use the shared hook). |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_folder-tile.tsx` | Verify, modify if needed | Confirm `onDropTile: (e: React.DragEvent) => void` is sufficient for the caller (`_files-tab.tsx`) to branch on `e.dataTransfer.items` itself — likely no change needed here, branching stays in the closure that already builds this prop. |

## Code Context

### `_use-customer-assets.ts` — `handleCreateFolder` currently discards the created row

```ts
const handleCreateFolder = useCallback(async (name: string, parentFolderId: string | null) => {
  const res = await fetch(`/api/customers/${customerId}/assets/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, phaseNumber: 1, name, parent_folder_id: parentFolderId }),
  });
  if (!res.ok) return;
  const created: AssetFolder = await res.json();
  setFolders((prev) => [...prev, created]);
}, [customerId, projectId]);
```

Needs to `return created;` (and `return undefined` / throw-free `return` on the `!res.ok` early-out so the caller can detect failure). The near-identical copy in `_onboarding-wizard-v2.tsx:219-228` needs the same change. `POST /api/customers/[customerId]/assets/folders` already returns the full inserted row (`201`, id included) — no server change needed.

### `_files-tab.tsx` — where folder-vs-file drops need to branch

```ts
const handleZoneDrop = (e: React.DragEvent) => {
  e.preventDefault();
  setDragOver(false);
  if (!openFolderId) return; // root: empty space never accepts a drop today
  if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files, openFolderId);
};
```

and per folder tile (`renderFolderTile`):

```ts
onDropTile={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(null); if (canEdit && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files, folder.id); }}
```

Both currently read `e.dataTransfer.files` (flat `FileList`), which is the wrong API for a directory drop — a dropped folder shows up there as a bogus entry, not its contents. Use `e.dataTransfer.items` + `item.webkitGetAsEntry()` to detect `entry.isDirectory` and route to the new folder-upload hook instead; keep the existing `handleFiles(e.dataTransfer.files, …)` path for plain file drops (no behavior change there). The root-level folder grid (`!openFolder` branch, ~line 282) has no wrapping drop handler at all today — add one so a root-level folder drop works the same way the root "New Folder" tile does.

### `useUploadQueue.enqueue` — reuse target for per-folder file uploads

```ts
const enqueue = useCallback(
  (files: File[], folderId: string) => { /* ... existing per-file progress items ... */ },
  [runUpload]
);
```

Already batches N files into one target folder with individual progress items in `UploadQueuePanel`. The new folder-upload hook should call this once per resolved folder id (root-level files in the dropped tree included) rather than building a second upload primitive.

### `_file-upload-constants.ts` — existing per-file validation to reuse unchanged

```ts
export const ALLOWED_UPLOAD_TYPES = [ /* image/pdf/office/text mime list */ ];
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — matches the bucket's file_size_limit
```

### `AssetFolder` type (`_wizard-v2-types.ts`)

```ts
export type AssetFolder = {
  id: string;
  customer_id: string;
  project_id: string | null;
  phase_number: number | null;
  parent_folder_id: string | null;
  name: string;
  is_system: boolean;
  allowed_roles: string[] | null;
  allowed_user_ids: string[] | null;
  created_at: string;
};
```

## Implementation Steps

1. `_folder-upload-tree.ts`: define a `FolderNode` shape (`{ name: string; files: File[]; children: Map<string, FolderNode> }`) plus:
   - `buildTreeFromRelativePaths(files: File[]): FolderNode[]` — parses `file.webkitRelativePath.split("/")` for the `webkitdirectory` picker path.
   - `readDataTransferItemsAsTree(items: DataTransferItemList): Promise<FolderNode[]>` — for each item, `item.webkitGetAsEntry()`; recursively read `FileSystemDirectoryEntry` via `entry.createReader().readEntries()` **in a loop until an empty batch is returned** (the API doesn't guarantee everything in one call); resolve `FileSystemFileEntry` via `entry.file()`.
   - `hasDirectoryEntry(items: DataTransferItemList): boolean` — cheap synchronous check (`item.webkitGetAsEntry()?.isDirectory`) used by the drop handlers to decide which branch to take before doing the (async) full tree read.
2. `_use-folder-upload.ts`: a hook taking `{ folders, onCreateFolder, enqueue }` and exposing `uploadFolderTree(trees: FolderNode[], parentFolderId: string | null): Promise<void>`. BFS per level: for each node, find an existing folder (from `folders` plus any just-created-this-call ids, kept in a local map since state updates are async) matching `parent_folder_id === parentId && name.trim().toLowerCase() === node.name.trim().toLowerCase()`; if found reuse its id, else `await onCreateFolder(node.name, parentId)` and use the returned id. Once a node's id is resolved, `enqueue(node.files.filter(isValidUpload), resolvedId)` and recurse into `node.children` with that id as the new parent. Aggregate any files that fail `ALLOWED_UPLOAD_TYPES`/`MAX_FILE_SIZE` and `toast.warning(...)` a single summary at the end. Cap total file count (e.g. 200) with an upfront `toast.error(...)` + abort if exceeded, so an accidental huge/system folder drop doesn't hang the tab.
3. `_use-customer-assets.ts` and `_onboarding-wizard-v2.tsx`: change `handleCreateFolder` to return the created `AssetFolder`; update the shared `onCreateFolder` prop type in `_files-tab.tsx` accordingly (both call sites already `await` it, so this is additive).
4. `_files-tab.tsx`: instantiate `useFolderUpload({ folders, onCreateFolder, enqueue })`. Update `handleZoneDrop`, each folder tile's `onDropTile`, and a new root-level grid wrapper to check `hasDirectoryEntry(e.dataTransfer.items)` first — if true, `await readDataTransferItemsAsTree(...)` then `uploadFolderTree(tree, targetParentId)`; otherwise fall through to the existing `handleFiles(e.dataTransfer.files, targetParentId)` path unchanged.
5. `_files-toolbar.tsx`: add an "Upload folder" button (icon: `FolderUp` from `lucide-react`) beside the existing Upload button, same `openFolder && canEdit` gate. Add a second hidden `<input type="file" multiple ref={folderInputRef} />`; since `webkitdirectory` isn't in React's DOM attribute types, set it imperatively (`useEffect` on the ref, or a small typed wrapper) rather than passing it as a JSX prop. `onChange` hands `e.target.files` to `buildTreeFromRelativePaths` then `uploadFolderTree`.
6. Sanity-check `_use-files-tab-derived.ts`'s file-versioning grouping (`VersionGroup`/`olderVersions`) isn't confused by a folder re-upload that re-adds a same-named file into the same folder — confirm existing behavior (new asset row per upload) is what's expected here too; no change anticipated, verify only.
7. Manual verification in both Files tab locations (Project Files tab — legacy and v2 routes — and Onboarding Workspace Files tab): drag-and-drop of a real nested local folder, the "Upload folder" picker, at root and inside an existing folder, and a re-drop of the same folder to confirm merge (no duplicate folder created, new files added).

## Acceptance Criteria

- [ ] Dragging a local folder (with nested sub-folders and files) onto the open-folder drop zone in the Project Files tab creates the matching folder/sub-folder structure and uploads each file into its corresponding folder, with no manual per-folder clicking.
- [ ] Same result via the new "Upload folder" button (OS picker).
- [ ] Same result when dropped at the root level (no folder open) — becomes a new top-level folder tree.
- [ ] Same result when dropped directly onto a folder tile — becomes a sub-tree of that folder.
- [ ] All of the above work identically in the Onboarding Workspace Files tab.
- [ ] Re-dropping a folder whose name matches an existing folder at the same parent merges into it (no "(1)"-suffixed duplicate); files upload into the existing folder.
- [ ] Files failing type/size checks are skipped individually with one aggregated toast; the rest of the batch still uploads.
- [ ] Plain (non-folder) file drag-and-drop and the existing file picker are unaffected.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.
- [ ] New files stay within `nextjs-file-length-best-practices.md` guidance; no touched file crosses ~400–500 lines as a result of this change.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual: both Files tab locations, drag-and-drop + picker, root + nested folder, merge re-drop
```

No automated test runner is configured for this repo (per `CLAUDE.md`) — verification is TypeScript check, lint, and browser-based acceptance testing per the Verification steps above.

## Compatibility Touchpoints

- No packaging, docs-site, adapter, or install-surface impact — this is an in-app client feature using existing API routes.
- No new environment variables, dependencies, or migrations.
- `CLAUDE.md`'s Project Structure section needs no update — all new files land inside the existing `onboarding-workspace/` component folder alongside its siblings (`_upload-queue.tsx`, `_files-toolbar.tsx`, etc.), consistent with the existing colocation convention.

## Implementation Notes

### What Changed
- Added folder-tree upload to the shared presentational `FilesTab` (used by both the Project Files tab and the Onboarding Workspace Files tab): drag-and-drop of a local folder, or a new "Upload folder" picker button, now recreates the folder/sub-folder structure via `customer_asset_folders` and uploads each file into its matching folder.
- `hasDirectoryEntry`/`readDataTransferEntries` (drag-drop, via `webkitGetAsEntry` + recursive `readEntries`) and `buildTreeFromRelativePaths` (the `webkitdirectory` picker's `webkitRelativePath`) both normalize into the same `FolderNode[]` tree shape.
- `useFolderUpload` walks the tree top-down: for each node it reuses an existing same-named folder at that parent (case-insensitive, silent merge — no duplicate-name prompt, unlike the manual "New Folder" flow) or creates one via `onCreateFolder`, then hands that folder's valid files to the existing `useUploadQueue.enqueue` — no new upload primitive. Per-file type/size rejects are aggregated into one `toast.warning(...)` instead of the single-slot `rejectedFile` UI. A 200-file cap per drop is enforced upfront with a `toast.error(...)`.
- `onCreateFolder` (both the shared `useCustomerAssets` hook and the Onboarding Workspace's own inline copy) now returns the created `AssetFolder` instead of `Promise<void>`, so the walker can resolve a folder's id synchronously after creating it. This is additive — the existing manual "New Folder" call sites already just `await` it and ignore the return value.
- The open-folder drop zone, each folder tile's drop handler, and a new root-level drop wrapper (root previously accepted no drop at all) all branch on `hasDirectoryEntry` before falling through to the existing flat `handleFiles` path, so plain file drag-and-drop is unaffected.
- Added an "Upload folder" toolbar button beside the existing "Upload" button, using a second hidden `<input type="file" webkitdirectory multiple>` (attribute set imperatively via a ref callback — not a typed JSX prop).

### Files Changed
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_folder-upload-tree.ts` (new) — pure tree-building/traversal helpers, no React/fetch.
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_use-folder-upload.ts` (new) — the orchestration hook described above.
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab.tsx` — wired the new hook into drop handlers (zone, tile, new root wrapper) and the toolbar; widened the `onCreateFolder` prop type; added a "Preparing folders…" line while a walk is in flight.
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-toolbar.tsx` — added the "Upload folder" button + hidden `webkitdirectory` input and its props.
- `src/app/(hub)/projects/_shared/_use-customer-assets.ts` — `handleCreateFolder` now returns the created `AssetFolder`.
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx` — same return-type change to its own inline `handleCreateFolder`.

### Deviations From Plan
- Simplified `useFolderUpload` from the plan's sketch: a single `walk()` handles both the root case (`parentFolderId === null`) and nested levels uniformly (since `resolveFolderId`/`onCreateFolder`/the folders API already accept a `null` parent), rather than a separate root-specific code path as the task doc's implementation steps sketched. Fewer lines, same behavior.
- `walk` is a plain hoisted `function` declaration (not wrapped in `useCallback`) because it recurses on itself — wrapping it in `useCallback` produced a `react-hooks` self-reference lint error (`Cannot access variable before it is declared`). It isn't passed to any memoized child, so the lack of referential stability across renders doesn't matter; a narrow `eslint-disable-line react-hooks/exhaustive-deps` on `uploadFolderTree`'s own dependency array explains why `walk` is intentionally omitted (it always closes over the same `resolveFolderId`/`enqueue` already listed there).
- `_folder-tile.tsx` needed no changes, as anticipated in "Verify, modify if needed" — the directory-vs-file branch lives entirely in the closure `_files-tab.tsx` already builds for `onDropTile`.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task — unused `initialsFor`/`colorFor`)
- `pnpm dev` manual browser acceptance (drag-and-drop + picker, root + nested folder, merge re-drop, both Files tab locations) - SKIPPED (not run this session; recommend running before sign-off)

Note: `_files-tab.tsx` grew from 376 to 424 lines — still within `nextjs-file-length-best-practices.md`'s hard limit (400–500) though past its soft-warn line (250–300); the growth is wiring only (prop passing, drop-handler branching), with the actual new logic isolated into the two new files. `_onboarding-wizard-v2.tsx` grew by 2 lines (492 → 493, well-established as already over the soft-warn threshold pre-existing this task) from the `handleCreateFolder` return-type change only.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation found in any changed/new file.
- No `any` or untyped escape hatches — `FolderNode`, `AssetFolder | undefined`, and the DOM File-and-Directory-Entries API types (`FileSystemEntry`/`FileSystemDirectoryEntry`/`FileSystemFileEntry`, all present in this project's `lib.dom.d.ts`) are used throughout, verified against `node_modules/typescript/lib/lib.dom.d.ts` before writing the tree-traversal code.
- Function/file responsibilities are cleanly separated: `_folder-upload-tree.ts` is pure tree-building/traversal (no React, no fetch); `_use-folder-upload.ts` is orchestration only (folder resolve/create + delegating to the existing upload queue); `_files-tab.tsx`/`_files-toolbar.tsx` changes are wiring only.
- Found and fixed one real duplication during this pass: the valid/invalid file-splitting-then-enqueue logic was written twice in `_use-folder-upload.ts` (once for loose root-level files, once inside `walk`'s per-node case) — extracted into a shared `enqueueValid()` helper. Re-verified `npx tsc --noEmit` and `pnpm lint` clean after the change.
- Found and removed one unnecessary type cast during this pass: `_files-toolbar.tsx`'s folder-input ref callback originally cast `folderInputRef` to `{ current: HTMLInputElement | null }` to assign `.current` — unneeded, since this project's React 19 `RefObject<T>` types `current` as mutable (not `readonly`), confirmed directly against `node_modules/@types/react/index.d.ts`. Removed the cast; `tsc`/`lint` stayed clean.
- Errors are handled intentionally: a failed folder creation (`resolveFolderId` returning `null`) causes that node's files/children to be silently skipped rather than thrown, matching the existing codebase pattern of non-fatal per-item failure (e.g. `handleUpload`'s existing `if (!assetRes.ok) return;`). Per-file type/size rejects are aggregated into one end-of-walk `toast.warning(...)` rather than surfaced individually.
- One narrow `eslint-disable-line react-hooks/exhaustive-deps` is used (on `uploadFolderTree`'s dependency array, to omit the intentionally-non-memoized recursive `walk` helper) with an inline comment explaining why — this is a targeted, justified suppression of a specific false-positive-in-this-case warning, not a blanket rule disable.
- Impeccable design-hook findings (`design-system-font-size`) surfaced on every edited line in `_files-toolbar.tsx`/`_files-tab.tsx`/`_onboarding-wizard-v2.tsx` are false positives: this codebase's `CLAUDE.md` explicitly documents arbitrary `text-[Npx]` Tailwind values as the established, intentional convention (not a generic design-system-token ramp) — new code matches the existing pattern in each file rather than introducing a new one.
- No secrets, credentials, or debug logging introduced.
- Project conventions followed: no `npm`/`yarn` commands run, no git commands run, no new env vars/deps/migrations, `"use client"` present on both new hook/util-adjacent files that use React hooks (`_use-folder-upload.ts`) — `_folder-upload-tree.ts` correctly omits it (pure functions, no React).

### Deviations
- Minor: implementation simplified the task doc's sketched "separate root-specific code path" for `walk` into one uniform function that accepts a nullable `parentFolderId` (the folders API and `resolveFolderId` already supported `null`) — same behavior, less code, documented in Implementation Notes.
- Minor: `walk` implemented as a plain hoisted `function` declaration rather than `useCallback`-wrapped, to avoid a self-reference lint error; documented in Implementation Notes and inline in the file.
- No Medium or Major deviations. No scope expansion — verified the diff touches only the 6 files listed in Implementation Notes (4 modified, 2 new), and no out-of-scope file (upload/sign route, folders API route, schema, RLS, manual New Folder flow, workspace URL-param scheme, attachment flows outside customer-assets) was touched.

### Required Fixes
- None.

## Post-Quality-Gate Scope Addition (same session, user request)

After the quality gate passed, the user asked to widen the Files tab's accepted-file-type allow-list to add `.ico`, `.zip`, `.rar`, `.js`, `.ts`, and `.xml`, and asked whether uploads hit Vercel's ~4.5 MB body-size ceiling.

- **Vercel ceiling:** confirmed no — this upload path is browser-direct-to-Storage via a signed URL (task 350); only small JSON requests transit Vercel route handlers, not the file bytes.
- **Malware scanning:** the user explicitly asked these new types (especially `.zip`/`.rar`/`.js`/`.ts`) have "proper malware detection." No scanning exists anywhere in this pipeline today. Rather than bolt on a fake/inline check, presented the user options via `AskUserQuestion`; they chose **"Add types now, scan later"** — widen the allow-list immediately (matching today's MIME+size-only validation for every other type) and track real scanning as separate follow-up work. Created `_docs/task/373-malware-scanning-upload-pipeline.md` (Planned) for that follow-up.
- **Type-list changes:** updated `ALLOWED_UPLOAD_TYPES` in `onboarding-workspace/_file-upload-constants.ts` (client) **and** discovered + updated a second, server-side `ALLOWED_MIME_TYPES` in `src/lib/uploads/customer-asset-storage.ts` that the `/upload/sign` route and the legacy multipart route actually enforce — the two lists are documented as needing to stay in lockstep, and a client-only change would have silently 400'd every new type at the sign step. Also updated both routes' user-facing "Unsupported file type" error text to list the new categories.
- Flagged two real MIME-sniffing reliability caveats inline in code comments (not swept under the rug): `.ico` and `.zip`/`.rar` each need two MIME-type variants since browsers disagree on which one `file.type` reports; `.ts` is a genuine ambiguity — browsers commonly report TypeScript files as `video/mp2t` (the MPEG transport-stream video MIME type) rather than any text/script type, so this allow-list cannot reliably distinguish a `.ts` source file from an actual `.mp2t` video by MIME alone.
- Verification: `npx tsc --noEmit` + `pnpm lint` PASS after these changes (same 2 pre-existing unrelated warnings in `_checklist-tab.tsx`).
- Not run: browser acceptance confirming the new types actually upload successfully end-to-end through the signed-URL flow.
