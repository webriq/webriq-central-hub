"use client";

import { useState } from "react";
import { X, FolderInput, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaffPerson } from "./_wizard-v2-types";
import { textPrimary, textMuted, IconTip } from "./_shared-ui";
import { PermissionPicker } from "./_permission-picker";

// Multi-select action bar for the Files tab's open-folder file grid/list — mirrors
// ../_onboarding-wizard.tsx's StorageFileExplorer selection bar (Share/Move/Delete over
// `selectedIds`), rebuilt fresh here. Bulk share starts from an empty role/person set each time
// it opens (same as the original) and every toggle fans out immediately to all selected files.
export function BulkToolbar({
  count, staffDirectory, onClear, onBulkPermissionChange, onMove, onDelete,
}: {
  count: number;
  staffDirectory: StaffPerson[];
  onClear: () => void;
  onBulkPermissionChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => Promise<void>;
  onMove: () => void;
  onDelete: () => void;
}) {
  const [bulkRoles, setBulkRoles] = useState<string[]>([]);
  const [bulkUserIds, setBulkUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex items-center gap-1 p-2 rounded-[10px] mb-3 bg-[#EDF0F7]">
      <IconTip label="Clear selection">
        <button type="button" onClick={onClear} aria-label="Clear selection" className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent transition-colors hover:bg-[#E2E7F2]", textMuted)}>
          <X size={14} />
        </button>
      </IconTip>
      <span className={cn("text-[12px] font-medium mr-1", textPrimary)}>{count} selected</span>
      <div className="flex-1" />
      {busy && <Loader2 size={14} className="animate-spin text-[#5F6A88]" />}
      <PermissionPicker allowedRoles={bulkRoles} allowedUserIds={bulkUserIds} staffDirectory={staffDirectory} onChange={applyBulk} triggerLabel="Share" />
      <IconTip label="Move to folder">
        <button type="button" onClick={onMove} disabled={busy} aria-label="Move to folder" className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent transition-colors disabled:opacity-50", textMuted, "hover:bg-[#E2E7F2]")}>
          <FolderInput size={14} />
        </button>
      </IconTip>
      <IconTip label="Remove">
        <button type="button" onClick={runDelete} disabled={busy} aria-label="Remove selected" className="p-2 rounded-md cursor-pointer border-none bg-transparent text-[#C0392B] hover:bg-[#FDE8E6] transition-colors disabled:opacity-50">
          <Trash2 size={14} />
        </button>
      </IconTip>
    </div>
  );
}
