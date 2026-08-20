"use client";

import { useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// Kebab actions menu for the task/issue Attachments grid tiles (task 273 follow-up) — same
// fixed-positioning-from-trigger-rect technique as the Onboarding Workspace's
// portfolio-tracker/[projectId]/onboarding-workspace/_file-tile.tsx ActionsMenu, which exists to
// avoid a documented bug there: `position: absolute` anchored to the tile let a later grid tile
// (plain z-index:auto, later in DOM order) paint over an open menu in some browsers/layouts.
// `fixed` positioning computed from the trigger's own rect escapes that entirely.
export type AttachmentAction = { label: string; icon: typeof MoreVertical; onClick: () => void; danger?: boolean };

export function AttachmentActionsMenu({ actions }: { actions: AttachmentAction[] }) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (menuPos) { setMenuPos(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 160;
    const menuHeight = actions.length * 32 + 8;
    setMenuPos({
      x: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8),
    });
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Actions"
        className="p-1.5 rounded-md border-none bg-white/90 cursor-pointer text-[#5F6A88] hover:bg-white hover:text-[#0B1533] transition-colors"
      >
        <MoreVertical size={13} />
      </button>
      {menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuPos(null); }} />
          <div
            className="fixed z-50 w-40 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1 flex flex-col"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => { setMenuPos(null); a.onClick(); }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-[12px] text-left cursor-pointer border-none bg-transparent w-full",
                  a.danger ? "text-[#C0392B] hover:bg-[#FDE8E6]" : "text-[#3A4565] hover:bg-[#EDF0F7]"
                )}
              >
                <a.icon size={13} /> {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
