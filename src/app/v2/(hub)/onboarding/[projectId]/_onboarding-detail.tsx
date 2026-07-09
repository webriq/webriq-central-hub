"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarClock, Flag, Bell, CheckCircle2, Clock, ChevronDown, ChevronRight, PlayCircle,
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
  project: { id: string; name: string; customer_id: string; company_name: string };
}

// ─── Gantt grid constants ─────────────────────────────────────────────────────

const TOTAL_DAYS = 120;
const DAY_WIDTH = 80;
const ROW_HEIGHT = 48;
const ROW_GAP = 6;
const LABEL_WIDTH = 200;

// ─── Per-phase palette (from _design/customers/CustomerTimeline.tsx's color system) ──

type PhaseVisual = { border: string; bg: string; ring: string; text: string; solid: string; iconBg: string; iconText: string };

const PHASE_VISUALS: Record<number, PhaseVisual> = {
  1: { border: "border-[#2563EB]", bg: "bg-[#EFF6FF]", ring: "shadow-[0_0_0_3px_rgba(37,99,235,0.09)]", text: "text-[#2563EB]", solid: "bg-[#2563EB]", iconBg: "bg-[#2563EB]/15", iconText: "text-[#2563EB]" },
  2: { border: "border-[#7C3AED]", bg: "bg-[#F5F3FF]", ring: "shadow-[0_0_0_3px_rgba(124,58,237,0.09)]", text: "text-[#7C3AED]", solid: "bg-[#7C3AED]", iconBg: "bg-[#7C3AED]/15", iconText: "text-[#7C3AED]" },
  3: { border: "border-[#0D9488]", bg: "bg-[#F0FDFA]", ring: "shadow-[0_0_0_3px_rgba(13,148,136,0.09)]", text: "text-[#0D9488]", solid: "bg-[#0D9488]", iconBg: "bg-[#0D9488]/15", iconText: "text-[#0D9488]" },
  4: { border: "border-[#D97706]", bg: "bg-[#FFFBEB]", ring: "shadow-[0_0_0_3px_rgba(217,119,6,0.09)]", text: "text-[#D97706]", solid: "bg-[#D97706]", iconBg: "bg-[#D97706]/15", iconText: "text-[#D97706]" },
  5: { border: "border-[#0F172A]", bg: "bg-[#F1F5F9]", ring: "shadow-[0_0_0_3px_rgba(15,23,42,0.09)]", text: "text-[#0F172A]", solid: "bg-[#0F172A]", iconBg: "bg-[#0F172A]/10", iconText: "text-[#0F172A]" },
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

function DeliverableCard({
  d, track, status, interactive, toggling, onToggle, internalItems, internalByKey, togglingKey, expanded, onToggleExpand, onToggleInternal,
}: {
  d: DeliverableConfig;
  track: number;
  status: string;
  interactive: boolean;
  toggling: boolean;
  onToggle?: () => void;
  internalItems: { key: string; name: string }[];
  internalByKey: Map<string, OnboardingInternalDeliverableRow>;
  togglingKey: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleInternal: (key: string, currentStatus: string) => void;
}) {
  const left = (d.dayStart - 1) * DAY_WIDTH;
  const width = (d.dayEnd - d.dayStart + 1) * DAY_WIDTH - 4;
  const top = track * (ROW_HEIGHT + ROW_GAP);
  const compact = width < 90;
  const doneInternal = internalItems.filter((item) => (internalByKey.get(item.key)?.status ?? "pending") === "done").length;
  const badgeRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

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

  const icon = status === "done"
    ? <CheckCircle2 size={13} className="text-[#16A34A] shrink-0" />
    : status === "in_progress"
      ? <Clock size={13} className="text-[#2563EB] shrink-0" />
      : <span className="h-3 w-3 shrink-0 rounded-full border-2 border-[#CBD5E1]" />;

  return (
    <div className="absolute" style={{ left, width, top, height: ROW_HEIGHT }}>
      <button
        type="button"
        onClick={interactive ? onToggle : undefined}
        disabled={!interactive || toggling}
        title={d.name}
        className={cn(
          "flex h-full w-full flex-col justify-center gap-1 overflow-hidden rounded-[10px] border-[1.5px] px-2.5 text-left transition-colors",
          status === "done" ? "border-[#BBF7D0] bg-[#F0FDF4]" : status === "in_progress" ? "border-[#2563EB]/40 bg-[#EFF6FF]" : "border-[#E2E8F0] bg-white",
          interactive ? "cursor-pointer hover:border-[#CBD5E1]" : "cursor-default"
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {toggling ? <span className="text-[9px] text-[#94A3B8]">…</span> : icon}
          <span className={cn("truncate text-[11.5px] font-medium", status === "done" ? "text-[#94A3B8] line-through" : "text-[#0F172A]")}>{d.name}</span>
        </div>
        {!compact && (
          <div className="flex items-center gap-1.5">
            {ownerChips(d.owner).map((c, idx) => (
              <span key={idx} className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white", c.colorClass)}>
                {c.label}
              </span>
            ))}
            <span className={cn(jetBrainsMono.className, "truncate text-[9px] text-[#94A3B8]")}>
              D{d.dayStart === d.dayEnd ? d.dayStart : `${d.dayStart}-${d.dayEnd}`}
            </span>
          </div>
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
              <div className="px-2 pb-1 pt-1 text-[9px] font-bold uppercase tracking-wide text-[#94A3B8]">Internal deliverables</div>
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
                    onClick={() => onToggleInternal(item.key, iStatus)}
                    disabled={togglingKey === `internal-${item.key}`}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-1.5 py-1 text-left transition-colors hover:bg-[#F8FAFC] disabled:opacity-60"
                  >
                    {togglingKey === `internal-${item.key}` ? <span className="text-[9px] text-[#94A3B8]">…</span> : iIcon}
                    <span className={cn("text-[11px]", iStatus === "done" ? "text-[#94A3B8] line-through" : "text-[#334155]")}>{item.name}</span>
                  </button>
                );
              })}
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

// ─── Swimlane ──────────────────────────────────────────────────────────────────

function Swimlane({
  phase, dbStatus, deliverableStatusMap, internalByKey, togglingKey, collapsed, onToggleCollapse,
  onToggleDeliverable, onToggleInternal, expandedDeliverable, onExpandDeliverable, index,
}: {
  phase: PhaseConfig;
  dbStatus: string;
  deliverableStatusMap: Map<string, string>;
  internalByKey: Map<string, OnboardingInternalDeliverableRow>;
  togglingKey: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleDeliverable: (key: string, currentStatus: string) => void;
  onToggleInternal: (key: string, currentStatus: string) => void;
  expandedDeliverable: string | null;
  onExpandDeliverable: (key: string | null) => void;
  index: number;
}) {
  const visual = PHASE_VISUALS[phase.number];
  const interactive = phase.number === 1;
  const tracks = assignTracks(phase.deliverables.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd })));
  const trackCount = tracks.length > 0 ? Math.max(...tracks) + 1 : 1;
  const laneHeight = trackCount * ROW_HEIGHT + (trackCount - 1) * ROW_GAP + 8;
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
        className="relative overflow-hidden"
        style={{ width: TOTAL_DAYS * DAY_WIDTH, height: collapsed ? 0 : laneHeight }}
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
              toggling={togglingKey === d.key}
              onToggle={() => onToggleDeliverable(d.key, deliverableStatusMap.get(d.key) ?? "pending")}
              internalItems={subInternal}
              internalByKey={internalByKey}
              togglingKey={togglingKey}
              expanded={expandedDeliverable === d.key}
              onToggleExpand={() => onExpandDeliverable(expandedDeliverable === d.key ? null : d.key)}
              onToggleInternal={onToggleInternal}
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
  const [starting, setStarting] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpNote, setJumpNote] = useState("");
  const [jumping, setJumping] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
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

  const handleToggleDeliverable = async (phaseNumber: number, deliverableKey: string, currentStatus: string) => {
    const next = currentStatus === "pending" ? "in_progress" : currentStatus === "in_progress" ? "done" : "pending";
    setTogglingKey(deliverableKey);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/deliverables/${deliverableKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_number: phaseNumber, status: next }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setDeliverables((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch {
      setError("Failed to update deliverable status.");
    } finally {
      setTogglingKey(null);
    }
  };

  const handleToggleInternalDeliverable = async (deliverableKey: string, currentStatus: string) => {
    const next = currentStatus === "pending" ? "in_progress" : currentStatus === "in_progress" ? "done" : "pending";
    setTogglingKey(`internal-${deliverableKey}`);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/internal-deliverables/${deliverableKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setInternalDeliverables((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch {
      setError("Failed to update internal deliverable status.");
    } finally {
      setTogglingKey(null);
    }
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
          onBack={() => { setWizardOpen(false); fetchProgramme(); }}
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
                  onClick={() => setWizardOpen(true)}
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
              scrollRef.current = node;
              if (node && !scrolledToTodayRef.current) {
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
                  togglingKey={togglingKey}
                  collapsed={collapsedPhases.has(phase.number)}
                  onToggleCollapse={() =>
                    setCollapsedPhases((prev) => {
                      const next = new Set(prev);
                      if (next.has(phase.number)) next.delete(phase.number);
                      else next.add(phase.number);
                      return next;
                    })
                  }
                  onToggleDeliverable={(key, status) => handleToggleDeliverable(phase.number, key, status)}
                  onToggleInternal={handleToggleInternalDeliverable}
                  expandedDeliverable={expandedDeliverable}
                  onExpandDeliverable={setExpandedDeliverable}
                  index={index}
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
