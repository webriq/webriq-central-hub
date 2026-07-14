"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarClock, Flag, Bell, CheckCircle2, Check, Clock, ChevronDown, ChevronRight, PlayCircle,
  Users, AlertTriangle, Info, ArrowLeft, ListChecks, Locate,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { V2_ROUTES } from "@/config/constants";
import {
  PROGRAMME_PHASES, getCurrentProgrammeDay, getPhaseForDay, getPhaseByNumber,
  internalDeliverablesForSubPhase, type PhaseConfig, type DeliverableConfig,
} from "@/config/customer-phases";
import type { CustomerPhaseRow, CustomerDeliverableRow, OnboardingInternalDeliverableRow } from "@/types/database";
import { spaceGrotesk, inter, jetBrainsMono } from "../_fonts";
import OnboardingWizard from "./_onboarding-wizard";

interface OnboardingDetailProps {
  project: { id: string; name: string; customer_id: string; project_id: string | null; company_name: string };
}

// ─── Gantt grid constants ─────────────────────────────────────────────────────

const TOTAL_DAYS = 120;
const DAY_WIDTH = 80;
const ROW_HEIGHT = 48;
const ROW_GAP = 6;
const LABEL_WIDTH = 200;
// Extra top space in each swimlane row so track-0 deliverable cards' internal-deliverables badge
// (which pokes above the card via `-top-1.5`) has room to render without being clipped.
const LANE_TOP_PADDING = 8;
// Vertical breathing room within each track's ROW_HEIGHT slot — shrinks the rendered card height
// by 2x this amount so it sits centered in its row instead of flush against the top edge.
const CARD_INSET = 4;

// ─── Per-phase palette (from _design/customers/CustomerTimeline.tsx's color system) ──

type PhaseVisual = { border: string; bg: string; ring: string; text: string; solid: string; iconBg: string; iconText: string };

const PHASE_VISUALS: Record<number, PhaseVisual> = {
  1: { border: "border-[#2563EB]", bg: "bg-[#EFF6FF]", ring: "shadow-[0_0_0_3px_rgba(37,99,235,0.09)]", text: "text-[#2563EB]", solid: "bg-[#2563EB]", iconBg: "bg-[#2563EB]/15", iconText: "text-[#2563EB]" },
  2: { border: "border-[#7C3AED]", bg: "bg-[#F5F3FF]", ring: "shadow-[0_0_0_3px_rgba(124,58,237,0.09)]", text: "text-[#7C3AED]", solid: "bg-[#7C3AED]", iconBg: "bg-[#7C3AED]/15", iconText: "text-[#7C3AED]" },
  3: { border: "border-[#0D9488]", bg: "bg-[#F0FDFA]", ring: "shadow-[0_0_0_3px_rgba(13,148,136,0.09)]", text: "text-[#0D9488]", solid: "bg-[#0D9488]", iconBg: "bg-[#0D9488]/15", iconText: "text-[#0D9488]" },
  4: { border: "border-[#D97706]", bg: "bg-[#FFFBEB]", ring: "shadow-[0_0_0_3px_rgba(217,119,6,0.09)]", text: "text-[#D97706]", solid: "bg-[#D97706]", iconBg: "bg-[#D97706]/15", iconText: "text-[#D97706]" },
  5: { border: "border-[#0F172A]", bg: "bg-[#F1F5F9]", ring: "shadow-[0_0_0_3px_rgba(15,23,42,0.09)]", text: "text-[#0F172A]", solid: "bg-[#0F172A]", iconBg: "bg-[#0F172A]/10", iconText: "text-[#0F172A]" },
};

// Raw hex twins of PHASE_VISUALS' colors — needed for the DeliverableCard progress-fill/stripe
// gradients, which are computed dynamically (percentage-driven) and can't be static Tailwind classes.
const PHASE_HEX: Record<number, string> = {
  1: "#2563EB",
  2: "#7C3AED",
  3: "#0D9488",
  4: "#D97706",
  5: "#0F172A",
};

// ─── Reminder chip palette ─────────────────────────────────────────────────────

type ReminderItem = { key: string; type: "warning" | "reminder" | "info" | "success"; title: string; body: string };

const REMINDER_STYLE: Record<ReminderItem["type"], { bg: string; border: string; title: string; icon: React.ReactNode }> = {
  warning: { bg: "bg-[#FFF7ED]", border: "border-[#FED7AA]", title: "text-[#92400E]", icon: <AlertTriangle size={13} className="text-[#D97706]" /> },
  reminder: { bg: "bg-[#EFF6FF]", border: "border-[#BFDBFE]", title: "text-[#1E40AF]", icon: <Bell size={13} className="text-[#2563EB]" /> },
  info: { bg: "bg-[#F8FAFC]", border: "border-[#E2E8F0]", title: "text-[#0F172A]", icon: <Info size={13} className="text-[#64748B]" /> },
  success: { bg: "bg-[#F0FDF4]", border: "border-[#BBF7D0]", title: "text-[#166534]", icon: <CheckCircle2 size={13} className="text-[#16A34A]" /> },
};

function buildReminders(day: number, phaseStatus: Map<number, string>, deliverableStatus: Map<string, string>): ReminderItem[] {
  if (phaseStatus.get(5) === "completed") {
    return [{ key: "done", type: "success", title: "Programme complete", body: "All 5 phases delivered." }];
  }
  const activePhaseNumber = [...phaseStatus.entries()].find(([, status]) => status === "active")?.[0];
  const phase = activePhaseNumber ? getPhaseByNumber(activePhaseNumber) : getPhaseForDay(day);
  const items: ReminderItem[] = [];
  if (phase.number === 1) {
    for (const d of phase.deliverables) {
      if (deliverableStatus.get(d.key) === "done") continue;
      const diff = d.dayEnd - day;
      if (diff > 0 && diff <= 5) {
        items.push({ key: `due-${d.key}`, type: diff <= 2 ? "warning" : "reminder", title: `Due in ${diff} day${diff === 1 ? "" : "s"}: ${d.name}`, body: d.description });
      } else if (diff <= 0) {
        items.push({ key: `overdue-${d.key}`, type: "warning", title: `Overdue: ${d.name}`, body: `Was due by Day ${d.dayEnd}.` });
      }
    }
  }
  if (day === 15 && phaseStatus.get(1) !== "completed") items.push({ key: "gate15", type: "warning", title: "Gate — Day 15", body: "Client sign-off due before Phase 2 begins." });
  if (items.length === 0) {
    const daysLeft = Math.max(0, phase.dayEnd - day);
    items.push({ key: "ontrack", type: "info", title: `On track — Phase ${phase.number}: ${phase.name}`, body: `${daysLeft} days remaining. Owner: ${phase.owner}.` });
  }
  return items.slice(0, 5);
}

// ─── Owner avatar chips (small, fixed enumerable set — no computed inline colors) ──

const PERSON_COLOR: Record<string, string> = {
  Bert: "bg-[#2563EB]", PM: "bg-[#7C3AED]", Dev: "bg-[#0D9488]", Jun: "bg-[#DB2777]",
  Erica: "bg-[#D97706]", April: "bg-[#0EA5E9]", Eri: "bg-[#16A34A]", Strategy: "bg-[#DC2626]",
};
const DEFAULT_PERSON_COLOR = "bg-[#64748B]";

function ownerChips(owner: string): { label: string; colorClass: string }[] {
  const names = owner.split(/\s*\+\s*/).filter(Boolean);
  return names.slice(0, 3).map((name) => ({
    label: name.length <= 2 ? name.toUpperCase() : name.slice(0, 2).toUpperCase(),
    colorClass: PERSON_COLOR[name] ?? DEFAULT_PERSON_COLOR,
  }));
}

// ─── Overlap-stacking (generic, but only Phase 2 Day 16 needs a 2nd track today) ──

function assignTracks(items: { dayStart: number; dayEnd: number }[]): number[] {
  const trackEnds: number[] = [];
  const tracks: number[] = [];
  for (const item of items) {
    let track = trackEnds.findIndex((end) => end < item.dayStart);
    if (track === -1) {
      track = trackEnds.length;
      trackEnds.push(item.dayEnd);
    } else {
      trackEnds[track] = item.dayEnd;
    }
    tracks.push(track);
  }
  return tracks;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDeliverableDateRange(startDate: Date, dayStart: number, dayEnd: number): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const from = fmt(addDays(startDate, dayStart - 1));
  if (dayStart === dayEnd) return from;
  return `${from} – ${fmt(addDays(startDate, dayEnd - 1))}`;
}

// ─── Date column header ────────────────────────────────────────────────────────

function DateColumnHeader({ date, isToday }: { date: Date; isToday: boolean }) {
  return (
    <div
      className={cn("flex h-12 shrink-0 flex-col items-center justify-center border-r border-[#F1F5F9]", isToday && "bg-[#FFF7ED]")}
      style={{ width: DAY_WIDTH }}
    >
      <div className={cn(jetBrainsMono.className, "text-[9px] tracking-wide", isToday ? "font-bold text-[#F97316]" : "text-[#94A3B8]")}>
        {date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
      </div>
      <div className={cn("text-[11px] font-semibold", isToday ? "text-[#F97316]" : "text-[#475569]")}>{date.getDate()}</div>
    </div>
  );
}

// ─── Deliverable card ──────────────────────────────────────────────────────────

// Filled-circle pie progress indicator: an outer ring, a small gap, then a base circle with a
// solid pie wedge (clockwise from 12 o'clock) filled to `percentage`. At 100% the pie is a full
// solid disc (same ring+gap+pie structure) with a white checkmark centered on top. `colorClass`
// is a Tailwind `text-*` class (from PHASE_VISUALS); `fill-current`/`stroke-current` pick it up.
function ProgressRing({ percentage, colorClass, size = 22 }: { percentage: number; colorClass: string; size?: number }) {
  const cx = size / 2;
  const outerR = size / 2 - 1;
  const gap = 2.5;
  const pieR = outerR - gap;

  if (percentage >= 100) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cx} r={outerR} fill="none" strokeWidth={1} className={cn("stroke-current", colorClass, "opacity-40")} />
          <circle cx={cx} cy={cx} r={pieR} className={cn("fill-current", colorClass)} />
        </svg>
        <Check size={size * 0.55} strokeWidth={3} className="absolute inset-0 m-auto text-white" />
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, percentage));
  const angle = (clamped / 100) * 360;
  const rad = ((angle - 90) * Math.PI) / 180;
  const endX = cx + pieR * Math.cos(rad);
  const endY = cx + pieR * Math.sin(rad);
  const largeArcFlag = angle > 180 ? 1 : 0;
  const wedgePath = clamped > 0 ? `M ${cx} ${cx} L ${cx} ${cx - pieR} A ${pieR} ${pieR} 0 ${largeArcFlag} 1 ${endX} ${endY} Z` : "";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {/* Opaque white backdrop under the ring/gap — without it, the gap is transparent SVG space
          and the card's own solid-fill background (often the *same* phase color as the ring)
          shows through, making the ring invisible against itself. */}
      <circle cx={cx} cy={cx} r={outerR} className="fill-white" />
      <circle cx={cx} cy={cx} r={outerR} fill="none" strokeWidth={1.25} className={cn("stroke-current", colorClass)} />
      <circle cx={cx} cy={cx} r={pieR} strokeWidth={1} className="fill-white stroke-[#E2E8F0]" />
      {wedgePath && <path d={wedgePath} className={cn("fill-current", colorClass, "opacity-50")} />}
    </svg>
  );
}

function DeliverableCard({
  d, track, status, interactive, internalItems, internalByKey, expanded, onToggleExpand,
  phaseNumber, phaseVisual, startDate, onOpenWizardStep,
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
}) {
  const left = (d.dayStart - 1) * DAY_WIDTH;
  const width = (d.dayEnd - d.dayStart + 1) * DAY_WIDTH - 4;
  const top = track * (ROW_HEIGHT + ROW_GAP) + CARD_INSET;
  const compact = width < 90;
  const doneInternal = internalItems.filter((item) => (internalByKey.get(item.key)?.status ?? "pending") === "done").length;
  const percentage = internalItems.length > 0
    ? Math.round((doneInternal / internalItems.length) * 100)
    : status === "done" ? 100 : status === "in_progress" ? 50 : 0;

  const badgeRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);

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
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [expanded, onToggleExpand]);

  useEffect(() => {
    if (hovered && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setHoverPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, [hovered]);

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

  return (
    <div
      ref={cardRef}
      className="absolute"
      style={{ left, width, top, height: ROW_HEIGHT - CARD_INSET * 2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={interactive ? onOpenWizardStep : undefined}
        disabled={!interactive}
        title={d.name}
        style={barStyle}
        className={cn(
          "relative flex h-full w-full items-center gap-2 overflow-hidden rounded-[10px] border-[1.5px] px-2.5 text-left transition-colors",
          percentage >= 100 ? "border-transparent" : "border-[#E2E8F0]",
          interactive ? "cursor-pointer hover:border-[#CBD5E1]" : "cursor-default"
        )}
      >
        <ProgressRing percentage={percentage} colorClass={percentage >= 100 ? "text-white/50" : phaseVisual.text} />
        <span
          ref={titleRef}
          className={cn(
            "min-w-0 flex-1 truncate text-[11.5px] font-medium",
            percentage >= 100 ? "text-white" : textSplitPct === null ? "text-[#0F172A]" : undefined
          )}
          style={
            textSplitPct === null
              ? undefined
              : {
                  backgroundImage: `linear-gradient(to right, #ffffff 0%, #ffffff ${textSplitPct}%, #0F172A ${textSplitPct}%, #0F172A 100%)`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }
          }
        >
          {d.name}
        </span>
        {!compact && (
          <span className={cn(jetBrainsMono.className, "shrink-0 text-[10px] font-bold", percentage >= 100 ? "text-white" : phaseVisual.text)}>{percentage}%</span>
        )}
      </button>

      {internalItems.length > 0 && (
        <button
          ref={badgeRef}
          type="button"
          onClick={onToggleExpand}
          className="absolute -right-1.5 -top-1.5 z-10 flex h-[18px] cursor-pointer items-center gap-0.5 rounded-full border border-[#E2E8F0] bg-white px-1.5 text-[8px] font-bold text-[#64748B] shadow-sm"
        >
          <ListChecks size={8} /> {doneInternal}/{internalItems.length}
        </button>
      )}

      {expanded && popoverPos && typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="fixed z-50 w-56 rounded-xl border border-[#E2E8F0] bg-white p-1.5 shadow-lg"
              style={{ top: popoverPos.top, left: popoverPos.left }}
            >
              <div className="px-2 pb-1 pt-1 text-[9px] font-bold uppercase tracking-wide text-[#94A3B8]">Checklist</div>
              {internalItems.map((item) => {
                const iStatus = internalByKey.get(item.key)?.status ?? "pending";
                const iIcon = iStatus === "done"
                  ? <CheckCircle2 size={11} className="text-[#16A34A]" />
                  : iStatus === "in_progress"
                    ? <Clock size={11} className="text-[#2563EB]" />
                    : <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#CBD5E1]" />;
                return (
                  <button
                    key={item.key}
                    type="button"
                    title="Go to this deliverable's step in the wizard"
                    onClick={interactive ? onOpenWizardStep : undefined}
                    disabled={!interactive}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border-none bg-transparent px-1.5 py-1 text-left transition-colors hover:bg-[#F8FAFC] disabled:opacity-60",
                      interactive ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    {iIcon}
                    <span className={cn("text-[11px]", iStatus === "done" ? "text-[#94A3B8] line-through" : "text-[#334155]")}>{item.name}</span>
                  </button>
                );
              })}
            </motion.div>
          </AnimatePresence>,
          document.body
        )}

      {hovered && hoverPos && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-50 w-64 pointer-events-none rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-lg"
            style={{ top: hoverPos.top, left: hoverPos.left }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[12.5px] font-bold text-[#0F172A]">{d.name}</div>
              <span className={cn(jetBrainsMono.className, "shrink-0 text-[10px] font-bold", phaseVisual.text)}>{percentage}%</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[#64748B]">{d.description}</p>
            <div className="mt-2.5 flex items-center gap-1.5">
              {ownerChips(d.owner).map((c, idx) => (
                <span key={idx} className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white", c.colorClass)}>
                  {c.label}
                </span>
              ))}
              <span className="text-[10.5px] text-[#475569]">{d.owner}</span>
            </div>
            <div className={cn(jetBrainsMono.className, "mt-2 flex items-center gap-1 text-[10px] text-[#94A3B8]")}>
              <CalendarClock size={11} /> {formatDeliverableDateRange(startDate, d.dayStart, d.dayEnd)}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// ─── Swimlane ──────────────────────────────────────────────────────────────────

function Swimlane({
  phase, dbStatus, deliverableStatusMap, internalByKey, collapsed, onToggleCollapse,
  onOpenWizardStep, expandedDeliverable, onExpandDeliverable, index, startDate,
}: {
  phase: PhaseConfig;
  dbStatus: string;
  deliverableStatusMap: Map<string, string>;
  internalByKey: Map<string, OnboardingInternalDeliverableRow>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenWizardStep: (key: string) => void;
  expandedDeliverable: string | null;
  onExpandDeliverable: (key: string | null) => void;
  index: number;
  startDate: Date;
}) {
  const visual = PHASE_VISUALS[phase.number];
  const interactive = phase.number === 1;
  const tracks = assignTracks(phase.deliverables.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd })));
  const trackCount = tracks.length > 0 ? Math.max(...tracks) + 1 : 1;
  const laneHeight = trackCount * ROW_HEIGHT + (trackCount - 1) * ROW_GAP + 8 + LANE_TOP_PADDING;
  const doneCount = phase.deliverables.filter((d) => (deliverableStatusMap.get(d.key) ?? "pending") === "done").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="flex border-b border-[#E2E8F0]"
    >
      <div className={cn("sticky left-0 z-20 shrink-0 border-r border-[#E2E8F0] px-3.5 py-3", visual.bg)} style={{ width: LABEL_WIDTH }}>
        <button type="button" onClick={onToggleCollapse} className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left">
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", visual.iconBg, visual.iconText)}>
            {dbStatus === "completed" ? <CheckCircle2 size={13} /> : phase.number}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={cn(spaceGrotesk.className, "truncate text-[12.5px] font-bold text-[#0F172A]")}>{phase.name}</span>
              {dbStatus === "active" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#2563EB]" />}
            </div>
            <div className={cn(jetBrainsMono.className, "truncate text-[10px] text-[#94A3B8]")}>
              D{phase.dayStart}–{phase.dayEnd} · {doneCount}/{phase.deliverables.length}
            </div>
          </div>
          {collapsed ? <ChevronRight size={14} className="shrink-0 text-[#94A3B8]" /> : <ChevronDown size={14} className="shrink-0 text-[#94A3B8]" />}
        </button>
      </div>

      <div
        className="relative overflow-visible"
        style={{ width: TOTAL_DAYS * DAY_WIDTH, height: collapsed ? 0 : laneHeight, paddingTop: collapsed ? 0 : LANE_TOP_PADDING }}
      >
        {!collapsed && phase.deliverables.map((d, i) => {
          const subInternal = phase.number === 1 ? internalDeliverablesForSubPhase(d.key) : [];
          return (
            <DeliverableCard
              key={d.key}
              d={d}
              track={tracks[i]}
              status={deliverableStatusMap.get(d.key) ?? "pending"}
              interactive={interactive}
              internalItems={subInternal}
              internalByKey={internalByKey}
              expanded={expandedDeliverable === d.key}
              onToggleExpand={() => onExpandDeliverable(expandedDeliverable === d.key ? null : d.key)}
              phaseNumber={phase.number}
              phaseVisual={visual}
              startDate={startDate}
              onOpenWizardStep={interactive ? () => onOpenWizardStep(d.key) : undefined}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Jump to phase menu ────────────────────────────────────────────────────────

function JumpToPhaseMenu({
  open, setOpen, note, setNote, onJump, jumping,
}: {
  open: boolean; setOpen: (v: boolean) => void; note: string; setNote: (v: string) => void;
  onJump: (phaseNumber: number) => void; jumping: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-medium text-[#475569] transition-colors hover:border-[#CBD5E1]"
      >
        <Flag size={13} /> Jump to phase <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-64 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-lg">
          <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Manually tag starting phase</div>
          {PROGRAMME_PHASES.map((p) => (
            <button
              key={p.number}
              type="button"
              onClick={() => onJump(p.number)}
              disabled={jumping}
              className="w-full cursor-pointer border-none bg-transparent px-3.5 py-2 text-left text-[13px] text-[#0F172A] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              {p.name} (Day {p.dayStart}–{p.dayEnd})
            </button>
          ))}
          <div className="px-3.5 pb-3.5 pt-1">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note…"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-center">
      <div className={cn(spaceGrotesk.className, "text-sm font-bold text-[#0F172A]")}>{value}</div>
      <div className="whitespace-nowrap text-[9px] uppercase tracking-wide text-[#94A3B8]">{label}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingDetail({ project }: OnboardingDetailProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programmeStartedAt, setProgrammeStartedAt] = useState<string | null>(null);
  const [phases, setPhases] = useState<CustomerPhaseRow[]>([]);
  const [deliverables, setDeliverables] = useState<CustomerDeliverableRow[]>([]);
  const [internalDeliverables, setInternalDeliverables] = useState<OnboardingInternalDeliverableRow[]>([]);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<number>>(new Set());
  const [expandedDeliverable, setExpandedDeliverable] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStartStepKey, setWizardStartStepKey] = useState<string | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpNote, setJumpNote] = useState("");
  const [jumping, setJumping] = useState(false);
  const isMountedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledToTodayRef = useRef(false);

  const fetchProgramme = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/programme`);
      if (!res.ok) throw new Error("Failed to load programme data");
      const data = await res.json();
      if (!isMountedRef.current) return;
      setProgrammeStartedAt(data.programme_started_at ?? null);
      setPhases(data.phases ?? []);
      setDeliverables(data.deliverables ?? []);
      setInternalDeliverables(data.internal_deliverables ?? []);
      setError(null);
    } catch {
      if (isMountedRef.current) setError("Failed to load onboarding programme data.");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetch(`/api/projects/${project.id}/programme`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load programme data");
        const data = await res.json();
        if (!isMountedRef.current) return;
        setProgrammeStartedAt(data.programme_started_at ?? null);
        setPhases(data.phases ?? []);
        setDeliverables(data.deliverables ?? []);
        setInternalDeliverables(data.internal_deliverables ?? []);
        setError(null);
      })
      .catch(() => { if (isMountedRef.current) setError("Failed to load onboarding programme data."); })
      .finally(() => { if (isMountedRef.current) setLoading(false); });
    return () => { isMountedRef.current = false; };
  }, [project.id]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`v2_onboarding_${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_phases", filter: `project_id=eq.${project.id}` }, (payload) => {
        const row = payload.new as CustomerPhaseRow;
        if (!row?.id) return;
        setPhases((prev) => {
          const idx = prev.findIndex((p) => p.id === row.id);
          if (idx === -1) return [...prev, row].sort((a, b) => a.phase_number - b.phase_number);
          const next = [...prev];
          next[idx] = row;
          return next;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_deliverables", filter: `project_id=eq.${project.id}` }, (payload) => {
        const row = payload.new as CustomerDeliverableRow;
        if (!row?.id) return;
        setDeliverables((prev) => {
          const idx = prev.findIndex((d) => d.id === row.id);
          if (idx === -1) return [...prev, row];
          const next = [...prev];
          next[idx] = row;
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project.id]);

  // Wheel-to-horizontal-scroll: hovering the Gantt grid pans it left/right on wheel/trackpad input
  // instead of scrolling the page. Native `addEventListener` (not JSX onWheel) is required so
  // preventDefault() works — React's synthetic wheel listener is passive by default.
  function handleGridWheel(e: WheelEvent) {
    const el = scrollRef.current;
    if (!el) return;
    if (e.ctrlKey) return; // preserve native pinch-zoom
    if (el.scrollWidth <= el.clientWidth) return; // nothing to pan
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    e.preventDefault();
    el.scrollLeft += delta;
  }

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/start`, { method: "POST" });
      if (!res.ok) throw new Error();
      await fetchProgramme();
    } catch {
      setError("Failed to start the 120-Day Programme.");
    } finally {
      setStarting(false);
    }
  };

  const handleJump = async (phaseNumber: number) => {
    setJumping(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_number: phaseNumber, note: jumpNote.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      setJumpOpen(false);
      setJumpNote("");
      await fetchProgramme();
    } catch {
      setError("Failed to update the programme phase.");
    } finally {
      setJumping(false);
    }
  };

  const handleOpenWizardStep = (deliverableKey: string) => {
    setWizardStartStepKey(deliverableKey);
    setWizardOpen(true);
  };

  const backLink = (
    <button
      type="button"
      onClick={() => router.push(V2_ROUTES.ONBOARDING)}
      className={cn(inter.className, "mb-3 flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-xs text-[#64748B] transition-colors hover:text-[#2563EB]")}
    >
      <ArrowLeft size={13} /> Back to Onboarding
    </button>
  );

  if (wizardOpen) {
    return (
      <div className={cn(inter.className, "min-h-full bg-[#F8FAFC] px-7 py-8")}>
        {backLink}
        <OnboardingWizard
          project={project}
          deliverables={deliverables.filter((d) => d.phase_number === 1)}
          internalDeliverables={internalDeliverables}
          wizardData={(phases.find((p) => p.phase_number === 1)?.wizard_data as Record<string, unknown>) ?? {}}
          currentDay={programmeStartedAt ? getCurrentProgrammeDay(programmeStartedAt) : 1}
          isDark={false}
          initialStepKey={wizardStartStepKey}
          onBack={() => { setWizardOpen(false); setWizardStartStepKey(undefined); fetchProgramme(); }}
          onDeliverableChange={(updated) => setDeliverables((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))}
          onInternalDeliverableChange={(updated) => setInternalDeliverables((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn(inter.className, "min-h-full bg-[#F8FAFC] px-7 py-8")}>
        {backLink}
        <div className="py-12 text-center text-[13px] text-[#94A3B8]">Loading onboarding programme…</div>
      </div>
    );
  }

  if (!programmeStartedAt) {
    return (
      <div className={cn(inter.className, "min-h-full bg-[#F8FAFC] px-7 py-8")}>
        {backLink}
        <div className="mx-auto max-w-[560px] rounded-2xl border border-[#E2E8F0] bg-white p-10 text-center shadow-[0_4px_24px_rgba(15,23,42,0.07)]">
          <CalendarClock size={32} className="mx-auto mb-4 text-[#94A3B8]" />
          <div className={cn(spaceGrotesk.className, "text-lg font-bold text-[#0F172A]")}>{project.name}</div>
          <div className="mb-3 text-[13px] text-[#64748B]">{project.company_name}</div>
          <p className="mx-auto mb-6 max-w-md text-[13px] text-[#64748B]">
            Start the 120-day programme to begin tracking Phase 1 — or jump straight to whichever phase they&apos;re actually starting from.
          </p>
          {error && <p className="mb-3 text-xs text-[#DC2626]">{error}</p>}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border-none bg-[#2563EB] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <PlayCircle size={15} /> {starting ? "Starting…" : "Start Onboarding"}
            </button>
            <JumpToPhaseMenu open={jumpOpen} setOpen={setJumpOpen} note={jumpNote} setNote={setJumpNote} onJump={handleJump} jumping={jumping} />
          </div>
        </div>
      </div>
    );
  }

  const currentDay = getCurrentProgrammeDay(programmeStartedAt);
  const startDate = new Date(programmeStartedAt);
  const activePhaseNumber = phases.find((p) => p.status === "active")?.phase_number ?? getPhaseForDay(currentDay).number;
  const activePhase = PROGRAMME_PHASES.find((p) => p.number === activePhaseNumber) ?? PROGRAMME_PHASES[0];
  const isComplete = phases.find((p) => p.phase_number === 5)?.status === "completed";
  const progressPct = Math.min(100, Math.round((currentDay / 120) * 100));
  const phaseStatusMap = new Map(phases.map((p) => [p.phase_number, p.status]));
  const deliverableStatusMap = new Map(deliverables.map((d) => [d.deliverable_key, d.status]));
  const remindersDeliverableMap = new Map(deliverables.filter((d) => d.phase_number === 1).map((d) => [d.deliverable_key, d.status]));
  const reminders = buildReminders(currentDay, phaseStatusMap, remindersDeliverableMap);
  const visual = PHASE_VISUALS[activePhaseNumber] ?? PHASE_VISUALS[1];
  const internalByKey = new Map(internalDeliverables.map((d) => [d.deliverable_key, d]));
  const isManualOverride = phases.find((p) => p.phase_number === activePhaseNumber)?.is_manual_override;

  const totalDeliverables = PROGRAMME_PHASES.reduce((s, p) => s + p.deliverables.length, 0);
  const doneDeliverables = deliverables.filter((d) => d.status === "done").length;
  const phasesCompleted = phases.filter((p) => p.status === "completed").length;
  const daysRemaining = Math.max(0, 120 - currentDay);

  function scrollToToday(behavior: ScrollBehavior = "auto") {
    if (!scrollRef.current) return;
    const target = Math.max(0, LABEL_WIDTH + (currentDay - 1) * DAY_WIDTH - (scrollRef.current.clientWidth - LABEL_WIDTH) / 2);
    scrollRef.current.scrollTo({ left: target, behavior });
  }

  const days = Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1);

  return (
    <div className={cn(inter.className, "min-h-full bg-[#F8FAFC] px-7 py-8")}>
      {backLink}

      <div className="flex flex-col gap-4">
        {/* Header card */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 text-xs text-[#64748B]">{project.company_name}</div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cn(spaceGrotesk.className, "text-lg font-bold text-[#0F172A]")}>{project.name}</span>
                {isComplete ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F0FDF4] px-2.5 py-0.5 text-[11px] font-semibold text-[#16A34A]">
                    <CheckCircle2 size={11} /> Complete
                  </span>
                ) : (
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", visual.iconBg, visual.iconText)}>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                    Phase {activePhaseNumber}: {activePhase.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-[#64748B]">
                <span className="inline-flex items-center gap-1">
                  <Users size={12} /> Owner: {activePhase.owner}
                </span>
                {isManualOverride && <span className="text-[#7C3AED]">Manually tagged</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <JumpToPhaseMenu open={jumpOpen} setOpen={setJumpOpen} note={jumpNote} setNote={setJumpNote} onJump={handleJump} jumping={jumping} />
              {!isComplete && activePhaseNumber === 1 && (
                <button
                  type="button"
                  onClick={() => { setWizardStartStepKey(undefined); setWizardOpen(true); }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border-none bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(37,99,235,0.3)]"
                >
                  <PlayCircle size={14} /> Onboarding Wizard
                </button>
              )}
            </div>
          </div>
          {error && <p className="mb-2 text-xs text-[#DC2626]">{error}</p>}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex min-w-[240px] flex-1 items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-700", isComplete ? "bg-[#16A34A]" : visual.solid)}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className={cn(spaceGrotesk.className, "shrink-0 text-lg font-bold text-[#0F172A]")}>
                Day {currentDay}
                <span className="ml-1 text-xs font-normal text-[#94A3B8]">/ 120</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatChip label="Days left" value={daysRemaining} />
              <StatChip label="Phases done" value={phasesCompleted} />
              <StatChip label="Deliverables" value={`${doneDeliverables}/${totalDeliverables}`} />
            </div>
          </div>
        </div>

        {/* Reminders strip */}
        {reminders.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {reminders.map((r) => {
              const s = REMINDER_STYLE[r.type];
              return (
                <div key={r.key} className={cn("flex max-w-[320px] items-start gap-2 rounded-lg border px-3 py-2", s.bg, s.border)}>
                  <div className="mt-0.5 shrink-0">{s.icon}</div>
                  <div className="min-w-0">
                    <div className={cn("text-[11.5px] font-semibold", s.title)}>{r.title}</div>
                    <div className="text-[11px] text-[#64748B]">{r.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Gantt grid */}
        <div className="relative rounded-2xl border border-[#E2E8F0] bg-white pt-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div
            ref={(node) => {
              // Runs on every render where this callback ref's identity changes (i.e. every
              // render, since it's inline) — attach/detach directly here instead of a separate
              // effect keyed off unrelated state, so the listener can never end up permanently
              // unattached due to a dependency array missing the render where the node mounts
              // (e.g. after a Jump-to-Phase update, or any other state change that doesn't touch
              // `loading`/`programmeStartedAt`).
              if (scrollRef.current) scrollRef.current.removeEventListener("wheel", handleGridWheel);
              scrollRef.current = node;
              if (!node) return;
              node.addEventListener("wheel", handleGridWheel, { passive: false });
              if (!scrolledToTodayRef.current) {
                scrolledToTodayRef.current = true;
                requestAnimationFrame(() => scrollToToday("auto"));
              }
            }}
            className="overflow-x-auto rounded-2xl"
          >
            <div className="relative" style={{ width: LABEL_WIDTH + TOTAL_DAYS * DAY_WIDTH }}>
              <div className="flex border-b border-[#E2E8F0]">
                <div className="sticky left-0 z-20 shrink-0 border-r border-[#E2E8F0] bg-white" style={{ width: LABEL_WIDTH }} />
                {days.map((day) => (
                  <DateColumnHeader key={day} date={addDays(startDate, day - 1)} isToday={day === currentDay} />
                ))}
              </div>

              {currentDay <= TOTAL_DAYS && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-10 w-0 border-l-2 border-dashed border-[#F97316]"
                  style={{ left: LABEL_WIDTH + (currentDay - 1) * DAY_WIDTH + DAY_WIDTH / 2 }}
                >
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-[#FED7AA] bg-[#FFF7ED] px-1.5 py-0.5 text-[9px] font-bold text-[#F97316]">
                    Day {currentDay}
                  </div>
                </div>
              )}

              {PROGRAMME_PHASES.map((phase, index) => (
                <Swimlane
                  key={phase.number}
                  phase={phase}
                  dbStatus={phaseStatusMap.get(phase.number) ?? "not_started"}
                  deliverableStatusMap={deliverableStatusMap}
                  internalByKey={internalByKey}
                  collapsed={collapsedPhases.has(phase.number)}
                  onToggleCollapse={() =>
                    setCollapsedPhases((prev) => {
                      const next = new Set(prev);
                      if (next.has(phase.number)) next.delete(phase.number);
                      else next.add(phase.number);
                      return next;
                    })
                  }
                  onOpenWizardStep={handleOpenWizardStep}
                  expandedDeliverable={expandedDeliverable}
                  onExpandDeliverable={setExpandedDeliverable}
                  index={index}
                  startDate={startDate}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => scrollToToday("smooth")}
        aria-label="Jump to today"
        className="fixed bottom-8 right-8 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-none bg-[#F97316] text-white shadow-[0_4px_16px_rgba(249,115,22,0.4)] transition-transform hover:scale-105"
      >
        <Locate size={20} />
      </button>
    </div>
  );
}
