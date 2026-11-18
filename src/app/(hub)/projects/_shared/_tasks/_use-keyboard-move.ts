"use client";

import { useState, type KeyboardEvent } from "react";
import type { DropTarget } from "./_move-rules";

// Task 487 — keyboard drag for task rows: Space/Enter lifts, ↑/↓ walk the slots between visible rows,
// → nests under the row above the slot, ← un-nests, Space/Enter drops, Esc cancels.
export function useKeyboardMove({ rows, titleOf, isValid, onDrop, onStart, announce }: {
  rows: string[]; // visible task ids, display order
  titleOf: (id: string) => string;
  isValid: (taskId: string, target: DropTarget) => boolean;
  onDrop: (taskId: string, target: DropTarget) => void;
  onStart?: () => void;
  announce: (text: string) => void;
}) {
  const [state, setState] = useState<{ id: string; slot: number; nest: boolean } | null>(null);

  // Slot i = just above rows[i]; slot rows.length = below the last row.
  function targetOf(slot: number, nest: boolean): DropTarget | null {
    if (nest) return slot > 0 ? { kind: "task", id: rows[slot - 1], zone: "nest" } : null;
    if (slot < rows.length) return { kind: "task", id: rows[slot], zone: "before" };
    return rows.length ? { kind: "task", id: rows[rows.length - 1], zone: "after" } : null;
  }
  const valid = (id: string, slot: number, nest: boolean) => {
    const t = targetOf(slot, nest);
    return !!t && isValid(id, t);
  };

  function onKeyDown(taskId: string, e: KeyboardEvent) {
    const key = e.key;
    if (!state || state.id !== taskId) {
      if (key !== " " && key !== "Enter") return;
      e.preventDefault();
      onStart?.();
      setState({ id: taskId, slot: Math.max(rows.indexOf(taskId), 0), nest: false });
      announce("Picked up. Use the arrow keys to choose a place, Space to drop, Escape to cancel.");
      return;
    }
    if (key === "Tab") { setState(null); announce("Move cancelled."); return; } // never trap focus
    e.preventDefault();
    if (key === "Escape") { setState(null); announce("Move cancelled."); return; }
    if (key === " " || key === "Enter") {
      const t = targetOf(state.slot, state.nest);
      setState(null);
      if (t && isValid(taskId, t)) onDrop(taskId, t);
      else announce("Nothing moved.");
      return;
    }
    if (key === "ArrowUp" || key === "ArrowDown") {
      const step = key === "ArrowUp" ? -1 : 1;
      for (let s = state.slot + step; s >= 0 && s <= rows.length; s += step) {
        if (valid(taskId, s, false)) { setState({ ...state, slot: s, nest: false }); announce(describe(s, false)); return; }
      }
      return;
    }
    if (key === "ArrowRight" && valid(taskId, state.slot, true)) { setState({ ...state, nest: true }); announce(describe(state.slot, true)); }
    if (key === "ArrowLeft" && state.nest) { setState({ ...state, nest: false }); announce(describe(state.slot, false)); }
  }

  function describe(slot: number, nest: boolean) {
    if (nest) return `Subtask of "${titleOf(rows[slot - 1])}".`;
    return slot < rows.length ? `Above "${titleOf(rows[slot])}".` : "At the end of the list.";
  }

  return { movingId: state?.id ?? null, target: state ? targetOf(state.slot, state.nest) : null, onKeyDown };
}
