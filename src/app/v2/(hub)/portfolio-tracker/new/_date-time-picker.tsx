"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Date & time picker ────────────────────────────────────────────────────────
// Custom-rendered (react-day-picker, headless) instead of the native <input
// type="datetime-local"> control — the native picker's appearance varies wildly across
// browsers/OS (Chrome's inline spinner vs. Safari's wheel UI vs. Firefox's), so this renders
// identically everywhere and matches the form's own styling instead of the OS chrome.
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i);

export function DateTimePicker({
  id,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  // Task 251: scroll-to-field/error target for the wizard's "Scheduled start" validation —
  // applied to the trigger button itself, same as every other field's own input id.
  id?: string;
  value: string;
  onChange: (v: string) => void;
  min: Date;
  max: Date;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedDate = value ? new Date(value) : undefined;

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // Flip above the field when there isn't enough room below, so opening the picker never
  // forces extra scrolling to see it — mirrors the trigger's own rect, no portal needed since
  // this only ever renders inside a page that scrolls as a whole (no clipping ancestor).
  useLayoutEffect(() => {
    if (!open) return;
    function computePlacement() {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const gap = 6;
      const triggerRect = trigger.getBoundingClientRect();
      const panelHeight = panel.getBoundingClientRect().height;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      setPlacement(spaceBelow < panelHeight + gap && spaceAbove > spaceBelow ? "top" : "bottom");
    }
    computePlacement();
    window.addEventListener("resize", computePlacement);
    return () => window.removeEventListener("resize", computePlacement);
  }, [open]);

  function commit(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }

  function handleDaySelect(d: Date | undefined) {
    if (!d) return;
    const next = new Date(d);
    next.setHours(selectedDate ? selectedDate.getHours() : 9, selectedDate ? selectedDate.getMinutes() : 0, 0, 0);
    commit(next);
  }

  function handleTimeChange(patch: { hour12?: number; minute?: number; pm?: boolean }) {
    const base = selectedDate ? new Date(selectedDate) : new Date();
    const currentHour12 = base.getHours() % 12 || 12;
    const currentPm = base.getHours() >= 12;
    const hour12 = patch.hour12 ?? currentHour12;
    const pm = patch.pm ?? currentPm;
    const minute = patch.minute ?? base.getMinutes();
    base.setHours((hour12 % 12) + (pm ? 12 : 0), minute, 0, 0);
    commit(base);
  }

  const hour12 = selectedDate ? selectedDate.getHours() % 12 || 12 : 9;
  const minute = selectedDate ? selectedDate.getMinutes() : 0;
  const isPm = selectedDate ? selectedDate.getHours() >= 12 : false;

  return (
    <div className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-[9px] border px-3.5 py-[11px] text-left text-sm outline-none transition-colors duration-150",
          disabled
            ? "cursor-not-allowed border-[#E2E7F2] bg-[#EDF0F7] text-[#5F6A88]"
            : open
              ? "border-[#007BFF] bg-white text-[#0B1533] shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
              : "border-[#E2E7F2] bg-[#F4F6FB] text-[#0B1533] hover:border-[#A8C6F5]"
        )}
      >
        <CalendarClock size={15} className="shrink-0 text-[#5F6A88]" />
        {selectedDate ? (
          selectedDate.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
        ) : (
          <span className="text-[#5F6A88]">Pick a date &amp; time</span>
        )}
      </button>

      {open && !disabled && (
        <div
          ref={panelRef}
          className={cn(
            "absolute left-0 z-30 flex overflow-hidden rounded-xl border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]",
            placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          )}
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDaySelect}
            disabled={{ before: min, after: max }}
            showOutsideDays
            classNames={{
              root: "p-3",
              months: "flex",
              month: "flex flex-col gap-2",
              month_caption: "relative flex h-8 items-center justify-center px-8",
              caption_label: "text-[13px] font-bold text-[#0B1533]",
              nav: "absolute inset-x-1 top-0 flex h-8 items-center justify-between",
              button_previous:
                "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#5F6A88] transition-colors hover:bg-[#EDF0F7] disabled:cursor-not-allowed disabled:opacity-30",
              button_next:
                "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#5F6A88] transition-colors hover:bg-[#EDF0F7] disabled:cursor-not-allowed disabled:opacity-30",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday: "w-8 text-center text-[10px] font-semibold uppercase tracking-wide text-[#5F6A88]",
              weeks: "mt-1 flex flex-col gap-0.5",
              week: "flex",
              day: "p-0 text-center",
              day_button:
                "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-[13px] text-[#0B1533] transition-colors hover:bg-[#EDF0F7]",
              selected: "[&>button]:bg-[#007BFF] [&>button]:font-semibold [&>button]:text-white [&>button]:hover:bg-[#007BFF]",
              today: "[&>button]:font-bold [&>button]:text-[#007BFF]",
              outside: "[&>button]:text-[#B7BFD6]",
              disabled: "[&>button]:cursor-not-allowed [&>button]:text-[#E2E7F2] [&>button]:hover:bg-transparent",
            }}
            components={{
              Chevron: ({ orientation }) =>
                orientation === "left" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />,
            }}
          />
          <div className="flex w-[168px] flex-col gap-3 border-l border-[#EDF0F7] p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5F6A88]">Time</div>
            <div className="flex items-center gap-1.5">
              <select
                value={hour12}
                onChange={(e) => handleTimeChange({ hour12: Number(e.target.value) })}
                className="h-9 w-full cursor-pointer rounded-[8px] border border-[#E2E7F2] bg-white text-center text-sm text-[#0B1533] outline-none focus:border-[#007BFF]"
              >
                {HOURS_12.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className="text-sm font-semibold text-[#5F6A88]">:</span>
              <select
                value={minute}
                onChange={(e) => handleTimeChange({ minute: Number(e.target.value) })}
                className="h-9 w-full cursor-pointer rounded-[8px] border border-[#E2E7F2] bg-white text-center text-sm text-[#0B1533] outline-none focus:border-[#007BFF]"
              >
                {MINUTES_60.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-fit items-center gap-1 rounded-lg bg-[#EDF0F7] p-1">
              {([false, true] as const).map((pm) => (
                <button
                  key={String(pm)}
                  type="button"
                  onClick={() => handleTimeChange({ pm })}
                  className={cn(
                    "cursor-pointer rounded-md border-none px-3 py-1.5 text-xs font-medium transition-colors",
                    isPm === pm ? "bg-white text-[#0B1533] shadow-sm" : "bg-transparent text-[#5F6A88] hover:text-[#0B1533]"
                  )}
                >
                  {pm ? "PM" : "AM"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-auto cursor-pointer rounded-full border-none bg-[#007BFF] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0063D6]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
