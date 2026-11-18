"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRightLeft, Check, ExternalLink, Link2, ListTree, MoreHorizontal, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "../_use-popover-position";
import { useCopyLink } from "../_copy-link-button";

const ITEM = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB] focus-visible:bg-[#F0F7FF] focus-visible:outline-none";

// Task 487 — row ⋯ menu: Open, Open in new tab, Copy link, Add subtask, Move to…, Delete (each only when allowed).
export function TaskRowMenu({ href, title, onAddSubtask, onMove, onDelete }: {
  href: string;
  title: string;
  onAddSubtask?: () => void;
  onMove?: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef, 184);
  const placed = pos !== null;
  const { copied, copy } = useCopyLink(href);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the first item once the panel is placed (keyboard users land inside the menu).
  useEffect(() => {
    if (open && placed) panelRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open, placed]);

  function close() { setOpen(false); triggerRef.current?.focus(); }
  function run(fn: () => void) { close(); fn(); }

  function onMenuKey(e: KeyboardEvent) {
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded text-[#5F6A88] hover:text-[#007BFF] hover:bg-[#EDF0F7] transition-colors shrink-0 cursor-pointer opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100 focus-visible:outline-2 focus-visible:outline-[#007BFF]"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          aria-label={`Actions for ${title}`}
          {...{ [POPOVER_ROOT_ATTR]: "" }}
          onKeyDown={onMenuKey}
          className="fixed z-40 min-w-46 rounded-[10px] border border-[#E2E7F2] bg-white py-1 shadow-lg"
          style={{ top: pos?.top, bottom: pos?.bottom, left: pos?.left, visibility: pos ? "visible" : "hidden" }}
        >
          <Link role="menuitem" href={href} className={ITEM} onClick={() => setOpen(false)}>
            <SquareArrowOutUpRight size={13} className="text-[#5F6A88]" aria-hidden /> Open task
          </Link>
          <a role="menuitem" href={href} target="_blank" rel="noopener noreferrer" className={ITEM} onClick={() => setOpen(false)}>
            <ExternalLink size={13} className="text-[#5F6A88]" aria-hidden /> Open in new tab
          </a>
          <button role="menuitem" type="button" className={ITEM} onClick={async () => { if (await copy()) setTimeout(() => setOpen(false), 700); }}>
            {copied ? <Check size={13} className="text-[#177E48]" aria-hidden /> : <Link2 size={13} className="text-[#5F6A88]" aria-hidden />}
            {copied ? "Link copied" : "Copy link"}
          </button>
          {onAddSubtask && (
            <button role="menuitem" type="button" className={ITEM} onClick={() => run(onAddSubtask)}>
              <ListTree size={13} className="text-[#5F6A88]" aria-hidden /> Add subtask
            </button>
          )}
          {onMove && (
            <button role="menuitem" type="button" className={ITEM} onClick={() => run(onMove)}>
              <ArrowRightLeft size={13} className="text-[#5F6A88]" aria-hidden /> Move to…
            </button>
          )}
          {onDelete && (
            <>
              <div className="my-1 h-px bg-[#EDF0F7]" />
              <button role="menuitem" type="button" className={`${ITEM} text-[#C0392B] hover:bg-[#FDE8E6]`} onClick={() => run(() => setConfirming(true))}>
                <Trash2 size={13} aria-hidden /> Delete task
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
      <ConfirmDialog
        open={confirming}
        title={`Delete "${title}"?`}
        body="Its subtasks are deleted too. This action is irreversible."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        confirmDisabled={deleting}
        onConfirm={async () => { setDeleting(true); await onDelete?.(); setDeleting(false); setConfirming(false); }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
