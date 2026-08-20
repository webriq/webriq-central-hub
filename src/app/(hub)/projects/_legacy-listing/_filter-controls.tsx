"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Filter multi-select + sort select (page-scoped to /projects, extracted from
// _projects-index.tsx — task 263) ────────────────────────────────────────────────
// Deliberately NOT merged with portfolio-tracker's own _filter-multi-select.tsx/_sort-select.tsx
// siblings — that file's header comment documents the split as intentional ("does not cross
// into /projects, which keeps its own copy"). Keep these two copies separate.

// Reads a URL param encoding a checkbox-group selection: absent = "All" (every option
// checked, unfiltered); "" = explicitly zero checked; otherwise a comma-separated list.
export function parseMultiParam(raw: string | null, options: readonly { value: string }[]): string[] {
  if (raw === null) return options.map((o) => o.value);
  if (raw === "") return [];
  return raw.split(",");
}

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
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
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
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
          className="z-50 overflow-hidden rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-1"
        >
          <FilterCheckRow label="All" checked={allChecked} onClick={toggleAll} />
          <div className="my-1 h-px bg-[#EDF0F7]" />
          {options.map((o) => (
            <FilterCheckRow key={o.value} label={o.label} checked={selected.includes(o.value)} onClick={() => toggleOption(o.value)} />
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Sort select (page-scoped) — matches the existing per-page <select> styling ────

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "due_soonest", label: "Due date (soonest)" },
  { value: "updated_desc", label: "Recently updated" },
] as const;

export function SortSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative shrink-0">
      <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-7 pr-7 rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
      >
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
