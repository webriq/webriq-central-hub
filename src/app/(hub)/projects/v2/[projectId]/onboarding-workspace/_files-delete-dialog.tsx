"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AssetRow, AssetFolder } from "./_wizard-v2-types";
import { describeFolderContents } from "./_files-tab-parts";

export type PendingDelete =
  | { kind: "folder"; id: string; name: string }
  | { kind: "file"; id: string; name: string }
  | { kind: "bulk"; ids: string[] };

// Task 419 — moved verbatim out of _files-tab.tsx (the delete-confirmation copy + dialog) so that
// file shrinks instead of growing past the hard limit in nextjs-file-length-best-practices.md.
function deleteCopy(pending: PendingDelete | null, folders: AssetFolder[], assets: AssetRow[]) {
  if (!pending) return { title: "", body: "" };
  if (pending.kind === "folder") {
    const { folderCount, fileCount } = describeFolderContents(folders, assets, pending.id);
    const parts: string[] = [];
    if (folderCount > 0) parts.push(`${folderCount} sub-folder${folderCount === 1 ? "" : "s"}`);
    if (fileCount > 0) parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
    const body = parts.length > 0
      ? `This will permanently delete "${pending.name}" and everything inside it — ${parts.join(" and ")}.`
      : `This will permanently delete "${pending.name}".`;
    return { title: "Delete folder?", body };
  }
  if (pending.kind === "file") return { title: "Delete file?", body: `This will permanently delete "${pending.name}".` };
  return { title: "Delete files?", body: `This will permanently delete ${pending.ids.length} selected file${pending.ids.length === 1 ? "" : "s"}.` };
}

export function FilesDeleteDialog({
  pending, deleting, folders, assets, onConfirm, onCancel,
}: {
  pending: PendingDelete | null; deleting: boolean; folders: AssetFolder[]; assets: AssetRow[];
  onConfirm: () => void; onCancel: () => void;
}) {
  const { title, body } = deleteCopy(pending, folders, assets);
  return (
    <ConfirmDialog
      open={pending !== null}
      title={title}
      body={body}
      confirmLabel={deleting ? "Deleting…" : "Delete"}
      confirmDisabled={deleting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
