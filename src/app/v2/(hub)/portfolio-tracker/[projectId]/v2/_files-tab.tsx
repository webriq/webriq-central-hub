"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronRight, FolderPlus, LayoutGrid, List, CircleQuestionMark, Search, ArrowUpDown, X, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetRow, AssetFolder, StaffPerson } from "./_wizard-v2-types";
import { textPrimary, textMuted, cardCls, IconTip } from "./_shared-ui";
import { FolderTile, FileTile, ActionsMenuItems, ItemAction } from "./_file-tile";
import { RenameModal, MoveModal } from "./_rename-move-modals";
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
  onCreateFolder: (name: string) => Promise<void>;
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "name">("newest");
  const [renameTarget, setRenameTarget] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [moveTargetAssetIds, setMoveTargetAssetIds] = useState<string[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ItemAction[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items: queueItems, enqueue, retry: retryUpload, dismiss: dismissQueueItem } = useUploadQueue(onUpload);

  const rootFolders = useMemo(() => folders.filter((f) => f.parent_folder_id === null), [folders]);
  const openFolder = openFolderId ? folders.find((f) => f.id === openFolderId) ?? null : null;
  const filesInOpenFolder = useMemo(() => (openFolderId ? assets.filter((a) => a.type === "file" && a.folder_id === openFolderId) : []), [assets, openFolderId]);
  const fileCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assets) {
      if (a.type === "file" && a.folder_id) counts.set(a.folder_id, (counts.get(a.folder_id) ?? 0) + 1);
    }
    return counts;
  }, [assets]);

  // Case-insensitive sibling collision — the create-folder API already blocks new duplicates on
  // the happy path (assets/folders/route.ts), so this only ever fires for legacy data or the
  // documented 23505-race fallback. Display-only warning, not a new validation rule.
  const duplicateFolderNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of rootFolders) {
      const key = f.name.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([name]) => name));
  }, [rootFolders]);

  const visibleFolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q ? rootFolders.filter((f) => f.name.toLowerCase().includes(q)) : rootFolders;
    return [...list].sort((a, b) => (sortBy === "name" ? a.name.localeCompare(b.name) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  }, [rootFolders, searchQuery, sortBy]);

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

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await onCreateFolder(newFolderName.trim());
    setNewFolderName("");
    setNewFolderOpen(false);
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
        <div className="flex items-center gap-1.5 text-[13px] flex-1 min-w-[180px]">
          <button type="button" onClick={() => onOpenFolder(null)} className={cn("cursor-pointer border-none bg-transparent px-0 font-medium", openFolder ? "text-[#5F6A88] hover:text-[#007BFF]" : textPrimary)}>
            Files
          </button>
          {openFolder && (
            <>
              <ChevronRight size={13} className="text-[#5F6A88]" />
              <span className={cn("font-medium", textPrimary)}>{openFolder.name}</span>
            </>
          )}
          <IconTip label="This area is a drag-and-drop zone — open a folder, then drop files anywhere in it to upload. Right-click a file or folder for more actions.">
            <span className="inline-flex text-[#A8B3CC] cursor-help"><CircleQuestionMark size={14} /></span>
          </IconTip>
        </div>
        <div className="relative w-44 shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={openFolder ? "Search files" : "Search folders"}
            className="w-full text-[12px] rounded-full border border-[#E2E7F2] bg-[#F4F6FB] pl-8 pr-3 py-2 outline-none transition-colors focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setSortBy((s) => (s === "newest" ? "name" : "newest"))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-[#E2E7F2] bg-white text-[#3A4565] cursor-pointer hover:border-[#A8C6F5] transition-colors shrink-0"
        >
          <ArrowUpDown size={12} /> Sort: {sortBy === "newest" ? "Newest" : "Name"}
        </button>
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
        rootFolders.length === 0 ? (
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
              <NewFolderTile open={newFolderOpen} name={newFolderName} onOpen={() => setNewFolderOpen(true)} onNameChange={setNewFolderName} onCreate={handleCreateFolder} onCancel={() => { setNewFolderOpen(false); setNewFolderName(""); }} />
            )}
            {visibleFolders.length === 0 && searchQuery && (
              <p className={cn("text-[12.5px] col-span-full text-center py-6", textMuted)}>No folders match &ldquo;{searchQuery}&rdquo;.</p>
            )}
          </div>
        )
      ) : (
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
      <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#A8C6F5] bg-[#F0F7FF] p-4 min-h-26">
        <input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onCreate(); if (e.key === "Escape") onCancel(); }}
          onBlur={() => (name.trim() ? onCreate() : onCancel())}
          placeholder="Folder name"
          className="w-full text-[12.5px] rounded-[8px] border border-[#A8C6F5] bg-white px-2.5 py-2 outline-none text-center"
        />
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
