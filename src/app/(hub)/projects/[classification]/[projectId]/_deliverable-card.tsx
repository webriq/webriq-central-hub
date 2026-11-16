"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, Clock, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliverableConfig } from "@/config/customer-phases";
import type { OnboardingInternalDeliverableRow } from "@/types/database";
import {
  ROW_HEIGHT, ROW_GAP, CARD_INSET, PHASE_HEX, formatDeliverableDateRange,
  type PhaseVisual,
} from "./_gantt-shared";
import ProgressRing from "./_progress-ring";
import { useGanttZoom } from "./_gantt-zoom-context";
import { progressPercentage, HEALTH_LABEL, type Health } from "@/lib/programme/deliverable-health";
import { useDeliverableScheduleDrag } from "./_use-deliverable-schedule-drag";
import { DeliverableDetailsCard, ChecklistPopover } from "./_deliverable-card-popovers";

export default function DeliverableCard({
  d, track, status, interactive, internalItems, internalByKey, expanded, onToggleExpand,
  phaseNumber, phaseVisual, startDate, onOpenWizardStep, canEditSchedule, phaseDayStart, phaseDayEnd, onScheduleChange,
  health, dimmed,
}: {
  d: DeliverableConfig;
  track: number;
  status: string;
  interactive: boolean;
  internalItems: { key: string; name: string }[];
  internalByKey: Map<string, OnboardingInternalDeliverableRow>;
  expanded: boolean;
  onToggleExpand: () => void;
  phaseNumber: number;
  phaseVisual: PhaseVisual;
  startDate: Date;
  onOpenWizardStep?: () => void;
  canEditSchedule: boolean;
  phaseDayStart: number;
  phaseDayEnd: number;
  // Resolves false when the save failed (the parent has already reverted its local state).
  onScheduleChange?: (dayStart: number, dayEnd: number) => Promise<boolean> | void;
  // Task 422: schedule health (marker + accessible text) and filter dimming.
  health: Health;
  dimmed: boolean;
}) {
  const { dayWidth } = useGanttZoom();
  // Task 421: per-card status — `text` is announced via the sr-only live region; `error` also
  // renders an inline chip so a failed save is visible even when the page-level error is off-screen.
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current); }, []);

  async function commit({ dayStart, dayEnd }: { dayStart: number; dayEnd: number }) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    const ok = (await onScheduleChange?.(dayStart, dayEnd)) !== false;
    const range = formatDeliverableDateRange(startDate, dayStart, dayEnd);
    setNotice(ok ? { text: `${d.name} moved to ${range}`, error: false } : { text: `Couldn't save ${d.name} — reverted to its previous dates`, error: true });
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  }

  const drag = useDeliverableScheduleDrag({
    canEdit: canEditSchedule, dayStart: d.dayStart, dayEnd: d.dayEnd, phaseDayStart, phaseDayEnd, dayWidth, onCommit: commit,
  });
  const { livePreview } = drag;

  const effectiveDayStart = livePreview?.dayStart ?? d.dayStart;
  const effectiveDayEnd = livePreview?.dayEnd ?? d.dayEnd;
  const left = (effectiveDayStart - 1) * dayWidth;
  const width = (effectiveDayEnd - effectiveDayStart + 1) * dayWidth - 4;
  const top = track * (ROW_HEIGHT + ROW_GAP) + CARD_INSET;

  function handleCardClick() {
    if (drag.consumeSuppressedClick()) return;
    if (interactive) onOpenWizardStep?.();
  }
  const compact = width < 90;
  const doneInternal = internalItems.filter((item) => (internalByKey.get(item.key)?.status ?? "pending") === "done").length;
  const percentage = progressPercentage(status, internalItems.map((item) => internalByKey.get(item.key)?.status ?? "pending"));
  // Week zoom makes most cards narrow: below 60px only the ring + marker remain (details card on hover/focus).
  const tiny = width < 60;
  const flagged = health === "overdue" || health === "due-soon";

  const badgeRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);
  const showDetails = (hovered || focused) && !drag.dragging;

  // Where the solid-fill/track boundary crosses the title text itself, in the title span's own
  // local coordinate space (0–100) — used to split the title's color so it stays readable whether
  // a given letter sits over the solid-color fill or the light striped track.
  const titleRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [textSplitPct, setTextSplitPct] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (percentage <= 0 || percentage >= 100 || !titleRef.current || !buttonRef.current) {
      setTextSplitPct(null);
      return;
    }
    const buttonWidth = buttonRef.current.clientWidth;
    const fillPx = (percentage / 100) * buttonWidth;
    const localStart = titleRef.current.offsetLeft;
    const localWidth = titleRef.current.offsetWidth;
    const localFillPx = Math.max(0, Math.min(localWidth, fillPx - localStart));
    setTextSplitPct(localWidth > 0 ? (localFillPx / localWidth) * 100 : 0);
  }, [percentage, width]);

  useEffect(() => {
    if (expanded && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (badgeRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      onToggleExpand();
    }
    // Task 421: Escape closes the checklist and returns focus to its badge.
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onToggleExpand();
      badgeRef.current?.focus();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [expanded, onToggleExpand]);

  useEffect(() => {
    if (showDetails && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setHoverPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, [showDetails]);

  const hex = PHASE_HEX[phaseNumber] ?? PHASE_HEX[1];
  const barStyle: React.CSSProperties | undefined = percentage >= 100
    ? { backgroundColor: hex }
    : percentage > 0
      ? {
          backgroundImage: `linear-gradient(to right, ${hex} 0%, ${hex} ${percentage}%, transparent ${percentage}%, transparent 100%), repeating-linear-gradient(135deg, ${hex}22 0px, ${hex}22 1.5px, transparent 1.5px, transparent 4px)`,
          backgroundColor: `${hex}0D`,
        }
      : {
          backgroundImage: `repeating-linear-gradient(135deg, ${hex}1A 0px, ${hex}1A 1.5px, transparent 1.5px, transparent 4px)`,
          backgroundColor: `${hex}08`,
        };

  const descId = `deliverable-desc-${phaseNumber}-${d.key}`;
  const spanDays = effectiveDayEnd - effectiveDayStart + 1;

  return (
    <div
      ref={cardRef}
      className={cn("absolute transition-opacity", dimmed && "opacity-30")}
      style={{ left, width, top, height: ROW_HEIGHT - CARD_INSET * 2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
    >
      {/* Task 421: the hover card's content for assistive tech — always in the DOM, unlike the
          portal card, so aria-describedby resolves for keyboard/screen-reader users. */}
      <span id={descId} className="sr-only">
        {d.description}. Owner: {d.owner}. {formatDeliverableDateRange(startDate, d.dayStart, d.dayEnd)}. {percentage}% complete.{flagged ? ` ${HEALTH_LABEL[health]}.` : ""}
        {canEditSchedule ? " Alt plus arrow keys moves the dates; Alt plus Shift plus arrow keys changes the end date." : ""}
      </span>
      <span role="status" className="sr-only">{notice?.text}</span>

      <button
        ref={buttonRef}
        type="button"
        onClick={handleCardClick}
        onPointerDown={(e) => drag.beginDrag("move", e)}
        onKeyDown={drag.onKeyDown}
        onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
        aria-describedby={descId}
        aria-keyshortcuts={canEditSchedule ? "Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowLeft Alt+Shift+ArrowRight" : undefined}
        title={d.name}
        style={barStyle}
        className={cn(
          "relative flex h-full w-full items-center gap-2 overflow-hidden rounded-[10px] border-[1.5px] px-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]",
          percentage >= 100 ? "border-transparent" : health === "overdue" ? "border-[#C0392B]" : health === "due-soon" ? "border-[#E0A526]" : "border-[#E2E7F2]",
          interactive && "hover:border-[#A8C6F5]",
          canEditSchedule ? (drag.dragging ? "cursor-grabbing" : "cursor-grab") : interactive ? "cursor-pointer" : "cursor-default"
        )}
      >
        {canEditSchedule && (
          <>
            <div
              aria-hidden="true"
              onPointerDown={(e) => drag.beginDrag("resize-left", e)}
              className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-black/0 transition-colors hover:bg-black/15"
            />
            <div
              aria-hidden="true"
              onPointerDown={(e) => drag.beginDrag("resize-right", e)}
              className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-black/0 transition-colors hover:bg-black/15"
            />
          </>
        )}
        <ProgressRing percentage={percentage} colorClass={percentage >= 100 ? "text-white/50" : phaseVisual.text} />
        {flagged && (
          health === "overdue"
            ? <AlertTriangle size={12} className="shrink-0 text-[#C0392B]" aria-hidden="true" />
            : <Clock size={12} className="shrink-0 text-[#B7791F]" aria-hidden="true" />
        )}
        <span
          ref={titleRef}
          className={cn(
            "min-w-0 flex-1 truncate text-[11.5px] font-medium",
            tiny && "sr-only",
            percentage >= 100 ? "text-white" : textSplitPct === null ? "text-[#0B1533]" : undefined
          )}
          style={
            textSplitPct === null
              ? undefined
              : {
                  backgroundImage: `linear-gradient(to right, #ffffff 0%, #ffffff ${textSplitPct}%, #0B1533 ${textSplitPct}%, #0B1533 100%)`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }
          }
        >
          {d.name}
        </span>
        {!compact && (
          <span className={cn("font-mono shrink-0 text-[10px] font-bold", percentage >= 100 ? "text-white" : phaseVisual.text)}>{percentage}%</span>
        )}
      </button>

      {/* Task 421: live date range while dragging; amber once the phase limit stops the bar. */}
      {drag.dragging && livePreview && (
        <div
          aria-hidden="true"
          className={cn(
            "font-mono pointer-events-none absolute -top-6 left-0 z-20 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold shadow-sm",
            drag.clamped ? "border-[#F0D896] bg-[#FFF3D6] text-[#8A5A00]" : "border-[#E2E7F2] bg-white text-[#0B1533]"
          )}
        >
          {formatDeliverableDateRange(startDate, effectiveDayStart, effectiveDayEnd)} · {spanDays}d{drag.clamped ? " · Phase limit" : ""}
        </div>
      )}

      {notice?.error && (
        <div role="alert" className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-max max-w-64 rounded-md border border-[#F5C6C2] bg-white px-2 py-1 text-[11px] font-medium text-[#C0392B] shadow-sm">
          {notice.text}
        </div>
      )}

      {internalItems.length > 0 && (
        <button
          ref={badgeRef}
          type="button"
          onClick={onToggleExpand}
          aria-label={`Checklist, ${doneInternal} of ${internalItems.length} done`}
          aria-expanded={expanded}
          aria-haspopup="dialog"
          className="absolute -right-1.5 -top-1.5 z-9 flex h-4.5 cursor-pointer items-center gap-0.5 rounded-full border border-[#E2E7F2] bg-white px-1.5 text-[8px] font-bold text-[#5F6A88] shadow-sm focus-visible:outline-2 focus-visible:outline-[#007BFF]"
        >
          <ListChecks size={8} aria-hidden="true" /> {doneInternal}/{internalItems.length}
        </button>
      )}

      {expanded && popoverPos && typeof document !== "undefined" && (
        <ChecklistPopover
          ref={popoverRef}
          items={internalItems}
          internalByKey={internalByKey}
          interactive={interactive}
          onOpenStep={onOpenWizardStep}
          pos={popoverPos}
        />
      )}

      {showDetails && hoverPos && typeof document !== "undefined" && (
        <DeliverableDetailsCard d={d} percentage={percentage} phaseText={phaseVisual.text} startDate={startDate} pos={hoverPos} />
      )}
    </div>
  );
}
