# 144: Storage/KB File Explorer — Folder Permissions, Folder Rename/Delete, File Rename

**Created:** 2026-07-14
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Three follow-ups to task 141's `StorageFileExplorer` / `customer_asset_folders`:

1. **Folder-level sharing to roles/users.** `customer_asset_folders` has no
   `allowed_roles`/`allowed_user_ids` columns today — only `customer_assets` does
   (task 138). Add the same two columns to folders, filter the folder list server-side
   the same way assets already are, and add a Permissions option to each folder's
   kebab menu reusing the exact role-pill + `renderPersonPicker` UI already built for
   files.
2. **Folder rename + delete.** Task 141 explicitly excluded both ("No folder rename or
   delete — only creation"). Confirmed with the user:
   - **Rename** is allowed on *any* folder, including the 6 auto-provisioned system
     folders and the 3 pre-seeded `Business Files` sub-folders (Branding/Proposals/
     Collateral) — cosmetic and low-risk, since folder membership has been
     `folder_id`-based (not name-based) since task 141's one-time provisioning
     backfill.
   - **Delete** stays blocked on all 9 of those system-provisioned folders (protects
     the baseline structure every project starts with), and is blocked on *any* folder
     (system or custom) unless it is completely empty — zero direct child folders and
     zero direct assets. This was a deliberate call, not just an implementation
     detail: `customer_asset_folders.parent_folder_id` is `ON DELETE CASCADE`
     (deleting a folder silently deletes nested sub-folders) and
     `customer_assets.folder_id` is `ON DELETE SET NULL` (files inside would silently
     become unfiled root-level orphans, not deleted, but easy to lose track of) —
     blocking non-empty deletes avoids both surprises entirely; the user must move or
     remove contents first.
3. **File rename.** `customer_assets.file_name` has no rename path anywhere. Extend the
   existing single-asset `PATCH` route to also accept `file_name`, and add a "Rename"
   option to the file kebab menu. This only changes the DB's display-name column —
   the Storage object at `file_path` is never touched or moved, same "display metadata
   is independent of physical storage path" boundary this codebase already keeps
   (task 143's `project_id` vs. Storage path being a parallel example).

## Requirements

- [ ] Migration `068`: add nullable `allowed_roles text[]` and `allowed_user_ids
      uuid[]` to `customer_asset_folders` (same shape/semantics as `customer_assets`'
      columns — OR-combined, NULL/empty = unrestricted).
- [ ] New `src/app/api/customers/[customerId]/assets/folders/[folderId]/route.ts`:
  - `PATCH` — accepts any of `{ name?, allowed_roles?, allowed_user_ids? }`. Renaming
    validates non-empty name and surfaces a 400 on the existing unique-per-parent
    constraint violation (Postgres `23505`), same pattern as the folders `POST` route.
    Permission updates use the same `canSeeFolder()` gate as `DELETE` (see below) —
    only someone who can already see the folder may modify it.
  - `DELETE` — 400 if `is_system` is `true` ("System folders can't be deleted"); 400 if
    the folder has any direct child folder or any direct asset ("Folder is not empty
    — move or remove its contents first"); otherwise deletes it.
- [ ] `GET .../assets/folders` (existing route) adds a `canSeeFolder()` check —
      structurally identical to `assets/route.ts`'s `canSeeAsset()` — and filters the
      returned folder list by it before responding.
- [ ] `PATCH .../assets/[assetId]` (existing route) accepts an additional optional
      `file_name` (non-empty string when present), updated alongside the existing
      `allowed_roles`/`allowed_user_ids`/`folder_id` fields.
- [ ] `StorageFileExplorer`: each folder's kebab menu gains **Permissions** (opens the
      same inline expandable role-pill + `renderPersonPicker` panel already built for
      files, applied to the folder instead) and **Rename** (small modal, reusing the
      existing "New folder" modal's shape — text input + Save/Cancel) alongside the
      existing "New sub-folder". A **Delete** option is also added, disabled (with a
      tooltip explaining why) when the folder is a system folder or not empty, calling
      the new `DELETE` route otherwise.
- [ ] `StorageFileExplorer`: each file's kebab menu gains **Rename** (same small-modal
      pattern) alongside the existing View / Permissions / Move to folder / Remove,
      calling the extended `PATCH .../assets/[assetId]` with the new name.
- [ ] A single shared small "rename" modal (name input + Save/Cancel, matching the
      existing New Folder modal's visual shape) is reused for both folder rename and
      file rename — not two near-duplicate modals.

## Out of Scope / Must-Not-Change

- **No visibility inheritance.** A folder's own `allowed_roles`/`allowed_user_ids`
  governs only whether *that folder* is returned by `GET .../assets/folders` — it does
  not cascade to hide its files (independently governed by their own `customer_assets`
  permissions, unchanged since task 138) or nested sub-folders (independently governed
  by their own folder permissions). This matches the existing per-object permission
  model everywhere else in this codebase — no new hierarchical/inherited permission
  concept is introduced. Known consequence, acceptable and not fixed here: a
  non-restricted child folder nested under a permission-restricted parent may become
  unreachable via normal breadcrumb navigation for a user who can't see the parent
  (since they can never click into it), while still technically appearing in flatter
  listings (e.g. the Move-to-folder picker) that don't recurse through parent
  visibility. Flag as a follow-up if this proves confusing in practice.
- **No Storage object rename/move** for file rename — `file_path` is completely
  untouched; this is a display-name-only change, same boundary task 137/143 already
  established for path vs. metadata.
- **No bulk rename or bulk delete for folders** — this task's folder actions
  (Permissions/Rename/Delete) are single-folder, kebab-menu-only, not added to the
  existing bulk toolbar (which is files-only, per task 141).
- **No change to `folder_id`'s `ON DELETE SET NULL` / `parent_folder_id`'s `ON DELETE
  CASCADE` FK behavior** — the empty-folder-only delete rule is enforced in
  application code (the new `DELETE` route), not by changing the DB constraints
  themselves.
- **No change to the 6 system folders' or 3 pre-seeded sub-folders' names, `is_system`
  flag, or provisioning logic** — rename only changes what a *specific project's*
  already-provisioned row is called; new projects still provision with the original
  names, unaffected.
- **No changes** to `kickoff`, `outcome-target`, `migration-checklist`, `content-map`,
  `html-mockup`, `client-signoff`, or the "Credentials & links" list.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/068_customer_asset_folders_permissions.sql` | Create | Add `allowed_roles`/`allowed_user_ids` to `customer_asset_folders`. |
| `src/app/api/customers/[customerId]/assets/folders/route.ts` | Modify | `GET` adds `canSeeFolder()` filtering. |
| `src/app/api/customers/[customerId]/assets/folders/[folderId]/route.ts` | Create | New `PATCH` (rename/permissions) + `DELETE` (empty/non-system only) handlers. |
| `src/app/api/customers/[customerId]/assets/[assetId]/route.ts` | Modify | `PATCH` accepts optional `file_name`. |
| `src/types/database.ts` | Modify | Add `allowed_roles`/`allowed_user_ids` to `customer_asset_folders` Row/Insert/Update. |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Folder kebab: Permissions/Rename/Delete. File kebab: Rename. New shared rename modal. New parent handlers (`handleFolderPermissionsChange`, `handleRenameFolder`, `handleDeleteFolder`, `handleRenameAsset`). |

## Code Context

### New folder permissions columns (migration 068)

```sql
alter table customer_asset_folders
  add column if not exists allowed_roles text[],
  add column if not exists allowed_user_ids uuid[];
```

### `canSeeFolder()` — mirror of `assets/route.ts`'s `canSeeAsset()` (`assets/route.ts:11-22`)

```ts
function canSeeFolder(
  role: string | null, userId: string | null,
  allowedRoles: string[] | null, allowedUserIds: string[] | null
) {
  if (role === "admin" || role === "super_admin") return true;
  const noRoleRestriction = !allowedRoles || allowedRoles.length === 0;
  const noUserRestriction = !allowedUserIds || allowedUserIds.length === 0;
  if (noRoleRestriction && noUserRestriction) return true;
  const roleMatches = !noRoleRestriction && !!role && allowedRoles.includes(role);
  const userMatches = !noUserRestriction && !!userId && allowedUserIds.includes(userId);
  return roleMatches || userMatches;
}
```

Apply in `GET .../assets/folders` after the existing `provisionAndBackfill` call:
```ts
const myRole = await getRequesterRole(supabase, user.id); // new helper, same shape as sibling routes
const { data } = await supabase.from("customer_asset_folders").select("*")...;
const visible = (data ?? []).filter((f) => canSeeFolder(myRole, user.id, f.allowed_roles, f.allowed_user_ids));
return NextResponse.json(visible);
```

### New `[folderId]/route.ts` — `DELETE`'s empty/non-system checks

```ts
const { data: folder } = await supabase.from("customer_asset_folders").select("*")
  .eq("id", folderId).eq("customer_id", customerId).maybeSingle();
if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
if (folder.is_system) return NextResponse.json({ error: "System folders can't be deleted" }, { status: 400 });

const { count: childFolderCount } = await supabase.from("customer_asset_folders")
  .select("id", { count: "exact", head: true }).eq("parent_folder_id", folderId);
const { count: assetCount } = await supabase.from("customer_assets")
  .select("id", { count: "exact", head: true }).eq("folder_id", folderId);
if ((childFolderCount ?? 0) > 0 || (assetCount ?? 0) > 0) {
  return NextResponse.json({ error: "Folder is not empty — move or remove its contents first" }, { status: 400 });
}
await supabase.from("customer_asset_folders").delete().eq("id", folderId).eq("customer_id", customerId);
```

### Existing folder kebab menu to extend (`_onboarding-wizard.tsx`, current `openFolderMenuId === folder.id` block)

```tsx
{openFolderMenuId === folder.id && (
  <div className={cn("absolute right-1 top-full mt-1 z-20 w-40 rounded-lg border shadow-lg py-1", ...)}>
    <button onClick={() => { setOpenFolderMenuId(null); openNewFolderModal(folder.id); }}>
      <FolderPlus size={13} /> New sub-folder
    </button>
    {/* add: Permissions, Rename, Delete (disabled + title tooltip when folder.is_system or non-empty) */}
  </div>
)}
```
A folder's "non-empty" check for disabling Delete client-side can reuse `childrenOf(folder.id).length > 0` (already computed) plus a count of `assets.filter(a => a.folder_id === folder.id).length > 0` — both already available client-side from the existing `folders`/`assets` props, no extra fetch needed just to grey out the button (the server route re-validates regardless, this is UX-only).

### Existing file kebab menu to extend (`_onboarding-wizard.tsx`, `fileMenu()`, View/Permissions/Move to folder/Remove)

Add a "Rename" button between Permissions and Move to folder (or wherever reads best),
opening the new shared rename modal seeded with `f.file_name`.

### Shared rename modal — model on the existing New Folder modal (`_onboarding-wizard.tsx`, `newFolderModalOpen` block)

Same shape (name input, autoFocus, Enter-to-submit, Save/Cancel) — generalize to a
`renameTarget: { kind: "folder" | "file"; id: string; currentName: string } | null`
state instead of two separate near-duplicate modals.

## Implementation Steps

1. Write and apply migration `068` (not applied by the implementer — user applies
   personally, per this project's established convention).
2. Update `database.ts` for the two new folder columns.
3. Add `canSeeFolder()` + requester-role lookup to `GET .../assets/folders`.
4. Create `folders/[folderId]/route.ts` (`PATCH` + `DELETE`).
5. Extend `PATCH .../assets/[assetId]` for `file_name`.
6. In `_onboarding-wizard.tsx`: add `handleFolderPermissionsChange`,
   `handleRenameFolder`, `handleDeleteFolder`, `handleRenameAsset` parent handlers
   (same fetch-then-update-local-state pattern as their existing siblings); add the
   shared rename modal state/UI; extend the folder kebab menu (Permissions/Rename/
   Delete) and file kebab menu (Rename); wire a folder-permissions inline panel reusing
   `renderPersonPicker`/the existing role-pill JSX, parameterized to target a folder
   instead of a file.
7. `npx tsc --noEmit` and `pnpm lint`.
8. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] A folder's Permissions panel restricts it to specific roles/people; a
      non-permitted requester's `GET .../assets/folders` no longer includes it.
- [ ] Renaming any folder (system or custom) via its kebab menu persists and displays
      immediately, including the 6 system folders and 3 pre-seeded sub-folders.
- [ ] Deleting an empty, non-system folder succeeds and removes it from the tree.
- [ ] Deleting a system folder is blocked (client-side disabled + server-side 400 if
      attempted directly).
- [ ] Deleting a non-empty folder (has a file or a sub-folder) is blocked (client-side
      disabled + server-side 400 if attempted directly) with a clear error message.
- [ ] Renaming a file via its kebab menu persists and displays immediately; the file's
      `file_path`/actual Storage object is unchanged (confirm the file still
      opens/views correctly after rename).
- [ ] All previously-shipped folder/file behavior (creation, move, bulk actions, Grid/
      List toggle, breadcrumb, loading skeleton) is unaffected.
- [ ] `kickoff`, `outcome-target`, `migration-checklist`, `content-map`, `html-mockup`,
      `client-signoff` are unaffected.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new packages needed.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000, after the user applies migration 068:
#   - Set a folder's Permissions to a single role -> confirm a different-role user's assets/folders GET excludes it
#   - Rename a system folder (e.g. "Business Files" -> "Docs") -> confirm it persists
#   - Try to delete a system folder -> confirm blocked with a clear message
#   - Try to delete a non-empty custom folder -> confirm blocked
#   - Empty a custom folder (move/remove its file, delete any sub-folder) then delete it -> confirm it succeeds
#   - Rename a file -> confirm the new name shows everywhere and the file still opens/views correctly
```

## Compatibility Touchpoints

- Migration `068` is additive only (two new nullable columns) — no breaking change.
- New `[folderId]/route.ts` route is additive.
- `PATCH .../assets/[assetId]`'s new optional `file_name` field is additive/backward
  compatible with existing callers.

## Implementation Notes

### What Changed
- Migration `068`: added nullable `allowed_roles text[]`/`allowed_user_ids uuid[]` to
  `customer_asset_folders` — identical shape/semantics to `customer_assets`' columns.
- `GET .../assets/folders`: added `getRequesterRole()` + `canSeeFolder()` (structural
  mirror of the assets route's `canSeeAsset()`) and filters the folder list by it
  before responding, after the existing provision-and-backfill step.
- New `src/app/api/customers/[customerId]/assets/folders/[folderId]/route.ts`:
  - `PATCH` — accepts any of `{ name?, allowed_roles?, allowed_user_ids? }`; renaming
    validates a non-empty string and surfaces the unique-per-parent constraint
    violation (Postgres `23505`) as a 400, same pattern as the folders `POST` route;
    permission updates gate on `canSeeFolder()` against the folder's *current*
    permissions before applying the change.
  - `DELETE` — 400 if `is_system` is `true`; 400 if the folder has any direct child
    folder or any direct asset (counted via two `head: true` count queries, no row data
    fetched); otherwise deletes.
- `PATCH .../assets/[assetId]`: extended to accept an optional `file_name` (non-empty
  string), applied alongside the existing `allowed_roles`/`allowed_user_ids`/
  `folder_id` fields in the same request. `file_path` is never touched.
- `src/types/database.ts`: added `allowed_roles`/`allowed_user_ids` to
  `customer_asset_folders` Row/Insert/Update.
- `StorageFileExplorer` (`_onboarding-wizard.tsx`):
  - Added `renderFolderPermissionsPanel()`, a folder-targeted twin of the existing
    `renderPermissionsPanel()`, reusing the same role-pill JSX and the shared
    `renderPersonPicker()` search-to-add UI (its own `folderPersonSearch`/
    `folderPersonDropdownOpen` state, since a folder panel and a file panel could
    theoretically be open at the same time).
  - Folder kebab menu gained Permissions / Rename / Delete below the existing "New
    sub-folder" — Delete is disabled client-side (with a `title` tooltip explaining
    why) when the folder is a system folder or has any direct child folder/asset
    (computed from the already-available `folders`/`assets` props, no extra fetch);
    the server route re-validates authoritatively regardless.
  - File kebab menu gained Rename between Permissions and Move to folder.
  - Added one shared rename modal (`renameTarget: { kind: "folder" | "file"; id }` +
    `renameValue`/`renameError` state), reusing the existing New Folder modal's exact
    visual shape, used by both folder rename and file rename instead of two
    near-duplicate modals.
  - Added `handleFolderPermissionsChange`, `handleRenameFolder`, `handleDeleteFolder`,
    `handleRenameAsset` parent handlers (same fetch-then-update-local-state pattern as
    their existing siblings `handlePermissionsChange`/`handleMoveAsset`/
    `handleRemoveFile`), plus `folderPermissionsUpdatingId`/`renamingFolderId`/
    `deletingFolderId`/`renamingAssetId` busy-state, wired into the
    `StorageFileExplorer` call site.

### Files Changed
- `supabase/migrations/068_customer_asset_folders_permissions.sql` — new file. **Not
  yet applied** — per this project's established convention, the user applies
  migrations personally.
- `src/types/database.ts` — added folder permission columns.
- `src/app/api/customers/[customerId]/assets/folders/route.ts` — `GET` adds
  `canSeeFolder()` filtering.
- `src/app/api/customers/[customerId]/assets/folders/[folderId]/route.ts` — new file,
  `PATCH` + `DELETE`.
- `src/app/api/customers/[customerId]/assets/[assetId]/route.ts` — `PATCH` accepts
  optional `file_name`.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — new state,
  handlers, `renderFolderPermissionsPanel`, `openRenameModal`/`submitRename`, extended
  folder and file kebab menus, new shared rename modal, extended `StorageFileExplorer`
  props/call site.

### Deviations From Plan
- None — implementation matches the task document's Requirements, Proposed File
  Changes, and Implementation Steps exactly, including both user-confirmed defaults
  (rename allowed on system folders; delete blocked on system folders and any
  non-empty folder).

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- `pnpm build` — PASS; confirmed both
  `GET/POST /api/customers/[customerId]/assets/folders` and the new
  `PATCH/DELETE /api/customers/[customerId]/assets/folders/[folderId]` routes are
  registered.
- Manual browser/DB verification — **SKIPPED, cannot be done yet**: migration 068 has
  not been applied (user applies migrations personally), so `allowed_roles`/
  `allowed_user_ids` don't exist on `customer_asset_folders` in any live environment
  yet. Once applied, the task doc's own Verification section's manual steps (folder
  permission filtering, system-folder rename, system/non-empty-folder delete blocking,
  empty-folder delete success, file rename) still need to be run.

### Live-Run Fixes

- **User applied migration 068 and exercised the feature live** — no backend errors
  were reported this round (unlike task 141's missing-RLS-policy gap on
  `customer_asset_folders`), only UI polish feedback, captured below.
- **Rename modal Save button "Saving…" state (2026-07-14, user-requested).** The
  shared rename modal's Save button previously stayed labeled "Save" the whole time
  it was disabled mid-request; now shows "Saving…" while
  `renamingFolderId`/`renamingAssetId` matches the current `renameTarget`, for both
  folder and file rename.
- **Folder Permissions panel close button (2026-07-14, user-requested)** — same fix as
  task 141's file Permissions panel: added an explicit ✕ button to
  `renderFolderPermissionsPanel()`'s own header so it can be closed directly instead
  of requiring a second click on "Permissions" in the folder's kebab menu.
