"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Task 498 — `neutral` for reversible confirmations (archive/restore): the design guide keeps the
// red --late tint for destructive actions and errors. Default stays `danger` for every existing caller.
const TONE = {
  danger: { icon: "bg-[#FDE8E6] text-[#C0392B]", confirm: "bg-[#C0392B] hover:bg-[#A5301F]" },
  neutral: { icon: "bg-[#F0F7FF] text-[#007BFF]", confirm: "bg-[#007BFF] hover:bg-[#0063D6]" },
} as const;

// Reusable styled confirmation popup (originated in timelogs' _confirm-dialog.tsx, task 230;
// promoted here in task 231 once a second and third page needed the same irreversible-action
// confirmation) — replaces native `window.confirm()` with on-brand chrome (`fixed inset-0 …
// bg-[#0B1533]/40` overlay, white `rounded-[14px]` card).
export function ConfirmDialog({
  open, title, body, confirmLabel = "Delete", confirmDisabled = false, tone = "danger", onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  tone?: keyof typeof TONE;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1533]/40 p-4">
      <div className="w-full max-w-[360px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-5 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("flex items-center justify-center shrink-0 w-9 h-9 rounded-full", TONE[tone].icon)}>
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
            disabled={confirmDisabled}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-white text-[12px] font-semibold cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
              TONE[tone].confirm
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
