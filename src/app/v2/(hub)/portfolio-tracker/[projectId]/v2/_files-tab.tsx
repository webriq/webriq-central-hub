"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronRight, CloudUpload, FolderPlus, Loader2, LayoutGrid, List, CircleQuestionMark } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetRow, AssetFolder, StaffPerson } from "./_wizard-v2-types";
import { textPrimary, textMuted, cardCls, fieldInputCls, IconTip } from "./_shared-ui";
import { FolderTile, FileTile, ActionsMenuItems, ItemAction } from "./_file-tile";
import { RenameModal, MoveModal } from "./_rename-move-modals";
import { BulkToolbar } from "./_bulk-toolbar";

const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html", "text/markdown", "text/plain", "text/csv",
];

export function FilesTab({
  customerId, assets, folders, staffDirectory, canEdit, openFolderId, onOpenFolder,
  onUpload, onDeleteAsset, onAssetPermissionChange, onFolderPermissionChange, onCreateFolder,
  onRenameAsset, onRenameFolder, onDeleteFolder, onMoveAsset,
}: {
  customerId: string;
  assets: AssetRow[]; folders: AssetFolder[]; staffDirectory: StaffPerson[]; canEdit: boolean;
  openFolderId: string | null; onOpenFolder: (id: string | null) => void;
  onUpload: (file: File, folderId: string) => Promise<void>;
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [renameTarget, setRenameTarget] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [moveTargetAssetIds, setMoveTargetAssetIds] = useState<string[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ItemAction[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rootFolders = useMemo(() => folders.filter((f) => f.parent_folder_id === null).sort((a, b) => a.name.localeCompare(b.name)), [folders]);
  const openFolder = openFolderId ? folders.find((f) => f.id === openFolderId) ?? null : null;
  const filesInOpenFolder = useMemo(() => (openFolderId ? assets.filter((a) => a.type === "file" && a.folder_id === openFolderId) : []), [assets, openFolderId]);
  const fileCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assets) {
      if (a.type === "file" && a.folder_id) counts.set(a.folder_id, (counts.get(a.folder_id) ?? 0) + 1);
    }
    return counts;
  }, [assets]);

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

  const handleFiles = async (files: FileList | File[], targetFolderId: string) => {
    if (!canEdit) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
          setUploadError(`Unsupported file type: ${file.type || "unknown"}`);
          continue;
        }
        await onUpload(file, targetFolderId);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!openFolderId) return; // root: empty space never accepts a drop (folder tiles handle their own drop below)
    if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files, openFolderId);
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

      <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
        <div className="flex items-center gap-1.5 text-[13px]">
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
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-[#E2E7F2] bg-white p-0.5">
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
          {!openFolder && canEdit && (
            <button type="button" onClick={() => setNewFolderOpen((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-[#E2E7F2] bg-white text-[#3A4565] cursor-pointer hover:border-[#A8C6F5] transition-colors">
              <FolderPlus size={13} /> New folder
            </button>
          )}
          {openFolder && canEdit && (
            <>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files, openFolderId!)} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#007BFF] text-white cursor-pointer border-none hover:bg-[#0063D6] transition-colors disabled:opacity-60">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} />}
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </>
          )}
        </div>
      </div>

      {!openFolder && newFolderOpen && (
        <div className="flex items-center gap-2 mb-3.5">
          <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()} placeholder="Folder name" className={cn(fieldInputCls, "max-w-64 text-[12.5px] py-2")} />
          <button type="button" onClick={handleCreateFolder} className="px-3 py-2 rounded-lg bg-[#007BFF] text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-[#0063D6] transition-colors">Create</button>
        </div>
      )}

      {uploadError && <p className="text-[12px] text-[#C0392B] mb-3">{uploadError}</p>}

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
            {rootFolders.map((folder) => (
              <FolderTile
                key={folder.id}
                folder={folder}
                fileCount={fileCountByFolder.get(folder.id) ?? 0}
                canEdit={canEdit}
                onOpen={() => onOpenFolder(folder.id)}
                onPermissionChange={(u) => onFolderPermissionChange(folder.id, u)}
                onRename={() => setRenameTarget({ kind: "folder", id: folder.id, name: folder.name })}
                onDelete={() => onDeleteFolder(folder.id)}
                staffDirectory={staffDirectory}
                isDropTarget={dragOverFolderId === folder.id}
                onDragOverTile={(e) => { e.preventDefault(); e.stopPropagation(); if (canEdit) setDragOverFolderId(folder.id); }}
                onDragLeaveTile={(e) => { e.stopPropagation(); setDragOverFolderId((id) => (id === folder.id ? null : id)); }}
                onDropTile={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(null); if (canEdit && e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files, folder.id); }}
                onContextMenu={openContextMenu}
              />
            ))}
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
              <UploadDropzone uploading={uploading} isDragOver={dragOver} onBrowse={() => fileInputRef.current?.click()} />
            ) : (
              <EmptyPanel text="This folder is empty." />
            )
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {filesInOpenFolder.map((asset) => (
                <FileTile
                  key={asset.id}
                  asset={asset}
                  customerId={customerId}
                  canEdit={canEdit}
                  viewMode="grid"
                  selected={selectedIds.has(asset.id)}
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
              {filesInOpenFolder.map((asset) => (
                <FileTile
                  key={asset.id}
                  asset={asset}
                  customerId={customerId}
                  canEdit={canEdit}
                  viewMode="list"
                  selected={selectedIds.has(asset.id)}
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

// Same drag-and-drop visual as the per-field upload boxes on the original Onboarding Wizard's
// steps (../_onboarding-wizard.tsx's FileUploadBox) — circular blue icon badge, "Drag & drop a
// file, or browse" copy, dashed rounded-2xl border. The actual drop handling stays on this
// tab's parent zone (`onDrop={handleZoneDrop}` in the wrapping div); this is the empty-state
// visual + the click-to-browse trigger.
function UploadDropzone({ uploading, isDragOver, onBrowse }: { uploading: boolean; isDragOver: boolean; onBrowse: () => void }) {
  return (
    <button
      type="button"
      onClick={onBrowse}
      disabled={uploading}
      className={cn(
        "group w-full min-h-[168px] flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed py-8 text-center cursor-pointer transition-colors duration-150 disabled:opacity-60",
        isDragOver ? "border-[#007BFF] bg-[#F0F7FF]" : "border-[#C7D2E8] bg-[#F9FAFD] hover:border-[#007BFF] hover:bg-[#F0F7FF]"
      )}
    >
      <div className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full transition-all duration-150 group-hover:scale-105",
        isDragOver ? "bg-[#007BFF] text-white" : "bg-[#E5F1FF] text-[#007BFF]"
      )}>
        <CloudUpload size={22} strokeWidth={1.75} />
      </div>
      <div className={cn("text-[13px] font-medium", textPrimary)}>
        {uploading ? "Uploading…" : <>Drag &amp; drop a file, or <span className="text-[#007BFF]">browse</span></>}
      </div>
      {!uploading && <div className={cn("text-[11px]", textMuted)}>Any document, spreadsheet, or image</div>}
    </button>
  );
}
