"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// Mirrors OwnerChip's initials/color derivation (src/app/(hub)/projects/_pm-shared.tsx) for
// visual consistency with the Projects module's assignee chips — reimplemented locally (not
// imported) since it needs overlap + "+N" overflow behavior OwnerChip doesn't have, and
// Onboarding/Projects are otherwise unrelated feature areas (page-scoped UI convention).
const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
// Only collapse into a "+N" overflow badge past 5 visible avatars — below that, show everyone.
const MAX_VISIBLE_AVATARS = 5;

function initialsFor(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function colorFor(name: string | null): string {
  if (!name) return "#5F6A88";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// Real shadcn/Base UI Tooltip (not a native `title` attribute) for the member's name — mirrors
// `_onboarding-wizard.tsx`'s `IconTip` pattern (a thin wrapper around Tooltip/TooltipTrigger's
// `render` prop) rather than duplicating the 3-component composition at every avatar.
function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function AvatarStack({ members }: { members: { id: string; full_name: string | null; avatar_url: string | null }[] }) {
  if (members.length === 0) return null;

  // A single member has nothing to lift above — tooltip only, no hover animation.
  if (members.length === 1) {
    const m = members[0];
    return (
      <AvatarTip label={m.full_name ?? "Unnamed"}>
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0 overflow-hidden"
          style={m.avatar_url ? undefined : { background: colorFor(m.full_name) }}
        >
          {m.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
            <img src={m.avatar_url} alt={m.full_name ?? "Unnamed"} className="w-full h-full object-cover" />
          ) : (
            initialsFor(m.full_name)
          )}
        </div>
      </AvatarTip>
    );
  }

  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <AvatarTip key={m.id} label={m.full_name ?? "Unnamed"}>
          <motion.div
            className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0 cursor-default overflow-hidden", i > 0 && "-ml-2")}
            style={m.avatar_url ? undefined : { background: colorFor(m.full_name) }}
            whileHover={{ y: -4, zIndex: 10 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            {m.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
              <img src={m.avatar_url} alt={m.full_name ?? "Unnamed"} className="w-full h-full object-cover" />
            ) : (
              initialsFor(m.full_name)
            )}
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
