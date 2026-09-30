"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ListFilter, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIKI_PRODUCTS, type WikiProduct } from "@/types/wiki";
import type { WikiTagCount } from "@/lib/wiki/tags";

// Task 401 — Filter button beside the /kb tree search. Checkbox rows, portal placement,
// outside-click close and the active-trigger colors are ported from
// `desk/tickets/_filter-multi-select.tsx` (kept as a local copy per that file's own
// no-cross-feature-import precedent). Two groups: Spaces and Tags. Empty group = no restriction;
// OR within a group, AND across groups (applied in `_wiki-tree-panel.tsx`).

const PANEL_WIDTH = 240;
const TAG_SEARCH_THRESHOLD = 10;

function FilterCheckRow({
  label,
  checked,
  onClick,
  leading,
  trailing,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
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
      {leading}
      <span className="truncate flex-1">{label}</span>
      {trailing}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pt-1.5 pb-1 text-[10.5px] font-bold tracking-[0.06em] text-[#94A3B8]">{children}</p>;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function WikiTreeFilter({
  tagCatalog,
  selectedSpaces,
  selectedTags,
  onSpacesChange,
  onTagsChange,
}: {
  tagCatalog: WikiTagCount[];
  selectedSpaces: WikiProduct[];
  selectedTags: string[];
  onSpacesChange: (next: WikiProduct[]) => void;
  onTagsChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Right-aligned to the trigger, clamped so it never runs off the left edge.
      setPos({ top: r.bottom + 4, left: Math.max(8, r.right - PANEL_WIDTH) });
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

  const visibleTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return q ? tagCatalog.filter((c) => c.tag.toLowerCase().includes(q)) : tagCatalog;
  }, [tagCatalog, tagQuery]);

  const activeCount = selectedSpaces.length + selectedTags.length;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Filter"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border transition-colors cursor-pointer",
          activeCount > 0
            ? "border-[#007BFF] bg-[#F0F7FF] text-[#0063D6]"
            : "border-[#E2E7F2] bg-[#F4F6FB] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
        )}
      >
        <ListFilter size={14} />
        {activeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-[#007BFF] text-white text-[9.5px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: PANEL_WIDTH }}
          className="z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <div className="overflow-y-auto p-1">
            <SectionLabel>SPACES</SectionLabel>
            {WIKI_PRODUCTS.map((p) => (
              <FilterCheckRow
                key={p.name}
                label={p.name}
                checked={selectedSpaces.includes(p.name)}
                onClick={() => onSpacesChange(toggle(selectedSpaces, p.name))}
                leading={
                  <span
                    className="w-4 h-4 rounded-[4px] flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                    style={{ background: p.color }}
                  >
                    {p.badge}
                  </span>
                }
              />
            ))}

            <div className="my-1 h-px bg-[#EDF0F7]" />
            <SectionLabel>TAGS</SectionLabel>
            {tagCatalog.length > TAG_SEARCH_THRESHOLD && (
              <div className="mx-1 mb-1 flex items-center gap-1.5 rounded-[7px] border border-[#E2E7F2] bg-[#F4F6FB] px-2 py-1">
                <Search size={11} className="text-[#94A3B8] shrink-0" />
                <input
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  placeholder="Find a tag…"
                  aria-label="Find a tag"
                  className="w-full bg-transparent outline-none text-[12px] text-[#3A4565] placeholder:text-[#94A3B8]"
                />
              </div>
            )}
            {tagCatalog.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-[#94A3B8]">No tags yet</p>
            ) : visibleTags.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-[#94A3B8]">No tags match</p>
            ) : (
              visibleTags.map((c) => (
                <FilterCheckRow
                  key={c.tag}
                  label={c.tag}
                  checked={selectedTags.includes(c.tag)}
                  onClick={() => onTagsChange(toggle(selectedTags, c.tag))}
                  trailing={<span className="shrink-0 text-[10.5px] font-mono text-[#94A3B8]">{c.count}</span>}
                />
              ))
            )}
          </div>

          {activeCount > 0 && (
            <div className="border-t border-[#EDF0F7] p-1">
              <button
                type="button"
                onClick={() => { onSpacesChange([]); onTagsChange([]); }}
                className="w-full rounded-[7px] px-2 py-1.5 text-left text-[12px] font-semibold text-[#0063D6] cursor-pointer transition-colors hover:bg-[#F0F7FF]"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
