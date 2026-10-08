"use client";

import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isChimeMuted, setChimeMuted } from "@/lib/timer/chime";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatMMSS } from "@/lib/timer/format";
import { BREAK_ICONS, BREAK_LABELS, type BreakType } from "@/lib/timer/constants";

const BREAK_META: Record<BreakType, { icon: LucideIcon; label: string; tooltip: string }> = {
  meal: { icon: BREAK_ICONS.meal, label: "60 mins", tooltip: "Meal Break for 60 mins" },
  coffee: { icon: BREAK_ICONS.coffee, label: "15 mins", tooltip: "Coffee Break for 15 mins" },
  few_minutes: { icon: BREAK_ICONS.few_minutes, label: "Few Minutes Break", tooltip: "Few Minutes Break for 5 mins" },
};
const BREAK_ORDER: BreakType[] = ["meal", "coffee", "few_minutes"];

// Break controls for the header timer widget (extracted from timer-header-widget.tsx in task 439
// to keep that file within the file-length guidance): the picker while no break is active, the
// countdown + "End break" while one is.
export function TimerBreakPanel({
  breakType, remainingSeconds, onStart, onEnd,
}: {
  breakType: BreakType | null;
  remainingSeconds: number | null;
  onStart: (type: BreakType) => void;
  onEnd: () => void;
}) {
  const [muted, setMuted] = useState(() => isChimeMuted());
  if (breakType) {
    const Icon = BREAK_META[breakType].icon;
    return (
      <div className="flex flex-col items-center gap-2 py-1">
        <Icon size={18} className="text-[#8A5A00]" />
        <span className="text-[11px] font-semibold text-[#5F6A88]">{BREAK_LABELS[breakType]}</span>
        <span className="text-[20px] font-mono font-semibold text-[#0B1533] tabular-nums">{formatMMSS(remainingSeconds ?? 0)}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={onEnd}
            className="text-[11px] font-semibold text-[#0063D6] hover:text-[#007BFF] transition-colors cursor-pointer"
          >
            End break
          </button>
          <button
            onClick={() => { setChimeMuted(!muted); setMuted(!muted); }}
            aria-pressed={muted}
            aria-label={muted ? "Unmute break sounds" : "Mute break sounds"}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#5F6A88] hover:text-[#0B1533] transition-colors cursor-pointer"
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            {muted ? "Sound off" : "Sound on"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {BREAK_ORDER.map((type) => {
        const meta = BREAK_META[type];
        const Icon = meta.icon;
        return (
          <Tooltip key={type}>
            <TooltipTrigger render={
              <button
                onClick={() => onStart(type)}
                className="flex flex-col items-center justify-center gap-1 px-1.5 py-2 min-h-[58px] rounded-[10px] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] hover:bg-[#F0F7FF] transition-colors cursor-pointer"
              >
                <Icon size={16} className="text-[#5F6A88]" />
                <span className="text-[9.5px] font-semibold text-[#5F6A88] text-center leading-tight">{meta.label}</span>
              </button>
            } />
            <TooltipContent side="top">{meta.tooltip}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
