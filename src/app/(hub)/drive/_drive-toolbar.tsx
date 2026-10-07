"use client";

import { Fragment, type RefObject } from "react";
import { ArrowUpDown, ChevronRight, CloudUpload, FolderPlus, FolderUp, LayoutGrid, List, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DriveFolder } from "@/lib/drive/types";
import { IconTip, textPrimary } from "./_reuse";
import type { DriveSort } from "./_use-drive-derived";

type Props = {
  rootLabel: string;
  chain: DriveFolder[];
  search: string;
  sort: DriveSort;
  viewMode: "grid" | "list";
  canWrite: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderInputRef: RefObject<HTMLInputElement | null>;
  onNavigate: (folderId: string | null) => void;
  onSearch: (v: string) => void;
  onToggleSort: () => void;
  onViewMode: (m: "grid" | "list") => void;
  onNewFolder: () => void;
  onFilesPicked: (files: FileList) => void;
  onFolderPicked: (files: FileList) => void;
};

const crumb = "cursor-pointer border-none bg-transparent px-0 font-medium text-[#5F6A88] transition-colors hover:text-[#007BFF]";
const ghost = "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3A4565] transition-colors hover:border-[#A8C6F5]";

// Task 436 — the Drive header row. Differs from Project Files' toolbar in three ways: the root crumb
// is the section name, uploads work at the root, and the single orange CTA is "Upload files".
export function DriveToolbar(p: Props) {
  const {
    rootLabel, chain, search, sort, viewMode, canWrite, fileInputRef, folderInputRef,
    onNavigate, onSearch, onToggleSort, onViewMode, onNewFolder, onFilesPicked, onFolderPicked,
  } = p;
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
      <nav aria-label="Folder path" className="flex min-w-[180px] flex-1 flex-wrap items-center gap-1.5 text-[13px]">
        <button type="button" onClick={() => onNavigate(null)} className={cn(crumb, chain.length === 0 && textPrimary)} aria-current={chain.length === 0 ? "page" : undefined}>
          {rootLabel}
        </button>
        {chain.map((c, i) => (
          <Fragment key={c.id}>
            <ChevronRight size={13} className="text-[#5F6A88]" aria-hidden />
            {i === chain.length - 1 ? (
              <span className={cn("font-medium", textPrimary)} aria-current="page">{c.name}</span>
            ) : (
              <button type="button" onClick={() => onNavigate(c.id)} className={crumb}>{c.name}</button>
            )}
          </Fragment>
        ))}
      </nav>

      <div className="relative w-48 shrink-0">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88]" aria-hidden />
        <input
          value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search this folder" aria-label="Search this folder"
          className="w-full rounded-full border border-[#E2E7F2] bg-[#F4F6FB] py-2 pl-8 pr-3 text-[12px] text-[#0B1533] outline-none transition-colors placeholder:text-[#5F6A88] focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
        />
      </div>
      <button type="button" onClick={onToggleSort} className={cn(ghost, "font-medium")}>
        <ArrowUpDown size={12} aria-hidden /> Sort: {sort === "newest" ? "Newest" : "Name"}
      </button>
      <div role="group" aria-label="Layout" className="flex shrink-0 items-center rounded-full border border-[#E2E7F2] bg-white p-0.5">
        {(["grid", "list"] as const).map((m) => (
          <IconTip key={m} label={m === "grid" ? "Grid view" : "List view"}>
            <button
              type="button" onClick={() => onViewMode(m)} aria-label={m === "grid" ? "Grid view" : "List view"} aria-pressed={viewMode === m}
              className={cn("cursor-pointer rounded-full border-none p-1.5 transition-colors", viewMode === m ? "bg-[#E5F1FF] text-[#007BFF]" : "bg-transparent text-[#5F6A88] hover:text-[#0B1533]")}
            >
              {m === "grid" ? <LayoutGrid size={14} /> : <List size={14} />}
            </button>
          </IconTip>
        ))}
      </div>

      {canWrite ? (
        <>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) onFilesPicked(e.target.files); e.target.value = ""; }} />
          {/* `webkitdirectory` isn't a typed JSX attribute, so it is set imperatively (task 372). */}
          <input
            ref={(el) => { if (el) el.webkitdirectory = true; folderInputRef.current = el; }}
            type="file" multiple className="hidden"
            onChange={(e) => { if (e.target.files && e.target.files.length > 0) onFolderPicked(e.target.files); e.target.value = ""; }}
          />
          <button type="button" onClick={onNewFolder} className={ghost}><FolderPlus size={13} aria-hidden /> New folder</button>
          <button type="button" onClick={() => folderInputRef.current?.click()} className={ghost}><FolderUp size={13} aria-hidden /> Upload folder</button>
          <button
            type="button" onClick={() => fileInputRef.current?.click()}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#FB914E] px-4 py-2 text-[12px] font-semibold text-[#471F02] transition-colors hover:bg-[#E2762F] hover:text-white"
          >
            <CloudUpload size={13} aria-hidden /> Upload files
          </button>
        </>
      ) : null}
    </div>
  );
}
