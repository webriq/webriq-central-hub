"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Combined Start/Due date+time field for the New Task modal (task 274, requirement 7) — a single
// trigger button opening one popover with a calendar and a time-of-day tile grid side-by-side,
// synthesizing two existing, already-shipped patterns rather than a from-scratch design:
//   - Structure (one trigger, one popover, calendar + time panel side-by-side) is
//     `portfolio-tracker/new/_date-time-picker.tsx` (New Project wizard's "Scheduled Start").
//   - Visual system (navy-pill calendar with a "Today" link; Hour/Minute/Period tile grid) is
//     `dashboard/timelogs/_time-period-panels.tsx`'s `DayPanel` + `_time-field-picker.tsx`'s
//     `HourMinuteAmPmGrid` — this is literally what the request's two reference screenshots show.
// Unlike `_date-time-picker.tsx`'s plain `absolute` popover (safe there — it renders on a
// scrolling page), this field lives inside a modal with `overflow-hidden`/`overflow-y-auto`
// ancestors, so it needs the portal + fixed-position approach `_date-field-picker.tsx` already
// established for exactly this reason. Neither reference file is imported — patterns are copied
// into this new, page-scoped component per this codebase's per-feature-area convention.
//
// `value`/`onChange` use local "YYYY-MM-DDTHH:mm" (not UTC, not a Date object) — same shape
// `_date-time-picker.tsx` uses, chosen so the caller can split it into a date half (feeds the
// existing `start_date`/`due_date` `date` columns) and a time half (feeds the new `start_time`/
// `due_time` columns) without a timezone round trip.
//
// Follow-up fix (same task, post-review): the calendar-side wrapper below needs an explicit
// `w-[284px]` (matches its natural content: 7 day cells × 36px + `p-4` padding). Leaving it
// `auto`-width produced a large blank gap between the calendar and the time panel's divider —
// `month_caption`'s `flex-1` and `month_grid`'s `basis-full` (both from `calendarClassNames`
// below) resolve their percentages against this div's own width, and once the popover's outer
// container lost its previous fixed total width, that chain became width-indeterminate; browsers
// then over-estimate the div's shrink-to-fit "preferred width" during the fixed-position layout
// pass, well past what the calendar visually renders at. Giving the wrapper a concrete width
// removes the ambiguity. `shrink-0` on both halves (this wrapper and the time panel) keeps either
// side from being flex-compressed if the popover's own horizontal-clamp positioning ever narrows
// the available space.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const calendarClassNames = {
  months: "flex gap-4",
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

function dayButtonClass(modifiers: DayButtonProps["modifiers"]): string {
  if (modifiers.outside && !modifiers.selected) {
    return "w-8 h-8 rounded-full text-[12px] font-medium cursor-pointer transition-colors flex items-center justify-center text-[#C7CEDD] hover:bg-[#F0F7FF]";
  }
  return cn(
    "w-8 h-8 rounded-full text-[12px] font-medium cursor-pointer transition-colors flex items-center justify-center",
    modifiers.selected
      ? "bg-[#071133] text-white font-semibold"
      : modifiers.today
        ? "text-[#007BFF] font-bold hover:bg-[#F0F7FF]"
        : "text-[#3A4565] hover:bg-[#F0F7FF]"
  );
}

function CalendarDayButton({ modifiers, className: _className, ...rest }: DayButtonProps) {
  return <button type="button" className={dayButtonClass(modifiers)} {...rest} />;
}

const HOUR_TILES = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_QUICK_PICKS = [0, 15, 30, 45];

function Tile({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors",
        selected ? "bg-[#071133] text-white font-semibold" : "text-[#3A4565] hover:bg-[#F0F7FF]"
      )}
    >
      {label}
    </button>
  );
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

type Parsed = { date: Date; hour12: number; minute: number; ampm: "AM" | "PM" };

function parseValue(value: string): Parsed {
  const now = new Date();
  if (!value) {
    const h = now.getHours();
    return { date: now, hour12: h % 12 === 0 ? 12 : h % 12, minute: now.getMinutes(), ampm: h >= 12 ? "PM" : "AM" };
  }
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = (timePart ?? "00:00").split(":").map(Number);
  return {
    date: new Date(y, m - 1, d),
    hour12: h % 12 === 0 ? 12 : h % 12,
    minute: min,
    ampm: h >= 12 ? "PM" : "AM",
  };
}

function formatTrigger(value: string): string {
  const { date, hour12, minute, ampm } = parseValue(value);
  return `${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getDate()}, ${date.getFullYear()}, ${hour12}:${pad2(minute)} ${ampm}`;
}

function combine(date: Date, hour12: number, minute: number, ampm: "AM" | "PM"): string {
  const hour24 = (hour12 % 12) + (ampm === "PM" ? 12 : 0);
  return `${toLocalISODate(date)}T${pad2(hour24)}:${pad2(minute)}`;
}

export function DateTimeFieldPicker({
  value, onChange, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => parseValue(value).date);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef);

  const parsed = parseValue(value);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function toggleOpen() {
    if (disabled) return;
    setMonth(parsed.date);
    setOpen((o) => !o);
  }

  function pickDay(d: Date) {
    onChange(combine(d, parsed.hour12, parsed.minute, parsed.ampm));
  }

  function goToday() {
    const now = new Date();
    setMonth(now);
    onChange(combine(now, parsed.hour12, parsed.minute, parsed.ampm));
  }

  function pickHour(hour12: number) {
    onChange(combine(parsed.date, hour12, parsed.minute, parsed.ampm));
  }

  function pickMinute(minute: number) {
    onChange(combine(parsed.date, parsed.hour12, minute, parsed.ampm));
  }

  function pickAmpm(ampm: "AM" | "PM") {
    onChange(combine(parsed.date, parsed.hour12, parsed.minute, ampm));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors cursor-pointer text-left",
          disabled
            ? "opacity-50 cursor-not-allowed border-[#E2E7F2] bg-[#F4F6FB] text-[#5F6A88]"
            : open
              ? "border-[#007BFF] bg-white text-[#3A4565] ring-[3px] ring-[#007BFF]/[0.14]"
              : "border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] hover:border-[#A8C6F5]"
        )}
      >
        <CalendarClock size={14} className="shrink-0 text-[#5F6A88]" />
        <span className="truncate">{formatTrigger(value)}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left }}
          className="z-[60] flex overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <div className="p-4 w-[284px] shrink-0">
            <DayPicker
              mode="single"
              required
              selected={parsed.date}
              onSelect={(d) => d && pickDay(d)}
              month={month}
              onMonthChange={setMonth}
              showOutsideDays
              navLayout="around"
              classNames={calendarClassNames}
              components={{ DayButton: CalendarDayButton }}
            />
            <div className="flex items-center justify-between pt-3 mt-1 border-t border-[#EDF0F7]">
              <button
                type="button"
                onClick={goToday}
                className="text-[12px] font-semibold text-[#FB914E] hover:text-[#E2762F] cursor-pointer transition-colors"
              >
                Today
              </button>
            </div>
          </div>

          <div className="flex w-[190px] shrink-0 flex-col gap-3 border-l border-[#EDF0F7] p-3.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#5F6A88] mb-1.5">Hour</p>
              <div className="grid grid-cols-4 gap-1.5">
                {HOUR_TILES.map((h) => (
                  <Tile key={h} label={h.toString()} selected={parsed.hour12 === h} onClick={() => pickHour(h)} />
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#5F6A88] mb-1.5">Minute</p>
              <div className="grid grid-cols-4 gap-1.5">
                {MINUTE_QUICK_PICKS.map((m) => (
                  <Tile key={m} label={pad2(m)} selected={parsed.minute === m} onClick={() => pickMinute(m)} />
                ))}
              </div>
              <input
                type="number"
                min={0}
                max={59}
                value={parsed.minute}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isNaN(raw)) return;
                  pickMinute(Math.min(59, Math.max(0, raw)));
                }}
                aria-label="Exact minute"
                className="mt-1.5 w-full px-2 py-1 rounded-[8px] border border-[#E2E7F2] text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF]"
              />
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#5F6A88] mb-1.5">Period</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["AM", "PM"] as const).map((p) => (
                  <Tile key={p} label={p} selected={parsed.ampm === p} onClick={() => pickAmpm(p)} />
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
