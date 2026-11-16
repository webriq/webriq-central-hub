"use client";

import { cn, formatDate } from "@/lib/utils";
import { cardCls, textPrimary } from "./_shared-ui";

// Day N's real calendar date, derived from the programme's start date — Day 1 is startedAt's
// own calendar date (matches getCurrentProgrammeDay's own local-midnight diffing in
// customer-phases.ts, so the two stay in agreement).
function dateForDay(startedAt: string | Date, day: number): Date {
  const start = new Date(startedAt);
  const midnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  midnight.setDate(midnight.getDate() + (day - 1));
  return midnight;
}

// Design System v2.0's "signature element" (mockups 01 + 06 share this exact markup) — a
// horizontal progress bar for the current phase's day range, with optional deliverable-boundary
// ticks and an "overdue" count in the label. One component, two call sites: the workspace header
// (with ticks + overdue count) and the Checklist tab (without — mockup 06 omits both).
export function ProgrammeTrack({
  currentDay, dayStart, dayEnd, overdueCount, startedAt, onReviewChecklist, tickDays, label = "Onboard phase progress",
}: {
  currentDay: number;
  dayStart: number;
  dayEnd: number;
  overdueCount?: number;
  // Task 219 — replaces `milestoneLabel` ("Migrate & Rebrand starts"): the footer now shows the
  // real calendar date for dayStart/dayEnd instead of a hardcoded next-phase label.
  startedAt: string | Date | null;
  // Task 219 — "REVIEW CHECKLIST" link shown whenever overdueCount > 0, replacing the old plain
  // "N SECTIONS OVERDUE" text; switches to the Checklist tab.
  onReviewChecklist: () => void;
  tickDays?: number[];
  label?: string;
}) {
  const span = Math.max(1, dayEnd - dayStart);
  const pct = Math.min(100, Math.max(0, ((currentDay - dayStart) / span) * 100));
  // Whole-phase overdue (currentDay has passed dayEnd entirely) — a distinct state from
  // `overdueCount`, which only counts individual overdue sections while the phase itself is
  // still within range. Drives a red/late treatment instead of the in-progress orange.
  const isOverdue = currentDay > dayEnd;
  const daysOverdue = currentDay - dayEnd;

  return (
    <div className={cn(cardCls, isOverdue && "border-[#C0392B]", "px-5 py-4")}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2.5">
        <span className={cn("text-[11px] font-bold uppercase tracking-wide", textPrimary)}>{label}</span>
        <span className={cn("font-mono text-[11px]", isOverdue ? "text-[#C0392B] font-semibold" : "text-[#5F6A88]")}>
          {isOverdue ? (
            <>{daysOverdue} DAY{daysOverdue === 1 ? "" : "S"} OVERDUE</>
          ) : (
            <>DAY {currentDay} OF {dayEnd}</>
          )}
          {typeof overdueCount === "number" && overdueCount > 0 && (
            <>
              &nbsp;·&nbsp;
              <button
                type="button"
                onClick={onReviewChecklist}
                className="underline underline-offset-2 font-semibold cursor-pointer border-none bg-transparent p-0 font-mono text-[11px] text-inherit hover:text-[#0063D6]"
              >
                REVIEW CHECKLIST
              </button>
            </>
          )}
        </span>
      </div>
      <div className="relative h-5 rounded-full bg-[#EDF0F7]">
        {tickDays && tickDays.length > 0 && (
          <div className="absolute inset-0 rounded-full pointer-events-none overflow-hidden">
            {tickDays.map((day) => (
              <span
                key={day}
                className="absolute top-0 bottom-0 w-px bg-[#E2E7F2]"
                style={{ left: `${((day - dayStart) / span) * 100}%` }}
              />
            ))}
          </div>
        )}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: isOverdue ? "linear-gradient(90deg,#FDE8E6,#C0392B)" : "linear-gradient(90deg,#FFD9B8,#FB914E)" }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 font-mono text-[9px] font-semibold bg-[#071133] text-white px-1.5 py-0.5 rounded-full shadow-[0_1px_3px_rgba(7,17,51,.35)] whitespace-nowrap"
          style={{ left: `clamp(28px, ${pct}%, calc(100% - 28px))` }}
        >
          DAY {currentDay}
        </div>
      </div>
      <div className="flex justify-between mt-1.5 font-mono text-[9px] uppercase text-[#5F6A88]">
        <span>Day {dayStart}{startedAt && ` (${formatDate(dateForDay(startedAt, dayStart)).toUpperCase()})`}</span>
        <span>Day {dayEnd}{startedAt && ` (${formatDate(dateForDay(startedAt, dayEnd)).toUpperCase()})`}</span>
      </div>
    </div>
  );
}
