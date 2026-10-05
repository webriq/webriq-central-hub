"use client";

import { forwardRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { CalendarClock, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliverableConfig } from "@/config/customer-phases";
import type { OnboardingInternalDeliverableRow } from "@/types/database";
import { ownerChips, formatDeliverableDateRange } from "./_gantt-shared";

type Pos = { top: number; left: number };

// Keeps the portal card inside the viewport's right edge (w-64 = 256px + gutter).
const clampLeft = (left: number, width: number) =>
  typeof window === "undefined" ? left : Math.max(8, Math.min(left, window.innerWidth - width - 8));

// Description / owner / date-range card — shown on hover and (task 421) on keyboard focus.
export function DeliverableDetailsCard({
  d, percentage, phaseText, startDate, pos,
}: {
  d: DeliverableConfig;
  percentage: number;
  phaseText: string;
  startDate: Date;
  pos: Pos;
}) {
  return createPortal(
    <div
      className="fixed z-50 w-64 pointer-events-none rounded-xl border border-[#E2E7F2] bg-white p-3 shadow-lg"
      style={{ top: pos.top, left: clampLeft(pos.left, 256) }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[12.5px] font-bold text-[#0B1533]">{d.name}</div>
        <span className={cn("font-mono shrink-0 text-[10px] font-bold", phaseText)}>{percentage}%</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-[#5F6A88]">{d.description}</p>
      <div className="mt-2.5 flex items-center gap-1.5">
        {ownerChips(d.owner).map((c, idx) => (
          <span key={idx} className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white", c.colorClass)}>
            {c.label}
          </span>
        ))}
        <span className="text-[10.5px] text-[#3A4565]">{d.owner}</span>
      </div>
      <div className="font-mono mt-2 flex items-center gap-1 text-[10px] text-[#5F6A88]">
        <CalendarClock size={11} /> {formatDeliverableDateRange(startDate, d.dayStart, d.dayEnd)}
      </div>
    </div>,
    document.body
  );
}

// Internal-deliverables checklist opened from the card's "3/5" badge.
export const ChecklistPopover = forwardRef<HTMLDivElement, {
  items: { key: string; name: string }[];
  internalByKey: Map<string, OnboardingInternalDeliverableRow>;
  interactive: boolean;
  onOpenStep?: () => void;
  pos: Pos;
}>(function ChecklistPopover({ items, internalByKey, interactive, onOpenStep, pos }, ref) {
  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={ref}
        role="dialog"
        aria-label="Checklist"
        initial={{ opacity: 0, y: -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="fixed z-50 w-56 rounded-xl border border-[#E2E7F2] bg-white p-1.5 shadow-lg"
        style={{ top: pos.top, left: clampLeft(pos.left, 224) }}
      >
        <div className="px-2 pb-1 pt-1 text-[9px] font-bold uppercase tracking-wide text-[#5F6A88]">Checklist</div>
        {items.map((item) => {
          const iStatus = internalByKey.get(item.key)?.status ?? "pending";
          const iIcon = iStatus === "done"
            ? <CheckCircle2 size={11} className="text-[#177E48]" />
            : iStatus === "in_progress"
              ? <Clock size={11} className="text-[#007BFF]" />
              : <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#A8C6F5]" />;
          return (
            <button
              key={item.key}
              type="button"
              title="Go to this deliverable's step in the wizard"
              onClick={interactive ? onOpenStep : undefined}
              disabled={!interactive}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border-none bg-transparent px-1.5 py-1 text-left transition-colors hover:bg-[#F4F6FB] disabled:opacity-60",
                interactive ? "cursor-pointer" : "cursor-default"
              )}
            >
              {iIcon}
              <span className={cn("text-[11px]", iStatus === "done" ? "text-[#5F6A88] line-through" : "text-[#3A4565]")}>{item.name}</span>
            </button>
          );
        })}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
});
