# 359: Project → Files Tab — "Copy Folder URL" / "Copy File URL" Kebab Actions (+ deep-link support, + file-length refactor)

**Created:** 2026-09-11
**Priority:** MEDIUM
**Type:** feature
**Version Impact:** minor
**Platform:** Web
**Automation:** manual
**Status:** COMPLETED — marked complete at the user's explicit request
**Completed:** 2026-09-11

---

## Implementation Notes (2026-09-11)

All Must-Have requirements implemented. Gates: `npx tsc --noEmit` **PASS**, `pnpm lint` **PASS**
(2 pre-existing unrelated warnings in `_checklist-tab.tsx` — the baseline), `pnpm build`
**PASS**. **Browser acceptance NOT RUN** — the Testing Checklist below is for `/test`.

### `/simplify` pass (2026-09-11)

4 parallel review agents (Reuse, Simplification, Efficiency, Altitude) ran against the task's
diff. **Reuse: clean, no findings.** Applied fixes from the other three:

- **[Efficiency]** `_use-files-deeplink.ts`'s `target` memo now short-circuits on `hasNavigated`
  before touching `assets`/`folders`. Previously it kept doing a full linear scan on every
  upload/delete/rename/move (each gives those arrays a new identity) even after the viewer had
  navigated and the memo's result was being discarded.
- **[Simplification]** Removed a no-op `!!autoPreviewAssetId &&` guard in front of
  `autoPreviewAssetId === asset.id` (the `===` already yields `false` against `null`/`undefined`).
- **[Simplification]** `renderFileTile` in `onboarding-workspace/_files-tab.tsx` now takes the
  exported `VersionGroup` type from `_use-files-tab-derived.ts` instead of restating its shape inline.
- **[Simplification]** `MIME_LABELS` in `_file-upload-constants.ts` is no longer `export`ed —
  nothing outside that file used it.
- **[Altitude]** Extracted `clampMenuPosition()` (+ named `MENU_WIDTH`/`MENU_ITEM_HEIGHT`/
  `MENU_EDGE_MARGIN` constants) into `_file-actions-menu.tsx`, shared by `ActionsMenu`'s kebab
  and `_files-tab.tsx`'s right-click context menu. Both had independently hand-copied the same
  "clamp a floating menu inside the viewport" arithmetic, and it had already drifted once (160px
  vs. 176px) before this task's own `w-40`→`w-44` fix papered over the mismatch — one function
  now makes that drift impossible instead of just fixing it once.

**Skipped, with reasons:**

- **[Simplification, lower-confidence]** The reviewer flagged `_use-files-deeplink.ts`'s
  `if (loading) return NO_TARGET` as possibly redundant, since `assets`/`folders` start `[]` and
  the memo would resolve to `NO_TARGET` anyway. Verified: true today, but it depends on
  `_use-customer-assets.ts` never resetting `assets`/`folders` without also resetting `loading`
  to `true` on a `customerId`/`projectId` change — which that hook doesn't currently do, but
  isn't guaranteed by anything. Kept as cheap, still-correct defensive code against that hook
  changing later, rather than trimming a guard whose only cost is one extra `||` clause.
- **[Altitude]** The reviewer's core suggestion — replace the `navigatedFolderId`/`target`/
  `hasNavigated` merge with the ref-guarded one-time `useEffect` pattern already used in
  `_onboarding-wizard-v2.tsx` for the same class of problem — was **not applied**. Checked it
  against this composition specifically: `_shared/_files-tab.tsx` gates the presentational
  `FilesTab` behind `if (loading) return <Spinner/>`, so the tab first mounts on the exact render
  where `assets`/`folders` are already loaded. The current `useMemo`-derived approach resolves
  the target correctly on that very first render (no flash). An effect-based rewrite runs
  post-commit, so the tab would render at the Files **root** for one paint, then jump to the
  target folder once the effect fires — an observable regression the derived-render form doesn't
  have. The efficiency fix above (short-circuiting on `hasNavigated`) captures the real,
  actionable part of this finding — the wasted post-navigation recompute — without introducing
  that regression.
- **[Altitude]** Flagged that `_onboarding-wizard-v2.tsx` still carries its own independent copy
  of the customer-assets CRUD logic that `useCustomerAssets` now centralizes for the project
  Files tab — the task-276 duplication this echoes is real, but touching a large, wizard-specific
  file not in this task's diff is out of scope here (the reviewer's own assessment agreed).
- **[Altitude]** Flagged that the `autoPreview` deep-link trigger is solved per-`FileTile`
  instance (a ref-guarded effect on each tile) rather than once at the `FilesTab` container where
  the target asset id is already known. Not applied: doing this properly means lifting the
  preview-modal ownership out of `FileTile` into a single container-level modal — a rearchitecture
  of a per-tile, self-contained preview design that predates task 359, not a change contained to
  this diff.

Re-verified after fixes: `npx tsc --noEmit` **PASS**, `pnpm lint` **PASS** (same 2 pre-existing
warnings), `pnpm build` **PASS**.

### Final line counts (acceptance bar met)

| File | Before | After |
|------|--------|-------|
| `onboarding-workspace/_files-tab.tsx` | 537 ❌ | **331** ✅ |
| `onboarding-workspace/_file-tile.tsx` | 423 ❌ | **271** ✅ |
| `onboarding-workspace/_use-files-tab-derived.ts` | — | 120 |
| `onboarding-workspace/_files-toolbar.tsx` | — | 96 |
| `onboarding-workspace/_folder-tile.tsx` | — | 95 |
| `onboarding-workspace/_file-actions-menu.tsx` | — | 92 |
| `onboarding-workspace/_files-tab-parts.tsx` | — | 51 |
| `onboarding-workspace/_file-upload-constants.ts` | — | 20 |
| `_shared/_use-customer-assets.ts` | — | 123 |
| `_shared/_use-files-deeplink.ts` | — | 81 |
| `_shared/_files-tab.tsx` | 160 | **69** ✅ |
| `_shared/_copy-link-button.tsx` | 52 | 62 |

### Deviations from the plan

1. **Deep-link resolution is derived during render, not resolved in a `useEffect`.** The plan
   sketched a `useEffect` + `resolved` ref that corrected `openFolderId` after load. Replaced
   with a pure `useMemo` over `(loading, assets, folders, folderParam, fileParam)` plus a
   `navigatedFolderId` state whose `undefined` initial value means "the viewer hasn't navigated,
   so the URL still governs". Removes an extra render pass and the state-drift window the
   effect version had. Per `rerender-derived-state-no-effect` (vercel-react-best-practices).
2. **`copyLink(url)` added to `_shared/_copy-link-button.tsx`** — the plan's preferred option of
   the two it offered. `useCopyLink` now delegates to it, so relative→absolute resolution lives
   in exactly one place and nothing had to be duplicated for the per-click call style.
3. **Kebab dropdown widened `w-40` → `w-44` (160px → 176px)** in `_file-actions-menu.tsx`, with
   the matching `menuWidth` constant, so "Copy Folder URL" doesn't wrap. Now identical to the
   right-click context menu's existing `w-44`.
4. **`useCustomerAssets` uses `AbortController`** rather than the original's `cancelled` boolean.
   Same observable behaviour, but in-flight requests are actually cancelled on unmount and a
   network failure no longer surfaces as an unhandled promise rejection.
5. **`renderFolderTile` / `renderFileTile` builders** in the presentational tab. `FolderTile` had
   two copy-pasted render sites (root grid + sub-folder grid) and `FileTile` two more (grid +
   list) — 4 places the new props had to be wired identically. One builder each removes the
   drift risk that caused the original duplication to diverge before.
6. **`&&` conditionals → ternaries** in the files rewritten, per `rendering-conditional-render`.
   Not applied to files outside this task's scope.
7. **`pnpm build` was run in addition to tsc + lint.** `useSearchParams()` without a Suspense
   boundary is a build-time-only failure — invisible to `tsc`. Confirmed both
   `/projects/v2/[projectId]/files` and `/projects/legacy/[projectId]/files` build as `ƒ`
   (dynamic), so the `force-dynamic` reasoning in the plan holds and no Suspense wrapper is
   needed. `_project-detail.tsx` was therefore **not** touched, as intended.

### Known limitation (as designed, documented inline)

A `?file=` link pointing at an **older version** in a version group opens the correct folder but
not the preview — that asset has no rendered tile. Also applies to an asset with a null
`folder_id`; both fall back to the Files root rather than a broken view.

---

## Overview

The Project detail **Files** tab (`/projects/v2/{projectId}/files` and
`/projects/legacy/{projectId}/files`) lets a PM browse a customer's folders and files, but
there is **no way to hand someone a link to a specific folder or file** — the open folder is
purely local React state, so the browser URL is always just `.../files` no matter how deep
you are.

This task adds **Copy Folder URL** and **Copy File URL** to the existing kebab (⋮) menu on
folder tiles and file tiles, and — because a copied link is worthless if it doesn't land the
recipient anywhere — adds the **deep-link plumbing** those URLs need: `?folder=<uuid>` opens
that folder; `?file=<uuid>` opens the file's folder and its preview modal.

It also carries a scoped **file-length refactor** of the files touched, per
`nextjs-file-length-best-practices.md` — two of them are already at/over the guide's hard
limit before this change lands.

## Requirements

### Must Have
- [x] Folder kebab menu (and its right-click context menu twin) shows **Copy Folder URL**.
- [x] File kebab menu (and its right-click context menu twin) shows **Copy File URL**.
- [x] Both actions are available to **every** role that can see the tile — they are read-only
      actions, like the existing View/Download, and must NOT be gated behind `canEdit`.
- [x] Clicking either copies an **absolute** URL to the clipboard and confirms with a toast.
- [x] Opening a copied folder URL lands on the Files tab **with that folder open** and the
      breadcrumb populated.
- [x] Opening a copied file URL lands on the Files tab with the file's folder open **and the
      file's preview modal open**.
- [x] Copied URLs work for BOTH route families (`/projects/v2/...` and `/projects/legacy/...`)
      without hard-coding either — derive from the live pathname.
- [x] An invalid / inaccessible `?folder=` or `?file=` id degrades gracefully to the Files
      root, never to a blank or broken folder view.
- [x] The **Onboarding Workspace**'s Files tab (which renders the same presentational
      component) is behaviourally **unchanged** — it has its own name-path URL scheme.
- [x] Every file created or modified respects `nextjs-file-length-best-practices.md`
      (soft 250–300, hard 400–500). See the Refactor section — this is a hard requirement of
      the ask, not a nice-to-have.
- [x] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

### Nice to Have
- [x] The browser URL stays in sync as the user navigates folders, so "copy the address bar"
      also works and browser Back behaves sensibly.

### Explicitly Out of Scope
- Copying a **signed Storage URL** for a file. Signed URLs from
  `/api/customers/{customerId}/assets/{assetId}/file-url` are short-lived and expire — pasting
  one into Slack produces a dead link within the hour. "Copy File URL" means a Hub deep link.
- Any change to the Onboarding Workspace's own `?tab=&parent_folder=&sub_folder_l1=` scheme
  (`_workspace-url-params.ts`).
- Adding these actions to the `projects-old/` tree (dead code).
- Copy actions on task/issue **attachments** (a different component,
  `_shared/_attachment-actions-menu.tsx`).

---

## Current State

### How the Files tab is wired today

```
/projects/v2/[projectId]/(tabs)/files/page.tsx     ← server, force-dynamic
  └─ _shared/_project-detail.tsx  (799 lines)
       └─ _shared/_files-tab.tsx  (160 lines)      ← DATA WRAPPER; owns openFolderId
            └─ onboarding-workspace/_files-tab.tsx (537 lines)  ← PRESENTATIONAL
                 ├─ onboarding-workspace/_file-tile.tsx (423 lines)
                 │    ├─ ActionsMenu / ActionsMenuItems / ItemAction   ← the kebab
                 │    ├─ FolderTile
                 │    └─ FileTile
                 ├─ onboarding-workspace/_rename-move-modals.tsx
                 ├─ onboarding-workspace/_bulk-toolbar.tsx
                 └─ onboarding-workspace/_upload-queue.tsx
```

The legacy route (`/projects/legacy/[projectId]/(tabs)/files/page.tsx`) is identical except
for `basePath`.

**Key facts confirmed by reading the code:**

1. `_shared/_files-tab.tsx:35` owns `openFolderId` as plain `useState`. **Nothing reads or
   writes the URL.** This is the whole reason a deep link doesn't exist yet.
2. The kebab menu is driven by a single `ItemAction[]` array per tile
   (`_file-tile.tsx:156` for folders, `:307` for files). **The same array feeds both the kebab
   and the right-click context menu** (`onContextMenu` → `_files-tab.tsx:161 openContextMenu`),
   so adding one entry to the array lights up both triggers. No duplication needed.
3. `ItemAction = { label, icon, onClick, danger?, disabled? }` (`_file-tile.tsx:45`).
4. `ActionsMenuItems` (`_file-tile.tsx:115`) calls `onDone()` **before** `a.onClick()` — the
   menu closes the instant you click. So an in-menu "Copied!" label (the
   `_shared/_copy-link-menu-item.tsx` pattern) would flash and vanish. Use a **toast** instead;
   this matches how `Download` already behaves (`_file-tile.tsx:286-289` documents exactly this).
5. `ActionsMenu` sizes itself from `actions.length * 32 + 8` (`_file-tile.tsx:71`), so an extra
   item is handled automatically. Menu width is `w-40` (160px) for the kebab and `w-44` (176px)
   for the context menu — "Copy Folder URL" at `text-[12px]` fits both.
6. `sonner` **is** an installed dependency (`package.json:67`) and `<Toaster position="bottom-right" />`
   is mounted in `src/app/(hub)/layout.tsx:47`. `_shared/_notes-tab.tsx`, `_create-task-modal.tsx`
   and `_create-issue-modal.tsx` already use it. *(Note: the "sonner is not installed" line in
   `CLAUDE.md`'s UI Polish Conventions is stale — flag it, see Docs Updates below.)*
7. `useCopyLink(url)` already exists (`_shared/_copy-link-button.tsx:16`) and **resolves a
   relative URL against `window.location.origin`** (`resolveUrl`, line 7). So we can hand it
   `` `${pathname}?folder=${id}` `` and get an absolute URL for free.
8. **The v2 `[projectId]` route segment is the display `project_id`, not the UUID**
   (CLAUDE.md, task 188), while `FilesTab` receives `project.id` (the UUID,
   `_project-detail.tsx:728`). Therefore the copy URL **must** be built from `usePathname()`,
   never reconstructed from the `projectId` prop — that would produce a 404 on v2.
9. `_file-tile.tsx`'s exports are consumed by exactly **one** file — `onboarding-workspace/_files-tab.tsx:8`.
   Verified by grep; every other hit is a comment reference. The refactor below is therefore
   fully contained.
10. `onboarding-workspace/_onboarding-wizard-v2.tsx:426-443` renders the same presentational
    `FilesTab`. Every new prop must be **optional** so that call site needs no change.
11. `FilePreviewModal` (`_file-previews.tsx:212`) already renders a graceful
    "Preview not available for this file type." fallback, so auto-opening it for a `.docx`
    or unknown MIME is safe.
12. The presentational tab does **client-side version grouping** (`_files-tab.tsx:139-149`):
    same-named files in a folder collapse to one tile (the newest). An older version's asset id
    therefore has no rendered tile — the deep link must degrade to "open the folder" in that case.

### Current Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/app/(hub)/projects/_shared/_files-tab.tsx` | 160 | Data wrapper: loads assets/folders/staff, owns `openFolderId`, all mutation handlers |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab.tsx` | **537** | Presentational tab: toolbar, breadcrumb, grid/list, derived data, modals |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-tile.tsx` | **423** | `ItemAction`, `ActionsMenu`, `ActionsMenuItems`, `FileThumbnail`, `PermissionBadge`, `VersionBadge`, `FolderTile`, `FileTile` |
| `src/app/(hub)/projects/_shared/_copy-link-button.tsx` | 52 | `useCopyLink()` + `CopyLinkButton` — **reuse, do not duplicate** |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-previews.tsx` | 274 | `FilePreviewModal` + mini previews |
| `src/app/(hub)/projects/v2/[projectId]/(tabs)/files/page.tsx` | 38 | v2 route |
| `src/app/(hub)/projects/legacy/[projectId]/(tabs)/files/page.tsx` | 38 | legacy route |

Two files are already at/over the guide's **hard limit of 400–500**. Adding features to them
without splitting would make this worse — hence the refactor below is part of the task.

---

## Proposed Solution

### URL contract

| Link | Shape | Behaviour on open |
|------|-------|-------------------|
| Folder | `<current pathname>?folder=<folder uuid>` | Files tab opens with that folder open, breadcrumb populated |
| File | `<current pathname>?file=<asset uuid>` | Files tab opens the asset's own `folder_id`, then auto-opens that file's preview modal |

- **Folder id, not name path.** Unlike the Onboarding Workspace (which needs names because it
  maps *deliverables* → folders), the Files tab has a concrete folder row in hand. UUIDs are
  stable across renames and unambiguous across duplicate sibling names.
- **`?file=` alone is sufficient** — the containing folder is derived from `asset.folder_id`,
  which is more reliable than trusting a second param. Don't emit `?folder=` alongside `?file=`.
- Query params, not route segments, so CLAUDE.md's "UUID `id` remains the routing key" rule and
  the task-188 display-id segment convention are both untouched.

### Why a toast and not an inline "Copied!"

`ActionsMenuItems` closes the menu before running the handler, so there is no surviving UI to
show state on. `toast.success("Folder link copied")` / `toast.success("File link copied")` via
`sonner` is the pattern already used by the sibling `_shared/` components. On clipboard failure
(`useCopyLink().copy()` returns `false`), emit `toast.error("Couldn't copy link")`.

### Architecture

Keep the presentational `FilesTab` and its tiles **dumb**. The wrapper owns pathname, clipboard
and toast:

```
_shared/_files-tab.tsx (thin component)
  ├─ _shared/_use-customer-assets.ts   (NEW) data + mutations hook
  └─ _shared/_use-files-deeplink.ts    (NEW) reads ?folder/?file, syncs URL, builds copy URLs
        │  exposes: { openFolderId, setOpenFolderId, autoPreviewAssetId,
        │             copyFolderUrl(folderId), copyFileUrl(assetId) }
        ▼
   presentational FilesTab
        │  new OPTIONAL props: onCopyFolderUrl?, onCopyFileUrl?, autoPreviewAssetId?
        ▼
   FolderTile / FileTile — append one ItemAction each, only when the callback is provided
```

Because the new props are optional and the Onboarding Workspace doesn't pass them, the workspace
renders exactly as before — no extra menu items, no URL behaviour.

### URL sync mechanism

Read `?folder=` / `?file=` **once on mount** via `useSearchParams()`; write subsequent folder
navigation with `window.history.replaceState` (natively supported in Next.js App Router for
search-param updates) rather than `router.replace`. Both files pages are
`export const dynamic = "force-dynamic"`, so a `router.replace` would trigger a full RSC
round-trip and a visible stall on every folder click. `replaceState` avoids that entirely.

Validation after load (folders/assets arrive async; the wrapper shows a spinner until then):
- `?folder=<id>` not present in the loaded `folders` → reset `openFolderId` to `null`.
  **Required** — otherwise `currentLevelFolders` (which filters `parent_folder_id === openFolderId`)
  renders an empty non-root view with a broken breadcrumb.
- `?file=<id>` not present in the loaded `assets` → clear `autoPreviewAssetId`, stay at root.
- `?file=<id>` present but its folder resolves → open `asset.folder_id`, set `autoPreviewAssetId`.

### File Changes

| Action | File | Description |
|--------|------|-------------|
| CREATE | `_shared/_use-customer-assets.ts` | Hook: assets/folders/staff state, initial load, all 9 mutation handlers lifted verbatim from `_shared/_files-tab.tsx` |
| CREATE | `_shared/_use-files-deeplink.ts` | Hook: mount-time `?folder`/`?file` parse, post-load validation, `replaceState` sync, `copyFolderUrl`/`copyFileUrl` (uses `useCopyLink` + `usePathname` + `toast`) |
| MODIFY | `_shared/_files-tab.tsx` | Reduced to a thin component consuming both hooks; passes the 3 new optional props down. 160 → ~80 lines |
| CREATE | `onboarding-workspace/_file-actions-menu.tsx` | Moved verbatim: `ItemAction`, `ActionsMenu`, `ActionsMenuItems` |
| CREATE | `onboarding-workspace/_folder-tile.tsx` | Moved: `FolderTile` + the new Copy Folder URL action |
| CREATE | `onboarding-workspace/_files-toolbar.tsx` | Moved: breadcrumb + search + sort + view toggle + Upload button (current lines 249–311) |
| CREATE | `onboarding-workspace/_files-tab-parts.tsx` | Moved: `EmptyPanel`, `NewFolderTile` |
| CREATE | `onboarding-workspace/_use-files-tab-derived.ts` | Moved: the 9 pure `useMemo` derivations (current lines 70–159) |
| CREATE | `onboarding-workspace/_file-upload-constants.ts` | Moved: `ALLOWED_UPLOAD_TYPES`, `MIME_LABELS`, `ALLOWED_TYPES_LABEL`, `MAX_FILE_SIZE`, `MAX_SIZE_LABEL` |
| MODIFY | `onboarding-workspace/_file-tile.tsx` | Keeps `FileThumbnail`, `PermissionBadge`, `VersionBadge`, `FileTile`; gains the Copy File URL action + `autoPreview`. 423 → ~255 lines |
| MODIFY | `onboarding-workspace/_files-tab.tsx` | Imports the extracted pieces; threads the 3 new optional props to the tiles. 537 → ~300 lines |

No API routes, no schema, no migration, no new dependencies.

### Projected line counts (the ask's acceptance bar)

| File | Before | After | Guide band |
|------|--------|-------|-----------|
| `onboarding-workspace/_files-tab.tsx` | 537 ❌ | ~300 ✅ | component 100–250 / hard 400 |
| `onboarding-workspace/_file-tile.tsx` | 423 ❌ | ~255 ✅ | component 100–250 |
| `onboarding-workspace/_file-actions-menu.tsx` | — | ~95 ✅ | component |
| `onboarding-workspace/_folder-tile.tsx` | — | ~100 ✅ | component |
| `onboarding-workspace/_files-toolbar.tsx` | — | ~95 ✅ | component |
| `onboarding-workspace/_files-tab-parts.tsx` | — | ~55 ✅ | component |
| `onboarding-workspace/_use-files-tab-derived.ts` | — | ~110 ✅ | hook (pure derivations, one concern) |
| `onboarding-workspace/_file-upload-constants.ts` | — | ~25 ✅ | config/data |
| `_shared/_files-tab.tsx` | 160 | ~80 ✅ | component |
| `_shared/_use-customer-assets.ts` | — | ~130 ✅ | hook |
| `_shared/_use-files-deeplink.ts` | — | ~75 ✅ | hook |

`_use-files-tab-derived.ts` at ~110 is slightly over the guide's 30–100 hook band; that is
accepted deliberately — it is one concern (derive the visible folder/file/count/breadcrumb sets
from `assets`+`folders`+`openFolderId`+`searchQuery`+`sortBy`) with zero branching, and
splitting it further would just scatter interdependent memos. Per the guide's own "The Real
Test", splitting it would not make anything easier to understand or change.

`_shared/_project-detail.tsx` (799 lines) is **not** touched and **not** in scope — no edit to
it is needed, and refactoring it is a separate job.

---

## Implementation Steps

### Step 1 — Refactor `_file-tile.tsx` (pure move, no behaviour change)

Do this first and verify the app still works before adding any feature.

1. Create `onboarding-workspace/_file-actions-menu.tsx` with `"use client"` and move lines
   45–126 verbatim (`ItemAction`, `ActionsMenu`, `ActionsMenuItems`). `ActionsMenu` is currently
   module-private — it must now be **exported** so `_folder-tile.tsx` and `_file-tile.tsx` can
   both use it. Preserve the long explanatory comments (they document real bugs: the `fixed`
   positioning fix and the `triggerRef`-not-`currentTarget` fix).
2. Create `onboarding-workspace/_folder-tile.tsx` with `"use client"` and move `FolderTile`
   (lines 137–211) plus its imports.
3. Leave `FileThumbnail`, `PermissionBadge`, `VersionBadge`, `FileTile` in `_file-tile.tsx`;
   import `ActionsMenu` / `ItemAction` from `./_file-actions-menu`.
4. Update the single consumer, `onboarding-workspace/_files-tab.tsx:8`:
   ```ts
   import { FileTile } from "./_file-tile";
   import { FolderTile } from "./_folder-tile";
   import { ActionsMenuItems, type ItemAction } from "./_file-actions-menu";
   ```
5. `npx tsc --noEmit` must pass before moving on.

### Step 2 — Refactor `_files-tab.tsx` (pure move, no behaviour change)

1. Create `_file-upload-constants.ts` — move the constants block (lines 13–28).
2. Create `_use-files-tab-derived.ts` — a hook taking
   `{ assets, folders, openFolderId, searchQuery, sortBy }` and returning
   `{ foldersById, currentLevelFolders, openFolder, breadcrumbChain, filesInOpenFolder,
      fileCountByFolder, duplicateFolderNames, visibleFolders, visibleFiles }`.
   Move lines 70–159 verbatim, including the `VersionGroup` type and all task-220/275 comments.
3. Create `_files-toolbar.tsx` — move lines 249–311. Props: `breadcrumbChain`, `openFolder`,
   `openFolderId`, `canEdit`, `searchQuery`, `sortBy`, `viewMode`, `onOpenFolder`,
   `onSearchChange`, `onToggleSort`, `onViewModeChange`, `onFilesPicked`. Keep the
   `fileInputRef`/hidden `<input type="file">` inside this component and surface picked files
   via `onFilesPicked(files)`; the parent still needs a way to trigger it for
   `UploadDropzone`'s "browse" link, so also accept and forward a `fileInputRef` prop from the
   parent rather than owning the ref locally.
4. Create `_files-tab-parts.tsx` — move `EmptyPanel` (496–503) and `NewFolderTile` (507–537).
5. Rewire `_files-tab.tsx` to import all of the above. `npx tsc --noEmit` + a manual click
   through the Files tab must pass before moving on.

### Step 3 — Extract the data layer out of `_shared/_files-tab.tsx`

Create `_shared/_use-customer-assets.ts`:

```ts
export function useCustomerAssets(customerId: string, projectId: string) {
  // state: loading, assets, folders, staffDirectory
  // effect: the existing Promise.all load (unchanged, including the cancelled guard)
  // returns: { loading, assets, folders, staffDirectory, handlers: { ... } }
}
```

Move `handleUpload`, `handleDeleteAsset`, `handleAssetPermissionChange`,
`handleFolderPermissionChange`, `handleCreateFolder`, `handleRenameAsset`, `handleRenameFolder`,
`handleDeleteFolder`, `handleMoveAsset` verbatim. Keep the `phaseNumber=1` comment block — it
explains a real API constraint.

### Step 4 — Add the deep-link hook

Create `_shared/_use-files-deeplink.ts`:

```ts
"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useCopyLink } from "./_copy-link-button";
import type { AssetRow, AssetFolder } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_wizard-v2-types";

export function useFilesDeepLink({ assets, folders, loading }: {
  assets: AssetRow[]; folders: AssetFolder[]; loading: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { copy } = useCopyLink();            // NOTE: see the caveat below

  const [openFolderId, setOpenFolderId] = useState<string | null>(
    () => searchParams.get("folder")
  );
  const [autoPreviewAssetId, setAutoPreviewAssetId] = useState<string | null>(
    () => searchParams.get("file")
  );
  const resolved = useRef(false);

  // Once the data lands, resolve ?file= to its folder and drop any id we can't see
  // (deleted, or hidden from this user by RLS) rather than rendering a broken folder view.
  useEffect(() => {
    if (loading || resolved.current) return;
    resolved.current = true;
    const fileId = searchParams.get("file");
    if (fileId) {
      const asset = assets.find((a) => a.id === fileId);
      if (asset) { setOpenFolderId(asset.folder_id ?? null); return; }
      setAutoPreviewAssetId(null);
    }
    const folderId = searchParams.get("folder");
    if (folderId && !folders.some((f) => f.id === folderId)) setOpenFolderId(null);
  }, [loading, assets, folders, searchParams]);

  // Keep the address bar in step with the open folder WITHOUT a Next navigation —
  // both files pages are force-dynamic, so router.replace() would re-run the server
  // on every folder click.
  const navigate = (id: string | null) => {
    setOpenFolderId(id);
    setAutoPreviewAssetId(null);
    const qs = id ? `?folder=${id}` : "";
    window.history.replaceState(null, "", `${pathname}${qs}`);
  };

  return { openFolderId, navigate, autoPreviewAssetId, pathname };
}
```

**Caveat to resolve during implementation:** `useCopyLink` is a hook that closes over a fixed
`url` and owns a `copied` flag — it does not fit "copy an arbitrary url on demand". Do **not**
call it in a loop or with a changing argument. Either:
- (preferred) add a tiny exported `copyLink(url: string): Promise<boolean>` function to
  `_shared/_copy-link-button.tsx` alongside `resolveUrl`, and have `useCopyLink` call it — so the
  origin-resolution logic stays in exactly one place and both call styles are served; or
- inline `navigator.clipboard.writeText(new URL(rel, window.location.origin).href)` in the new
  hook with its own try/catch.

Then the two copy helpers:

```ts
const copyFolderUrl = async (folderId: string) => {
  const ok = await copyLink(`${pathname}?folder=${folderId}`);
  ok ? toast.success("Folder link copied") : toast.error("Couldn't copy link");
};
const copyFileUrl = async (assetId: string) => {
  const ok = await copyLink(`${pathname}?file=${assetId}`);
  ok ? toast.success("File link copied") : toast.error("Couldn't copy link");
};
```

`_shared/_files-tab.tsx` becomes:

```tsx
const { loading, assets, folders, staffDirectory, handlers } = useCustomerAssets(customerId, projectId);
const { openFolderId, navigate, autoPreviewAssetId, copyFolderUrl, copyFileUrl } =
  useFilesDeepLink({ assets, folders, loading });
// ...spinner while loading, then <FilesTabPresentational ... onOpenFolder={navigate}
//    onCopyFolderUrl={copyFolderUrl} onCopyFileUrl={copyFileUrl}
//    autoPreviewAssetId={autoPreviewAssetId} />
```

> **Suspense note:** `useSearchParams()` in a client component normally requires a Suspense
> boundary, but both Files pages are `export const dynamic = "force-dynamic"`, so there is no
> static prerender to bail out of. If the build nevertheless complains, wrap the `<FilesTab />`
> render in `_project-detail.tsx` in `<Suspense fallback={null}>` — that is the only
> circumstance under which `_project-detail.tsx` should be edited.

### Step 5 — Thread the new optional props through the presentational tab

In `onboarding-workspace/_files-tab.tsx`, add to the props type:

```ts
onCopyFolderUrl?: (folderId: string) => void;
onCopyFileUrl?: (assetId: string) => void;
autoPreviewAssetId?: string | null;
```

Forward `onCopyFolderUrl` to every `<FolderTile>` (both render sites — the root grid **and** the
sub-folder grid; they are duplicated at current lines 339 and 372, don't miss the second one),
and `onCopyFileUrl` + `autoPreview={asset.id === autoPreviewAssetId}` to every `<FileTile>`
(again two sites — grid at 422, list at 444).

### Step 6 — Add the actions

`_folder-tile.tsx` — new optional prop `onCopyFolderUrl?: () => void`:

```ts
const actions: ItemAction[] = [
  ...(onCopyFolderUrl ? [{ label: "Copy Folder URL", icon: Link2, onClick: onCopyFolderUrl }] : []),
  { label: "Permissions", icon: Lock, onClick: () => setPermissionsOpen((v) => !v), disabled: !canEdit },
  ...(folder.is_system ? [] : [
    { label: "Rename", icon: Pencil, onClick: onRename },
    { label: "Delete", icon: Trash2, onClick: onDelete, danger: true },
  ]),
];
```

`_file-tile.tsx` — new optional prop `onCopyFileUrl?: () => void`, inserted after Download so the
three read-only actions sit together:

```ts
const actions: ItemAction[] = [
  { label: "View", icon: ExternalLink, onClick: handleView },
  { label: "Download", icon: Download, onClick: handleDownload },
  ...(onCopyFileUrl ? [{ label: "Copy File URL", icon: Link2, onClick: onCopyFileUrl }] : []),
  { label: "Permissions", icon: Lock, onClick: () => setPermissionsOpen((v) => !v), disabled: !canEdit },
  ...(canEdit ? [
    { label: "Rename", icon: Pencil, onClick: onRename },
    { label: "Move to folder", icon: FolderInput, onClick: onMove },
    { label: "Remove", icon: Trash2, onClick: onDelete, danger: true },
  ] : []),
];
```

`Link2` comes from `lucide-react` — the same icon `CopyLinkButton`/`CopyLinkMenuItem` use, so the
action reads as "the copy-link thing" everywhere in the app. No emoji, no new icon set.

### Step 7 — Auto-open the preview for a deep-linked file

In `_file-tile.tsx`, add `autoPreview?: boolean` and a one-shot effect guarded by a ref (so
closing the modal doesn't immediately reopen it on the next render):

```ts
const didAutoPreview = useRef(false);
useEffect(() => {
  if (!autoPreview || didAutoPreview.current) return;
  didAutoPreview.current = true;
  handleView();
}, [autoPreview]); // handleView is stable enough here; add an eslint-disable line if the
                   // exhaustive-deps rule complains rather than restructuring.
```

**Known limitation to document inline:** if the deep-linked asset is an *older* version in a
version group (`_files-tab.tsx`'s client-side same-filename grouping), no tile renders for it and
the preview won't open — the link still lands the user in the correct folder. Acceptable; a
version-aware deep link is out of scope.

### Step 8 — Verify

`npx tsc --noEmit` && `pnpm lint`, then the browser checklist below.

---

## Testing Checklist

**Copy actions**
- [ ] Folder kebab shows **Copy Folder URL**; clicking it closes the menu and shows a
      "Folder link copied" toast.
- [ ] File kebab shows **Copy File URL** between Download and Permissions; toast appears.
- [ ] **Right-clicking** a folder tile and a file tile shows the same new entries (shared
      `ItemAction[]`).
- [ ] Clipboard contains a fully-qualified `https://…/projects/v2/<id>/files?folder=…` /
      `…?file=…` URL — not a relative path.
- [ ] A `developer`/read-only user (i.e. `canEdit === false`) still sees both copy actions.
- [ ] Menus are not clipped and items are not truncated at the `w-40` / `w-44` widths.

**Deep links**
- [ ] Pasting a folder URL in a fresh tab opens that folder with a correct breadcrumb.
- [ ] Pasting a **nested** sub-folder URL opens it with the full ancestor breadcrumb.
- [ ] Pasting a file URL opens the containing folder **and** the preview modal.
- [ ] A file URL for a `.docx`/unknown type opens the modal on the
      "Preview not available for this file type." fallback — no crash.
- [ ] A URL with a garbage `?folder=00000000-…` falls back to the Files **root**, not an empty
      folder view with a broken breadcrumb.
- [ ] A URL for a since-deleted `?file=` falls back to root with no modal.
- [ ] Same four checks on the **legacy** route (`/projects/legacy/{uuid}/files`).
- [ ] Closing the auto-opened preview modal does **not** immediately reopen it.

**URL sync**
- [ ] Navigating into/out of folders updates the address bar without a page flash or spinner
      (confirms `replaceState`, not `router.replace`).
- [ ] Copying the address bar mid-navigation produces a link equivalent to the kebab action's.

**Regression — Onboarding Workspace**
- [ ] `/projects/v2/{projectId}/onboarding-workspace?tab=files` renders identically and shows
      **no** Copy URL entries in its kebab menus.
- [ ] Its own `?parent_folder=` / `?sub_folder_l1=` deep links still work.

**Regression — Files tab behaviour after the refactor**
- [ ] Upload (button, drag-to-zone, drag-onto-folder-tile) + progress panel.
- [ ] Create folder (incl. the duplicate-name prompt), rename, delete, move.
- [ ] Grid/list toggle, search, sort toggle.
- [ ] Bulk select → permissions / move / delete.
- [ ] Permissions panel on both folder and file tiles.
- [ ] Version badge popover.
- [ ] Rejected-file banner (wrong type, >25 MB).

**Gates**
- [ ] `npx tsc --noEmit` — no new errors.
- [ ] `pnpm lint` — no new warnings (2 pre-existing unrelated warnings are the baseline).
- [ ] Every touched/created file within the line bands in the table above.

---

## Dependencies

- **New packages:** none. `sonner` and `lucide-react` are already installed.
- **New APIs:** none. Uses the existing `/api/customers/{customerId}/assets*` routes.
- **Migrations:** none.
- **Blocked by:** nothing.

---

## Notes for Implementation Agent

1. **Do the two refactors as pure moves first, verify, then add the feature.** Steps 1–3 must
   produce a byte-for-byte behavioural no-op. Mixing the move and the feature into one pass makes
   any regression impossible to bisect, and `_files-tab.tsx` has a lot of hard-won bug-fix
   behaviour encoded in it.
2. **Preserve the long comments verbatim when moving code.** They document real production bugs
   (task 220's nested-`<button>` hydration error, the `ActionsMenu` `fixed`-positioning and
   `triggerRef` fixes, task 275's recursive folder counts, the `phaseNumber=1` API constraint).
   Losing them re-opens those bugs later.
3. **Build the URL from `usePathname()`, never from the `projectId` prop.** On v2 the route
   segment is the display `project_id` while the prop is the UUID — reconstructing gives a 404.
   This also makes v2/legacy work with one code path.
4. **Do not copy a signed Storage URL.** They expire.
5. **Every new prop on the presentational `FilesTab` / `FolderTile` / `FileTile` must be
   optional**, so `_onboarding-wizard-v2.tsx:426` needs no edit and the workspace is unaffected.
6. There are **two render sites for `FolderTile`** (root grid and sub-folder grid) and **two for
   `FileTile`** (grid and list) in `_files-tab.tsx`. Wire all four.
7. Styling: Tailwind classes only, no `style={{}}` except the existing `left/top` on the
   fixed-position menus (already an accepted exception — computed pixel coordinates).
8. Follow the existing hand-rolled menu-item styling in `ActionsMenuItems`; do not introduce a
   shadcn `DropdownMenu` for this.
9. The `_shared/` files are consumed by **both** the v2 and legacy project-detail routes — any
   change lands in both. That's intended.
10. Don't touch `src/app/(hub)/projects-old/` — dead code.
11. **Never run git commands** (CLAUDE.md).

### Docs Updates

- `CLAUDE.md` → **UI Polish Conventions → Rejected/superseded**: the bullet claiming "toasts are
  not `sonner`" and "`sonner` is not an installed dependency" is **factually stale** —
  `sonner@^2.0.8` is in `package.json` and `<Toaster />` is mounted in `(hub)/layout.tsx`, with
  three `_shared/` components already using it. Correct that sentence (leave the
  `react-hook-form` half of the bullet alone — that one is still accurate).
- `CLAUDE.md` → **Key Conventions**: add a line noting the Files-tab deep-link params
  (`?folder=<folder uuid>` / `?file=<asset uuid>` on `/projects/{v2,legacy}/[projectId]/files`),
  and that they are distinct from the Onboarding Workspace's name-path
  `?parent_folder=`/`?sub_folder_lN=` scheme.

---

## Related

- `nextjs-file-length-best-practices.md` — the file-length bands this task is held to.
- Task 276 — built `_shared/_files-tab.tsx`, wiring the workspace Files tab into project detail.
- Task 220 — arbitrary folder nesting + the in-app preview modal.
- Task 222 / `_workspace-url-params.ts` — the Onboarding Workspace's name-path deep links
  (the prior art this deliberately diverges from).
- Task 350 — direct-to-Storage customer-asset uploads (the upload path this tab uses).
- `_shared/_copy-link-button.tsx` / `_copy-link-menu-item.tsx` — the existing copy-link prior art.
