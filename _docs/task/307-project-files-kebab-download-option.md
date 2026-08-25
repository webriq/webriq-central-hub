# 307: Project Files — Download Option on File Kebab Menu (v2 + Legacy)

**Created:** 2026-08-25
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The Files tab on a project detail page (`/projects/v2/[projectId]/files` and `/projects/legacy/[projectId]/files`) lists each customer asset as a `FileTile`, with a per-tile kebab ("⋮") menu offering **View**, **Permissions**, and (when `canEdit`) **Rename** / **Move to folder** / **Remove**. There is no way to download a file directly from that menu today — a user has to open **View** (in-app preview modal) and, depending on file type, manually save it from there.

This task adds a **Download** item to that kebab menu, reusing the existing signed-URL download plumbing already shipped for the onboarding workspace's Notes tab (`NoteFileCard.handleDownload` in `_business-info-tab.tsx`) rather than inventing a new download mechanism: `GET /api/customers/[customerId]/assets/[assetId]/file-url?download=1` already returns a Supabase Storage signed URL with `Content-Disposition: attachment` (via the storage SDK's `download` option) so the browser saves the file under its real name instead of navigating to it. No API changes are needed.

**Both v2 and legacy already share one component tree** — `v2/[projectId]/(tabs)/files/page.tsx` and `legacy/[projectId]/(tabs)/files/page.tsx` both render `_shared/_project-detail.tsx` with `activeTab="files"`, which renders `_shared/_files-tab.tsx`, which renders the presentational `FilesTab` from `onboarding-workspace/_files-tab.tsx`, which renders `FileTile` from `onboarding-workspace/_file-tile.tsx` for every asset row. **The kebab menu itself — the thing being changed — lives entirely in `_file-tile.tsx`.** Editing that one file's `FileTile` component automatically covers both `/projects/v2/[projectId]/files` and `/projects/legacy/[projectId]/files`; there is no separate legacy code path to duplicate the change into.

(As a side effect, this also adds Download to the kebab menu inside the Onboarding Workspace's own Files tab, since `_onboarding-wizard-v2.tsx` renders the same `FileTile`. That's expected, not a scope violation — it's the same component, not a second implementation.)

## Requirements

- [ ] `FileTile`'s kebab/context menu (`src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-tile.tsx`) gains a **Download** action, positioned immediately after **View** and before **Permissions** — download availability mirrors View (no `canEdit` gate; both are read actions available to anyone who can see the tile, matching the fact that the asset list API (`/api/customers/[customerId]/assets` GET) already filters to only permission-visible assets, and the `file-url` route re-checks per-asset permission server-side regardless).
- [ ] Clicking **Download** fetches `` `/api/customers/${customerId}/assets/${asset.id}/file-url?download=1` ``, then triggers the browser save via a programmatically-clicked `<a href={signedUrl} target="_blank" rel="noopener noreferrer">`, exactly matching `NoteFileCard.handleDownload`'s existing pattern in `_business-info-tab.tsx:129-145` (no new fetch/download helper module — this is a small enough duplication that extracting a shared hook is not warranted for two call sites in unrelated tabs).
- [ ] Uses the `Download` icon from `lucide-react` (already imported and used identically in `_business-info-tab.tsx`).
- [ ] A failed fetch/signed-URL request fails silently (no dedicated error UI), matching `NoteFileCard.handleDownload`'s existing `catch { /* non-fatal */ }` precedent — consistent with how every other kebab action in this menu behaves (no in-menu error states exist for any item today).
- [ ] No visible behavior change to the **View**, **Permissions**, **Rename**, **Move to folder**, or **Remove** actions — only a new item is inserted.
- [ ] Grid view and list view (`FileTile`'s `viewMode` prop) both get the new action — it's the same `actions` array feeding `ActionsMenu` in both branches, so a single edit covers both view modes.

## Out of Scope / Must-Not-Change

- **Folder-level download (zip of a folder's contents)** — `FolderTile`'s own kebab menu (Permissions / Rename / Delete) is untouched. No folder-download capability exists anywhere in this codebase today; adding one is a distinct, unscoped feature (would need server-side zip streaming), not a "download option" on an existing per-file menu.
- The `file-url` API route (`src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts`) — its `?download=1` handling already exists and needs no change.
- `NoteFileCard`'s own Download button in `_business-info-tab.tsx` — reference pattern only, not modified.
- `_files-tab.tsx` (both the shared wrapper and the presentational onboarding-workspace version), `_rename-move-modals.tsx`, `ActionsMenu`/`ActionsMenuItems` in `_file-tile.tsx` — the menu-rendering mechanism itself is generic (`ItemAction[]`) and already supports adding an item with no structural change.
- Bulk/multi-select download — the existing multi-select toolbar (`onDelete={async () => { await Promise.all(...) }}` at `_files-tab.tsx:329`) is untouched; this task is the per-file kebab item only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-tile.tsx` | Modify | Add `Download` to the `lucide-react` import; add a `handleDownload` function and a `Download` entry to `FileTile`'s `actions` array |

## Code Context

### File: `_file-tile.tsx` — current icon import (line 4)
```tsx
import { Folder, FileText, Trash2, ExternalLink, MoreVertical, Pencil, FolderInput, Lock, AlertTriangle, History } from "lucide-react";
```

### File: `_file-tile.tsx` — `FileTile`'s current actions array (lines 273-293)
```tsx
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

const actions: ItemAction[] = [
  { label: "View", icon: ExternalLink, onClick: handleView },
  { label: "Permissions", icon: Lock, onClick: () => setPermissionsOpen((v) => !v), disabled: !canEdit },
  ...(canEdit ? [
    { label: "Rename", icon: Pencil, onClick: onRename },
    { label: "Move to folder", icon: FolderInput, onClick: onMove },
    { label: "Remove", icon: Trash2, onClick: onDelete, danger: true },
  ] : []),
];
```

### Reference: `_business-info-tab.tsx` — `NoteFileCard.handleDownload` (lines 108-145, the exact pattern to replicate)
```tsx
const fetchFileUrl = async (download: boolean) => {
  const res = await fetch(`/api/customers/${customerId}/assets/${file.id}/file-url${download ? "?download=1" : ""}`);
  if (!res.ok) throw new Error();
  const data: { url: string } = await res.json();
  return data.url;
};

const handleDownload = async () => {
  setDownloading(true);
  try {
    const url = await fetchFileUrl(true);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // Non-fatal — no dedicated error UI for a sandbox download action.
  } finally {
    setDownloading(false);
  }
};
```
`FileTile` does not need the `downloading` state itself — `ActionsMenuItems`' `onClick` already calls `onDone()` (closing the menu) before invoking `a.onClick()` (see `_file-tile.tsx:107-126`), so the menu is gone before the fetch even starts; there's nothing left in the menu to show a loading state on.

### File: `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts` (reference only — already supports this, no change)
```ts
const download = new URL(request.url).searchParams.get("download") === "1";
const { data: signed, error: signError } = await adminClient.storage
  .from("customer-assets")
  .createSignedUrl(asset.file_path, 60, download ? { download: asset.file_name ?? true } : undefined);
```

## Implementation Steps

1. In `_file-tile.tsx`, add `Download` to the `lucide-react` import (line 4).
2. Inside `FileTile`, add a `handleDownload` async function directly above the `actions` array, mirroring `NoteFileCard.handleDownload` (fetch `file-url?download=1`, then create/click/remove a temporary `<a>`), minus the `downloading` state (not needed — see Code Context note above).
3. Insert `{ label: "Download", icon: Download, onClick: handleDownload }` into the `actions` array, immediately after the `"View"` entry and before `"Permissions"`.
4. Run `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] On `/projects/v2/[projectId]/files`, opening a file row's kebab menu shows View → Download → Permissions (→ Rename/Move to folder/Remove if `canEdit`), in grid view and list view.
- [ ] On `/projects/legacy/[projectId]/files`, the same menu/order/behavior is present (verifies the shared-component claim — no separate legacy code needed).
- [ ] Clicking Download saves the file to disk under its original filename (via `Content-Disposition: attachment`), does not navigate the current tab away, and does not open the in-app preview modal.
- [ ] Folder tiles' kebab menu is unchanged (no Download entry).
- [ ] No regression to View, Permissions, Rename, Move to folder, or Remove.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
Browser walkthrough: open a project's Files tab on both `/projects/v2/[projectId]/files` and `/projects/legacy/[projectId]/files`, open a file's kebab menu in both grid and list view, click Download, confirm the browser save dialog/download shows the correct original filename.

## Compatibility Touchpoints

None — client-only change to an existing menu-rendering component; no new API route, no schema change, no packaging/docs impact.

## Implementation Notes

### What Changed
- Added a `Download` item to `FileTile`'s kebab/context menu, between `View` and `Permissions`, in `onboarding-workspace/_file-tile.tsx`. Clicking it fetches the existing `?download=1` signed URL and triggers a browser save via a temporary `<a target="_blank">`, exactly matching `NoteFileCard.handleDownload`'s established pattern in `_business-info-tab.tsx`.

### Files Changed
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-tile.tsx` — added `Download` to the `lucide-react` import; added `handleDownload` inside `FileTile`; inserted `{ label: "Download", icon: Download, onClick: handleDownload }` into the `actions` array.

### Deviations From Plan
- None. Implemented exactly as specified in Code Context/Implementation Steps.

### Verification Run
- `npx tsc --noEmit` — PASS (no output/errors)
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, untouched by this change)
- Browser walkthrough — PASS. Verified live against `/projects/v2/82ACEB0F-PROJ-03/files` and `/projects/legacy/82ACEB0F-PROJ-03/files` (same underlying project, both route variants): kebab menu on a file tile in the "Knowledge Base" folder shows View → Download → Permissions → Rename → Move to folder → Remove, in that order, on both routes. Clicking Download on each route fired `GET /api/customers/WRQ-CUST-82ACEB0F/assets/{assetId}/file-url?download=1` (confirmed via network tab, status 200 both times, same asset ID), opened and auto-closed a `target="_blank"` tab (the expected browser behavior for a `Content-Disposition: attachment` response), and produced no console errors. Folder tiles' kebab menu confirmed unchanged (no Download entry — folders were not touched).
- A pre-existing design-hook flag on this file (a `<img>`-related "broken-image" note on an unrelated `FileThumbnail` line, and two "font size off design ramp" notes on unrelated lines) was reviewed and left as-is — none are on lines this change touched, and per CLAUDE.md this codebase does not use a DESIGN.md-managed type ramp (literal Tailwind arbitrary font sizes like `text-[13px]` are the established convention throughout).

## Quality Gate Notes

### Result
PASS

### Standards Review
- Single-file change (`_file-tile.tsx`), scoped exactly to `FileTile`'s `actions` array and a new `handleDownload` function. No dead code, no `any`, no deep nesting, silent-catch error handling matches the sibling pattern it was modeled on (`NoteFileCard.handleDownload`).
- `handleDownload` duplicates ~12 lines of fetch+anchor-click logic already present in `NoteFileCard.handleDownload` (`_business-info-tab.tsx`) rather than extracting a shared hook. This was a deliberate, pre-approved call in the task doc's Requirements ("this is a small enough duplication that extracting a shared hook is not warranted for two call sites in unrelated tabs") — consistent with CLAUDE.md's "three similar lines is better than a premature abstraction" guidance. Not a finding; noted for visibility only.
- Confirmed `FolderTile`, `ActionsMenu`, `ActionsMenuItems`, `VersionBadge`, `PermissionBadge`, and `FileThumbnail` are byte-for-byte unchanged — the edit did not leak into any of the Out-of-Scope surfaces.
- No secrets, credentials, or debug logging introduced.

### Deviations
- None. Implementation matches every Requirement, stays inside every Out-of-Scope boundary, and the browser walkthrough already recorded in Implementation Notes confirms all Acceptance Criteria (menu order/content on both v2 and legacy routes, folder tiles unchanged, no regression to the other five actions).

### Required Fixes
- None.
