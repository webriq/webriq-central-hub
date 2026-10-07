"use client";

import { useState } from "react";
import { Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Task 438 — chips for the Share Picker. Role = navy pill (selection is navy across the Hub),
// person = neutral pill with an initials avatar. Removable selection tokens, not status chips.

// Design System v2.0 avatar rotation — stable per person id, so a person keeps their colour everywhere.
const AVATAR_COLORS = ["bg-[#0063D6]", "bg-[#6A48E0]", "bg-[#0B8A93]", "bg-[#B85512]", "bg-[#177E48]", "bg-[#44508A]"];

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function PersonAvatar({ id, name, size = 20, avatarUrl }: { id: string; name: string; size?: 20 | 24 | 30; avatarUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  const dim = size === 30 ? "h-[30px] w-[30px] text-[11px]" : size === 24 ? "h-6 w-6 text-[10px]" : "h-5 w-5 text-[9px]";
  if (avatarUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- external profile photo URL (Supabase-auth provider), not an optimizable static asset.
    return <img src={avatarUrl} alt="" onError={() => setFailed(true)} className={cn("shrink-0 rounded-full bg-[#EDF0F7] object-cover", dim)} />;
  }
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", dim, AVATAR_COLORS[hash(id) % AVATAR_COLORS.length])}>
      {initialsOf(name)}
    </span>
  );
}

const removeBtn = "inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent transition-colors";

export function RoleChip({ label, onRemove, disabled }: { label: string; onRemove?: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#071133] py-1 pl-2.5 pr-1.5 text-[12px] font-semibold text-white">
      <Users size={11} aria-hidden className="shrink-0 text-[#5EB0FF]" />
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove ${label}`} className={cn(removeBtn, "text-[#B9C2E0] hover:bg-white/15 hover:text-white")}>
          <X size={11} />
        </button>
      ) : null}
    </span>
  );
}

export function PersonChip({ id, name, avatarUrl, onRemove, disabled }: { id: string; name: string; avatarUrl?: string | null; onRemove?: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#EDF0F7] py-0.5 pl-0.5 pr-1.5 text-[12px] font-semibold text-[#0B1533]">
      <PersonAvatar id={id} name={name} avatarUrl={avatarUrl} />
      <span className="truncate">{name}</span>
      {onRemove ? (
        <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove ${name}`} className={cn(removeBtn, "text-[#5F6A88] hover:bg-[#E2E7F2] hover:text-[#0B1533]")}>
          <X size={11} />
        </button>
      ) : null}
    </span>
  );
}
