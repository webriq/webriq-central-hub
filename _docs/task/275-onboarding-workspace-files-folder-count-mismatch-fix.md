# 275: Onboarding Workspace — Files Tab: Folder Card Counts Don't Match Tab Total

**Created:** 2026-08-19
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Client-reported bug on the Onboarding Workspace's Files tab (`/portfolio-tracker/[projectId]/onboarding-workspace`, "Files" tab). The tab header shows an accurate total file count (e.g. "Files 16"), but the per-folder file-count badges on the root-level folder cards ("Notes 0 files", "HTML Mockup 6 files", "Business Files 0 files", …) do not add up to that total — the client added files into folders (including "Business Files", which still shows "0 files") and the folder cards do not reflect it.

**Root cause (confirmed by reading the code, not yet confirmed against live DB rows — see Requirement 2's verification note):**

Folders can nest arbitrarily deep (task 220's comment in `_files-tab.tsx:67-69`: *"folders can now nest arbitrarily deep... so 'the folders/files visible right now' is whatever is a direct child of openFolderId"*). Root-level folder cards are rendered from `currentLevelFolders` (folders whose `parent_folder_id === null`), and each card's file-count badge comes from `fileCountByFolder`:

```tsx
// _onboarding-wizard-v2.tsx:41-42, 84-86 — full history of `assets` for phase 1
const [assets, setAssets] = useState<AssetRow[]>([]);
...
setAssets(data.filter((a) => a.phase_number === 1 && a.project_id === project.id));
...
// _onboarding-wizard-v2.tsx:369 — tab-header total: EVERY file asset for this phase, any folder, any depth
const filesCount = assets.filter((a) => a.type === "file").length;
```

```tsx
// _files-tab.tsx:85-91 — per-folder badge count: DIRECT children only, no recursion into sub-folders
const fileCountByFolder = useMemo(() => {
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (a.type === "file" && a.folder_id) counts.set(a.folder_id, (counts.get(a.folder_id) ?? 0) + 1);
  }
  return counts;
}, [assets]);
```

Both derive from the *same* `assets` array in the same render, so they are never stale relative to each other — the mismatch is structural, not a caching/refresh bug. `filesCount` sums every file asset regardless of nesting depth; `fileCountByFolder` only counts files whose `folder_id` is an *exact* match to a given folder's id. If a user creates a sub-folder inside a top-level folder (e.g. "Business Files" → "Contracts") and uploads files there, those files' `folder_id` points at the sub-folder, not "Business Files" — so "Business Files"'s card shows 0 while the tab total still counts them. This is consistent with the client's report: a top-level folder they added files to ("Business Files") still reads "0 files" while the tab total is accurate.

The fix: make `fileCountByFolder` recursive — a folder's displayed count should be its direct files plus the direct files of every descendant folder, so parent cards reflect everything nested underneath them and the sum of root-level card counts equals the tab total.

## Requirements

- [ ] 1. In `_files-tab.tsx`, replace the direct-only `fileCountByFolder` computation with a recursive roll-up: for each folder, count = (files with `folder_id === folder.id`) + (recursive count of every folder whose `parent_folder_id === folder.id`).
- [ ] 2. Before implementing, verify the root cause against a real row: check whether the customer's `assets`/`asset_folders` data actually has files sitting inside a sub-folder of "Business Files" (or another under-counting folder) — confirms this is the right fix rather than a different bug (e.g. a file write that failed to set `folder_id`, or a folder mutation that silently reparented a folder). If the client's actual data has files with `folder_id: null` sitting effectively "orphaned" (not the nested-subfolder case), treat that as a second, separate finding and note it in the PR — do not silently expand this task's scope to also build a root-level "unfiled files" view unless the user asks for it.
- [ ] 3. Keep the existing per-folder badge behavior unchanged when a folder has no sub-folders (must not regress the common flat case — this is the vast majority of folders today).
- [ ] 4. Both usages of `fileCountByFolder.get(folder.id) ?? 0` in `_files-tab.tsx` (root-level grid at `_files-tab.tsx:318` and the sub-folder grid inside an open folder at `_files-tab.tsx:351`) must reflect the recursive count consistently, so descending into a folder shows the same "recursive total" on its own children's cards too.

## Out of Scope / Must-Not-Change

- Do not change `filesCount` (`_onboarding-wizard-v2.tsx:369`) — it is already correct (a flat count of all file assets for the phase) and is the reference value this task is reconciling folder cards against.
- Do not change how `visibleFiles`/`versionGroups` render *inside* an open folder (the file-listing pane) — those intentionally show only the currently open folder's direct files, unaffected by this task.
- Do not add a UI surface for "unfiled" (root, `folder_id: null`) files unless Requirement 2's verification finds that's actually happening in this customer's data and the user confirms they want it addressed now — flag it, don't build it speculatively.
- Do not touch the folders API routes (`assets/folders/route.ts`, `assets/folders/[folderId]/route.ts`) — this is a client-side display/aggregation fix only, no schema or endpoint changes needed.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_files-tab.tsx` | Modify | Make `fileCountByFolder` recurse through descendant folders so parent folder cards include nested sub-folder file counts |

## Code Context

### File: `_files-tab.tsx` (current, lines 70-91)

```tsx
const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
const currentLevelFolders = useMemo(() => folders.filter((f) => f.parent_folder_id === openFolderId), [folders, openFolderId]);
const openFolder = openFolderId ? foldersById.get(openFolderId) ?? null : null;
...
const fileCountByFolder = useMemo(() => {
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (a.type === "file" && a.folder_id) counts.set(a.folder_id, (counts.get(a.folder_id) ?? 0) + 1);
  }
  return counts;
}, [assets]);
```

Both call sites that read from this map:
- `_files-tab.tsx:318` — root-level folder grid: `fileCount={fileCountByFolder.get(folder.id) ?? 0}`
- `_files-tab.tsx:351` — sub-folder grid inside an open folder: `fileCount={fileCountByFolder.get(folder.id) ?? 0}`

`folders` (all `AssetFolder[]` for the phase, any depth) and `assets` (all `AssetRow[]` for the phase) are both already passed into `FilesTab` as props (`_onboarding-wizard-v2.tsx:421,430,451` pass `assets`/`folders` through), so no new data fetching is needed — this is purely a derived-value computation change.

`AssetFolder.parent_folder_id: string | null` and `AssetRow.folder_id: string | null` (`_wizard-v2-types.ts`) are the two fields to walk.

## Implementation Steps

1. In `_files-tab.tsx`, build a `childFoldersByParent: Map<string | null, AssetFolder[]>` (or reuse a `Map<string, AssetFolder[]>` keyed by parent id) from `folders`, memoized on `[folders]`.
2. Replace the `fileCountByFolder` `useMemo` with a version that, for each folder in `folders`, computes a recursive total: direct file count (existing logic) + sum of recursive totals of all folders whose `parent_folder_id` equals this folder's id. Implement via post-order traversal or memoized recursion (guard against cycles defensively, though `parent_folder_id` chains should never cycle in practice) — keep it a single `useMemo` over `[assets, folders]` so it recomputes only when either changes.
3. Leave the two call sites (`_files-tab.tsx:318`, `_files-tab.tsx:351`) unchanged — they already read `fileCountByFolder.get(folder.id) ?? 0`, so once the map's values are recursive totals, both root and nested folder cards pick up the fix automatically.
4. Manually verify against the client's actual project: open the Files tab, check the "Files" tab-header count against the sum of the root-level folder card counts — they should now match (modulo any confirmed root-level `folder_id: null` files flagged in Requirement 2).

## Acceptance Criteria

- [ ] Sum of root-level folder card file counts equals the "Files" tab-header count, for a folder tree containing nested sub-folders with files in them.
- [ ] A folder with files directly inside it and no sub-folders still shows the correct (unchanged) count.
- [ ] A folder whose only files live inside a sub-folder (e.g. "Business Files" → "Contracts" with files) now shows a non-zero count that includes those nested files.
- [ ] Descending into a folder and viewing its own sub-folder cards shows the same recursive-total behavior (Requirement 4).
- [ ] `npx tsc --noEmit` passes clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser check: open the affected project's Onboarding Workspace → Files tab, confirm folder card counts now sum to the tab-header total. If a gap remains after the fix, that confirms Requirement 2's alternate finding (orphaned `folder_id: null` files) rather than the nested-folder case — report back before expanding scope.

## Compatibility Touchpoints

- Purely a client-side derived-value change in one component; no API, schema, or route changes. No packaging/docs/adapter impact.

## Implementation Notes

### What Changed
- `fileCountByFolder` in `_files-tab.tsx` now computes a **recursive** per-folder file count instead of counting only files whose `folder_id` exactly matches the folder. It builds a `parent_folder_id → children` adjacency map from `folders`, then post-order-resolves each folder's total as its own direct file count plus the resolved totals of all its descendant folders (memoized per-folder via a `recursiveCounts` cache, with a defensive same-branch cycle guard). The two existing render call sites (`fileCountByFolder.get(folder.id) ?? 0` at the root-level grid and the open-folder sub-folder grid) were left untouched — they now read recursive totals automatically since the map's values changed meaning, not the call sites.
- Requirement 2's live-data verification (confirming via a real DB row whether the client's files are actually sitting in a sub-folder of "Business Files" vs. orphaned with `folder_id: null`) was **not** performed — no DB/browser access was available in this session. The recursive-rollup fix is correct and required regardless of which case is true (it fixes the nested-subfolder case outright, and is a strict superset improvement even if orphaned-null-folder_id files also turn out to exist). If the tab total and root-folder-card sum still don't fully reconcile after this fix ships, that's the signal the orphaned-`folder_id: null` case is also present for this customer — a separate, unscoped follow-up (flagged in the task doc's Out of Scope section, not built here).

### Files Changed
- `src/app/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_files-tab.tsx` — replaced direct-only `fileCountByFolder` `useMemo` with the recursive roll-up described above (lines ~84-114).

### Deviations From Plan
- None. Implementation followed the task doc's Implementation Steps exactly (adjacency map + memoized recursive resolve, single `useMemo` over `[assets, folders]`, call sites left unchanged).

### Verification Run
- `npx tsc --noEmit` — PASS (no output/errors)
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, not touched by this change)
- Manual/browser check against the client's live project — SKIPPED (no browser/DB access available in this session; needs a manual pass before this is marked verified with the actual customer data referenced in the bug report)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fully typed — no `any`/untyped escape hatches; `directCounts`/`childFoldersByParent`/`recursiveCounts` all carry explicit `Map<string, ...>` types matching `AssetFolder`/`AssetRow`'s existing id types.
- No deep nesting — the `resolve` helper uses early-return guard clauses (memo-hit, cycle-hit) before the accumulation loop, matching the rest of the file's style.
- Names describe behavior accurately (`directCounts` vs `recursiveCounts` vs `childFoldersByParent` reads correctly at each call site).
- Complexity is O(n) despite the recursion — each folder is resolved once and cached in `recursiveCounts` before the outer loop reaches it again, so the `for (const f of folders) resolve(f.id, new Set())` loop does not cause quadratic re-work.
- Comment above the `useMemo` follows this codebase's established convention (task-tagged, explains the non-obvious WHY — root cause + consequence — not what the code does).
- No dead code, no unused code, no secrets/debug logging introduced.
- Both existing call sites (`_files-tab.tsx:318`, `_files-tab.tsx:351` pre-edit line numbers, now shifted by +24 lines) were correctly left untouched per the plan — they inherit the fix automatically since the map's values changed meaning, not its shape.

### Deviations
- Minor, already flagged in Implementation Notes: Requirement 2 (verifying root cause against a live DB row before implementing) was not performed — no DB/browser access in this session. This does not invalidate the fix: the recursive roll-up is correct and required regardless of which underlying case (nested sub-folder vs. orphaned `folder_id: null`) produced the client's specific numbers, and the task doc's own Acceptance Criteria/Verification section already anticipates this as a manual follow-up step, not a blocking implementation dependency. Carried forward to `test` as the outstanding verification item.

### Required Fixes
- None.
