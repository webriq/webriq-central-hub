"use client";

import { useState } from "react";
import { Folder, Trash2, Pencil, Lock, AlertTriangle, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetFolder, StaffPerson } from "./_wizard-v2-types";
import { textPrimary, textMuted, IconTip } from "./_shared-ui";
import { InlinePermissionsPanel } from "./_permission-picker";
import { ActionsMenu, ItemAction } from "./_file-actions-menu";

// Task 359 — extracted from _file-tile.tsx (over the hard line limit) and given the optional
// "Copy Folder URL" action. `onCopyFolderUrl` is optional on purpose: the Onboarding Workspace
// renders this same tile through its own Files tab and has a separate name-path URL scheme
// (_workspace-url-params.ts), so it simply doesn't pass the callback and the entry never appears.
export function FolderTile({
  folder, fileCount, canEdit, onOpen, onPermissionChange, staffDirectory, onRename, onDelete,
  isDropTarget, onDragOverTile, onDragLeaveTile, onDropTile, onContextMenu, duplicateWarning,
  onCopyFolderUrl,
}: {
  folder: AssetFolder; fileCount: number; canEdit: boolean; onOpen: () => void;
  onPermissionChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  staffDirectory: StaffPerson[];
  onRename: () => void;
  onDelete: () => void;
  isDropTarget: boolean;
  onDragOverTile: (e: React.DragEvent) => void;
  onDragLeaveTile: (e: React.DragEvent) => void;
  onDropTile: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent, actions: ItemAction[]) => void;
  // Mockup 03 — case-insensitive sibling name collision (display-only; the create-folder API
  // already blocks new duplicates, so this only ever surfaces legacy/raced data).
  duplicateWarning?: boolean;
  // Task 359 — omitted by the Onboarding Workspace; see the note above.
  onCopyFolderUrl?: () => void;
}) {
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  // Copy sits first: it's the only entry every role can always use, and grouping it above the
  // permission/edit actions matches the read-then-write order the file kebab already uses.
  const actions: ItemAction[] = [
    ...(onCopyFolderUrl ? [{ label: "Copy Folder URL", icon: Link2, onClick: onCopyFolderUrl }] : []),
    { label: "Permissions", icon: Lock, onClick: () => setPermissionsOpen((v) => !v), disabled: !canEdit },
    ...(folder.is_system ? [] : [
      { label: "Rename", icon: Pencil, onClick: onRename },
      { label: "Delete", icon: Trash2, onClick: onDelete, danger: true },
    ]),
  ];

  return (
    <div>
      <div
        onDragOver={onDragOverTile}
        onDragLeave={onDragLeaveTile}
        onDrop={onDropTile}
        className="relative"
      >
        <button
          type="button"
          onClick={onOpen}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, actions); }}
          className={cn(
            "w-full flex flex-col items-start gap-3 p-5 text-left rounded-[14px] border cursor-pointer transition-colors duration-150",
            isDropTarget ? "border-[#007BFF] bg-[#EAF2FF]" : duplicateWarning ? "border-[#8A5A00] bg-white hover:bg-[#F4F8FF]" : "border-[#E2E7F2] bg-white hover:bg-[#F4F8FF] hover:border-[#C7D2E8]"
          )}
        >
          <div className="w-12 h-12 rounded-[10px] bg-[#E5F1FF] flex items-center justify-center">
            <Folder size={22} className="text-[#007BFF]" />
          </div>
          <div className="min-w-0 w-full">
            <p className={cn("text-[13.5px] font-semibold truncate", textPrimary)} title={folder.name}>{folder.name}</p>
            <p className={cn("text-[11px]", textMuted)}>{fileCount} {fileCount === 1 ? "file" : "files"}</p>
          </div>
        </button>
        {/* Task 220 — warning moved from an inline pill (which made duplicate-name tiles taller
            than their siblings) to a tooltip icon beside the kebab, so every tile stays the same height. */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {duplicateWarning ? (
            <IconTip label="Same name as another folder">
              <span className="inline-flex text-[#8A5A00] cursor-help p-1"><AlertTriangle size={12} /></span>
            </IconTip>
          ) : null}
          <ActionsMenu actions={actions} />
        </div>
      </div>
      {permissionsOpen ? (
        <InlinePermissionsPanel
          allowedRoles={folder.allowed_roles}
          allowedUserIds={folder.allowed_user_ids}
          staffDirectory={staffDirectory}
          onChange={onPermissionChange}
          onClose={() => setPermissionsOpen(false)}
        />
      ) : null}
    </div>
  );
}
