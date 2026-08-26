"use client";

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// Task 312 — shared icon-button tooltip wrapper for the Notes feature, extracted so every
// icon-only button across `_notes/*` (card actions, folder rail, color/collaborator pickers,
// editor modal, RTE toolbar) gets the same hover tooltip instead of relying on `aria-label`
// alone. Same shape as `_task-description-editor.tsx`'s local `IconTip`.
export function IconTip({ label, side = "top", children }: { label: string; side?: "top" | "bottom" | "left" | "right"; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
