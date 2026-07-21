"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarClock, Flag, Bell, CheckCircle2, Check, Clock, ChevronDown, ChevronRight, PlayCircle,
  Users, AlertTriangle, Info, ArrowLeft, ListChecks, Locate, Crown, X, ShieldAlert,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { createClient } from "@/lib/supabase/client";
import { V2_ROUTES } from "@/config/constants";
import {
  PROGRAMME_PHASES, getCurrentProgrammeDay, getPhaseForDay, getPhaseByNumber,
  internalDeliverablesForSubPhase, type PhaseConfig, type DeliverableConfig,
} from "@/config/customer-phases";
import type { CustomerPhaseRow, CustomerDeliverableRow, OnboardingInternalDeliverableRow } from "@/types/database";
import { isRoleGatedByMembership, canManageProjectMembers, canSetProjectOwner, canManagePhase1Membership } from "@/lib/programme/membership-rules";
import OnboardingWizard from "./_onboarding-wizard";
import { stepKeyToWizardParams, FIRST_WIZARD_STEP_PARAMS } from "./_wizard-step-params";

// Shared shape for both project_members and phase_members rows (task 155 gave both an
// is_owner column, mirroring each other exactly).
type MemberRow = { id: string; user_id: string; is_owner: boolean; full_name: string | null; role: string | null };

interface OnboardingDetailProps {
  project: {
    id: string;
    name: string;
    customer_id: string;
    project_id: string | null;
    company_name: string;
    contact_name: string | null;
    contact_email: string | null;
    primary_contact_phone: string | null;
    // Task 157: real owner display (replacing the static "Owner: Bert" config label) +
    // canManageProjectMembers/canSetProjectOwner's "is this caller the creator" check.
    created_by: string | null;
    created_by_name: string | null;
    // Chat follow-up to task 157: surfaces the New Project intake's "Save + Set Schedule" state
    // on the not-started card — when to expect auto-start and which phase, plus a way to
    // override it (start now, at the scheduled phase or a different one).
    scheduled_onboarding_start_at: string | null;
    scheduled_start_phase: number | null;
  };
  // Task 150(c): set when the page's ?phase=&deliverable= query params resolved to a real
  // deliverable key (see _wizard-step-params.ts) — opens the wizard immediately on that step
  // instead of the closed Timeline. Undefined on the plain /v2/portfolio-tracker/[projectId] URL.
  initialWizardStepKey?: string;
  // Task 146: pm/developer can view the Timeline read-only; pm additionally gets the Wizard
  // (read-only on steps 1-5/7, full Step 6 file/folder access) — developer never opens it.
  role: string | null;
  // Task 153/155/157: project/phase membership — gates Wizard entry for marketing/pm, drives
  // the owner/collaborator management UI, and who can manage project members/ownership.
  currentUserId: string;
  phase1Members: MemberRow[];
  projectMembers: MemberRow[];
}

// ─── Gantt grid constants ─────────────────────────────────────────────────────

const TOTAL_DAYS = 120;
const DAY_WIDTH = 80;
const ROW_HEIGHT = 56;
const ROW_GAP = 6;
const LABEL_WIDTH = 200;
// Extra top space in each swimlane row so track-0 deliverable cards' internal-deliverables badge
// (which pokes above the card via `-top-1.5`) has room to render without being clipped.
const LANE_TOP_PADDING = 8;
// Vertical breathing room within each track's ROW_HEIGHT slot — shrinks the rendered card height
// by 2x this amount so it sits centered in its row instead of flush against the top edge.
const CARD_INSET = 8;

// ─── Per-phase palette — DESIGN.md's fixed 5-phase-hue vocabulary (task 168), matching the same
// values already shipped in dashboard-shared.tsx's PHASE_TONE/PHASE_GRADIENT (tasks 166/167):
// Onboard=orange, Migrate & Rebrand=blue, Publish=violet, AI Visibility=teal, Optimize=green.
// A phase hue is never reused for a non-phase meaning — this replaces the old, unrelated
// blue/violet/teal/amber/slate mapping this file used before v2.0.

type PhaseVisual = { border: string; bg: string; ring: string; text: string; solid: string; iconBg: string; iconText: string };

const PHASE_VISUALS: Record<number, PhaseVisual> = {
  1: { border: "border-[#E2762F]", bg: "bg-[#FFEFE3]", ring: "shadow-[0_0_0_3px_rgba(226,118,47,0.12)]", text: "text-[#E2762F]", solid: "bg-[#E2762F]", iconBg: "bg-[#E2762F]/15", iconText: "text-[#E2762F]" },
  2: { border: "border-[#0063D6]", bg: "bg-[#E5F1FF]", ring: "shadow-[0_0_0_3px_rgba(0,99,214,0.12)]", text: "text-[#0063D6]", solid: "bg-[#0063D6]", iconBg: "bg-[#0063D6]/15", iconText: "text-[#0063D6]" },
  3: { border: "border-[#6A48E0]", bg: "bg-[#EFEAFD]", ring: "shadow-[0_0_0_3px_rgba(106,72,224,0.12)]", text: "text-[#6A48E0]", solid: "bg-[#6A48E0]", iconBg: "bg-[#6A48E0]/15", iconText: "text-[#6A48E0]" },
  4: { border: "border-[#0B8A93]", bg: "bg-[#E2F6F7]", ring: "shadow-[0_0_0_3px_rgba(11,138,147,0.12)]", text: "text-[#0B8A93]", solid: "bg-[#0B8A93]", iconBg: "bg-[#0B8A93]/15", iconText: "text-[#0B8A93]" },
  5: { border: "border-[#177E48]", bg: "bg-[#E3F5EA]", ring: "shadow-[0_0_0_3px_rgba(23,126,72,0.12)]", text: "text-[#177E48]", solid: "bg-[#177E48]", iconBg: "bg-[#177E48]/15", iconText: "text-[#177E48]" },
};

// Raw hex twins of PHASE_VISUALS' colors — needed for the DeliverableCard progress-fill/stripe
// gradients, which are computed dynamically (percentage-driven) and can't be static Tailwind classes.
const PHASE_HEX: Record<number, string> = {
  1: "#E2762F",
  2: "#0063D6",
  3: "#6A48E0",
  4: "#0B8A93",
  5: "#177E48",
};

// ─── Reminder chip palette ─────────────────────────────────────────────────────

type ReminderItem = { key: string; type: "warning" | "reminder" | "info" | "success"; title: string; body: string };

const REMINDER_STYLE: Record<ReminderItem["type"], { bg: string; border: string; title: string; icon: React.ReactNode }> = {
  warning: { bg: "bg-[#FFF3D6]", border: "border-[#F0D896]", title: "text-[#8A5A00]", icon: <AlertTriangle size={13} className="text-[#8A5A00]" /> },
  reminder: { bg: "bg-[#E5F1FF]", border: "border-[#BBDCFF]", title: "text-[#0063D6]", icon: <Bell size={13} className="text-[#007BFF]" /> },
  info: { bg: "bg-[#EDF0F7]", border: "border-[#E2E7F2]", title: "text-[#0B1533]", icon: <Info size={13} className="text-[#5F6A88]" /> },
  success: { bg: "bg-[#E3F5EA]", border: "border-[#BEE7CD]", title: "text-[#177E48]", icon: <CheckCircle2 size={13} className="text-[#177E48]" /> },
};

function buildReminders(day: number, phaseStatus: Map<number, string>, deliverableStatus: Map<string, string>): ReminderItem[] {
  if (phaseStatus.get(5) === "completed") {
    return [{ key: "done", type: "success", title: "Programme complete", body: "All 5 phases delivered." }];
  }
  const activePhaseNumber = [...phaseStatus.entries()].find(([, status]) => status === "active")?.[0];
  const phase = activePhaseNumber ? getPhaseByNumber(activePhaseNumber) : getPhaseForDay(day);
  const items: ReminderItem[] = [];
  // Phase 1 is a fixed 15-day window — if it's still active well past Day 15, this project
  // should already be in a later phase (e.g. a CSV-imported Kickoff Date that's more than 15
  // days old). One clear phase-level warning here is more useful than 5+ individual
  // "Overdue: {deliverable}" entries competing for the reminder strip's slots.
  if (phase.number === 1 && day > 15) {
    items.push({
      key: "phase1-overdue",
      type: "warning",
      title: "Phase 1 Overdue",
      body: `Day ${day} — past the 15-day Onboarding window. This project should already be in a later phase.`,
    });
  } else if (phase.number === 1) {
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

// DESIGN.md's fixed 6-color avatar rotation, matching AVATAR_COLORS already used in
// pm-dashboard.tsx / _onboarding-list.tsx (tasks 166/167) for app-wide consistency.
const PERSON_COLOR: Record<string, string> = {
  Bert: "bg-[#0063D6]", PM: "bg-[#6A48E0]", Dev: "bg-[#0B8A93]", Jun: "bg-[#B85512]",
  Erica: "bg-[#177E48]", April: "bg-[#44508A]", Eri: "bg-[#0063D6]", Strategy: "bg-[#B85512]",
};
const DEFAULT_PERSON_COLOR = "bg-[#5F6A88]";

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
      className={cn("flex h-12 shrink-0 flex-col items-center justify-center border-r border-[#EDF0F7]", isToday && "bg-[#FFEFE3]")}
      style={{ width: DAY_WIDTH }}
    >
      <div className={cn("font-mono text-[9px] tracking-wide", isToday ? "font-bold text-[#FB914E]" : "text-[#5F6A88]")}>
        {date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
      </div>
      <div className={cn("text-[11px] font-semibold", isToday ? "text-[#FB914E]" : "text-[#3A4565]")}>{date.getDate()}</div>
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
      <circle cx={cx} cy={cx} r={pieR} strokeWidth={1} className="fill-white stroke-[#E2E7F2]" />
      {wedgePath && <path d={wedgePath} className={cn("fill-current", colorClass, "opacity-50")} />}
    </svg>
  );
}

// Drag-resize/move (task 148) — resize-left/resize-right change one edge only; move shifts both.
// Custom onPointerDown/pointermove/pointerup (not @dnd-kit, which this file already avoids —
// see task 148 doc's rationale) with pointer capture so move/up keep firing on the captor even
// if the cursor leaves it, clamped to the deliverable's own phase day range every frame.
type DragMode = "resize-left" | "resize-right" | "move";
type DragState = { mode: DragMode; startClientX: number; startDayStart: number; startDayEnd: number; moved: boolean };

function clampDragToPhase(mode: DragMode, dayStart: number, dayEnd: number, phaseDayStart: number, phaseDayEnd: number): { dayStart: number; dayEnd: number } {
  if (mode === "move") {
    const span = dayEnd - dayStart;
    let s = dayStart;
    let e = dayEnd;
    if (s < phaseDayStart) { s = phaseDayStart; e = s + span; }
    if (e > phaseDayEnd) { e = phaseDayEnd; s = e - span; }
    return { dayStart: Math.max(phaseDayStart, s), dayEnd: Math.min(phaseDayEnd, e) };
  }
  const s = Math.max(phaseDayStart, dayStart);
  const e = Math.min(phaseDayEnd, dayEnd);
  if (mode === "resize-left") return { dayStart: Math.min(s, e), dayEnd: e };
  return { dayStart: s, dayEnd: Math.max(s, e) };
}

function DeliverableCard({
  d, track, status, interactive, internalItems, internalByKey, expanded, onToggleExpand,
  phaseNumber, phaseVisual, startDate, onOpenWizardStep, canEditSchedule, phaseDayStart, phaseDayEnd, onScheduleChange,
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
  onScheduleChange?: (dayStart: number, dayEnd: number) => void;
}) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [livePreview, setLivePreview] = useState<{ dayStart: number; dayEnd: number } | null>(null);
  const suppressClickRef = useRef(false);

  const effectiveDayStart = livePreview?.dayStart ?? d.dayStart;
  const effectiveDayEnd = livePreview?.dayEnd ?? d.dayEnd;
  const left = (effectiveDayStart - 1) * DAY_WIDTH;
  const width = (effectiveDayEnd - effectiveDayStart + 1) * DAY_WIDTH - 4;
  const top = track * (ROW_HEIGHT + ROW_GAP) + CARD_INSET;

  function beginDrag(mode: DragMode, e: React.PointerEvent) {
    if (!canEditSchedule) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragState({ mode, startClientX: e.clientX, startDayStart: d.dayStart, startDayEnd: d.dayEnd, moved: false });
    setLivePreview({ dayStart: d.dayStart, dayEnd: d.dayEnd });
  }

  function handleDragMove(e: React.PointerEvent) {
    if (!dragState) return;
    const deltaPx = e.clientX - dragState.startClientX;
    const deltaDays = Math.round(deltaPx / DAY_WIDTH);
    let newStart = dragState.startDayStart;
    let newEnd = dragState.startDayEnd;
    if (dragState.mode === "resize-right") newEnd = dragState.startDayEnd + deltaDays;
    else if (dragState.mode === "resize-left") newStart = dragState.startDayStart + deltaDays;
    else { newStart = dragState.startDayStart + deltaDays; newEnd = dragState.startDayEnd + deltaDays; }
    setLivePreview(clampDragToPhase(dragState.mode, newStart, newEnd, phaseDayStart, phaseDayEnd));
    if (!dragState.moved && Math.abs(deltaPx) > 4) {
      suppressClickRef.current = true;
      setDragState((prev) => (prev ? { ...prev, moved: true } : prev));
    }
  }

  function endDrag() {
    if (!dragState) return;
    const changed = dragState.moved && livePreview && (livePreview.dayStart !== d.dayStart || livePreview.dayEnd !== d.dayEnd);
    if (changed && livePreview) onScheduleChange?.(livePreview.dayStart, livePreview.dayEnd);
    setDragState(null);
    setLivePreview(null);
  }

  function handleCardClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (interactive) onOpenWizardStep?.();
  }
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
      onPointerMove={handleDragMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={handleCardClick}
        onPointerDown={(e) => beginDrag("move", e)}
        title={d.name}
        style={barStyle}
        className={cn(
          "relative flex h-full w-full items-center gap-2 overflow-hidden rounded-[10px] border-[1.5px] px-2.5 text-left transition-colors",
          percentage >= 100 ? "border-transparent" : "border-[#E2E7F2]",
          interactive && "hover:border-[#A8C6F5]",
          canEditSchedule ? (dragState ? "cursor-grabbing" : "cursor-grab") : interactive ? "cursor-pointer" : "cursor-default"
        )}
      >
        {canEditSchedule && (
          <>
            <div
              onPointerDown={(e) => beginDrag("resize-left", e)}
              className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-black/0 transition-colors hover:bg-black/15"
            />
            <div
              onPointerDown={(e) => beginDrag("resize-right", e)}
              className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-black/0 transition-colors hover:bg-black/15"
            />
          </>
        )}
        <ProgressRing percentage={percentage} colorClass={percentage >= 100 ? "text-white/50" : phaseVisual.text} />
        <span
          ref={titleRef}
          className={cn(
            "min-w-0 flex-1 truncate text-[11.5px] font-medium",
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

      {internalItems.length > 0 && (
        <button
          ref={badgeRef}
          type="button"
          onClick={onToggleExpand}
          className="absolute -right-1.5 -top-1.5 z-9 flex h-4.5 cursor-pointer items-center gap-0.5 rounded-full border border-[#E2E7F2] bg-white px-1.5 text-[8px] font-bold text-[#5F6A88] shadow-sm"
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
              className="fixed z-50 w-56 rounded-xl border border-[#E2E7F2] bg-white p-1.5 shadow-lg"
              style={{ top: popoverPos.top, left: popoverPos.left }}
            >
              <div className="px-2 pb-1 pt-1 text-[9px] font-bold uppercase tracking-wide text-[#5F6A88]">Checklist</div>
              {internalItems.map((item) => {
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
                    onClick={interactive ? onOpenWizardStep : undefined}
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
        )}

      {hovered && hoverPos && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-50 w-64 pointer-events-none rounded-xl border border-[#E2E7F2] bg-white p-3 shadow-lg"
            style={{ top: hoverPos.top, left: hoverPos.left }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[12.5px] font-bold text-[#0B1533]">{d.name}</div>
              <span className={cn("font-mono shrink-0 text-[10px] font-bold", phaseVisual.text)}>{percentage}%</span>
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
            <div className={cn("font-mono mt-2 flex items-center gap-1 text-[10px] text-[#5F6A88]")}>
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
  phase, dbStatus, deliverableStatusMap, deliverableOverrideMap, internalByKey, collapsed, onToggleCollapse,
  onOpenWizardStep, expandedDeliverable, onExpandDeliverable, index, startDate, role, canEditSchedule, onScheduleChange,
}: {
  phase: PhaseConfig;
  dbStatus: string;
  deliverableStatusMap: Map<string, string>;
  deliverableOverrideMap: Map<string, { dayStart: number; dayEnd: number }>;
  internalByKey: Map<string, OnboardingInternalDeliverableRow>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenWizardStep: (key: string) => void;
  expandedDeliverable: string | null;
  onExpandDeliverable: (key: string | null) => void;
  index: number;
  startDate: Date;
  role: string | null;
  canEditSchedule: boolean;
  onScheduleChange: (phaseNumber: number, deliverableKey: string, dayStart: number, dayEnd: number) => void;
}) {
  const visual = PHASE_VISUALS[phase.number];
  // Developer never opens the Wizard (task 146) — Phase 1 bars stay inert for that role.
  const interactive = phase.number === 1 && role !== "developer";
  // Effective span = per-project override (migration 071) ?? the static config default — never
  // mutates PROGRAMME_PHASES, which is shared by every customer.
  const effectiveDeliverables = phase.deliverables.map((d) => {
    const override = deliverableOverrideMap.get(d.key);
    return override ? { ...d, dayStart: override.dayStart, dayEnd: override.dayEnd } : d;
  });
  const tracks = assignTracks(effectiveDeliverables.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd })));
  const trackCount = tracks.length > 0 ? Math.max(...tracks) + 1 : 1;
  const laneHeight = trackCount * ROW_HEIGHT + (trackCount - 1) * ROW_GAP + 8 + LANE_TOP_PADDING;
  const doneCount = phase.deliverables.filter((d) => (deliverableStatusMap.get(d.key) ?? "pending") === "done").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="flex border-b border-[#E2E7F2]"
    >
      <div className={cn("sticky left-0  z-2 shrink-0 border-r border-[#E2E7F2] px-3.5 py-3", visual.bg)} style={{ width: LABEL_WIDTH }}>
        <button type="button" onClick={onToggleCollapse} className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left">
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", visual.iconBg, visual.iconText)}>
            {dbStatus === "completed" ? <CheckCircle2 size={13} /> : phase.number}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={cn("truncate text-[12.5px] font-bold text-[#0B1533]")}>{phase.name}</span>
              {dbStatus === "active" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse motion-reduce:animate-none rounded-full bg-[#007BFF]" />}
            </div>
            <div className={cn("font-mono truncate text-[10px] text-[#5F6A88]")}>
              D{phase.dayStart}–{phase.dayEnd} · {doneCount}/{phase.deliverables.length}
            </div>
          </div>
          {collapsed ? <ChevronRight size={14} className="shrink-0 text-[#5F6A88]" /> : <ChevronDown size={14} className="shrink-0 text-[#5F6A88]" />}
        </button>
      </div>

      <div
        className="relative overflow-visible z-1"
        style={{ width: TOTAL_DAYS * DAY_WIDTH, height: collapsed ? 0 : laneHeight, paddingTop: collapsed ? 0 : LANE_TOP_PADDING }}
      >
        {!collapsed && effectiveDeliverables.map((d, i) => {
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
              canEditSchedule={canEditSchedule}
              phaseDayStart={phase.dayStart}
              phaseDayEnd={phase.dayEnd}
              onScheduleChange={(dayStart, dayEnd) => onScheduleChange(phase.number, d.key, dayStart, dayEnd)}
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
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E2E7F2] bg-white px-3 py-2 text-xs font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5]"
      >
        <Flag size={13} /> Jump to phase <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-64 overflow-hidden rounded-xl border border-[#E2E7F2] bg-white shadow-lg">
          <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wider text-[#5F6A88]">Manually tag starting phase</div>
          {PROGRAMME_PHASES.map((p) => (
            <button
              key={p.number}
              type="button"
              onClick={() => onJump(p.number)}
              disabled={jumping}
              className="w-full cursor-pointer border-none bg-transparent px-3.5 py-2 text-left text-[13px] text-[#0B1533] transition-colors hover:bg-[#F4F6FB] disabled:opacity-50"
            >
              {p.name} (Day {p.dayStart}–{p.dayEnd})
            </button>
          ))}
          <div className="px-3.5 pb-3.5 pt-1">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note…"
              className="w-full rounded-lg border border-[#E2E7F2] bg-white px-2.5 py-1.5 text-xs text-[#0B1533] outline-none focus:border-[#007BFF]"
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
    <div className="rounded-lg border border-[#E2E7F2] bg-[#F4F6FB] px-3 py-1.5 text-center">
      <div className={cn("text-sm font-bold text-[#0B1533]")}>{value}</div>
      <div className="whitespace-nowrap text-[9px] uppercase tracking-wide text-[#5F6A88]">{label}</div>
    </div>
  );
}

// ─── Project settings: owner + collaborators (task 153/155/157) ───────────────────────────────
// Task 157: split into two independently-triggered panels (Set Project Owner / Add
// Collaborators) behind a Gear "Project Settings" menu, replacing the single merged panel
// behind an "Access" text button. Read-only avatar display lives in the header row itself
// (AvatarCircle/CollaboratorAvatars below); these panels are the management surfaces.

function AvatarCircle({ name, size = 22, ring }: { name: string | null; size?: number; ring?: boolean }) {
  const initials = (name ?? "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const colors = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
  const bg = colors[(name ?? "?").charCodeAt(0) % colors.length];
  return (
    <div
      title={name ?? "Unnamed"}
      className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white", ring && "ring-2 ring-white")}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.4), background: bg }}
    >
      {initials}
    </div>
  );
}

function CollaboratorAvatars({ members, max = 4 }: { members: MemberRow[]; max?: number }) {
  if (members.length === 0) return <span className="text-[11.5px] text-[#5F6A88]">None yet</span>;
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <div key={m.user_id} className={cn(i > 0 && "-ml-1.5")}>
          <AvatarCircle name={m.full_name} size={22} ring />
        </div>
      ))}
      {overflow > 0 && (
        <div className="-ml-1.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#E2E7F2] text-[9px] font-bold text-[#5F6A88] ring-2 ring-white">
          +{overflow}
        </div>
      )}
    </div>
  );
}

function PersonChip({ label, sublabel, isOwner, onRemove, disabled }: {
  label: string; sublabel: string; isOwner?: boolean; onRemove?: () => void; disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white py-1 pl-1 pr-2 text-[11.5px]">
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#007BFF]/10 text-[9px] font-bold text-[#007BFF]">
        {(label || "?").slice(0, 1).toUpperCase()}
      </div>
      <span className="font-medium text-[#3A4565]">{label}</span>
      <span className="text-[10px] text-[#5F6A88]">{sublabel}</span>
      {isOwner && <Crown size={11} className="text-[#B85512]" aria-label="Owner" />}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          title="Remove"
          aria-label={`Remove ${label}`}
          className="cursor-pointer rounded-full border-none bg-transparent p-0.5 text-[#5F6A88] transition-colors hover:text-[#C0392B] disabled:opacity-50"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

function PanelHeader({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5F6A88]">{label}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        title="Close"
        className="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-0.5 text-[#5F6A88] transition-colors hover:bg-white hover:text-[#3A4565]"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Task 157 — "Set Project Owner": pick a new owner from existing project members (super_admin/
// admin/creator only). Transfer target must already be a collaborator — add them via "Add
// Collaborators" first if they aren't one yet.
function OwnerPanel({ projectMembers, busy, error, onTransferOwnership, onClose }: {
  projectMembers: MemberRow[];
  busy: boolean;
  error: string | null;
  onTransferOwnership: (userId: string) => void;
  onClose: () => void;
}) {
  const owner = projectMembers.find((m) => m.is_owner) ?? null;
  const candidates = projectMembers.filter((m) => !m.is_owner);

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-[#E2E7F2] bg-[#F4F6FB] p-4">
      <PanelHeader label="Set project owner" onClose={onClose} />
      {error && <p className="text-[11.5px] text-[#C0392B]">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {owner ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white py-1 pl-1 pr-2.5 text-[11.5px]">
            <AvatarCircle name={owner.full_name} size={20} />
            <span className="font-medium text-[#3A4565]">{owner.full_name ?? "Unnamed"}</span>
            <Crown size={11} className="text-[#B85512]" aria-label="Current owner" />
          </div>
        ) : (
          <span className="text-[11.5px] text-[#5F6A88]">No owner set yet.</span>
        )}
        <select
          value=""
          disabled={busy || candidates.length === 0}
          onChange={(e) => { if (e.target.value) onTransferOwnership(e.target.value); e.target.value = ""; }}
          className="rounded-full border border-dashed border-[#A8C6F5] bg-white px-2.5 py-1 text-[11px] text-[#5F6A88] disabled:opacity-50"
        >
          <option value="">{candidates.length === 0 ? "No other collaborators yet" : "Transfer to…"}</option>
          {candidates.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.full_name ?? "Unnamed"} ({m.role})</option>
          ))}
        </select>
      </div>
      <p className="text-[10.5px] text-[#5F6A88]">
        The new owner must already be a collaborator — add them first if they aren&apos;t listed.
      </p>
    </div>
  );
}

// Task 155/157 — search-to-add UI mirrors _onboarding-wizard.tsx's renderPersonPicker shape
// (search input + filtered dropdown, immediate-add-on-click, onMouseDown preventDefault so the
// click survives the input's onBlur).
function CollaboratorsPanel({
  projectMembers, staffDirectory, busy, error, onAdd, onRemove, onClose,
}: {
  projectMembers: MemberRow[];
  staffDirectory: { id: string; full_name: string | null; role: string }[];
  busy: boolean;
  error: string | null;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const memberIds = new Set(projectMembers.map((m) => m.user_id));
  // Task 155: any staff role is addable as a project collaborator (was marketing/pm only).
  const candidates = staffDirectory
    .filter((p) => !memberIds.has(p.id))
    .filter((p) => (p.full_name ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mt-4 mb-6 flex flex-col gap-2.5 rounded-xl border border-[#E2E7F2] bg-[#F4F6FB] p-4">
      <PanelHeader label="Add collaborators — who sees this on the Onboarding list" onClose={onClose} />
      {error && <p className="text-[11.5px] text-[#C0392B]">{error}</p>}
      {/* Search sits above the collaborator chips, not beside them. */}
      <div className="relative max-w-xs">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
          onFocus={() => setDropdownOpen(true)}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          disabled={busy}
          placeholder="Search people to add…"
          className="w-full rounded-md border border-[#E2E7F2] bg-white px-2.5 py-1.5 text-[11.5px] text-[#0B1533] outline-none transition-colors placeholder:text-[#5F6A88] focus:border-[#007BFF] disabled:opacity-50"
        />
        {dropdownOpen && (
          <div className="absolute z-30 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-[#E2E7F2] bg-white shadow-lg">
            {candidates.length === 0 ? (
              <div className="px-2.5 py-1.5 text-[11.5px] text-[#5F6A88]">
                {staffDirectory.length === 0 ? "No staff directory entries found." : "No matches."}
              </div>
            ) : (
              candidates.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onAdd(person.id); setSearch(""); }}
                  className="block w-full cursor-pointer border-none bg-transparent px-2.5 py-1.5 text-left text-[11.5px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB]"
                >
                  {person.full_name ?? "Unnamed"} <span className="text-[#5F6A88]">({person.role})</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {projectMembers.length === 0 && <span className="text-[11.5px] text-[#5F6A88]">No collaborators added yet.</span>}
        {projectMembers.map((m) => (
          <PersonChip
            key={m.user_id}
            label={m.full_name ?? "Unnamed"}
            sublabel={m.role ?? ""}
            isOwner={m.is_owner}
            onRemove={!m.is_owner ? () => onRemove(m.user_id) : undefined}
            disabled={busy}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingDetail({
  project, initialWizardStepKey, role, currentUserId, phase1Members: initialPhase1Members, projectMembers: initialProjectMembers,
}: OnboardingDetailProps) {
  const router = useRouter();
  // Task 150(b): the URL segment is the human-readable project_id, not the UUID — falls back
  // to id for the rare legacy row where project_id is unexpectedly null (migration 066).
  const projectUrlKey = project.project_id ?? project.id;
  // Task 146: marketing/admin/super_admin keep full phase-management actions (Start/Jump);
  // pm/developer are view-only at the phase-status level — pm's one write surface is Step 6's
  // file/folder actions inside the Wizard, not anything here on the Timeline.
  const canManagePhases = role !== "pm" && role !== "developer";
  const canOpenWizard = role !== "developer";
  // Task 148: schedule drag-resize/move follows customer_deliverables' own write RLS
  // (migration 070/071) — admin/super_admin/marketing only, independent of canManagePhases.
  const canEditSchedule = role === "admin" || role === "super_admin" || role === "marketing";

  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programmeStartedAt, setProgrammeStartedAt] = useState<string | null>(null);
  const [phases, setPhases] = useState<CustomerPhaseRow[]>([]);
  const [deliverables, setDeliverables] = useState<CustomerDeliverableRow[]>([]);
  const [internalDeliverables, setInternalDeliverables] = useState<OnboardingInternalDeliverableRow[]>([]);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<number>>(new Set());
  const [expandedDeliverable, setExpandedDeliverable] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(!!initialWizardStepKey);
  const [wizardStartStepKey, setWizardStartStepKey] = useState<string | undefined>(initialWizardStepKey);
  const [starting, setStarting] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpNote, setJumpNote] = useState("");
  const [jumping, setJumping] = useState(false);
  // Scheduled-start card's "Select Phase" alternative — excludes the already-scheduled phase.
  const [altPhase, setAltPhase] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const isMountedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledToTodayRef = useRef(false);

  // ─── Task 153/155/157: project/phase membership ────────────────────────────
  const [phase1Members, setPhase1Members] = useState<MemberRow[]>(initialPhase1Members);
  const [projectMembers, setProjectMembers] = useState<MemberRow[]>(initialProjectMembers);
  const [staffDirectory, setStaffDirectory] = useState<{ id: string; full_name: string | null; role: string }[]>([]);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [ownerPanelOpen, setOwnerPanelOpen] = useState(false);
  const [collaboratorsPanelOpen, setCollaboratorsPanelOpen] = useState(false);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const myPhase1Membership = phase1Members.find((m) => m.user_id === currentUserId) ?? null;
  const isPhase1Member = !!myPhase1Membership;
  const isPhase1Owner = !!myPhase1Membership?.is_owner;
  const phase1HasMembers = phase1Members.length > 0;
  // Gated per requirement 4: marketing/pm without membership are blocked once the phase actually
  // has members; a phase with zero members is unrestricted (backward compatibility, see task
  // 153 doc — avoids locking out every already-in-progress onboarding on ship).
  const isPhase1Restricted = isRoleGatedByMembership(role) && phase1HasMembers && !isPhase1Member;
  const canManagePhase1 = canManagePhase1Membership(role, { isMember: isPhase1Member, isOwner: isPhase1Owner });
  // Task 157: both keyed off "is this caller the project creator" rather than plain membership
  // — super_admin/admin/pm/creator can add collaborators; super_admin/admin/creator can set the
  // owner (narrower — no pm).
  const isCreator = !!project.created_by && project.created_by === currentUserId;
  const canManageProjMembers = canManageProjectMembers(role, isCreator);
  const canSetOwner = canSetProjectOwner(role, isCreator);
  const projectOwner = projectMembers.find((m) => m.is_owner) ?? null;
  // "Default to the creator of the project if any" — legacy projects that predate task 153 may
  // have created_by set but no project_members row (and therefore no is_owner match) yet.
  const ownerDisplayName = projectOwner?.full_name ?? project.created_by_name ?? null;
  const collaborators = projectMembers.filter((m) => !m.is_owner);

  // Task 156: only needed for the project-members picker now — Phase 1's own staffDirectory
  // fetch lives inside OnboardingWizard, where that management UI moved to.
  useEffect(() => {
    if (!canManageProjMembers) return;
    let cancelled = false;
    fetch("/api/staff-directory")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { id: string; full_name: string | null; role: string }[]) => {
        if (!cancelled) setStaffDirectory(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [canManageProjMembers]);

  const refetchPhase1Members = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/phases/1/members`);
      if (!res.ok) return;
      const data: { id: string; user_id: string; is_owner: boolean; profiles: { full_name: string | null; role: string } | null }[] = await res.json();
      setPhase1Members(
        data.map((m) => ({ id: m.id, user_id: m.user_id, is_owner: m.is_owner, full_name: m.profiles?.full_name ?? null, role: m.profiles?.role ?? null }))
      );
    } catch { /* leave current state */ }
  };

  const refetchProjectMembers = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/members`);
      if (!res.ok) return;
      const data: { id: string; user_id: string; is_owner: boolean; profiles: { full_name: string | null; role: string } | null }[] = await res.json();
      setProjectMembers(
        data.map((m) => ({ id: m.id, user_id: m.user_id, is_owner: m.is_owner, full_name: m.profiles?.full_name ?? null, role: m.profiles?.role ?? null }))
      );
    } catch { /* leave current state */ }
  };

  const handleAddProjectMember = async (userId: string) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to add project member");
      }
      await refetchProjectMembers();
    } catch (err) {
      setMembershipError(err instanceof Error ? err.message : "Failed to add project member.");
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleRemoveProjectMember = async (userId: string) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/members?user_id=${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to remove project member");
      }
      await refetchProjectMembers();
    } catch (err) {
      setMembershipError(err instanceof Error ? err.message : "Failed to remove project member.");
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleTransferProjectOwnership = async (userId: string) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error();
      await refetchProjectMembers();
    } catch {
      setMembershipError("Failed to transfer project ownership.");
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleAddPhase1Member = async (userId: string) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/phases/1/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error();
      await refetchPhase1Members();
    } catch {
      setMembershipError("Failed to add phase member.");
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleRemovePhase1Member = async (userId: string) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/phases/1/members?user_id=${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to remove phase member");
      }
      await refetchPhase1Members();
    } catch (err) {
      setMembershipError(err instanceof Error ? err.message : "Failed to remove phase member.");
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleTransferPhaseOwnership = async (userId: string) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/phases/1/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error();
      await refetchPhase1Members();
    } catch {
      setMembershipError("Failed to transfer phase ownership.");
    } finally {
      setMembershipBusy(false);
    }
  };

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

  // Scheduled-start card's "Start ... Anyway" and "Proceed" both need this: Phase 1 goes
  // through handleStart (assigns the starter as Phase 1 owner, task 153) same as the normal
  // Start Onboarding button; any other phase goes through the existing Jump-to-phase override,
  // which never assigns phase ownership — phase_members only has a concept for Phase 1.
  const startAtPhase = (phaseNumber: 1 | 2 | 3 | 4 | 5) => (phaseNumber === 1 ? handleStart() : handleJump(phaseNumber));

  const handleOpenWizardStep = (deliverableKey: string) => {
    setWizardStartStepKey(deliverableKey);
    setWizardOpen(true);
    const stepParams = stepKeyToWizardParams(deliverableKey) ?? FIRST_WIZARD_STEP_PARAMS;
    router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}?phase=${stepParams.phase}&deliverable=${stepParams.deliverable}`, { scroll: false });
  };

  const handleScheduleChange = async (phaseNumber: number, deliverableKey: string, dayStart: number, dayEnd: number) => {
    const previous = deliverables;
    setDeliverables((prev) =>
      prev.map((d) =>
        d.phase_number === phaseNumber && d.deliverable_key === deliverableKey
          ? { ...d, day_start_override: dayStart, day_end_override: dayEnd }
          : d
      )
    );
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/deliverables/${deliverableKey}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_number: phaseNumber, day_start: dayStart, day_end: dayEnd }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDeliverables(previous);
      setError("Failed to save the schedule change — reverted.");
    }
  };

  // Task 160: whether Phase 1 is still the DB's active phase — computed from `phases` directly
  // (not the later `phaseStatusMap`, which is declared further down and unreachable from the
  // early-return branches below due to `const` temporal-dead-zone rules).
  const isPhaseActive = phases.find((p) => p.phase_number === 1)?.status === "active";

  const backLink = (
    <button
      type="button"
      onClick={() => router.push(V2_ROUTES.PORTFOLIO_TRACKER)}
      className={cn("mb-3 flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-xs text-[#5F6A88] transition-colors hover:text-[#007BFF]")}
    >
      <ArrowLeft size={13} /> Back to Projects
    </button>
  );

  // Timeline chrome is fixed-light v2.0 (task 168) — `isDark` is still computed above and passed
  // to <OnboardingWizard isDark={isDark} .../> below unchanged, since Wizard step content (out of
  // scope for this task) still depends on it; only this file's own rendering stops branching on it.
  if (wizardOpen && isPhase1Restricted) {
    return (
      <div className={cn("min-h-full px-7 py-8", "bg-[#F4F6FB]")}>
        {backLink}
        <div className={cn("mx-auto max-w-[560px] rounded-2xl border p-10 text-center", "border-[#F5C6C2] bg-white shadow-[0_4px_24px_rgba(15,23,42,0.07)]")}>
          <ShieldAlert size={32} className="mx-auto mb-4 text-[#C0392B]" />
          <div className={cn("mb-2 text-lg font-bold", "text-[#0B1533]")}>Restricted</div>
          <p className={cn("mx-auto max-w-md text-[13px]", "text-[#5F6A88]")}>
            You are restricted from accessing this phase. If this is an error, please contact
            your administrator.
          </p>
          <button
            type="button"
            onClick={() => { setWizardOpen(false); router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}`, { scroll: false }); }}
            className={cn("mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border px-4 py-2 text-[13px] font-semibold transition-colors", "border-[#E2E7F2] bg-white text-[#3A4565] hover:bg-[#F4F6FB]")}
          >
            <ArrowLeft size={14} /> Back to Timeline
          </button>
        </div>
      </div>
    );
  }

  if (wizardOpen) {
    return (
      <div className={cn("min-h-full px-7 py-8", "bg-[#F4F6FB]")}>
        {backLink}
        <OnboardingWizard
          project={project}
          deliverables={deliverables.filter((d) => d.phase_number === 1)}
          internalDeliverables={internalDeliverables}
          wizardData={(phases.find((p) => p.phase_number === 1)?.wizard_data as Record<string, unknown>) ?? {}}
          currentDay={programmeStartedAt ? getCurrentProgrammeDay(programmeStartedAt) : 1}
          isDark={isDark}
          role={role}
          isPhaseActive={isPhaseActive}
          initialStepKey={wizardStartStepKey}
          onBack={() => {
            setWizardOpen(false);
            setWizardStartStepKey(undefined);
            router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}`, { scroll: false });
            fetchProgramme();
            // Task 157 fix: adding a phase member inside the Wizard's own PhaseAccessPanel
            // also auto-adds a project_members row (task 156) — without this, the Timeline's
            // own projectMembers/phase1Members state went stale until a full page reload.
            refetchPhase1Members();
            refetchProjectMembers();
          }}
          onDeliverableChange={(updated) => setDeliverables((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))}
          onInternalDeliverableChange={(updated) => setInternalDeliverables((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))}
          canManagePhase1={canManagePhase1}
          phase1Members={phase1Members}
          phase1Busy={membershipBusy}
          phase1Error={membershipError}
          onAddPhase1Member={handleAddPhase1Member}
          onRemovePhase1Member={handleRemovePhase1Member}
          onTransferPhaseOwnership={handleTransferPhaseOwnership}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn("min-h-full bg-[#F4F6FB] px-7 py-8")}>
        {backLink}
        <div className="py-12 text-center text-[13px] text-[#5F6A88]">Loading onboarding programme…</div>
      </div>
    );
  }

  if (!programmeStartedAt) {
    const hasSchedule = !!project.scheduled_onboarding_start_at;
    const scheduledPhaseNumber = (project.scheduled_start_phase ?? 1) as 1 | 2 | 3 | 4 | 5;
    const scheduledPhase = getPhaseByNumber(scheduledPhaseNumber);
    const scheduledDate = project.scheduled_onboarding_start_at ? new Date(project.scheduled_onboarding_start_at) : null;
    const busy = starting || jumping;

    return (
      <div className={cn("min-h-full bg-[#F4F6FB] px-7 py-8")}>
        {backLink}
        <div className="mx-auto max-w-[560px] rounded-2xl border border-[#E2E7F2] bg-white p-10 text-center shadow-[0_4px_24px_rgba(15,23,42,0.07)]">
          <CalendarClock size={32} className="mx-auto mb-4 text-[#5F6A88]" />
          <div className={cn("text-lg font-bold text-[#0B1533]")}>{project.name}</div>
          <div className="mb-3 text-[13px] text-[#5F6A88]">{project.company_name}</div>

          {hasSchedule ? (
            <div className="mx-auto mb-6 max-w-md rounded-[10px] border border-[#F0D896] bg-[#FFF3D6] px-4 py-3 text-left">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#8A5A00]">
                <CalendarClock size={14} /> Scheduled to auto-start
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A5A00]">
                Phase {scheduledPhaseNumber}: {scheduledPhase.name} will start automatically on{" "}
                {scheduledDate?.toLocaleString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
                .
              </p>
            </div>
          ) : (
            <p className="mx-auto mb-6 max-w-md text-[13px] text-[#5F6A88]">
              Start the 120-day programme to begin tracking Phase 1 — or jump straight to whichever phase they&apos;re actually starting from.
            </p>
          )}

          {error && <p className="mb-3 text-xs text-[#C0392B]">{error}</p>}

          {canManagePhases ? (
            hasSchedule ? (
              <div className="flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={() => startAtPhase(scheduledPhaseNumber)}
                  disabled={busy}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <PlayCircle size={15} /> {busy ? "Starting…" : `Start Phase ${scheduledPhaseNumber}: ${scheduledPhase.name} Anyway`}
                </button>

                <div className="flex w-full items-center gap-3">
                  <div className="h-px flex-1 bg-[#E2E7F2]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5F6A88]">OR</span>
                  <div className="h-px flex-1 bg-[#E2E7F2]" />
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={altPhase ?? ""}
                      onChange={(e) => setAltPhase(e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4 | 5) : null)}
                      disabled={busy}
                      className="h-9 cursor-pointer appearance-none rounded-[9px] border-[1.5px] border-[#E2E7F2] bg-white py-1.5 pl-3 pr-8 text-[13px] text-[#0B1533] outline-none transition-colors focus:border-[#007BFF] disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 12px center",
                      }}
                    >
                      <option value="">Select Phase</option>
                      {PROGRAMME_PHASES.filter((p) => p.number !== scheduledPhaseNumber).map((p) => (
                        <option key={p.number} value={p.number}>
                          Phase {p.number}: {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {altPhase && (
                    <button
                      type="button"
                      onClick={() => startAtPhase(altPhase)}
                      disabled={busy}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <PlayCircle size={15} /> {busy ? "Starting…" : "Proceed"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={starting}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <PlayCircle size={15} /> {starting ? "Starting…" : "Start Onboarding"}
                </button>
                <JumpToPhaseMenu open={jumpOpen} setOpen={setJumpOpen} note={jumpNote} setNote={setJumpNote} onJump={handleJump} jumping={jumping} />
              </div>
            )
          ) : (
            <p className="text-[12.5px] text-[#5F6A88]">Not started yet — Marketing manages the programme start date.</p>
          )}
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
  const deliverableOverrideMap = new Map(
    deliverables
      .filter((d) => d.day_start_override != null && d.day_end_override != null)
      .map((d) => [d.deliverable_key, { dayStart: d.day_start_override as number, dayEnd: d.day_end_override as number }])
  );
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
    <div className={cn("min-h-full bg-[#F4F6FB] px-7 py-8")}>
      {backLink}

      <div className="flex flex-col gap-4">
        {/* Header card */}
        <div className="rounded-2xl border border-[#E2E7F2] bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 text-xs text-[#5F6A88]">{project.company_name}</div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cn("text-lg font-bold text-[#0B1533]")}>{project.name}</span>
                {isComplete ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E3F5EA] px-2.5 py-0.5 text-[11px] font-semibold text-[#177E48]">
                    <CheckCircle2 size={11} /> Complete
                  </span>
                ) : (
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", visual.iconBg, visual.iconText)}>
                    <span className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full bg-current" />
                    Phase {activePhaseNumber}: {activePhase.name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#5F6A88]">
                <span className="inline-flex items-center gap-1.5">
                  Owner: {ownerDisplayName ? <AvatarCircle name={ownerDisplayName} size={18} /> : <Users size={12} />}
                   <span className="font-medium text-[#3A4565]">{ownerDisplayName ?? "Unassigned"}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  Collaborators: <CollaboratorAvatars members={collaborators} />
                </span>
                {isManualOverride && <span className="text-[#6A48E0]">Manually tagged</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(canManageProjMembers || canSetOwner) && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSettingsMenuOpen((v) => !v)}
                    aria-label="Project Settings"
                    title="Project Settings"
                    className={cn(
                      "inline-flex cursor-pointer items-center justify-center rounded-lg border p-2.5 transition-colors",
                      settingsMenuOpen ? "border-[#007BFF] bg-[#E5F1FF] text-[#007BFF]" : "border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5]"
                    )}
                  >
                    <Settings size={13} />
                  </button>
                  {settingsMenuOpen && (
                    <div className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-lg border border-[#E2E7F2] bg-white py-1 shadow-lg">
                      {canSetOwner && (
                        <button
                          type="button"
                          onClick={() => { setOwnerPanelOpen(true); setCollaboratorsPanelOpen(false); setSettingsMenuOpen(false); }}
                          className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-[12.5px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB]"
                        >
                          <Crown size={13} className="text-[#5F6A88]" /> Set Project Owner
                        </button>
                      )}
                      {canManageProjMembers && (
                        <button
                          type="button"
                          onClick={() => { setCollaboratorsPanelOpen(true); setOwnerPanelOpen(false); setSettingsMenuOpen(false); }}
                          className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-[12.5px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB]"
                        >
                          <Users size={13} className="text-[#5F6A88]" /> Add Collaborators
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {canManagePhases && (
                <JumpToPhaseMenu open={jumpOpen} setOpen={setJumpOpen} note={jumpNote} setNote={setJumpNote} onJump={handleJump} jumping={jumping} />
              )}
              {!isComplete && phases.some((p) => p.phase_number === 1) && canOpenWizard && (
                <button
                  type="button"
                  onClick={() => {
                    setWizardStartStepKey(undefined);
                    setWizardOpen(true);
                    router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}?phase=${FIRST_WIZARD_STEP_PARAMS.phase}&deliverable=${FIRST_WIZARD_STEP_PARAMS.deliverable}`, { scroll: false });
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border-none bg-gradient-to-br from-[#007BFF] to-[#0063D6] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)]"
                >
                  <PlayCircle size={14} /> {activePhaseNumber === 1 ? "Onboarding Wizard" : "View Onboarding Wizard"}
                </button>
              )}
            </div>
          </div>
          {error && <p className="mb-2 text-xs text-[#C0392B]">{error}</p>}
          {ownerPanelOpen && canSetOwner && (
            <OwnerPanel
              projectMembers={projectMembers}
              busy={membershipBusy}
              error={membershipError}
              onTransferOwnership={handleTransferProjectOwnership}
              onClose={() => setOwnerPanelOpen(false)}
            />
          )}
          {collaboratorsPanelOpen && canManageProjMembers && (
            <CollaboratorsPanel
              projectMembers={projectMembers}
              staffDirectory={staffDirectory}
              busy={membershipBusy}
              error={membershipError}
              onAdd={handleAddProjectMember}
              onRemove={handleRemoveProjectMember}
              onClose={() => setCollaboratorsPanelOpen(false)}
            />
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex min-w-[240px] flex-1 items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EDF0F7]">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-700", isComplete ? "bg-[#177E48]" : visual.solid)}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className={cn("shrink-0 text-lg font-bold text-[#0B1533]")}>
                Day {currentDay}
                <span className="ml-1 text-xs font-normal text-[#5F6A88]">/ 120</span>
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
                    <div className="text-[11px] text-[#5F6A88]">{r.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Gantt grid */}
        <div className="relative rounded-2xl border border-[#E2E7F2] bg-white pt-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
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
              <div className="flex border-b border-[#E2E7F2]">
                <div className="sticky left-0 shrink-0 border-r z-3 border-[#E2E7F2] bg-white" style={{ width: LABEL_WIDTH }} />
                {days.map((day) => (
                  <DateColumnHeader key={day} date={addDays(startDate, day - 1)} isToday={day === currentDay} />
                ))}
              </div>

              {currentDay <= TOTAL_DAYS && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-2 w-0 border-l-2 border-dashed border-[#FB914E]"
                  style={{ left: LABEL_WIDTH + (currentDay - 1) * DAY_WIDTH + DAY_WIDTH / 2 }}
                >
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-[#F9C9A0] bg-[#FFEFE3] px-1.5 py-0.5 text-[9px] font-bold text-[#FB914E]">
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
                  deliverableOverrideMap={deliverableOverrideMap}
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
                  canEditSchedule={canEditSchedule}
                  onScheduleChange={handleScheduleChange}
                  index={index}
                  startDate={startDate}
                  role={role}
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
        className="fixed bottom-8 right-8 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-none bg-[#FB914E] text-white shadow-[0_4px_16px_rgba(251,145,78,0.4)] transition-transform hover:scale-105"
      >
        <Locate size={20} />
      </button>
    </div>
  );
}
