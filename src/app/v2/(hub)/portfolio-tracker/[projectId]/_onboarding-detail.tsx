"use client";

import { useEffect, useLayoutEffect, useRef, useState, forwardRef, type HTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  CalendarClock, Flag, Bell, CheckCircle2, Check, Clock, ChevronDown, PlayCircle,
  Users, AlertTriangle, Info, ArrowLeft, ListChecks, Locate, Crown, X, ShieldAlert,
  Settings, ClipboardList, Plus, Minus, type LucideIcon,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { V2_ROUTES } from "@/config/constants";
import {
  PROGRAMME_PHASES, getCurrentProgrammeDay, getPhaseForDay,
  internalDeliverablesForSubPhase, type PhaseConfig, type DeliverableConfig,
  DEFAULT_PROGRAMME_DAYS, scaleDay, unscaleDay, resolveEffectivePhase,
  buildOrderedPhasePlan, resolveEffectivePhaseNumber, compressReferenceDay,
  type CustomPhaseSeed,
} from "@/config/customer-phases";
import type { CustomerPhaseRow, CustomerDeliverableRow, OnboardingInternalDeliverableRow, Database } from "@/types/database";
import { isRoleGatedByMembership, canManageProjectMembers, canSetProjectOwner, canManagePhase1Membership } from "@/lib/programme/membership-rules";
import OnboardingWizard from "./_onboarding-wizard";
import { DELIVERABLE_WORKSPACE_TARGET, buildWorkspaceQueryString } from "./onboarding-workspace/_workspace-url-params";
import { StatusSummaryDrawer } from "./_status-summary-drawer";
import { DeleteProjectMenuItem, DELETE_PROJECT_ROLES } from "./_delete-project-menu-item";
import GenericPhaseView from "./_generic-phase-view";

// Shared shape for both project_members and phase_members rows (task 155 gave both an
// is_owner column, mirroring each other exactly). Exported: task 247's _generic-phase-view.tsx
// (same [projectId] route, not a cross-module import) reuses this shape for its own header.
export type MemberRow = { id: string; user_id: string; is_owner: boolean; full_name: string | null; role: string | null };

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
    // Task 251: the SSR-fetched copy — StackShift I's own not-started screen below still uses its
    // separate client-side fetchProgramme() state (`programmeStartedAt`), so this field is only
    // actually consumed by GenericPhaseView (passed through wholesale via the `project` prop).
    programme_started_at: string | null;
    // Chat follow-up to task 157: surfaces the New Project intake's "Save + Set Schedule" state
    // on the not-started card — when to expect auto-start and which phase, plus a way to
    // override it (start now, at the scheduled phase or a different one).
    scheduled_onboarding_start_at: string | null;
    scheduled_start_phase: number | null;
    // Task 247 — false for every classification except StackShift I (and StackShift II when the
    // PM opted into the engine at intake, task 239's use_default_phase_engine). Decides whether
    // this page renders the specialized customer_phases Timeline/Gantt below, or delegates to
    // _generic-phase-view.tsx for the generic milestones/tasklists/tasks model.
    uses_customer_phases_engine: boolean;
    // Task 248 — the intake-time skip/custom-phase selection (tasks 244/246), persisted
    // regardless of start mode. Drives the "not started"/scheduled screen's dynamic Start button
    // label + skip-aware Jump-to-phase menu, before any customer_phases row exists yet.
    draft_skip_phase_numbers: number[];
    draft_custom_phases: CustomPhaseSeed[];
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
  // Task 247 — only populated (by _load-detail-data.ts) when uses_customer_phases_engine is
  // false; empty arrays otherwise.
  milestones: Database["public"]["Tables"]["milestones"]["Row"][];
  tasklists: Database["public"]["Tables"]["tasklists"]["Row"][];
  genericTasks: Database["public"]["Tables"]["tasks"]["Row"][];
}

// ─── Gantt grid constants ─────────────────────────────────────────────────────

export const TOTAL_DAYS = 120;
export const DAY_WIDTH = 80;
export const ROW_HEIGHT = 56;
export const ROW_GAP = 6;
export const LABEL_WIDTH = 200;
// Extra top space in each swimlane row so track-0 deliverable cards' internal-deliverables badge
// (which pokes above the card via `-top-1.5`) has room to render without being clipped.
export const LANE_TOP_PADDING = 8;
// Vertical breathing room within each track's ROW_HEIGHT slot — shrinks the rendered card height
// by 2x this amount so it sits centered in its row instead of flush against the top edge.
export const CARD_INSET = 8;

// ─── Per-phase palette — DESIGN.md's fixed 5-phase-hue vocabulary (task 168), matching the same
// values already shipped in dashboard-shared.tsx's PHASE_TONE/PHASE_GRADIENT (tasks 166/167):
// Onboard=orange, Migrate & Rebrand=blue, Publish=violet, AI Visibility=teal, Optimize=green.
// A phase hue is never reused for a non-phase meaning — this replaces the old, unrelated
// blue/violet/teal/amber/slate mapping this file used before v2.0.

export type PhaseVisual = { border: string; bg: string; ring: string; text: string; solid: string; iconBg: string; iconText: string };

export const PHASE_VISUALS: Record<number, PhaseVisual> = {
  1: { border: "border-[#E2762F]", bg: "bg-[#FFEFE3]", ring: "shadow-[0_0_0_3px_rgba(226,118,47,0.12)]", text: "text-[#E2762F]", solid: "bg-[#E2762F]", iconBg: "bg-[#E2762F]/15", iconText: "text-[#E2762F]" },
  2: { border: "border-[#0063D6]", bg: "bg-[#E5F1FF]", ring: "shadow-[0_0_0_3px_rgba(0,99,214,0.12)]", text: "text-[#0063D6]", solid: "bg-[#0063D6]", iconBg: "bg-[#0063D6]/15", iconText: "text-[#0063D6]" },
  3: { border: "border-[#6A48E0]", bg: "bg-[#EFEAFD]", ring: "shadow-[0_0_0_3px_rgba(106,72,224,0.12)]", text: "text-[#6A48E0]", solid: "bg-[#6A48E0]", iconBg: "bg-[#6A48E0]/15", iconText: "text-[#6A48E0]" },
  4: { border: "border-[#0B8A93]", bg: "bg-[#E2F6F7]", ring: "shadow-[0_0_0_3px_rgba(11,138,147,0.12)]", text: "text-[#0B8A93]", solid: "bg-[#0B8A93]", iconBg: "bg-[#0B8A93]/15", iconText: "text-[#0B8A93]" },
  5: { border: "border-[#177E48]", bg: "bg-[#E3F5EA]", ring: "shadow-[0_0_0_3px_rgba(23,126,72,0.12)]", text: "text-[#177E48]", solid: "bg-[#177E48]", iconBg: "bg-[#177E48]/15", iconText: "text-[#177E48]" },
};

// Raw hex twins of PHASE_VISUALS' colors — needed for the DeliverableCard progress-fill/stripe
// gradients, which are computed dynamically (percentage-driven) and can't be static Tailwind classes.
export const PHASE_HEX: Record<number, string> = {
  1: "#E2762F",
  2: "#0063D6",
  3: "#6A48E0",
  4: "#0B8A93",
  5: "#177E48",
};

// Light-tint twins of PHASE_HEX (same values as PHASE_VISUALS' `bg` classes, as raw hex) — used
// for the 120-day programme track's gradient fill, matching the light-to-solid gradient shape
// the Onboarding Workspace's ProgrammeTrack already uses for its own phase-progress bar.
export const PHASE_TINT_HEX: Record<number, string> = {
  1: "#FFEFE3",
  2: "#E5F1FF",
  3: "#EFEAFD",
  4: "#E2F6F7",
  5: "#E3F5EA",
};

// ─── Reminder chip palette ─────────────────────────────────────────────────────

type ReminderItem = { key: string; type: "warning" | "reminder" | "info" | "success"; title: string; body: string };

const REMINDER_STYLE: Record<ReminderItem["type"], { bg: string; border: string; title: string; icon: React.ReactNode }> = {
  warning: { bg: "bg-[#FFF3D6]", border: "border-[#F0D896]", title: "text-[#8A5A00]", icon: <AlertTriangle size={13} className="text-[#8A5A00]" /> },
  reminder: { bg: "bg-[#E5F1FF]", border: "border-[#BBDCFF]", title: "text-[#0063D6]", icon: <Bell size={13} className="text-[#007BFF]" /> },
  info: { bg: "bg-[#EDF0F7]", border: "border-[#E2E7F2]", title: "text-[#0B1533]", icon: <Info size={13} className="text-[#5F6A88]" /> },
  success: { bg: "bg-[#E3F5EA]", border: "border-[#BEE7CD]", title: "text-[#177E48]", icon: <CheckCircle2 size={13} className="text-[#177E48]" /> },
};

// Task 246: takes orderedPhases (this project's actual phase set, defaults + any customs,
// resolved + ordered by sort_order) instead of calling getPhaseByNumber directly — that call
// throws for a custom phase's number, which has no PROGRAMME_PHASES entry to look up.
function buildReminders(
  day: number,
  phaseStatus: Map<number, string>,
  deliverableStatus: Map<string, string>,
  // Chat follow-up to task 244: expects phases already skip-compressed (see the "already started"
  // render's compressedPhases) — a skipped phase's own dayStart/dayEnd is irrelevant here since
  // phaseStatus never marks one "active", so the day-range fallback lookup below never matches it.
  orderedPhases: (PhaseConfig & { sortOrder: number })[],
  durationDays: number = DEFAULT_PROGRAMME_DAYS
): ReminderItem[] {
  const lastPhase = orderedPhases[orderedPhases.length - 1];
  if (lastPhase && phaseStatus.get(lastPhase.number) === "completed") {
    return [{ key: "done", type: "success", title: "Programme complete", body: `All ${orderedPhases.length} phases delivered.` }];
  }
  const activePhaseNumber = [...phaseStatus.entries()].find(([, status]) => status === "active")?.[0];
  const phase =
    orderedPhases.find((p) => p.number === activePhaseNumber) ??
    orderedPhases.find((p) => day >= scaleDay(p.dayStart, durationDays) && day <= scaleDay(p.dayEnd, durationDays)) ??
    orderedPhases[0] ??
    getPhaseForDay(unscaleDay(day, durationDays));
  const items: ReminderItem[] = [];
  const phase1End = scaleDay(15, durationDays);
  // Phase 1 is a fixed window (15 reference days) — if it's still active well past that, this
  // project should already be in a later phase (e.g. a CSV-imported Kickoff Date that's more
  // than 15 days old). One clear phase-level warning here is more useful than 5+ individual
  // "Overdue: {deliverable}" entries competing for the reminder strip's slots.
  if (phase.number === 1 && day > phase1End) {
    items.push({
      key: "phase1-overdue",
      type: "warning",
      title: "Phase 1 Overdue",
      body: `Day ${day} — past the ${phase1End}-day Onboarding window. This project should already be in a later phase.`,
    });
  } else if (phase.number === 1) {
    for (const d of phase.deliverables) {
      if (deliverableStatus.get(d.key) === "done") continue;
      const dEnd = scaleDay(d.dayEnd, durationDays);
      const diff = dEnd - day;
      if (diff > 0 && diff <= 5) {
        items.push({ key: `due-${d.key}`, type: diff <= 2 ? "warning" : "reminder", title: `Due in ${diff} day${diff === 1 ? "" : "s"}: ${d.name}`, body: d.description });
      } else if (diff <= 0) {
        items.push({ key: `overdue-${d.key}`, type: "warning", title: `Overdue: ${d.name}`, body: `Was due by Day ${dEnd}.` });
      }
    }
  }
  if (day === phase1End && phaseStatus.get(1) !== "completed") items.push({ key: "gate15", type: "warning", title: `Gate — Day ${phase1End}`, body: "Client sign-off due before Phase 2 begins." });
  if (items.length === 0) {
    const daysLeft = Math.max(0, scaleDay(phase.dayEnd, durationDays) - day);
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

export function assignTracks(items: { dayStart: number; dayEnd: number }[]): number[] {
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

export function addDays(date: Date, n: number): Date {
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

export function DateColumnHeader({ date, isToday }: { date: Date; isToday: boolean }) {
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
  phase, dbStatus, deliverableStatusMap, internalByKey, collapsed, onToggleCollapse,
  onOpenDeliverable, expandedDeliverable, onExpandDeliverable, index, startDate, role, canEditSchedule, onScheduleChange,
  totalDays = TOTAL_DAYS,
}: {
  phase: PhaseConfig;
  dbStatus: string;
  deliverableStatusMap: Map<string, string>;
  internalByKey: Map<string, OnboardingInternalDeliverableRow>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  // Task 241 — phase-aware (was Phase-1-only `(key: string) => void`); Phase 2-5 now open too,
  // routed to Projects > Tasks instead of the Onboarding Workspace.
  onOpenDeliverable: (phaseNumber: number, key: string) => void;
  expandedDeliverable: string | null;
  onExpandDeliverable: (key: string | null) => void;
  index: number;
  startDate: Date;
  role: string | null;
  canEditSchedule: boolean;
  onScheduleChange: (phaseNumber: number, deliverableKey: string, dayStart: number, dayEnd: number) => void;
  // Chat follow-up to task 244: the shared grid's actual (skip-compressed) column count for this
  // project — defaults to the static 120-reference-day constant for any caller that hasn't been
  // updated to pass a compressed value (none currently; kept for a safe/explicit default).
  totalDays?: number;
}) {
  // Task 246: a custom phase (number 6+) has no dedicated PHASE_VISUALS entry — falls back to
  // phase 1's palette, matching the same ?? PHASE_VISUALS[1]/PHASE_HEX[1] convention already used
  // elsewhere in this file (line ~1698, ~432) for an unresolvable phase number.
  const visual = PHASE_VISUALS[phase.number] ?? PHASE_VISUALS[1];
  // Developer never opens anything (task 146); a skipped phase's deliverables are inert for
  // everyone (chat follow-up) — they're shown only for reference when a PM expands the row out of
  // curiosity, never actionable since this phase doesn't apply to the project.
  const interactive = role !== "developer" && dbStatus !== "skipped";
  // Task 253: effective span (per-project override ?? the static config default) is now resolved
  // upstream by resolveEffectiveDeliverable (customer-phases.ts) for every phase.deliverables
  // entry, so there's no separate override map to merge here anymore — never mutates
  // PROGRAMME_PHASES, which is shared by every customer.
  const effectiveDeliverables = phase.deliverables;
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
        {/* Task 254: a skipped phase's lane is always empty regardless of collapsed state (it's
            excluded from the shared grid/day range entirely, see the D{}–{} suppression below) —
            there's nothing to reveal by toggling it, so it renders as an inert <div> instead of
            the collapse-toggle <button> non-skipped phases still use. */}
        {dbStatus === "skipped" ? (
          <div className="flex w-full items-center gap-2 p-0 text-left">
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", visual.iconBg, visual.iconText)}>
              {phase.number}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-bold text-[#5F6A88]">{phase.name}</span>
                {/* Task 244: a StackShift I phase a PM excluded at intake reuses the same "skipped"
                    status a time-based "jump to phase" produces — labeled here so it reads as "not
                    part of this project" rather than "already passed". */}
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  Skipped
                </span>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" onClick={onToggleCollapse} className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left">
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", visual.iconBg, visual.iconText)}>
              {dbStatus === "completed" ? <CheckCircle2 size={13} /> : phase.number}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-bold text-[#0B1533]">{phase.name}</span>
                {dbStatus === "active" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse motion-reduce:animate-none rounded-full bg-[#007BFF]" />}
              </div>
              <div className={cn("font-mono truncate text-[10px] text-[#5F6A88]")}>
                D{phase.dayStart}–{phase.dayEnd} · {doneCount}/{phase.deliverables.length}
              </div>
            </div>
            {/* Chat follow-up: swapped for a directionless +/− toggle — a down/right chevron implied
                a vertical list would drop below, but the revealed content is a horizontal timeline
                lane instead, which read as confusing. */}
            {collapsed ? <Plus size={14} className="shrink-0 text-[#5F6A88]" /> : <Minus size={14} className="shrink-0 text-[#5F6A88]" />}
          </button>
        )}
      </div>

      <div
        className="relative overflow-visible z-1"
        style={{ width: totalDays * DAY_WIDTH, height: collapsed ? 0 : laneHeight, paddingTop: collapsed ? 0 : LANE_TOP_PADDING }}
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
              onOpenWizardStep={interactive ? () => onOpenDeliverable(phase.number, d.key) : undefined}
              canEditSchedule={canEditSchedule && dbStatus !== "skipped"}
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

// Minimal shape this menu actually needs — satisfied by both PhaseConfig (the "already started"
// call site's orderedPhases) and OrderedPhaseSummary (task 248's pre-seed "not started" call
// site's buildOrderedPhasePlan output), so either can be passed without a cast.
type JumpPhaseOption = { number: number; name: string; dayStart: number; dayEnd: number };

function JumpToPhaseMenu({
  open, setOpen, note, setNote, onJump, jumping, phases = PROGRAMME_PHASES, skipSet, currentPhaseNumber,
}: {
  open: boolean; setOpen: (v: boolean) => void; note: string; setNote: (v: string) => void;
  onJump: (phaseNumber: number) => void; jumping: boolean;
  // Task 246: defaults to PROGRAMME_PHASES for the pre-seed "not started" call site (no per-project
  // phase set exists yet); the "already started" call site passes this project's actual
  // orderedPhases (defaults + any customs) instead.
  phases?: JumpPhaseOption[];
  // Task 248: phase numbers this project's PM excluded at intake — shown in the list (not
  // filtered out, so the full plan stays visible) but disabled with a not-allowed cursor and a
  // "Skipped" pill, matching the Swimlane's own existing skipped-phase badge treatment. Chat
  // follow-up: the "already started" call site now passes its own DB-status-derived skip set
  // (customer_phases.status === "skipped") — the authoritative source once a project has seeded,
  // rather than leaving it undefined/every phase enabled as before.
  skipSet?: Set<number>;
  // Chat follow-up: the phase this project is currently active in — shown disabled with a
  // "Current" pill instead of "Skipped", since jumping to the phase you're already in is a no-op.
  // Undefined for the pre-seed "not started" call site, which has no active phase yet.
  currentPhaseNumber?: number;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white px-3.5 py-2 text-xs font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5]"
      >
        <Flag size={13} /> Jump to phase <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-64 overflow-hidden rounded-xl border border-[#E2E7F2] bg-white shadow-lg">
          <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wider text-[#5F6A88]">Manually tag starting phase</div>
          {phases.map((p) => {
            const skipped = skipSet?.has(p.number) ?? false;
            const isCurrent = !skipped && p.number === currentPhaseNumber;
            const disabled = skipped || isCurrent;
            return (
              <button
                key={p.number}
                type="button"
                onClick={() => onJump(p.number)}
                disabled={jumping || disabled}
                aria-disabled={disabled}
                className={cn(
                  "flex w-full items-center gap-1.5 border-none bg-transparent px-3.5 py-2 text-left text-[13px] transition-colors disabled:opacity-50",
                  disabled ? "cursor-not-allowed text-[#5F6A88]" : "cursor-pointer text-[#0B1533] hover:bg-[#F4F6FB]"
                )}
              >
                {/* Task 253: a skipped phase occupies no calendar days (compressed out of the
                    shared grid entirely, same as the Swimlane phase-row header) — showing a day
                    range here would misleadingly imply it still does. */}
                <span>{p.name}{!skipped && ` (Day ${p.dayStart}–${p.dayEnd})`}</span>
                {skipped && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    Skipped
                  </span>
                )}
                {isCurrent && (
                  <span className="shrink-0 rounded-full bg-[#E5F1FF] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#007BFF]">
                    Current
                  </span>
                )}
              </button>
            );
          })}
          <div className="px-3.5 pb-3.5 pt-1">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note…"
              className="w-full rounded-lg border border-[#E2E7F2] bg-white px-2.5 py-1.5 text-xs text-[#0B1533] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat chip ─────────────────────────────────────────────────────────────────

export function StatChip({ icon: Icon, label, value }: { icon?: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="flex h-full items-center gap-2 rounded-lg border border-[#E2E7F2] bg-[#F4F6FB] px-3.5">
      {Icon && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#5F6A88]">
          <Icon size={12} />
        </span>
      )}
      <div>
        <div className={cn("font-mono text-xl font-bold leading-tight text-[#0B1533]")}>{value}</div>
        <div className="whitespace-nowrap text-[9px] uppercase tracking-wide text-[#5F6A88]">{label}</div>
      </div>
    </div>
  );
}

// ─── Project settings: owner + collaborators (task 153/155/157) ───────────────────────────────
// Task 157: split into two independently-triggered panels (Set Project Owner / Add
// Collaborators) behind a Gear "Project Settings" menu, replacing the single merged panel
// behind an "Access" text button. Read-only avatar display lives in the header row itself
// (AvatarCircle/CollaboratorAvatars below); these panels are the management surfaces.

// Real shadcn/Base UI Tooltip (not a native `title` attribute) — mirrors `_onboarding-wizard.tsx`'s
// `IconTip` pattern (thin wrapper around Tooltip/TooltipTrigger's `render` prop).
function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

// forwardRef so this can be used directly as an AvatarTip/TooltipTrigger render target (Base UI
// clones the child and attaches a ref + event handlers — a plain function component can't
// receive either) for the single-avatar call sites (Owner row, OwnerPanel's current owner).
export const AvatarCircle = forwardRef<HTMLDivElement, { name: string | null; size?: number; ring?: boolean } & HTMLAttributes<HTMLDivElement>>(
  ({ name, size = 22, ring, className, style, ...props }, ref) => {
    const initials = (name ?? "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
    const colors = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
    const bg = colors[(name ?? "?").charCodeAt(0) % colors.length];
    return (
      <div
        ref={ref}
        className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white", ring && "ring-2 ring-white", className)}
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.4), background: bg, ...style }}
        {...props}
      >
        {initials}
      </div>
    );
  }
);
AvatarCircle.displayName = "AvatarCircle";

export function CollaboratorAvatars({ members, max = 5 }: { members: MemberRow[]; max?: number }) {
  if (members.length === 0) return <span className="text-[11.5px] text-[#5F6A88]">None yet</span>;

  // A single collaborator has nothing to lift above — tooltip only, no hover animation.
  if (members.length === 1) {
    const m = members[0];
    return (
      <AvatarTip label={m.full_name ?? "Unnamed"}>
        <AvatarCircle name={m.full_name} size={22} ring />
      </AvatarTip>
    );
  }

  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <AvatarTip key={m.user_id} label={m.full_name ?? "Unnamed"}>
          <motion.div
            className={cn("cursor-default", i > 0 && "-ml-1.5")}
            whileHover={{ y: -4, zIndex: 10 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            <AvatarCircle name={m.full_name} size={22} ring />
          </motion.div>
        </AvatarTip>
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
export function OwnerPanel({ projectMembers, busy, error, onTransferOwnership, onClose }: {
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

// Task 155/157/201 — search-to-add UI mirrors _onboarding-wizard.tsx's renderPersonPicker shape
// (search input + filtered dropdown, onMouseDown preventDefault so the click survives the
// input's onBlur). Task 201 changed adding from immediate-add-on-click to stage-then-confirm —
// clicking a candidate stages them as a removable chip; one "Add N" click batches all staged
// picks into a single POST (and therefore a single combined notification server-side).
export function CollaboratorsPanel({
  projectMembers, staffDirectory, busy, error, onAdd, onRemove, onClose,
}: {
  projectMembers: MemberRow[];
  staffDirectory: { id: string; full_name: string | null; role: string }[];
  busy: boolean;
  error: string | null;
  onAdd: (userIds: string[]) => void;
  onRemove: (userId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [staged, setStaged] = useState<string[]>([]);

  const memberIds = new Set(projectMembers.map((m) => m.user_id));
  const stagedIds = new Set(staged);
  // Task 155: any staff role is addable as a project collaborator (was marketing/pm only).
  const candidates = staffDirectory
    .filter((p) => !memberIds.has(p.id) && !stagedIds.has(p.id))
    .filter((p) => (p.full_name ?? "").toLowerCase().includes(search.toLowerCase()));
  const stagedPeople = staged.map((id) => staffDirectory.find((p) => p.id === id)).filter((p): p is { id: string; full_name: string | null; role: string } => !!p);

  const handleConfirm = () => {
    if (staged.length === 0) return;
    onAdd(staged);
    setStaged([]);
  };

  return (
    <div className="mt-4 mb-6 flex flex-col gap-2.5 rounded-xl border border-[#E2E7F2] bg-[#F4F6FB] p-4">
      <PanelHeader label="Manage collaborators — who sees this on the Onboarding list" onClose={onClose} />
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
          className="w-full rounded-md border border-[#E2E7F2] bg-white px-2.5 py-1.5 text-[11.5px] text-[#0B1533] outline-none transition-colors placeholder:text-[#5F6A88] focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:opacity-50"
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
                  onClick={() => { setStaged((prev) => [...prev, person.id]); setSearch(""); }}
                  className="block w-full cursor-pointer border-none bg-transparent px-2.5 py-1.5 text-left text-[11.5px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB]"
                >
                  {person.full_name ?? "Unnamed"} <span className="text-[#5F6A88]">({person.role})</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {stagedPeople.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[#A8C6F5] bg-white/60 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {stagedPeople.map((p) => (
              <PersonChip
                key={p.id}
                label={p.full_name ?? "Unnamed"}
                sublabel={p.role}
                onRemove={() => setStaged((prev) => prev.filter((id) => id !== p.id))}
                disabled={busy}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="cursor-pointer rounded-full border-none bg-[#007BFF] px-3 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#0063D6] disabled:opacity-50"
            >
              Add {stagedPeople.length}
            </button>
            <button
              type="button"
              onClick={() => setStaged([])}
              disabled={busy}
              className="cursor-pointer border-none bg-transparent text-[11.5px] font-medium text-[#5F6A88] transition-colors hover:text-[#3A4565] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
  milestones: initialMilestones, tasklists: initialTasklists, genericTasks: initialGenericTasks,
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programmeStartedAt, setProgrammeStartedAt] = useState<string | null>(null);
  // Task 239 — StackShift I's configurable programme length; defaults to 120 until the fetch
  // below resolves, matching every project's DB default.
  const [programmeDurationDays, setProgrammeDurationDays] = useState<number>(DEFAULT_PROGRAMME_DAYS);
  const [phases, setPhases] = useState<CustomerPhaseRow[]>([]);
  const [deliverables, setDeliverables] = useState<CustomerDeliverableRow[]>([]);
  // Task 241 — Phase 2-5's generic-model tasklist ids, keyed by `programme-deliverable-{phase}-{key}`
  // (their `external_id`), for the Timeline's deliverable cards to resolve a click into a Projects
  // > Tasks deep link. Empty for a project whose programme started before this shipped — degrades
  // to a bare /tasks link, not a crash (see handleOpenPhaseDeliverable).
  const [tasklistIdByExternalId, setTasklistIdByExternalId] = useState<Map<string, string>>(new Map());
  const [internalDeliverables, setInternalDeliverables] = useState<OnboardingInternalDeliverableRow[]>([]);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<number>>(new Set());
  // Chat follow-up: default collapse state — only the active phase starts expanded, every other
  // phase (skipped, not-started, or completed) starts collapsed. Applied once, the first time
  // `phases` loads, so it doesn't fight a PM's own later manual expand/collapse on refetch (e.g.
  // after a Jump-to-phase action).
  const collapseDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (collapseDefaultsAppliedRef.current || phases.length === 0) return;
    collapseDefaultsAppliedRef.current = true;
    const active = phases.find((p) => p.status === "active")?.phase_number;
    setCollapsedPhases(new Set(phases.filter((p) => p.phase_number !== active).map((p) => p.phase_number)));
  }, [phases]);
  const [expandedDeliverable, setExpandedDeliverable] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(!!initialWizardStepKey);
  const [wizardStartStepKey, setWizardStartStepKey] = useState<string | undefined>(initialWizardStepKey);
  const [starting, setStarting] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpNote, setJumpNote] = useState("");
  const [jumping, setJumping] = useState(false);
  // Scheduled-start card's "Select Phase" alternative — excludes the already-scheduled phase.
  // Task 248: now sourced from this project's actual orderedPlan (defaults + any customs from
  // project.draft_custom_phases, computed inline below) instead of the static PROGRAMME_PHASES —
  // closes the previously-documented gap where a project's intake-time custom phases were only
  // ever persisted for an immediate mode:"start" submission, never for one reaching this
  // "not started yet" screen later. number (not 1|2|3|4|5) since resolveEffectivePhaseNumber's
  // generalized signature takes a plain number.
  const [altPhase, setAltPhase] = useState<number | null>(null);
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
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const myPhase1Membership = phase1Members.find((m) => m.user_id === currentUserId) ?? null;
  const isPhase1Member = !!myPhase1Membership;
  const isPhase1Owner = !!myPhase1Membership?.is_owner;
  const phase1HasMembers = phase1Members.length > 0;
  const isProjectMember = projectMembers.some((m) => m.user_id === currentUserId);
  // pm is the project's manager, not a phase-specific contributor like marketing — being on the
  // project (project_members) is sufficient for them, so they don't need a separate opt-in to
  // the phase_members(phase_number=1) table just to see their own project's Phase 1 content.
  // marketing stays phase-gated on phase1Members alone, per task 153 requirement 4's explicit
  // "marketing is also phase-gated, not just pm."
  const hasPhase1Access = isPhase1Member || (role === "pm" && isProjectMember);
  // Gated per requirement 4: marketing/pm without membership are blocked once the phase actually
  // has members; a phase with zero members is unrestricted (backward compatibility, see task
  // 153 doc — avoids locking out every already-in-progress onboarding on ship).
  const isPhase1Restricted = isRoleGatedByMembership(role) && phase1HasMembers && !hasPhase1Access;
  const canManagePhase1 = canManagePhase1Membership(role, { isMember: isPhase1Member, isOwner: isPhase1Owner });
  // Task 157: both keyed off "is this caller the project creator" rather than plain membership
  // — super_admin/admin/pm/creator can add collaborators; super_admin/admin/creator can set the
  // owner (narrower — no pm).
  const isCreator = !!project.created_by && project.created_by === currentUserId;
  const canManageProjMembers = canManageProjectMembers(role, isCreator);
  const canSetOwner = canSetProjectOwner(role, isCreator);
  // Task 231 — independent of membership/ownership rights above; admin/pm/super_admin can
  // always delete regardless of whether they can manage members or set the owner.
  const canDeleteProject = !!role && DELETE_PROJECT_ROLES.includes(role);
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

  const handleAddProjectMembers = async (userIds: string[]) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: userIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to add project members");
      }
      await refetchProjectMembers();
    } catch (err) {
      setMembershipError(err instanceof Error ? err.message : "Failed to add project members.");
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
      setProgrammeDurationDays(data.project?.programme_duration_days ?? DEFAULT_PROGRAMME_DAYS);
      setPhases(data.phases ?? []);
      setDeliverables(data.deliverables ?? []);
      setInternalDeliverables(data.internal_deliverables ?? []);
      setTasklistIdByExternalId(
        new Map((data.phase_tasklists ?? []).map((t: { id: string; external_id: string }) => [t.external_id, t.id]))
      );
      setError(null);
    } catch {
      if (isMountedRef.current) setError("Failed to load onboarding programme data.");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    // Task 247: a generic-engine project never has customer_phases/programme_started_at data —
    // fetching it here would be a wasted request. loading defaults to true above only for the
    // customer_phases path; the generic branch (below, after all hooks) doesn't read `loading`.
    if (!project.uses_customer_phases_engine) return;
    isMountedRef.current = true;
    fetch(`/api/projects/${project.id}/programme`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load programme data");
        const data = await res.json();
        if (!isMountedRef.current) return;
        setProgrammeStartedAt(data.programme_started_at ?? null);
        setProgrammeDurationDays(data.project?.programme_duration_days ?? DEFAULT_PROGRAMME_DAYS);
        setPhases(data.phases ?? []);
        setDeliverables(data.deliverables ?? []);
        setInternalDeliverables(data.internal_deliverables ?? []);
        setTasklistIdByExternalId(
          new Map((data.phase_tasklists ?? []).map((t: { id: string; external_id: string }) => [t.external_id, t.id]))
        );
        setError(null);
      })
      .catch(() => { if (isMountedRef.current) setError("Failed to load onboarding programme data."); })
      .finally(() => { if (isMountedRef.current) setLoading(false); });
    return () => { isMountedRef.current = false; };
  }, [project.id, project.uses_customer_phases_engine]);

  useEffect(() => {
    if (!project.uses_customer_phases_engine) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`v2_onboarding_${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_phases", filter: `project_id=eq.${project.id}` }, (payload) => {
        const row = payload.new as CustomerPhaseRow;
        if (!row?.id) return;
        setPhases((prev) => {
          const idx = prev.findIndex((p) => p.id === row.id);
          if (idx === -1) return [...prev, row].sort((a, b) => a.sort_order - b.sort_order);
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
  }, [project.id, project.uses_customer_phases_engine]);

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
      // Task 248: relay this project's persisted intake-time skip/custom-phase selection —
      // the route already supports both fields (its not-started branch seeds through
      // seedProgrammeAtPhase using them), but this call site never sent them, so a Draft
      // project's skip/custom configuration was previously lost the moment a PM used "Jump to
      // phase" instead of the plain Start button. Harmless to always include: the route's
      // already-started branch re-statuses from the DB's own stored phases and ignores both
      // fields entirely.
      const res = await fetch(`/api/projects/${project.id}/programme/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase_number: phaseNumber,
          note: jumpNote.trim() || undefined,
          skip_phase_numbers: project.draft_skip_phase_numbers,
          custom_phases: project.draft_custom_phases,
        }),
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
  const startAtPhase = (phaseNumber: number) => (phaseNumber === 1 ? handleStart() : handleJump(phaseNumber));

  // Task 222 — swimlane deliverable cards now open the Onboarding Workspace (tabbed rebuild)
  // instead of the inline Onboarding Wizard, deep-linked to that deliverable's mapped
  // tab/folder (see _workspace-url-params.ts). The inline Wizard (wizardOpen/OnboardingWizard
  // below) stays reachable only via a direct ?phase=&deliverable= URL hit — untouched here.
  const handleOpenWizardStep = (deliverableKey: string) => {
    const target = DELIVERABLE_WORKSPACE_TARGET[deliverableKey] ?? { tab: "business-info" as const };
    const qs = buildWorkspaceQueryString(target.tab, target.folderPath);
    router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}/onboarding-workspace?${qs}`, { scroll: false });
  };

  // Task 241 — Phase 1 keeps its task-222 destination (Onboarding Workspace) unchanged; Phase 2-5
  // deliverable cards (newly interactive) go to Projects > Tasks instead, scoped to that
  // deliverable's tasklist when the mapping is known. A project whose programme started before
  // this shipped has no Phase 2-5 tasklists seeded — falls back to a bare /tasks link rather than
  // erroring.
  const handleOpenPhaseDeliverable = (phaseNumber: number, deliverableKey: string) => {
    if (phaseNumber === 1) {
      handleOpenWizardStep(deliverableKey);
      return;
    }
    const tasklistId = tasklistIdByExternalId.get(`programme-deliverable-${project.id}-${phaseNumber}-${deliverableKey}`);
    router.push(
      tasklistId ? `${V2_ROUTES.PROJECTS}/${projectUrlKey}/tasks?tasklist=${tasklistId}` : `${V2_ROUTES.PROJECTS}/${projectUrlKey}/tasks`
    );
  };

  // Task 253: the drag-resize UI now operates in display-scaled day coordinates (see
  // displayPhases below — dayStart/dayEnd on-screen are scaleDay'd to this project's real
  // programmeDurationDays), but day_start_override/day_end_override are stored on the same
  // unscaled (skip-)compressed reference scale every other override write uses (seed.ts).
  // unscaleDay inverts the display scaling before it reaches local state or the API — a no-op
  // whenever programmeDurationDays is the 120-day default.
  const handleScheduleChange = async (phaseNumber: number, deliverableKey: string, dayStart: number, dayEnd: number) => {
    const referenceDayStart = unscaleDay(dayStart, programmeDurationDays);
    const referenceDayEnd = unscaleDay(dayEnd, programmeDurationDays);
    const previous = deliverables;
    setDeliverables((prev) =>
      prev.map((d) =>
        d.phase_number === phaseNumber && d.deliverable_key === deliverableKey
          ? { ...d, day_start_override: referenceDayStart, day_end_override: referenceDayEnd }
          : d
      )
    );
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/deliverables/${deliverableKey}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_number: phaseNumber, day_start: referenceDayStart, day_end: referenceDayEnd }),
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

  // Task 247: a project not on the specialized customer_phases engine never has a Wizard, a
  // customer_phases-backed Timeline, or a `programme_started_at` — delegate entirely to the
  // generic milestones/tasklists/tasks view instead of falling into the StackShift-shaped
  // "not started" screen below. Placed after every hook above (Rules of Hooks) but before any
  // StackShift-only state (wizardOpen/isPhase1Restricted/programmeStartedAt) is used.
  if (!project.uses_customer_phases_engine) {
    return (
      <GenericPhaseView
        project={project}
        backLink={backLink}
        projectUrlKey={projectUrlKey}
        initialMilestones={initialMilestones}
        tasklists={initialTasklists}
        tasks={initialGenericTasks}
        ownerDisplayName={ownerDisplayName}
        collaborators={collaborators}
        projectMembers={projectMembers}
        staffDirectory={staffDirectory}
        canManageProjMembers={canManageProjMembers}
        canSetOwner={canSetOwner}
        canDeleteProject={canDeleteProject}
        canManagePhases={canManagePhases}
        membershipBusy={membershipBusy}
        membershipError={membershipError}
        onAddProjectMembers={handleAddProjectMembers}
        onRemoveProjectMember={handleRemoveProjectMember}
        onTransferProjectOwnership={handleTransferProjectOwnership}
      />
    );
  }

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
            className={cn("mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors", "border-[#E2E7F2] bg-white text-[#3A4565] hover:bg-[#F4F6FB]")}
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
    // Task 248: this project's actual phase set (defaults minus any skipped, plus any customs
    // configured at intake) — merged and sort_order-ordered the same way seed.ts's own
    // buildSeedPhaseEntries resolves it at actual seed time, so the button label/Jump-to-phase
    // menu shown here never disagrees with what clicking them will actually seed.
    const orderedPlan = buildOrderedPhasePlan(project.draft_custom_phases);
    const skipSet = new Set(project.draft_skip_phase_numbers);
    const firstActivePhase = orderedPlan.find((p) => !skipSet.has(p.number)) ?? orderedPlan[0] ?? PROGRAMME_PHASES[0];

    // scheduled_start_phase (the literal phase a schedule targets) stays capped to the 5 defaults
    // by POST /api/onboarding/projects' own validation (1-5). It defaults to Phase 1 whenever the
    // New Project form's "Start at phase" selector was left untouched — including when the PM
    // instead skipped Phase 1 via the phase builder's own per-phase checkbox, which doesn't sync
    // that selector. Resolved the same way seedAndStartProgramme itself resolves it at actual
    // auto-start time (resolveEffectivePhaseNumber's before/target/after cascade), so this card
    // never advertises a phase that will never run — it shows whichever phase will actually start.
    const rawScheduledPhaseNumber = (project.scheduled_start_phase ?? 1) as number;
    const scheduledPhaseNumber = resolveEffectivePhaseNumber(orderedPlan, rawScheduledPhaseNumber, project.draft_skip_phase_numbers);
    const scheduledPhase = orderedPlan.find((p) => p.number === scheduledPhaseNumber) ?? firstActivePhase;
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
              Start the {programmeDurationDays}-day programme to begin tracking Phase 1 — or jump straight to whichever phase they&apos;re actually starting from.
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
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
                      onChange={(e) => setAltPhase(e.target.value ? Number(e.target.value) : null)}
                      disabled={busy}
                      className="h-9 cursor-pointer appearance-none rounded-[9px] border-[1.5px] border-[#E2E7F2] bg-white py-1.5 pl-3 pr-8 text-[13px] text-[#0B1533] outline-none transition-colors focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 12px center",
                      }}
                    >
                      <option value="">Select Phase</option>
                      {orderedPlan
                        .filter((p) => p.number !== scheduledPhaseNumber)
                        .map((p) => (
                          <option key={p.number} value={p.number} disabled={skipSet.has(p.number)}>
                            Phase {p.number}: {p.name}
                            {skipSet.has(p.number) ? " (Skipped)" : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                  {altPhase && (
                    <button
                      type="button"
                      onClick={() => startAtPhase(altPhase)}
                      disabled={busy}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
                  onClick={() => startAtPhase(firstActivePhase.number)}
                  disabled={starting}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <PlayCircle size={15} /> {starting ? "Starting…" : `Start ${firstActivePhase.name}`}
                </button>
                <JumpToPhaseMenu
                  open={jumpOpen}
                  setOpen={setJumpOpen}
                  note={jumpNote}
                  setNote={setJumpNote}
                  onJump={handleJump}
                  jumping={jumping}
                  phases={orderedPlan}
                  skipSet={skipSet}
                />
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
  // Task 246: this project's actual phase set (defaults + any customs) resolved via
  // resolveEffectivePhase and ordered by sort_order — the Swimlane loop and every phase-count/
  // "last phase" derivation below reads from this instead of the static PROGRAMME_PHASES array.
  const sortedPhaseRows = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  const deliverablesByPhaseNumber = new Map<number, typeof deliverables>();
  for (const d of deliverables) {
    if (!deliverablesByPhaseNumber.has(d.phase_number)) deliverablesByPhaseNumber.set(d.phase_number, []);
    deliverablesByPhaseNumber.get(d.phase_number)!.push(d);
  }
  const orderedPhases = sortedPhaseRows.map((p) => resolveEffectivePhase(p, deliverablesByPhaseNumber.get(p.phase_number) ?? []));
  const activePhaseNumber = phases.find((p) => p.status === "active")?.phase_number ?? getPhaseForDay(unscaleDay(currentDay, programmeDurationDays)).number;
  const activePhase = orderedPhases.find((p) => p.number === activePhaseNumber) ?? orderedPhases[0] ?? PROGRAMME_PHASES[0];
  const isComplete = sortedPhaseRows.length > 0 && sortedPhaseRows[sortedPhaseRows.length - 1].status === "completed";
  const phaseStatusMap = new Map(phases.map((p) => [p.phase_number, p.status]));
  // Chat follow-up to task 244: this project's *permanently* excluded phases — sourced from
  // project.draft_skip_phase_numbers (the PM's own intake-time configuration), not each phase
  // row's DB status. A phase's DB status also reads "skipped" for a merely time-bypassed phase
  // (an unrelated manual Jump-to-phase landing past it — same status value, different meaning,
  // see the already-started PATCH route's own permanentSkipSet fix) — that kind of "skipped" is
  // temporary and should keep its calendar days and stay jumpable, unlike a phase the PM opted
  // this project out of entirely.
  const startedSkipNumbers = project.draft_skip_phase_numbers;
  // Chat follow-up to task 244: skipped phases no longer occupy any calendar days on the shared
  // grid/progress bar/timeline at all — Day 1 now aligns with the first non-skipped phase, not
  // Onboard's static reference day 1. Every non-skipped phase (and its own deliverables) gets its
  // dayStart/dayEnd re-expressed on this skip-compressed scale for rendering; a skipped phase's
  // row keeps its original static range, though it's never actually displayed — task 254 removed
  // the skipped-row collapse toggle entirely (it starts, and permanently stays, collapsed), so
  // there's no way to expand it and see this anymore.
  // Both the Swimlane loop and buildReminders read from this single compressed source, so the
  // "days remaining" reminder and the Gantt grid always agree.
  const compressedPhases = orderedPhases.map((p) =>
    startedSkipNumbers.includes(p.number)
      ? p
      : {
          ...p,
          dayStart: compressReferenceDay(p.dayStart, orderedPhases, startedSkipNumbers),
          dayEnd: compressReferenceDay(p.dayEnd, orderedPhases, startedSkipNumbers),
          deliverables: p.deliverables.map((d) => ({
            ...d,
            dayStart: compressReferenceDay(d.dayStart, orderedPhases, startedSkipNumbers),
            dayEnd: compressReferenceDay(d.dayEnd, orderedPhases, startedSkipNumbers),
          })),
        }
  );
  // Chat follow-up: the grid's own visible column count (reference scale), compressed the same
  // way — Optimize's static dayEnd (120) minus every skipped phase's day-span before it.
  const visibleTotalDays = compressReferenceDay(TOTAL_DAYS, orderedPhases, startedSkipNumbers);
  // The same compressed total, converted to this project's real calendar-day scale — what the
  // progress bar/header actually display as "the programme length" now that skipped phases'
  // days are excluded from it. `programmeDurationDays` itself keeps its original (PM-configured)
  // value everywhere else — it's still the correct scale ratio for scaleDay/unscaleDay, since that
  // never changed; only the *displayed* total shrinks.
  const visibleDurationDays = scaleDay(visibleTotalDays, programmeDurationDays);
  // Task 253: compressedPhases is the storage-compatible (skip-)compressed reference scale used
  // by buildReminders and by the drag-resize round-trip (handleScheduleChange unscales back onto
  // it). Everything actually rendered to the user — Swimlane bars, the Jump-to-phase dropdown,
  // deliverable date badges — needs the *further* scaleDay conversion to this project's real
  // programmeDurationDays, same as visibleDurationDays above, so a phase's own displayed day range
  // can never exceed the header's own displayed total. Identity (no-op) at the 120-day default.
  const displayPhases = compressedPhases.map((p) => ({
    ...p,
    dayStart: scaleDay(p.dayStart, programmeDurationDays),
    dayEnd: scaleDay(p.dayEnd, programmeDurationDays),
    deliverables: p.deliverables.map((d) => ({
      ...d,
      dayStart: scaleDay(d.dayStart, programmeDurationDays),
      dayEnd: scaleDay(d.dayEnd, programmeDurationDays),
    })),
  }));
  const progressPct = Math.min(100, Math.round((currentDay / visibleDurationDays) * 100));
  // Whole-programme overdue (mirrors ProgrammeTrack's own per-phase overdue flag, at the
  // project's own compressed programme length) — currentDay isn't capped at visibleDurationDays,
  // so a stalled project can genuinely pass it.
  const programmeOverdue = !isComplete && currentDay > visibleDurationDays;
  const daysOverdue120 = currentDay - visibleDurationDays;
  const deliverableStatusMap = new Map(deliverables.map((d) => [d.deliverable_key, d.status]));
  const remindersDeliverableMap = new Map(deliverables.filter((d) => d.phase_number === 1).map((d) => [d.deliverable_key, d.status]));
  const reminders = buildReminders(currentDay, phaseStatusMap, remindersDeliverableMap, compressedPhases, programmeDurationDays);
  const visual = PHASE_VISUALS[activePhaseNumber] ?? PHASE_VISUALS[1];
  const internalByKey = new Map(internalDeliverables.map((d) => [d.deliverable_key, d]));
  const isManualOverride = phases.find((p) => p.phase_number === activePhaseNumber)?.is_manual_override;

  // Chat follow-up: excludes skipped phases — a skipped phase is seeded with zero
  // customer_deliverables rows (seed.ts), but resolveEffectivePhase falls back to the static
  // default deliverable list whenever a phase has zero rows (to support legacy pre-seed data), so
  // without this filter a skipped phase's full static deliverable count re-appears in the total.
  const totalDeliverables = orderedPhases
    .filter((p) => phaseStatusMap.get(p.number) !== "skipped")
    .reduce((s, p) => s + p.deliverables.length, 0);
  const doneDeliverables = deliverables.filter((d) => d.status === "done").length;
  const phasesCompleted = phases.filter((p) => p.status === "completed").length;
  const daysRemaining = Math.max(0, visibleDurationDays - currentDay);

  // Task 253: the grid's own axis is now visibleDurationDays (real, scaled days — see the `days`
  // array below), the same scale currentDay already lives on, so the "today" marker needs no
  // conversion anymore — it used to unscale onto the (skip-)compressed *reference* scale the grid
  // used to render on before this task moved the grid itself onto the display-scaled axis.
  const gridMarkerDay = currentDay;

  function scrollToToday(behavior: ScrollBehavior = "auto") {
    if (!scrollRef.current) return;
    const target = Math.max(0, LABEL_WIDTH + (gridMarkerDay - 1) * DAY_WIDTH - (scrollRef.current.clientWidth - LABEL_WIDTH) / 2);
    scrollRef.current.scrollTo({ left: target, behavior });
  }

  // Task 253: the grid's column axis is the display-scaled total (visibleDurationDays), not the
  // raw (skip-)compressed reference total (visibleTotalDays) — see displayPhases above. 1 column
  // now always represents 1 real calendar day of this project's actual programme_duration_days,
  // so DateColumnHeader's addDays(startDate, day - 1) below is finally accurate for a non-default
  // duration. Identity (no-op) at the 120-day default, where the two totals are equal.
  const days = Array.from({ length: visibleDurationDays }, (_, i) => i + 1);

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
              {(canManageProjMembers || canSetOwner || canDeleteProject) && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSettingsMenuOpen((v) => !v)}
                    aria-label="Project Settings"
                    title="Project Settings"
                    className={cn(
                      "inline-flex cursor-pointer items-center justify-center rounded-full border p-2.5 transition-colors",
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
                          <Users size={13} className="text-[#5F6A88]" /> Manage Collaborators
                        </button>
                      )}
                      {canDeleteProject && (
                        <>
                          {(canManageProjMembers || canSetOwner) && <div className="my-1 border-t border-[#EDF0F7]" />}
                          <DeleteProjectMenuItem projectUrlKey={projectUrlKey} projectName={project.name} />
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {canManagePhases && (
                <JumpToPhaseMenu
                  open={jumpOpen}
                  setOpen={setJumpOpen}
                  note={jumpNote}
                  setNote={setJumpNote}
                  onJump={handleJump}
                  jumping={jumping}
                  phases={displayPhases}
                  skipSet={new Set(startedSkipNumbers)}
                  currentPhaseNumber={activePhaseNumber}
                />
              )}
              {/* Chat follow-up: also requires Phase 1's own row not be skipped — every project
                  still gets a phase_number 1 row regardless (seed.ts), so the bare existence
                  check alone can't tell a real Phase 1 apart from an excluded one. */}
              {!isComplete && phases.some((p) => p.phase_number === 1 && p.status !== "skipped") && canOpenWizard && (
                <button
                  type="button"
                  onClick={() => {
                    router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}/onboarding-workspace`);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-colors hover:bg-[#0063D6]"
                >
                  <PlayCircle size={14} /> {activePhaseNumber === 1 ? "Onboarding Workspace" : "View Onboarding Workspace"}
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
              onAdd={handleAddProjectMembers}
              onRemove={handleRemoveProjectMember}
              onClose={() => setCollaboratorsPanelOpen(false)}
            />
          )}
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:gap-6">
            <div className="min-w-0 lg:flex-1">
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#0B1533]">{visibleDurationDays}-Day Programme Progress</span>
                <span className={cn("font-mono text-[11px]", programmeOverdue ? "font-semibold text-[#C0392B]" : "text-[#5F6A88]")}>
                  {isComplete ? (
                    "Complete"
                  ) : programmeOverdue ? (
                    <>{daysOverdue120} DAY{daysOverdue120 === 1 ? "" : "S"} OVERDUE</>
                  ) : (
                    <>DAY {currentDay} OF {visibleDurationDays}</>
                  )}
                </span>
              </div>
              <div className="relative h-5 rounded-full bg-[#EDF0F7]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: isComplete
                      ? "#177E48"
                      : programmeOverdue
                        ? "linear-gradient(90deg,#FDE8E6,#C0392B)"
                        : `linear-gradient(90deg, ${PHASE_TINT_HEX[activePhaseNumber] ?? PHASE_TINT_HEX[1]}, ${PHASE_HEX[activePhaseNumber] ?? PHASE_HEX[1]})`,
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#071133] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white shadow-[0_1px_3px_rgba(7,17,51,.35)]"
                  style={{ left: `clamp(28px, ${progressPct}%, calc(100% - 28px))` }}
                >
                  DAY {currentDay}
                </div>
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase text-[#5F6A88]">
                <span>Day 1 ({formatDate(startDate).toUpperCase()})</span>
                <span>Day {visibleDurationDays} ({formatDate(addDays(startDate, visibleDurationDays - 1)).toUpperCase()})</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap lg:shrink-0 lg:flex-nowrap">
              <StatChip icon={Clock} label="Days left" value={daysRemaining} />
              <StatChip icon={CheckCircle2} label="Phases done" value={phasesCompleted} />
              <StatChip icon={ListChecks} label="Deliverables" value={`${doneDeliverables}/${totalDeliverables}`} />
              <button
                type="button"
                onClick={() => setSummaryOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-full border border-[#E2E7F2] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#007BFF]"
              >
                <ClipboardList size={13} /> Status Summary
              </button>
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
            <div className="relative" style={{ width: LABEL_WIDTH + visibleDurationDays * DAY_WIDTH }}>
              <div className="flex border-b border-[#E2E7F2]">
                <div className="sticky left-0 shrink-0 border-r z-3 border-[#E2E7F2] bg-white" style={{ width: LABEL_WIDTH }} />
                {days.map((day) => (
                  <DateColumnHeader key={day} date={addDays(startDate, day - 1)} isToday={day === gridMarkerDay} />
                ))}
              </div>

              {gridMarkerDay <= visibleDurationDays && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-2 w-0 border-l-2 border-dashed border-[#FB914E]"
                  style={{ left: LABEL_WIDTH + (gridMarkerDay - 1) * DAY_WIDTH + DAY_WIDTH / 2 }}
                >
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-[#F9C9A0] bg-[#FFEFE3] px-1.5 py-0.5 text-[9px] font-bold text-[#FB914E]">
                    Day {gridMarkerDay}
                  </div>
                </div>
              )}

              {displayPhases.map((phase, index) => (
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
                  onOpenDeliverable={handleOpenPhaseDeliverable}
                  expandedDeliverable={expandedDeliverable}
                  onExpandDeliverable={setExpandedDeliverable}
                  canEditSchedule={canEditSchedule}
                  onScheduleChange={handleScheduleChange}
                  index={index}
                  startDate={startDate}
                  role={role}
                  totalDays={visibleDurationDays}
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

      <StatusSummaryDrawer open={summaryOpen} onClose={() => setSummaryOpen(false)} projectUuid={project.id} />
    </div>
  );
}
