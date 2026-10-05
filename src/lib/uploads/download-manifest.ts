// Task 419 — pure planning half of Files tab bulk download: turns a selection of asset/folder ids
// into the flat, de-duplicated list of files that belong in a zip, with zip-relative paths. No I/O
// here (the route owns auth, reads and URL signing) so the rules below stay easy to reason about.

export type ManifestAsset = {
  id: string; file_path: string | null; file_name: string | null; label: string;
  file_size: number | null; folder_id: string | null; created_at: string;
  allowed_roles: string[] | null; allowed_user_ids: string[] | null;
};
export type ManifestFolder = {
  id: string; parent_folder_id: string | null; name: string;
  allowed_roles: string[] | null; allowed_user_ids: string[] | null;
};
export type ManifestEntry = { assetId: string; path: string; filePath: string; size: number };
export type Manifest = { entries: ManifestEntry[]; skipped: number; totalBytes: number; zipName: string };

type Perms = { allowed_roles: string[] | null; allowed_user_ids: string[] | null };

// Strips characters that are illegal in zip/OS file names; never returns an empty segment.
export function safeSegment(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().replace(/^\.+$/, "_");
  return cleaned || "file";
}

function withSuffix(path: string, n: number): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const hasExt = dot > slash + 1;
  return hasExt ? `${path.slice(0, dot)} (${n})${path.slice(dot)}` : `${path} (${n})`;
}

export function buildManifest({
  assets, folders, assetIds, folderIds, canSee, baseName, date,
}: {
  assets: ManifestAsset[];
  folders: ManifestFolder[];
  assetIds: string[];
  folderIds: string[];
  canSee: (p: Perms) => boolean;
  baseName: string;
  date: string;
}): Manifest {
  const foldersById = new Map(folders.map((f) => [f.id, f]));
  const childrenByParent = new Map<string, ManifestFolder[]>();
  for (const f of folders) {
    if (!f.parent_folder_id) continue;
    childrenByParent.set(f.parent_folder_id, [...(childrenByParent.get(f.parent_folder_id) ?? []), f]);
  }
  const assetsByFolder = new Map<string, ManifestAsset[]>();
  for (const a of assets) {
    if (!a.folder_id) continue;
    assetsByFolder.set(a.folder_id, [...(assetsByFolder.get(a.folder_id) ?? []), a]);
  }

  const picked: { asset: ManifestAsset; dir: string }[] = [];
  const seenAssets = new Set<string>();
  let skipped = 0;
  const add = (asset: ManifestAsset, dir: string) => {
    if (seenAssets.has(asset.id) || !asset.file_path) return;
    seenAssets.add(asset.id);
    if (!canSee(asset)) { skipped += 1; return; }
    picked.push({ asset, dir });
  };

  // Folder trees. A folder the caller can't see is skipped with its whole subtree (the UI would
  // never let them open it); the seen-set doubles as the cycle guard.
  const seenFolders = new Set<string>();
  const walk = (folder: ManifestFolder, dir: string) => {
    if (seenFolders.has(folder.id)) return;
    seenFolders.add(folder.id);
    if (!canSee(folder)) { skipped += (assetsByFolder.get(folder.id) ?? []).length; return; }
    // Same-named files in one folder are versions — only the newest ships (matches the tile).
    const newestByName = new Map<string, ManifestAsset>();
    for (const a of assetsByFolder.get(folder.id) ?? []) {
      const key = (a.file_name ?? a.label).toLowerCase();
      const cur = newestByName.get(key);
      if (!cur || new Date(a.created_at) > new Date(cur.created_at)) newestByName.set(key, a);
    }
    for (const a of newestByName.values()) add(a, dir);
    for (const child of childrenByParent.get(folder.id) ?? []) walk(child, `${dir}/${safeSegment(child.name)}`);
  };
  for (const id of folderIds) {
    const f = foldersById.get(id);
    if (f) walk(f, safeSegment(f.name));
  }
  const wanted = new Set(assetIds);
  for (const a of assets) if (wanted.has(a.id)) add(a, "");

  const used = new Set<string>();
  const entries: ManifestEntry[] = picked.map(({ asset, dir }) => {
    const base = `${dir ? `${dir}/` : ""}${safeSegment(asset.file_name ?? asset.label)}`;
    let path = base;
    for (let n = 1; used.has(path.toLowerCase()); n += 1) path = withSuffix(base, n);
    used.add(path.toLowerCase());
    return { assetId: asset.id, path, filePath: asset.file_path!, size: asset.file_size ?? 0 };
  });

  const onlyOneFolder = folderIds.length === 1 && assetIds.length === 0 ? foldersById.get(folderIds[0]) : null;
  const zipName = onlyOneFolder ? `${safeSegment(onlyOneFolder.name)}.zip` : `${safeSegment(baseName)}-files-${date}.zip`;
  return { entries, skipped, totalBytes: entries.reduce((n, e) => n + e.size, 0), zipName };
}
