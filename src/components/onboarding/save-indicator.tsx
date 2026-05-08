"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/types/onboarding";

interface SaveIndicatorProps {
  status: SaveStatus;
  lastSavedAt: Date | null;
  error: string | null;
}

export default function SaveIndicator({ status, lastSavedAt, error }: SaveIndicatorProps) {
  const getStatusDisplay = () => {
    switch (status) {
      case "saving":
        return { dotCls: "bg-amber-400", text: "Saving...", textCls: "text-amber-500", pulse: true };
      case "saved":
        return {
          dotCls: "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]",
          text: lastSavedAt
            ? `Draft auto-saved at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Draft auto-saved",
          textCls: "text-green-600",
          pulse: true,
        };
      case "error":
        return { dotCls: "bg-red-500", text: error ?? "Save failed", textCls: "text-red-500", pulse: false };
      case "idle":
      default:
        return { dotCls: "bg-slate-300", text: "Waiting to save...", textCls: "text-slate-400", pulse: false };
    }
  };

  const { dotCls, text, textCls, pulse } = getStatusDisplay();

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full inline-block flex-shrink-0",
          dotCls,
          pulse && "animate-pulse"
        )}
      />
      <span className={cn("text-xs font-medium font-mono", textCls)}>{text}</span>
    </div>
  );
}
