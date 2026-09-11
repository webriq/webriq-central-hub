"use client";

import { Fragment, type RefObject } from "react";
import { ChevronRight, LayoutGrid, List, CircleQuestionMark, Search, ArrowUpDown, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetFolder } from "./_wizard-v2-types";
import { textPrimary, IconTip } from "./_shared-ui";

// Task 359 — the Files tab's header row, extracted from _files-tab.tsx (537 lines, past the hard
// limit in nextjs-file-length-best-practices.md). The hidden file <input> stays owned by the
// parent (via `fileInputRef`) because the empty-folder UploadDropzone's "browse" link also
// triggers it.
export function FilesToolbar({
  breadcrumbChain, openFolder, openFolderId, canEdit, searchQuery, sortBy, viewMode,
  fileInputRef, onOpenFolder, onSearchChange, onToggleSort, onViewModeChange, onFilesPicked,
}: {
  breadcrumbChain: AssetFolder[];
  openFolder: AssetFolder | null;
  openFolderId: string | null;
  canEdit: boolean;
  searchQuery: string;
  sortBy: "newest" | "name";
  viewMode: "grid" | "list";
  fileInputRef: RefObject<HTMLInputElement | null>;
  onOpenFolder: (id: string | null) => void;
  onSearchChange: (value: string) => void;
  onToggleSort: () => void;
  onViewModeChange: (mode: "grid" | "list") => void;
  onFilesPicked: (files: FileList, targetFolderId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3.5 flex-wrap">
      <div className="flex items-center gap-1.5 text-[13px] flex-1 min-w-[180px] flex-wrap">
        <button type="button" onClick={() => onOpenFolder(null)} className={cn("cursor-pointer border-none bg-transparent px-0 font-medium", breadcrumbChain.length > 0 ? "text-[#5F6A88] hover:text-[#007BFF]" : textPrimary)}>
          Files
        </button>
        {breadcrumbChain.map((crumb, i) => {
          const isLast = i === breadcrumbChain.length - 1;
          return (
            <Fragment key={crumb.id}>
              <ChevronRight size={13} className="text-[#5F6A88]" />
              {isLast ? (
                <span className={cn("font-medium", textPrimary)}>{crumb.name}</span>
              ) : (
                <button type="button" onClick={() => onOpenFolder(crumb.id)} className="cursor-pointer border-none bg-transparent px-0 font-medium text-[#5F6A88] hover:text-[#007BFF]">
                  {crumb.name}
                </button>
              )}
            </Fragment>
          );
        })}
        <IconTip label="This area is a drag-and-drop zone — open a folder, then drop files anywhere in it to upload. Right-click a file or folder for more actions.">
          <span className="inline-flex text-[#A8B3CC] cursor-help"><CircleQuestionMark size={14} /></span>
        </IconTip>
      </div>
      <div className="relative w-44 shrink-0">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={openFolder ? "Search files & folders" : "Search folders"}
          className="w-full text-[12px] text-[#0B1533] placeholder:text-[#5F6A88] rounded-full border border-[#E2E7F2] bg-[#F4F6FB] pl-8 pr-3 py-2 outline-none transition-colors focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
        />
      </div>
      <button
        type="button"
        onClick={onToggleSort}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-[#E2E7F2] bg-white text-[#3A4565] cursor-pointer hover:border-[#A8C6F5] transition-colors shrink-0"
      >
        <ArrowUpDown size={12} /> Sort: {sortBy === "newest" ? "Newest" : "Name"}
      </button>
      {openFolder ? (
        <div className="flex items-center rounded-full border border-[#E2E7F2] bg-white p-0.5 shrink-0">
          <IconTip label="Grid view">
            <button type="button" onClick={() => onViewModeChange("grid")} aria-label="Grid view" aria-pressed={viewMode === "grid"} className={cn("p-1.5 rounded-full cursor-pointer border-none transition-colors", viewMode === "grid" ? "bg-[#E5F1FF] text-[#007BFF]" : "bg-transparent text-[#5F6A88]")}>
              <LayoutGrid size={14} />
            </button>
          </IconTip>
          <IconTip label="List view">
            <button type="button" onClick={() => onViewModeChange("list")} aria-label="List view" aria-pressed={viewMode === "list"} className={cn("p-1.5 rounded-full cursor-pointer border-none transition-colors", viewMode === "list" ? "bg-[#E5F1FF] text-[#007BFF]" : "bg-transparent text-[#5F6A88]")}>
              <List size={14} />
            </button>
          </IconTip>
        </div>
      ) : null}
      {openFolder && canEdit ? (
        <>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) onFilesPicked(e.target.files, openFolderId!); }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#007BFF] text-white cursor-pointer border-none hover:bg-[#0063D6] transition-colors shrink-0">
            <CloudUpload size={13} /> Upload
          </button>
        </>
      ) : null}
    </div>
  );
}
