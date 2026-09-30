"use client";

import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

// Task 395 — shown when a space has no pages yet, or nothing is selected. Per this repo's UI
// Polish Conventions: icon + one-line message + primary action, not blank space.
export function WikiEmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 px-8 text-center">
      <div className="w-11 h-11 rounded-[12px] bg-[#F0F7FF] flex items-center justify-center">
        <BookOpen size={20} className="text-[#007BFF]" />
      </div>
      <div className="font-heading text-[15px] font-semibold text-[#0B1533]">{title}</div>
      <p className="text-[13px] text-[#5F6A88] max-w-[320px]">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={cn(
            "mt-1 rounded-full bg-[#FB914E] text-[#471F02] text-[12px] font-semibold px-4 py-2 cursor-pointer",
            "transition-colors hover:bg-[#E2762F] hover:text-white"
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
