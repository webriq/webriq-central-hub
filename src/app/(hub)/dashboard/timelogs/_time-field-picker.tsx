"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Form-field time-of-day picker for the Add/Edit Time Log modal (task 229) — replaces a plain
// `<input type="time">`. The page's own date filter (`_time-period-picker.tsx`) has no
// time-of-day concept to reuse, so this is a new component built in the same visual system
// (navy `#071133` selected tiles, blue `#007BFF` hover, `rounded-[14px]`/shadow popover chrome —
// matching `_time-period-panels.tsx`'s `calendarClassNames`/`dayButtonClass`). Portal-positioned
// off the trigger's bounding rect, same mechanics as `_searchable-select.tsx` and
// `_date-field-picker.tsx`.
//
// `value`/`onChange` stay "HH:mm" 24-hour strings — the exact format `toTimeInputValue`/
// `combineDateTime` in `_time-log-entry-modal.tsx` already expect, so the save path is unchanged.
// Every tile/input interaction commits immediately (live `onChange`, not a deferred "Done"
// button) so the trigger label updates as you go; only closing the popover (outside-click/
// Escape) ends the interaction, since hour/minute/AM-PM are picked independently and closing on
// the first tile click would force re-opening for the rest.

const inputTriggerClass =
  "w-full px-2.5 py-1.5 rounded-[10px] border text-[12px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] flex items-center gap-1.5 cursor-pointer hover:border-[#A8C6F5]";

const HOUR_TILES = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_QUICK_PICKS = [0, 15, 30, 45];

type Draft = { hour12: number; minute: number; ampm: "AM" | "PM" };

export function parseValue(value: string): Draft {
  if (!value) return { hour12: 9, minute: 0, ampm: "AM" };
  const [h, m] = value.split(":").map(Number);
  const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: m, ampm };
}

export function draftTo24(draft: Draft): string {
  let hour24 = draft.hour12 % 12;
  if (draft.ampm === "PM") hour24 += 12;
  return `${hour24.toString().padStart(2, "0")}:${draft.minute.toString().padStart(2, "0")}`;
}

function formatLabel(draft: Draft): string {
  return `${draft.hour12.toString().padStart(2, "0")}:${draft.minute.toString().padStart(2, "0")} ${draft.ampm}`;
}

// Requirement 11 (task 230) — a manual entry can't be logged for a time that hasn't happened yet.
// `maxTime` ("HH:mm" 24h, or undefined for no cap) is compared against each candidate draft by
// converting both to a 24h-minutes-of-day number, so a tile/quick-pick is disabled the instant the
// resulting time would be later than `maxTime`, independent of which field (hour, minute, AM/PM)
// changes first.
function to24Minutes(hour12: number, minute: number, ampm: "AM" | "PM"): number {
  let hour24 = hour12 % 12;
  if (ampm === "PM") hour24 += 12;
  return hour24 * 60 + minute;
}

function maxTimeMinutes(maxTime: string | undefined): number | null {
  if (!maxTime) return null;
  const [h, m] = maxTime.split(":").map(Number);
  return h * 60 + m;
}

export function Tile({
  label, selected, disabled, onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        "h-8 rounded-[8px] text-[12px] font-medium transition-colors",
        disabled
          ? "cursor-not-allowed text-[#C7CEDD]"
          : cn("cursor-pointer", selected ? "bg-[#071133] text-white font-semibold" : "text-[#3A4565] hover:bg-[#F0F7FF]")
      )}
    >
      {label}
    </button>
  );
}

// Shared Hour/Minute/AM-PM tile grid — extracted so `_time-period-inline-editor.tsx` (task 230,
// Requirement 14's inline Time Period cell editor) doesn't duplicate this markup for its own
// Start/End time pair.
export function HourMinuteAmPmGrid({
  draft, onChange, maxTime,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  maxTime?: string;
}) {
  const cap = maxTimeMinutes(maxTime);

  function update(next: Partial<Draft>) {
    onChange({ ...draft, ...next });
  }

  return (
    <>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#5F6A88] mb-1.5">Hour</p>
        <div className="grid grid-cols-4 gap-1.5">
          {HOUR_TILES.map((h) => {
            const disabled = cap !== null && to24Minutes(h, 0, draft.ampm) > cap && to24Minutes(h, 59, draft.ampm) > cap;
            return (
              <Tile
                key={h}
                label={h.toString()}
                selected={draft.hour12 === h}
                disabled={disabled}
                onClick={() => update({ hour12: h })}
              />
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#5F6A88] mb-1.5">Minute</p>
        <div className="grid grid-cols-4 gap-1.5">
          {MINUTE_QUICK_PICKS.map((m) => {
            const disabled = cap !== null && to24Minutes(draft.hour12, m, draft.ampm) > cap;
            return (
              <Tile
                key={m}
                label={m.toString().padStart(2, "0")}
                selected={draft.minute === m}
                disabled={disabled}
                onClick={() => update({ minute: m })}
              />
            );
          })}
        </div>
        <input
          type="number"
          min={0}
          max={59}
          value={draft.minute}
          onChange={(e) => {
            const raw = Number(e.target.value);
            if (Number.isNaN(raw)) return;
            const clamped = Math.min(59, Math.max(0, raw));
            if (cap !== null && to24Minutes(draft.hour12, clamped, draft.ampm) > cap) return;
            update({ minute: clamped });
          }}
          aria-label="Exact minute"
          className="mt-1.5 w-full px-2 py-1 rounded-[8px] border border-[#E2E7F2] text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF]"
        />
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#5F6A88] mb-1.5">Period</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(["AM", "PM"] as const).map((p) => {
            // Hour tile "12" is each period's chronological start (00:00 for AM, 12:00 for PM) —
            // not "1", which would make the AM tile disable one hour too early near a `maxTime`
            // cap right after midnight.
            const disabled = cap !== null && to24Minutes(draft.hour12, draft.minute, p) > cap && to24Minutes(12, 0, p) > cap;
            return (
              <Tile key={p} label={p} selected={draft.ampm === p} disabled={disabled} onClick={() => update({ ampm: p })} />
            );
          })}
        </div>
      </div>
    </>
  );
}

export function TimeFieldPicker({
  value, onChange, maxTime,
}: {
  value: string;
  onChange: (v: string) => void;
  // Requirement 11 (task 230) — "HH:mm" 24h cap; hour/minute/AM-PM tiles beyond it render
  // disabled. Passed by the modal/inline editors only when the selected date is today.
  maxTime?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef);

  const draft = parseValue(value);

  function update(next: Draft) {
    onChange(draftTo24(next));
  }

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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={inputTriggerClass}
      >
        <Clock size={13} className="text-[#5F6A88] shrink-0" />
        <span className="truncate">{value ? formatLabel(draft) : "Select time…"}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left }}
          className="z-50 w-[220px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-3 flex flex-col gap-3"
        >
          <HourMinuteAmPmGrid draft={draft} onChange={update} maxTime={maxTime} />
        </div>,
        document.body
      )}
    </>
  );
}
