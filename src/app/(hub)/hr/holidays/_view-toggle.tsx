"use client";

import { CalendarDays, List } from "lucide-react";

export type HolidayView = "list" | "calendar";

const OPTIONS: { value: HolidayView; label: string; icon: typeof List }[] = [
  { value: "list", label: "List", icon: List },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
];

/** Segmented control — navy marks the selected view (selection is navy, actions are blue). */
export function ViewToggle({ value, onChange }: { value: HolidayView; onChange: (v: HolidayView) => void }) {
  return (
    <div role="group" aria-label="Holiday view" className="inline-flex rounded-full border border-[#E2E7F2] bg-white p-0.5">
      {OPTIONS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF] ${
            value === v ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]"
          }`}
        >
          <Icon size={13} aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}
