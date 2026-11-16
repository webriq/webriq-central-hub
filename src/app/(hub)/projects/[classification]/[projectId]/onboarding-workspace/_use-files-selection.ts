"use client";

import { useEffect, useState } from "react";

// Task 419 — selection state extracted from _files-tab.tsx (424 lines, over the soft limit in
// nextjs-file-length-best-practices.md) and extended with folder selection. Files and folders live
// in separate sets because they have different bulk actions (Move/Share/Delete are files-only).
// Selection never survives navigation — what's selected is only meaningful in the folder it was
// picked in — and Escape clears it.
export function useFilesSelection(openFolderId: string | null) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const toggleFile = (id: string) => setSelectedIds((p) => toggle(p, id));
  const toggleFolder = (id: string) => setSelectedFolderIds((p) => toggle(p, id));
  const clear = () => { setSelectedIds(new Set()); setSelectedFolderIds(new Set()); };
  const selectAll = (fileIds: string[], folderIds: string[]) => {
    setSelectedIds(new Set(fileIds));
    setSelectedFolderIds(new Set(folderIds));
  };

  // Reset during render (not in an effect) when the open folder changes — React's documented
  // "adjust state on prop change" pattern; avoids a cascading extra render.
  const [selectionFolderId, setSelectionFolderId] = useState(openFolderId);
  if (selectionFolderId !== openFolderId) {
    setSelectionFolderId(openFolderId);
    setSelectedIds(new Set());
    setSelectedFolderIds(new Set());
  }

  const hasSelection = selectedIds.size + selectedFolderIds.size > 0;
  useEffect(() => {
    if (!hasSelection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelectedIds(new Set());
      setSelectedFolderIds(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasSelection]);

  return { selectedIds, selectedFolderIds, hasSelection, toggleFile, toggleFolder, clear, selectAll };
}
