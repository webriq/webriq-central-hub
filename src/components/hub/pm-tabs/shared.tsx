"use client";

import React from "react";
import type { PMSettings } from "@/hooks/use-pm-settings";

/* ── Design Tokens ─────────────────────────────────────────────────────── */

export interface Tokens {
  bg: string; card: string; border: string;
  blue: string; orange: string; sky: string;
  violet: string; green: string; amber: string; red: string;
  text: string; sub: string; muted: string;
}

export const LIGHT: Tokens = {
  bg: "#f5f4f1", card: "#ffffff", border: "rgba(0,0,0,0.08)",
  blue: "#3358F4", orange: "#d45e09", sky: "#1565c0",
  violet: "#4f46e5", green: "#15803d", amber: "#a16207", red: "#b91c1c",
  text: "rgba(10,12,30,0.90)", sub: "rgba(10,12,30,0.50)", muted: "rgba(10,12,30,0.28)",
};

export const DARK: Tokens = {
  bg: "#090c18", card: "#121726", border: "rgba(255,255,255,0.08)",
  blue: "#5b7fff", orange: "#f97316", sky: "#60a5fa",
  violet: "#818cf8", green: "#4ade80", amber: "#fbbf24", red: "#f87171",
  text: "rgba(255,255,255,0.92)", sub: "rgba(255,255,255,0.50)", muted: "rgba(255,255,255,0.28)",
};

export function getTokens(settings: PMSettings): Tokens { return settings.theme === "dark" ? DARK : LIGHT; }

export const PRODUCT_ABBREV: Record<string, string> = {
  StackShift: "SS", PublishForge: "PF", PipelineForge: "PpF", CiteForge: "Ci",
};
export const PRODUCT_COLORS: Record<string, string> = {
  StackShift: "#3358F4", PublishForge: "#7C3AED", PipelineForge: "#F97316", CiteForge: "#0EA5E9",
};

/* ── Components ────────────────────────────────────────────────────────── */

// Dynamic fill bar — only width (data %) and per-row color need inline style
export function ProgressBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[5px] bg-[var(--c-track)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.min(100, pct)}%`, background: color ?? "var(--c-blue)" }}
        />
      </div>
      <span className="text-[11px] text-[var(--c-sub)] w-8 text-right font-mono">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// Status badge — theme-aware via parent CSS vars, pure Tailwind structure
const STATUS_COLOR_VAR: Record<string, string> = {
  onboarding: "--c-orange",
  active:     "--c-green",
  inactive:   "--c-muted",
};

export function StatusBadge({ status }: { status: string }) {
  const v = STATUS_COLOR_VAR[status] ?? STATUS_COLOR_VAR.inactive;
  return (
    <span
      className={`text-[11px] font-semibold rounded-[6px] px-2 py-px border whitespace-nowrap
        text-[var(${v})] bg-[var(${v})]/10 border-[var(${v})]/20`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// Product badge — uses fixed brand colors (not theme-dependent); minimal inline for dynamic color
export function ProductBadge({ name }: { name: string }) {
  const ab = PRODUCT_ABBREV[name] ?? name.slice(0, 2);
  const co = PRODUCT_COLORS[name] ?? "#64748b";
  return (
    <span
      className="text-[11px] font-semibold rounded-[5px] px-[7px] py-px whitespace-nowrap border"
      style={{ color: co, background: `${co}12`, borderColor: `${co}1e` }}
    >
      {ab}
    </span>
  );
}

// Priority dot — pure Tailwind, no token dependency
const PRIORITY_DOT_CLASS: Record<string, string> = {
  CRITICAL: "bg-red-700",
  HIGH:     "bg-orange-700",
  NORMAL:   "bg-blue-600",
  LOW:      "bg-slate-400",
};

export function PriorityDot({ priority }: { priority: string }) {
  return (
    <div
      className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${PRIORITY_DOT_CLASS[priority] ?? PRIORITY_DOT_CLASS.NORMAL}`}
    />
  );
}

// Section header — references parent CSS vars via Tailwind arbitrary values
export function SectionHeader({ title, sub, action }: {
  title: string; sub?: string; action?: string;
}) {
  return (
    <div className="flex items-end justify-between mb-[14px]">
      <div>
        <div className="text-[15px] font-bold text-[var(--c-text)] tracking-[-0.01em]">{title}</div>
        {sub && <div className="text-[11px] text-[var(--c-sub)] mt-[2px]">{sub}</div>}
      </div>
      {action && (
        <button className="text-xs font-semibold text-[var(--c-sky)] bg-transparent border-none cursor-pointer p-0 font-[inherit]">
          {action}
        </button>
      )}
    </div>
  );
}

// Stat card — colorVar is a CSS var name e.g. "--c-sky"; value color comes from parent container vars
export function StatCard({ value, label, colorVar }: {
  value: string; label: string; colorVar: string;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--c-border)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-[var(--c-card)] px-5 py-[18px]">
      <div className={`text-[30px] font-bold leading-none tracking-[-0.02em] text-[var(${colorVar})]`}>
        {value}
      </div>
      <div className="text-xs text-[var(--c-sub)] mt-[5px]">{label}</div>
    </div>
  );
}

// Client avatar — inline only for data-driven dimensions and dynamic brand color
export function ClientAvatar({ name, color, size = 34 }: {
  name: string; color: string; size?: number;
}) {
  const ini = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-[9px] flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.35) }}
    >
      {ini}
    </div>
  );
}

export function getClientColor(name: string): string {
  const c = ["#3358F4", "#d45e09", "#7C3AED", "#22C55E", "#0ea5e9"];
  return c[name.charCodeAt(0) % c.length];
}
