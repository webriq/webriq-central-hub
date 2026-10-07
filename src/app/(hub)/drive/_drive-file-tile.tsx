"use client";

import { FileText } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { DriveFile } from "@/lib/drive/types";
import { ActionsMenu, formatFileSize, textMuted, textPrimary, type ItemAction } from "./_reuse";
import { DriveThumb } from "./_drive-thumb";
import { PermissionChip, SharedChip } from "./_drive-chips";
import { SelectBox } from "./_select-box";
import { permissionLabel } from "./_drive-permissions";

type Props = {
  file: DriveFile;
  viewMode: "grid" | "list";
  showPermission: boolean;
  selected: boolean;
  anySelected: boolean;
  actions: ItemAction[];
  onOpen: () => void;
  onToggleSelect: () => void;
  onContextMenu: (e: React.MouseEvent, actions: ItemAction[]) => void;
};

const surface = (selected: boolean) =>
  selected ? "border-[#007BFF] bg-[#EAF2FF]" : "border-[#E2E7F2] bg-white hover:border-[#C7D2E8] hover:bg-[#F0F7FF]";

// Task 436 — a Drive file. Clicking the tile opens the preview (the Drive convention, unlike Project
// Files' click-to-select); selection is the checkbox. The same `actions` array drives the ⋯ menu and
// the right-click menu.
export function DriveFileTile({ file, viewMode, showPermission, selected, anySelected, actions, onOpen, onToggleSelect, onContextMenu }: Props) {
  const mime = file.file_mime_type ?? "";
  const chips = (
    <>
      {showPermission ? <PermissionChip label={permissionLabel(file.level)} /> : null}
      <SharedChip count={file.share_count} />
    </>
  );
  const open = (e: React.MouseEvent) => { e.preventDefault(); onContextMenu(e, actions); };

  if (viewMode === "list") {
    return (
      <div className="group/file relative">
        <SelectBox selected={selected} visible={anySelected} label={`Select ${file.file_name}`} onToggle={onToggleSelect}
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 group-hover/file:opacity-100" />
        <button
          type="button" onClick={onOpen} onContextMenu={open} aria-label={`Open ${file.file_name}`}
          className={cn("flex w-full cursor-pointer items-center gap-3 rounded-[10px] border py-2.5 pl-12 pr-11 text-left transition-colors duration-150", surface(selected))}
        >
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[8px]"><DriveThumb id={file.id} name={file.file_name} mime={mime} /></div>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-[12.5px] font-medium", textPrimary)} title={file.file_name}>{file.file_name}</p>
            <p className={cn("text-[10.5px] sm:hidden", textMuted)}>{formatFileSize(file.file_size)}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">{chips}</span>
          <span className={cn("hidden w-20 shrink-0 text-right font-mono text-[10.5px] sm:block", textMuted)}>{formatFileSize(file.file_size)}</span>
          <span className={cn("hidden w-24 shrink-0 text-right font-mono text-[10.5px] md:block", textMuted)}>{formatRelativeTime(file.created_at)}</span>
        </button>
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2"><ActionsMenu actions={actions} /></div>
      </div>
    );
  }

  return (
    <div className="group/file relative">
      <button
        type="button" onClick={onOpen} onContextMenu={open} aria-label={`Open ${file.file_name}`}
        className={cn("flex aspect-square w-full cursor-pointer flex-col overflow-hidden rounded-[14px] border text-left transition-colors duration-150", surface(selected))}
      >
        <div className="flex shrink-0 items-center gap-2 py-2 pl-10 pr-9">
          <span title={file.file_name} className={cn("flex-1 truncate text-[11px] font-medium", textPrimary)}>{file.file_name}</span>
        </div>
        <div className="mx-2 mb-2 min-h-0 flex-1 overflow-hidden rounded-md bg-[#F4F6FB]">
          <DriveThumb id={file.id} name={file.file_name} mime={mime} />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-1 px-2 pb-2">
          <span className={cn("font-mono text-[9.5px]", textMuted)}>{formatFileSize(file.file_size)}</span>
          <span className="flex items-center gap-1">{chips}</span>
        </div>
      </button>
      <span aria-hidden className={cn("pointer-events-none absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center text-[#007BFF] transition-opacity", (selected || anySelected) && "opacity-0", "group-hover/file:opacity-0")}>
        <FileText size={14} />
      </span>
      <SelectBox selected={selected} visible={anySelected} label={`Select ${file.file_name}`} onToggle={onToggleSelect} className="absolute left-2 top-2 group-hover/file:opacity-100" />
      <div className="absolute right-2 top-2"><ActionsMenu actions={actions} /></div>
    </div>
  );
}
