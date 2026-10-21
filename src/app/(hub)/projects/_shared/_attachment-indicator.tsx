"use client";

import { Paperclip } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// Task 459 — email-style "has attachments" cue. Read-only (design guide: chips never clickable).
// Each variant copies the icon/text size of its neighbours: the header's `TASK · id` chip, the
// list row's 13px action icons (one step smaller so it reads as metadata), the board card's
// 11px Calendar meta item.
const VARIANT = {
  chip: { className: "inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-[#5F6A88] bg-[#EDF0F7] px-2 py-0.5 rounded-[5px]", icon: 11 },
  row: { className: "inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums text-[#5F6A88] shrink-0", icon: 12 },
  card: { className: "inline-flex items-center gap-1 text-[11px] tabular-nums text-[#5F6A88]", icon: 11 },
} as const;

export function AttachmentIndicator({
  count,
  variant,
}: {
  count: number | null | undefined;
  variant: keyof typeof VARIANT;
}) {
  if (!count) return null;
  const label = `${count} attachment${count === 1 ? "" : "s"}`;
  const v = VARIANT[variant];
  const badge = (
    <span role="img" aria-label={label} className={v.className}>
      <Paperclip size={v.icon} aria-hidden />
      <span aria-hidden>{count}</span>
    </span>
  );
  if (variant === "chip") return badge;
  return (
    <Tooltip>
      <TooltipTrigger render={badge} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
