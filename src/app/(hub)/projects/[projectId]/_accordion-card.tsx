"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Collapsible replacement for the local `Card` helper duplicated across
// `_issue-detail.tsx`/`_task-detail.tsx` (task 257, Requirement C) — same visual chrome
// (rounded-[14px] border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)]), header
// becomes a toggle button with a rotating chevron. Deliberately generic/`[projectId]`-level so a
// future Task Detail parity pass can reuse it without relocation.
export function AccordionCard({
  title,
  defaultOpen = true,
  noPadding = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  // Opt out of the default content padding for a child that needs to cover the full content
  // area edge-to-edge (e.g. Description's rich-text field) instead of sitting inset in a gutter.
  noPadding?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-[18px] py-3.5 border-b border-[#EDF0F7] cursor-pointer bg-transparent hover:bg-[#F9FAFD] transition-colors"
      >
        <ChevronRight
          size={14}
          className={cn("text-[#5F6A88] shrink-0 transition-transform", open && "rotate-90")}
        />
        <span className="font-heading text-[15px] font-semibold text-[#0B1533]">{title}</span>
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
            <div className={noPadding ? undefined : "p-[18px]"}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
