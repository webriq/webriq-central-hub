"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTip } from "./_icon-tip";
import { NOTE_COLOR_OPTIONS, NOTE_SWATCH_BG, NOTE_CARD_BORDER, type NoteColor } from "./_notes-types";

// Task 311 — small popover of fixed pastel swatches (image 3's palette icon in the note
// editor toolbar). Fixed set, not a color input — matches this app's "static lookup map, never
// construct Tailwind classes dynamically" convention.
export function NoteColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: NoteColor;
  onChange: (color: NoteColor) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconTip label="Background color">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-label="Background color"
          className="p-1.5 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#0B1533] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <Palette size={16} />
        </button>
      </IconTip>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-40 flex items-center gap-1.5 p-2 rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)]">
          {NOTE_COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              aria-label={opt.label}
              title={opt.label}
              className={cn(
                "w-6 h-6 rounded-full border flex items-center justify-center cursor-pointer transition-colors",
                NOTE_SWATCH_BG[opt.value],
                NOTE_CARD_BORDER[opt.value]
              )}
            >
              {value === opt.value && <Check size={12} className="text-[#0B1533]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
