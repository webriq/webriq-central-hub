"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { btn, circleBtn, fieldClass } from "../_components/ui";
import type { CalendarMode } from "./_calendar-range";

const MODES: { value: CalendarMode; label: string }[] = [
  { value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" },
];

export function CalendarToolbar({ label, mode, onMode, onPrev, onNext, onToday, people, person, onPerson, types, type, onType }: {
  label: string;
  mode: CalendarMode;
  onMode: (m: CalendarMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  people: { id: string; name: string }[];
  person: string;
  onPerson: (v: string) => void;
  types: string[];
  type: string;
  onType: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#EDF0F7] px-[18px] py-3">
      <div className="flex items-center gap-2">
        <button type="button" className={circleBtn} aria-label="Previous" onClick={onPrev}><ChevronLeft size={15} /></button>
        <button type="button" className={circleBtn} aria-label="Next" onClick={onNext}><ChevronRight size={15} /></button>
        <button type="button" className={`${btn.ghost} ${btn.sm}`} onClick={onToday}>Today</button>
      </div>
      <h2 aria-live="polite" className="min-w-40 font-heading text-[15px] font-semibold text-[#0B1533]">{label}</h2>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <select aria-label="Filter by person" className={`${fieldClass} !w-40 !py-1.5 !text-[12px]`} value={person} onChange={(e) => onPerson(e.target.value)}>
          <option value="">Everyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Filter by leave type" className={`${fieldClass} !w-40 !py-1.5 !text-[12px]`} value={type} onChange={(e) => onType(e.target.value)}>
          <option value="">All leave types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div role="group" aria-label="Calendar view" className="inline-flex rounded-full border border-[#E2E7F2] bg-white p-0.5">
          {MODES.map((m) => (
            <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => onMode(m.value)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF] ${mode === m.value ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
