"use client";

import { useMemo } from "react";
import type { DriveFile, DriveFolder, DriveView } from "@/lib/drive/types";

export type DriveSort = "newest" | "name";

// Task 436 — pure derivation for the current location. `null` is the section root: the owner's own
// top level in "mine", the list of shared entry points in "shared". Unlike Project Files, files
// may live at the root, and same-named files are all shown (no version grouping).
export function useDriveDerived({
  view, folders, files, openFolderId, search, sort,
}: {
  view: DriveView; folders: DriveFolder[]; files: DriveFile[]; openFolderId: string | null; search: string; sort: DriveSort;
}) {
  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const openFolder = openFolderId ? foldersById.get(openFolderId) ?? null : null;

  const breadcrumbChain = useMemo(() => {
    const chain: DriveFolder[] = [];
    for (let cur = openFolder, guard = 0; cur && guard < 50; guard += 1) {
      chain.unshift(cur);
      cur = cur.parent_folder_id ? foldersById.get(cur.parent_folder_id) ?? null : null;
    }
    return chain;
  }, [openFolder, foldersById]);

  const atSharedRoot = view === "shared" && !openFolderId;
  const levelFolders = useMemo(
    () => (atSharedRoot ? folders.filter((f) => f.is_shared_root) : folders.filter((f) => f.parent_folder_id === openFolderId)),
    [atSharedRoot, folders, openFolderId],
  );
  const levelFiles = useMemo(
    () => (atSharedRoot ? files.filter((f) => f.is_shared_root) : files.filter((f) => f.folder_id === openFolderId)),
    [atSharedRoot, files, openFolderId],
  );

  const itemCountByFolder = useMemo(() => {
    const children = new Map<string, DriveFolder[]>();
    for (const f of folders) if (f.parent_folder_id) children.set(f.parent_folder_id, [...(children.get(f.parent_folder_id) ?? []), f]);
    const direct = new Map<string, number>();
    for (const f of files) if (f.folder_id) direct.set(f.folder_id, (direct.get(f.folder_id) ?? 0) + 1);
    const memo = new Map<string, number>();
    const count = (id: string, seen: Set<string>): number => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      if (seen.has(id)) return 0;
      seen.add(id);
      const total = (direct.get(id) ?? 0) + (children.get(id) ?? []).reduce((n, c) => n + count(c.id, seen), 0);
      memo.set(id, total);
      return total;
    };
    for (const f of folders) count(f.id, new Set());
    return memo;
  }, [folders, files]);

  const q = search.trim().toLowerCase();
  const byDate = (a: string, b: string) => new Date(b).getTime() - new Date(a).getTime();
  const visibleFolders = useMemo(() => {
    const list = q ? levelFolders.filter((f) => f.name.toLowerCase().includes(q)) : levelFolders;
    return [...list].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : byDate(a.created_at, b.created_at)));
  }, [levelFolders, q, sort]);
  const visibleFiles = useMemo(() => {
    const list = q ? levelFiles.filter((f) => f.file_name.toLowerCase().includes(q)) : levelFiles;
    return [...list].sort((a, b) => (sort === "name" ? a.file_name.localeCompare(b.file_name) : byDate(a.created_at, b.created_at)));
  }, [levelFiles, q, sort]);

  return { foldersById, openFolder, breadcrumbChain, atSharedRoot, levelFolders, levelFiles, visibleFolders, visibleFiles, itemCountByFolder };
}
