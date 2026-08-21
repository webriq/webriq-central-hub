"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldClass = cn(
  "w-full pl-8 pr-2.5 py-1.5 rounded-[10px] border text-[12px] outline-none transition-colors",
  "border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565]",
  "focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
);

// Native `<input type="time">` field for Start Time/End Time in the Add/Edit Time Log modal (task
// 292) — replaces `TimeFieldPicker`'s custom Tile-grid popover in this modal only (the table's
// inline Time Period quick-edit keeps the Tile-grid, see `_time-period-inline-editor.tsx`). `step`
// is deliberately omitted so the browser never shows a seconds segment — matches this feature's
// existing minute-granularity storage (`combineDateTime`/`isoToHHmm`).
export function NativeTimeInput({
  value, onChange, onBlur, placeholder = "00:00",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Clock size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={fieldClass}
      />
    </div>
  );
}

function formatDurationDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// Duration field (manual elapsed-time entry, task 292) — a plain masked text input, not
// `<input type="time">`. A duration isn't a time-of-day, so a native time-of-day control is the
// wrong control type for it regardless of styling: it was tried first (matching the shadcn
// reference snippet literally), but every attempt to suppress its AM/PM segment left the control
// internally incomplete — `element.validity.badInput` stayed `true` and `.value` stayed `""` even
// once the visible hour/minute digits were filled in, both with the `lang="en-GB"`/`sv-SE` locale
// trick (which additionally didn't even suppress the segment visually in this Chrome build) and
// with hiding it via `-webkit-datetime-edit-ampm-field { display: none }` (which hid it visually
// but left the hidden segment's value permanently unset, so the composite time value never
// resolved) — confirmed via `document.querySelector('input[type=time]').value` while the visible
// digits read "01:30". A masked text input has no such hidden-required-subfield failure mode and
// guarantees a real controlled "hh:mm" string. Digits auto-insert the colon after the second digit
// (typing "0130" renders "01:30"); `parseHHMMToHours` (`_time-logs-shared.ts`) validates/parses
// the result.
export function DurationInput({
  value, onChange, onBlur, placeholder = "00:00",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Clock size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(formatDurationDigits(e.target.value))}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={5}
        className={fieldClass}
      />
    </div>
  );
}
