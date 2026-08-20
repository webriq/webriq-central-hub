"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Flat collapsible section for the New Task modal (task 274 follow-up) — deliberately NOT
// `AccordionCard` (`_accordion-card.tsx`). That component wraps its content in a bordered,
// padded, rounded card (`rounded-[14px] border ... shadow-...`, `p-[18px]` content padding) —
// correct for Task/Issue Detail's single top-level sections (task 257/270), but stacking three
// of those cards inside an already-bordered modal reads as "boxes within boxes" and doesn't
// match the reference the user pointed to (Zoho Projects' New Task "Task Information" section:
// a plain chevron+bold-label header directly on the page background, fields flowing below it
// with no enclosing border or padding box). This component is that flat pattern instead — no
// border, no background, no rounded card, no padding box around the group. Individual field
// controls (inputs, the description editor, the attachment dropzone) keep their own borders;
// only the group-level enclosure is removed.
//
// `AccordionCard` itself is intentionally left untouched — Task/Issue Detail's boxed-card look
// was an explicit design decision in those tasks and is unaffected by this modal-specific need.
export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 py-1 cursor-pointer bg-transparent border-none text-left"
      >
        <ChevronRight
          size={14}
          className={cn("text-[#5F6A88] shrink-0 transition-transform", open && "rotate-90")}
        />
        <span className="font-heading text-[13px] font-bold text-[#0B1533]">{title}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pt-3 flex flex-col gap-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
