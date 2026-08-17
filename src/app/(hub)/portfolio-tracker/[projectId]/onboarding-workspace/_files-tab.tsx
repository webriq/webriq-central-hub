"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronRight, FolderPlus, LayoutGrid, List, CircleQuestionMark, Search, ArrowUpDown, X, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetRow, AssetFolder, StaffPerson } from "./_wizard-v2-types";
import { textPrimary, textMuted, cardCls, IconTip } from "./_shared-ui";
import { FolderTile, FileTile, ActionsMenuItems, ItemAction } from "./_file-tile";
import { RenameModal, MoveModal, DuplicateFolderModal } from "./_rename-move-modals";
import { BulkToolbar } from "./_bulk-toolbar";
import { useUploadQueue, UploadQueuePanel, UploadDropzone } from "./_upload-queue";

const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html", "text/markdown", "text/plain", "text/csv",
];
const MIME_LABELS: Record<string, string> = {
  "image/jpeg": "JPG", "image/png": "PNG", "image/gif": "GIF", "image/webp": "WEBP", "image/svg+xml": "SVG",
  "application/pdf": "PDF", "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/html": "HTML", "text/markdown": "MD", "text/plain": "TXT", "text/csv": "CSV",
};
const ALLOWED_TYPES_LABEL = Array.from(new Set(ALLOWED_UPLOAD_TYPES.map((m) => MIME_LABELS[m] ?? m))).join(", ");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // matches the customer-assets bucket's file_size_limit (upload/route.ts)
const MAX_SIZE_LABEL = "25 MB";

type VersionGroup = { asset: AssetRow; versionCount: number; olderVersions: AssetRow[] };

export function FilesTab({
  customerId, assets, folders, staffDirectory, canEdit, openFolderId, onOpenFolder,
  onUpload, onDeleteAsset, onAssetPermissionChange, onFolderPermissionChange, onCreateFolder,
  onRenameAsset, onRenameFolder, onDeleteFolder, onMoveAsset,
}: {
  customerId: string;
  assets: AssetRow[]; folders: AssetFolder[]; staffDirectory: StaffPerson[]; canEdit: boolean;
  openFolderId: string | null; onOpenFolder: (id: string | null) => void;
  onUpload: (file: File, folderId: string, onProgress?: (pct: number) => void) => Promise<void>;
  onDeleteAsset: (id: string) => void;
  onAssetPermissionChange: (assetId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  onFolderPermissionChange: (folderId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  onCreateFolder: (name: string, parentFolderId: string | null) => Promise<void>;
  onRenameAsset: (assetId: string, fileName: string) => Promise<boolean>;
  onRenameFolder: (folderId: string, name: string) => Promise<boolean>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onMoveAsset: (assetId: string, folderId: string) => Promise<void>;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [rejectedFile, setRejectedFile] = useState<{ name: string; reason: string } | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ name: string; suggested: string } | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "name">("newest");
  const [renameTarget, setRenameTarget] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [moveTargetAssetIds, setMoveTargetAssetIds] = useState<string[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ItemAction[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items: queueItems, enqueue, retry: retryUpload, dismiss: dismissQueueItem } = useUploadQueue(onUpload);

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
  const fileCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assets) {
      if (a.type === "file" && a.folder_id) counts.set(a.folder_id, (counts.get(a.folder_id) ?? 0) + 1);
    }
    return counts;
  }, [assets]);

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

  const openContextMenu = (e: React.MouseEvent, actions: ItemAction[]) => {
    const menuWidth = 176;
    const menuHeight = actions.length * 32 + 8;
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(e.clientY, window.innerHeight - menuHeight - 8),
      actions,
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleFiles = (files: FileList | File[], targetFolderId: string) => {
    if (!canEdit) return;
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
        setRejectedFile({ name: file.name, reason: `${file.type || "This file type"} isn't supported — allowed: ${ALLOWED_TYPES_LABEL}.` });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setRejectedFile({ name: file.name, reason: `${(file.size / (1024 * 1024)).toFixed(1)} MB exceeds the ${MAX_SIZE_LABEL} limit — compress the file or split it, then try again.` });
        continue;
      }
      valid.push(file);
    }
    if (valid.length > 0) {
      setRejectedFile(null);
      enqueue(valid, targetFolderId);
    }
  };

  const handleZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!openFolderId) return; // root: empty space never accepts a drop (folder tiles handle their own drop below)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files, openFolderId);
  };

  // Case-insensitive next-free "{name} (n)" suffix — mirrors a standard OS duplicate-file
  // rename convention; checks "(1)", "(2)", ... in order for the lowest free slot.
  const nextAvailableFolderName = (base: string, existing: string[]): string => {
    const lower = new Set(existing.map((n) => n.trim().toLowerCase()));
    if (!lower.has(base.trim().toLowerCase())) return base;
    let n = 1;
    while (lower.has(`${base} (${n})`.toLowerCase())) n += 1;
    return `${base} (${n})`;
  };

  // Both the Enter-key path (NewFolderTile's onKeyDown) and the blur-to-save path route through
  // here. `finalName` is set only by DuplicateFolderModal's confirm action — that name is already
  // known-unique against the siblings checked when the prompt was raised, so it skips the check
  // and creates directly (the API's own unique-constraint 400 remains the backstop for a race).
  const submitCreateFolder = async (finalName?: string) => {
    const name = (finalName ?? newFolderName).trim();
    if (!name) return;
    if (!finalName) {
      const existingNames = currentLevelFolders.map((f) => f.name);
      if (existingNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
        setDuplicatePrompt({ name, suggested: nextAvailableFolderName(name, existingNames) });
        return;
      }
    }
    await onCreateFolder(name, openFolderId);
    setNewFolderName("");
    setNewFolderOpen(false);
    setDuplicatePrompt(null);
  };

  return (
    <div className={cn(cardCls, "p-4")} onClick={() => setContextMenu(null)}>
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div className="fixed z-50 w-44 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1 flex flex-col" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
            <ActionsMenuItems actions={contextMenu.actions} onDone={() => setContextMenu(null)} />
          </div>
        </>
      )}

      <div className="flex items-center gap-2.5 mb-3.5 flex-wrap">
        <div className="flex items-center gap-1.5 text-[13px] flex-1 min-w-[180px] flex-wrap">
          <button type="button" onClick={() => onOpenFolder(null)} className={cn("cursor-pointer border-none bg-transparent px-0 font-medium", breadcrumbChain.length > 0 ? "text-[#5F6A88] hover:text-[#007BFF]" : textPrimary)}>
            Files
          </button>
          {breadcrumbChain.map((crumb, i) => {
            const isLast = i === breadcrumbChain.length - 1;
            return (
              <Fragment key={crumb.id}>
                <ChevronRight size={13} className="text-[#5F6A88]" />
                {isLast ? (
                  <span className={cn("font-medium", textPrimary)}>{crumb.name}</span>
                ) : (
                  <button type="button" onClick={() => onOpenFolder(crumb.id)} className="cursor-pointer border-none bg-transparent px-0 font-medium text-[#5F6A88] hover:text-[#007BFF]">
                    {crumb.name}
                  </button>
                )}
              </Fragment>
            );
          })}
          <IconTip label="This area is a drag-and-drop zone — open a folder, then drop files anywhere in it to upload. Right-click a file or folder for more actions.">
            <span className="inline-flex text-[#A8B3CC] cursor-help"><CircleQuestionMark size={14} /></span>
          </IconTip>
        </div>
        <div className="relative w-44 shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={openFolder ? "Search files & folders" : "Search folders"}
            className="w-full text-[12px] text-[#0B1533] placeholder:text-[#5F6A88] rounded-full border border-[#E2E7F2] bg-[#F4F6FB] pl-8 pr-3 py-2 outline-none transition-colors focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setSortBy((s) => (s === "newest" ? "name" : "newest"))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-[#E2E7F2] bg-white text-[#3A4565] cursor-pointer hover:border-[#A8C6F5] transition-colors shrink-0"
        >
          <ArrowUpDown size={12} /> Sort: {sortBy === "newest" ? "Newest" : "Name"}
        </button>
        {openFolder && (
          <div className="flex items-center rounded-full border border-[#E2E7F2] bg-white p-0.5 shrink-0">
            <IconTip label="Grid view">
              <button type="button" onClick={() => setViewMode("grid")} aria-label="Grid view" aria-pressed={viewMode === "grid"} className={cn("p-1.5 rounded-full cursor-pointer border-none transition-colors", viewMode === "grid" ? "bg-[#E5F1FF] text-[#007BFF]" : "bg-transparent text-[#5F6A88]")}>
                <LayoutGrid size={14} />
              </button>
            </IconTip>
            <IconTip label="List view">
              <button type="button" onClick={() => setViewMode("list")} aria-label="List view" aria-pressed={viewMode === "list"} className={cn("p-1.5 rounded-full cursor-pointer border-none transition-colors", viewMode === "list" ? "bg-[#E5F1FF] text-[#007BFF]" : "bg-transparent text-[#5F6A88]")}>
                <List size={14} />
              </button>
            </IconTip>
          </div>
        )}
        {openFolder && canEdit && (
          <>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files, openFolderId!)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#007BFF] text-white cursor-pointer border-none hover:bg-[#0063D6] transition-colors shrink-0">
              <CloudUpload size={13} /> Upload
            </button>
          </>
        )}
      </div>

      {openFolder && <UploadQueuePanel items={queueItems} onRetry={retryUpload} onDismiss={dismissQueueItem} />}

      {rejectedFile && filesInOpenFolder.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-3.5 px-3.5 py-2.5 rounded-[10px] bg-[#FDE8E6] border border-[#C0392B]/20 text-[12px] text-[#C0392B]">
          <span><b>{rejectedFile.name}</b> can&apos;t be uploaded — {rejectedFile.reason}</span>
          <button type="button" onClick={() => setRejectedFile(null)} aria-label="Dismiss" className="shrink-0 bg-transparent border-none cursor-pointer text-[#C0392B]"><X size={14} /></button>
        </div>
      )}

      {openFolder && selectedIds.size > 0 && (
        <BulkToolbar
          count={selectedIds.size}
          staffDirectory={staffDirectory}
          onClear={clearSelection}
          onBulkPermissionChange={async (updates) => { await Promise.all(Array.from(selectedIds).map((id) => onAssetPermissionChange(id, updates))); }}
          onMove={() => setMoveTargetAssetIds(Array.from(selectedIds))}
          onDelete={async () => { await Promise.all(Array.from(selectedIds).map((id) => onDeleteAsset(id))); clearSelection(); }}
        />
      )}

      {!openFolder ? (
        currentLevelFolders.length === 0 ? (
          <EmptyPanel text="No folders yet — folders are created automatically per deliverable, or add your own." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
            {visibleFolders.map((folder) => (
              <FolderTile
                key={folder.id}
                folder={folder}
                fileCount={fileCountByFolder.get(folder.id) ?? 0}
                canEdit={canEdit}
                duplicateWarning={duplicateFolderNames.has(folder.name.trim().toLowerCase())}
                onOpen={() => onOpenFolder(folder.id)}
                onPermissionChange={(u) => onFolderPermissionChange(folder.id, u)}
                onRename={() => setRenameTarget({ kind: "folder", id: folder.id, name: folder.name })}
                onDelete={() => onDeleteFolder(folder.id)}
                staffDirectory={staffDirectory}
                isDropTarget={dragOverFolderId === folder.id}
                onDragOverTile={(e) => { e.preventDefault(); e.stopPropagation(); if (canEdit) setDragOverFolderId(folder.id); }}
                onDragLeaveTile={(e) => { e.stopPropagation(); setDragOverFolderId((id) => (id === folder.id ? null : id)); }}
                onDropTile={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(null); if (canEdit && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files, folder.id); }}
                onContextMenu={openContextMenu}
              />
            ))}
            {!searchQuery && canEdit && (
              <NewFolderTile open={newFolderOpen} name={newFolderName} onOpen={() => setNewFolderOpen(true)} onNameChange={setNewFolderName} onCreate={() => submitCreateFolder()} onCancel={() => { setNewFolderOpen(false); setNewFolderName(""); setDuplicatePrompt(null); }} />
            )}
            {visibleFolders.length === 0 && searchQuery && (
              <p className={cn("text-[12.5px] col-span-full text-center py-6", textMuted)}>No folders match &ldquo;{searchQuery}&rdquo;.</p>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* Sub-folders (task 220) — folders inside the currently open folder, rendered above its
              files, matching ../_onboarding-wizard.tsx's Storage folder + KB grouping. */}
          {(visibleFolders.length > 0 || (!searchQuery && canEdit)) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {visibleFolders.map((folder) => (
                <FolderTile
                  key={folder.id}
                  folder={folder}
                  fileCount={fileCountByFolder.get(folder.id) ?? 0}
                  canEdit={canEdit}
                  duplicateWarning={duplicateFolderNames.has(folder.name.trim().toLowerCase())}
                  onOpen={() => onOpenFolder(folder.id)}
                  onPermissionChange={(u) => onFolderPermissionChange(folder.id, u)}
                  onRename={() => setRenameTarget({ kind: "folder", id: folder.id, name: folder.name })}
                  onDelete={() => onDeleteFolder(folder.id)}
                  staffDirectory={staffDirectory}
                  isDropTarget={dragOverFolderId === folder.id}
                  onDragOverTile={(e) => { e.preventDefault(); e.stopPropagation(); if (canEdit) setDragOverFolderId(folder.id); }}
                  onDragLeaveTile={(e) => { e.stopPropagation(); setDragOverFolderId((id) => (id === folder.id ? null : id)); }}
                  onDropTile={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(null); if (canEdit && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files, folder.id); }}
                  onContextMenu={openContextMenu}
                />
              ))}
              {!searchQuery && canEdit && (
                <NewFolderTile open={newFolderOpen} name={newFolderName} onOpen={() => setNewFolderOpen(true)} onNameChange={setNewFolderName} onCreate={() => submitCreateFolder()} onCancel={() => { setNewFolderOpen(false); setNewFolderName(""); setDuplicatePrompt(null); }} />
              )}
            </div>
          )}
          {visibleFolders.length === 0 && searchQuery && currentLevelFolders.length > 0 && (
            <p className={cn("text-[12.5px] text-center", textMuted)}>No sub-folders match &ldquo;{searchQuery}&rdquo;.</p>
          )}
        <div
          onDragOver={(e) => { e.preventDefault(); if (canEdit) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleZoneDrop}
          className={cn("rounded-[10px] transition-colors", dragOver && canEdit && "bg-[#F0F7FF] ring-2 ring-[#007BFF]/30")}
        >
          {filesInOpenFolder.length === 0 ? (
            canEdit ? (
              <UploadDropzone
                uploading={false}
                isDragOver={dragOver}
                onBrowse={() => fileInputRef.current?.click()}
                rejected={rejectedFile}
                maxSizeLabel={MAX_SIZE_LABEL}
                allowedTypesLabel={ALLOWED_TYPES_LABEL}
              />
            ) : (
              <EmptyPanel text="This folder is empty." />
            )
          ) : visibleFiles.length === 0 ? (
            <p className={cn("text-[12.5px] text-center py-10", textMuted)}>No files match &ldquo;{searchQuery}&rdquo;.</p>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {visibleFiles.map(({ asset, versionCount, olderVersions }) => (
                <FileTile
                  key={asset.id}
                  asset={asset}
                  customerId={customerId}
                  canEdit={canEdit}
                  viewMode="grid"
                  selected={selectedIds.has(asset.id)}
                  versionCount={versionCount}
                  olderVersions={olderVersions}
                  onToggleSelect={() => toggleSelect(asset.id)}
                  onContextMenu={openContextMenu}
                  onDelete={() => onDeleteAsset(asset.id)}
                  onPermissionChange={(u) => onAssetPermissionChange(asset.id, u)}
                  onRename={() => setRenameTarget({ kind: "file", id: asset.id, name: asset.file_name ?? asset.label })}
                  onMove={() => setMoveTargetAssetIds([asset.id])}
                  staffDirectory={staffDirectory}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleFiles.map(({ asset, versionCount, olderVersions }) => (
                <FileTile
                  key={asset.id}
                  asset={asset}
                  customerId={customerId}
                  canEdit={canEdit}
                  viewMode="list"
                  selected={selectedIds.has(asset.id)}
                  versionCount={versionCount}
                  olderVersions={olderVersions}
                  onToggleSelect={() => toggleSelect(asset.id)}
                  onContextMenu={openContextMenu}
                  onDelete={() => onDeleteAsset(asset.id)}
                  onPermissionChange={(u) => onAssetPermissionChange(asset.id, u)}
                  onRename={() => setRenameTarget({ kind: "file", id: asset.id, name: asset.file_name ?? asset.label })}
                  onMove={() => setMoveTargetAssetIds([asset.id])}
                  staffDirectory={staffDirectory}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      )}

      {renameTarget && (
        <RenameModal
          initialValue={renameTarget.name}
          kind={renameTarget.kind}
          onClose={() => setRenameTarget(null)}
          onSubmit={(value) => (renameTarget.kind === "folder" ? onRenameFolder(renameTarget.id, value) : onRenameAsset(renameTarget.id, value))}
        />
      )}
      {moveTargetAssetIds && (
        <MoveModal
          folders={folders}
          currentFolderId={openFolderId}
          onClose={() => setMoveTargetAssetIds(null)}
          onSubmit={async (folderId) => { await Promise.all(moveTargetAssetIds.map((id) => onMoveAsset(id, folderId))); clearSelection(); }}
        />
      )}
      {duplicatePrompt && (
        <DuplicateFolderModal
          name={duplicatePrompt.name}
          suggestedName={duplicatePrompt.suggested}
          onCancel={() => setDuplicatePrompt(null)}
          onConfirm={() => submitCreateFolder(duplicatePrompt.suggested)}
        />
      )}
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 rounded-[10px] border-2 border-dashed border-[#E2E7F2] text-center px-6">
      <CloudUpload size={24} className="text-[#A8B3CC]" />
      <p className={cn("text-[12.5px] max-w-64", textMuted)}>{text}</p>
    </div>
  );
}

// Mockup 03's inline dashed "+ New folder" grid tile — replaces the old toolbar-button-reveals-
// an-inline-input-row pattern; the tile itself now toggles into the name input.
function NewFolderTile({
  open, name, onOpen, onNameChange, onCreate, onCancel,
}: {
  open: boolean; name: string; onOpen: () => void; onNameChange: (v: string) => void; onCreate: () => void; onCancel: () => void;
}) {
  if (open) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-[#A8C6F5] bg-[#F0F7FF] p-4 min-h-26">
        <input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onCreate(); if (e.key === "Escape") onCancel(); }}
          onBlur={() => (name.trim() ? onCreate() : onCancel())}
          placeholder="Folder name"
          className="w-full text-[12.5px] text-[#0B1533] placeholder:text-[#5F6A88] rounded-[8px] border border-[#A8C6F5] bg-white px-2.5 py-2 outline-none text-center"
        />
        <p className={cn("text-[10.5px]", textMuted)}>Press Enter to save</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-[#A8C6F5] bg-[#F0F7FF] text-[#0063D6] font-semibold text-[12.5px] min-h-26 cursor-pointer hover:bg-[#E5F1FF] transition-colors"
    >
      <FolderPlus size={20} /> New folder
    </button>
  );
}
