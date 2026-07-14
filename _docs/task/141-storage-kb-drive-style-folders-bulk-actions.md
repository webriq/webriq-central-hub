# 141: Storage/KB File Explorer — Drive-Style Folders/Files, Custom Folder Tree, Bulk Actions

**Created:** 2026-07-14
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Tasks 134/139 built the current `StorageFileExplorer` (Storage folder + KB step,
`_onboarding-wizard.tsx`): a two-level Finder-style browser where a folder is purely a
*derived, fixed* bucket — `folderForAsset()` maps each asset's `label` to one of six
hardcoded folder names (`Business Files`, `Outcome Target`, `Checklist`, `Content Map`,
`HTML Mockup`, `Other`), with no folder creation, no nesting, and always-visible hover
action icons on each file.

Per the user's direction (with three reference screenshots), this task:

1. **Removes the free-text "Documents (branding / proposals / collateral)" note field**
   (`documentsNote` state/textarea) — the PM was describing, in prose, where branding/
   proposal/collateral documents live. That information should instead be real
   sub-folders under "Business Files" that files are actually placed into.
2. **Replaces the fixed, label-derived folder model with a real folder tree** —
   `customer_asset_folders` (new table), so folders can be created anywhere (root level
   or nested inside any existing folder, including the six former "system" buckets,
   which become real folder rows too instead of a hardcoded name list). This is the
   "whole explorer" scope confirmed with the user (not just under Business Files).
3. **Redesigns the folder-tile look** to match the reference (image 1): a horizontal
   pill/row (icon + name + kebab), no border, soft hover background — replacing the
   current large centered icon-on-top tile.
4. **Redesigns the file card look** to match the reference (image 2, Google Drive
   style): icon + filename + kebab in a header row, a preview pane below; actions
   (View / Permissions / Move to folder / Remove) appear in a dropdown **only when the
   kebab is clicked** — replacing the current always-visible hover action-icon row.
5. **Adds multi-select + a bulk action toolbar** matching the reference (image 3):
   clicking a file's selection checkbox replaces the normal header row with
   "✕ · N selected · [Share] [Move to folder] [Delete]" — confirmed scope: no Download
   (this app has no file-download feature anywhere; View is in-app-preview-only by
   deliberate design) and no "Get link"/"Ask Gemini" equivalents (not applicable).
6. **Adds "New folder"** at every level (root folder-tiles view and inside any open
   folder), confirmed to apply across the whole explorer, not just Business Files.

## Requirements

- [ ] `documentsNote` state, its textarea, its label, and its key in the `storage-kb`
      autosave payload (`_onboarding-wizard.tsx:380`) are removed entirely. No migration
      needed for previously-saved `documentsNote` values in `wizard_data` — they're
      simply no longer read or displayed (same treatment as the `directAccess` → 
      `additionalNotes` rename precedent already in this file, minus the fallback read,
      since this data isn't being moved anywhere, just retired).
- [ ] New `customer_asset_folders` table (migration `065`): `id`, `customer_id` (FK →
      `customers.customer_id`), `project_id` (FK → `projects.id`), `phase_number`,
      `parent_folder_id` (self FK, null = root), `name`, `is_system` (bool), `created_at`.
      Unique on `(customer_id, project_id, phase_number, parent_folder_id, name)`.
- [ ] `customer_assets` gains a nullable `folder_id` FK → `customer_asset_folders.id`
      (`on delete set null`).
- [ ] New `GET .../assets/folders?projectId=&phaseNumber=` route: on first call for a
      given `(customerId, projectId, phaseNumber)`, idempotently provisions the six
      former hardcoded folders (`Business Files`, `Outcome Target`, `Checklist`,
      `Content Map`, `HTML Mockup`, `Other`) plus three new `is_system` sub-folders
      under `Business Files` (`Branding`, `Proposals`, `Collateral`) if they don't
      already exist, backfills `folder_id` on any of this project/phase's assets that
      still have `folder_id IS NULL` (using the *existing* `label` → folder-name mapping
      table 134/139 already built, just executed server-side once instead of
      client-side on every render), then returns the full flat folder list for that
      scope. Safe to call on every mount (a no-op after the first time).
- [ ] New `POST .../assets/folders` route: `{ customerId, projectId, phaseNumber, name,
      parent_folder_id }` → creates one folder (`is_system: false`), 400 on duplicate
      name within the same parent (unique constraint), 404 if `parent_folder_id`
      doesn't belong to this customer/project.
- [ ] `PATCH .../assets/[assetId]` (existing route) accepts an additional optional
      `folder_id` (string | null) alongside the existing `allowed_roles`/
      `allowed_user_ids` — same auth/permission-check shape, just one more updatable
      column.
- [ ] `StorageFileExplorer` becomes a recursive folder browser: a breadcrumb
      (Root ▸ … ▸ current folder name) plus, at the current level, a grid of
      **child-folder pills** (icon + name + kebab; kebab menu = "New sub-folder" only)
      followed by that folder's own files (Grid/List, per the existing task 139
      toggle — unchanged, still default Grid).
- [ ] Folder pill visual (replacing the current tile): rounded box, **no border**,
      icon + name + kebab in a single row, subtle hover background only (per the
      reference image) — no file-count badge (dropped to match the reference exactly).
- [ ] File card visual (Grid view): icon + truncated filename + kebab in a header row,
      a light preview-pane area below showing a generic file-type icon (no live image
      thumbnails — same explicitly-deferred decision task 139 already made and flagged;
      not revisited here), permission badge shown as a small overlay/corner badge. List
      view: same row layout as today, kebab replaces the inline icon row.
- [ ] Per-file actions (View, Permissions, Move to folder, Remove) move into a
      **dropdown that opens only on kebab click** (click-outside or re-click to close)
      — both Grid and List. "Permissions" toggles the existing inline expandable
      role/user-picker panel (unchanged content, just triggered from the dropdown
      instead of a persistent icon). "Move to folder" opens a folder-picker (a simple
      list/tree of this project/phase's folders, excluding the file's current folder)
      and PATCHes `folder_id` on selection.
- [ ] Multi-select: a checkbox appears on each file card/row (on hover, or always once
      any file in the current folder is selected). Selecting ≥1 file replaces the
      normal per-folder header row (breadcrumb / New folder / Add file / Grid-List
      toggle) with the bulk toolbar: **✕ (clear selection) · "N selected" · Share
      (Permissions) · Move to folder · Delete**. Each bulk action loops the existing
      single-asset endpoints across the selected ids (no new bulk API route) — Share
      applies a chosen role/user-list to all selected via looped `PATCH`; Move to
      folder PATCHes `folder_id` on all selected; Delete calls the existing single
      `DELETE` per selected id. Selection clears after any bulk action completes.
- [ ] "New folder" is available both in the root folder-tiles view's header and inside
      any open folder's header — opens a small modal (name input + Create), POSTs to
      the new folders route with the current folder as `parent_folder_id` (`null` at
      root), inserts the returned folder into local state so it appears immediately.
- [ ] Uploading via "Add file" inside an open folder now tags the new asset with that
      folder's `folder_id` directly (via the extended POST body — see Proposed File
      Changes), instead of always hardcoding `label: "Documents"` regardless of which
      folder was open (task 134/139's known quirk). This is a natural correctness
      improvement now that folders are explicit, not a silent behavior change to call
      out separately — flagged here so it isn't missed as "scope creep" during review.
- [ ] All existing behavior not explicitly changed above is preserved: View still opens
      the shared in-app viewer; Permissions panel content/role-and-person pills are
      unchanged; DNS/credentials fields (already removed per task 140's follow-up —
      confirm still absent, don't reintroduce) and the "Credentials & links" list below
      the explorer are untouched; `kickoff`, `outcome-target`, `migration-checklist`,
      `content-map`, `html-mockup`, `client-signoff` are unaffected.

## Out of Scope / Must-Not-Change

- **No folder rename or delete** — only creation. The former six hardcoded buckets
  (now real `is_system` rows) and the three new `Branding`/`Proposals`/`Collateral`
  sub-folders can never be renamed or removed through this UI.
- **No folder move/re-nesting** — a folder's `parent_folder_id` is set once at creation
  and never changed. Only *files* move between folders (single or bulk), never folders
  themselves.
- **No Download feature** — confirmed with the user: this app has no file-download
  capability anywhere (View is in-app-preview via signed URL only, by deliberate
  existing design, per the comment at `_onboarding-wizard.tsx:733`). The bulk toolbar
  does not include Download or "Get link"; do not add a download feature as part of
  this task.
- **No live image thumbnails** in Grid-view file cards — same deferred decision task
  139 already flagged; a generic file-type icon is shown for all types.
- **No changes** to `folderForAsset()`'s existing `label` → folder-name mapping *values*
  (used only by the one-time server-side backfill now, not for ongoing client-side
  folder derivation) — the six original folder names stay exactly as they are today.
- **No changes** to `allowed_roles`/`allowed_user_ids` semantics, `canSeeAsset()`, or
  the Customers → Assets tab (`client.tsx`) — same boundary as tasks 134/138/139.
- **No changes** to `kickoff`, `outcome-target`, `migration-checklist`, `content-map`,
  `html-mockup`, `client-signoff`, or the "Credentials & links" list/`AddCredentialLinkModal`.
- **No drag-and-drop** file moving — "Move to folder" is a menu/toolbar action only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/065_customer_asset_folders.sql` | Create | New table + `customer_assets.folder_id` column. |
| `src/types/database.ts` | Modify | Add `customer_asset_folders` table types; add `folder_id` to `customer_assets` Row/Insert/Update + its FK Relationship entry. |
| `src/app/api/customers/[customerId]/assets/folders/route.ts` | Create | `GET` (provision + backfill + list) and `POST` (create folder). |
| `src/app/api/customers/[customerId]/assets/[assetId]/route.ts` | Modify | `PATCH` accepts optional `folder_id`. |
| `src/app/api/customers/[customerId]/assets/route.ts` | Modify | `POST` accepts optional `folder_id` (set by the explorer's "Add file" when uploading inside an open folder). |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Remove `documentsNote`; rewrite `StorageFileExplorer` (folder-tree fetch/state, breadcrumb navigation, pill folders, Drive-style file cards, kebab dropdowns, multi-select + bulk toolbar, New Folder modal, Move-to-folder modal); extend `handleUpload`/`handlePermissionsChange` call sites to pass/accept `folder_id`. |

## Code Context

### New table (migration 065)

```sql
create table if not exists customer_asset_folders (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references customers(customer_id),
  project_id uuid references projects(id),
  phase_number int,
  parent_folder_id uuid references customer_asset_folders(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (customer_id, project_id, phase_number, parent_folder_id, name)
);

alter table customer_assets
  add column if not exists folder_id uuid references customer_asset_folders(id) on delete set null;

create index if not exists customer_asset_folders_parent_idx on customer_asset_folders(parent_folder_id);
create index if not exists customer_assets_folder_idx on customer_assets(folder_id);
```

### Existing folder-name mapping to reuse for the one-time server-side backfill (`_onboarding-wizard.tsx:130-141`)

```tsx
const ASSET_FOLDER_BY_LABEL: Record<string, string> = {
  "Business Facts": "Business Files",
  "Documents": "Business Files",
  "Outcome Target": "Outcome Target",
  "Migration Checklist": "Checklist",
  "Content Map": "Content Map",
  "HTML Mockup": "HTML Mockup",
};
```

Port this (or an equivalent literal) into the new `GET .../assets/folders` route to
resolve each unbackfilled asset's target *system* folder id by name lookup, scoped to
`(customer_id, project_id, phase_number)`. `Branding`/`Proposals`/`Collateral` are
provisioned as extra `is_system` children of `Business Files` but nothing backfills
into them automatically — they start empty; existing "Documents"-labeled assets keep
landing directly in `Business Files` (flat), same as before, until a PM manually moves
one into a sub-folder via "Move to folder".

### Existing PATCH route to extend (`assets/[assetId]/route.ts:34-46, 67-69`)

```ts
const allowedRoles = body.allowed_roles;
const allowedUserIds = body.allowed_user_ids;
// add:
const folderId = body.folder_id; // string | null | undefined
const hasFolderId = folderId !== undefined;
if (hasFolderId && folderId !== null && typeof folderId !== "string") {
  return NextResponse.json({ error: "folder_id must be a string or null" }, { status: 400 });
}
// ...
const updates: { allowed_roles?: string[] | null; allowed_user_ids?: string[] | null; folder_id?: string | null } = {};
if (hasFolderId) updates.folder_id = folderId;
```

No `canSeeAsset`/ownership change needed — same guard already covers this route.

### Existing POST route to extend (`assets/route.ts:64-82, 107-124`)

Add `folder_id?: string | null` to the destructured body and pass it through to
`.insert({ ..., folder_id: folder_id ?? null })`.

### Current always-visible action row to replace with a kebab dropdown (`_onboarding-wizard.tsx:2182-2217`, `fileActions(f)`)

Reuse the same four actions' underlying handlers (`onView`, permissions toggle,
`onRemove`, plus new `onMove`) but render one `MoreVertical`-icon button per file that
toggles a small absolute-positioned dropdown (`<Eye/> View`, `<Lock/> Permissions`,
`<FolderInput/> Move to folder`, `<Trash2/> Remove`) — click-outside-to-close via the
same open/close `useState` pattern already used for `permissionsOpenId`.

### Bulk toolbar — new, no existing precedent in this file to model exactly; closest
analog is the `HtmlEditorModal`'s icon-pill toggle group for styling consistency (active/
inactive pill states), and the existing `AddCredentialLinkModal` for the "New folder"/
"Move to folder" small-modal shape.

```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
// header row conditionally renders:
{selectedIds.size > 0 ? (
  <div className="flex items-center gap-2">
    <button onClick={() => setSelectedIds(new Set())} aria-label="Clear selection"><X size={14} /></button>
    <span>{selectedIds.size} selected</span>
    <button onClick={openBulkShare} aria-label="Share"><Share2 size={14} /></button>
    <button onClick={openBulkMove} aria-label="Move to folder"><FolderInput size={14} /></button>
    <button onClick={bulkDelete} aria-label="Delete"><Trash2 size={14} /></button>
  </div>
) : (
  /* existing breadcrumb / New folder / Add file / Grid-List toggle row */
)}
```

`Share2`/`FolderInput`/`MoreVertical`/`FolderPlus` need adding to the existing
`lucide-react` import list.

## Implementation Steps

1. Write and apply migration `065_customer_asset_folders.sql`. Update `src/types/database.ts`.
2. Build `GET`/`POST .../assets/folders/route.ts` (provision-and-backfill-on-read + create).
3. Extend `PATCH .../assets/[assetId]` and `POST .../assets` for `folder_id`.
4. In `_onboarding-wizard.tsx`: remove `documentsNote` state/textarea/autosave key; add a
   `phase1Folders` fetch (call the new `GET` route once when the `storage-kb` step is
   active or on mount) and a `folderStack`/`currentFolderId` navigation state.
5. Rewrite `StorageFileExplorer`: breadcrumb, child-folder pills (new visual, kebab =
   "New sub-folder"), current folder's files (Grid/List, unchanged toggle), New Folder
   modal, Move-to-folder modal/picker, per-file kebab dropdown (replacing `fileActions`),
   multi-select checkboxes + bulk toolbar.
6. Wire `handleUpload` to pass the currently-open folder's id as `folder_id` in its
   POST body (instead of always `label: "Documents"` with no folder tagging); wire
   `handlePermissionsChange`-equivalent bulk share and a new `handleMoveAsset`/
   `handleBulkMove`/`handleBulkDelete` in the parent component, all reusing existing
   fetch patterns.
7. `npx tsc --noEmit` and `pnpm lint`.
8. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] The "Documents (branding / proposals / collateral)" textarea and its label are
      gone from the `storage-kb` step; nothing else on the page shifted incorrectly.
- [ ] Opening "Business Files" for the first time on any existing project shows
      `Branding`, `Proposals`, `Collateral` as real (empty) sub-folders alongside the
      existing flat files, with zero manual setup.
- [ ] A brand-new custom folder can be created at root (e.g. "Contracts") and inside
      any existing folder (system or custom), via a visible "New folder" control at
      every level.
- [ ] Folder tiles render as a border-less pill (icon + name + kebab), matching the
      reference image; clicking the tile navigates in, clicking the kebab shows "New
      sub-folder" only.
- [ ] Files render as Drive-style cards (Grid) with a kebab that pops open View /
      Permissions / Move to folder / Remove only when clicked — no more always-visible
      hover icons.
- [ ] Selecting one or more files swaps the header row for the bulk toolbar (✕ / count
      / Share / Move to folder / Delete); each action works against all selected files
      and clears the selection afterward.
- [ ] "Move to folder" (single and bulk) correctly reassigns `folder_id` and the file
      disappears from the source folder / appears in the destination on next navigation.
- [ ] Uploading "Add file" while inside an open folder places the new file directly in
      that folder (verified via its `folder_id`, not just its legacy `label`).
- [ ] Grid/List toggle, permission badges/panel, the shared in-app viewer, and the
      "Credentials & links" list all still work exactly as before.
- [ ] `kickoff`, `outcome-target`, `migration-checklist`, `content-map`, `html-mockup`,
      `client-signoff` are unaffected.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new packages needed — `lucide-react` already provides every icon referenced above.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000, an existing Phase 1 project with files already spread across
# the old six folders (from earlier tasks' test data):
#   - Navigate to Storage folder + KB (Step 6) -> confirm the note field is gone
#   - Open "Business Files" -> confirm Branding/Proposals/Collateral sub-folders exist and are empty
#   - Create a new root-level folder and a new sub-folder inside an existing one
#   - Upload a file while inside a sub-folder -> confirm it lands in that sub-folder, not "Business Files"
#   - Open a file's kebab -> confirm the dropdown (not hover icons) shows all four actions
#   - Move a single file to a different folder -> confirm it moved
#   - Select 3 files -> confirm the bulk toolbar appears; bulk-Delete two of them -> confirm removal + selection clears
#   - Bulk Move the remaining selected file(s) -> confirm folder reassignment
#   - Toggle Grid/List -> confirm both still render correctly with the new kebab dropdowns
#   - Confirm DNS/credentials-equivalent "Credentials & links" list and all other wizard steps are unaffected
```

## Compatibility Touchpoints

- New table + column via additive migration `065` — no destructive schema changes.
- Two modified API routes (`PATCH .../assets/[assetId]`, `POST .../assets`) — both
  changes are additive optional fields, existing callers unaffected.
- One new API route (`.../assets/folders`) — additive only.

## Deferred / Explicitly Confirmed With User

- **Folder scope:** confirmed as "whole explorer" — custom folders and nesting are
  supported everywhere, not just under Business Files.
- **Bulk Download:** confirmed *not* included — this app has no download feature
  anywhere today; adding one is out of scope for this task.
- **Move to folder placement:** confirmed in both the single-file kebab dropdown and
  the bulk toolbar.

## Implementation Notes

### What Changed
- Removed the `documentsNote` state, its textarea/label, `storageKbData`, and the
  dedicated `storage-kb` autosave effect/ref entirely (nothing else was ever saved
  under that `wizard_data` key).
- Added `customer_asset_folders` (migration `065`) — an arbitrary-depth folder tree
  (`parent_folder_id` self-FK, `is_system` flag) scoped to `(customer_id, project_id,
  phase_number)` — plus a nullable `customer_assets.folder_id` FK. Updated
  `src/types/database.ts` with the new table's Row/Insert/Update/Relationships and the
  `folder_id` column + FK on `customer_assets`.
- New `GET/POST /api/customers/[customerId]/assets/folders` route. `GET` idempotently
  provisions the six former hardcoded folders plus three new `is_system` sub-folders
  (`Branding`/`Proposals`/`Collateral`) under `Business Files`, backfills `folder_id` on
  any of the project/phase's assets still missing one (via the old `label`→folder-name
  map, now server-side only), then returns the flat folder list. `POST` creates one
  folder at any parent (root or nested), 400 on duplicate name within the same parent
  (unique constraint + Postgres `23505` handling), 404 on an invalid `parent_folder_id`.
- Extended `PATCH .../assets/[assetId]` to accept an optional `folder_id` (string |
  null) alongside the existing `allowed_roles`/`allowed_user_ids`, same auth/permission
  guard. Extended `POST .../assets` to accept and persist an optional `folder_id`.
- Rewrote `StorageFileExplorer` as a recursive folder browser: breadcrumb navigation
  (`Root ▸ … ▸ current`), child-folder pills (border-less, icon + name + kebab — kebab
  menu = "New sub-folder" only, matching the reference image), Drive-style file cards/
  rows with a kebab-only actions dropdown (View / Permissions / Move to folder /
  Remove — a full-screen transparent overlay closes any open dropdown on outside
  click), a checkbox-driven multi-select that swaps the header row for a bulk toolbar
  (✕ / "N selected" / Share / Move to folder / Delete) when ≥1 file is selected, a "New
  folder" modal reachable from the header (current level) and every folder pill's
  kebab (as a sub-folder of that folder), and a Move-to-folder modal (depth-indented
  flat folder list) used by both the single-file kebab and the bulk toolbar. Bulk
  actions loop the existing single-asset handlers via `Promise.all` — no new bulk API
  routes, per the task doc's own scoping.
- `handleUpload` now takes a `folderId` parameter and tags new uploads with the
  currently-open folder's id directly (fixing task 134/139's known "Add file always
  labels 'Documents'" quirk as a natural side effect of folders being explicit now).
- Added `handleMoveAsset` (single-file `folder_id` PATCH, reused by bulk move) and
  `handleCreateFolder` (POST to the new folders route, appends to `phase1Folders`) in
  the parent component. The mount effect now awaits the folders `GET` (provision +
  backfill) before the assets `GET`, so assets already carry a real `folder_id` on
  first render.
- Removed the now-dead module-level `ASSET_FOLDER_BY_LABEL`/`folderForAsset()`/
  `ASSET_FOLDER_ORDER` constants (folder derivation moved server-side, one-time, into
  the new route) and the now-unused `inputBase` style constant (only consumer was the
  removed textarea).

### Files Changed
- `supabase/migrations/065_customer_asset_folders.sql` — new table + `folder_id` column
  + indexes. **Not yet applied** — per this project's established convention (e.g. task
  129), the user applies migrations personally.
- `src/types/database.ts` — added `customer_asset_folders` table types; added
  `folder_id` (+ FK) to `customer_assets`.
- `src/app/api/customers/[customerId]/assets/folders/route.ts` — new file, `GET`
  (provision/backfill/list) + `POST` (create folder).
- `src/app/api/customers/[customerId]/assets/[assetId]/route.ts` — `PATCH` extended
  for optional `folder_id`.
- `src/app/api/customers/[customerId]/assets/route.ts` — `POST` extended for optional
  `folder_id`.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — removed
  `documentsNote`/`storageKbData`/its autosave effect/ref; removed the dead
  `ASSET_FOLDER_BY_LABEL`/`folderForAsset`/`ASSET_FOLDER_ORDER` constants and the
  now-unused `inputBase`; added `AssetFolder` type alias, `phase1Folders`/
  `phase1FoldersError`/`movingAssetId`/`creatingFolder` state; restructured the mount
  fetch effect (folders then assets); added `handleMoveAsset`/`handleCreateFolder`;
  extended `handleUpload`'s signature; rewrote `StorageFileExplorer` in full; added
  `MoreVertical`/`FolderPlus`/`FolderInput`/`Share2`/`ChevronRight` to the existing
  `lucide-react` import list.

### Deviations From Plan
- Bulk "Share" includes both role toggles and per-person toggles (reusing
  `ASSET_ROLE_OPTIONS`/`staffDirectory`, same as the single-file panel) rather than
  role-only — the task doc's Code Context sketch didn't specify, and full parity with
  the single-file permissions panel seemed the more consistent choice; applied via the
  same `Promise.all`-looped `PATCH` pattern as every other bulk action here.
- Kebab-dropdown outside-click-to-close uses a single shared full-screen transparent
  overlay (`fixed inset-0 z-10`) rather than per-item click-outside refs — simpler for
  a map-rendered list of arbitrarily many files/folders, functionally equivalent.
- No other deviations — implementation matches the task document's Requirements,
  Proposed File Changes, and Implementation Steps.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors; one transient `inputBase`-unused warning was
  fixed by removing the now-dead constant).
- `pnpm build` — PASS; confirmed `GET/POST /api/customers/[customerId]/assets/folders`
  is registered alongside the other `assets/*` routes.
- Manual browser verification — **SKIPPED**, same standing reason as prior tasks in
  this onboarding wizard file: live verification requires a logged-in Hub session, and
  entering the user's password to authenticate is a prohibited action regardless of
  authorization. The migration is also not yet applied (user applies personally), so
  the new route/columns aren't live in any environment yet to click through. Verified
  instead by code review: `npx tsc --noEmit`/`pnpm lint`/`pnpm build` all passing
  confirms every new prop wiring, state shape, and API contract type-checks end to end
  (parent handler signatures ↔ `StorageFileExplorer` prop types ↔ `Promise.all` usage
  in bulk actions); the folders route's provision-then-backfill logic was traced by
  hand against the exact legacy `ASSET_FOLDER_BY_LABEL` mapping it replaces to confirm
  behavioral equivalence for pre-existing assets; and the new/PATCH/POST routes reuse
  the same auth/lookup/error-response shape as their unmodified siblings in the same
  files. **This task needs a full manual pass once the migration is applied**: create/
  navigate nested folders, upload into a sub-folder, move a file (single + bulk), bulk
  delete, bulk share, and confirm the six system folders + three new sub-folders
  provision correctly on an existing in-progress project.

### Live-Run Fixes

- **Missing RLS policy on `customer_asset_folders` (found 2026-07-14, during the
  user's manual pass after applying migration 065).** Symptom: `GET
  .../assets/folders` returned 500 with `new row violates row-level security policy
  for table "customer_asset_folders"` (Postgres code `42501`) every time the
  provision-and-backfill step tried to insert the six system folders. Root cause:
  migration 065 never enabled RLS or added a policy for the new table, but this
  Supabase project auto-enables RLS on newly created tables — so every insert was
  silently default-denied once RLS kicked in, since a table with RLS enabled and zero
  policies denies everything by default. Its sibling `customer_assets` (migration 021)
  already has the fix for this exact class of problem: a broad `"...for all using
  (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')"` policy,
  since actual fine-grained access control in this codebase happens application-side
  in the API routes, not in RLS. Fixed via a new migration,
  `067_customer_asset_folders_rls_policy.sql`, adding the identically-shaped policy to
  `customer_asset_folders`. Not yet applied by the user as of this note — needed
  before the folders route will work at all.

- **Breadcrumb design iterated live (2026-07-14, several rounds of direct user
  feedback after migrations 065–067 were applied and the explorer was live).**
  Shipped state: initial 065/067 version hid the breadcrumb entirely at root and
  showed it only inside a folder. First revision: replaced the literal "Root" label
  with the project's public `project_id` (task 143's field) so the breadcrumb reads
  consistently with the rest of the app, and added a "Loading folders…" label in
  place of the breadcrumb while the initial folders/assets fetch is in flight (the
  breadcrumb went from "hidden at root" to "always visible", to accommodate this).
  Final revision: at root, the label is a plain non-clickable `<span>` (not a
  `<button>`) with `opacity-60`, since clicking it while already at root was a
  functional no-op; once nested, it reverts to a clickable button that jumps back to
  root. Also added a loading skeleton (4 pulsing placeholder tiles) shown while
  `phase1Loading` is true, replacing both the folder/file grid and the "No folders
  yet" empty state so neither flashes incorrectly before real data arrives; "New
  folder" is disabled during that same window to avoid racing the fetch.
- **Multi-select switched from checkboxes to Google Drive-style highlight-on-select
  (2026-07-14, user-requested UI change).** Removed the `<input type="checkbox">` on
  every file card/row; the whole card/row is now a `<button>` that toggles selection
  and gets a highlighted background (`bg-brand/10` light / `bg-brand/20` dark) when
  selected. Since HTML doesn't allow a `<button>` nested inside another `<button>`
  (and this codebase's convention requires `<button>`, not `<div onClick>`, for
  actions), the per-file kebab menu was repositioned as an absolutely-positioned
  sibling next to the selection button rather than a child of it.
- **Bulk Share panel wasn't closing (user-reported bug, 2026-07-14).** `bulkSharePanelOpen`
  was a standalone flag never reset by the toolbar's other actions (Clear selection,
  Move to folder, Delete) or by folder navigation, so it could persist open with
  nothing selected or after another action ran. Fixed with a `closeBulkSharePanel()`
  helper wired into all of those call sites, plus the panel's own JSX is now gated
  behind `selectedIds.size > 0` as a second line of defense so it structurally cannot
  render with an empty selection regardless of any future code path.
- **"Share with specific people" switched from listing every staff directory entry to
  a search-to-add picker (2026-07-14, user-requested UX improvement)** — added a
  shared `renderPersonPicker()` helper (search input + filtered dropdown + removable
  chips), mirroring the exact pattern already used in the Credentials & Links "Add"
  modal (`AddCredentialLinkModal`'s `personSearch`/`personDropdownOpen`/
  `filteredPeople` shape), replacing the "toggle-pill per person" list in both the
  per-file Permissions panel and the bulk Share panel.
- **File Permissions panel close button (2026-07-14, user-requested).** Added an
  explicit ✕ button in the panel's own header so it can be closed directly, instead
  of requiring a second click on "Permissions" in the kebab menu to toggle it shut.
