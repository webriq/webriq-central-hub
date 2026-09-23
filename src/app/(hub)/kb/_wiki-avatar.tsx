"use client";

import { cn } from "@/lib/utils";
import type { WikiContributor } from "@/types/wiki";

// Task 399 (Owner-avatar follow-up) — shared avatar circle for a WikiContributor, used by the
// info panel's Owner row + Contributors stack and the doc panel's "Edited by" meta row. Native
// `title` attribute for the hover tooltip, matching the Contributors stack's original (task 395)
// convention — kept as the single tooltip mechanism across this panel rather than introducing
// the app's Base UI Tooltip component alongside it.

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

export function WikiAvatar({
  contributor,
  size = "md",
  overlap = false,
}: {
  contributor: WikiContributor;
  size?: "sm" | "md";
  overlap?: boolean;
}) {
  const sizeClass = size === "sm" ? "w-4 h-4 text-[8px]" : "w-6 h-6 text-[9px]";
  return (
    <div
      title={contributor.name}
      className={cn(
        "rounded-full flex items-center justify-center font-bold text-white shrink-0",
        sizeClass,
        overlap && "border-2 border-white -ml-1.5 first:ml-0"
      )}
      style={{ background: avatarColorFor(contributor.id) }}
    >
      {initialsFor(contributor.name)}
    </div>
  );
}
