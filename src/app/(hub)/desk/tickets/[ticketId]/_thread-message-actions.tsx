"use client";

import { useState, useRef } from "react";
import { MoreVertical, ClipboardList, Bug } from "lucide-react";
import type { MessageItem } from "./_conversation-thread";
import { ThreadToProjectModal } from "./_thread-to-project-modal";

// Task 333 — kebab menu on customer-authored ticket thread messages. "Create Task" / "File an
// Issue" both open the same project-picker gate (ThreadToProjectModal), which hands off to the
// Projects New Task / New Issue modal with the ticket subject + this message pre-filled.
// Rendered only for authorType === "client" messages (see _conversation-thread.tsx).
//
// The menu is `fixed`-positioned from the trigger's rect (same pattern as
// _v2-listing/_portfolio-card-menu.tsx) so the conversation card's `overflow-hidden` can't
// clip it when the message sits near the bottom of the list.

const MENU_WIDTH = 180;

export function ThreadMessageActions({ subject, message }: { subject: string; message: MessageItem }) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [modal, setModal] = useState<"task" | "issue" | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggleMenu() {
    if (menuPos) {
      setMenuPos(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({
      x: Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - 120),
    });
  }

  function pick(mode: "task" | "issue") {
    setMenuPos(null);
    setModal(mode);
  }

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        aria-label="Message actions"
        aria-expanded={menuPos !== null}
        className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] transition-colors"
      >
        <MoreVertical size={14} />
      </button>

      {menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuPos(null)} />
          <div
            className="fixed z-50 overflow-hidden rounded-[10px] border border-[#E2E7F2] bg-white py-1 shadow-[0_16px_40px_-12px_rgba(11,21,51,0.28)] ring-1 ring-[#0B1533]/[0.04]"
            style={{ left: menuPos.x, top: menuPos.y, width: MENU_WIDTH }}
          >
            <button
              type="button"
              onClick={() => pick("task")}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-medium text-[#3A4565] hover:bg-[#F0F6FF] hover:text-[#0B1533] transition-colors"
            >
              <ClipboardList size={14} className="text-[#5F6A88]" /> Create Task
            </button>
            <button
              type="button"
              onClick={() => pick("issue")}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-medium text-[#3A4565] hover:bg-[#F0F6FF] hover:text-[#0B1533] transition-colors"
            >
              <Bug size={14} className="text-[#5F6A88]" /> File an Issue
            </button>
          </div>
        </>
      )}

      {modal && (
        <ThreadToProjectModal
          mode={modal}
          subject={subject}
          message={message}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
