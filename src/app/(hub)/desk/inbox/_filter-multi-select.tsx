"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Checkbox-group dropdown, ported verbatim from `/projects/_v2-listing/_filter-multi-select.tsx`
// (task 224/309) — kept as its own copy per that file's own documented precedent: each feature
// area keeps its own copy rather than importing across feature boundaries. "All" is a synthetic
// row (not part of `options`) tied to the full-selection state: checking it selects every
// option; unchecking any individual option un-checks "All". Portal-positioned (trigger-rect +
// scroll/resize reposition + outside-click-close), navy fill for checked state (DESIGN.md: navy
// for selection/filter state, blue for anything that navigates or submits).

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
  label, options, selected, onChange, dividerBeforeValue, allToggleValues, exclusiveValue,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  // Draws the same hairline divider used under "All" immediately above the option with this
  // value — used to set "Archived" apart from the real statuses (task 331).
  dividerBeforeValue?: string;
  // The exact set the "All" row toggles and reflects. Defaults to every option; pass a subset
  // to keep an option (e.g. "Archived") out of "All" — checking that option then un-checks
  // "All", and clicking "All" clears it (task 331).
  allToggleValues?: readonly string[];
  // A "mode" option that is mutually exclusive with every other option: checking it clears the
  // rest (selection becomes just `[exclusiveValue]`); checking any other option clears it.
  // Used for "Archived", which is a distinct view, not a status you combine (task 331).
  exclusiveValue?: string;
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

  const allValues = allToggleValues ?? options.map((o) => o.value);
  // "All" is checked only when the selection is exactly `allValues` — no more, no less. Adding
  // an option outside that set (e.g. "Archived") makes the lengths differ and un-checks "All".
  const allChecked = selected.length === allValues.length && allValues.every((v) => selected.includes(v));
  const summary = allChecked
    ? "All"
    : selected.length === 0
      ? "None"
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label
        : `${selected.length} selected`;

  function toggleOption(value: string) {
    if (value === exclusiveValue) {
      // The exclusive "mode" option: turning it on replaces the whole selection with just it;
      // turning it off clears the selection (same as unchecking the last normal option).
      onChange(selected.includes(value) ? [] : [value]);
      return;
    }
    // A normal option — drop the exclusive value if it was set, then toggle this one.
    const base = selected.filter((v) => v !== exclusiveValue);
    onChange(base.includes(value) ? base.filter((v) => v !== value) : [...base, value]);
  }
  function toggleAll() {
    onChange(allChecked ? [] : [...allValues]);
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
            <div key={o.value}>
              {dividerBeforeValue === o.value && <div className="my-1 h-px bg-[#EDF0F7]" />}
              <FilterCheckRow label={o.label} checked={selected.includes(o.value)} onClick={() => toggleOption(o.value)} />
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
