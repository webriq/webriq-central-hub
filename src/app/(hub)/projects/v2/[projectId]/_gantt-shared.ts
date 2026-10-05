// Shared Gantt constants/helpers for the Timeline tab (StackShift I swimlane + generic lanes +
// DeliverableCard). Extracted from _onboarding-detail.tsx (task 421) so the extracted card does not
// import back from it; _onboarding-detail.tsx re-exports the public names for existing importers.

// ─── Gantt grid constants ─────────────────────────────────────────────────────

export const TOTAL_DAYS = 120;
// Day zoom (default) and Week zoom (task 422) column widths; render code reads the active one from
// GanttZoomContext instead of this constant.
export const DAY_WIDTH = 80;
export const DAY_WIDTH_WEEK = 10;
export type GanttZoom = "day" | "week";
export const dayWidthFor = (zoom: GanttZoom) => (zoom === "week" ? DAY_WIDTH_WEEK : DAY_WIDTH);
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

// ─── Owner avatar chips (small, fixed enumerable set — no computed inline colors) ──

// DESIGN.md's fixed 6-color avatar rotation, matching AVATAR_COLORS already used in
// pm-dashboard.tsx / _onboarding-list.tsx (tasks 166/167) for app-wide consistency.
const PERSON_COLOR: Record<string, string> = {
  Bert: "bg-[#0063D6]", PM: "bg-[#6A48E0]", Dev: "bg-[#0B8A93]", Jun: "bg-[#B85512]",
  Erica: "bg-[#177E48]", April: "bg-[#44508A]", Eri: "bg-[#0063D6]", Strategy: "bg-[#B85512]",
};
const DEFAULT_PERSON_COLOR = "bg-[#5F6A88]";

export function ownerChips(owner: string): { label: string; colorClass: string }[] {
  const names = owner.split(/\s*\+\s*/).filter(Boolean);
  return names.slice(0, 3).map((name) => ({
    label: name.length <= 2 ? name.toUpperCase() : name.slice(0, 2).toUpperCase(),
    colorClass: PERSON_COLOR[name] ?? DEFAULT_PERSON_COLOR,
  }));
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function formatDeliverableDateRange(startDate: Date, dayStart: number, dayEnd: number): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const from = fmt(addDays(startDate, dayStart - 1));
  if (dayStart === dayEnd) return from;
  return `${from} – ${fmt(addDays(startDate, dayEnd - 1))}`;
}

// Drag-resize/move (task 148) — resize-left/resize-right change one edge only; move shifts both.
// Custom onPointerDown/pointermove/pointerup (not @dnd-kit, which this file already avoids —
// see task 148 doc's rationale) with pointer capture so move/up keep firing on the captor even
// if the cursor leaves it, clamped to the deliverable's own phase day range every frame.
export type DragMode = "resize-left" | "resize-right" | "move";
export type DragState = { mode: DragMode; startClientX: number; startDayStart: number; startDayEnd: number; moved: boolean };

export function clampDragToPhase(mode: DragMode, dayStart: number, dayEnd: number, phaseDayStart: number, phaseDayEnd: number): { dayStart: number; dayEnd: number } {
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

// ─── Overlap-stacking — items that overlap in time go on separate tracks ──────────────────────
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
