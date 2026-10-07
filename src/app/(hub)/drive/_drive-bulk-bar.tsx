import { Download, FolderInput, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { textMuted } from "./_reuse";

type Props = {
  count: number;
  downloading: boolean;
  canMove: boolean;
  canDelete: boolean;
  canSelectAll: boolean;
  onClear: () => void;
  onSelectAll: () => void;
  onDownload: () => void;
  onMove: () => void;
  onDelete: () => void;
};

const btn = "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3A4565] transition-colors hover:border-[#A8C6F5] disabled:cursor-not-allowed disabled:opacity-45";

// Task 436 — bulk actions for the current selection. Move/Delete only appear when every selected item
// permits them (a mixed selection of owned + view-only items can't be moved or deleted as a whole).
export function DriveBulkBar(p: Props) {
  return (
    <div role="toolbar" aria-label="Selection actions" className="mb-3.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-[#007BFF]/30 bg-[#EAF2FF] px-3.5 py-2">
      <span className="text-[12.5px] font-semibold text-[#0B1533]"><span className="font-mono">{p.count}</span> selected</span>
      {p.canSelectAll ? <button type="button" onClick={p.onSelectAll} className="cursor-pointer border-none bg-transparent px-1 text-[12px] font-semibold text-[#0063D6] hover:underline">Select all</button> : null}
      <span className="flex-1" />
      <button type="button" onClick={p.onDownload} disabled={p.downloading} className={btn}><Download size={13} aria-hidden /> {p.downloading ? "Preparing…" : "Download .zip"}</button>
      {p.canMove ? <button type="button" onClick={p.onMove} className={btn}><FolderInput size={13} aria-hidden /> Move</button> : null}
      {p.canDelete ? (
        <button type="button" onClick={p.onDelete} className={cn(btn, "text-[#C0392B] hover:border-[#C0392B]/40")}><Trash2 size={13} aria-hidden /> Delete</button>
      ) : null}
      <button type="button" onClick={p.onClear} aria-label="Clear selection" className={cn("cursor-pointer rounded-md border-none bg-transparent p-1.5 transition-colors hover:bg-[#5F6A88]/10", textMuted)}><X size={14} /></button>
    </div>
  );
}
