"use client";

import { Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DriveFolder } from "@/lib/drive/types";
import { ActionsMenu, textMuted, textPrimary, type ItemAction } from "./_reuse";
import { PermissionChip, SharedChip } from "./_drive-chips";
import { SelectBox } from "./_select-box";
import { permissionLabel } from "./_drive-permissions";

type Props = {
  folder: DriveFolder;
  itemCount: number;
  showPermission: boolean;
  selected: boolean;
  anySelected: boolean;
  isDropTarget: boolean;
  actions: ItemAction[];
  onOpen: () => void;
  onToggleSelect: () => void;
  onDragOverTile: (e: React.DragEvent) => void;
  onDragLeaveTile: (e: React.DragEvent) => void;
  onDropTile: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent, actions: ItemAction[]) => void;
};

// Task 436 — a Drive folder tile. Drive-specific twin of Project Files' FolderTile: no
// customer-asset permission picker (sharing is the Share dialog), a permission chip on shared
// roots, and a shared-count chip on the owner's own folders.
export function DriveFolderTile({
  folder, itemCount, showPermission, selected, anySelected, isDropTarget, actions,
  onOpen, onToggleSelect, onDragOverTile, onDragLeaveTile, onDropTile, onContextMenu,
}: Props) {
  return (
    <div onDragOver={onDragOverTile} onDragLeave={onDragLeaveTile} onDrop={onDropTile} className="group/folder relative">
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, actions); }}
        aria-label={`Open folder ${folder.name}, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
        className={cn(
          "flex w-full cursor-pointer flex-col items-start gap-3 rounded-[14px] border p-5 text-left transition-colors duration-150",
          isDropTarget || selected ? "border-[#007BFF] bg-[#EAF2FF]" : "border-[#E2E7F2] bg-white hover:border-[#C7D2E8] hover:bg-[#F0F7FF]",
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#E5F1FF]">
          <Folder size={22} className="text-[#007BFF]" />
        </div>
        <div className="w-full min-w-0">
          <p className={cn("truncate text-[13.5px] font-semibold", textPrimary)} title={folder.name}>{folder.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("text-[11px]", textMuted)}>
              <span className="font-mono">{itemCount}</span> {itemCount === 1 ? "file" : "files"}
            </span>
            {showPermission ? <PermissionChip label={permissionLabel(folder.level)} /> : null}
            <SharedChip count={folder.share_count} />
          </div>
        </div>
      </button>
      <SelectBox
        selected={selected} visible={anySelected} label={`Select ${folder.name}`} onToggle={onToggleSelect}
        className="absolute left-2 top-2 group-hover/folder:opacity-100"
      />
      <div className="absolute right-2 top-2"><ActionsMenu actions={actions} /></div>
    </div>
  );
}
