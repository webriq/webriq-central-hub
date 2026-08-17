"use client";

import { ArrowUpDown } from "lucide-react";

// ─── Sort select (Portfolio Tracker feature area) — matches /projects' SortSelect pill
// styling exactly (ported for task 224's follow-up amendment). Shared by _onboarding-list.tsx
// and status-report/_status-report-client.tsx, whose sort criteria differ (per-page `options`),
// so this stays generic over plain string values rather than duplicating the trigger markup.

export function SortSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="relative shrink-0">
      <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-7 pr-7 rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
