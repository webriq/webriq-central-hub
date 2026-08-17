"use client";

import type { ReactElement } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { PhaseAssigneeMember } from "./_status-report-types";

// Mirrors _onboarding-list.tsx's AvatarStack/AvatarTip pattern (colors, overlap, hover spring) —
// duplicated rather than imported, matching that file's own stated convention: these two features
// are otherwise unrelated, and it doesn't export the pieces (page-scoped UI).
const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
const MAX_VISIBLE_AVATARS = 4;

function initialsFor(name: string): string {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function colorFor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function AvatarTip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

// Real assignees render as an avatar stack with tooltip + hover-lift, same as the Portfolio
// Tracker list. No assignee yet -> an italic, muted placeholder naming the team that
// conventionally owns this phase (task 221 follow-up).
export function AssigneeCell({ members, placeholder }: { members: PhaseAssigneeMember[]; placeholder: string }) {
  if (members.length === 0) {
    return <span className="text-[12px] italic text-[#5F6A88]">{placeholder}</span>;
  }

  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = members.length - visible.length;

  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <AvatarTip key={m.id} label={`${m.fullName} (${m.roleLabel})`}>
          <motion.div
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0 cursor-default",
              i > 0 && "-ml-2"
            )}
            style={{ background: colorFor(m.fullName) }}
            whileHover={{ y: -4, zIndex: 10 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            {initialsFor(m.fullName)}
          </motion.div>
        </AvatarTip>
      ))}
      {overflow > 0 && (
        <div className="w-6 h-6 -ml-2 rounded-full flex items-center justify-center text-[9px] font-semibold ring-2 ring-white shrink-0 text-[#5F6A88] bg-[#EDF0F7]">
          +{overflow}
        </div>
      )}
    </div>
  );
}
