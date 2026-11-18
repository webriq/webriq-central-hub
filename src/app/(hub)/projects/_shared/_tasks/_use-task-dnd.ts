"use client";

import { useRef, useState } from "react";
import { PointerSensor, TouchSensor, useSensor, useSensors, type DragMoveEvent, type DragStartEvent } from "@dnd-kit/core";
import { zoneFor, type DragKind, type DropTarget } from "./_move-rules";

export type DragItem = { kind: DragKind; id: string };
export const dragId = (kind: DragKind, id: string) => `${kind}:${id}`;
export function parseDragId(raw: string): DragItem {
  const i = raw.indexOf(":");
  return { kind: raw.slice(0, i) as DragKind, id: raw.slice(i + 1) };
}
const same = (a: DropTarget | null, b: DropTarget | null) => a?.kind === b?.kind && a?.id === b?.id && a?.zone === b?.zone;
const HOLD_MS = 600; // hovering a collapsed phase/group this long expands it

function startPoint(ev: Event | null): { x: number; y: number } {
  const t = ev && "touches" in ev ? (ev as TouchEvent).touches[0] : (ev as PointerEvent | null);
  return { x: t?.clientX ?? 0, y: t?.clientY ?? 0 };
}

// Task 487 — pointer/touch drag for the Tasks listing. dnd-kit supplies sensors, overlay and autoscroll; the drop
// target is our own hit test: the row under the pointer (`data-drop-id`) and the pointer's height within it.
export function useTaskDnd({ isValid, onDrop, onStart, onHold }: {
  isValid: (item: DragItem, target: DropTarget) => boolean;
  onDrop: (item: DragItem, target: DropTarget) => void;
  onStart?: (item: DragItem) => void;
  onHold?: (target: DropTarget) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );
  const [active, setActive] = useState<DragItem | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [blocked, setBlocked] = useState(false);
  const origin = useRef({ x: 0, y: 0 });
  const hold = useRef<{ key: string; at: number; fired: boolean }>({ key: "", at: 0, fired: false });

  function reset() {
    setActive(null); setTarget(null); setBlocked(false);
    hold.current = { key: "", at: 0, fired: false };
  }

  function onDragStart(e: DragStartEvent) {
    origin.current = startPoint(e.activatorEvent);
    const item = parseDragId(String(e.active.id));
    setActive(item);
    onStart?.(item);
  }

  function onDragMove(e: DragMoveEvent) {
    if (!active) return;
    const x = origin.current.x + e.delta.x, y = origin.current.y + e.delta.y;
    const el = document.elementsFromPoint(x, y)
      .map((n) => (n as HTMLElement).closest<HTMLElement>("[data-drop-id]"))
      .find((n): n is HTMLElement => !!n);
    let next: DropTarget | null = null;
    if (el) {
      const hit = parseDragId(el.dataset.dropId!);
      const r = el.getBoundingClientRect();
      const zone = zoneFor(hit.kind, active.kind, (y - r.top) / Math.max(r.height, 1));
      if (zone) next = { ...hit, zone };
    }
    const ok = !!next && isValid(active, next);
    setBlocked(!!next && !ok);
    const shown = ok ? next : null;
    if (!same(shown, target)) setTarget(shown);

    const key = next ? `${next.kind}:${next.id}` : "";
    if (key !== hold.current.key) hold.current = { key, at: Date.now(), fired: false };
    else if (next && !hold.current.fired && Date.now() - hold.current.at > HOLD_MS && next.zone === "into") {
      hold.current.fired = true;
      onHold?.(next);
    }
  }

  function onDragEnd() {
    if (active && target) onDrop(active, target);
    reset();
  }

  return { sensors, active, target, blocked, handlers: { onDragStart, onDragMove, onDragEnd, onDragCancel: reset } };
}
