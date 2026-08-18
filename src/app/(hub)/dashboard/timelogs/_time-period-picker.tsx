"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DayPanel, WeekPanel, MonthPanel, RangePanel } from "./_time-period-panels";
import { periodLabel, stepPeriod, type PeriodValue } from "./_time-logs-shared";

// Picker shell (task 226) — Day/Week/Month/Range tabs (orange active-tab underline, per
// DESIGN.md's "PRIMARY CTA only" orange reserved for the one action per screen; here it marks
// the active tab rather than a button, matching the reference screenshots' own accent use) plus
// a `< label >` trigger whose arrows step the *applied* period directly, independent of opening
// the modal — matches the reference UI, where the date navigator and the picker are related but
// separate controls.

const TABS: { mode: PeriodValue["mode"]; label: string }[] = [
  { mode: "day", label: "Day" },
  { mode: "week", label: "Week" },
  { mode: "month", label: "Month" },
  { mode: "range", label: "Range" },
];

function draftForMode(mode: PeriodValue["mode"], current: PeriodValue): PeriodValue {
  const anchor =
    current.mode === "day" || current.mode === "week" ? current.date
    : current.mode === "range" ? current.from
    : new Date(current.year, current.month, 1);
  switch (mode) {
    case "day": return { mode: "day", date: anchor };
    case "week": return { mode: "week", date: anchor };
    case "month": return { mode: "month", year: anchor.getFullYear(), month: anchor.getMonth() };
    case "range": return { mode: "range", from: anchor, to: anchor };
  }
}

export function TimePeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (p: PeriodValue) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PeriodValue>(value);

  function openPicker() {
    setDraft(value);
    setOpen(true);
  }

  function commit() {
    onChange(draft);
    setOpen(false);
  }

  const actions = (
    <>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-3 py-1.5 rounded-full text-[12px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={commit}
        className="px-4 py-1.5 rounded-full bg-[#FB914E] text-[#471F02] text-[12px] font-semibold hover:bg-[#E2762F] hover:text-white cursor-pointer transition-colors"
      >
        OK
      </button>
    </>
  );

  return (
    <div className="relative inline-block">
      <div className="inline-flex items-center gap-1 rounded-full border border-[#E2E7F2] bg-white px-1 py-1">
        <button
          type="button"
          onClick={() => onChange(stepPeriod(value, -1))}
          aria-label="Previous period"
          className="p-1.5 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={openPicker}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[12px] font-semibold text-[#0B1533] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
        >
          <Calendar size={13} className="text-[#5F6A88]" />
          {periodLabel(value)}
        </button>
        <button
          type="button"
          onClick={() => onChange(stepPeriod(value, 1))}
          aria-label="Next period"
          className="p-1.5 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-[calc(100%+8px)] left-0 rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-4">
            <div className="flex items-center justify-center gap-1 mb-3 border-b border-[#EDF0F7]">
              {TABS.map((t) => (
                <button
                  key={t.mode}
                  type="button"
                  onClick={() => setDraft(draftForMode(t.mode, draft))}
                  className={cn(
                    "px-3 py-2 text-[12px] font-semibold cursor-pointer transition-colors border-b-2 -mb-px",
                    draft.mode === t.mode ? "border-[#FB914E] text-[#0B1533]" : "border-transparent text-[#5F6A88] hover:text-[#0B1533]"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {draft.mode === "day" && (
              <DayPanel draft={draft.date} onChange={(date) => setDraft({ mode: "day", date })} actions={actions} />
            )}
            {draft.mode === "week" && (
              <WeekPanel draft={draft.date} onChange={(date) => setDraft({ mode: "week", date })} actions={actions} />
            )}
            {draft.mode === "month" && (
              <MonthPanel
                draft={{ year: draft.year, month: draft.month }}
                onChange={(next) => setDraft({ mode: "month", ...next })}
                actions={actions}
              />
            )}
            {draft.mode === "range" && (
              <RangePanel
                draft={{ from: draft.from, to: draft.to }}
                onChange={(next) => setDraft({ mode: "range", ...next })}
                actions={actions}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
