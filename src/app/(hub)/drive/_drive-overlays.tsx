"use client";

import type { DriveFile, DrivePerson } from "@/lib/drive/types";
import { ActionsMenuItems, ConfirmDialog, DuplicateFolderModal, RenameModal, type ItemAction } from "./_reuse";
import { DriveMoveModal, type MoveTarget } from "./_drive-move-modal";
import { DrivePreview } from "./_drive-preview";
import { ShareDialog } from "./_share-dialog";
import type { ShareTarget } from "./_use-drive-shares";

export type RenameTarget = { kind: "file" | "folder"; id: string; name: string };
export type PendingDelete = { fileIds: string[]; folderIds: string[]; name: string; fileCount: number };

type Props = {
  contextMenu: { x: number; y: number; actions: ItemAction[] } | null;
  onCloseContextMenu: () => void;
  renameTarget: RenameTarget | null;
  onRename: (t: RenameTarget, value: string) => Promise<boolean>;
  onCloseRename: () => void;
  moveTargets: MoveTarget[] | null;
  onMove: (folderId: string | null) => Promise<void>;
  onCloseMove: () => void;
  pendingDelete: PendingDelete | null;
  deleting: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  shareTarget: ShareTarget | null;
  people: DrivePerson[];
  meId: string;
  onShareCountChange: (count: number) => void;
  onCloseShare: () => void;
  previewFile: DriveFile | null;
  onClosePreview: () => void;
  duplicatePrompt: { name: string; suggested: string } | null;
  onConfirmDuplicate: () => Promise<void>;
  onCancelDuplicate: () => void;
};

function deleteCopy(d: PendingDelete): { title: string; body: string; confirm: string } {
  const items = d.fileIds.length + d.folderIds.length;
  if (items === 1 && d.folderIds.length === 1) {
    const inside = d.fileCount > 0 ? ` and its ${d.fileCount} ${d.fileCount === 1 ? "file" : "files"}` : "";
    return { title: "Delete folder?", body: `Delete “${d.name}”${inside}? This can't be undone.`, confirm: "Delete folder" };
  }
  if (items === 1) return { title: "Delete file?", body: `Delete “${d.name}”? This can't be undone.`, confirm: "Delete file" };
  return { title: `Delete ${items} items?`, body: "Selected files and folders (with everything inside) will be permanently deleted. This can't be undone.", confirm: "Delete items" };
}

// Task 436 — every floating layer of the browser in one place, so DriveBrowser stays composition.
export function DriveOverlays(p: Props) {
  const copy = p.pendingDelete ? deleteCopy(p.pendingDelete) : null;
  return (
    <>
      {p.contextMenu ? (
        <>
          <div className="fixed inset-0 z-40" onClick={p.onCloseContextMenu} onContextMenu={(e) => { e.preventDefault(); p.onCloseContextMenu(); }} />
          <div
            className="fixed z-50 flex w-44 flex-col rounded-lg border border-[#E2E7F2] bg-white py-1 shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
            // Cursor-anchored position is a computed pixel value Tailwind can't express statically.
            style={{ left: p.contextMenu.x, top: p.contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <ActionsMenuItems actions={p.contextMenu.actions} onDone={p.onCloseContextMenu} />
          </div>
        </>
      ) : null}
      {p.renameTarget ? (
        <RenameModal initialValue={p.renameTarget.name} kind={p.renameTarget.kind} onClose={p.onCloseRename} onSubmit={(v) => p.onRename(p.renameTarget!, v)} />
      ) : null}
      {p.moveTargets ? <DriveMoveModal targets={p.moveTargets} onClose={p.onCloseMove} onSubmit={p.onMove} /> : null}
      {p.duplicatePrompt ? (
        <DuplicateFolderModal name={p.duplicatePrompt.name} suggestedName={p.duplicatePrompt.suggested} onCancel={p.onCancelDuplicate} onConfirm={p.onConfirmDuplicate} />
      ) : null}
      <ConfirmDialog
        open={!!p.pendingDelete} title={copy?.title ?? ""} body={copy?.body ?? ""}
        confirmLabel={p.deleting ? "Deleting…" : copy?.confirm ?? "Delete"} confirmDisabled={p.deleting}
        onConfirm={p.onConfirmDelete} onCancel={p.onCancelDelete}
      />
      {p.shareTarget ? (
        <ShareDialog target={p.shareTarget} people={p.people} meId={p.meId} onClose={p.onCloseShare} onCountChange={p.onShareCountChange} />
      ) : null}
      {p.previewFile ? <DrivePreview file={p.previewFile} onClose={p.onClosePreview} /> : null}
    </>
  );
}

