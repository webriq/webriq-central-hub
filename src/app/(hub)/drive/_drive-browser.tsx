"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { DriveFile, DriveFolder, DrivePerson, DriveView } from "@/lib/drive/types";
import { DRIVE_SECTIONS } from "@/config/constants";
import { DriveBulkBar } from "./_drive-bulk-bar";
import { DriveContent } from "./_drive-content";
import { DriveSkeleton, LoadError } from "./_drive-empty";
import { DriveFileTile } from "./_drive-file-tile";
import { DriveFolderTile } from "./_drive-folder-tile";
import { buildMoveTargets, type MoveTarget } from "./_drive-move-modal";
import { DriveOverlays, type PendingDelete, type RenameTarget } from "./_drive-overlays";
import { fileActions, folderActions } from "./_drive-actions";
import { fileCaps, folderCaps } from "./_drive-permissions";
import { DriveToolbar } from "./_drive-toolbar";
import { buildTreeFromRelativePaths, clampMenuPosition, NewFolderTile, UploadQueuePanel, useFilesSelection, textMuted, type ItemAction } from "./_reuse";
import type { ShareTarget } from "./_use-drive-shares";
import { useDriveBulkDownload } from "./_use-drive-bulk-download";
import { useDriveData } from "./_use-drive-data";
import { useDriveDeeplink } from "./_use-drive-deeplink";
import { useDriveDerived, type DriveSort } from "./_use-drive-derived";
import { useDriveMutations } from "./_use-drive-mutations";
import { useDriveUploadFlow } from "./_use-drive-upload-flow";
import { cn } from "@/lib/utils";

type Props = { view: DriveView; people: DrivePerson[]; initialFolderId: string | null; initialFileId: string | null; onRetry: () => void };

// Task 436 — one Drive section (My Files or Shared with me). Pure composition: data, URL state,
// derivation, uploads, selection and mutations each live in their own hook; every dialog lives in
// DriveOverlays. The shell keys this component by `view`, so switching sections remounts it.
export function DriveBrowser({ view, people, initialFolderId, initialFileId, onRetry }: Props) {
  const { loading, error, folders, files, me, setFolders, setFiles } = useDriveData(view);
  const mut = useDriveMutations({ folders, setFolders, setFiles });
  const link = useDriveDeeplink({ initialView: view, initialFolderId, initialFileId, loading, folders, files });
  const { openFolderId } = link;

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DriveSort>("newest");
  const d = useDriveDerived({ view, folders, files, openFolderId, search, sort });

  const canWrite = view === "mine" || (!!d.openFolder && d.openFolder.level >= 2);
  const upload = useDriveUploadFlow({ folders, canWrite, uploadFile: mut.uploadFile, createFolder: mut.createFolder });
  const sel = useFilesSelection(openFolderId);
  const { downloading, download } = useDriveBulkDownload();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: ItemAction[] } | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [moveTargets, setMoveTargets] = useState<{ ids: string[]; targets: MoveTarget[] } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [autoPreviewDone, setAutoPreviewDone] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dupe, setDupe] = useState<{ name: string; suggested: string } | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  if (loading) return <DriveSkeleton />;
  if (error || !me) return <LoadError message={error ?? "Try again in a moment."} onRetry={onRetry} />;

  const meId = me.id;
  const rootLabel = DRIVE_SECTIONS.find((s) => s.id === view)!.label;
  const selectedCount = sel.selectedIds.size + sel.selectedFolderIds.size;
  const downloadSelection = () => download({ fileIds: [...sel.selectedIds], folderIds: [...sel.selectedFolderIds] });
  const openMenu = (e: React.MouseEvent, actions: ItemAction[]) => setContextMenu({ ...clampMenuPosition({ x: e.clientX, y: e.clientY }, actions.length), actions });
  const previewFile = files.find((f) => f.id === (previewId ?? (autoPreviewDone ? null : link.previewFileId))) ?? null;

  const openMove = (ids: string[]) => {
    const owner = files.find((f) => f.id === ids[0])?.owner_id ?? meId;
    const targets = buildMoveTargets({ folders, allowed: (f) => f.owner_id === owner && f.level >= 2, excludeId: openFolderId, canMoveToRoot: owner === meId, rootLabel });
    setMoveTargets({ ids, targets });
  };

  const createInOpenFolder = async (finalName?: string) => {
    const name = (finalName ?? newFolderName).trim();
    if (!name) return;
    const siblings = d.levelFolders.map((f) => f.name);
    if (!finalName && siblings.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
      let n = 1;
      while (siblings.some((s) => s.trim().toLowerCase() === `${name} (${n})`.toLowerCase())) n += 1;
      setDupe({ name, suggested: `${name} (${n})` });
      return;
    }
    await mut.createFolder(name, openFolderId);
    setNewFolderName(""); setNewFolderOpen(false); setDupe(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      for (const id of pendingDelete.folderIds) await mut.deleteFolder(id);
      for (const id of pendingDelete.fileIds) await mut.deleteFile(id);
      sel.clear();
    } finally { setDeleting(false); setPendingDelete(null); }
  };

  const selectedFiles = files.filter((f) => sel.selectedIds.has(f.id));
  const selectedFolders = folders.filter((f) => sel.selectedFolderIds.has(f.id));
  const bulkDelete = () => setPendingDelete({ fileIds: [...sel.selectedIds], folderIds: [...sel.selectedFolderIds], name: "", fileCount: 0 });

  const renderFolder = (f: DriveFolder) => {
    const itemCount = d.itemCountByFolder.get(f.id) ?? 0;
    const actions = folderActions({
      caps: folderCaps(f, d.foldersById, meId), selected: sel.selectedFolderIds.has(f.id), selectedCount, onDownloadSelected: downloadSelection,
      onOpen: () => link.navigate(f.id, view), onCopyLink: () => link.copyLink(view, { folderId: f.id }),
      onDownload: () => download({ fileIds: [], folderIds: [f.id], label: f.name }),
      onShare: () => setShareTarget({ kind: "folder", id: f.id, name: f.name }),
      onRename: () => setRenameTarget({ kind: "folder", id: f.id, name: f.name }),
      onDelete: () => setPendingDelete({ fileIds: [], folderIds: [f.id], name: f.name, fileCount: itemCount }),
    });
    const dropInto = f.level >= 2;
    return (
      <DriveFolderTile
        key={f.id} folder={f} itemCount={itemCount} showPermission={view === "shared" && f.is_shared_root} actions={actions}
        selected={sel.selectedFolderIds.has(f.id)} anySelected={selectedCount > 0} isDropTarget={dragOverFolderId === f.id}
        onOpen={() => link.navigate(f.id, view)} onToggleSelect={() => sel.toggleFolder(f.id)} onContextMenu={openMenu}
        onDragOverTile={(e) => { e.preventDefault(); e.stopPropagation(); if (dropInto) setDragOverFolderId(f.id); }}
        onDragLeaveTile={(e) => { e.stopPropagation(); setDragOverFolderId((id) => (id === f.id ? null : id)); }}
        onDropTile={(e) => { e.stopPropagation(); setDragOverFolderId(null); if (dropInto) void upload.handleDrop(e, f.id); else e.preventDefault(); }}
      />
    );
  };

  const renderFile = (f: DriveFile) => {
    const actions = fileActions({
      caps: fileCaps(f, d.foldersById, meId), selected: sel.selectedIds.has(f.id), selectedCount, onDownloadSelected: downloadSelection,
      onOpen: () => setPreviewId(f.id), onCopyLink: () => link.copyLink(view, { fileId: f.id }),
      onDownload: () => download({ fileIds: [f.id], folderIds: [] }),
      onShare: () => setShareTarget({ kind: "file", id: f.id, name: f.file_name }),
      onRename: () => setRenameTarget({ kind: "file", id: f.id, name: f.file_name }),
      onMove: () => openMove([f.id]),
      onDelete: () => setPendingDelete({ fileIds: [f.id], folderIds: [], name: f.file_name, fileCount: 0 }),
    });
    return (
      <DriveFileTile
        key={f.id} file={f} viewMode={viewMode} showPermission={view === "shared" && f.is_shared_root} actions={actions}
        selected={sel.selectedIds.has(f.id)} anySelected={selectedCount > 0}
        onOpen={() => setPreviewId(f.id)} onToggleSelect={() => sel.toggleFile(f.id)} onContextMenu={openMenu}
      />
    );
  };

  return (
    <div onClick={() => setContextMenu(null)}>
      <DriveToolbar
        rootLabel={rootLabel} chain={d.breadcrumbChain} search={search} sort={sort} viewMode={viewMode} canWrite={canWrite}
        fileInputRef={fileInputRef} folderInputRef={folderInputRef}
        onNavigate={(id) => link.navigate(id, view)} onSearch={setSearch} onToggleSort={() => setSort((s) => (s === "newest" ? "name" : "newest"))}
        onViewMode={setViewMode} onNewFolder={() => setNewFolderOpen(true)}
        onFilesPicked={(list) => upload.uploadFiles(list, openFolderId)}
        onFolderPicked={(list) => void upload.uploadTrees(buildTreeFromRelativePaths(list), openFolderId)}
      />
      {upload.preparing ? <p className={cn("mb-3 text-[12px]", textMuted)}>Preparing folders…</p> : null}
      <UploadQueuePanel items={upload.items} onRetry={upload.retry} onDismiss={upload.dismiss} />
      {upload.rejected ? (
        <div role="alert" className="mb-3.5 flex items-center justify-between gap-3 rounded-[10px] border border-[#C0392B]/20 bg-[#FDE8E6] px-3.5 py-2.5 text-[12px] text-[#C0392B]">
          <span><b>{upload.rejected.name}</b> can&apos;t be uploaded — {upload.rejected.reason}</span>
          <button type="button" onClick={upload.clearRejected} aria-label="Dismiss" className="shrink-0 cursor-pointer border-none bg-transparent text-[#C0392B]"><X size={14} /></button>
        </div>
      ) : null}
      {sel.hasSelection ? (
        <DriveBulkBar
          count={selectedCount} downloading={downloading}
          canMove={selectedFolders.length === 0 && selectedFiles.length > 0 && selectedFiles.every((f) => fileCaps(f, d.foldersById, meId).move)}
          canDelete={selectedFiles.every((f) => fileCaps(f, d.foldersById, meId).remove) && selectedFolders.every((f) => folderCaps(f, d.foldersById, meId).remove)}
          canSelectAll={selectedCount < d.visibleFiles.length + d.visibleFolders.length}
          onClear={sel.clear} onSelectAll={() => sel.selectAll(d.visibleFiles.map((f) => f.id), d.visibleFolders.map((f) => f.id))}
          onDownload={downloadSelection} onMove={() => openMove([...sel.selectedIds])} onDelete={bulkDelete}
        />
      ) : null}
      <DriveContent
        view={view} atSharedRoot={d.atSharedRoot} atRoot={!openFolderId} canWrite={canWrite} search={search} viewMode={viewMode}
        total={d.levelFolders.length + d.levelFiles.length} newFolderOpen={newFolderOpen}
        folders={d.visibleFolders} files={d.visibleFiles} people={people} renderFolder={renderFolder} renderFile={renderFile}
        onChoose={() => fileInputRef.current?.click()} onDrop={(e) => void upload.handleDrop(e, openFolderId)}
        newFolderTile={
          <NewFolderTile
            open={newFolderOpen} name={newFolderName} onOpen={() => setNewFolderOpen(true)} onNameChange={setNewFolderName}
            onCreate={() => void createInOpenFolder()} onCancel={() => { setNewFolderOpen(false); setNewFolderName(""); setDupe(null); }}
          />
        }
      />
      <DriveOverlays
        contextMenu={contextMenu} onCloseContextMenu={() => setContextMenu(null)}
        renameTarget={renameTarget} onCloseRename={() => setRenameTarget(null)}
        onRename={(t, v) => (t.kind === "folder" ? mut.renameFolder(t.id, v) : mut.renameFile(t.id, v))}
        moveTargets={moveTargets?.targets ?? null} onCloseMove={() => setMoveTargets(null)}
        onMove={async (folderId) => { for (const id of moveTargets?.ids ?? []) await mut.moveFile(id, folderId); sel.clear(); }}
        pendingDelete={pendingDelete} deleting={deleting} onConfirmDelete={() => void confirmDelete()} onCancelDelete={() => setPendingDelete(null)}
        shareTarget={shareTarget} people={people} meId={meId} onCloseShare={() => setShareTarget(null)}
        onShareCountChange={(n) => shareTarget && mut.setShareCount(shareTarget.kind, shareTarget.id, n)}
        previewFile={previewFile} onClosePreview={() => { setPreviewId(null); setAutoPreviewDone(true); }}
        duplicatePrompt={dupe} onConfirmDuplicate={() => createInOpenFolder(dupe?.suggested)} onCancelDuplicate={() => setDupe(null)}
      />
    </div>
  );
}
