"use client";

import React from "react";
import type { Database } from "@/types/database";

// ─── DB row aliases ─────────────────────────────────────────────────────────
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];

export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];

// ─── Kanban columns — mirrors Zoho Projects workflow ────────────────────────
export const BOARD_COLUMNS: { id: TaskStatus; label: string; accent: string }[] = [
  { id: "open",                label: "Open",                accent: "#16A34A" },
  { id: "in_progress",         label: "In Progress",         accent: "#EA580C" },
  { id: "ready_for_qa",        label: "Ready for QA/QC",     accent: "#0D9488" },
  { id: "testing_completed",   label: "Testing Completed",   accent: "#2563EB" },
  { id: "for_client_approval", label: "For Client Approval", accent: "#D97706" },
  { id: "ready_to_merge",      label: "Ready to Merge",      accent: "#DC2626" },
  { id: "post_live_qa",        label: "Post-live QA/QC",     accent: "#14B8A6" },
  { id: "closed",              label: "Closed",              accent: "#94A3B8" },
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open:                "Open",
  in_progress:         "In Progress",
  ready_for_qa:        "Ready for QA/QC",
  testing_completed:   "Testing Completed",
  for_client_approval: "For Client Approval",
  ready_to_merge:      "Ready to Merge",
  post_live_qa:        "Post-live QA/QC",
  closed:              "Closed",
};

export const STATUS_STYLE: Record<TaskStatus, { text: string; bg: string; border: string }> = {
  open:                { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  in_progress:         { text: "#EA580C", bg: "#FFF7ED", border: "#FED7AA" },
  ready_for_qa:        { text: "#0D9488", bg: "#F0FDFA", border: "#99F6E4" },
  testing_completed:   { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  for_client_approval: { text: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  ready_to_merge:      { text: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  post_live_qa:        { text: "#14B8A6", bg: "#F0FDFA", border: "#CCFBF1" },
  closed:              { text: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0" },
};

export const PRIORITY_STYLE: Record<TaskPriority, { label: string; text: string; dot: string }> = {
  critical: { label: "Critical", text: "#DC2626", dot: "#DC2626" },
  high:     { label: "High",     text: "#EA580C", dot: "#EA580C" },
  normal:   { label: "Normal",   text: "#2563EB", dot: "#2563EB" },
  low:      { label: "Low",      text: "#94A3B8", dot: "#94A3B8" },
};

export const PROJECT_STATUS_STYLE: Record<string, { text: string; bg: string; border: string; label: string }> = {
  not_started: { text: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", label: "Not Started" },
  active:      { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", label: "Active" },
  on_hold:     { text: "#D97706", bg: "#FFFBEB", border: "#FDE68A", label: "On Hold" },
  completed:   { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", label: "Completed" },
  archived:    { text: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0", label: "Archived" },
};

export const PROJECT_TYPE_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  "Content Site":    { text: "#0D9488", bg: "#F0FDFA", border: "#99F6E4" },
  "Ecommerce (B2C)": { text: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  "Ecommerce (B2B)": { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  "Custom App":      { text: "#EA580C", bg: "#FFF7ED", border: "#FED7AA" },
};

export const PROJECT_TYPES = [
  "Content Site",
  "Ecommerce (B2C)",
  "Ecommerce (B2B)",
  "Custom App",
] as const;

// ─── Fractional position (midpoint reorder) ─────────────────────────────────
export function midpoint(prev?: number | null, next?: number | null): number {
  if (prev == null && next == null) return Date.now();
  if (prev == null) return (next as number) - 1;
  if (next == null) return (prev as number) + 1;
  return ((prev as number) + (next as number)) / 2;
}

// ─── Small presentational helpers ───────────────────────────────────────────
export function StatusBadge({ status }: { status: TaskStatus }) {
  const c = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_STYLE[priority];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: p.text }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.dot }} />
      {p.label}
    </span>
  );
}

export function ProjectStatusBadge({ status, pct }: { status: string; pct?: number }) {
  const key = status === "active" && (pct ?? 1) === 0 ? "not_started" : status;
  const c = PROJECT_STATUS_STYLE[key] ?? PROJECT_STATUS_STYLE.active;
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {c.label}
    </span>
  );
}

export function ProjectTypeBadge({ type }: { type: string }) {
  const c = PROJECT_TYPE_STYLE[type] ?? { text: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" };
  return (
    <span
      className="self-start inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md border whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {type}
    </span>
  );
}

// ─── Deterministic tag color — pastel palette matching Zoho's light-bg + dark-text style ─
const TAG_PALETTE = [
  "#C4B5FD", // lavender
  "#93C5FD", // sky blue
  "#6EE7B7", // mint
  "#FED7AA", // peach
  "#FCA5A5", // blush
  "#86EFAC", // sage
  "#7DD3FC", // ice blue
  "#A5B4FC", // periwinkle
  "#FDE68A", // butter
  "#BAE6FD", // powder blue
];

export function tagColorFor(tag: string): string {
  let hash = 0;
  for (const ch of tag) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

// Zoho's exact clip-path (--clippySize = 10px resolved) — smooth curved arrow tip + 3px left radius
const ZOHO_TAG_CLIP =
  "polygon(0 3px, 0.4px 1.2px, 1.2px 0.4px, 3px 0, calc(100% - 10.5px) 0px, calc(100% - 9.9px) .1px, calc(100% - 9.7px) .2px, calc(100% - 9.4px) .3px, calc(100% - 9.1px) .5px, calc(100% - 8.8px) .7px, calc(100% - 8.6px) .9px, calc(100% - 0.8px) calc(50% - 0.3px), calc(100% - 0.7px) 50%, calc(100% - 0.8px) calc(50% + 0.3px), calc(100% - 8.6px) calc(100% - 0.9px), calc(100% - 8.8px) calc(100% - 0.7px), calc(100% - 9.1px) calc(100% - 0.5px), calc(100% - 9.4px) calc(100% - 0.3px), calc(100% - 9.7px) calc(100% - 0.2px), calc(100% - 9.9px) calc(100% - 0.1px), calc(100% - 10.5px) 100%, 3px 100%, 1.2px calc(100% - 0.4px), 0.4px calc(100% - 1.2px), 0 calc(100% - 3px))";

export function TagChip({
  tag,
  idx = 0,
  canRemove,
  onRemove,
}: {
  tag: string;
  idx?: number;
  canRemove?: boolean;
  onRemove?: () => void;
}) {
  const bg = tagColorFor(tag);

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium leading-5 text-black whitespace-nowrap select-none"
      style={{
        background: bg,
        clipPath: ZOHO_TAG_CLIP,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: "8px",
        paddingRight: "10px",
        boxShadow: "rgba(0,0,0,0.18) inset 0 0 10px -4px",
      }}
    >
      {tag}
      {canRemove && onRemove && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          className="leading-none opacity-60 hover:opacity-100 transition-opacity cursor-pointer text-[12px] ml-0.5"
          title={`Remove ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function OwnerChip({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#2563EB", "#7C3AED", "#0D9488", "#DC2626", "#D97706"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
      style={{ background: bg }}
      title={name}
    >
      {initials}
    </div>
  );
}

export function CompletionRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const strokeWidth = 3;
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const cx = size / 2;
  const cy = size / 2;
  const trackColor = "#E2E8F0";
  const fillColor = pct === 100 ? "#16A34A" : "#2563EB";
  const textColor = "#334155";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={fillColor} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
      />
      <text
        x={cx} y={cy}
        dominantBaseline="middle" textAnchor="middle"
        style={{ fontSize: size * 0.24, fill: textColor, fontWeight: 600, transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px` }}
      >
        {pct}%
      </text>
    </svg>
  );
}

export function businessDaysRemaining(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(endDate + "T00:00:00");
  if (isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (end.getTime() === today.getTime()) return 0;
  let days = 0;
  const dir = end > today ? 1 : -1;
  const cur = new Date(today);
  while (cur.getTime() !== end.getTime()) {
    cur.setDate(cur.getDate() + dir);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days += dir;
  }
  return days;
}

const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0D9488", "#DC2626", "#D97706"];

export function AssigneeChip({ id, idx }: { id: string; idx: number }) {
  const initials = id.replace(/-/g, "").slice(0, 2).toUpperCase();
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white"
      style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
      title={id}
    >
      {initials}
    </div>
  );
}

export function formatDueDate(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
