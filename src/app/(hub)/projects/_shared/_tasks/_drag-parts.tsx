"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// Task 487 — small drag-and-drop parts for the Tasks listing.

/** Grip button. Pointer/touch drag via dnd-kit; keyboard move via `onKeyDown` (see `_use-keyboard-move.ts`). */
export function DragHandle({ dragId, label, onKeyDown, active, className }: {
  dragId: string; label: string; onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void; active?: boolean; className?: string;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: dragId });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center w-4 h-6 rounded text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#EDF0F7] cursor-grab active:cursor-grabbing touch-none transition-colors",
        "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 focus-visible:outline-2 focus-visible:outline-[#007BFF]",
        active && "opacity-100 bg-[#E5F1FF] text-[#0063D6]",
        className,
      )}
    >
      <GripVertical size={13} aria-hidden />
    </button>
  );
}

// Left inset of the line = name-cell start (row pl-4 + 32px checkbox col + gap-3 = 60px) + 24px per depth level.
const INSET = ["left-15", "left-21", "left-27", "left-33", "left-39", "left-45"] as const;

/** Blue landing line with a round cap, at the top or bottom edge of the row it is rendered in. */
export function DropLine({ edge, depth = 0, full }: { edge: "top" | "bottom"; depth?: number; full?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-3 z-20 h-0.5 rounded-full bg-[#007BFF]",
        edge === "top" ? "-top-px" : "-bottom-px",
        full ? "left-4" : INSET[Math.min(depth, INSET.length - 1)],
        "before:absolute before:-left-1.5 before:-top-0.5 before:size-1.5 before:rounded-full before:border-2 before:border-[#007BFF] before:bg-white",
      )}
    />
  );
}

/** What follows the pointer while dragging. */
export function DragCard({ title, extra, blocked }: { title: string; extra?: string; blocked?: boolean }) {
  return (
    <div className={cn(
      "pointer-events-none flex max-w-90 items-center gap-2 rounded-[10px] border border-[#E2E7F2] bg-white px-3 py-2 shadow-lg",
      blocked ? "cursor-not-allowed opacity-70" : "cursor-grabbing",
    )}>
      <GripVertical size={13} className="shrink-0 text-[#5F6A88]" aria-hidden />
      <span className="truncate text-[13px] font-medium text-[#0B1533]">{title}</span>
      {extra && <span className="shrink-0 font-mono text-[10.5px] text-[#5F6A88]">{extra}</span>}
    </div>
  );
}

/** Checkbox with an indeterminate state (a parent with some, not all, of its rows selected). */
export function TriCheckbox({ checked, indeterminate, disabled, onChange, label }: {
  checked: boolean; indeterminate: boolean; disabled?: boolean; onChange: () => void; label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate && !checked; }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="w-3.5 h-3.5 rounded border-[#A8B0C8] cursor-pointer accent-[#007BFF] disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}
