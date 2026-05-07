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
        return { dotClass: "bg-amber-400", text: "Saving...", textClass: "text-amber-400" };
      case "saved":
        return {
          dotClass: "bg-green-500",
          text: lastSavedAt
            ? `Draft auto-saved at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Draft auto-saved",
          textClass: "text-green-500",
        };
      case "error":
        return { dotClass: "bg-red-500", text: error ?? "Save failed", textClass: "text-red-500" };
      case "idle":
      default:
        return { dotClass: "bg-slate-400", text: "Waiting to save...", textClass: "text-slate-400" };
    }
  };

  const display = getStatusDisplay();

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "w-2 h-2 rounded-full inline-block flex-shrink-0",
          display.dotClass,
          status === "saving" && "animate-pulse"
        )}
      />
      <span className={cn("text-xs font-medium", display.textClass)}>
        {display.text}
      </span>
    </div>
  );
}
