"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "../../dashboard/timelogs/_use-popover-position";
import { PersonAvatar } from "../_components/person-avatar";
import { fieldClass } from "../_components/ui";

export interface ManagerOption { id: string; name: string }

/**
 * "Reporting to" picker: a listbox with each admin's photo (a native <select> can't show images).
 * Portaled and flipped above the trigger near the bottom of the screen so the table never clips it.
 */
export function ManagerSelect({ label, value, options, disabled, onChange }: {
  label: string;
  value: string | null;
  options: ManagerOption[];
  disabled?: boolean;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef, 240);
  const current = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function choose(id: string | null) {
    setOpen(false);
    if (id !== value) onChange(id);
  }

  const itemClass = "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[12px] text-[#0B1533] transition-colors hover:bg-[#F0F7FF]";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`${fieldClass} flex !w-56 cursor-pointer items-center gap-2 !py-1.5 !text-[12px] disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {current ? <PersonAvatar id={current.id} name={current.name} size="md" /> : null}
        <span className={`min-w-0 flex-1 truncate text-left ${current ? "" : "text-[#5F6A88]"}`}>{current?.name ?? "No one (admins review)"}</span>
        <ChevronDown size={14} aria-hidden className="shrink-0 text-[#5F6A88]" />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          role="listbox"
          aria-label={label}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          className="z-[70] max-h-72 overflow-y-auto rounded-[12px] border border-[#E2E7F2] bg-white py-1 shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <button type="button" role="option" aria-selected={!value} className={itemClass} onClick={() => choose(null)}>
            <span className="flex-1 text-[#5F6A88]">No one (admins review)</span>
            {!value && <Check size={14} aria-hidden className="text-[#0063D6]" />}
          </button>
          {options.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === value} className={itemClass} onClick={() => choose(o.id)}>
              <PersonAvatar id={o.id} name={o.name} size="md" />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.id === value && <Check size={14} aria-hidden className="text-[#0063D6]" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
