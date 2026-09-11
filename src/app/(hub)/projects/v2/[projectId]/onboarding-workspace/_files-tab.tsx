"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetRow, AssetFolder, StaffPerson } from "./_wizard-v2-types";
import { textMuted, cardCls } from "./_shared-ui";
import { FileTile } from "./_file-tile";
import { FolderTile } from "./_folder-tile";
import { ActionsMenuItems, ItemAction, clampMenuPosition } from "./_file-actions-menu";
import { RenameModal, MoveModal, DuplicateFolderModal } from "./_rename-move-modals";
import { BulkToolbar } from "./_bulk-toolbar";
import { useUploadQueue, UploadQueuePanel, UploadDropzone } from "./_upload-queue";
import { ALLOWED_UPLOAD_TYPES, ALLOWED_TYPES_LABEL, MAX_FILE_SIZE, MAX_SIZE_LABEL } from "./_file-upload-constants";
import { useFilesTabDerived, type VersionGroup } from "./_use-files-tab-derived";
import { FilesToolbar } from "./_files-toolbar";
import { EmptyPanel, NewFolderTile } from "./_files-tab-parts";

export function FilesTab({
  customerId, assets, folders, staffDirectory, canEdit, openFolderId, onOpenFolder,
  onUpload, onDeleteAsset, onAssetPermissionChange, onFolderPermissionChange, onCreateFolder,
  onRenameAsset, onRenameFolder, onDeleteFolder, onMoveAsset,
  onCopyFolderUrl, onCopyFileUrl, autoPreviewAssetId,
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
  // Task 359 — deep-link extras, all optional. The Onboarding Workspace omits them (it has its
  // own name-path ?parent_folder=/?sub_folder_lN= scheme in _workspace-url-params.ts), so the
  // Copy URL menu entries and the auto-open preview exist only on the project Files tab.
  onCopyFolderUrl?: (folderId: string) => void;
  onCopyFileUrl?: (assetId: string) => void;
  autoPreviewAssetId?: string | null;
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

  const {
    currentLevelFolders, openFolder, breadcrumbChain, filesInOpenFolder,
    fileCountByFolder, duplicateFolderNames, visibleFolders, visibleFiles,
  } = useFilesTabDerived({ assets, folders, openFolderId, searchQuery, sortBy });

  const openContextMenu = (e: React.MouseEvent, actions: ItemAction[]) => {
    setContextMenu({ ...clampMenuPosition({ x: e.clientX, y: e.clientY }, actions.length), actions });
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

  // Both folder grids (root level and sub-folders inside an open folder) render identically —
  // one builder so the two can't drift, which they previously did by being copy-pasted.
  const renderFolderTile = (folder: AssetFolder) => (
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
      onCopyFolderUrl={onCopyFolderUrl ? () => onCopyFolderUrl(folder.id) : undefined}
      staffDirectory={staffDirectory}
      isDropTarget={dragOverFolderId === folder.id}
      onDragOverTile={(e) => { e.preventDefault(); e.stopPropagation(); if (canEdit) setDragOverFolderId(folder.id); }}
      onDragLeaveTile={(e) => { e.stopPropagation(); setDragOverFolderId((id) => (id === folder.id ? null : id)); }}
      onDropTile={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(null); if (canEdit && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files, folder.id); }}
      onContextMenu={openContextMenu}
    />
  );

  const renderNewFolderTile = () => (
    <NewFolderTile
      open={newFolderOpen}
      name={newFolderName}
      onOpen={() => setNewFolderOpen(true)}
      onNameChange={setNewFolderName}
      onCreate={() => submitCreateFolder()}
      onCancel={() => { setNewFolderOpen(false); setNewFolderName(""); setDuplicatePrompt(null); }}
    />
  );

  const renderFileTile = ({ asset, versionCount, olderVersions }: VersionGroup) => (
    <FileTile
      key={asset.id}
      asset={asset}
      customerId={customerId}
      canEdit={canEdit}
      viewMode={viewMode}
      selected={selectedIds.has(asset.id)}
      versionCount={versionCount}
      olderVersions={olderVersions}
      autoPreview={autoPreviewAssetId === asset.id}
      onToggleSelect={() => toggleSelect(asset.id)}
      onContextMenu={openContextMenu}
      onDelete={() => onDeleteAsset(asset.id)}
      onPermissionChange={(u) => onAssetPermissionChange(asset.id, u)}
      onRename={() => setRenameTarget({ kind: "file", id: asset.id, name: asset.file_name ?? asset.label })}
      onMove={() => setMoveTargetAssetIds([asset.id])}
      onCopyFileUrl={onCopyFileUrl ? () => onCopyFileUrl(asset.id) : undefined}
      staffDirectory={staffDirectory}
    />
  );

  return (
    <div className={cn(cardCls, "p-4")} onClick={() => setContextMenu(null)}>
      {contextMenu ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div className="fixed z-50 w-44 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1 flex flex-col" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
            <ActionsMenuItems actions={contextMenu.actions} onDone={() => setContextMenu(null)} />
          </div>
        </>
      ) : null}

      <FilesToolbar
        breadcrumbChain={breadcrumbChain}
        openFolder={openFolder}
        openFolderId={openFolderId}
        canEdit={canEdit}
        searchQuery={searchQuery}
        sortBy={sortBy}
        viewMode={viewMode}
        fileInputRef={fileInputRef}
        onOpenFolder={onOpenFolder}
        onSearchChange={setSearchQuery}
        onToggleSort={() => setSortBy((s) => (s === "newest" ? "name" : "newest"))}
        onViewModeChange={setViewMode}
        onFilesPicked={handleFiles}
      />

      {openFolder ? <UploadQueuePanel items={queueItems} onRetry={retryUpload} onDismiss={dismissQueueItem} /> : null}

      {rejectedFile && filesInOpenFolder.length > 0 ? (
        <div className="flex items-center justify-between gap-3 mb-3.5 px-3.5 py-2.5 rounded-[10px] bg-[#FDE8E6] border border-[#C0392B]/20 text-[12px] text-[#C0392B]">
          <span><b>{rejectedFile.name}</b> can&apos;t be uploaded — {rejectedFile.reason}</span>
          <button type="button" onClick={() => setRejectedFile(null)} aria-label="Dismiss" className="shrink-0 bg-transparent border-none cursor-pointer text-[#C0392B]"><X size={14} /></button>
        </div>
      ) : null}

      {openFolder && selectedIds.size > 0 ? (
        <BulkToolbar
          count={selectedIds.size}
          staffDirectory={staffDirectory}
          onClear={clearSelection}
          onBulkPermissionChange={async (updates) => { await Promise.all(Array.from(selectedIds).map((id) => onAssetPermissionChange(id, updates))); }}
          onMove={() => setMoveTargetAssetIds(Array.from(selectedIds))}
          onDelete={async () => { await Promise.all(Array.from(selectedIds).map((id) => onDeleteAsset(id))); clearSelection(); }}
        />
      ) : null}

      {!openFolder ? (
        currentLevelFolders.length === 0 ? (
          <EmptyPanel text="No folders yet — folders are created automatically per deliverable, or add your own." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
            {visibleFolders.map(renderFolderTile)}
            {!searchQuery && canEdit ? renderNewFolderTile() : null}
            {visibleFolders.length === 0 && searchQuery ? (
              <p className={cn("text-[12.5px] col-span-full text-center py-6", textMuted)}>No folders match &ldquo;{searchQuery}&rdquo;.</p>
            ) : null}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* Sub-folders (task 220) — folders inside the currently open folder, rendered above its
              files, matching ../_onboarding-wizard.tsx's Storage folder + KB grouping. */}
          {visibleFolders.length > 0 || (!searchQuery && canEdit) ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {visibleFolders.map(renderFolderTile)}
              {!searchQuery && canEdit ? renderNewFolderTile() : null}
            </div>
          ) : null}
          {visibleFolders.length === 0 && searchQuery && currentLevelFolders.length > 0 ? (
            <p className={cn("text-[12.5px] text-center", textMuted)}>No sub-folders match &ldquo;{searchQuery}&rdquo;.</p>
          ) : null}
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
                {visibleFiles.map(renderFileTile)}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleFiles.map(renderFileTile)}
              </div>
            )}
          </div>
        </div>
      )}

      {renameTarget ? (
        <RenameModal
          initialValue={renameTarget.name}
          kind={renameTarget.kind}
          onClose={() => setRenameTarget(null)}
          onSubmit={(value) => (renameTarget.kind === "folder" ? onRenameFolder(renameTarget.id, value) : onRenameAsset(renameTarget.id, value))}
        />
      ) : null}
      {moveTargetAssetIds ? (
        <MoveModal
          folders={folders}
          currentFolderId={openFolderId}
          onClose={() => setMoveTargetAssetIds(null)}
          onSubmit={async (folderId) => { await Promise.all(moveTargetAssetIds.map((id) => onMoveAsset(id, folderId))); clearSelection(); }}
        />
      ) : null}
      {duplicatePrompt ? (
        <DuplicateFolderModal
          name={duplicatePrompt.name}
          suggestedName={duplicatePrompt.suggested}
          onCancel={() => setDuplicatePrompt(null)}
          onConfirm={() => submitCreateFolder(duplicatePrompt.suggested)}
        />
      ) : null}
    </div>
  );
}
