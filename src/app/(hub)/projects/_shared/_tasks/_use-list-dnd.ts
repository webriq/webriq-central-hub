"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type Task, type Milestone, decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { resolveTaskMove, resolveGroupMove, resolvePhaseMove, type DropTarget, type TaskCtx } from "./_move-rules";
import { useTaskDnd, dragId, parseDragId, type DragItem } from "./_use-task-dnd";
import { useKeyboardMove } from "./_use-keyboard-move";
import { descendantRollup, phaseKey } from "./_task-tree";
import type { useTaskMoves } from "./_use-task-moves";

// Task 487 — drag-and-drop wiring for the Tasks listing: validity + drop dispatch shared by pointer and keyboard,
// the D2 "switch to Manual order" rule, auto-expand on hover, and the screen-reader text.
export function useListDnd({ ctx, milestones, collapsed, onToggleCollapse, expandedRows, canArrange, anywhereFor, moves, manual, onManualSort }: {
  ctx: TaskCtx<Task>;
  milestones: Milestone[];
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  expandedRows: Set<string>;
  canArrange: boolean;
  anywhereFor: (t: Task) => boolean;
  moves: ReturnType<typeof useTaskMoves>;
  manual: boolean;
  onManualSort: () => void;
}) {
  const { byId, groups, phases, children } = ctx;
  const [liveText, setLiveText] = useState("");
  const toldManualSort = useRef(false); // "Sorted by manual order" toast: once per visit

  const titleOf = (raw: string) => {
    const { kind, id } = parseDragId(raw.includes(":") ? raw : `task:${raw}`);
    if (kind === "task") return decodeHtmlEntities(byId.get(id)?.title ?? "task");
    if (kind === "group") return decodeHtmlEntities(groups.find((g) => g.id === id)?.name ?? "list");
    return decodeHtmlEntities(milestones.find((m) => m.id === id)?.name ?? "phase");
  };
  function isValid(item: DragItem, target: DropTarget): boolean {
    if (item.kind === "task") {
      const t = byId.get(item.id);
      return !!t && !!resolveTaskMove(ctx, item.id, target, anywhereFor(t));
    }
    if (!canArrange) return false;
    return item.kind === "group" ? !!resolveGroupMove(phases, item.id, target) : !!resolvePhaseMove(phases, item.id, target);
  }
  function drop(item: DragItem, target: DropTarget) {
    if (item.kind === "task") {
      const t = byId.get(item.id);
      const m = t && resolveTaskMove(ctx, item.id, target, anywhereFor(t));
      if (m) void moves.moveTask(m);
    } else if (item.kind === "group") {
      const m = resolveGroupMove(phases, item.id, target);
      if (m) void moves.moveGroup(m);
    } else {
      const order = resolvePhaseMove(phases, item.id, target);
      if (order) void moves.movePhase(order);
    }
    setLiveText(`Moved "${titleOf(dragId(item.kind, item.id))}".`);
  }
  // D2 — dragging always works in Manual order: switch to it before the first drag.
  function startDrag() {
    if (manual) return;
    onManualSort();
    if (!toldManualSort.current) { toldManualSort.current = true; toast.info("Sorted by manual order"); }
  }
  const dnd = useTaskDnd({
    isValid, onDrop: drop, onStart: startDrag,
    onHold: (t) => { const key = t.kind === "phase" ? phaseKey(t.id) : t.id; if (collapsed.has(key)) onToggleCollapse(key); },
  });

  // Visible task rows in display order — the keyboard mover's slots.
  const visibleRows = useMemo(() => {
    const out: string[] = [];
    const walk = (list: Task[]) => list.forEach((t) => { out.push(t.id); if (expandedRows.has(t.id)) walk(children.get(t.id) ?? []); });
    for (const ph of phases) if (!collapsed.has(phaseKey(ph.key))) for (const g of ph.groups) if (!collapsed.has(g.id)) walk(g.tasks);
    return out;
  }, [phases, collapsed, expandedRows, children]);
  const kbd = useKeyboardMove({
    rows: visibleRows, titleOf, announce: setLiveText, onStart: startDrag,
    isValid: (id, t) => isValid({ kind: "task", id }, t), onDrop: (id, t) => drop({ kind: "task", id }, t),
  });

  const kbdTarget = kbd.movingId && kbd.target && isValid({ kind: "task", id: kbd.movingId }, kbd.target) ? kbd.target : null;
  const target = dnd.target ?? kbdTarget;
  const overlay = dnd.active;
  const overlaySubtasks = overlay?.kind === "task" ? descendantRollup(overlay.id, children).total : 0;

  return {
    liveText, kbd, blocked: dnd.blocked, overlay, overlaySubtasks,
    overlayTitle: overlay ? titleOf(dragId(overlay.kind, overlay.id)) : "",
    draggingTask: dnd.active?.kind === "task" ? dnd.active.id : kbd.movingId,
    zoneOf: (kind: DragItem["kind"], id: string) => (target?.kind === kind && target.id === id ? target.zone : null),
    contextProps: {
      sensors: dnd.sensors,
      ...dnd.handlers,
      accessibility: {
        screenReaderInstructions: { draggable: "Press Space to pick up. Use the arrow keys to choose a place, Right arrow to make it a subtask, Space to drop, Escape to cancel." },
        announcements: {
          onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up ${titleOf(String(active.id))}.`,
          onDragOver: () => undefined, onDragMove: () => undefined, onDragEnd: () => undefined,
          onDragCancel: () => "Move cancelled.",
        },
      },
    },
  };
}
