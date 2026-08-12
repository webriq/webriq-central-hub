"use client";

import { AlertTriangle } from "lucide-react";

// Reusable styled confirmation popup (task 230, Requirement 2) — replaces
// `_time-logs-content.tsx`'s native `confirm("Delete this time log entry? This cannot be
// undone.")` with the same visual chrome `TimeLogEntryModal` already uses (`fixed inset-0 z-50 …
// bg-[#0B1533]/40` overlay, white `rounded-[14px]` card), so a destructive action gets a
// consistent, on-brand confirmation instead of the browser's own dialog.
export function ConfirmDialog({
  open, title, body, confirmLabel = "Delete", onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1533]/40 p-4">
      <div className="w-full max-w-[360px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-5 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-[#FDE8E6] text-[#C0392B]">
            <AlertTriangle size={16} />
          </div>
          <div className="flex flex-col gap-1 pt-0.5">
            <h2 className="text-[14px] font-semibold text-[#0B1533]">{title}</h2>
            <p className="text-[12px] text-[#5F6A88]">{body}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded-full bg-[#C0392B] text-white text-[12px] font-semibold hover:bg-[#A5301F] cursor-pointer transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
