"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Searchable dropdown for the New Task modal's Milestone/Tasklist/Assignee fields (task 274).
// Adapted from `dashboard/timelogs/_searchable-select.tsx`'s interaction pattern (search input,
// portal-positioned option list, outside-click/Escape close) but restyled: that component is a
// toolbar filter pill (`rounded-full`, "Label: value"), while this modal's other fields are all
// boxy form inputs (`rounded-[10px]`, `border-[#E2E7F2]`, `bg-[#F4F6FB]`) — the trigger here
// matches that chrome instead, so Milestone/Tasklist/Assignee read as the same control type as
// Title/Status/Priority. Not imported cross-directory from `dashboard/timelogs/` — same
// per-feature-area duplication convention that directory's own comments already establish.

function OptionRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[#F4F6FB]",
        selected && "bg-[#F0F7FF]"
      )}
    >
      <span className={selected ? "font-medium text-[#0B1533]" : "text-[#3A4565]"}>{label}</span>
      {selected && <Check size={12} className="text-[#007BFF]" />}
    </button>
  );
}

export function SearchableSelect({
  value, onChange, options, placeholder, searchPlaceholder, disabled, footerAction,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  // Task 274 — Tasklist's "+ Create new list…" inline-create flow: a pinned row below the
  // option list, distinct from a regular option. Clicking it closes the dropdown and hands
  // control to the caller (which swaps in its own inline name-input UI) rather than picking a
  // value.
  footerAction?: { label: string; onClick: () => void };
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef, 200);

  function close() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedLabel = options.find((o) => o.value === value)?.label;

  function toggleOpen() {
    if (disabled) return;
    setOpen((o) => !o);
    setQuery("");
  }

  function pick(v: string) {
    onChange(v);
    close();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors cursor-pointer text-left",
          disabled
            ? "opacity-50 cursor-not-allowed border-[#E2E7F2] bg-[#F4F6FB] text-[#5F6A88]"
            : open
              ? "border-[#007BFF] bg-white text-[#3A4565] ring-[3px] ring-[#007BFF]/[0.14]"
              : "border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] hover:border-[#A8C6F5]"
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-[#5F6A88]")}>{selectedLabel ?? placeholder}</span>
        <ChevronDown size={13} className={cn("shrink-0 text-[#5F6A88] transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          className="z-[60] overflow-hidden rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <div className="border-b border-[#EDF0F7] p-2">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-[#E2E7F2] py-1 pl-6 pr-2 text-[12px] text-[#0B1533] outline-none placeholder:text-[#5F6A88] focus:border-[#007BFF]"
              />
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto p-1">
            <OptionRow label={placeholder} selected={value === ""} onClick={() => pick("")} />
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[11.5px] text-[#5F6A88]">No matches</div>
            ) : (
              filtered.map((o) => (
                <OptionRow key={o.value} label={o.label} selected={o.value === value} onClick={() => pick(o.value)} />
              ))
            )}
          </div>
          {footerAction && (
            <button
              type="button"
              onClick={() => { close(); footerAction.onClick(); }}
              className="w-full border-t border-[#EDF0F7] px-3 py-2 text-left text-[12px] font-semibold text-[#007BFF] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
            >
              {footerAction.label}
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
