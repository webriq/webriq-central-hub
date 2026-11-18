"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, Plus, SearchX } from "lucide-react";

// Task 487 — listing chrome moved from `_list-view.tsx` unchanged in behaviour.

/**
 * Sticky-header "stuck" detection: a zero-height sentinel sits at the card's top edge, just above the sticky
 * header. Once it scrolls out of the scroll container's view the header has pinned flush against the toolbar —
 * square off its top corners then; restore them once it un-sticks. The card must not be `overflow-hidden`
 * (it would become the scroll container and break `sticky`), and its top spacing must be a margin, not padding
 * on the scroll container (a sticky child can never rise above scrollport padding).
 */
export function useStickyHeader() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [headerStuck, setHeaderStuck] = useState(false);
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setHeaderStuck(!entry.isIntersecting), { root, threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  return { scrollRef, sentinelRef, headerStuck };
}

export function ListEmptyState({ filtered, onClearFilters, onCreateNew }: {
  filtered: boolean; onClearFilters: () => void; onCreateNew?: () => void;
}) {
  const Icon = filtered ? SearchX : ClipboardList;
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="w-10 h-10 rounded-full bg-[#EDF0F7] flex items-center justify-center">
        <Icon size={18} className="text-[#5F6A88]" />
      </div>
      <p className="text-[13px] text-[#5F6A88]">{filtered ? "No tasks match your filters." : "No tasks yet."}</p>
      {filtered ? (
        <button onClick={onClearFilters} className="text-[12px] font-semibold text-[#0063D6] hover:text-[#071133] cursor-pointer transition-colors">
          Clear filters
        </button>
      ) : onCreateNew && (
        <button onClick={onCreateNew} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0063D6] hover:text-[#071133] cursor-pointer transition-colors">
          <Plus size={13} /> New Task
        </button>
      )}
    </div>
  );
}
