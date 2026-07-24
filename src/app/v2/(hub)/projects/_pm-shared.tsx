"use client";

import React from "react";
import type { Database } from "@/types/database";

// ─── DB row aliases ─────────────────────────────────────────────────────────
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
export type Tasklist = Database["public"]["Tables"]["tasklists"]["Row"];
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

// ─── v2.0 design-token semantic states (DESIGN.md Section 1) ────────────────
// --ok: #177E48/#E3F5EA · --warn: #8A5A00/#FFF3D6 · --late: #C0392B/#FDE8E6
// --blue: #007BFF/#E5F1FF (interactive, not a semantic state) · neutral: #5F6A88/#EDF0F7
// DESIGN.md's Chips spec carries no border (bg tint + text/dot only) — border is kept
// equal to bg here to satisfy this type's shape without introducing an unspecified hex.
export const STATUS_STYLE: Record<TaskStatus, { text: string; bg: string; border: string }> = {
  open:                { text: "#5F6A88", bg: "#EDF0F7", border: "#EDF0F7" }, // not started — neutral
  in_progress:         { text: "#007BFF", bg: "#E5F1FF", border: "#E5F1FF" }, // active — blue
  ready_for_qa:        { text: "#8A5A00", bg: "#FFF3D6", border: "#FFF3D6" }, // pending review — warn
  testing_completed:   { text: "#007BFF", bg: "#E5F1FF", border: "#E5F1FF" }, // active — blue
  for_client_approval: { text: "#8A5A00", bg: "#FFF3D6", border: "#FFF3D6" }, // awaiting decision — warn
  ready_to_merge:      { text: "#007BFF", bg: "#E5F1FF", border: "#E5F1FF" }, // active — blue
  post_live_qa:        { text: "#8A5A00", bg: "#FFF3D6", border: "#FFF3D6" }, // verification pending — warn
  closed:              { text: "#177E48", bg: "#E3F5EA", border: "#E3F5EA" }, // done — ok
};

export const PRIORITY_STYLE: Record<string, { label: string; text: string; dot: string }> = {
  critical: { label: "Critical", text: "#C0392B", dot: "#C0392B" },
  high:     { label: "High",     text: "#8A5A00", dot: "#8A5A00" },
  normal:   { label: "Normal",   text: "#007BFF", dot: "#007BFF" },
  low:      { label: "Low",      text: "#5F6A88", dot: "#5F6A88" },
  none:     { label: "—",        text: "#5F6A88", dot: "#E2E7F2" },
};

// Mirrors task 184/185's established project-status mapping: active/completed → ok,
// on_hold → warn, archived/not_started → neutral (both "inactive" buckets collapse
// together now that violet — the old not_started color — is a reserved phase hue).
export const PROJECT_STATUS_STYLE: Record<string, { text: string; bg: string; border: string; label: string }> = {
  not_started: { text: "#5F6A88", bg: "#EDF0F7", border: "#EDF0F7", label: "Not Started" },
  active:      { text: "#177E48", bg: "#E3F5EA", border: "#E3F5EA", label: "Active" },
  on_hold:     { text: "#8A5A00", bg: "#FFF3D6", border: "#FFF3D6", label: "On Hold" },
  completed:   { text: "#177E48", bg: "#E3F5EA", border: "#E3F5EA", label: "Completed" },
  archived:    { text: "#5F6A88", bg: "#EDF0F7", border: "#EDF0F7", label: "Archived" },
};

// Project type is a plain classification, not a status — single neutral treatment
// (the old 4-hue table collided with 4 of DESIGN.md's 5 reserved phase hues for a
// non-phase meaning, the same violation tasks 183/185 already fixed on their pages).
const PROJECT_TYPE_NEUTRAL = { text: "#5F6A88", bg: "#EDF0F7", border: "#EDF0F7" };

export const PROJECT_TYPES = [
  "Content Site",
  "Ecommerce (B2C)",
  "Ecommerce (B2B)",
  "Custom App",
] as const;

// ─── Status normalization (handles both normalized keys and raw Zoho names) ──
const STATUS_NORMALIZE: Record<string, string> = {
  open: "open", in_progress: "in_progress", ready_for_qa: "ready_for_qa",
  testing_completed: "testing_completed", for_client_approval: "for_client_approval",
  ready_to_merge: "ready_to_merge", post_live_qa: "post_live_qa", closed: "closed",
  "Open": "open", "In Progress": "in_progress", "Ready for QA/QC": "ready_for_qa",
  "Testing Completed": "testing_completed", "For Client Approval": "for_client_approval",
  "Ready to Merge": "ready_to_merge", "Post-live QA/QC": "post_live_qa",
  "Post Live QA": "post_live_qa", "Closed": "closed",
};
export function normalizeStatus(s: string): string {
  return STATUS_NORMALIZE[s] ?? "open";
}

// ─── Fractional position (midpoint reorder) ─────────────────────────────────
export function midpoint(prev?: number | null, next?: number | null): number {
  if (prev == null && next == null) return Date.now();
  if (prev == null) return (next as number) - 1;
  if (next == null) return (prev as number) + 1;
  return ((prev as number) + (next as number)) / 2;
}

// ─── Small presentational helpers ───────────────────────────────────────────
export function StatusBadge({ status }: { status: TaskStatus }) {
  const norm = normalizeStatus(status);
  const c = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {STATUS_LABEL[norm] ?? norm}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE["normal"];
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
  const c = PROJECT_TYPE_NEUTRAL;
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
  canRemove,
  onRemove,
}: {
  tag: string;
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
  const colors = AVATAR_COLORS;
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
  const trackColor = "#EDF0F7";
  const fillColor = pct === 100 ? "#177E48" : "#007BFF";
  const textColor = "#0B1533";
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

// DESIGN.md Avatars spec — fixed 6-color rotation, matches the stacks already
// shipped on /v2/projects and /v2/portfolio-tracker.
const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];

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
