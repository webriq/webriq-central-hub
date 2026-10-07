"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "lucide-react";
import { DayPanel } from "../../dashboard/timelogs/_time-period-panels";
import { fromISODate, toISODate } from "../../dashboard/timelogs/_time-logs-shared";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "../../dashboard/timelogs/_use-popover-position";
import { formatDate } from "@/lib/hr/dates";
import { fieldClass } from "./ui";

/**
 * Date-only field for HR forms: the Time Logs calendar popover (`DayPanel`) instead of the native
 * `<input type="date">`. Portaled and flipped above the trigger when there's no room below, so it
 * never clips inside a modal. `min`/`max` are "YYYY-MM-DD".
 */
export function DateField({ id, value, onChange, min, max, placeholder = "Select date" }: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);

  const disabled = [
    ...(min ? [{ before: fromISODate(min) }] : []),
    ...(max ? [{ after: fromISODate(max) }] : []),
  ];

  function pick(d: Date) {
    const iso = toISODate(d);
    if ((min && iso < min) || (max && iso > max)) return;
    onChange(iso);
    close();
  }

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${fieldClass} flex cursor-pointer items-center gap-2 text-left font-mono`}
      >
        <Calendar size={14} className="shrink-0 text-[#5F6A88]" aria-hidden />
        <span className={`truncate ${value ? "" : "font-sans text-[#5F6A88]"}`}>{value ? formatDate(value) : placeholder}</span>
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          role="dialog"
          aria-label="Choose a date"
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: Math.max(8, Math.min(pos.left, window.innerWidth - 304)) }}
          className="z-[70] w-[296px] rounded-[14px] border border-[#E2E7F2] bg-white p-4 shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <DayPanel draft={value ? fromISODate(value) : new Date()} onChange={pick} disabled={disabled} actions={null} />
        </div>,
        document.body,
      )}
    </>
  );
}
