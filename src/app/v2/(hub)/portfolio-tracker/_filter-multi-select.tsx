"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Filter multi-select (Portfolio Tracker feature area — shared by _onboarding-list.tsx
// and status-report/_status-report-client.tsx) ──────────────────────────────────────────
// Checkbox-group dropdown, ported from /v2/projects' _projects-index.tsx (task 224). "All" is
// itself a checkbox tied to the full-selection state: checking it selects every option;
// unchecking any individual option un-checks "All". Portal-positioned (trigger-rect + scroll/
// resize reposition + outside-click-close), navy fill for checked state (DESIGN.md: navy for
// selection/filter state, blue for anything that navigates or submits).
//
// Shared here (not duplicated) because these two pages are the same feature area (Portfolio
// Tracker + its Status Report sub-page) — this does not cross into /v2/projects, which keeps
// its own copy of the same component untouched.

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
