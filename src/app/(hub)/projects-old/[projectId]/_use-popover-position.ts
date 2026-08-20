"use client";

import { useEffect, useState, type RefObject } from "react";

export type PopoverPosition = { top?: number; bottom?: number; left: number; width?: number };

// Shared portal-popover positioning for every floating panel in this feature area
// (`_searchable-select.tsx`, `_datetime-field-picker.tsx`) — task 274. Page-scoped duplicate of
// `dashboard/timelogs/_use-popover-position.ts` (same generic getBoundingClientRect-based
// flip-to-fit logic, no page-specific dependency) rather than promoted to a shared `src/hooks/`
// location — that file's own doc comment scopes it "for every floating panel in this feature
// area," and this codebase's established convention (task 226/228) is to duplicate this kind of
// helper per feature area rather than reach across unrelated directories.
export function usePopoverPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  minWidth?: number
): PopoverPosition | null {
  const [pos, setPos] = useState<PopoverPosition | null>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const panelHeight = panelRef.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const openAbove = panelHeight > 0 && spaceBelow < panelHeight + 8 && spaceAbove > spaceBelow;
      const width = minWidth ? Math.max(r.width, minWidth) : undefined;
      // Horizontal clamp — a panel wider than its trigger (e.g. `DateTimeFieldPicker`'s
      // calendar+time popover) can otherwise run off the right edge of the viewport when the
      // trigger sits near it, or off the left edge on a narrow viewport. Same measure-after-
      // mount pattern as the vertical flip above: falls back to the trigger's own left edge
      // until the panel has actually rendered and `offsetWidth` is real.
      const panelWidth = panelRef.current?.offsetWidth ?? 0;
      const margin = 8;
      const left = panelWidth > 0
        ? Math.min(Math.max(r.left, margin), Math.max(margin, window.innerWidth - panelWidth - margin))
        : r.left;
      setPos(
        openAbove
          ? { bottom: window.innerHeight - r.top + 4, left, width }
          : { top: r.bottom + 4, left, width }
      );
    }
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, triggerRef, panelRef, minWidth]);

  return pos;
}

// Marker attribute for every portaled popover panel in this feature area — an outside-click
// handler on a parent popover should treat a nested one's portaled content as "inside" (see
// `dashboard/timelogs/_use-popover-position.ts` for the bug this pattern avoids).
export const POPOVER_ROOT_ATTR = "data-popover-root";
