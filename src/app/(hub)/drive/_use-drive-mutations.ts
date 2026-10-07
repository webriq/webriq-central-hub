"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { DriveFile, DriveFolder, DriveFolderRow, DriveFileRow } from "@/lib/drive/types";
import { uploadToDrive } from "./_drive-upload";

async function apiError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { error?: string }).error ?? fallback;
}

type Setters = { setFolders: Dispatch<SetStateAction<DriveFolder[]>>; setFiles: Dispatch<SetStateAction<DriveFile[]>> };

// Task 436 — Drive mutations. Each call hits the API first and only then patches local state, so a
// failed request never leaves the UI ahead of the database (toast carries the server's message).
export function useDriveMutations({ folders, setFolders, setFiles }: Setters & { folders: DriveFolder[] }) {
  // Items created by an editor inside someone else's shared folder are editable, not owned.
  const levelUnder = useCallback((parentId: string | null): 2 | 3 => {
    const parent = parentId ? folders.find((f) => f.id === parentId) : undefined;
    return parent && parent.level !== 3 ? 2 : 3;
  }, [folders]);

  const toFolder = useCallback((row: DriveFolderRow): DriveFolder => (
    { ...row, level: levelUnder(row.parent_folder_id), share_count: 0, is_shared_root: false }
  ), [levelUnder]);
  const toFile = useCallback((row: DriveFileRow): DriveFile => (
    { ...row, level: levelUnder(row.folder_id), share_count: 0, is_shared_root: false }
  ), [levelUnder]);

  const createFolder = useCallback(async (name: string, parentFolderId: string | null): Promise<DriveFolder | undefined> => {
    const res = await fetch("/api/drive/folders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentFolderId }),
    });
    if (!res.ok) { toast.error(await apiError(res, "Couldn't create the folder — try again.")); return undefined; }
    const folder = toFolder((await res.json()) as DriveFolderRow);
    setFolders((prev) => [...prev, folder]);
    return folder;
  }, [setFolders, toFolder]);

  const renameFolder = useCallback(async (id: string, name: string): Promise<boolean> => {
    const res = await fetch(`/api/drive/folders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    if (!res.ok) { toast.error(await apiError(res, "Couldn't rename the folder — try again.")); return false; }
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    return true;
  }, [setFolders]);

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/drive/folders/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error(await apiError(res, "Couldn't delete the folder — try again.")); return false; }
    // The cascade removes the whole subtree server-side; mirror it locally.
    const doomed = new Set([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const f of folders) if (f.parent_folder_id && doomed.has(f.parent_folder_id) && !doomed.has(f.id)) { doomed.add(f.id); grew = true; }
    }
    setFolders((prev) => prev.filter((f) => !doomed.has(f.id)));
    setFiles((prev) => prev.filter((f) => !f.folder_id || !doomed.has(f.folder_id)));
    return true;
  }, [folders, setFolders, setFiles]);

  const uploadFile = useCallback(async (file: File, folderId: string | null, onProgress?: (pct: number) => void) => {
    const row = await uploadToDrive(file, folderId, onProgress);
    setFiles((prev) => [...prev, toFile(row)]);
  }, [setFiles, toFile]);

  const renameFile = useCallback(async (id: string, name: string): Promise<boolean> => {
    const res = await fetch(`/api/drive/files/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    if (!res.ok) { toast.error(await apiError(res, "Couldn't rename the file — try again.")); return false; }
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, file_name: name } : f)));
    return true;
  }, [setFiles]);

  const moveFile = useCallback(async (id: string, folderId: string | null): Promise<boolean> => {
    const res = await fetch(`/api/drive/files/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId }),
    });
    if (!res.ok) { toast.error(await apiError(res, "Couldn't move the file — try again.")); return false; }
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, folder_id: folderId } : f)));
    return true;
  }, [setFiles]);

  const deleteFile = useCallback(async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/drive/files/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error(await apiError(res, "Couldn't delete the file — try again.")); return false; }
    setFiles((prev) => prev.filter((f) => f.id !== id));
    return true;
  }, [setFiles]);

  const setShareCount = useCallback((kind: "folder" | "file", id: string, count: number) => {
    if (kind === "folder") setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, share_count: count } : f)));
    else setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, share_count: count } : f)));
  }, [setFolders, setFiles]);

  return { createFolder, renameFolder, deleteFolder, uploadFile, renameFile, moveFile, deleteFile, setShareCount };
}
