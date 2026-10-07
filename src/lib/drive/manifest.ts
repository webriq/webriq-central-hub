import { safeSegment } from "@/lib/uploads/download-manifest";
import type { DriveFileRow, DriveFolderRow } from "./types";

// Task 436 — pure planning half of Drive bulk download (the sibling of lib/uploads/download-manifest
// for customer assets). Turns a selection of file/folder ids into a flat list of files with
// zip-relative paths. Unlike the Project Files manifest it does NOT collapse same-named files
// into "newest version" — Drive has no version grouping, so every file ships (name collisions
// get a " (n)" suffix). No I/O, no access checks: the caller passes only rows RLS already allowed.

export type DriveManifestEntry = { fileId: string; path: string; filePath: string; size: number };
export type DriveManifest = { entries: DriveManifestEntry[]; totalBytes: number; zipName: string };

function withSuffix(path: string, n: number): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  return dot > slash + 1 ? `${path.slice(0, dot)} (${n})${path.slice(dot)}` : `${path} (${n})`;
}

export function buildDriveManifest({
  files, folders, fileIds, folderIds, date,
}: {
  files: DriveFileRow[]; folders: DriveFolderRow[]; fileIds: string[]; folderIds: string[]; date: string;
}): DriveManifest {
  const foldersById = new Map(folders.map((f) => [f.id, f]));
  const childrenByParent = new Map<string, DriveFolderRow[]>();
  for (const f of folders) {
    if (f.parent_folder_id) childrenByParent.set(f.parent_folder_id, [...(childrenByParent.get(f.parent_folder_id) ?? []), f]);
  }
  const filesByFolder = new Map<string, DriveFileRow[]>();
  for (const f of files) {
    if (f.folder_id) filesByFolder.set(f.folder_id, [...(filesByFolder.get(f.folder_id) ?? []), f]);
  }

  const picked: { file: DriveFileRow; dir: string }[] = [];
  const seenFiles = new Set<string>();
  const seenFolders = new Set<string>(); // doubles as the cycle guard
  const add = (file: DriveFileRow, dir: string) => {
    if (seenFiles.has(file.id)) return;
    seenFiles.add(file.id);
    picked.push({ file, dir });
  };
  const walk = (folder: DriveFolderRow, dir: string) => {
    if (seenFolders.has(folder.id)) return;
    seenFolders.add(folder.id);
    for (const f of filesByFolder.get(folder.id) ?? []) add(f, dir);
    for (const child of childrenByParent.get(folder.id) ?? []) walk(child, `${dir}/${safeSegment(child.name)}`);
  };
  for (const id of folderIds) {
    const f = foldersById.get(id);
    if (f) walk(f, safeSegment(f.name));
  }
  const wanted = new Set(fileIds);
  for (const f of files) if (wanted.has(f.id)) add(f, "");

  const used = new Set<string>();
  const entries = picked.map(({ file, dir }): DriveManifestEntry => {
    const base = `${dir ? `${dir}/` : ""}${safeSegment(file.file_name)}`;
    let path = base;
    for (let n = 1; used.has(path.toLowerCase()); n += 1) path = withSuffix(base, n);
    used.add(path.toLowerCase());
    return { fileId: file.id, path, filePath: file.file_path, size: file.file_size ?? 0 };
  });

  const single = folderIds.length === 1 && fileIds.length === 0 ? foldersById.get(folderIds[0]) : null;
  const zipName = single ? `${safeSegment(single.name)}.zip` : `drive-files-${date}.zip`;
  return { entries, totalBytes: entries.reduce((n, e) => n + e.size, 0), zipName };
}
