"use client";

import { useState } from "react";
import { X, FolderInput, Trash2, Loader2, Download, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaffPerson } from "./_wizard-v2-types";
import { textPrimary, textMuted, IconTip } from "./_shared-ui";
import { PermissionPicker } from "./_permission-picker";

// Multi-select action bar for the Files tab — mirrors ../_onboarding-wizard.tsx's
// StorageFileExplorer selection bar (Share/Move/Delete over `selectedIds`), rebuilt fresh here.
// Bulk share starts from an empty role/person set each time it opens (same as the original) and
// every toggle fans out immediately to all selected files.
//
// Task 419 — adds Download (files and/or folders → zip) and Select all. Share/Move/Delete stay
// files-only: they are hidden whenever the selection contains a folder, so no new destructive
// bulk behaviour exists for folders (their permissions/delete live on the folder's own kebab).
export function BulkToolbar({
  fileCount, folderCount, staffDirectory, downloading, canSelectAll,
  onClear, onSelectAll, onDownload, onBulkPermissionChange, onMove, onDelete,
}: {
  fileCount: number;
  folderCount: number;
  staffDirectory: StaffPerson[];
  downloading: boolean;
  canSelectAll: boolean;
  onClear: () => void;
  onSelectAll: () => void;
  onDownload: () => void;
  onBulkPermissionChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => Promise<void>;
  onMove: () => void;
  onDelete: () => void;
}) {
  const [bulkRoles, setBulkRoles] = useState<string[]>([]);
  const [bulkUserIds, setBulkUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const filesOnly = folderCount === 0;

  const applyBulk = async (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => {
    if (updates.allowed_roles !== undefined) setBulkRoles(updates.allowed_roles);
    if (updates.allowed_user_ids !== undefined) setBulkUserIds(updates.allowed_user_ids);
    setBusy(true);
    try {
      await onBulkPermissionChange(updates);
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  const parts = [
    fileCount > 0 ? `${fileCount} ${fileCount === 1 ? "file" : "files"}` : "",
    folderCount > 0 ? `${folderCount} ${folderCount === 1 ? "folder" : "folders"}` : "",
  ].filter(Boolean);
  const iconBtn = "p-2 rounded-md cursor-pointer border-none bg-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center gap-1 p-2 rounded-[10px] mb-3 bg-[#EDF0F7]">
      <IconTip label="Clear selection">
        <button type="button" onClick={onClear} aria-label="Clear selection" className={cn(iconBtn, "hover:bg-[#E2E7F2]", textMuted)}>
          <X size={14} />
        </button>
      </IconTip>
      <span aria-live="polite" className={cn("text-[12px] font-medium mr-1", textPrimary)}>{parts.join(", ")} selected</span>
      {canSelectAll ? (
        <button type="button" onClick={onSelectAll} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium cursor-pointer border-none bg-transparent text-[#007BFF] hover:bg-[#E2E7F2] transition-colors">
          <CheckCheck size={13} /> Select all
        </button>
      ) : null}
      <div className="flex-1" />
      {busy && <Loader2 size={14} className="animate-spin text-[#5F6A88]" />}
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#007BFF] text-white cursor-pointer border-none hover:bg-[#0063D6] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        {downloading ? "Downloading…" : "Download"}
      </button>
      {filesOnly ? (
        <>
          <PermissionPicker allowedRoles={bulkRoles} allowedUserIds={bulkUserIds} staffDirectory={staffDirectory} onChange={applyBulk} triggerLabel="Share" />
          <IconTip label="Move to folder">
            <button type="button" onClick={onMove} disabled={busy} aria-label="Move to folder" className={cn(iconBtn, textMuted, "hover:bg-[#E2E7F2]")}>
              <FolderInput size={14} />
            </button>
          </IconTip>
          <IconTip label="Remove">
            <button type="button" onClick={runDelete} disabled={busy} aria-label="Remove selected" className={cn(iconBtn, "text-[#C0392B] hover:bg-[#FDE8E6]")}>
              <Trash2 size={14} />
            </button>
          </IconTip>
        </>
      ) : null}
    </div>
  );
}
