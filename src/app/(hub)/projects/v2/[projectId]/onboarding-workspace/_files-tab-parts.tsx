"use client";

import { CloudUpload, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { textMuted } from "./_shared-ui";

// Task 359 — small presentational pieces extracted from _files-tab.tsx (537 lines, past the hard
// limit in nextjs-file-length-best-practices.md).

export function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 rounded-[10px] border-2 border-dashed border-[#E2E7F2] text-center px-6">
      <CloudUpload size={24} className="text-[#A8B3CC]" />
      <p className={cn("text-[12.5px] max-w-64", textMuted)}>{text}</p>
    </div>
  );
}

// Mockup 03's inline dashed "+ New folder" grid tile — replaces the old toolbar-button-reveals-
// an-inline-input-row pattern; the tile itself now toggles into the name input.
export function NewFolderTile({
  open, name, onOpen, onNameChange, onCreate, onCancel,
}: {
  open: boolean; name: string; onOpen: () => void; onNameChange: (v: string) => void; onCreate: () => void; onCancel: () => void;
}) {
  if (open) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-[#A8C6F5] bg-[#F0F7FF] p-4 min-h-26">
        <input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onCreate(); if (e.key === "Escape") onCancel(); }}
          onBlur={() => (name.trim() ? onCreate() : onCancel())}
          placeholder="Folder name"
          className="w-full text-[12.5px] text-[#0B1533] placeholder:text-[#5F6A88] rounded-[8px] border border-[#A8C6F5] bg-white px-2.5 py-2 outline-none text-center"
        />
        <p className={cn("text-[10.5px]", textMuted)}>Press Enter to save</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-[#A8C6F5] bg-[#F0F7FF] text-[#0063D6] font-semibold text-[12.5px] min-h-26 cursor-pointer hover:bg-[#E5F1FF] transition-colors"
    >
      <FolderPlus size={20} /> New folder
    </button>
  );
}
