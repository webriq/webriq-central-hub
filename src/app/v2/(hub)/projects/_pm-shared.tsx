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

export const PROJECT_STATUS_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  active:    { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  on_hold:   { text: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  completed: { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  archived:  { text: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0" },
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

export function ProjectStatusBadge({ status }: { status: string }) {
  const c = PROJECT_STATUS_STYLE[status] ?? PROJECT_STATUS_STYLE.active;
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize whitespace-nowrap"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      {status.replace("_", " ")}
    </span>
  );
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
