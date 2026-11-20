"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Calendar, CalendarX2, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DayPanel, WeekPanel, MonthPanel, RangePanel } from "@/app/(hub)/dashboard/timelogs/_time-period-panels";
import { periodLabel, stepPeriod } from "@/app/(hub)/dashboard/timelogs/_time-logs-shared";
import { isDuePeriod, serializeDue, type DueFilter, type DuePeriod } from "@/lib/list-filters/params";

// Task 491 — Due date toolbar filter for the Quick Links Tasks/Tickets pages. The calendar half
// is Time Logs' own period picker (`_time-period-picker.tsx`): same Day/Week/Month/Range tabs with
// the orange underline, the same `DayPanel`…`RangePanel`, the same draft → Cancel/OK flow, and
// the same `‹ label ›` stepper once applied. On top of that a filter needs what a time-log period
// never does: an "Any" state, one-click presets (Overdue / Today / This week / No due date) and a
// Clear. Future dates stay selectable — that cap only applies to logging time.

const TABS: { mode: DuePeriod["mode"]; label: string }[] = [
  { mode: "day", label: "Day" },
  { mode: "week", label: "Week" },
  { mode: "month", label: "Month" },
  { mode: "range", label: "Range" },
];

type Preset = { key: string; label: string; value: () => DueFilter };
const PRESETS: Preset[] = [
  { key: "overdue", label: "Overdue", value: () => ({ mode: "overdue" }) },
  { key: "today", label: "Today", value: () => ({ mode: "day", date: new Date() }) },
  { key: "week", label: "This week", value: () => ({ mode: "week", date: new Date() }) },
  { key: "none", label: "No due date", value: () => ({ mode: "none" }) },
];

// Same anchor-carrying tab switch as Time Logs' `draftForMode`.
function draftForMode(mode: DuePeriod["mode"], current: DuePeriod): DuePeriod {
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

function filterLabel(f: DueFilter): string {
  if (f.mode === "overdue") return "Overdue";
  if (f.mode === "none") return "No due date";
  return periodLabel(f);
}

const iconButton =
  "p-1.5 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF]/40";

export function DueDateFilter({ value, onChange }: { value: DueFilter | null; onChange: (next: DueFilter | null) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DuePeriod>({ mode: "day", date: new Date() });

  function openPicker() {
    setDraft(value && isDuePeriod(value) ? value : { mode: "day", date: new Date() });
    setOpen(true);
  }

  function apply(next: DueFilter | null) {
    onChange(next);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const activeKey = value ? serializeDue(value) : null;

  const actions = (
    <>
      {value && (
        <button
          type="button"
          onClick={() => apply(null)}
          className="px-3 py-1.5 rounded-full text-[12px] font-medium text-[#5F6A88] hover:text-[#C0392B] cursor-pointer transition-colors"
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-3 py-1.5 rounded-full text-[12px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => apply(draft)}
        className="px-4 py-1.5 rounded-full bg-[#FB914E] text-[#471F02] text-[12px] font-semibold hover:bg-[#E2762F] hover:text-white cursor-pointer transition-colors"
      >
        OK
      </button>
    </>
  );

  const clearButton = (
    <button type="button" onClick={() => onChange(null)} aria-label="Clear due date filter" className={iconButton}>
      <X size={13} />
    </button>
  );

  return (
    <div className="relative inline-block shrink-0">
      {value === null ? (
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPicker())}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-3 py-[6.5px] rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533] cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-[#007BFF]/[0.14] focus-visible:border-[#007BFF]"
        >
          <Calendar size={12} />
          Due date: <span className="font-mono font-normal">Any</span>
          <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
        </button>
      ) : (
        // Applied — the Time Logs stepper shell, tinted as an active filter. Presets that aren't a
        // calendar period (Overdue / No due date) have nothing to step, so no arrows.
        <div className="inline-flex items-center gap-0.5 rounded-full border border-[#007BFF] bg-[#F0F7FF] px-1 py-0.5">
          {isDuePeriod(value) && (
            <button type="button" onClick={() => onChange(stepPeriod(value, -1))} aria-label="Previous period" className={iconButton}>
              <ChevronLeft size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : openPicker())}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`Due date: ${filterLabel(value)}. Change due date filter`}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold text-[#0063D6] hover:bg-white cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF]/40"
          >
            {value.mode === "overdue" ? <AlertCircle size={12} /> : value.mode === "none" ? <CalendarX2 size={12} /> : <Calendar size={12} />}
            <span className="font-normal text-[#5F6A88]">Due</span>
            {filterLabel(value)}
          </button>
          {isDuePeriod(value) && (
            <button type="button" onClick={() => onChange(stepPeriod(value, 1))} aria-label="Next period" className={iconButton}>
              <ChevronRight size={13} />
            </button>
          )}
          {clearButton}
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Filter by due date"
            className="absolute z-50 top-[calc(100%+8px)] left-0 rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-4"
          >
            {/* Presets — apply and close in one click */}
            <div className="flex flex-wrap items-center gap-1.5 pb-3 mb-1 border-b border-[#EDF0F7]">
              {PRESETS.map((p) => {
                const v = p.value();
                const isActive = activeKey === serializeDue(v);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => apply(v)}
                    aria-pressed={isActive}
                    className={cn(
                      "px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer transition-colors",
                      isActive
                        ? "border-[#071133] bg-[#071133] text-white"
                        : "border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533]"
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

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
