"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "lucide-react";
import { DayPanel } from "./_time-period-panels";
import { fromISODate, toISODate, MONTH_NAMES } from "./_time-logs-shared";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Form-field date picker for the Add/Edit Time Log modal (task 229) — replaces a plain
// `<input type="date">` with a popover reusing `DayPanel` (the exact calendar the page's own
// date filter uses, `_time-period-picker.tsx`/`_time-period-panels.tsx`, task 226) so the modal
// stays visually consistent with the toolbar. Unlike the filter (which has a draft/OK/Cancel
// step because it juggles four modes), this is a single value — picking a day applies and closes
// immediately. Portal-positioned off the trigger's bounding rect, same mechanics as
// `_searchable-select.tsx`, since a plain `absolute` popover would clip against this 420px-wide
// modal card in a way the wide-open toolbar never has to worry about.

const inputTriggerClass =
  "w-full px-2.5 py-1.5 rounded-[10px] border text-[12px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] flex items-center gap-1.5 cursor-pointer hover:border-[#A8C6F5]";

function formatLabel(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function DateFieldPicker({
  value, onChange, autoOpen, onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  // Task 230 — inline table cell editing (Requirement 14) opens this popover on a single click by
  // mounting the picker already-open (`autoOpen`) and unmounting it again once the popover closes
  // (`onClose`), instead of requiring a first click to reveal the trigger and a second to open it.
  // Both optional/additive — the modal's own usage (no autoOpen/onClose) is unaffected.
  autoOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(!!autoOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef);

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, close]);

  const selectedDate = value ? fromISODate(value) : new Date();

  // A time log can't be logged against a day that hasn't happened yet — compare at the date
  // level (not exact time) so today itself stays selectable regardless of the current hour.
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={inputTriggerClass}
      >
        <Calendar size={13} className="text-[#5F6A88] shrink-0" />
        <span className="truncate">{value ? formatLabel(selectedDate) : "Select date…"}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left }}
          className="z-50 rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-4"
        >
          <DayPanel
            draft={selectedDate}
            onChange={(d) => {
              onChange(toISODate(d));
              close();
            }}
            disabled={{ after: today }}
            actions={null}
          />
        </div>,
        document.body
      )}
    </>
  );
}
