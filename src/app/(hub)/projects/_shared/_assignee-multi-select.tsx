"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Task 351 — the one assignee control for the Tasks + Issues listings, the Issue Detail page,
// and (via `variant="field"`) the New Task / New Issue modals. Collapsed it's the compact
// display (first assignee avatar + name, then a "+N" pill, hover for the full name list);
// expanded (editable only) it's a searchable, multi-select popover with removable chips.
// Unassigned renders "Unassigned" + the placeholder avatar. `variant="field"` swaps the bare
// inline trigger for a full-width form-input box with a chevron (no explicit "Unassigned"
// option — an empty selection just means unassigned).
//
// Page-scoped duplicate of the avatar colour/initials derivation used across this feature area
// (`_list-view.tsx`, `_status-report-assignee-cell.tsx`, `_v2-listing/_avatar-stack.tsx`) —
// same established per-feature-area duplication convention those files' own comments set.

const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
const PLACEHOLDER_AVATAR = "/assets/user-thumbnail.png";

export type AssigneeMember = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

function initialsFor(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function colorFor(name: string | null | undefined): string {
  if (!name) return "#5F6A88";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
// Fixed Tailwind size classes (matching `_status-report-assignee-cell.tsx` / `_avatar-stack.tsx`);
// only `background` is inline, since it's one of six palette hexes keyed off the name.

const AVATAR_SIZE = {
  md: "w-6 h-6 text-[9px]",
  sm: "w-4 h-4 text-[8px]",
} as const;

function Avatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string | null;
  avatarUrl: string | null;
  size?: keyof typeof AVATAR_SIZE;
}) {
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold text-white shrink-0 overflow-hidden",
        AVATAR_SIZE[size]
      )}
      style={avatarUrl ? undefined : { background: colorFor(name) }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
        <img src={avatarUrl} alt={name ?? "Unnamed"} className="w-full h-full object-cover" />
      ) : (
        initialsFor(name)
      )}
    </div>
  );
}

// ─── AssigneeMultiSelect ──────────────────────────────────────────────────────

export function AssigneeMultiSelect({
  value,
  members,
  onChange,
  editable,
  nameById,
  headerLabel = "Project Users",
  variant = "cell",
}: {
  value: string[];
  members: AssigneeMember[];
  onChange: (ids: string[]) => void;
  editable: boolean;
  // Fallback name/avatar resolution for an assignee who has left the member pool (matches how
  // `_list-view.tsx` used `profilesById`). Optional — `members` alone covers the common case.
  nameById?: Record<string, { full_name: string | null; avatar_url: string | null }>;
  headerLabel?: string;
  // "cell" (default) — bare inline trigger for a table cell. "field" — full-width form-input
  // box with a chevron, for the New Task / New Issue modals.
  variant?: "cell" | "field";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Ref lives on an outer wrapper span (not the inner button) so the tooltip's `render` prop
  // never has to also carry a ref — matches how the rest of this feature area composes Tooltip.
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef, 248);

  const resolve = (id: string): { full_name: string | null; avatar_url: string | null } => {
    const m = members.find((x) => x.id === id);
    if (m) return { full_name: m.full_name, avatar_url: m.avatar_url };
    const f = nameById?.[id];
    return { full_name: f?.full_name ?? null, avatar_url: f?.avatar_url ?? null };
  };

  const selectedResolved = value.map((id) => ({ id, ...resolve(id) }));
  const names = selectedResolved.map((s) => s.full_name ?? "Unknown");

  function close() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.full_name ?? "").toLowerCase().includes(q));
  }, [members, query]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  // ── Collapsed display (shared by editable + read-only) ──
  const display = (
    <>
      {value.length === 0 ? (
        // The listing cell shows the placeholder-avatar + "Unassigned" (task 351 spec); the
        // form-field variant just shows muted prompt text, like any other empty form input.
        variant === "field" ? (
          <span className="text-[13px] text-[#5F6A88] truncate">Select assignees…</span>
        ) : (
          <span className="flex items-center gap-1.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny local placeholder asset */}
            <img src={PLACEHOLDER_AVATAR} alt="" className="w-6 h-6 rounded-full shrink-0" />
            <span className="text-[12px] text-[#94A0BE] truncate">Unassigned</span>
          </span>
        )
      ) : (
        <span className="flex items-center gap-1.5 min-w-0">
          <Avatar name={selectedResolved[0].full_name} avatarUrl={selectedResolved[0].avatar_url} />
          <span className="text-[12px] text-[#3A4565] truncate">{selectedResolved[0].full_name ?? "Unknown"}</span>
          {value.length > 1 && (
            <span className="text-[10px] font-semibold text-[#5F6A88] bg-[#EDF0F7] rounded-full px-1.5 py-0.5 leading-none shrink-0 tabular-nums">
              +{value.length - 1}
            </span>
          )}
        </span>
      )}
    </>
  );

  const toggleOpen = () => { setOpen((o) => !o); setQuery(""); };

  const triggerInner = variant === "field" ? (
    <button
      type="button"
      disabled={!editable}
      onClick={toggleOpen}
      aria-haspopup="listbox"
      aria-expanded={open}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors text-left",
        !editable
          ? "opacity-50 cursor-not-allowed border-[#E2E7F2] bg-[#F4F6FB]"
          : open
            ? "border-[#007BFF] bg-white ring-[3px] ring-[#007BFF]/[0.14] cursor-pointer"
            : "border-[#E2E7F2] bg-[#F4F6FB] hover:border-[#A8C6F5] cursor-pointer"
      )}
    >
      {display}
      <ChevronDown size={13} className={cn("shrink-0 text-[#5F6A88] transition-transform", open && "rotate-180")} />
    </button>
  ) : editable ? (
    <button
      type="button"
      onClick={toggleOpen}
      className="flex items-center min-w-0 max-w-full rounded-md px-1 -mx-1 py-0.5 cursor-pointer hover:bg-[#EDF0F7] transition-colors"
    >
      {display}
    </button>
  ) : (
    <span className="flex items-center min-w-0 max-w-full px-1 -mx-1 py-0.5 cursor-default">{display}</span>
  );

  return (
    <>
      <span ref={triggerRef} className={variant === "field" ? "block w-full" : "inline-flex min-w-0 max-w-full"}>
        {variant === "cell" && value.length > 1 ? (
          <Tooltip>
            <TooltipTrigger render={triggerInner} />
            <TooltipContent side="top">
              <span className="flex flex-col gap-0.5">
                {names.map((n, i) => (
                  <span key={`${n}-${i}`}>{n}</span>
                ))}
              </span>
            </TooltipContent>
          </Tooltip>
        ) : (
          triggerInner
        )}
      </span>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          className="z-[60] flex flex-col overflow-hidden rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <div className="px-3 py-2.5 border-b border-[#EDF0F7]">
            <p className="text-[11px] font-semibold text-[#5F6A88] uppercase tracking-wide">{headerLabel}</p>
          </div>
          <div className="border-b border-[#EDF0F7] p-2">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members…"
                className="w-full rounded-md border border-[#E2E7F2] py-1 pl-6 pr-2 text-[12px] text-[#0B1533] outline-none placeholder:text-[#5F6A88] focus:border-[#007BFF]"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-[11.5px] text-[#5F6A88]">{members.length === 0 ? "No members found" : "No matches"}</p>
            ) : (
              filtered.map((m) => {
                const isAssigned = value.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] text-left transition-colors hover:bg-[#F4F6FB] cursor-pointer",
                      isAssigned && "bg-[#F0F7FF]"
                    )}
                  >
                    <Avatar name={m.full_name} avatarUrl={m.avatar_url} />
                    <span className={cn("flex-1 truncate", isAssigned ? "font-medium text-[#0B1533]" : "text-[#3A4565]")}>
                      {m.full_name ?? "Unknown"}
                    </span>
                    {isAssigned && <Check size={13} className="text-[#007BFF] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          {selectedResolved.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-[#EDF0F7] p-2">
              {selectedResolved.map((s) => (
                <motion.span
                  key={s.id}
                  layout
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-[#F4F6FB] pl-1 pr-1.5 py-0.5 text-[11px] text-[#3A4565]"
                >
                  <Avatar name={s.full_name} avatarUrl={s.avatar_url} size="sm" />
                  <span className="truncate max-w-[120px]">{s.full_name ?? "Unknown"}</span>
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((x) => x !== s.id))}
                    aria-label={`Remove ${s.full_name ?? "assignee"}`}
                    className="text-[#94A0BE] hover:text-[#C0392B] cursor-pointer transition-colors"
                  >
                    <X size={12} />
                  </button>
                </motion.span>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
