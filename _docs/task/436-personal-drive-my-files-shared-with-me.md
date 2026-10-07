# 436: Personal Drive — per-user files & folders ("My Files" + "Shared with me")

**Created:** 2026-10-07
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep (new data model + migration, new private Storage bucket, RLS with recursive folder-share inheritance, new UI surface)
**Status:** Completed

---

## Overview

Staff have nowhere in the Hub to keep their own files (meeting minutes, notes exports, working docs). The Projects > Files tab stores files **per customer/project** (`customer_assets`), so it is the wrong home for personal material. This task adds a Google-Drive / Zoho-WorkDrive-style **personal drive**: every staff user gets a private file tree (folders + files) and can optionally share a folder or file with specific people or roles. It reuses the Project Files tab's feature set and UX (grid/list, breadcrumbs, search/sort, drag-drop + folder upload, upload queue with progress, rename, move, bulk select + download, previews, delete confirmation) but is **user-scoped, not project-scoped**.

One sidebar entry opens a page with two sections (user's request):

- **My Files** — the user's own drive. Full CRUD.
- **Shared with me** — everything other people shared with the user (folders/files), read-only or editable per the share's permission.

## Decisions & Assumptions (review these first)

| # | Decision | Why / how to override |
|---|----------|----------------------|
| D1 | **Name: "Drive"** (sidebar label + page title), route `/drive`, sections *My Files* / *Shared with me*. | User asked for two inner categories rather than picking a single name. "Drive" avoids reusing Zoho's "WorkDrive" product name while the Hub replaces Zoho, and avoids colliding with Projects > Files. Label lives in one constant (`DRIVE_LABEL`) — renaming to "WorkDrive" is a one-line change. |
| D2 | **Private by default + optional sharing** (confirmed with user). Share a folder or file with a **user** or a **role**, as `view` or `edit`. Folder shares **inherit to all descendants**. **No admin/super_admin override** — admins see only what's shared with them. | Mirrors Project Notes folder sharing (migration 127, `note_folder_shares`). |
| D3 | **All staff roles, no clients** (confirmed): `admin, super_admin, pm, developer, hr, marketing`. `client` blocked in page guard, API and RLS. | Matches the "staff-only, no policy widens to client" convention. |
| D4 | **New tables + new private bucket**, not `customer_assets` reuse. | `customer_assets.customer_id` is `NOT NULL FK`, its RLS is "any authenticated user", and `allowed_roles/allowed_user_ids` mean **NULL = everyone** (the inverse of a personal drive). Reusing it would leak files. |
| D5 | **Project Files components are not modified.** Reuse the generic pieces by import; write drive-specific replacements for the two that hard-code `/api/customers/${customerId}/assets/...` URLs (`_file-tile.tsx`, `_use-bulk-download.ts`) and for `_permission-picker.tsx` (inverted semantics). | Verified by grep: only `_file-tile.tsx` and `_use-bulk-download.ts` embed customer URLs. Everything else is prop-driven and typed on `AssetRow`/`AssetFolder`, reachable via a small adapter (`toAssetRow` / `toAssetFolder`). **Step 1 re-verifies this before any code is written.** |
| D6 | Upload path = **browser-direct signed URL** (same as task 350), 200 MB cap, MIME allowlist = `ALLOWED_MIME_TYPES` (incl. PowerPoint) **plus audio/video for meeting recordings** (confirmed with user): `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/wav`, `audio/x-wav`, `audio/webm`, `audio/ogg`, `video/mp4`, `video/quicktime`, `video/webm`. | Vercel's ~4.5 MB handler body cap; established pattern. The audio/video list is a **drive-only** constant (`DRIVE_MEDIA_MIME_TYPES` in `src/lib/drive/storage.ts`); the shared `ALLOWED_MIME_TYPES` and every other upload surface stay unchanged. Files over 200 MB are rejected with the standard message. There is no per-user quota (see Out of Scope). Preview: HTML5 `<audio>`/`<video>` player in the preview modal (drive-local, since `_file-previews.tsx` is not edited); the client-side allowlist for the drive is a drive-local constant composed from `ALLOWED_UPLOAD_TYPES` + the media list. |
| D10 | **Share notifications: none in v1** (confirmed). Label **"Drive"** (confirmed). | Recipients discover items in *Shared with me*. |
| D7 | Hard delete (no trash/restore), same as Project Files. Folder delete removes the subtree and its Storage objects. | Parity. Trash is a follow-up. |
| D8 | No share notifications in v1 — recipients discover items in *Shared with me*. | Keeps scope tight; flagged in Open Questions. |
| D9 | Nav placement: **Knowledge** group (next to Wiki), icon `HardDrive`/`FolderOpen` from lucide. | Files-for-knowledge; avoids bloating Work. |

## Requirements

### Browsing (both sections)
- Grid/list toggle, search (within the current folder tree), sort (newest / name), breadcrumbs, folder tiles with item counts, file tiles with thumbnail/icon, size, date, type — same as Project Files.
- Deep links: `/drive?view=mine|shared&folder=<folderId>&file=<fileId>` (folder opens it; `file` opens the file's own folder + auto-opens the preview). Sync URL via `window.history.replaceState` (task 359 precedent), not `router.replace`. Unresolvable ids fall back to the section root.
- Preview modal for images, PDF, text/markdown, office files as in `_file-previews.tsx`; download via signed URL (`?download=1`).

### My Files (owner)
- Upload files (picker, drag-drop, whole-folder drop with folder-structure recreation, paste not required), create/rename/delete folder, rename/move/delete file, bulk select → bulk download (zip manifest) / bulk move / bulk delete.
- Upload at **root** is allowed (unlike the project tab, which requires a folder): files and folders may live at the drive root.
- **Share** action on every folder and file → share dialog: people/role picker, `View`/`Edit`, current-access list with remove/change, explicit line "Only you can see this" when there are no shares. Shared items show a small `Users` badge in tiles.

### Shared with me
- Top level lists **items shared directly** (folders and files), each with *Shared by {name}* and a permission chip (`View` / `Edit`, neutral chips per design system — chips are read-only).
- Opening a shared folder lets the user navigate its subtree (inherited).
- `view`: browse, preview, download only. `edit`: also upload, create subfolder, rename, move **within that shared subtree**, delete **files they uploaded or any file in an edit-shared folder** — but **never** delete/rename/move/re-share the shared root itself and **never** change shares (owner only).
- A role-based share reaches everyone with that role; user-based shares reach that user. A user who is both owner and grantee sees the item only in My Files.

### Cross-cutting
- Skeleton states while loading (no centered spinner). Empty states teach (see Content).
- Errors inline or `sonner` toast with problem + fix; no apology.
- All API routes: zod-validated, `createClient()` for auth + reads (RLS does the access control), `adminClient` **only** for Storage signing/removal after an app-level access check, each with an inline comment saying why.

## Out of Scope / Must-Not-Change

- **Do not modify** any file under `src/app/(hub)/projects/**` (Project Files tab, onboarding workspace), `customer_assets`, `customer_asset_folders`, the `customer-assets` bucket, or `/api/customers/**`. Imports from them are allowed; edits are not.
- No trash / restore / version history, no per-user storage quota, no file-content search, no malware scan (task 373 covers the shared upload pipeline separately), no transcoding/transcription/waveform of recordings (plain playback only), no real-time collaboration/presence, no share-link (public URL) sharing, no share notifications (D8), no "starred/recent" views, no admin audit view.
- No MCP tools (so `_docs/mcp-tools.md` is untouched).
- Do not apply migrations — **written, not applied** (repo convention). No git commands.

## Proposed File Changes

### Database — `supabase/migrations/166_user_drive.sql` (written, not applied) + `supabase/rollbacks/166_user_drive_down.sql`

> Next free number is 166 (164/165 are task 435's HR migrations). Re-check `ls supabase/migrations` before writing.

- `drive_folders(id uuid pk, owner_id uuid not null references auth.users on delete cascade, parent_id uuid references drive_folders on delete cascade, name text not null, created_at, updated_at)`. Unique name per `(owner_id, coalesce(parent_id, '0000…'), lower(name))` via a unique index (nullable-parent safe). Index `(owner_id, parent_id)`.
- `drive_files(id uuid pk, owner_id uuid not null → auth.users on delete cascade, uploaded_by uuid → auth.users, folder_id uuid references drive_folders on delete cascade, file_name, file_path unique, file_size bigint, file_mime_type text, created_at, updated_at)`. `owner_id` = owner of the drive the file lives in; `uploaded_by` = actual uploader (differs for editors in a shared folder). Index `(owner_id, folder_id)`, `(folder_id)`.
- `drive_shares(id, folder_id uuid → drive_folders on delete cascade, file_id uuid → drive_files on delete cascade, grantee_user_id uuid → auth.users on delete cascade, grantee_role text check in ('admin','super_admin','pm','developer','hr','marketing'), permission text check in ('view','edit'), created_by, created_at)` with `check (num_nonnulls(folder_id,file_id)=1)` and `check (num_nonnulls(grantee_user_id,grantee_role)=1)`; partial unique indexes per (target, grantee).
- `security definer` helpers (same anti-recursion pattern as migration 121/127; `set search_path = public`):
  - `drive_folder_access(p_folder_id uuid) returns text` — `'owner' | 'edit' | 'view' | null`; walks the parent chain with a recursive CTE, returns the **highest** of: ownership, a share on the folder or any ancestor matching `auth.uid()` or `get_my_role()`. Returns null for `client`.
  - `drive_file_access(p_file_id uuid) returns text` — owner, direct file share, or `drive_folder_access(file.folder_id)`.
  - Always call `get_my_role()`; never inline role logic (CLAUDE.md RLS rule).
- RLS (enable on all three): select = access in (`owner`,`edit`,`view`); insert folder/file = owner **or** `edit` on the target parent folder (root insert ⇒ `owner_id = auth.uid()`); update = owner or `edit` (editors may not change `owner_id`; enforce with a `with check`); delete = owner, or `edit` for files / non-root subfolders of the shared tree (a shared **root** folder is delete-able by owner only); `drive_shares` select = owner of target or the grantee, writes = target owner only. All policies `to authenticated` and exclude `client`.
- Storage: `insert into storage.buckets` private `user-drive`, `file_size_limit` 200 MB, `allowed_mime_types` = the same array as `ALLOWED_MIME_TYPES` (incl. PowerPoint types from `powerpoint-types.ts`). No `storage.objects` policies for end users — all access is via server-signed URLs (like `customer-assets`).
- Defensive note in the file header: deleting a user cascades DB rows but **orphans Storage objects** (same trade-off as task 339/350; sweep is a follow-up).

### Config / types / lib
- `src/config/constants.ts` — add `V2_ROUTES.DRIVE: "/drive"`; add `DRIVE_LABEL = "Drive"`, `DRIVE_SECTIONS` (`mine`/`shared` → labels).
- `src/types/database.ts` — add the three tables (with `Relationships[]`).
- `src/lib/drive/types.ts` — `DriveFolder`, `DriveFile`, `DriveShare`, `DrivePermission`, `DriveAccess`.
- `src/lib/drive/access.ts` — server helper `getDriveViewer()` (auth + staff-role gate) and `assertFolderAccess/assertFileAccess(supabase, id, need)` calling the SQL helpers via RPC.
- `src/lib/drive/storage.ts` — `buildDrivePath({ ownerId, filename })` (`<ownerId>/<ts>_<safe>`), `createDriveUploadUrl(path)`, `signDriveFileUrl(path, { download, fileName })`, `removeDriveObjects(paths[])` — thin wrappers around `adminClient.storage.from("user-drive")`.
- `src/lib/drive/schemas.ts` — zod schemas for every request body.
- `src/lib/drive/adapters.ts` — `toAssetRow(DriveFile)`, `toAssetFolder(DriveFolder)` so the reused Project-Files presentational components accept drive data.
- `src/lib/drive/collect-subtree.ts` — recursive descendant folder + file path collection for folder delete / bulk manifest.

### API routes — `src/app/api/drive/` (each ≤ ~120 lines)
- `route.ts` — `GET ?view=mine|shared` → `{ folders, files, sharedRoots }` (paginate with `.range()` loop, `PAGE = 1000`, per CLAUDE.md). `mine` = `owner_id = me`; `shared` = rows where `owner_id <> me` visible via RLS, plus `sharedRoots` (items directly shared, with sharer name + permission).
- `folders/route.ts` — `POST` create (`name`, `parentId|null`); `folders/[folderId]/route.ts` — `PATCH` rename, `DELETE` (collects subtree file paths **before** deleting, then `removeDriveObjects`; Storage failure logged, never fails the delete).
- `upload/sign/route.ts` — `POST { filename, size, mimeType, folderId|null }` → gate (staff role; `edit`/owner on `folderId`; MIME; size) → signed upload URL. Path is server-generated under the **folder owner's** id.
- `files/route.ts` — `POST` register (asserts `file_path` starts with `${ownerId}/`, verifies the Storage object exists via a ranged read like task 339's `verifyUploadedObject`, inserts row); `files/[fileId]/route.ts` — `PATCH` rename/move, `DELETE` (row + Storage object); `files/[fileId]/url/route.ts` — `GET` signed 60 s URL, `?download=1`.
- `download-manifest/route.ts` — `POST { fileIds, folderIds }` → flat manifest of `{ path-in-zip, fileId }` after an access check on every id (mirror `src/lib/uploads/download-manifest.ts`).
- `shares/route.ts` — `GET ?folderId|fileId` (owner only), `POST` add share (zod: exactly one grantee, permission); `shares/[shareId]/route.ts` — `PATCH` permission, `DELETE`. Owner-only, enforced by RLS **and** an explicit check.
- People picker: reuse the existing `GET /api/staff-directory`, filtered client-side to exclude `client` (verify it already excludes them; if not, add a `?excludeClients=1` param **only** if that route isn't shared with Project Files behavior).

### UI — `src/app/(hub)/drive/` (pages thin; every file ≤ ~250 lines, components 100–250)
- `page.tsx` — server component: staff-role guard (redirect clients), `generateMetadata` ("Drive"), renders `<DriveShell initialView initialFolderId initialFileId />`.
- `loading.tsx` — skeleton (header + toolbar + tile grid skeletons).
- `_drive-shell.tsx` — client orchestrator: section switch, owns `view` state + URL sync (`_use-drive-deeplink.ts`).
- `_drive-header.tsx` — page title (Space Grotesk 22/700), **section tabs** (`My Files` | `Shared with me`, navy active, counts in JetBrains Mono), the single orange CTA **Upload files**.
- `_use-drive-data.ts` — load + mutations for a view (create/rename/delete folder, upload/register, rename/move/delete file); optimistic with `sonner` rollback. Split mutations into `_use-drive-mutations.ts` if > 150 lines.
- `_my-files-view.tsx` — composes the toolbar/breadcrumb/tiles for the owner's tree (reuses `FilesToolbar`, `useFilesTabDerived`, `useFilesSelection`, `FolderTile`, `BulkToolbar`, `RenameModal`/`MoveModal`, `FilesDeleteDialog`, `useUploadQueue`/`UploadQueuePanel`/`UploadDropzone`, `useFolderUpload` by import, via adapters).
- `_shared-with-me-view.tsx` — same composition, but top level renders `SharedRootList` (grouped by sharer) and gates write actions on the share's permission.
- `_drive-file-tile.tsx` — drive replacement for `_file-tile.tsx` (URLs → `/api/drive/files/${id}/url`, Share action, shared badge, "Shared by" line in the Shared view).
- `_use-drive-bulk-download.ts` — drive replacement for `_use-bulk-download.ts` (manifest URL → `/api/drive/download-manifest`).
- `_share-dialog.tsx` + `_share-picker.tsx` — people/role picker (inverted semantics: empty = private) with a `View`/`Edit` select and the access list; `_permission-chip.tsx` neutral read-only chip.
- `_drive-empty-states.tsx` — My Files empty, folder empty, Shared empty, search-empty, no-access.
- `_drive-adapters.ts` re-export if needed to keep component files small.

### Navigation
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — add `{ label: DRIVE_LABEL, icon: <HardDrive size={18}/>, href: V2_ROUTES.DRIVE }` to `knowledgeItems`, hidden for `client`. Check `isChildActive` needs no change (no children, no query-based tabs in the sidebar — sections live in the page, not the sidebar).
- `src/lib/auth/department-map.ts` / route-access tables — confirm whether `/drive` needs an entry (task 435 touched this file; read it, don't assume). `isRouteAllowed()` in `role-access.ts` if it enumerates routes.

### Docs
- `CLAUDE.md` — Key Conventions bullet: **Personal Drive (task 436)** — tables, bucket, access helpers, share inheritance, "no admin override", written-not-applied migration, why not `customer_assets`; add `drive/` + `lib/drive/` to Project Structure.
- Task doc "Implementation Notes" at the end, filled during implementation.

## Code Context

### What the Project Files tab does today (the feature set to match)
- `src/app/(hub)/projects/_shared/_files-tab.tsx` (69 lines) — thin wrapper: `useCustomerAssets(customerId, projectId)` + `useFilesDeepLink(...)` → presentational `FilesTab` from `projects/v2/[projectId]/onboarding-workspace/_files-tab.tsx` (403 lines; props: `assets, folders, staffDirectory, canEdit, openFolderId, onOpenFolder, onUpload, onDeleteAsset, onAssetPermissionChange, onFolderPermissionChange, onCreateFolder, onRenameAsset, onRenameFolder, onDeleteFolder, onMoveAsset, onCopyFolderUrl, onCopyFileUrl, autoPreviewAssetId`).
- State inside it: grid/list, search, sort, drag-over, rejected-file notice, new-folder inline input, duplicate-folder prompt, rename/move targets, context menu, pending delete.
- Reusable modules (all in `onboarding-workspace/`): `_upload-queue.tsx` (`useUploadQueue`, `UploadQueuePanel`, `UploadDropzone`, `uploadViaSignedUrl(signUrl, file, projectId, onProgress)` — raw XHR PUT with progress), `_folder-upload-tree.ts` + `_use-folder-upload.ts` (drop/pick a directory, recreate folders, enqueue files), `_file-upload-constants.ts` (`ALLOWED_UPLOAD_TYPES`, `MAX_FILE_SIZE`, labels), `_files-toolbar.tsx`, `_use-files-tab-derived.ts`, `_use-files-selection.ts`, `_folder-tile.tsx`, `_file-actions-menu.tsx`, `_rename-move-modals.tsx`, `_bulk-toolbar.tsx`, `_files-delete-dialog.tsx`, `_files-tab-parts.tsx`, `_file-previews.tsx`.
- **Hard-coupled to customers** (replace, don't reuse): `_file-tile.tsx` lines 28/127/153 (`/api/customers/${customerId}/assets/${asset.id}/file-url`), `_use-bulk-download.ts` lines 31/53, `_permission-picker.tsx` (NULL-means-everyone semantics).
- Upload flow (task 350): `POST .../assets/upload/sign` (auth + role + MIME + size → `createSignedUploadUrl`) → browser PUT → `POST .../assets` register (asserts path prefix). `uploadViaSignedUrl` takes the sign URL as a parameter, so it is reusable as-is with `/api/drive/upload/sign` (its 3rd arg is `project_id` — pass `null`/folder owner context; check the body shape the sign route reads and keep `/api/drive/upload/sign` compatible, or add an options object **in a new drive-local wrapper**, not by editing the shared file).
- Hook model to mirror: `_shared/_use-customer-assets.ts` (143 lines) — `useEffect` parallel fetch with `AbortController`, `handleUpload` = sign → PUT → register → append to state; deletes toast on failure.
- Permission rule today (`src/lib/uploads/asset-access.ts`): `canAccessAsset(role, userId, allowedRoles, allowedUserIds)` — admin always passes, **empty = everyone**. The drive deliberately does **not** use this.
- Shares precedent: `supabase/migrations/127_*.sql` (`note_folder_shares`, `is_note_folder_manager`, `can_access_note_folder`, anti-recursion `security definer` helpers) — copy the structure, not the semantics (folder `public` flag has no analogue here).
- Sidebar: `v2-hub-sidebar.tsx` ~line 124 `knowledgeItems = [{ label: "Wiki", icon: <BookOpen size={18} />, href: V2_ROUTES.WIKI }]`; client exclusion pattern at line ~119 (`role !== "client"`).
- Deep-link precedent: `_shared/_use-files-deeplink.ts` (task 359) — `?folder=` / `?file=`, `replaceState`, `usePathname()` for copy-URL.

## Design Brief (follow `_final_design/guide/central-hub-design-system.md` — **run `/anthropic-skills:frontend-design` and `/impeccable:impeccable craft` before writing UI**)

**Register & strategy:** Product UI, **Restrained**. The page lives in the same shell as Projects > Files, so it must look like a sibling, not a new product. Anchors: Google Drive (familiar mental model — breadcrumb, grid/list, Shared with me), Linear (calm density), the Hub's own Project Files tab (exact tile/toolbar vocabulary).
**Scene sentence:** A PM between meetings, on a bright office monitor, drops the minutes-of-meeting doc into a folder in two seconds and moves on; later a teammate finds it under *Shared with me* — light theme, scan-fast, no ceremony.
**Tokens:** page bg `#F4F6FB`, panels `#FFFFFF` + 1px `#E2E7F2` **and** `--sh-sm`, radius 14 panels / 10 inputs / pill buttons; ink `#0B1533`, body `#3A4565`, muted `#5F6A88`.
**Type:** page title Space Grotesk 700 22px; panel/section titles Space Grotesk 600 15px; everything else Inter 13px; **sizes, dates, counts, ids in JetBrains Mono**. Space Grotesk never in buttons/labels/cells.
**Colour meaning:** navy = selection (active section tab, filter/sort active); blue = interactive (links, focus, Share confirm); **one orange CTA per screen — "Upload files"** (read-only Shared roots view hides it); `View`/`Edit` permission chips = **neutral** (`#EDF0F7`/`#5F6A88`), read-only, 5px radius; destructive confirm uses `--late`. **Never** phase hues, left/right accent stripes, gradient text, glassmorphism, nested cards, shadow-only elevation, or page-load animation.
**Theming:** follow the repo's `isDark` prop pattern (from `usePMSettings()`), picking paired light/dark utility classes via `cn()` — **no `dark:` variants in v2 files**, and no `style={{}}` (CLAUDE.md).
**Layout:** header row (title left, orange Upload CTA right) → section tabs row → toolbar row (search · sort · grid/list) → breadcrumb row → content. Grid default (`repeat(auto-fill, minmax(176px, 1fr))`), list view = table pattern (header 9.5px/700 caps `#FAFBFE`, row hover `--blue-50`). In *Shared with me* the top level is a list grouped by sharer (avatar initials per design-system rotation, name, count); inside a folder it is identical to My Files with write actions gated.
**Motion:** 160 ms `cubic-bezier(.22,1,.36,1)` colour/border transitions only; drop-target highlight and upload progress convey state; `prefers-reduced-motion` collapses transitions.
**A11y:** tiles are `<button>`/links with full labels (e.g. "Folder Meeting minutes, 12 items"); context menu also reachable via a `…` icon button with `aria-label`; keyboard: Enter opens, Del opens delete confirm, Esc closes menus; focus ring 2px `#007BFF` offset 2; ≥ 44px touch targets; drag-drop has a button equivalent (Upload files / New folder); colour never the only signal (chips carry text).
**Mobile:** tabs stay on one row; toolbar wraps; grid collapses to 2 columns; list view hides size/date columns behind the row `…` menu (PWA is the mobile experience).

### Content (voice: sentence case, outcome verbs, no exclamation points, errors state problem + fix)
- Title: **Drive** · Tabs: **My Files**, **Shared with me**
- CTA: **Upload files** · secondary: **New folder**, **Upload folder**
- My Files empty: "Nothing here yet. Upload meeting minutes, notes or working files — only you can see them until you share." + **Upload files**
- Folder empty: "This folder is empty. Drop files here or use Upload files."
- Shared empty: "Nothing has been shared with you yet. When a teammate shares a folder or file, it appears here."
- Search empty: "No files match “{q}” in this folder."
- Share dialog: title "Share {name}" · helper "Only you can see this." / "Shared with {n} people and roles." · buttons **Add people or role**, **Save access**, **Remove access** · permission labels **Can view** / **Can edit**
- Delete confirm (folder): "Delete {name} and its {n} files? This can't be undone." · button **Delete folder**
- Rejected upload: "{name} isn't supported — allowed: {types}." / "{x} MB exceeds the 200 MB limit — compress or split it, then try again."
- No access: "You don't have access to this item. Ask {owner} to share it with you."

## File Budget (per `nextjs-file-length-best-practices.md`)

| Kind | Target | Hard cap |
|------|--------|----------|
| Component (`.tsx`) | 100–250 | 300 (split with sub-components) |
| Hook | 30–100 | 150 (split mutations from loading) |
| API route | 50–120 | 150 (logic → `src/lib/drive/`) |
| Page (`page.tsx`) | ≤ 60 | 80 |
| Lib helpers | 50–150 | 200 |
| Migration / config | no limit | — |

No function > 75 lines. Do not copy the 403-line `_files-tab.tsx`; compose smaller drive views instead.

## Implementation Steps

1. **Coupling audit (read-only).** `grep -n "api/customers\|customerId\|allowed_roles" ` over each Project-Files module in the Code Context list; confirm D5 (only the three listed files are coupled) and that `AssetRow`/`AssetFolder` adapters satisfy every reused component's props. If another coupled module turns up, add a drive replacement for it rather than editing it. Read `_upload-queue.tsx#uploadViaSignedUrl`'s request body and `department-map.ts` / `role-access.ts` for route gating.
2. **Migration 166 + rollback** (tables, helpers, RLS, bucket). Write only; do not apply.
3. **Types + `database.ts` + constants** (`V2_ROUTES.DRIVE`, `DRIVE_LABEL`).
4. **`src/lib/drive/`** (`types`, `schemas`, `access`, `storage`, `adapters`, `collect-subtree`).
5. **API routes** in dependency order: folders → upload/sign → files (register/patch/delete/url) → `GET /api/drive` → download-manifest → shares.
6. **Data hooks** (`_use-drive-data.ts`, `_use-drive-mutations.ts`, `_use-drive-deeplink.ts`) and the drive bulk-download hook.
7. **Run `/anthropic-skills:frontend-design` + `/impeccable:impeccable craft`** with this Design Brief; then build `_drive-shell`, `_drive-header`, `_my-files-view`, `_shared-with-me-view`, `_drive-file-tile`, share dialog/picker, empty states, `loading.tsx`, `page.tsx`.
8. **Sidebar entry** + route-gate entries.
9. **Docs** (CLAUDE.md bullet + structure) and Implementation Notes.
10. **Checks:** `npx tsc --noEmit`, `pnpm lint`, file-length audit, hex/style audit, then RLS + browser acceptance (below).

## Acceptance Criteria

**Access & privacy**
- A staff user sees only their own files in My Files; another staff user (any role, incl. admin/super_admin) cannot read them via UI, API (`/api/drive/*`) or direct Supabase query until shared.
- `client` role: sidebar entry hidden, `/drive` redirects, every `/api/drive/*` returns 403, RLS returns zero rows.
- Storage objects are only reachable through signed URLs minted after an access check; a guessed `file_path` cannot be fetched.

**My Files**
- Upload via picker, drag-drop (single, multiple, whole folder with structure preserved) at root and inside folders; progress + retry per file; rejected type/size shows the specified messages. Audio/video recordings (`.mp3`, `.m4a`, `.wav`, `.mp4`, `.mov`, `.webm`) upload and play back in the preview modal.
- Create / rename / delete folder (subtree + Storage objects removed); rename / move / delete file; duplicate folder name in the same parent is rejected with an inline message.
- Grid/list, search, sort, breadcrumbs, bulk select → download (zip) / move / delete all work and match Project Files behavior.
- Deep links `?view=&folder=&file=` open the right place; stale ids fall back to root.

**Sharing**
- Owner can share a folder/file with a user or a role as View or Edit, change permission, and remove access; the share dialog shows "Only you can see this" with zero shares.
- Grantee sees the item under *Shared with me* (role shares reach everyone with the role); folder shares cover the whole subtree, including files added later.
- View grantee: no upload/create/rename/move/delete controls (hidden, and API returns 403). Edit grantee: can add/rename/move/delete inside the shared subtree but cannot touch the shared root, change shares, or see the owner's other items.
- Revoking a share removes the item from the grantee's view on next load.

**Design & code quality**
- Matches the Design System v2.0 tokens (audit: no off-palette hex, no `dark:` variants, no `style={{}}`, no left/right accent stripes, exactly one orange CTA on screen, mono face on all sizes/dates/counts, Space Grotesk only on titles).
- Skeleton loading, taught empty states, keyboard + focus-ring coverage, `prefers-reduced-motion` honored; usable at 375 px width.
- No Project Files file modified; all new files within the File Budget; `tsc` and `pnpm lint` clean (pre-existing warnings only).
- Lists that may exceed 1000 rows paginate with `.range()`.

## Verification

```bash
npx tsc --noEmit
pnpm lint

# File-length audit (expect no new .tsx > 300, hooks/routes > 150)
find "src/app/(hub)/drive" src/app/api/drive src/lib/drive -name '*.ts*' | xargs wc -l | sort -rn | head -20

# Hex audit: every hex in new UI must be in the design-system palette
grep -rnoE '#[0-9A-Fa-f]{6}' "src/app/(hub)/drive" | sort -u

# Style / theming audit (expect no matches)
grep -rn "style={{\|dark:" "src/app/(hub)/drive"

# Project Files untouched (compare against pre-task copies if needed; no git commands)
```

Manual / browser acceptance (needs migration 166 applied by the operator first): two staff accounts (e.g. PM + developer) plus one `client` account — walk the Access, My Files and Sharing criteria above, including a role-based share and an Edit grantee attempting to delete the shared root. Capture a screenshot of both sections at desktop and 375 px.

## Compatibility Touchpoints

- **Migration 166** (+ rollback) — written, not applied; `src/types/database.ts` regenerated by hand.
- **Storage bucket `user-drive`** — created in the migration; if bucket creation via SQL is restricted in the target project, create it in the dashboard with the same limits.
- **Sidebar / route-access tables** — `v2-hub-sidebar.tsx`, `constants.ts`, and whichever of `role-access.ts` / `department-map.ts` actually gates by route.
- **`powerpoint-types.ts`** — bucket `allowed_mime_types` must include the PowerPoint types **and the audio/video types from D6** (task 418 lesson: a type allowed in code but missing in the bucket 400s at upload). The migration's bucket array, `DRIVE_MEDIA_MIME_TYPES`, and the client constant must stay in lockstep. Browsers report some of these inconsistently (e.g. `.m4a` as `audio/x-m4a` or `audio/mp4`), so list both variants.
- **CLAUDE.md** — new convention bullet + structure; **`_docs/mcp-tools.md`** unchanged (no MCP tools).
- **Env vars** — none new.

## Open Questions for Review

Resolved with the user: label = "Drive"; no share notifications in v1; audio/video recordings **are** uploadable (D6).

1. **Storage growth** — recordings can be large and there is no per-user quota. Consider a quota/usage indicator as a follow-up.
2. **Admin visibility** — none, per your choice. If HR/legal later need an audit path it should be an explicit, logged feature, not a blanket RLS bypass.

## Implementation Notes

### What Changed
- **Database (migration 166 + rollback, written not applied):** `drive_folders` / `drive_files` / `drive_shares`; `security definer` helpers `drive_is_staff`, `drive_folder_level`, `drive_file_level`, `drive_owns_folder`, `drive_owns_file`; integrity triggers (immutable `owner_id`, child owner = parent owner, `updated_at`); RLS on all three tables (no admin override, `client` always level 0); private `user-drive` bucket (200 MB, allowlist = customer-assets list + PowerPoint + audio/video).
- **`src/lib/drive/`:** `constants`, `types`, `schemas` (zod), `access` (staff gate + level RPC wrappers), `storage` (signed upload/read/remove), `load` (paginated visible rows), `levels` (pure TS mirror of the SQL levels), `manifest`, `collect-subtree`.
- **API `/api/drive/*`:** list (`?view=`), people, folders (create/rename/delete w/ Storage cleanup), upload/sign, files (register/rename+move/delete/url), download-manifest, shares (list/add/update/remove). All 401 unauthenticated (smoke-tested against the running dev server).
- **UI `src/app/(hub)/drive/`:** page (+ setup-needed probe + `loading.tsx`), shell, header with the two section tabs, browser (composition), toolbar (breadcrumbs, search, sort, grid/list, New folder / Upload folder / the single orange **Upload files**), content (section root, open folder, "Shared by …" groups), file + folder tiles, bulk bar, move modal, share dialog, preview (documents delegate to Project Files' modal; audio/video get a native player), empty states + skeleton, upload-flow / bulk-download / data / mutations / deeplink / derived / shares / people hooks.
- **Wiring:** `V2_ROUTES.DRIVE`, `DRIVE_LABEL`, `DRIVE_SECTIONS`; sidebar "Drive" entry (Knowledge group, hidden for `client`); `/drive` added to the HR department's allowed paths; `database.ts` tables + `drive_folder_level` / `drive_file_level` RPC types; CLAUDE.md convention bullet + structure lines.

### Files Changed
- `supabase/migrations/166_user_drive.sql`, `supabase/rollbacks/166_user_drive_down.sql` - new
- `src/lib/drive/*` (10 files) - new
- `src/app/api/drive/**/route.ts` (10 routes) - new
- `src/app/(hub)/drive/*` (~30 files) - new
- `src/config/constants.ts` - `DRIVE` route, `DRIVE_LABEL`, `DRIVE_SECTIONS`
- `src/types/database.ts` - three tables + two RPCs
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` - Drive nav entry
- `src/lib/auth/department-map.ts` - `/drive` allowed for the HR department
- `CLAUDE.md` - Personal Drive convention + structure
- `TASKS.md`, this doc

### Deviations From Plan
- **No `adapters.ts` / `toAssetRow`.** The Step 1 audit showed more of Project Files is coupled than D5 listed: `_files-toolbar` (hard-coded "Files" crumb, uploads need an open folder), `_folder-tile` (embeds the customer permission picker), `_use-folder-upload` (project allowlist, no root target), `_use-files-tab-derived` (no root files) and `MoveModal` (no root option) too. Rather than adapt types, the Drive has its own twins of those and re-exports only the genuinely generic modules through `drive/_reuse.ts`. Project Files remains unmodified.
- **Own `/api/drive/people`** instead of reusing `/api/staff-directory` — that route is gated to admin/super_admin/pm/marketing, so developers and HR couldn't name collaborators. Uses `adminClient` after the staff gate with the same narrow `id/full_name/role` shape (commented inline).
- **Light-only hex Tailwind classes, no `isDark` prop.** The planned `isDark` pattern doesn't exist in the Files tab it mirrors, nor in the sibling HR module (task 435) — both use the fixed light tokens. Followed the neighbours; no `dark:` variants.
- **Tile click opens, checkbox selects** (Project Files is click-to-select). Deliberate Drive convention; documented in CLAUDE.md.
- **Section-tab counts omitted** (would need both sections fetched up front). Folder tiles still show item counts.
- **`department-map.ts`** needed an entry (the plan said to check): HR-department users were otherwise redirected away from `/drive`. **Finance department is left restricted to Orders** (task 376's deliberate lock-down) — flagged below.
- Direct **file-level `edit` share = rename only** (RLS can't compare old/new `folder_id`; the PATCH route restricts moves). Stricter than "edit" might suggest; shown as "Can edit".
- Colours: a handful of tints are copied verbatim from the Files tab (`#EAF2FF` selected, `#C7D2E8` hover border, `#A8B3CC` empty icon) alongside the design-system tokens.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `npx eslint` on `src/app/(hub)/drive`, `src/app/api/drive`, `src/lib/drive`, sidebar, department-map - PASS (0 errors, 0 warnings; the React-compiler rules forced two refactors: destructured toolbar props, render-derived deep-link state instead of effect+setState)
- File-length audit - PASS (largest new file `_drive-browser.tsx`, 203 lines; every API route ≤ 79 lines)
- Palette audit - PASS (only design-system tokens + the four Files-tab tints above); `style={{}}` only in two computed-pixel spots (move-modal indent, context-menu position), each commented; no `dark:`; no accent stripes
- Dev-server smoke: `/drive` 307 (unauthenticated redirect), all 8 sampled `/api/drive/*` routes 401 - PASS
- **NOT RUN:** migration 166 applied; RLS exercised (owner/editor/viewer/role-share/client matrix); authenticated browser acceptance (upload, folder drop, share round-trip, audio/video playback, 375 px layout, keyboard pass). Needs the operator to apply 166 first.

### Follow-ups / for review
- **Finance department** cannot reach `/drive` (restricted to Orders, task 376). Add `V2_ROUTES.DRIVE` to `DEPARTMENT_NAV_RESTRICTION.Finance` if Finance staff should have a drive.
- Not built (per plan): trash/restore, per-user quota (recordings can be large), share notifications, share links, orphaned-Storage sweep after a user is deleted.
- Shared-folder editors see an upload "level 2" folder tile with no distinct "owned by you" cue beyond the Shared-by grouping.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Reviewed all new/changed files listed in Implementation Notes against the checklist (dead code, typing, nesting, responsibility, error handling, debug logging, conventions). No blocking issues.
- **Fixed during this gate (minor):** `collectDriveSubtree` returned a `folderIds` array no caller used → now returns only the Storage paths; the convoluted `levelUnder` ternary in `_use-drive-mutations.ts` → two-line version with the same behaviour; `renderFile` parameter typed `(typeof files)[number]` → `DriveFile`; unused `QueueItem` type re-export removed from `_reuse.ts`.
- No `any`, no commented-out code, no `console.log` (only `console.error` on failure paths, matching the rest of the API). `adminClient` appears only in `lib/drive/storage.ts` (signing/removal after an access check) and `/api/drive/people` (commented). No secrets.
- File sizes within budget (largest `_drive-browser.tsx`, ~203 lines). `_drive-browser.tsx` is the one dense file: it is composition-only, with every concern in its own hook/component, so splitting further would scatter one wiring surface.
- Known, accepted duplication: `_use-drive-bulk-download.ts` and `_drive-upload.ts` mirror Project Files' equivalents (~40 lines each) because the originals hard-code customer URLs and Project Files must not be edited; extracting a shared core would mean modifying Project Files (out of scope) — a candidate follow-up.
- Re-verified after the fixes: `npx tsc --noEmit` and `npx eslint` on the Drive code — PASS.

### Deviations
- **Medium** — Drive-specific twins instead of adapters over Project Files components (D5 revised after the audit). Visible to the user, no scope expansion, Project Files untouched; recorded under Implementation Notes.
- **Medium** — `department-map.ts` edited so the HR department can reach `/drive` (the plan said to check it). Finance left restricted — open decision for the user.
- **Minor** — light-only hex classes instead of `isDark`; click-to-open tiles; own `/api/drive/people`; section-tab counts omitted; file-level `edit` share = rename only.
- No Major deviations: nothing outside the task's scope was added, Project Files / `customer_assets` / `/api/customers/**` are unmodified, and the migration is written-not-applied.

### Required Fixes
- None.

### Live-run fix (migration 167)
- **Bug (user-reported):** "You can't add folders here." on New folder at the My Files root. Root cause: `insert … returning` re-checks the new row against the SELECT policy; 166's select policies relied on STABLE functions (`drive_folder_level(id)` / `drive_file_level(id)`) that can't see a row inserted in the same statement → 0 → RLS violation (42501, mapped to that message). It would equally have broken file registration.
- **Fix:** `supabase/migrations/167_user_drive_select_returning_fix.sql` (+ rollback) — the select policies now also pass on `owner_id = auth.uid()` and on access to the parent folder (covers an editor creating inside a shared folder), neither of which reads the new row. Written, not applied: the operator must run 167 and retest creating a folder, uploading to the root, and creating inside a shared folder as an editor.
- Lesson recorded in CLAUDE.md: select policies must not depend solely on a function that re-reads the table.

- Share notifications (in-app + email) shipped as task 437.

- The Share dialog's recipient picker was upgraded to a searchable multi-select chip picker in task 438.
