import { Download, ExternalLink, FolderInput, Link2, Pencil, Trash2, Users, FolderOpen } from "lucide-react";
import type { Caps } from "./_drive-permissions";
import { selectionDownloadAction, type ItemAction } from "./_reuse";

// Task 436 — one action list per item feeds BOTH the ⋯ menu and the right-click menu (same
// single-source rule as Project Files, so the two can never drift apart).
type Common = { caps: Caps; onShare: () => void; onRename: () => void; onDelete: () => void; onCopyLink: () => void; onDownload: () => void };
type Bulk = { selected: boolean; selectedCount: number; onDownloadSelected: () => void };

export function fileActions(c: Common & Bulk & { onOpen: () => void; onMove: () => void }): ItemAction[] {
  return [
    { label: "Open", icon: ExternalLink, onClick: c.onOpen },
    ...selectionDownloadAction(c.selected, c.selectedCount, c.onDownloadSelected),
    { label: "Download", icon: Download, onClick: c.onDownload },
    { label: "Copy link", icon: Link2, onClick: c.onCopyLink },
    ...(c.caps.share ? [{ label: "Share", icon: Users, onClick: c.onShare }] : []),
    ...(c.caps.rename ? [{ label: "Rename", icon: Pencil, onClick: c.onRename }] : []),
    ...(c.caps.move ? [{ label: "Move to folder", icon: FolderInput, onClick: c.onMove }] : []),
    ...(c.caps.remove ? [{ label: "Delete", icon: Trash2, onClick: c.onDelete, danger: true }] : []),
  ];
}

export function folderActions(c: Common & Bulk & { onOpen: () => void }): ItemAction[] {
  return [
    { label: "Open", icon: FolderOpen, onClick: c.onOpen },
    ...selectionDownloadAction(c.selected, c.selectedCount, c.onDownloadSelected),
    { label: "Download as .zip", icon: Download, onClick: c.onDownload },
    { label: "Copy link", icon: Link2, onClick: c.onCopyLink },
    ...(c.caps.share ? [{ label: "Share", icon: Users, onClick: c.onShare }] : []),
    ...(c.caps.rename ? [{ label: "Rename", icon: Pencil, onClick: c.onRename }] : []),
    ...(c.caps.remove ? [{ label: "Delete", icon: Trash2, onClick: c.onDelete, danger: true }] : []),
  ];
}
