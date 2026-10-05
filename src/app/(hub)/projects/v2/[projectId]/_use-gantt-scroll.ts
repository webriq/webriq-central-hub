"use client";

import { useCallback, useEffect, useRef } from "react";
import { LABEL_WIDTH } from "./_gantt-shared";

// Task 422 — the Gantt grid's wheel + scroll-to-today behaviour, shared by the StackShift and
// generic Timelines (previously two copies). Wheel rule: native horizontal input (swipe /
// Shift+wheel, deltaX-dominant) is left to the browser; plain vertical wheel scrolls the page,
// except over the date-header row (`[data-gantt-header]`), where it pans the grid. Ctrl+wheel
// (pinch-zoom) is never touched.
export function useGanttScroll(dayWidth: number) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const focusDayRef = useRef(1);
  const initialScrollDoneRef = useRef(false);

  const onWheel = useCallback((e: WheelEvent) => {
    const el = nodeRef.current;
    if (!el || e.ctrlKey || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const overHeader = (e.target as Element | null)?.closest?.("[data-gantt-header]");
    if (!overHeader && !e.shiftKey) return;
    // Native listener + passive:false is required for preventDefault() to work.
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, []);

  const scrollToDay = useCallback((focusDay: number, behavior: ScrollBehavior) => {
    const el = nodeRef.current;
    if (!el) return;
    const target = Math.max(0, LABEL_WIDTH + (focusDay - 1) * dayWidth - (el.clientWidth - LABEL_WIDTH) / 2);
    el.scrollTo({ left: target, behavior });
  }, [dayWidth]);

  // Re-centre on today when the zoom (dayWidth) changes, after the initial placement.
  useEffect(() => {
    if (initialScrollDoneRef.current) scrollToDay(focusDayRef.current, "auto");
  }, [scrollToDay]);

  // Returns a ref callback bound to this render's focus day. It is inline-recreated each render (as
  // before), so attach/detach happens in the callback itself and can never go stale.
  const bindGrid = (focusDay: number) => (node: HTMLDivElement | null) => {
    nodeRef.current?.removeEventListener("wheel", onWheel);
    nodeRef.current = node;
    focusDayRef.current = focusDay;
    if (!node) return;
    node.addEventListener("wheel", onWheel, { passive: false });
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      requestAnimationFrame(() => scrollToDay(focusDay, "auto"));
    }
  };

  const scrollToToday = (focusDay: number, behavior: ScrollBehavior = "smooth") => scrollToDay(focusDay, behavior);

  return { bindGrid, scrollToToday };
}
