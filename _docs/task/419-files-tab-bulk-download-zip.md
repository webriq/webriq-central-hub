# 419: Files Tab — Bulk Download (Multi-Select Files / Folders → .zip)

**Created:** 2026-10-05
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed (2026-10-05)

---

## Overview

The Project > Files tab can download exactly one file at a time (kebab/right-click → Download on a file tile). There is no way to pull down several files, or a whole folder, in one action. This task adds:

1. **Multi-file download** — select files in an open folder, download them as one `.zip` (a single selected file downloads directly, un-zipped).
2. **Folder download** — download a folder (and all its sub-folders) as a `.zip` that preserves the folder tree.
3. **Multi-folder / mixed selection** — folders become selectable (they are not today), so files + folders can be downloaded together, including from the Files root.

Entry points, per the request: the **kebab (⋮) menu and the right-click context menu** of every file/folder tile (one `ItemAction[]` already feeds both — see `_file-actions-menu.tsx`), plus a **Download** button on the existing multi-select `BulkToolbar`.

Design brief: product register (PRODUCT.md — "precise, calm, uncluttered"; serious internal tooling). Follow `frontend-design` + `impeccable` guidance: reuse the Files tab's existing token set (`#007BFF` accent, `#E2E7F2` borders, `textPrimary/textMuted`), spend visual weight in exactly one place (the progress feedback), no gradients, no side-stripe borders, no emoji, lucide icons only, explicit loading/empty/error states, visible focus rings, `prefers-reduced-motion` respected.

File-length constraint (`nextjs-file-length-best-practices.md`): components 100–250 lines, hooks 30–100, API handlers 50–150, soft warning at 250–300, hard limit 400–500. **`_files-tab.tsx` is already 424 lines — this task must leave it net-shorter, not longer** (extract, don't append). Every new file stays under ~150 lines.

## Requirements

### Behaviour
- [ ] **Folder tile kebab + context menu** gets "Download as .zip" (available to every role that can see the folder — NOT gated on `canEdit`, same as file Download/View). Includes all nested sub-folders and files; zip entries keep relative paths (`<folder>/<sub>/<file>`).
- [ ] **File tile kebab + context menu**: when this tile is part of a multi-selection (≥2 items), add "Download N selected (.zip)" at the top of the read-only group. Existing single "Download" is unchanged.
- [ ] **Folders become selectable.** Add a checkbox control to `FolderTile` (top-left, shown on hover / keyboard focus / whenever any selection exists — so touch users and keyboard users can reach it). Clicking the tile body still opens the folder.
- [ ] **BulkToolbar** is shown whenever ≥1 file **or** folder is selected (including at the Files root). Adds a primary "Download" button. Move / Share / Delete remain **files-only**: hidden when the selection contains any folder (folder permissions/delete stay on the folder kebab) — no new destructive bulk behaviour.
- [ ] "Select all" in the BulkToolbar selects every visible file in the open folder (visible = after search filter); at root, every visible folder.
- [ ] Selection is cleared on folder navigation and on `Escape`.
- [ ] Download of exactly one selected file → direct signed-URL download (existing path, no zip). Anything else → zip.
- [ ] Zip filename: single folder → `<folder-name>.zip`; otherwise `<project-or-customer-name>-files-<YYYY-MM-DD>.zip`. Sanitize to filesystem-safe characters.
- [ ] **Version groups**: the grid collapses same-named files in a folder into one tile (newest wins, task earlier version-grouping). A zip contains the **latest version only** per (folder, file name) — matches what the user sees. Remaining name collisions (e.g. after sanitising) get a ` (n)` suffix, never silently overwritten.
- [ ] **Permissions**: only assets the caller may access are included (same rule as `file-url`: admin/super_admin always; else no restriction OR role match OR user-id match). Excluded files are reported in the final toast ("3 files skipped — you don't have access"); no extra file is added inside the zip.
- [ ] Non-file assets (`type !== "file"`, links/credentials) and rows with no `file_path` are never included.
- [ ] **Limits** (server-enforced, constants in one file): max 500 files and 750 MB total per zip. Over the limit → clear 413 message ("This selection is 1.2 GB (limit 750 MB). Download a smaller selection or individual sub-folders.").
- [ ] Empty folder (no downloadable files) → no download; toast "Nothing to download in <folder>."

### Feedback / UX
- [ ] One sonner toast per download with a stable id, updated through states: `Preparing 12 files…` → `Zipping 4 of 12…` → `Downloaded 12 files · 4.2 MB` (success) or a warning variant when files were skipped/failed. Toast action **Cancel** while in flight (AbortController).
- [ ] BulkToolbar Download button shows spinner + disabled while a download is running; the kebab item is disabled while a download is already in flight (one at a time — avoids parallel multi-hundred-MB zips in memory).
- [ ] Failure of an individual file fetch does not abort the whole zip: failed files are counted and reported in the final toast ("Downloaded 11 of 12 — 1 failed"). Total failure → `toast.error` with the reason.
- [ ] Copy follows the vocabulary already used on the tab ("Download", "Remove"); verbs identical across menu, toolbar, toast.
- [ ] A11y: folder checkbox is a real `<button aria-pressed>` or `<input type="checkbox">` with `aria-label="Select <name>"`; toolbar count announced via `aria-live="polite"`; icon-only buttons have `aria-label`; focus-visible rings preserved.

### Non-functional
- [ ] No migration, no new env var.
- [ ] Works in both `/projects/v2/[projectId]/files` and `/projects/legacy/[projectId]/files`, and — because they share the presentational `FilesTab` — in the Onboarding Workspace Files tab for free (it passes `customerId`; the endpoint is customer-scoped).
- [ ] Any `.select()` that can exceed 1000 rows (folders/assets of a customer) paginates with `.range()` (CLAUDE.md rule).

## Out of Scope / Must-Not-Change

- No server-side zip streaming/proxying of file bytes (Vercel function duration/memory + the ~4.5 MB body cap on handlers; see CLAUDE.md "Route handlers accepting large request bodies"). Bytes go browser ← Supabase Storage directly via signed URLs.
- No bulk Share/Move/Delete for folders; no change to existing file bulk actions' behaviour.
- No change to upload flows, version-grouping logic, deep links (`?folder=`/`?file=`, task 359), or the Onboarding Workspace's name-path URL scheme.
- Do not include prior versions of a file, non-file assets, or credentials in any zip.
- Do not edit `src/app/(hub)/projects/v2/[projectId]/_onboarding-wizard.tsx` (legacy wizard with its own inline explorer).
- No `style={{}}` (except the existing fixed-position menu coordinates), no `dark:` classes, no new shadcn primitives (CLAUDE.md UI conventions). Use `pnpm`, never npm/yarn.
- No git commands (CLAUDE.md).

## Proposed File Changes

All paths under `src/` unless noted. `OW` = `app/(hub)/projects/v2/[projectId]/onboarding-workspace`.

| File | Action | Purpose |
|------|--------|---------|
| `package.json` / lockfile | Modify (`pnpm add client-zip`) | ~2.6 KB streaming zip writer (`downloadZip`), dynamic-imported on first use. Alternative if rejected: `fflate`. |
| `lib/uploads/asset-access.ts` | Create (~30 lines) | `canAccessAsset(asset, { role, userId })` — the permission predicate currently inlined in `file-url/route.ts`, extracted so manifest + file-url can't drift. |
| `app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts` | Modify (small) | Swap inline predicate for `canAccessAsset`. Behaviour identical. |
| `lib/uploads/download-manifest.ts` | Create (~110 lines) | Pure logic: expand folder ids → descendant folders (cycle-safe), pick latest version per (folder, name), build zip-relative paths + dedupe suffixes, apply limits. No Supabase calls inside → unit-checkable. |
| `config/download-limits.ts` | Create (~10 lines) | `MAX_ZIP_FILES = 500`, `MAX_ZIP_BYTES = 750 * 1024 * 1024`. |
| `app/api/customers/[customerId]/assets/download-manifest/route.ts` | Create (~120 lines) | `POST {assetIds?, folderIds?}` → auth, RLS-scoped reads (paginated), permission filter, manifest build, batch `createSignedUrls` (TTL 10 min, `download` option omitted — client-zip reads bytes, not a navigation), returns `{ zipName, entries:[{path,url,size}], skipped, totalBytes }`. 413 on limit, 404 if nothing resolvable. |
| `OW/_use-bulk-download.ts` | Create (~100 lines) | Hook: `{ downloading, download(target), cancel() }`. Calls the manifest route, dynamic-imports `client-zip`, streams `fetch(url)` per entry through an async generator, updates the sonner toast, saves the Blob via an `<a download>`, handles per-file failure + abort. Single-file target short-circuits to the existing `file-url?download=1` path. |
| `OW/_use-files-selection.ts` | Create (~70 lines) | Extracted from `_files-tab.tsx`: `selectedIds` + new `selectedFolderIds`, `toggleFile/toggleFolder/clear/selectAll`, auto-clear on `openFolderId` change, `Escape` handler. |
| `OW/_bulk-toolbar.tsx` | Modify (+~25 lines → ~96) | Add Download button, `selectAll`, `aria-live` count ("3 files, 1 folder selected"); hide Move/Share/Delete when `folderCount > 0`. |
| `OW/_folder-tile.tsx` | Modify (+~25 lines → ~120) | Selection checkbox, `selected` styling (same `bg-[#EAF2FF] border-[#007BFF]` as files), "Download as .zip" action in `actions`. |
| `OW/_file-tile.tsx` | Modify (small) | Add optional `onDownloadSelected` + `selectedCount` props; when `selected && selectedCount > 1`, prepend "Download N selected (.zip)". (File is 271 lines — keep the addition ≤ 10 lines.) |
| `OW/_files-tab.tsx` | Modify (**net −30+ lines**) | Replace inline selection state/handlers with `useFilesSelection`; wire `useBulkDownload`; pass new props. Bulk-delete/move wiring unchanged. If it still ends > 400 lines, also extract the `deleteDialogCopy` IIFE + `PendingDelete` union into `_files-delete-dialog.tsx`. |
| `_docs/central-hub-mcp-tools.md` | — | **No change** (no `registerTool` added). |

## Code Context

### File: `OW/_file-actions-menu.tsx` — the single seam for kebab + context menu

```tsx
export type ItemAction = { label: string; icon: typeof Pencil; onClick: () => void; danger?: boolean; disabled?: boolean };
// ActionsMenu (kebab) and the right-click menu in _files-tab.tsx BOTH render ItemAction[] —
// adding an entry to a tile's `actions` array surfaces it in both places. Do not add a second list.
```

### File: `OW/_folder-tile.tsx` (current action list — add Download first, above Permissions)

```tsx
const actions: ItemAction[] = [
  ...(onCopyFolderUrl ? [{ label: "Copy Folder URL", icon: Link2, onClick: onCopyFolderUrl }] : []),
  { label: "Permissions", icon: Lock, onClick: ..., disabled: !canEdit },
  ...(folder.is_system ? [] : [ { label: "Rename", ... }, { label: "Delete", ..., danger: true } ]),
];
// Tile body is a <button onClick={onOpen}> — the new selection control must be a SIBLING
// (absolute top-2 left-2), not nested, to avoid button-in-button and to keep click-to-open intact.
```

### File: `OW/_file-tile.tsx` (existing single download — the model for the 1-file shortcut)

```tsx
const res = await fetch(`/api/customers/${customerId}/assets/${asset.id}/file-url?download=1`);
const data: { url: string } = await res.json();
// -> <a href=data.url target=_blank download> click
// Tile body toggles selection (aria-pressed); View/Download live only in kebab/context menu.
```

### File: `api/customers/[customerId]/assets/[assetId]/file-url/route.ts` — permission rule to extract

```ts
const isPrivileged = myRole === "admin" || myRole === "super_admin";
const noRoleRestriction = !asset.allowed_roles || asset.allowed_roles.length === 0;
const noUserRestriction = !asset.allowed_user_ids || asset.allowed_user_ids.length === 0;
const roleMatches = !noRoleRestriction && !!myRole && asset.allowed_roles!.includes(myRole);
const userMatches = !noUserRestriction && asset.allowed_user_ids!.includes(user.id);
const permitted = isPrivileged || (noRoleRestriction && noUserRestriction) || roleMatches || userMatches;
// Reads use the session client (RLS) ; only createSignedUrl(s) uses adminClient — keep that split.
```

### File: `OW/_use-files-tab-derived.ts` — shapes the manifest logic must mirror

```ts
// versionGroups: files sharing exact (file_name ?? label) in the same folder -> newest by created_at wins.
// foldersById / parent_folder_id chains: arbitrary depth; existing code carries a cycle guard
// (`seen` Set) — reuse the same defensive pattern in download-manifest.ts.
```

### Types (`OW/_wizard-v2-types.ts`)
`AssetRow` (`type: "file"|"link"|"credential"`, `file_path`, `file_name`, `file_size`, `folder_id`, `allowed_roles`, `allowed_user_ids`, `created_at`) and `AssetFolder` (`parent_folder_id`, `name`, `allowed_roles`, `allowed_user_ids`).

### Zip streaming sketch (client)

```ts
const { downloadZip } = await import("client-zip");
async function* files() {
  for (const e of manifest.entries) {
    const res = await fetch(e.url, { signal });
    if (!res.ok) { failed.push(e.path); continue; }
    yield { name: e.path, input: res, lastModified: ... };
    toast.loading(`Zipping ${++done} of ${total}…`, { id });
  }
}
const blob = await downloadZip(files()).blob();
```

**Verify early (Step 1):** Supabase Storage signed-URL GETs must be CORS-readable from the app origin for `fetch()` (not just navigable). If the `customer-assets` bucket does not return `Access-Control-Allow-Origin` for the app origin, fall back to the documented alternative below.

## Implementation Steps

1. **De-risk CORS + library.** `pnpm add client-zip`. In a scratch route/devtools, `fetch()` a signed `customer-assets` URL from `localhost:3000` and confirm bytes are readable. If blocked → switch to the fallback (server streams zip via `fflate` from a Route Handler, capped at the same limits, with a note on Vercel duration) and update this doc before continuing.
2. Create `config/download-limits.ts` and `lib/uploads/asset-access.ts`; refactor `file-url/route.ts` onto `canAccessAsset` (behaviour-identical).
3. Create `lib/uploads/download-manifest.ts` (pure): descendant expansion with cycle guard → latest-version selection → path building (sanitize, dedupe ` (n)`) → limit checks. Sanity-check with a throwaway `tsx`/node script against fixtures: nested folders, same-name versions, name collisions, cycle, empty folder.
4. Create `download-manifest/route.ts`: auth → paginated RLS reads of the customer's `customer_assets` (type=file) and `customer_asset_folders` → `canAccessAsset` filter → manifest → batch `createSignedUrls`. Validate body with zod (`assetIds`/`folderIds` arrays of UUIDs, ≥1 combined, caps on array length).
5. Create `_use-bulk-download.ts` (manifest call, dynamic `client-zip`, per-file failure tolerance, AbortController cancel, sonner toast lifecycle, Blob save + `URL.revokeObjectURL`).
6. Create `_use-files-selection.ts`; refactor `_files-tab.tsx` onto it (net line reduction), clear-on-navigate, Escape.
7. Update `_folder-tile.tsx` (checkbox + selected style + "Download as .zip"), `_file-tile.tsx` (multi-select download entry), `_bulk-toolbar.tsx` (Download, Select all, aria-live, folder-aware button set).
8. Wire everything in `_files-tab.tsx`; confirm the right-click menu picks up the new actions (it consumes the same `ItemAction[]`).
9. Polish pass with `impeccable` (hover/focus/empty/loading states, touch target ≥ 32px for the folder checkbox, reduced motion) and re-check file lengths: `wc -l` on every touched/new file — new files < 150, `_files-tab.tsx` lower than 424.
10. Verify (below), then update the task row in `TASKS.md` per the workflow.

## Acceptance Criteria

- [ ] Right-click and kebab on a **folder** show "Download as .zip"; result unzips to `<folder>/<sub-folders>/<files>` with correct names and bytes (spot-check by size/checksum of 2 files).
- [ ] Select 3 files in an open folder → toolbar "Download" → single `.zip` with exactly those 3; selecting 1 file downloads it un-zipped under its real name.
- [ ] Right-click a selected file while ≥2 are selected → "Download N selected (.zip)" present and works; right-click an unselected file → only the normal single "Download".
- [ ] At the Files root, tick 2 folders → toolbar appears with "Download" only (no Move/Share/Delete) → zip contains both trees.
- [ ] Mixed selection (files + folders) never offers Move/Share/Delete.
- [ ] A file with 3 same-name versions contributes only the newest to the zip; same-name collisions never overwrite (`name (1).ext`).
- [ ] As a role without access to a restricted file, that file is absent from the zip and the toast reports the skipped count; admin gets it.
- [ ] > 500 files or > 750 MB → 413 with the specified message; nothing downloads, no partial zip.
- [ ] Empty folder → "Nothing to download in <folder>." and no file saved.
- [ ] Cancel in the toast aborts in-flight fetches, saves nothing, and re-enables the buttons.
- [ ] One failing file fetch still yields a zip of the rest, with "Downloaded 11 of 12 — 1 failed".
- [ ] Selection clears on folder navigation and Escape; folder tile click still opens the folder; checkbox click does not.
- [ ] Keyboard-only: folder checkbox reachable and toggleable (Space), focus ring visible; toolbar count announced.
- [ ] Works on `/projects/v2/[projectId]/files` **and** `/projects/legacy/[projectId]/files`; Onboarding Workspace Files tab not regressed (existing upload/rename/move/delete/bulk-share still work).
- [ ] `_files-tab.tsx` line count is lower than before (424); no new/touched file over the 400-line hard limit; new files < 150 lines.
- [ ] No `style={{}}`/`dark:` introduced; no console errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
wc -l "src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/"{_files-tab,_folder-tile,_file-tile,_bulk-toolbar,_use-bulk-download,_use-files-selection}.* \
  src/lib/uploads/download-manifest.ts "src/app/api/customers/[customerId]/assets/download-manifest/route.ts"
pnpm dev   # then browser acceptance on /projects/v2/<id>/files (grid + list view) with a project that has nested folders
```

Browser acceptance (no test runner in this repo): run the Acceptance Criteria above as a manual script; test with a ≥ 50-file folder for progress behaviour and one restricted-permission file as a non-admin user. Throwaway fixture script for `download-manifest.ts` lives in the scratchpad, not the repo.

## Compatibility Touchpoints

- **Dependencies:** one new small runtime dependency (`client-zip`). Document in CLAUDE.md "Key Conventions" at the document stage (one line: Files-tab bulk download is client-side zipping over signed URLs; limits live in `config/download-limits.ts`).
- **Storage/Vercel:** no bytes transit a Vercel handler; the manifest route returns JSON only (well under any body cap). Signed URLs are short-lived (10 min) and scoped per object.
- **Shared component:** `OW/_files-tab.tsx` is shared with the Onboarding Workspace — changes there must keep that caller working (props are additive/optional).
- **RLS/permissions:** reads stay on the session client; `adminClient` only signs URLs, mirroring `file-url`. Permission predicate centralised in `asset-access.ts`.
- **Known follow-ups (not in this task):** File System Access API streaming-to-disk for zips beyond the in-memory limit; comment-attachment and task/issue-attachment bulk download; a periodic zip-size telemetry log.
- **MCP tools doc:** unaffected.

## Implementation Notes

### What Changed
- Files tab bulk download: folder kebab/right-click "Download as .zip"; folders are now selectable (checkbox sibling of the open button); `BulkToolbar` shows for any file/folder selection with Download + Select all, and hides Share/Move/Delete when a folder is selected; a selected file's menu gains "Download N selected (.zip)" when ≥2 are selected. One selected file downloads directly.
- New permission-filtered `POST .../assets/download-manifest` returns zip paths + 10-min signed URLs (batch `createSignedUrls`); the browser zips with `client-zip` (dynamic import), with a cancelable sonner progress toast and per-file failure tolerance. Limits 500 files / 750 MB (413 with message).
- Permission predicate extracted to `lib/uploads/asset-access.ts` and used by `file-url` (behaviour identical). Folders the caller can't see are skipped with their subtree.
- `_files-tab.tsx` shrank 424 → 401 lines (selection hook + delete dialog extracted).

### Files Changed
- `package.json`, `pnpm-lock.yaml` - `client-zip@2.5.1`
- `src/config/download-limits.ts`, `src/lib/uploads/asset-access.ts`, `src/lib/uploads/download-manifest.ts` - new
- `src/app/api/customers/[customerId]/assets/download-manifest/route.ts` - new
- `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts` - uses `canAccessAsset`
- `OW/_use-bulk-download.ts`, `OW/_use-files-selection.ts`, `OW/_files-delete-dialog.tsx` - new
- `OW/_files-tab.tsx`, `_folder-tile.tsx`, `_file-tile.tsx`, `_bulk-toolbar.tsx` - modified
- `OW/_file-actions-menu.tsx` - added shared `selectionDownloadAction()` (post-testing fix, below)

### Deviations From Plan
- Extracted `_files-delete-dialog.tsx` (the plan's conditional fallback) to get `_files-tab.tsx` under its prior size.
- Folder-level permissions are enforced (invisible folder + subtree skipped) in addition to asset-level ones; plan only specified asset-level.
- Step 1 CORS check NOT run: no `.env.local` in this checkout, so a signed URL couldn't be minted. Supabase Storage normally returns permissive CORS for signed GETs, but this is unverified — first browser run must confirm; fallback is in the plan.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; warnings pre-existing/unrelated)
- Manifest builder fixture script (versions, case-insensitive grouping, sanitising, hidden folder, dedupe) - PASS
- Browser acceptance - SKIPPED (no live session/env)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during the gate: removed dead `abortRef`/`cancel` from `_use-bulk-download.ts` (cancel is only via the toast's controller); `assetIds.includes` inside a loop in `download-manifest.ts` replaced with a `Set`. `tsc` and `pnpm lint` re-run clean (0 errors).
- File sizes: all new files < 120 lines; `_files-tab.tsx` 401 (was 424); `_file-tile.tsx` 277 (was 271, past the 250 soft warning, under the hard limit — pre-existing, +6 lines only).
- No `style={{}}`, `dark:`, emoji, `any`, or debug logging added. `adminClient` used only for URL signing; reads on the session client; reads paginated with `.range()`.

### Deviations
- Minor: folder-level permission filtering added beyond the plan (matches the folders API's own `canSeeFolder` semantics).
- Minor: extra `_files-delete-dialog.tsx` extraction (the plan's contingency).
- Minor: when every selected file is access-restricted the route returns 404 and the toast says "Nothing to download" rather than naming the access reason; `skipped` is in the response but unused in that branch. Acceptable; revisit if testers find it confusing.
- Unverified (carried from implement): browser CORS read of signed URLs — to confirm in `test`.
- Not a deviation, but note: `canAccessAsset` duplicates the older inline predicates in `assets/route.ts` / `folders/route.ts` (`canSeeAsset`/`canSeeFolder`); left untouched as out of scope.

### Required Fixes
- None.

### Quality Gate Notes — follow-up (folder multi-select menu fix)

#### Result
PASS

- Bug fix after testing feedback: folder kebab/context menu lacked the "Download N selected (.zip)" entry, so a multi-folder selection downloaded only the right-clicked folder. Folder tile now takes `selectedCount`/`onDownloadSelected`.
- Simplified: the entry was duplicated in file and folder tiles → extracted `selectionDownloadAction()` in `_file-actions-menu.tsx`, used by both. Dropped the now-unused `Download` import from `_folder-tile.tsx` if present. `tsc` + `pnpm lint` clean (0 errors).
- No deviations; no scope added.

## Post-Testing Fix

**Reported:** multi-selecting several folders and downloading as zip only downloaded the last one.

**Root cause:** the "Download N selected (.zip)" kebab/right-click entry existed only on file tiles. A folder tile's menu always offered just "Download as .zip" (that one folder), so using the menu with several folders selected zipped only the folder acted on. The toolbar Download button and the zip/manifest path were correct (a multi-root zip was verified directly against `client-zip`).

**Fix:** `FolderTile` now takes `selectedCount`/`onDownloadSelected` and, when selected within a ≥2 selection, leads its menu with "Download N selected (.zip)". The entry was extracted into `selectionDownloadAction()` in `_file-actions-menu.tsx` and is used by both file and folder tiles. `npx tsc --noEmit` and `pnpm lint` PASS (0 errors).

## Completion Notes

- Closed at the user's request. Browser acceptance was **not run by the agent** (no `.env.local` in this checkout); the signed-URL CORS read (plan Step 1) remains unverified by the agent. The user's own test surfaced the multi-folder bug above, i.e. the feature was exercised live and the zip download path itself worked.
- Docs stage follow-up still open: add the one-line CLAUDE.md note (Files-tab bulk download = client-side zip over signed URLs; limits in `src/config/download-limits.ts`).
