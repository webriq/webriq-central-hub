# 134: Onboarding Wizard — Storage Folder + KB Step Redesign (File Explorer / Finder UI with Permissions)

**Created:** 2026-07-13
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced

---

## Overview

The `storage-kb` sub-phase step ("Project folder live; knowledge base
populated with all assets.", Day 14, owner Bert) already has *some*
dedicated UI — a flat "Documents" upload box plus two plain textareas (DNS
access, 3rd-party credentials notes) — shipped before the current
`RichTextField`/`FileUploadBox`/permissions conventions existed. It has four
mapped internal-deliverable checklist items: `branding-guides`,
`kb-info-raw`, `dns-details`, `credentials-external`.

Per the user's direction, the **file-handling part** of this step is
redesigned to look and behave like a File Explorer / Finder: files uploaded
anywhere across Phase 1 (Business Facts, Outcome Target's attachment,
Migration Checklist's attachment, Content Map's attachment, the HTML
Mockup, and this step's own uploads) are grouped into structured folders by
category, with per-file **permission settings** — reusing the `allowed_roles`
column and role-picker UI that already exists and ships today on the
Customers → Assets tab (`src/app/v2/(hub)/customers/[customerId]/client.tsx`),
rather than inventing a new permissions model.

The DNS access / credentials note textareas are plain free-text fields, not
files — they are **not** part of this redesign and stay exactly as they are.

## Requirements

- [ ] The step renders a Finder-style file browser: a folder list/grid
      (icon + name + file count) on one side, and the selected folder's file
      list (icon + name + size + permission badge + View/Permissions/Remove
      actions) on the other. Folders are derived from each asset's `label`
      via a small lookup table (see Code Context) with an "Other" catch-all
      for anything unmapped.
- [ ] The browser is scoped to this project's Phase 1 assets only — fetch
      `GET /api/customers/[customerId]/assets` (already returns
      role-filtered results server-side) and filter client-side to
      `phase_number === 1 && project_id === project.id`.
- [ ] Each file row shows a permission badge ("All roles" or the specific
      role labels, reusing `ASSET_ROLE_LABELS`) and a "Permissions" action
      that opens a small popover/panel with the same "All / Super Admin /
      Admin / PM / Developer" toggle-pill UI already shipped in the
      Customers → Assets tab's "Add Asset" modal — wired to a **new** PATCH
      endpoint (no such endpoint exists today; see Proposed File Changes).
  [Recommendation: mirror the existing pill styling and role list exactly —
  this is a UI-consistency call the user hasn't been asked about, but any
  divergence should be confirmed before implementation if it turns out to
  matter.]
- [ ] "View" reuses the shared in-app viewer (`viewerFile`/`viewerUrl`/
      `viewerLoading`/`viewerError` state + `FileViewerModal`/`FilePreview`),
      generalized to accept any asset in this browser, not just Outcome
      Target's files.
- [ ] The existing "Documents" upload capability is preserved — a general
      upload button in the browser (or within a specific folder) still
      lets Bert add new files here, tagged `phase_number: 1`,
      `project_id: project.id`, `label: "Documents"` (unchanged label, so
      it continues to land in the same "Business Files" folder as before).
- [ ] The DNS access and 3rd-party credentials textareas remain exactly as
      they are today (same state, same autosave effect, same position on
      the page) — only their surrounding layout may shift to make room for
      the file browser above/beside them.
- [ ] The four existing internal-deliverable checklist items for this step
      are unaffected — no new items added, no changes to their gating logic.

## Out of Scope / Must-Not-Change

- No changes to `allowed_roles` semantics or the existing `canSeeAsset()`
  visibility filter (`src/app/api/customers/[customerId]/assets/route.ts:9-13`)
  — this task only exposes a UI to *edit* `allowed_roles` on assets created
  during onboarding; the enforcement logic itself is untouched.
- No changes to the Customers → Assets tab UI/component
  (`src/app/v2/(hub)/customers/[customerId]/client.tsx`) — its role-picker
  pattern is a **reference** to copy the look of, not a shared component to
  import (per this codebase's "page-scoped UI" convention — inline the
  pattern here rather than extracting a shared component across two pages
  that don't otherwise share code).
- No changes to `documentsNote`/`dnsAccess`/`credentialsNote` state, their
  autosave effect, or their textarea rendering.
- No drag-and-drop between folders, no rename/move — a file's folder is
  entirely derived from its `label`, which is set at upload time by whichever
  step uploaded it; this task does not add manual re-categorization.
- No changes to `kickoff`, `outcome-target`, `migration-checklist`,
  `content-map`, `html-mockup`, `client-signoff`.
- No DB schema/migration changes — `allowed_roles` already exists on
  `customer_assets`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/customers/[customerId]/assets/[assetId]/route.ts` | Create | New `PATCH` handler: updates an asset's `allowed_roles`, permission-gated the same way `DELETE` already is in the sibling `route.ts`. |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add a `phase1Assets` fetch, a folder-categorization lookup, a new `StorageFileExplorer` file-scoped component (folder list + file list + permissions popover), generalize the shared file-viewer handler, and update the `storage-kb` render block. |

## Code Context

### New route: `PATCH .../assets/[assetId]`

Mirror the existing `DELETE` handler's auth/lookup/permission-check shape
(`src/app/api/customers/[customerId]/assets/route.ts:129-158`), scoped to
updating only `allowed_roles`:

```ts
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  // same auth + getRequesterRole() + canSeeAsset() guard as DELETE
  const body = await request.json(); // { id: string, allowed_roles: string[] }
  const { error } = await supabase
    .from("customer_assets")
    .update({ allowed_roles: body.allowed_roles.length > 0 ? body.allowed_roles : null })
    .eq("id", body.id).eq("customer_id", customerId);
  // ...
}
```

### Existing GET route — already returns everything needed, filter client-side (`assets/route.ts:15-39`)

No server-side `phase_number`/`project_id` query param exists; the response
is small (a handful of Phase 1 files), so filter in the component:

```tsx
const phase1Assets = allAssets.filter((a) => a.phase_number === 1 && a.project_id === project.id);
```

### Folder categorization — new lookup, co-located in `_onboarding-wizard.tsx`

```tsx
const ASSET_FOLDER_BY_LABEL: Record<string, string> = {
  "Business Facts": "Business Files",
  "Documents": "Business Files",
  "Outcome Target": "Outcome Target",
  "Migration Checklist": "Checklist",
  "Content Map": "Content Map",
  "HTML Mockup": "HTML Mockup",
};
function folderForAsset(a: AssetRow): string {
  return ASSET_FOLDER_BY_LABEL[a.label] ?? "Other";
}
```

This mirrors the exact `label` values already used (or planned in tasks
131–133) by every upload call site in this file (`_onboarding-wizard.tsx`
`handleBusinessFactsUpload`, `handleUpload` ("Documents"),
`handleOutcomeFileUpload`, and the new handlers from tasks 131–133).

### Existing role-picker UI to model the permissions popover on (`src/app/v2/(hub)/customers/[customerId]/client.tsx:106-113, 1606-1640`)

```tsx
const ASSET_ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "pm", label: "PM" },
  { value: "developer", label: "Developer" },
] as const;
// "All" pill (clears allowedRoles) + one toggle pill per role, active state = brand-filled
```

Copy this exact toggle-pill visual pattern (not the surrounding modal
scaffolding, which is New/Edit-asset-form-specific) into a small popover
anchored to each file row's "Permissions" button.

### Shared file-viewer state — already generic, just needs a generic entry point (`_onboarding-wizard.tsx:134-138, 458-477`)

`viewerFile`/`viewerUrl`/`viewerLoading`/`viewerError` are already
step-agnostic. Add a new `handleViewAsset(asset: AssetRow)` that takes the
row directly (rather than looking it up by id in a specific local array
like `handleViewOutcomeFile` does), so the File Explorer can call it for any
asset in `phase1Assets` without needing its own copy of the file:

```tsx
const handleViewAsset = async (asset: AssetRow) => {
  setViewerFile(asset); setViewerUrl(null); setViewerError(null); setViewerLoading(true);
  try {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/${asset.id}/file-url`);
    if (!res.ok) throw new Error();
    const { url } = await res.json();
    setViewerUrl(url);
  } catch { setViewerError("Failed to load file preview."); }
  finally { setViewerLoading(false); }
};
```

Leave `handleViewOutcomeFile` (and the equivalents added by tasks 131/132)
as-is — they're already correct for their own `FileUploadBox` instances;
this is an additional entry point for the File Explorer only, not a
replacement.

## Implementation Steps

1. Create `src/app/api/customers/[customerId]/assets/[assetId]/route.ts` with the `PATCH` handler.
2. In `_onboarding-wizard.tsx`, add a `phase1Assets` state + fetch effect (`GET /api/customers/${project.customer_id}/assets`, filter client-side), triggered when the `storage-kb` step is active (or on mount, since the dataset is small).
3. Add `ASSET_FOLDER_BY_LABEL`/`folderForAsset()`.
4. Add `handleViewAsset(asset)` and a new `handlePermissionsChange(assetId, roles)` that PATCHes the new route and updates `phase1Assets` locally on success.
5. Build `StorageFileExplorer` as a new file-scoped component: folder sidebar (grouped counts via `folderForAsset`), selected-folder file list (icon, name, size formatted, permission badge, View/Permissions/Remove buttons), and a permissions popover reusing the toggle-pill pattern.
6. Update the `storage-kb` render block (`_onboarding-wizard.tsx:744-761`) to render `StorageFileExplorer` above the existing DNS/credentials textareas (which stay unchanged), and keep the existing "Documents" upload path wired into it (either as a persistent upload button in the explorer, or the existing `FileUploadBox` feeding the same `label: "Documents"`).
7. `npx tsc --noEmit` and `pnpm lint`.
8. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] The "Storage folder + KB" step (Step 6 of 7) shows a folder browser with folders for at least "Business Files", "Outcome Target", "Checklist", "Content Map", "HTML Mockup" (once tasks 131–133 exist) and "Other", each showing a correct file count.
- [ ] Clicking a folder shows only the files categorized into it.
- [ ] Each file row shows its current permission scope and a working "Permissions" control that updates `allowed_roles` via the new PATCH route — reloading confirms the change persisted.
- [ ] "View" opens the existing in-app viewer for any file in the browser (not just ones uploaded in the current step).
- [ ] Uploading a new "Documents"-labeled file still works and appears in "Business Files".
- [ ] The DNS access and credentials textareas are visually present and functionally unchanged (autosave still works).
- [ ] The four existing checklist items (`branding-guides`, `kb-info-raw`, `dns-details`, `credentials-external`) still render and gate exactly as before.
- [ ] `kickoff`, `outcome-target`, `migration-checklist`, `content-map`, `html-mockup`, `client-signoff` are unaffected.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new packages needed for this task.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000, a Phase 1 project with files already uploaded from earlier steps:
#   - Navigate to "Storage folder + KB" (Step 6)
#   - Confirm folders show with correct counts and correct files inside each
#   - Open a file's Permissions control, restrict to one role, save -> reload -> confirm it persisted
#   - As a user with a different role (or by directly querying `canSeeAsset` logic), confirm the restricted file is hidden from the Assets tab for a non-permitted role
#   - Click View on a file from a different step (e.g. the HTML mockup) -> confirm the in-app viewer opens correctly
#   - Confirm DNS/credentials textareas still autosave
```

## Compatibility Touchpoints

- New API route (`PATCH .../assets/[assetId]`) — additive only.
- No DB migration — `allowed_roles` column already exists.

## Implementation Notes

### What Changed
- Added a Finder-style File Explorer to the `storage-kb` step: a folder sidebar (grouped by each asset's `label` via `folderForAsset()`/`ASSET_FOLDER_BY_LABEL`) with file counts, and a file list per folder showing size, a permission badge ("All roles" or specific role names), and View/Permissions/Remove actions.
- Permissions editing reuses the exact toggle-pill visual pattern from the Customers → Assets tab's "Add Asset" modal (`ASSET_ROLE_OPTIONS`/`ASSET_ROLE_LABELS`, copied inline per this codebase's page-scoped UI convention, not imported as a shared component), shown as an inline expandable panel per file rather than a floating popover — a deliberate deviation from the task doc's "popover" wording, chosen to avoid click-outside/positioning edge cases for a small internal-tool control; functionally equivalent.
- "View" uses a new generic `handleViewAsset(asset)` entry point that reuses the already-shared `viewerFile`/`viewerUrl`/`viewerLoading`/`viewerError` state and existing `FileViewerModal`/`FilePreview`, so any Phase 1 asset (from any step, not just this one) can be opened from the explorer.
- The existing "Documents" upload/remove capability is preserved by reusing the existing `handleUpload`/`handleRemoveFile` handlers (not duplicating them) as the explorer's "Add file"/"Remove" actions — both were extended with one extra line each to also keep the new `phase1Assets` list in sync, so newly added/removed files show up in the explorer immediately without a refetch. The Phase 1 completion screen's "`{uploadedFiles.length}` files uploaded to project folder" count is unaffected (still counts only `uploadedFiles`, unchanged).
- `documentsNote`/`dnsAccess`/`credentialsNote` state, their autosave effect, and their textarea rendering are completely untouched — only the surrounding layout changed (each textarea's own `div` now carries `max-w-xl` individually, since the outer container lost its `max-w-xl` to give the wider File Explorer room; the previous look of each field is otherwise identical).

### Files Changed
- `src/app/api/customers/[customerId]/assets/[assetId]/route.ts` — new file, `PATCH` handler updating `allowed_roles`, permission-gated identically to the sibling `DELETE` handler in `assets/route.ts` (same `getRequesterRole`/`canSeeAsset` helpers, duplicated per this codebase's existing convention of not sharing helpers across route files in this directory).
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — added `ASSET_ROLE_OPTIONS`/`ASSET_ROLE_LABELS`/`ASSET_FOLDER_BY_LABEL`/`folderForAsset()`/`ASSET_FOLDER_ORDER`/`formatFileSize()` module-level helpers; `phase1Assets`/`phase1AssetsError`/`permissionsUpdatingId` state; a fetch effect populating `phase1Assets` on mount; `handleViewAsset`/`handlePermissionsChange` handlers; one-line extensions to the existing `handleUpload`/`handleRemoveFile` to keep `phase1Assets` in sync; the new `StorageFileExplorer` component; and the updated `storage-kb` render block. Added `Folder`/`Lock` to the existing `lucide-react` import list.

### Deviations From Plan
- Inline expandable permissions panel instead of a floating popover (noted above) — functionally equivalent, simpler and more robust for this use case.
- No other deviations — the rest of the implementation matches the task document's Code Context and Implementation Steps.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- `pnpm build` — PASS; confirmed the new `PATCH /api/customers/[customerId]/assets/[assetId]` route is correctly registered alongside the existing `file-url` and `content` sibling routes.
- Manual browser verification — **SKIPPED**, same standing reason as tasks 131–133 in this batch: live verification requires a logged-in Hub session, and entering the user's password to authenticate is a prohibited action regardless of authorization. Verified instead by code review: the new PATCH route's auth/permission-check shape is byte-for-byte the same pattern as the already-shipped `DELETE` handler in the sibling `assets/route.ts`; `handleViewAsset` is the same fetch-signed-url-then-set-state flow already proven working for `handleViewOutcomeFile` and its task 131/132/133 equivalents; and `handleUpload`/`handleRemoveFile`'s extensions are pure additive one-liners with no changed control flow.
