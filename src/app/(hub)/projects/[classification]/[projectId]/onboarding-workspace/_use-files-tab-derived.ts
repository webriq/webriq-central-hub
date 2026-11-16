"use client";

import { useMemo } from "react";
import { AssetRow, AssetFolder } from "./_wizard-v2-types";

export type VersionGroup = { asset: AssetRow; versionCount: number; olderVersions: AssetRow[] };

// Task 359 — the pure derivation half of _files-tab.tsx (which was 537 lines, past the hard limit
// in nextjs-file-length-best-practices.md), moved verbatim. One concern: turn
// assets + folders + the current location/search/sort into the sets the tab renders. No side
// effects, no branching beyond the memos themselves — kept together deliberately because the
// memos feed each other and splitting them further would scatter one computation across files.
export function useFilesTabDerived({
  assets, folders, openFolderId, searchQuery, sortBy,
}: {
  assets: AssetRow[];
  folders: AssetFolder[];
  openFolderId: string | null;
  searchQuery: string;
  sortBy: "newest" | "name";
}) {
  // Task 220 — folders can now nest arbitrarily deep (matching ../_onboarding-wizard.tsx's
  // Storage folder + KB step), so "the folders/files visible right now" is whatever is a direct
  // child of openFolderId (null === root), not a hardcoded root-only list.
  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const currentLevelFolders = useMemo(() => folders.filter((f) => f.parent_folder_id === openFolderId), [folders, openFolderId]);
  const openFolder = openFolderId ? foldersById.get(openFolderId) ?? null : null;
  // Full ancestor chain for the breadcrumb — walks parent_folder_id up to root, same technique
  // as ../_onboarding-wizard.tsx:3685-3692.
  const breadcrumbChain = useMemo(() => {
    const chain: AssetFolder[] = [];
    let cur = openFolderId ? foldersById.get(openFolderId) ?? null : null;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parent_folder_id ? foldersById.get(cur.parent_folder_id) ?? null : null;
    }
    return chain;
  }, [openFolderId, foldersById]);
  const filesInOpenFolder = useMemo(() => (openFolderId ? assets.filter((a) => a.type === "file" && a.folder_id === openFolderId) : []), [assets, openFolderId]);
  // Task 275 — a folder's badge must include files nested inside its sub-folders (folders nest
  // arbitrarily deep per task 220), not just files whose folder_id matches it directly. Otherwise
  // a parent folder can show "0 files" while a sub-folder underneath it holds everything, and the
  // sum of root-level card counts silently diverges from the tab-header total (which counts every
  // file for the phase regardless of depth).
  const fileCountByFolder = useMemo(() => {
    const directCounts = new Map<string, number>();
    for (const a of assets) {
      if (a.type === "file" && a.folder_id) directCounts.set(a.folder_id, (directCounts.get(a.folder_id) ?? 0) + 1);
    }
    const childFoldersByParent = new Map<string, AssetFolder[]>();
    for (const f of folders) {
      if (!f.parent_folder_id) continue;
      const siblings = childFoldersByParent.get(f.parent_folder_id) ?? [];
      siblings.push(f);
      childFoldersByParent.set(f.parent_folder_id, siblings);
    }
    const recursiveCounts = new Map<string, number>();
    const resolve = (folderId: string, seen: Set<string>): number => {
      const cached = recursiveCounts.get(folderId);
      if (cached !== undefined) return cached;
      if (seen.has(folderId)) return 0; // defensive cycle guard — parent_folder_id chains should never cycle
      seen.add(folderId);
      let total = directCounts.get(folderId) ?? 0;
      for (const child of childFoldersByParent.get(folderId) ?? []) total += resolve(child.id, seen);
      recursiveCounts.set(folderId, total);
      return total;
    };
    for (const f of folders) resolve(f.id, new Set());
    return recursiveCounts;
  }, [assets, folders]);

  // Case-insensitive sibling collision, scoped to the current location (root or the currently
  // open folder) — the create-folder API already blocks new duplicates on the happy path
  // (assets/folders/route.ts), so this only ever fires for legacy data or the documented
  // 23505-race fallback. Display-only warning, not a new validation rule.
  const duplicateFolderNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of currentLevelFolders) {
      const key = f.name.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([name]) => name));
  }, [currentLevelFolders]);

  const visibleFolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q ? currentLevelFolders.filter((f) => f.name.toLowerCase().includes(q)) : currentLevelFolders;
    return [...list].sort((a, b) => (sortBy === "name" ? a.name.localeCompare(b.name) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  }, [currentLevelFolders, searchQuery, sortBy]);

  // Client-side version grouping (no schema change): files sharing an exact filename within the
  // same folder collapse into one visible tile — the newest by created_at — with a "vN · latest"
  // badge and the older uploads exposed as a version-history list (upload dates only).
  const versionGroups = useMemo<VersionGroup[]>(() => {
    const byName = new Map<string, AssetRow[]>();
    for (const a of filesInOpenFolder) {
      const key = a.file_name ?? a.label;
      byName.set(key, [...(byName.get(key) ?? []), a]);
    }
    return Array.from(byName.values()).map((group) => {
      const sorted = [...group].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { asset: sorted[0], versionCount: sorted.length, olderVersions: sorted.slice(1) };
    });
  }, [filesInOpenFolder]);

  const visibleFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q ? versionGroups.filter((g) => (g.asset.file_name ?? g.asset.label).toLowerCase().includes(q)) : versionGroups;
    return [...list].sort((a, b) =>
      sortBy === "name"
        ? (a.asset.file_name ?? a.asset.label).localeCompare(b.asset.file_name ?? b.asset.label)
        : new Date(b.asset.created_at).getTime() - new Date(a.asset.created_at).getTime()
    );
  }, [versionGroups, searchQuery, sortBy]);

  return {
    currentLevelFolders, openFolder, breadcrumbChain, filesInOpenFolder,
    fileCountByFolder, duplicateFolderNames, visibleFolders, visibleFiles,
  };
}
