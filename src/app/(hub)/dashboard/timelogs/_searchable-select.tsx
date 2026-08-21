"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Single-select searchable dropdown (task 228, follow-up to 226/227) — replaces the Project and
// User filters' native `<select>`s in `_time-logs-content.tsx` once the option lists grow long
// enough that scrolling a native select becomes slow. Mirrors the portal-positioning/outside-
// click mechanics of `portfolio-tracker/import/_content.tsx`'s `TypeMultiSelect`, adapted from
// multi-select (pill removal) to single-select (one label on the trigger, pick-and-close).
// Page-scoped to this directory, not shared — same reasoning task 226 already used for not
// reaching into `_filter-multi-select.tsx`/`TypeMultiSelect` themselves.

// Section label for the "Recently Accessed" / "Others" grouping (task 230, Requirement 4) — same
// orange uppercase convention `_time-period-panels.tsx`'s `QuickLinkRow` label already uses.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-[#FB914E]">{children}</p>;
}

function OptionRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[#F4F6FB]",
        selected && "bg-[#F0F7FF]"
      )}
    >
      <span className={selected ? "font-medium text-[#0B1533]" : "text-[#3A4565]"}>{label}</span>
      {selected && <Check size={12} className="text-[#007BFF]" />}
    </button>
  );
}

export function SearchableSelect({
  value, onChange, options, placeholder, searchPlaceholder, disabled, fullWidth, label, recentValues, size = "sm", onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  fullWidth?: boolean;
  // Toolbar-filter prefix, e.g. "Project" -> "Project: All Projects" / "Project: <name>" —
  // matches `_filter-multi-select.tsx`'s `FilterMultiSelect` trigger convention (`{label}:
  // {value}`, blue-highlighted border once filtered away from the default "All" state) so the
  // Time Logs toolbar reads consistently with the rest of the app's filter pills. Omit for the
  // Add Time Log modal's Project/Task fields, which have their own adjacent `<label>` element
  // instead.
  label?: string;
  // Task 230, Requirement 4 — when set (and no search query is active), the option list splits
  // into "Recently Accessed" (values present here, in this order) and "Others" instead of one
  // flat list. Additive/optional — every other call site (Project/User filters) is unaffected.
  recentValues?: string[];
  // Task 294 — "sm" (default) keeps the compact `rounded-full` filter-pill trigger every toolbar
  // caller (`_time-logs-content.tsx`'s Project/User filters) already uses. "md" renders the
  // trigger with this modal's plain form-field tokens instead (`rounded-[10px]`, `px-3 py-2`,
  // `text-[13px]`, `bg-[#F4F6FB]`) — used by the Add Time Log modal's Project field so it matches
  // `_create-project-modal.tsx` ("New Project")'s field sizing rather than reading as a filter
  // pill inside a form.
  size?: "sm" | "md";
  // Task 294 — fires whenever the popover closes, whether or not a value was picked (outside
  // click, Escape, or a selection). The dropdown's search input is `autoFocus`ed and lives in a
  // portal outside this trigger's own DOM subtree, so opening the dropdown immediately blurs the
  // trigger — a caller relying only on the trigger's own `onBlur` for "touched" tracking would see
  // that fire the instant the dropdown opens, before the user has made a choice or left the field.
  // `onClose` gives a callback tied to the popover actually closing instead.
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef, 200);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
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

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedLabel = options.find((o) => o.value === value)?.label;

  function toggleOpen() {
    if (disabled) return;
    setOpen((o) => !o);
    setQuery("");
  }

  function pick(v: string) {
    onChange(v);
    close();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "items-center gap-1.5 border outline-none transition-colors",
          fullWidth ? "flex w-full justify-between" : "inline-flex",
          size === "md"
            ? "px-3 py-2 rounded-[10px] text-[13px] font-normal"
            : "px-3 py-[6.5px] rounded-full text-[11px] font-semibold",
          disabled
            ? "opacity-50 cursor-not-allowed border-[#E2E7F2] bg-white text-[#5F6A88]"
            : size === "md"
              ? cn(
                  "cursor-pointer border-[#E2E7F2] bg-[#F4F6FB]",
                  value ? "text-[#3A4565]" : "text-[#5F6A88]",
                  "focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
                )
              : cn(
                  "cursor-pointer",
                  label && value
                    ? "border-[#007BFF] bg-[#F0F7FF] text-[#0063D6]"
                    : "border-[#E2E7F2] bg-white text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
                )
        )}
      >
        {label ? (
          <>
            {label}: <span className="font-mono font-normal">{selectedLabel ?? placeholder}</span>
          </>
        ) : (
          selectedLabel ?? placeholder
        )}
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          className="z-50 overflow-hidden rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <div className="border-b border-[#EDF0F7] p-2">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-[#E2E7F2] py-1.5 pl-6 pr-2 text-[13px] text-[#0B1533] outline-none placeholder:text-[#5F6A88] focus:border-[#007BFF]"
              />
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto p-1">
            <OptionRow label={placeholder} selected={value === ""} onClick={() => pick("")} />
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[11.5px] text-[#5F6A88]">No matches</div>
            ) : recentValues && recentValues.length > 0 && query.trim() === "" ? (
              (() => {
                const recent = recentValues
                  .map((v) => filtered.find((o) => o.value === v))
                  .filter((o): o is { value: string; label: string } => !!o);
                const others = filtered.filter((o) => !recentValues.includes(o.value));
                return (
                  <>
                    {recent.length > 0 && (
                      <>
                        <SectionLabel>Recently Accessed</SectionLabel>
                        {recent.map((o) => (
                          <OptionRow key={o.value} label={o.label} selected={o.value === value} onClick={() => pick(o.value)} />
                        ))}
                      </>
                    )}
                    {others.length > 0 && (
                      <>
                        <SectionLabel>Others</SectionLabel>
                        {others.map((o) => (
                          <OptionRow key={o.value} label={o.label} selected={o.value === value} onClick={() => pick(o.value)} />
                        ))}
                      </>
                    )}
                  </>
                );
              })()
            ) : (
              filtered.map((o) => (
                <OptionRow key={o.value} label={o.label} selected={o.value === value} onClick={() => pick(o.value)} />
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
