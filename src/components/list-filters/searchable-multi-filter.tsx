"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/app/(hub)/projects/_shared/_assignee-multi-select";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "@/app/(hub)/projects/_shared/_use-popover-position";

// Task 491 — searchable multi-select toolbar filter for the Quick Links Tasks/Tickets pages
// (Assignee + Project). Trigger is the same `{label}: {value}` pill as `FilterMultiSelect`
// (Status); the panel mirrors `AssigneeMultiSelect`'s popover (header, auto-focused search,
// check rows, removable chips) so filtering reads like assigning. Toggles apply immediately and
// the panel stays open, so the list underneath updates while the user keeps picking.

export type MultiFilterOption = {
  value: string;
  label: string;
  // Present → render an avatar (assignees). Omitted → plain text row (projects).
  avatar?: { name: string | null; url: string | null };
  // Pinned-only icon in place of an avatar (e.g. Unassigned).
  icon?: React.ReactNode;
};

export function SearchableMultiFilter({
  label, headerLabel, options, pinned = [], selected, onChange, searchPlaceholder, emptyText = "No options",
}: {
  label: string;
  headerLabel: string;
  options: MultiFilterOption[];
  // Always-visible rows above the searchable list (e.g. Me / Unassigned). They are never filtered
  // out by the search query.
  pinned?: MultiFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchFocusedRef = useRef(false);
  const pos = usePopoverPosition(open, triggerRef, panelRef, 260);

  function close() {
    setOpen(false);
    setQuery("");
  }

  // Same focus-once-positioned pattern as `AssigneeMultiSelect` — the panel mounts
  // `visibility:hidden` for a frame while it's measured, and a hidden input can't take focus.
  useEffect(() => {
    if (!open) { searchFocusedRef.current = false; return; }
    if (pos && !searchFocusedRef.current) {
      searchFocusedRef.current = true;
      searchRef.current?.focus();
    }
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { close(); triggerRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Pinned values are listed once, at the top — drop duplicates from the main list (e.g. "Me").
  const pinnedValues = useMemo(() => new Set(pinned.map((p) => p.value)), [pinned]);
  const unpinned = useMemo(() => options.filter((o) => !pinnedValues.has(o.value)), [options, pinnedValues]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? unpinned.filter((o) => o.label.toLowerCase().includes(q)) : unpinned;
  }, [unpinned, query]);

  const byValue = useMemo(() => {
    const m = new Map<string, MultiFilterOption>();
    for (const o of [...options, ...pinned]) m.set(o.value, o);
    return m;
  }, [options, pinned]);

  const selectedResolved = selected.map((v) => byValue.get(v) ?? { value: v, label: "Unknown" });
  const isActive = selected.length > 0;
  const summary = !isActive
    ? "All"
    : selected.length === 1
      ? (byValue.get(selected[0])?.label ?? "1 selected")
      : `${selected.length} selected`;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  function renderRow(o: MultiFilterOption) {
    const isSelected = selected.includes(o.value);
    return (
      <button
        key={o.value}
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={() => toggle(o.value)}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] text-left transition-colors hover:bg-[#F4F6FB] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF]/40",
          isSelected && "bg-[#F0F7FF]"
        )}
      >
        {o.avatar ? <Avatar name={o.avatar.name} avatarUrl={o.avatar.url} /> : o.icon}
        <span className={cn("flex-1 truncate", isSelected ? "font-medium text-[#0B1533]" : "text-[#3A4565]")}>{o.label}</span>
        {isSelected && <Check size={13} className="text-[#007BFF] shrink-0" />}
      </button>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-[6.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer shrink-0 max-w-[260px] outline-none focus-visible:ring-[3px] focus-visible:ring-[#007BFF]/[0.14] focus-visible:border-[#007BFF]",
          isActive ? "border-[#007BFF] bg-[#F0F7FF] text-[#0063D6]" : "border-[#E2E7F2] bg-white text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
        )}
      >
        <span className="shrink-0">{label}:</span>
        <span className="font-mono font-normal truncate">{summary}</span>
        <ChevronDown size={12} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          // Mounted as soon as `open` so the first measure sees the real height (flip-above works
          // on first open); invisible until positioned — same as `AssigneeMultiSelect`.
          style={{
            position: "fixed",
            top: pos?.top,
            bottom: pos?.bottom,
            left: pos?.left,
            width: pos?.width,
            visibility: pos ? undefined : "hidden",
          }}
          className="z-[60] flex flex-col overflow-hidden rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#EDF0F7]">
            <p className="text-[11px] font-semibold text-[#5F6A88] uppercase tracking-wide">{headerLabel}</p>
            {isActive && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] font-semibold text-[#007BFF] hover:text-[#0063D6] cursor-pointer transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="border-b border-[#EDF0F7] p-2">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-md border border-[#E2E7F2] py-1 pl-6 pr-2 text-[12px] text-[#0B1533] outline-none placeholder:text-[#5F6A88] focus:border-[#007BFF]"
              />
            </div>
          </div>
          <div role="listbox" aria-multiselectable="true" aria-label={headerLabel} className="max-h-52 overflow-y-auto p-1">
            {pinned.length > 0 && (
              <>
                {pinned.map(renderRow)}
                <div className="my-1 h-px bg-[#EDF0F7]" />
              </>
            )}
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-[11.5px] text-[#5F6A88]">
                {unpinned.length === 0 ? emptyText : "No matches"}
              </p>
            ) : (
              filtered.map(renderRow)
            )}
          </div>
          {selectedResolved.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-[#EDF0F7] p-2">
              {selectedResolved.map((s) => (
                <motion.span
                  key={s.value}
                  layout
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-[#F4F6FB] pl-1.5 pr-1.5 py-0.5 text-[11px] text-[#3A4565]"
                >
                  {s.avatar && <Avatar name={s.avatar.name} avatarUrl={s.avatar.url} size="sm" />}
                  <span className="truncate max-w-[140px]">{s.label}</span>
                  <button
                    type="button"
                    onClick={() => toggle(s.value)}
                    aria-label={`Remove ${s.label}`}
                    className="text-[#94A0BE] hover:text-[#C0392B] cursor-pointer transition-colors"
                  >
                    <X size={12} />
                  </button>
                </motion.span>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
