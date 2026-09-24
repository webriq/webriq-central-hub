"use client";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { WikiContributor } from "@/types/wiki";

// Task 399 (Owner-avatar follow-up) — shared avatar circle for a WikiContributor, used by the
// info panel's Owner row + Contributors stack, the doc panel's "Edited by" meta row, the history
// panel and the presence bar. Task 403 — shows the `profiles.avatar_url` photo (initials fallback)
// with a Base UI Tooltip for the full name, mirroring the Projects `AvatarStack`/`AvatarTip`
// pattern (src/app/(hub)/projects/_v2-listing/_avatar-stack.tsx), reimplemented locally per the
// page-scoped UI convention.

const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];

function avatarColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function WikiAvatar({
  contributor,
  size = "md",
  overlap = false,
}: {
  contributor: WikiContributor;
  size?: "sm" | "md";
  overlap?: boolean;
}) {
  const sizeClass = size === "sm" ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[11px]";
  const avatarUrl = contributor.avatarUrl;
  return (
    <AvatarTip label={contributor.name}>
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-bold text-white shrink-0 overflow-hidden cursor-default",
          sizeClass,
          overlap && "ring-2 ring-white -ml-2 first:ml-0"
        )}
        style={avatarUrl ? undefined : { background: avatarColorFor(contributor.id) }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
          <img src={avatarUrl} alt={contributor.name} className="w-full h-full object-cover" />
        ) : (
          initialsFor(contributor.name)
        )}
      </div>
    </AvatarTip>
  );
}
