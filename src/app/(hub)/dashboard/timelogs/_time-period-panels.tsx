"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayButtonProps, type Matcher } from "react-day-picker";
import { cn } from "@/lib/utils";
import {
  startOfWeekMonday, endOfWeekSunday, startOfMonth, endOfMonth,
  type PeriodValue,
} from "./_time-logs-shared";

// The four mode-specific panels for `_time-period-picker.tsx` (task 226) — split out to keep
// the picker shell under the file-length guideline. Day/Week/Range render on `react-day-picker`
// v10 (already an installed, previously-unused dependency); Month is a plain 12-tile grid since
// react-day-picker has no "month picker" mode of its own. Colors follow
// `_final_design/guide/central-hub-design-system.md`: navy (`#071133`) for selected day pills
// ("day pills, active filters" per the token comment), blue for today/hover, orange for the
// modal's own active-tab underline (owned by the shell, not these panels).

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const calendarClassNames = {
  months: "flex gap-4",
  // `flex-wrap` + `month_grid`'s `basis-full` forces the grid onto its own line while the
  // Previous button / caption / Next button (`navLayout="around"`, see the panels below) share
  // the row above it — this is what puts the chevrons inline with "Month Year" instead of
  // pinned to the top of the whole popup (the old `nav: "absolute ... top-0"` bug, task 266).
  month: "flex flex-wrap items-center gap-2",
  month_caption: "flex-1 flex items-center justify-center h-8 text-[12px] font-semibold text-[#0B1533]",
  button_previous: "p-1 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors flex items-center justify-center",
  button_next: "p-1 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors flex items-center justify-center",
  month_grid: "relative basis-full",
  weekdays: "flex",
  weekday: "w-9 h-7 flex items-center justify-center text-[9.5px] font-bold uppercase tracking-wide text-[#5F6A88]",
  week: "flex",
  day: "w-9 h-9 flex items-center justify-center p-0",
  disabled: "text-[#E2E7F2] cursor-not-allowed",
};

function dayButtonClass(modifiers: DayButtonProps["modifiers"], extraSelected: boolean): string {
  const selected = extraSelected || modifiers.selected || modifiers.range_start || modifiers.range_end;
  const inRangeMiddle = modifiers.range_middle;
  // Requirement 1 (task 230) — react-day-picker's own `disabled` modifier previously fell through
  // to the same hover/pointer styling as any other day; a time log can't be logged against a day
  // that hasn't happened yet, so a disabled day needs a visible not-allowed cursor, not just a
  // muted color.
  if (modifiers.disabled) {
    return "w-8 h-8 rounded-full text-[12px] font-medium cursor-not-allowed flex items-center justify-center text-[#C7CEDD]";
  }
  // Task 266 — outside days (previous/next month, `showOutsideDays`) render through this same
  // custom DayButton, which always sets its own explicit text color, so the built-in
  // `classNames.outside` value never reaches the button. Match it here instead, unless the
  // outside day is itself the selection or sits inside a selected range.
  if (modifiers.outside && !selected && !inRangeMiddle) {
    return "w-8 h-8 rounded-full text-[12px] font-medium cursor-pointer transition-colors flex items-center justify-center text-[#C7CEDD] hover:bg-[#F0F7FF]";
  }
  return cn(
    "w-8 h-8 rounded-full text-[12px] font-medium cursor-pointer transition-colors flex items-center justify-center",
    selected
      ? "bg-[#071133] text-white font-semibold"
      : inRangeMiddle
        ? "bg-[#E5F1FF] text-[#0063D6]"
        : modifiers.today
          ? "text-[#007BFF] font-bold hover:bg-[#F0F7FF]"
          : "text-[#3A4565] hover:bg-[#F0F7FF]"
  );
}

// Shared custom DayButton — computes its own class from `modifiers` (the default DayButton just
// spreads incoming props; the built-in `selected`/`today`/etc. classNames apply to the day cell,
// not the button, so the navy "pill" look needs this override rather than the `classNames` prop
// alone). `weekModifier` lets the Week panel light up every day in the anchor week, not just the
// one literally clicked.
function makeDayButton(weekModifier?: (date: Date) => boolean) {
  function CalendarDayButton({ day, modifiers, className: _className, ...rest }: DayButtonProps) {
    const inWeek = weekModifier?.(day.date) ?? false;
    return <button type="button" className={dayButtonClass(modifiers, inWeek)} {...rest} />;
  }
  return CalendarDayButton;
}

function QuickLinkRow({ label, onClick, actions }: { label: string; onClick: () => void; actions: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-3 mt-1 border-t border-[#EDF0F7]">
      <button type="button" onClick={onClick} className="text-[12px] font-semibold text-[#FB914E] hover:text-[#E2762F] cursor-pointer transition-colors">
        {label}
      </button>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

// ─── Day ────────────────────────────────────────────────────────────────────

export function DayPanel({
  draft, onChange, actions, disabled,
}: {
  draft: Date;
  onChange: (d: Date) => void;
  actions: React.ReactNode;
  disabled?: Matcher | Matcher[];
}) {
  // Local, uncontrolled-feeling month state: the visible month navigates independently of the
  // selected day (react-day-picker's `month`/`onMonthChange` controlled pair) so the built-in
  // prev/next chevrons actually work, while "Today" below jumps both the selection and the view.
  const [month, setMonth] = useState(draft);

  function goToday() {
    const now = new Date();
    onChange(now);
    setMonth(now);
  }

  return (
    <div>
      <DayPicker
        mode="single"
        required
        selected={draft}
        onSelect={(d) => d && onChange(d)}
        month={month}
        onMonthChange={setMonth}
        showOutsideDays
        navLayout="around"
        disabled={disabled}
        classNames={calendarClassNames}
        components={{ DayButton: makeDayButton() }}
      />
      <QuickLinkRow label="Today" onClick={goToday} actions={actions} />
    </div>
  );
}

// ─── Week (Mon–Sun) ───────────────────────────────────────────────────────────

export function WeekPanel({ draft, onChange, actions }: { draft: Date; onChange: (d: Date) => void; actions: React.ReactNode }) {
  const weekStart = startOfWeekMonday(draft);
  const weekEnd = endOfWeekSunday(draft);
  const inWeek = (date: Date) => date >= weekStart && date <= weekEnd;
  const [month, setMonth] = useState(draft);

  function goCurrentWeek() {
    const now = new Date();
    onChange(now);
    setMonth(now);
  }

  return (
    <div>
      <DayPicker
        mode="single"
        required
        selected={draft}
        onSelect={(d) => d && onChange(d)}
        month={month}
        onMonthChange={setMonth}
        showOutsideDays
        navLayout="around"
        classNames={calendarClassNames}
        components={{ DayButton: makeDayButton(inWeek) }}
      />
      <QuickLinkRow label="Current Week" onClick={goCurrentWeek} actions={actions} />
    </div>
  );
}

// ─── Month ──────────────────────────────────────────────────────────────────

export function MonthPanel({
  draft, onChange, actions,
}: {
  draft: { year: number; month: number };
  onChange: (next: { year: number; month: number }) => void;
  actions: React.ReactNode;
}) {
  return (
    <div className="w-[280px]">
      <div className="flex items-center justify-between h-8 mb-2">
        <button
          type="button"
          onClick={() => onChange({ year: draft.year - 1, month: draft.month })}
          className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors flex items-center justify-center"
          aria-label="Previous year"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-[12px] font-semibold text-[#0B1533]">{draft.year}</span>
        <button
          type="button"
          onClick={() => onChange({ year: draft.year + 1, month: draft.month })}
          className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors flex items-center justify-center"
          aria-label="Next year"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {MONTH_SHORT.map((label, idx) => {
          const selected = idx === draft.month;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange({ year: draft.year, month: idx })}
              title={MONTH_NAMES[idx]}
              className={cn(
                "h-10 rounded-[10px] text-[12px] font-medium cursor-pointer transition-colors",
                selected ? "bg-[#071133] text-white font-semibold" : "text-[#3A4565] hover:bg-[#F0F7FF]"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <QuickLinkRow
        label="Current Month"
        onClick={() => onChange({ year: new Date().getFullYear(), month: new Date().getMonth() })}
        actions={actions}
      />
    </div>
  );
}

// ─── Range ──────────────────────────────────────────────────────────────────

export function RangePanel({
  draft, onChange, actions,
}: {
  draft: { from: Date; to: Date };
  onChange: (next: { from: Date; to: Date }) => void;
  actions: React.ReactNode;
}) {
  const [month, setMonth] = useState(draft.from);

  function goCurrentMonth() {
    const now = new Date();
    const from = startOfMonth(now.getFullYear(), now.getMonth());
    const to = endOfMonth(now.getFullYear(), now.getMonth());
    onChange({ from, to });
    setMonth(from);
  }

  return (
    <div>
      <DayPicker
        mode="range"
        required
        selected={{ from: draft.from, to: draft.to }}
        onSelect={(range) => {
          if (range?.from && range.to) onChange({ from: range.from, to: range.to });
        }}
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={2}
        showOutsideDays
        navLayout="around"
        classNames={calendarClassNames}
        components={{ DayButton: makeDayButton() }}
      />
      <QuickLinkRow label="Current Month" onClick={goCurrentMonth} actions={actions} />
    </div>
  );
}

export type { PeriodValue };
