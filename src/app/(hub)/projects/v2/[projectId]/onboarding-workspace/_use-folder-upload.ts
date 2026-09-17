"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { AssetFolder } from "./_wizard-v2-types";
import { FolderNode, countFiles } from "./_folder-upload-tree";
import { ALLOWED_UPLOAD_TYPES, MAX_FILE_SIZE } from "./_file-upload-constants";

const MAX_TREE_FILES = 200;

function isValidUpload(file: File): boolean {
  return ALLOWED_UPLOAD_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE;
}

// Shared by the loose-files case and `walk`'s per-node case below: split out files that fail the
// existing type/size checks (name recorded in `skipped` for the end-of-walk summary toast) and
// enqueue the rest into `folderId` via the existing upload queue.
function enqueueValid(files: File[], folderId: string, skipped: string[], enqueue: (files: File[], folderId: string) => void) {
  const valid: File[] = [];
  for (const file of files) {
    if (isValidUpload(file)) valid.push(file);
    else skipped.push(file.name);
  }
  if (valid.length > 0) enqueue(valid, folderId);
}

// Task 372 — orchestrates a folder-tree upload (drag-and-drop or the `webkitdirectory` picker):
// creates or reuses each folder top-down, then hands that folder's files to the existing
// `useUploadQueue.enqueue` for the per-file progress/retry UI already built for the flat-file
// upload path — no new upload primitive. Folder matching is a silent merge-by-name (unlike the
// manual "New Folder" flow, which prompts on a duplicate name): re-dropping the same local folder
// should add/update its contents, not spawn "Folder (1)".
export function useFolderUpload({
  folders,
  onCreateFolder,
  enqueue,
}: {
  folders: AssetFolder[];
  onCreateFolder: (name: string, parentFolderId: string | null) => Promise<AssetFolder | undefined>;
  enqueue: (files: File[], folderId: string) => void;
}) {
  const [preparing, setPreparing] = useState(false);
  // Folders created earlier in the SAME walk aren't in `folders` yet (state updates are async) —
  // this ref accumulates them so a multi-level tree resolves against its own freshly-created
  // ancestors, not just what was loaded before the drop started.
  const createdThisWalk = useRef<AssetFolder[]>([]);

  const findExisting = useCallback(
    (name: string, parentFolderId: string | null): AssetFolder | undefined => {
      const norm = name.trim().toLowerCase();
      const pool = [...folders, ...createdThisWalk.current];
      return pool.find((f) => f.parent_folder_id === parentFolderId && f.name.trim().toLowerCase() === norm);
    },
    [folders]
  );

  const resolveFolderId = useCallback(
    async (name: string, parentFolderId: string | null): Promise<string | null> => {
      const existing = findExisting(name, parentFolderId);
      if (existing) return existing.id;
      const created = await onCreateFolder(name, parentFolderId);
      if (!created) return null;
      createdThisWalk.current.push(created);
      return created.id;
    },
    [findExisting, onCreateFolder]
  );

  // Not wrapped in useCallback — it recurses on itself, and a function declaration (hoisted,
  // unlike a const arrow) is the natural way to do that without an access-before-declaration
  // issue. It isn't passed to any memoized child, so referential stability across renders
  // doesn't matter here; it always closes over the latest `resolveFolderId`/`enqueue`.
  async function walk(nodes: FolderNode[], parentFolderId: string | null, skipped: string[]): Promise<void> {
    // Siblings resolve in parallel; each node's children wait on its own resolved id, so a
    // folder is never created before its parent.
    await Promise.all(
      nodes.map(async (node) => {
        const folderId = await resolveFolderId(node.name, parentFolderId);
        if (!folderId) return; // folder creation failed — its files/children are skipped, not retried
        enqueueValid(node.files, folderId, skipped, enqueue);
        await walk(Array.from(node.children.values()), folderId, skipped);
      })
    );
  }

  const uploadFolderTree = useCallback(
    async (trees: FolderNode[], parentFolderId: string | null, looseFiles: File[] = []) => {
      const total = countFiles(trees) + looseFiles.length;
      if (total === 0) return;
      if (total > MAX_TREE_FILES) {
        toast.error(`That's ${total} files — folder upload is capped at ${MAX_TREE_FILES} files per drop. Split it into smaller folders and try again.`);
        return;
      }
      if (!parentFolderId && trees.length === 0) return; // loose files dropped at root — nowhere to file them

      setPreparing(true);
      createdThisWalk.current = [];
      const skipped: string[] = [];
      try {
        if (parentFolderId && looseFiles.length > 0) enqueueValid(looseFiles, parentFolderId, skipped, enqueue);
        // A null parentFolderId is the root — each top-level tree node becomes its own new
        // top-level folder, same resolve/enqueue/recurse logic as any nested level.
        if (trees.length > 0) await walk(trees, parentFolderId, skipped);
      } finally {
        setPreparing(false);
        if (skipped.length > 0) {
          toast.warning(
            skipped.length === 1
              ? `Skipped "${skipped[0]}" — unsupported type or too large`
              : `Skipped ${skipped.length} files — unsupported type or too large`
          );
        }
      }
      // `walk` is a plain (non-memoized) function declaration, not a useCallback value — it
      // always closes over the same `resolveFolderId`/`enqueue` already listed below, so it
      // can't go stale between renders and doesn't belong in this dependency list.
    },
    [enqueue, resolveFolderId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { preparing, uploadFolderTree };
}
