"use client";

import { useEffect, useState, type RefObject } from "react";

export type PopoverPosition = { top?: number; bottom?: number; left: number; width?: number };

// Shared portal-popover positioning for every floating panel in this feature area
// (`_searchable-select.tsx`, `_date-field-picker.tsx`, `_time-field-picker.tsx`,
// `_task-issue-picker.tsx`, `_time-period-inline-editor.tsx`) — post-implementation fix: every one
// of these previously anchored purely below the trigger (`top: r.bottom + 4`), which overflows off
// the bottom of the viewport when the trigger sits low on the page (e.g. the Add Time Log modal's
// Date/Start Time/End Time row). Now measures the panel's actual rendered height and flips to open
// *above* the trigger when there isn't enough room below and there's more room above.
//
// Extracted once several of these components independently duplicated the same
// getBoundingClientRect()-based positioning effect — consistent with this directory's existing
// "de-duplicate cross-file helpers into a shared module" convention.
export function usePopoverPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  minWidth?: number
): PopoverPosition | null {
  const [pos, setPos] = useState<PopoverPosition | null>(null);

  useEffect(() => {
    // Stale `pos` is harmless when closed — every consumer already gates rendering on
    // `open && pos`, and `place()` recomputes it fresh the next time this effect runs with
    // `open: true`. Returning without a synchronous `setState` here avoids the
    // `react-hooks/set-state-in-effect` rule this codebase already routes around elsewhere.
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // First pass (panel not mounted yet) has no height to measure — falls back to "open below"
      // until the follow-up `requestAnimationFrame` re-measures the now-mounted panel.
      const panelHeight = panelRef.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const openAbove = panelHeight > 0 && spaceBelow < panelHeight + 8 && spaceAbove > spaceBelow;
      const width = minWidth ? Math.max(r.width, minWidth) : undefined;
      setPos(
        openAbove
          ? { bottom: window.innerHeight - r.top + 4, left: r.left, width }
          : { top: r.bottom + 4, left: r.left, width }
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

// Marker attribute for every portaled popover panel in this feature area (task 230 follow-up).
// `document.body`-portaled content sits outside a wrapping component's own DOM subtree, so a
// parent's `containerRef.contains(e.target)` outside-click check misreads a click inside a *nested*
// popover as "outside" and cancels prematurely — the exact bug that broke reassigning a General Log
// entry to a task/issue inline (`_time-logs-table.tsx`'s `LogTitleEditor` wraps `TaskIssuePicker`,
// whose dropdown panel is portaled). Any outside-click handler in this directory that might wrap
// another one of these popover components should also treat `[data-popover-root]` as "inside."
export const POPOVER_ROOT_ATTR = "data-popover-root";
