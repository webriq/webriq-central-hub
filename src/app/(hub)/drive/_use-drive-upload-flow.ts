"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { DriveFolder } from "@/lib/drive/types";
import { DRIVE_MAX_FILE_SIZE, DRIVE_MAX_SIZE_LABEL } from "@/lib/drive/constants";
import { useUploadQueue, hasDirectoryEntry, readDataTransferEntries, countFiles, type FolderNode } from "./_reuse";
import { DRIVE_UPLOAD_TYPES, DRIVE_TYPES_LABEL, MAX_TREE_FILES, ROOT_KEY } from "./_drive-constants";

type Rejected = { name: string; reason: string };

// Task 436 — every way a file reaches the Drive (picker, drop on the page, drop on a folder tile,
// whole-folder drop / webkitdirectory pick) funnels through here: validate → enqueue into the shared
// upload queue (per-file progress + retry). Drive-specific replacement for Project Files'
// `useFolderUpload`, which can't target the root and only knows the project allowlist.
export function useDriveUploadFlow({
  folders, canWrite, uploadFile, createFolder,
}: {
  folders: DriveFolder[];
  canWrite: boolean;
  uploadFile: (file: File, folderId: string | null, onProgress?: (pct: number) => void) => Promise<void>;
  createFolder: (name: string, parentFolderId: string | null) => Promise<DriveFolder | undefined>;
}) {
  const [rejected, setRejected] = useState<Rejected | null>(null);
  const [preparing, setPreparing] = useState(false);

  const runUpload = useCallback(
    (file: File, key: string, onProgress: (pct: number) => void) => uploadFile(file, key === ROOT_KEY ? null : key, onProgress),
    [uploadFile],
  );
  const { items, enqueue, retry, dismiss } = useUploadQueue(runUpload);

  const validate = useCallback((file: File): string | null => {
    if (!DRIVE_UPLOAD_TYPES.includes(file.type)) return `${file.type || "This file type"} isn't supported — allowed: ${DRIVE_TYPES_LABEL}.`;
    if (file.size > DRIVE_MAX_FILE_SIZE) return `${(file.size / (1024 * 1024)).toFixed(1)} MB exceeds the ${DRIVE_MAX_SIZE_LABEL} limit — compress or split it, then try again.`;
    return null;
  }, []);

  const uploadFiles = useCallback((list: FileList | File[], folderId: string | null) => {
    if (!canWrite) return;
    const valid: File[] = [];
    for (const file of Array.from(list)) {
      const reason = validate(file);
      if (reason) setRejected({ name: file.name, reason });
      else valid.push(file);
    }
    if (valid.length > 0) { setRejected(null); enqueue(valid, folderId ?? ROOT_KEY); }
  }, [canWrite, enqueue, validate]);

  // Folders resolve top-down; siblings in parallel. A name already present (or created earlier in
  // this same walk — state updates are async) is merged into, not duplicated.
  const uploadTrees = useCallback(async (trees: FolderNode[], parentId: string | null, loose: File[] = []) => {
    if (!canWrite) return;
    const total = countFiles(trees) + loose.length;
    if (total === 0) return;
    if (total > MAX_TREE_FILES) {
      toast.error(`That's ${total} files — folder upload is capped at ${MAX_TREE_FILES} files per drop. Split it into smaller folders and try again.`);
      return;
    }
    const created = new Map<string, string>();
    const key = (parent: string | null, name: string) => `${parent ?? ROOT_KEY}/${name.trim().toLowerCase()}`;
    const resolve = async (name: string, parent: string | null): Promise<string | null> => {
      const hit = created.get(key(parent, name))
        ?? folders.find((f) => f.parent_folder_id === parent && f.name.trim().toLowerCase() === name.trim().toLowerCase())?.id;
      if (hit) return hit;
      const folder = await createFolder(name, parent);
      if (!folder) return null;
      created.set(key(parent, name), folder.id);
      return folder.id;
    };
    const skipped: string[] = [];
    const enqueueValid = (files: File[], folderId: string | null) => {
      const ok = files.filter((f) => (validate(f) ? (skipped.push(f.name), false) : true));
      if (ok.length > 0) enqueue(ok, folderId ?? ROOT_KEY);
    };
    const walk = async (nodes: FolderNode[], parent: string | null): Promise<void> => {
      await Promise.all(nodes.map(async (node) => {
        const id = await resolve(node.name, parent);
        if (!id) return;
        enqueueValid(node.files, id);
        await walk(Array.from(node.children.values()), id);
      }));
    };
    setPreparing(true);
    try {
      if (loose.length > 0) enqueueValid(loose, parentId);
      await walk(trees, parentId);
    } finally {
      setPreparing(false);
      if (skipped.length > 0) toast.warning(skipped.length === 1 ? `Skipped "${skipped[0]}" — unsupported type or too large` : `Skipped ${skipped.length} files — unsupported type or too large`);
    }
  }, [canWrite, createFolder, enqueue, folders, validate]);

  // A dropped local folder shows up in dataTransfer.files as a bogus zero-byte entry; only
  // items/webkitGetAsEntry can read its contents. Returns true when the drop was a folder drop.
  const dropFolders = useCallback(async (e: React.DragEvent, target: string | null): Promise<boolean> => {
    if (!hasDirectoryEntry(e.dataTransfer.items)) return false;
    const { trees, looseFiles } = await readDataTransferEntries(e.dataTransfer.items);
    await uploadTrees(trees, target, looseFiles);
    return true;
  }, [uploadTrees]);

  const handleDrop = useCallback(async (e: React.DragEvent, target: string | null) => {
    e.preventDefault();
    if (!canWrite) return;
    if (await dropFolders(e, target)) return;
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files, target);
  }, [canWrite, dropFolders, uploadFiles]);

  return { items, retry, dismiss, rejected, clearRejected: () => setRejected(null), preparing, uploadFiles, uploadTrees, handleDrop };
}
