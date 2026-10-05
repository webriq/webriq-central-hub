"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clampDragToPhase, type DragMode, type DragState } from "./_gantt-shared";

type Range = { dayStart: number; dayEnd: number };

// Task 148 pointer drag-resize/move + task 421 keyboard nudge (Alt+←/→ move, Alt+Shift+←/→ resize
// end) + Escape-to-cancel. `onCommit` is invoked only for a real change, always on the same
// display-scaled day coordinates the card renders in (unscaling happens in the parent).
export function useDeliverableScheduleDrag({
  canEdit, dayStart, dayEnd, phaseDayStart, phaseDayEnd, dayWidth, onCommit,
}: {
  canEdit: boolean;
  dayStart: number;
  dayEnd: number;
  phaseDayStart: number;
  phaseDayEnd: number;
  dayWidth: number;
  onCommit: (range: Range) => void;
}) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [livePreview, setLivePreview] = useState<Range | null>(null);
  const [clamped, setClamped] = useState(false);
  const suppressClickRef = useRef(false);

  const cancel = useCallback(() => {
    setDragState(null);
    setLivePreview(null);
    setClamped(false);
  }, []);

  // Escape mid-drag discards the preview; the later pointerup finds no dragState and is a no-op.
  useEffect(() => {
    if (!dragState) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragState, cancel]);

  function beginDrag(mode: DragMode, e: PointerEvent) {
    if (!canEdit) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragState({ mode, startClientX: e.clientX, startDayStart: dayStart, startDayEnd: dayEnd, moved: false });
    setLivePreview({ dayStart, dayEnd });
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragState) return;
    const deltaPx = e.clientX - dragState.startClientX;
    const deltaDays = Math.round(deltaPx / dayWidth);
    let newStart = dragState.startDayStart;
    let newEnd = dragState.startDayEnd;
    if (dragState.mode === "resize-right") newEnd += deltaDays;
    else if (dragState.mode === "resize-left") newStart += deltaDays;
    else { newStart += deltaDays; newEnd += deltaDays; }
    const next = clampDragToPhase(dragState.mode, newStart, newEnd, phaseDayStart, phaseDayEnd);
    setLivePreview(next);
    setClamped(next.dayStart !== newStart || next.dayEnd !== newEnd);
    if (!dragState.moved && Math.abs(deltaPx) > 4) {
      suppressClickRef.current = true;
      setDragState((prev) => (prev ? { ...prev, moved: true } : prev));
    }
  }

  function endDrag() {
    if (!dragState) return;
    const changed = dragState.moved && livePreview && (livePreview.dayStart !== dayStart || livePreview.dayEnd !== dayEnd);
    if (changed && livePreview) onCommit(livePreview);
    cancel();
  }

  // True (once) when the click that follows a drag should be swallowed.
  function consumeSuppressedClick(): boolean {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!canEdit || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = e.shiftKey
      ? clampDragToPhase("resize-right", dayStart, dayEnd + dir, phaseDayStart, phaseDayEnd)
      : clampDragToPhase("move", dayStart + dir, dayEnd + dir, phaseDayStart, phaseDayEnd);
    if (next.dayStart !== dayStart || next.dayEnd !== dayEnd) onCommit(next);
  }

  return {
    dragging: dragState !== null,
    livePreview,
    clamped,
    beginDrag,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown,
    consumeSuppressedClick,
  };
}
