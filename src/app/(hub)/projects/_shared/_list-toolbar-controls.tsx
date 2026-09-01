"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Tasks/Issues toolbar controls — page-scoped presentational components ────
// Task 346 — extracted verbatim from `_project-detail.tsx` (which had grown past the
// file-length guideline) so the Tasks and Issues toolbars can share the filter/sort
// plumbing without that file carrying ~125 lines of generic dropdown code.
// Originally a page-scoped copy of `_projects-index.tsx`'s filter pattern.

export type FilterOption = { value: string; label: string };

function FilterCheckRow({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[12px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB] cursor-pointer"
    >
      <span className={cn(
        "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked ? "bg-[#071133] border-[#071133]" : "bg-white border-[#E2E7F2]"
      )}>
        {checked && <Check size={11} strokeWidth={3} className="text-white" />}
      </span>
      {label}
    </button>
  );
}

export function FilterMultiSelect({
  label, options, selected, onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 190) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const allChecked = selected.length === options.length;
  const summary = allChecked
    ? "All"
    : selected.length === 0
      ? "None"
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label
        : `${selected.length} selected`;

  function toggleOption(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  function toggleAll() {
    onChange(allChecked ? [] : options.map((o) => o.value));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-[6.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
          !allChecked ? "border-[#007BFF] bg-[#F0F7FF] text-[#0063D6]" : "border-[#E2E7F2] bg-white text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
        )}
      >
        {label}: <span className="font-mono font-normal">{summary}</span>
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-50 overflow-hidden rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-1"
          >
            <FilterCheckRow label="All" checked={allChecked} onClick={toggleAll} />
            <div className="my-1 h-px bg-[#EDF0F7]" />
            {options.map((o) => (
              <FilterCheckRow key={o.value} label={o.label} checked={selected.includes(o.value)} onClick={() => toggleOption(o.value)} />
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export function SortSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative shrink-0">
      <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] pl-7 pr-7 rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
