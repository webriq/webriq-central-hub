"use client";

import React from "react";
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";

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
        className={`text-[30px] font-bold leading-tight tracking-[-0.025em] flex items-center gap-2 ${accentClass ?? ""}`}
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

const STATUS_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  "In progress": { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  "in progress": { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  "active":      { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  "Review":      { text: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  "review":      { text: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  "open":        { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  "pending":     { text: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  "planning":    { text: "#0369A1", bg: "#F0F9FF", border: "#BAE6FD" },
  "closed":      { text: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
  "on_hold":     { text: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
  "Critical":    { text: "#DC2626", bg: "#FFF1F2", border: "#FECACA" },
  "High":        { text: "#EA580C", bg: "#FFF7ED", border: "#FDBA74" },
  "Normal":      { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  "Low":         { text: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
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
  CRITICAL: "text-red-600",
  HIGH:     "text-orange-500",
  NORMAL:   "text-blue-500",
  LOW:      "text-slate-400",
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
