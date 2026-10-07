"use client";

import { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { PersonChip, RoleChip } from "./share-chips";
import { allCoveredByRoles, filterPeople, filterRoles, toggleRole, toggleUser } from "./share-picker-logic";
import { optionId, SharePickerMenu } from "./share-picker-menu";
import type { SharePerson, ShareRoleOption, ShareSelection } from "./types";
import { useAnchoredMenu } from "./use-anchored-menu";

type Props = {
  roles: ShareRoleOption[];
  people: SharePerson[];
  value: ShareSelection;
  onChange: (next: ShareSelection) => void;
  /** Roles / people that must never be offered (already shared, the owner, …). */
  excludeRoles?: string[];
  excludeUserIds?: string[];
  placeholder?: string;
  /** Muted pseudo-chip shown while nothing is selected (Project Files: "All roles"). */
  emptyLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label": string;
};

// Task 438 — the Share Picker: a searchable, multi-select combobox for people and roles. Controlled;
// the surface decides what a selection means (Drive/Notes batch-share it, Project Files applies it
// immediately). Rules live in share-picker-logic.ts, placement in use-anchored-menu.ts.
export function SharePicker({
  roles, people, value, onChange, excludeRoles = [], excludeUserIds = [], placeholder = "Add people or roles…",
  emptyLabel, disabled, autoFocus, "aria-label": ariaLabel,
}: Props) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const { anchorRef, menuRef, open, show, hide, placement, menuStyle } = useAnchoredMenu();

  const visibleRoles = useMemo(() => filterRoles(roles, query, excludeRoles), [roles, query, excludeRoles]);
  const visiblePeople = useMemo(() => filterPeople(people, roles, value, query, excludeUserIds), [people, roles, value, query, excludeUserIds]);
  const options = useMemo(
    () => [
      ...visibleRoles.map((r) => ({ id: optionId(listboxId, "role", r.value), kind: "role" as const, key: r.value })),
      ...visiblePeople.map((p) => ({ id: optionId(listboxId, "user", p.id), kind: "user" as const, key: p.id })),
    ],
    [visibleRoles, visiblePeople, listboxId],
  );
  const activeId = activeIndex >= 0 ? options[Math.min(activeIndex, options.length - 1)]?.id ?? null : null;

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const pickRole = (role: string) => { onChange(toggleRole(value, role, people)); setQuery(""); };
  const pickUser = (id: string) => { onChange(toggleUser(value, id)); setQuery(""); };

  const activate = (id: string | null) => {
    const option = options.find((o) => o.id === id);
    if (!option) return;
    if (option.kind === "role") pickRole(option.key);
    else pickUser(option.key);
  };

  const move = (delta: number) => {
    if (!open) { show(); return; }
    if (options.length === 0) return;
    const next = activeIndex < 0 ? (delta > 0 ? 0 : options.length - 1) : Math.min(options.length - 1, Math.max(0, activeIndex + delta));
    setActiveIndex(next);
    document.getElementById(options[next].id)?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { if (open && activeId) { e.preventDefault(); activate(activeId); } }
    else if (e.key === "Tab") hide();
    else if (e.key === "Backspace" && !query) {
      if (value.userIds.length > 0) onChange({ ...value, userIds: value.userIds.slice(0, -1) });
      else if (value.roles.length > 0) onChange({ ...value, roles: value.roles.slice(0, -1) });
    }
  };

  // Clicking anywhere in the field (but not on a chip's ×) focuses the input and opens the menu.
  const focusField = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || (e.target as HTMLElement).closest("button")) return;
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    e.currentTarget.querySelector("input")?.focus();
    show();
  };

  const empty = value.roles.length === 0 && value.userIds.length === 0;
  const roleLabel = (v: string) => roles.find((r) => r.value === v)?.label ?? v;

  return (
    <div
      ref={anchorRef}
      onMouseDown={focusField}
      className={cn(
        "flex max-h-28 min-h-11 w-full cursor-text flex-wrap content-start items-center gap-1.5 overflow-y-auto rounded-[10px] border bg-[#F4F6FB] px-2.5 py-1.5 transition-colors",
        open ? "border-[#007BFF] bg-white shadow-[0_0_0_3px_rgba(0,123,255,0.14)]" : "border-[#E2E7F2] hover:border-[#C7D2E8]",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {value.roles.map((r) => <RoleChip key={r} label={roleLabel(r)} disabled={disabled} onRemove={() => onChange({ ...value, roles: value.roles.filter((x) => x !== r) })} />)}
      {value.userIds.map((id) => (
        <PersonChip key={id} id={id} name={peopleById.get(id)?.name ?? "Unknown"} avatarUrl={peopleById.get(id)?.avatarUrl} disabled={disabled} onRemove={() => onChange({ ...value, userIds: value.userIds.filter((x) => x !== id) })} />
      ))}
      {empty && emptyLabel && !query ? (
        <span className="rounded-full border border-dashed border-[#C7D2E8] px-2.5 py-0.5 text-[12px] font-semibold text-[#5F6A88]">{emptyLabel}</span>
      ) : null}
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1); if (!open) show(); }}
        onFocus={() => { if (!disabled && !open) show(); }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={empty ? placeholder : "Add more…"}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeId ? activeId : undefined}
        className="min-w-[8ch] flex-1 border-none bg-transparent py-1 text-[13px] text-[#0B1533] outline-none placeholder:text-[#5F6A88]"
      />
      {open && typeof document !== "undefined"
        ? createPortal(
            // z-[70]: above modals (z-50) and ConfirmDialog (z-[60]); the menu is portaled so no ancestor's overflow clips it.
            <div
              ref={menuRef}
              style={menuStyle}
              data-share-picker-menu=""
              data-placement={placement ?? undefined}
              className="z-[70] flex flex-col overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
            >
              <SharePickerMenu
                listboxId={listboxId} roles={visibleRoles} allRoles={roles} people={visiblePeople} selection={value} query={query.trim()}
                activeId={activeId} noPeople={people.filter((p) => !p.inactive && !excludeUserIds.includes(p.id)).length === 0}
                everyoneCovered={allCoveredByRoles(people, value, excludeUserIds)}
                onToggleRole={pickRole} onToggleUser={pickUser} onHover={(id) => setActiveIndex(options.findIndex((o) => o.id === id))}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
