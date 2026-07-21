"use client";

import React from "react";
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ─── KPI Card ────────────────────────────────────────────────────────────────

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  // Rich design props
  subtext?: React.ReactNode;
  subtextColor?: string;
  chip?: React.ReactNode;
  trailing?: React.ReactNode;
  delta?: { text: string; dir: "up" | "down" };
  valueColor?: string;
  // Legacy (dev-dashboard uses these)
  accentClass?: string;
  badge?: React.ReactNode;
}

export function KpiCard({ label, value, subtext, subtextColor, chip, trailing, delta, valueColor, accentClass, badge }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-medium text-slate-500">{label}</span>
        {chip ?? badge}
      </div>
      <div
        className={`font-heading text-[30px] font-bold leading-tight tracking-[-0.025em] flex items-center gap-2 ${accentClass ?? ""}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
        {trailing}
      </div>
      {subtext && (
        <div className="text-[12px] flex items-center gap-1" style={{ color: subtextColor ?? "#64748B" }}>
          {subtext}
        </div>
      )}
      {delta && (
        <div className={`flex items-center gap-1 text-[11px] font-medium ${delta.dir === "up" ? "text-green-600" : "text-red-500"}`}>
          {delta.dir === "up" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {delta.text} vs yesterday
        </div>
      )}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  title: React.ReactNode;
  trailing?: React.ReactNode;
  noPad?: boolean;
  children: React.ReactNode;
}

export function SectionCard({ title, trailing, noPad, children }: SectionCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <span className="text-[13px] font-semibold text-slate-900">{title}</span>
        {trailing}
      </div>
      <div className={noPad ? "" : "p-5"}>
        {children}
      </div>
    </div>
  );
}

// ─── AI Chip ─────────────────────────────────────────────────────────────────

export function AIChip({ label = "AI plan" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-600">
      <Sparkles size={9} />
      {label}
    </span>
  );
}

// ─── Status Chip ─────────────────────────────────────────────────────────────

// v2.0 hex (task 166) — mapped onto DESIGN.md's ok/warn/late/neutral/blue/violet/ai tones so
// classification-record status/priority keeps distinguishable colors within the new palette.
const STATUS_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  "In progress": { text: "#007BFF", bg: "#E5F1FF", border: "#BBDCFF" },
  "in progress": { text: "#007BFF", bg: "#E5F1FF", border: "#BBDCFF" },
  "active":      { text: "#177E48", bg: "#E3F5EA", border: "#BEE7CD" },
  "Review":      { text: "#8A5A00", bg: "#FFF3D6", border: "#F0D896" },
  "review":      { text: "#8A5A00", bg: "#FFF3D6", border: "#F0D896" },
  "open":        { text: "#007BFF", bg: "#E5F1FF", border: "#BBDCFF" },
  "pending":     { text: "#6A48E0", bg: "#EFEAFD", border: "#D9CDFB" },
  "planning":    { text: "#0B8A93", bg: "#E2F6F7", border: "#BCE9EC" },
  "closed":      { text: "#5F6A88", bg: "#EDF0F7", border: "#E2E7F2" },
  "on_hold":     { text: "#5F6A88", bg: "#EDF0F7", border: "#E2E7F2" },
  "Critical":    { text: "#C0392B", bg: "#FDE8E6", border: "#F5C6C2" },
  "High":        { text: "#E2762F", bg: "#FFEFE3", border: "#F9C9A0" },
  "Normal":      { text: "#007BFF", bg: "#E5F1FF", border: "#BBDCFF" },
  "Low":         { text: "#5F6A88", bg: "#EDF0F7", border: "#E2E7F2" },
};

export function StatusChip({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.open;
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Priority Chip ────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "text-[#C0392B]",
  HIGH:     "text-[#E2762F]",
  NORMAL:   "text-[#007BFF]",
  LOW:      "text-[#5F6A88]",
};

export function PriorityDot({ priority }: { priority: string | null }) {
  const cls = PRIORITY_COLORS[priority ?? "NORMAL"] ?? "text-slate-400";
  return (
    <span className={`text-[11px] font-semibold ${cls}`}>
      {priority === "CRITICAL" ? "Critical" : priority === "HIGH" ? "High" : priority === "NORMAL" ? "Normal" : "Low"}
    </span>
  );
}

// ─── Confidence Bar ───────────────────────────────────────────────────────────

export function ConfidenceBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color = clamped >= 80 ? "#2563EB" : clamped >= 60 ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex items-center gap-2.5 mt-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-mono text-slate-400 shrink-0">{clamped}%</span>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0D9488", "#DC2626", "#D97706"];

export function Avatar({ initials, size = 7, idx = 0 }: { initials: string; size?: number; idx?: number }) {
  const sizeClass = size === 7 ? "w-7 h-7 text-[10px]" : size === 6 ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[11px]";
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-semibold text-white shrink-0 border-2 border-white`}
      style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
    >
      {initials}
    </div>
  );
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

export function SkeletonRow() {
  return <div className="h-14 animate-pulse bg-slate-100 rounded-lg mb-2" />;
}

// ─── v2.0 Chip (status / phase) — DESIGN.md Section 5 "Chips" ─────────────────
// Hex values below are literal, matching DESIGN.md's `colors` frontmatter exactly
// (ok/warn/late + the 5 fixed phase hues) — never derived or approximated.

const chipVariants = cva(
  "inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.02em] px-2 py-[2.5px] rounded-[5px] whitespace-nowrap",
  {
    variants: {
      tone: {
        ok: "bg-[#E3F5EA] text-[#177E48]",
        warn: "bg-[#FFF3D6] text-[#8A5A00]",
        late: "bg-[#FDE8E6] text-[#C0392B]",
        neutral: "bg-[#EDF0F7] text-[#5F6A88]",
        onboard: "bg-[#FFEFE3] text-[#E2762F]",
        migrate: "bg-[#E5F1FF] text-[#0063D6]",
        publish: "bg-[#EFEAFD] text-[#6A48E0]",
        ai: "bg-[#E2F6F7] text-[#0B8A93]",
        optimize: "bg-[#E3F5EA] text-[#177E48]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface ChipProps extends VariantProps<typeof chipVariants> {
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function Chip({ tone, dot, children, className }: ChipProps) {
  return (
    <span className={cn(chipVariants({ tone }), className)}>
      {dot && <span className="w-[5px] h-[5px] rounded-full bg-current shrink-0" />}
      {children}
    </span>
  );
}

// Phase number (1-5) → chip tone + track gradient, matching DESIGN.md's fixed phase-hue table.
export const PHASE_TONE: Record<number, "onboard" | "migrate" | "publish" | "ai" | "optimize"> = {
  1: "onboard",
  2: "migrate",
  3: "publish",
  4: "ai",
  5: "optimize",
};

export const PHASE_GRADIENT: Record<number, string> = {
  1: "linear-gradient(90deg,#FFDDC2,#FB914E)",
  2: "linear-gradient(90deg,#BBDCFF,#007BFF)",
  3: "linear-gradient(90deg,#D9CDFB,#6A48E0)",
  4: "linear-gradient(90deg,#BCE9EC,#0B8A93)",
  5: "linear-gradient(90deg,#C4EBD3,#177E48)",
};

export function PhaseChip({ phaseNumber, phaseName }: { phaseNumber: number; phaseName: string }) {
  return <Chip tone={PHASE_TONE[phaseNumber] ?? "neutral"}>{phaseName}</Chip>;
}

// ─── Onboarding programme status pill (draft / scheduled / in_progress) ──────
// Moved from marketing-dashboard.tsx so pm-dashboard.tsx's Clients table can share it
// instead of re-declaring its own copy. `isDark` stays optional — Dev/Marketing keep their
// dark-mode toggle (dark hex unchanged from before); PM dashboard is fixed-light and never
// passes it, defaulting to the v2.0 light values.
const ONBOARDING_STATUS_STYLE: Record<
  string,
  { label: string; lightBg: string; lightText: string; darkBg: string; darkText: string }
> = {
  draft: { label: "Draft", lightBg: "bg-[#EDF0F7]", lightText: "text-[#5F6A88]", darkBg: "bg-white/[0.06]", darkText: "text-slate-400" },
  scheduled: { label: "Scheduled", lightBg: "bg-[#FFF3D6]", lightText: "text-[#8A5A00]", darkBg: "bg-amber-500/15", darkText: "text-amber-400" },
  in_progress: { label: "In progress", lightBg: "bg-[#E5F1FF]", lightText: "text-[#0063D6]", darkBg: "bg-blue-500/15", darkText: "text-blue-400" },
};

export function OnboardingStatusPill({ status, isDark = false }: { status: string; isDark?: boolean }) {
  const s = ONBOARDING_STATUS_STYLE[status] ?? ONBOARDING_STATUS_STYLE.draft;
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${isDark ? `${s.darkBg} ${s.darkText}` : `${s.lightBg} ${s.lightText}`}`}>
      {s.label}
    </span>
  );
}

// ─── Programme track — DESIGN.md Section 5 "Programme track" (signature element) ──
// Day 1-120 pill track, phase-boundary ticks at days 15/30/60/90, phase-hue gradient fill,
// navy day-marker pill. Inline styles used only for the multi-background-position tick marks
// and the dynamic fill width/gradient — neither is expressible as static Tailwind utilities.
export function ProgrammeTrack({ currentDay, phaseNumber }: { currentDay: number; phaseNumber: number | null }) {
  const pct = Math.min(100, Math.max(0, (currentDay / 120) * 100));
  const gradient = phaseNumber ? PHASE_GRADIENT[phaseNumber] : "linear-gradient(90deg,#BBDCFF,#007BFF)";
  return (
    <div className="relative h-[22px] rounded-full bg-[#EDF0F7]">
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: [
            "linear-gradient(#E2E7F2 0 0) 12.5% 0/1px 100% no-repeat",
            "linear-gradient(#E2E7F2 0 0) 25% 0/1px 100% no-repeat",
            "linear-gradient(#E2E7F2 0 0) 50% 0/1px 100% no-repeat",
            "linear-gradient(#E2E7F2 0 0) 75% 0/1px 100% no-repeat",
          ].join(", "),
        }}
      />
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: gradient }} />
      <span
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 font-mono text-[9px] font-semibold text-white bg-[#071133] px-[7px] py-[2px] rounded-full whitespace-nowrap shadow-[0_1px_3px_rgba(7,17,51,0.35)]"
        style={{ left: `${pct}%` }}
      >
        DAY {currentDay}
      </span>
    </div>
  );
}
