# 371: Recursive Customer-Asset Folder Delete + Delete Confirmation Dialogs (Files Tab)

**Created:** 2026-09-17
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** deep
**Status:** Completed (marked complete at the user's explicit request — browser acceptance not run)

---

## Overview

Reported bug: deleting a non-empty folder from the Customer Assets **Files tab** (Customer profile → Assets, and the Onboarding Workspace's own Files tab, and the shared v2/legacy Project Files tab — all three render the same presentational `FilesTab` component) fails with:

```
DELETE /api/customers/WRQ-CUST-C72F6F09/assets/folders/235281e2-d6a7-4b2d-a2b8-aca1bb9c0670 → 400
{"error":"Folder is not empty — move or remove its contents first"}
```

This is **intentional existing behavior**, not a latent bug — task 144's comment in the route explains why: `customer_asset_folders.parent_folder_id` is `ON DELETE CASCADE` (would silently delete nested sub-folders) and `customer_assets.folder_id` is `ON DELETE SET NULL` (files would silently become unfiled root-level orphans), so the route required the folder to already be empty rather than risk either silent side effect. The user has now explicitly asked for the opposite: deleting a folder should recursively delete everything inside it (sub-folders and files), and the missing piece that made the original empty-only guard reasonable — **no confirmation dialog before a destructive delete** — should be fixed by adding one, not preserved by keeping the block.

Two problems to fix together:

1. **Server**: `DELETE /api/customers/[customerId]/assets/folders/[folderId]` must recursively delete a folder's entire subtree (nested folders + all files inside them) instead of 400ing on non-empty folders.
2. **Client**: The Files tab currently calls `onDeleteFolder`/`onDeleteAsset` directly from a menu-item click — no confirmation step exists for either a single file, a single folder, or a bulk multi-file delete (`BulkToolbar`). Add a shared confirmation dialog, reusing the existing `ConfirmDialog` component (`src/components/ui/confirm-dialog.tsx`) already used by `_list-view.tsx`, `_ticket-detail.tsx`, `_task-detail.tsx`, etc. — do not build a second dialog component.

### Why recursive delete needs its own care (not just removing the 400)

The two duplicated `handleDeleteFolder` implementations (`_use-customer-assets.ts` for the shared Project/Customer Files tab, and an inline copy in `_onboarding-wizard-v2.tsx` for the Onboarding Workspace) already swallow the failure silently today (`if (!res.ok) return;` — no UI feedback at all, which is the other half of why this "fails" with no visible error to the user beyond DevTools). Once folders can be deleted non-empty, a naive fix (just delete the root folder row and let `ON DELETE CASCADE` handle the rest) has a real permission gap: `customer_asset_folders` and `customer_assets` each carry their **own independent** `allowed_roles` / `allowed_user_ids` (editable per-folder and per-file via the existing Share picker), so a sub-folder or file nested under a folder a PM can see may itself be restricted to a narrower audience (e.g. admin-only). Deleting the parent must not silently destroy content the requester isn't otherwise allowed to see. The route must therefore authorize **every folder and file in the subtree**, not just the one being clicked, before deleting anything.

## Requirements

- [ ] `DELETE /api/customers/[customerId]/assets/folders/[folderId]` deletes the target folder, every nested sub-folder at any depth, and every file (`customer_assets` row) inside any of them — no more "folder is not empty" 400.
- [ ] Before deleting anything, the route walks the full subtree and: (a) 400s with `"System folders can't be deleted"` if the root or **any descendant folder** is `is_system`; (b) 403s if the requester (not admin/super_admin) fails the existing `canSeeFolder`/`canSeeAsset` visibility check on the root **or any descendant folder or file** — the whole delete is rejected, not partially applied.
- [ ] File rows (`customer_assets`) in the subtree are deleted explicitly before the folder row is deleted (their FK is `ON DELETE SET NULL`, not cascade — they will not be removed by deleting the folder alone). Storage-object cleanup for `file_path` stays out of scope (see Out of Scope below).
- [ ] A shared `ConfirmDialog` (existing component, not a new one) gates: deleting a single folder, deleting a single file, and the `BulkToolbar` multi-file delete — all three currently fire on click with zero confirmation.
- [ ] The folder-delete confirmation body tells the user what will be removed (e.g. sub-folder + file counts) when the folder is non-empty, computed client-side from the already-loaded `folders`/`assets` arrays — no new fetch needed.
- [ ] `handleDeleteFolder`/`handleDeleteAsset` (both the `_use-customer-assets.ts` copy and the `_onboarding-wizard-v2.tsx` inline copy) report failure to the user via `toast.error(...)` (the codebase's established `sonner` pattern, e.g. `_use-files-deeplink.ts`) instead of silently no-op'ing on a non-2xx response.
- [ ] All three surfaces that render the shared `FilesTab` (Customer/Project Files tab via `_shared/_files-tab.tsx`, and the Onboarding Workspace's own `_onboarding-wizard-v2.tsx`) get the confirmation dialog, since both wire into the same presentational component.
- [ ] `nextjs-file-length-best-practices.md`: the recursive subtree walk + authorization logic is extracted into a small `src/lib` module (API route handlers should stay 50–150 lines, business logic goes to `/lib`), not inlined into the already-multi-responsibility `route.ts`.

## Out of Scope / Must-Not-Change

- **Storage-object cleanup on delete.** No asset delete path in this codebase today (including the existing single-file `DELETE /api/customers/[customerId]/assets`) removes the underlying Storage object for the asset's own `file_path` — that route only ever cleans up a *paired* mockup-spec's file (task 199), never the primary asset's own file. This task deletes `customer_assets` **rows** recursively, matching that existing (already-orphaning) behavior; it does not add Storage cleanup for any asset, to avoid scope creep into a pre-existing, unrelated gap. Do not add `adminClient.storage.from("customer-assets").remove(...)` calls for the deleted rows' own `file_path` values in this task.
- **PATCH `/assets/folders/[folderId]`** (rename, permission change) is untouched.
- **`note_folders`** (Project Notes feature) is a separate table/feature with its own delete button and its own pre-existing lack of confirmation — out of scope; do not touch `_note-folder-rail.tsx`.
- **RLS policies** — no migration, no RLS changes. All new authorization logic is application-level, matching the existing `canSeeFolder` pattern already in the route.
- Do not change the `customer_asset_folders.parent_folder_id` `ON DELETE CASCADE` / `customer_assets.folder_id` `ON DELETE SET NULL` FK definitions (migrations 065/081) — the fix works with them as-is (explicit asset delete before the cascade-eligible folder delete).
- Do not touch the single-asset `DELETE /api/customers/[customerId]/assets?id=` route beyond what's needed (nothing — it's reused as-is conceptually, not called by the folder route).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/uploads/customer-asset-folder-tree.ts` | Create | `collectFolderSubtree(supabase, customerId, rootFolderId)` — iterative BFS over `parent_folder_id`, returns every folder row (`id, is_system, allowed_roles, allowed_user_ids`) and every asset row (`id, allowed_roles, allowed_user_ids`) in the subtree (including the root folder), or an error signal. Pure data-fetching; no authorization decisions (those stay in the route, matching the existing `canSeeFolder` placement). |
| `src/app/api/customers/[customerId]/assets/folders/[folderId]/route.ts` | Modify (`DELETE` only) | Replace the empty-only 400 guard with: collect subtree via the new lib helper → reject if any folder is `is_system` → reject if any folder/asset fails visibility for the requester → bulk-delete `customer_assets` where `folder_id IN (subtree folder ids)` → delete the root folder row (cascade removes descendant folder rows). Adds a local `canSeeAsset` mirror (same convention as the existing "Mirror of the sibling assets routes' canSeeFolder()" comment) to check subtree assets. `PATCH` is untouched. |
| `src/app/(hub)/projects/_shared/_use-customer-assets.ts` | Modify | `handleDeleteFolder`/`handleDeleteAsset` return `Promise<boolean>` (success/failure) and call `toast.error(...)` on a non-2xx response, matching `handleRenameAsset`'s existing `Promise<boolean>` pattern in the same file. |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx` | Modify | Same treatment as above for its own inline `handleDeleteFolder`/`handleDeleteAsset` copies (this file has its own data layer, not `useCustomerAssets`). |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab.tsx` | Modify | Add `pendingDelete` state (`{ kind: "folder" \| "file" \| "bulk"; ... } \| null`) + `deleting` boolean. `FolderTile`/`FileTile`/`BulkToolbar`'s `onDelete` now set `pendingDelete` instead of calling the delete handler directly. Render one `<ConfirmDialog>` wired to confirm/cancel the pending action. Update `onDeleteFolder`/`onDeleteAsset` prop types to `Promise<boolean>`. |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab-parts.tsx` | Modify | Add a small pure helper, `describeFolderContents(folders, assets, folderId): { folderCount: number; fileCount: number }`, used only to build the confirmation-dialog body text (walks the already-loaded arrays; no fetch). Keeps `_files-tab.tsx` from growing past its current 325 lines with inline recursion logic. |

## Code Context

### File: `src/app/api/customers/[customerId]/assets/folders/[folderId]/route.ts` (current `DELETE`, lines 98–168 — the guard to replace)

```ts
// Empty-only delete (task 144): customer_asset_folders.parent_folder_id is ON DELETE
// CASCADE (would silently delete nested sub-folders) and customer_assets.folder_id is
// ON DELETE SET NULL (files would silently become unfiled root-level orphans) — both
// are avoided by requiring the folder to already have zero direct children of either kind.
const { count: childFolderCount, ... } = await supabase.from("customer_asset_folders")...
const { count: assetCount, ... } = await supabase.from("customer_assets")...
if ((childFolderCount ?? 0) > 0 || (assetCount ?? 0) > 0) {
  return NextResponse.json({ error: "Folder is not empty — move or remove its contents first" }, { status: 400 });
}
const { error: deleteError } = await supabase.from("customer_asset_folders").delete()...
```

Replace the "empty-only" block (everything from the `childFolderCount` query through the final delete) with a call into the new lib helper, then bulk-delete assets, then delete the root folder. The existing root-folder fetch (`folder.is_system`, `canSeeFolder(...)`) stays as the fast-path early check before doing the subtree walk.

### File: `src/app/api/customers/[customerId]/assets/[assetId is not a param here]/route.ts` — `canSeeAsset` to mirror

```ts
function canSeeAsset(
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
(from `src/app/api/customers/[customerId]/assets/route.ts`) — copy this verbatim into the folder route as a local mirror, same convention already used for `canSeeFolder` there.

### File: `src/app/(hub)/projects/_shared/_use-customer-assets.ts` (current, to change)

```ts
const handleDeleteFolder = useCallback(async (folderId: string) => {
  const res = await fetch(`/api/customers/${customerId}/assets/folders/${folderId}`, { method: "DELETE" });
  if (!res.ok) return;
  setFolders((prev) => prev.filter((f) => f.id !== folderId));
}, [customerId]);
```
→ return `Promise<boolean>`, add `toast.error("Couldn't delete folder — try again")` on `!res.ok` (import `{ toast } from "sonner"`, same as `_use-files-deeplink.ts`). Same shape change for `handleDeleteAsset`.

### File: `.../onboarding-workspace/_files-tab.tsx` (current direct-call wiring, lines 139–191)

```tsx
onDelete={() => onDeleteFolder(folder.id)}      // FolderTile, line 149
onDelete={() => onDeleteAsset(asset.id)}        // FileTile, line 184
onDelete={async () => { await Promise.all(Array.from(selectedIds).map((id) => onDeleteAsset(id))); clearSelection(); }}  // BulkToolbar, line 236
```
Each becomes `onDelete={() => setPendingDelete({ kind: "folder", id: folder.id, name: folder.name })}` (etc.), and a single `<ConfirmDialog>` near the other modals (`renameTarget`/`moveTargetAssetIds`/`duplicatePrompt` blocks at the bottom of the component, lines 299–322) performs the actual call on confirm.

### Reference: `src/components/ui/confirm-dialog.tsx` (reuse as-is, no changes)

```tsx
<ConfirmDialog
  open={confirmOpen}
  title="..."
  body="..."
  confirmLabel={deleting ? "Deleting…" : "Delete"}
  confirmDisabled={deleting}
  onConfirm={...}
  onCancel={...}
/>
```
(usage pattern from `_shared/_list-view.tsx`, lines ~344–350 — same `confirmOpen`/`deleting` state shape to copy here.)

## Implementation Steps

1. Create `src/lib/uploads/customer-asset-folder-tree.ts` with `collectFolderSubtree(supabase, customerId, rootFolderId)`: BFS loop querying `customer_asset_folders` where `parent_folder_id IN (frontier)`, selecting `id, is_system, allowed_roles, allowed_user_ids`, accumulating into one folder list (root included), until a query returns no rows; then one `customer_assets` query `.in("folder_id", allFolderIds)` selecting `id, allowed_roles, allowed_user_ids`. Return `{ folders, assets }` or a typed error result on any Supabase error.
2. In `route.ts`'s `DELETE` handler: after the existing root-folder fetch + `canSeeFolder` + `is_system` checks (unchanged, kept as the fast early-exit), call `collectFolderSubtree`. If it errors, 500. If any folder in the result has `is_system`, 400 `"System folders can't be deleted"`. Add the local `canSeeAsset` mirror; if any folder fails `canSeeFolder(myRole, user.id, f.allowed_roles, f.allowed_user_ids)` or any asset fails `canSeeAsset(...)`, 403 `"Some items inside this folder aren't visible to you"`.
3. If all checks pass: `await supabase.from("customer_assets").delete().in("folder_id", allFolderIds)` (check `error`, 500 on failure), then the existing `.from("customer_asset_folders").delete().eq("id", folderId).eq("customer_id", customerId)` (cascade handles descendant folder rows). Return 204 as before.
4. `_use-customer-assets.ts`: import `toast` from `sonner`; change `handleDeleteFolder`/`handleDeleteAsset` to `async (...): Promise<boolean>`, returning `true`/`false` and calling `toast.error(...)` on failure (read `error` from the JSON body when present, falling back to a generic message).
5. `_onboarding-wizard-v2.tsx`: apply the identical change to its own inline `handleDeleteFolder`/`handleDeleteAsset`.
6. `_files-tab-parts.tsx`: add `describeFolderContents(folders: AssetFolder[], assets: AssetRow[], folderId: string)` — BFS/DFS over the in-memory arrays (same shape as the server walk, purely for display text), returning `{ folderCount, fileCount }` (counts exclude the root folder itself).
7. `_files-tab.tsx`: add `pendingDelete`/`deleting` state; change the three `onDelete` call sites (`renderFolderTile`, `renderFileTile`, `BulkToolbar`'s `onDelete`) to set `pendingDelete` instead of calling the handler; add a `confirmDelete`/`cancelDelete` pair (confirm: set `deleting`, await the right handler(s), clear `selectedIds` if bulk, close dialog); render `<ConfirmDialog>` near the other modal blocks, with body text built from `describeFolderContents` for the folder case (e.g. "This will permanently delete N sub-folder(s) and M file(s) inside it." when non-zero, otherwise a plain "This folder will be permanently deleted."), a static file-name message for the single-file case, and a "N files will be permanently deleted" message for bulk. Update the `onDeleteFolder`/`onDeleteAsset` prop types to `Promise<boolean>`.
8. Run `npx tsc --noEmit` and `pnpm lint`; fix any type fallout from the `Promise<boolean>` signature changes at both caller sites.

## Acceptance Criteria

- [ ] Deleting a folder that contains nested sub-folders and files succeeds (204) and removes the folder, its sub-folders, and all files inside them from the UI and DB — reproduces the exact case from the bug report (`customerId=WRQ-CUST-C72F6F09`, non-empty folder) without the 400.
- [ ] Deleting a folder whose subtree contains a folder or file the current (non-admin) user isn't permitted to see (`allowed_roles`/`allowed_user_ids` restricted away from them) is rejected with 403 and **nothing** is deleted.
- [ ] Deleting a folder whose subtree contains an `is_system` folder is rejected with 400 and nothing is deleted.
- [ ] Clicking "Delete" on a single folder, a single file, or a multi-select bulk delete each opens the shared `ConfirmDialog` first — nothing is deleted until "Delete" is clicked in the dialog; "Cancel" (or dismiss) deletes nothing.
- [ ] The folder-delete dialog's body reflects sub-folder/file counts when the folder is non-empty.
- [ ] A failed delete (e.g. a stale 403/404 from a race) shows a `toast.error` instead of silently doing nothing.
- [ ] Behavior is identical across all three surfaces sharing the presentational `FilesTab` (Customer Assets / Project Files tab, Onboarding Workspace Files tab).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser acceptance (no automated test runner in this repo):
1. As a PM/admin, open a customer's Assets/Files tab, create a folder, add a sub-folder inside it and a file inside the sub-folder. Delete the top folder — confirm the dialog appears, shows the sub-folder/file count, and confirms the whole tree is gone after clicking Delete.
2. Repeat directly against the reported case (`WRQ-CUST-C72F6F09`, folder id `235281e2-d6a7-4b2d-a2b8-aca1bb9c0670` if it still exists) and confirm the 400 no longer occurs.
3. Delete a single file — confirm the dialog appears with the file name before it disappears.
4. Multi-select several files and use the `BulkToolbar` delete action — confirm one dialog gates all of them, and Cancel leaves all files intact.
5. As a non-admin role, attempt to delete a folder containing a sub-folder/file restricted (via the Share picker) to a different role — confirm a 403/toast error and that nothing was removed (verify via a page refresh).
6. Repeat steps 1–4 inside the Onboarding Workspace's own Files tab (separate data layer, same presentational component) to confirm parity.

## Compatibility Touchpoints

- No schema/migration changes. No new env vars or dependencies (`sonner` is already installed and mounted in `(hub)/layout.tsx`; a toast will not render if this flow is ever reached from a `(public)` route, but Customer Assets is `(hub)`-only).
- `ConfirmDialog` is reused unmodified — no visual/behavioral changes to its other call sites.

## Implementation Notes

### What Changed
- `DELETE /api/customers/[customerId]/assets/folders/[folderId]` now recursively deletes a folder's entire subtree (nested sub-folders + files) instead of 400ing on non-empty folders, after authorizing every folder and file in that subtree individually (not just the clicked folder) and rejecting the whole delete if any of them is `is_system` or invisible to the requester.
- The Files tab (shared across the Customer/Project Files tab and the Onboarding Workspace) now gates single-folder, single-file, and bulk multi-file deletes behind the existing `ConfirmDialog` component instead of deleting on click; the folder dialog's body reports sub-folder/file counts when non-empty.
- `handleDeleteFolder`/`handleDeleteAsset` (both the `useCustomerAssets` hook copy and the Onboarding Workspace's inline copy) now return `Promise<boolean>` and surface failures via `toast.error(...)` instead of silently no-op'ing; a successful folder delete also refetches folders/assets so a deleted subtree's now-orphaned local state (nested folders/files the client didn't have explicit ids for) is cleared from the UI without a full page reload.

### Files Changed
- `src/lib/uploads/customer-asset-folder-tree.ts` - new `collectFolderSubtree()`, BFS walk over `parent_folder_id` returning every folder + asset row in a folder's subtree (or an error)
- `src/app/api/customers/[customerId]/assets/folders/[folderId]/route.ts` - `DELETE` handler replaced the empty-only 400 guard with the subtree walk + per-item `is_system`/visibility checks + bulk asset delete + root folder delete (cascade handles descendant folder rows); added a local `canSeeAsset` mirror
- `src/app/(hub)/projects/_shared/_use-customer-assets.ts` - `handleDeleteFolder`/`handleDeleteAsset` now return `Promise<boolean>`, `toast.error` on failure, folder-delete success triggers a folders+assets refetch
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx` - identical treatment for its own inline `handleDeleteFolder`/`handleDeleteAsset` copies
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab-parts.tsx` - added `describeFolderContents()`, a pure client-side walk of the already-loaded `folders`/`assets` arrays for the confirmation dialog's body copy
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab.tsx` - added `pendingDelete`/`deleting` state, a `ConfirmDialog` render, and routed the three delete call sites (`FolderTile`, `FileTile`, `BulkToolbar`) through it instead of calling the delete handlers directly; updated `onDeleteFolder`/`onDeleteAsset` prop types to `Promise<boolean>`

### Deviations From Plan
- Added a `.eq("customer_id", customerId)` scope to the bulk `customer_assets` delete (plan's step 3 only specified `.in("folder_id", allFolderIds)`) — defense-in-depth consistent with every other query in this route already double-scoping by id + `customer_id`; low-risk, no behavior change under normal operation since subtree folder ids are already derived from a root folder verified to belong to this customer.
- Added a folders+assets refetch after a successful folder delete in both `handleDeleteFolder` copies, beyond the plan's `setFolders((prev) => prev.filter(...))` — necessary because a recursive delete also removes descendant folders (via cascade) and files the client has no explicit ids for; without the refetch, deleted nested content would remain visible in stale local state until a manual page reload, which would fail the "removes ... from the UI" acceptance criterion.
- No other deviations — file list, function names, and route behavior match the task doc.

### Verification Run
- `npx tsc --noEmit` - PASS (no output/errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, not touched by this task)
- Browser/manual acceptance (folder tree delete, permission-gated subtree, confirm/cancel dialogs, bulk delete, Onboarding Workspace parity) - SKIPPED (no browser session available this run; flagged for the `test`/verification stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- All 6 changed/new files read in full and traced against the plan's file list, code context, and implementation steps — each matches.
- `customer-asset-folder-tree.ts`: pure data-fetching helper as planned, no authorization logic leaked in (kept in the route per the existing `canSeeFolder` placement convention); typed return (`{folders, assets} | {error}`), no `any`.
- `route.ts` `DELETE`: 79 lines (114–192), within the 50–150-line route-handler guideline; all three delete-blocking checks (is_system, visibility, subtree lookup failure) return before either destructive query runs — confirmed no partial-delete path exists. The pre-existing root-only `is_system`/`canSeeFolder` checks (lines 138–143) are now a strict subset of the subtree checks (root is always `subtreeFolders[0]`) — intentional, harmless fast-path duplication per the plan's own note ("kept as the fast early-exit"), not flagged as a defect.
- `canSeeAsset` mirrored verbatim from the sibling `assets/route.ts`, matching the existing `canSeeFolder`-mirroring convention already in this file (same doc-comment style).
- `_use-customer-assets.ts` / `_onboarding-wizard-v2.tsx`: both `handleDeleteFolder`/`handleDeleteAsset` pairs now return `Promise<boolean>` and `toast.error(...)` on failure, matching the plan and the existing `handleRenameAsset`/`handleRenameFolder` `Promise<boolean>` precedent already in the same files.
- `_files-tab-parts.tsx`: `describeFolderContents()` is pure, typed, and documented as informational-only (server is the authorization source of truth) — no scope drift.
- `_files-tab.tsx`: grew from 325 to 377 lines by adding the confirm-dialog state/copy/wiring; still under the documented 400–500 hard limit, and the plan's own mitigation (extracting `describeFolderContents` rather than inlining the recursion) was followed. No dead code, no new `any`, no `<div onClick>` in place of a button, no secrets/debug logging.
- Caught and fixed one self-introduced redundancy during this review: both `handleDeleteFolder` copies did an immediate `setFolders((prev) => prev.filter(...))` right before an unconditional refetch that overwrites `folders` again a moment later — removed the now-pointless intermediate filter from both files (see Deviations).
- Unrelated pre-existing `design-system-font-size` hook findings surfaced repeatedly on `_onboarding-wizard-v2.tsx` and `_files-tab.tsx` (lines in the 220s–390s range) — all on font-size literals untouched by this task's edits (confirmed by re-reading each flagged line's surrounding context); not addressed, per the hook's own guidance not to fix unrelated findings incidentally.

### Deviations
- Minor: added `.eq("customer_id", customerId)` to the bulk `customer_assets` subtree delete beyond the plan's literal `.in("folder_id", allFolderIds)` — defense-in-depth consistent with this route's existing double-scoping convention; no behavior change under normal operation.
- Minor: added a folders+assets refetch after a successful folder delete (both `handleDeleteFolder` copies), beyond the plan's plain local-array filter — required so a recursive delete's now-gone nested folders/files actually disappear from the UI without a manual reload; documented in Implementation Notes above.
- Minor (caught in this review pass, fixed): removed a redundant `setFolders((prev) => prev.filter(...))` call that immediately preceded the refetch added above in both `handleDeleteFolder` copies — the refetch already replaces the array, so the filter was dead work with no visible effect. No behavior change, `npx tsc --noEmit` and `pnpm lint` re-run clean after the fix.
- Minor: on a failed delete, `confirmDelete` in `_files-tab.tsx` still closes the `ConfirmDialog` (the failing handler already surfaced a `toast.error`) rather than leaving the dialog open for a retry. Acceptable — the acceptance criterion only requires a toast on failure, not that the dialog stays open — but worth noting as a UX choice, not an oversight.
- No Major deviations — no scope expansion, no out-of-scope files touched (`note_folders`, PATCH handler, RLS/migrations, and storage-object cleanup all confirmed untouched), no architecture changes beyond what the task doc specified.

### Required Fixes
- None.
