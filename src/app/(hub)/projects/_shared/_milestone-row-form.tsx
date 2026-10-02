"use client";

import { Check, X, Loader2 } from "lucide-react";
import type { Milestone } from "@/app/(hub)/projects-old/_pm-shared";

// Task 412 — the inline create/edit row shared by MilestonePanel's "Add milestone" row and
// its per-row edit mode. Renders a fragment of one form `<tr>` plus an optional error `<tr>`.

export const MILESTONE_STATUS_OPTS = ["planned", "active", "completed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUS_OPTS)[number];
export const MILESTONE_NAME_MAX = 200;

export type MilestoneDraft = {
  name: string;
  description: string;
  status: MilestoneStatus;
  startDate: string;
  dueDate: string;
};

export const EMPTY_MILESTONE_DRAFT: MilestoneDraft = {
  name: "",
  description: "",
  status: "planned",
  startDate: "",
  dueDate: "",
};

export function draftFromMilestone(m: Milestone): MilestoneDraft {
  return {
    name: m.name,
    description: m.description ?? "",
    status: (m.status as MilestoneStatus) ?? "planned",
    startDate: m.start_date ?? "",
    dueDate: m.due_date ?? "",
  };
}

// Mirrors the API's checks so obvious mistakes never reach the network.
export function validateMilestoneDraft(d: MilestoneDraft): string | null {
  const name = d.name.trim();
  if (!name) return "Name is required.";
  if (name.length > MILESTONE_NAME_MAX) return `Name must be ${MILESTONE_NAME_MAX} characters or fewer.`;
  if (d.startDate && d.dueDate && d.startDate > d.dueDate) return "Start date must be on or before due date.";
  return null;
}

// Cleared dates/description go out as `null` so an edit can actually clear them.
export function draftToPayload(d: MilestoneDraft) {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    status: d.status,
    start_date: d.startDate || null,
    due_date: d.dueDate || null,
  };
}

const INPUT_CLASS =
  "w-full px-2 py-1 rounded-md border border-slate-200 bg-white text-[12px] text-slate-700 placeholder-slate-400 outline-none transition-colors focus:border-slate-400";

export default function MilestoneFormRow({
  draft,
  onChange,
  onSubmit,
  onCancel,
  saving,
  error,
  variant,
}: {
  draft: MilestoneDraft;
  onChange: (next: MilestoneDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  variant: "create" | "edit";
}) {
  const set = <K extends keyof MilestoneDraft>(key: K, value: MilestoneDraft[K]) =>
    onChange({ ...draft, [key]: value });

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === "Escape") onCancel();
  }

  const rowClass = variant === "create" ? "border-t border-dashed border-slate-200 bg-slate-50/40" : "bg-slate-50/40";
  const label = variant === "create" ? "Create milestone" : "Save milestone";

  return (
    <>
      <tr className={error ? rowClass : `${rowClass} border-b border-slate-50 last:border-0`}>
        <td className="px-4 py-2 align-top">
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            maxLength={MILESTONE_NAME_MAX}
            placeholder="Milestone name"
            aria-label="Milestone name"
            className={INPUT_CLASS}
          />
          <input
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Description (optional)"
            aria-label="Milestone description"
            className={`${INPUT_CLASS} mt-1.5 text-[11px]`}
          />
        </td>
        <td className="px-4 py-2 align-top">
          <select
            value={draft.status}
            onChange={(e) => set("status", e.target.value as MilestoneStatus)}
            aria-label="Milestone status"
            className={`${INPUT_CLASS} capitalize`}
          >
            {MILESTONE_STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
        <td className="px-4 py-2 align-top">
          <input
            type="date"
            value={draft.startDate}
            max={draft.dueDate || undefined}
            onChange={(e) => set("startDate", e.target.value)}
            aria-label="Start date"
            className={INPUT_CLASS}
          />
        </td>
        <td className="px-4 py-2 align-top">
          <input
            type="date"
            value={draft.dueDate}
            min={draft.startDate || undefined}
            onChange={(e) => set("dueDate", e.target.value)}
            aria-label="Due date"
            className={INPUT_CLASS}
          />
        </td>
        <td className="px-4 py-2" />
        <td className="px-4 py-2 align-top">
          <div className="flex items-center gap-1 justify-end">
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving || !draft.name.trim()}
              aria-label={label}
              title={label}
              className="p-1 rounded text-emerald-600 transition-colors hover:bg-emerald-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              aria-label="Cancel"
              title="Cancel"
              className="p-1 rounded text-slate-400 transition-colors hover:bg-slate-100 cursor-pointer disabled:opacity-40"
            >
              <X size={13} />
            </button>
          </div>
        </td>
      </tr>
      {error && (
        <tr className={`${rowClass} border-b border-slate-50`}>
          <td colSpan={6} className="px-4 pb-2 pt-0 text-[11px] text-red-600" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
