"use client";

import { useEffect } from "react";
import { AlertTriangle, FileClock, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WikiDiffView, type WikiDiffSide } from "./_wiki-diff-view";

// Task 402 — dialogs for the wiki's edit-safety flows:
//   WikiCompareModal  large diff dialog — the save-conflict (409) resolution and the
//                     stale-draft "View differences" compare share it.
//   WikiChoiceDialog  small multi-choice prompt — "Resume draft?" and "Keep your changes?".
// Same overlay/card chrome as `@/components/ui/confirm-dialog`, which only supports a single
// destructive confirm and so can't carry these three-way choices.

export type WikiDialogAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "danger" | "secondary";
  busy?: boolean;
  disabled?: boolean;
};

const ACTION_STYLE: Record<NonNullable<WikiDialogAction["variant"]>, string> = {
  primary: "bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white",
  danger: "bg-[#C0392B] text-white hover:bg-[#A5301F]",
  secondary: "border border-[#E2E7F2] bg-white text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]",
};

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function Actions({ actions }: { actions: WikiDialogAction[] }) {
  const anyBusy = actions.some((a) => a.busy);
  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          disabled={anyBusy || action.disabled}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            ACTION_STYLE[action.variant ?? "secondary"]
          )}
        >
          {action.busy && <Loader2 size={12} className="animate-spin" />}
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function WikiCompareModal({
  title,
  message,
  oldSide,
  newSide,
  oldLabel,
  newLabel,
  actions,
  onClose,
}: {
  title: string;
  message: string;
  oldSide: WikiDiffSide;
  newSide: WikiDiffSide;
  oldLabel: string;
  newLabel: string;
  actions: WikiDialogAction[];
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1533]/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-[960px] max-h-[88vh] flex flex-col rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]">
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[#EDF0F7]">
          <div className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-[#FFF3D6] text-[#8A5A00]">
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1 flex flex-col gap-1 pt-0.5">
            <h2 className="text-[14px] font-semibold text-[#0B1533]">{title}</h2>
            <p className="text-[12px] text-[#5F6A88]">{message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-full text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <WikiDiffView oldSide={oldSide} newSide={newSide} oldLabel={oldLabel} newLabel={newLabel} />
        </div>
        <div className="px-5 py-4 border-t border-[#EDF0F7]">
          <Actions actions={actions} />
        </div>
      </div>
    </div>
  );
}

export function WikiChoiceDialog({
  title,
  body,
  actions,
  onClose,
}: {
  title: string;
  body: string;
  actions: WikiDialogAction[];
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1533]/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-[420px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-[#EEF3FF] text-[#0063D6]">
            <FileClock size={16} />
          </div>
          <div className="flex flex-col gap-1 pt-0.5">
            <h2 className="text-[14px] font-semibold text-[#0B1533]">{title}</h2>
            <p className="text-[12px] text-[#5F6A88]">{body}</p>
          </div>
        </div>
        <Actions actions={actions} />
      </div>
    </div>
  );
}
