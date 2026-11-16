// Task 372 — pure helpers for turning a locally-selected/dropped folder into a tree the upload
// orchestrator (`_use-folder-upload.ts`) can walk top-down. No React, no fetch — two input
// shapes in, one shape out:
//   - `buildTreeFromRelativePaths` — the `<input webkitdirectory>` picker's FileList, where each
//     File carries `webkitRelativePath` ("TopFolder/sub/file.txt").
//   - `readDataTransferEntries` — a drag-and-drop `DataTransferItemList`, read via the (Chromium/
//     Firefox) File and Directory Entries API (`webkitGetAsEntry` + recursive `readEntries`).

export type FolderNode = {
  name: string;
  files: File[];
  children: Map<string, FolderNode>;
};

function getOrCreateChild(level: Map<string, FolderNode>, name: string): FolderNode {
  let node = level.get(name);
  if (!node) {
    node = { name, files: [], children: new Map() };
    level.set(name, node);
  }
  return node;
}

export function buildTreeFromRelativePaths(files: FileList | File[]): FolderNode[] {
  const roots = new Map<string, FolderNode>();
  for (const file of Array.from(files)) {
    const relPath = file.webkitRelativePath;
    if (!relPath) continue; // not directory-picked — caller shouldn't reach here
    const segments = relPath.split("/");
    const fileName = segments.pop();
    if (!fileName || segments.length === 0) continue;
    let level = roots;
    let node: FolderNode = getOrCreateChild(level, segments[0]);
    level = node.children;
    for (let i = 1; i < segments.length; i++) {
      node = getOrCreateChild(level, segments[i]);
      level = node.children;
    }
    node.files.push(file);
  }
  return Array.from(roots.values());
}

// Cheap synchronous check done before the (async) full recursive read below, so a plain
// multi-file drop skips tree-building entirely and keeps using the existing flat upload path.
export function hasDirectoryEntry(items: DataTransferItemList): boolean {
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) return true;
  }
  return false;
}

// `readEntries()` doesn't guarantee it returns every child in one call — must loop until an
// empty batch comes back (per the File and Directory Entries API spec).
async function readAllDirectoryEntries(dirEntry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dirEntry.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectoryEntryInto(dirEntry: FileSystemDirectoryEntry, node: FolderNode): Promise<void> {
  const children = await readAllDirectoryEntries(dirEntry);
  for (const child of children) {
    if (child.isFile) {
      node.files.push(await readFileEntry(child as FileSystemFileEntry));
    } else if (child.isDirectory) {
      const childNode = getOrCreateChild(node.children, child.name);
      await readDirectoryEntryInto(child as FileSystemDirectoryEntry, childNode);
    }
  }
}

// A drop can mix loose files and folders at the top level (e.g. one folder + one file dragged
// together) — `looseFiles` carries anything not inside a dropped folder, so callers can upload
// it straight into the current target parent alongside the folder tree.
export async function readDataTransferEntries(
  items: DataTransferItemList
): Promise<{ trees: FolderNode[]; looseFiles: File[] }> {
  const roots = new Map<string, FolderNode>();
  const looseFiles: File[] = [];
  const entries = Array.from(items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.isFile) {
        looseFiles.push(await readFileEntry(entry as FileSystemFileEntry));
      } else if (entry.isDirectory) {
        const node = getOrCreateChild(roots, entry.name);
        await readDirectoryEntryInto(entry as FileSystemDirectoryEntry, node);
      }
    })
  );

  return { trees: Array.from(roots.values()), looseFiles };
}

export function countFiles(trees: FolderNode[]): number {
  let count = 0;
  for (const node of trees) {
    count += node.files.length;
    count += countFiles(Array.from(node.children.values()));
  }
  return count;
}
