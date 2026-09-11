"use client";

import { useRef, useState } from "react";
import { MoreVertical, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { textPrimary, IconTip } from "./_shared-ui";

// Task 359 — extracted verbatim from _file-tile.tsx (which was 423 lines, over the hard limit in
// nextjs-file-length-best-practices.md). One action list per item feeds BOTH the kebab dropdown
// here and the right-click context menu in _files-tab.tsx, so the two can never drift apart.
export type ItemAction = { label: string; icon: typeof Pencil; onClick: () => void; danger?: boolean; disabled?: boolean };

// Menu width must match the `w-44` class on both floating-menu containers below and in
// _files-tab.tsx's right-click context menu. Before this was a shared constant the two menus
// independently hand-copied this arithmetic and had already drifted once (160px/w-40 here vs.
// 176px/w-44 there) — a single source removes that failure mode.
const MENU_WIDTH = 176;
const MENU_ITEM_HEIGHT = 32;
const MENU_EDGE_MARGIN = 8;

// Clamps a floating menu's top-left corner so it stays fully inside the viewport, given the
// point it should anchor to and how many items it holds. Shared by the kebab (ActionsMenu,
// below) and the right-click context menu in _files-tab.tsx.
export function clampMenuPosition(anchor: { x: number; y: number }, itemCount: number): { x: number; y: number } {
  const menuHeight = itemCount * MENU_ITEM_HEIGHT + MENU_EDGE_MARGIN;
  return {
    x: Math.min(anchor.x, window.innerWidth - MENU_WIDTH - MENU_EDGE_MARGIN),
    y: Math.min(anchor.y, window.innerHeight - menuHeight - MENU_EDGE_MARGIN),
  };
}

// Shared kebab dropdown — plain items, no per-item tooltips (matches
// ../_onboarding-wizard.tsx's renderFileMenuItems/renderFolderMenuItems exactly; only the kebab
// trigger button itself carries a tooltip, "Actions"). Right-click on the tile opens the same
// `actions` array in a floating menu at the cursor (wired via `onContextMenu` up in
// _files-tab.tsx) — one action list feeds both triggers so they can't drift out of sync.
//
// Positioned via `position: fixed` computed from the trigger button's own rect (same technique
// as _files-tab.tsx's right-click context menu) instead of `absolute` anchored to the row —
// anchoring to the row let a later list row (plain z-index:auto, later in DOM order) paint over
// the menu in some browsers/layouts. Fixed positioning escapes that entirely. Rect is read from
// a ref, not `e.currentTarget` — IconTip's Tooltip wrapper can null out the synthetic event's
// currentTarget by the time this handler runs (native DOM behavior once an event finishes
// dispatching), which silently threw and left only the hover tooltip visible, never opening
// the menu.
export function ActionsMenu({ actions }: { actions: ItemAction[] }) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuPos) { setMenuPos(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos(clampMenuPosition({ x: rect.right - MENU_WIDTH, y: rect.bottom + 4 }, actions.length));
  };

  return (
    <div className="relative">
      <IconTip label="Actions">
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-label="Actions"
          className="p-1.5 rounded-md border-none bg-transparent cursor-pointer text-[#5F6A88] hover:bg-[#EDF0F7]"
        >
          <MoreVertical size={13} />
        </button>
      </IconTip>
      {menuPos ? (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuPos(null); }} />
          <div
            className="fixed z-50 w-44 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1 flex flex-col"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <ActionsMenuItems actions={actions} onDone={() => setMenuPos(null)} />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ActionsMenuItems({ actions, onDone }: { actions: ItemAction[]; onDone: () => void }) {
  return (
    <>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          disabled={a.disabled}
          onClick={() => { onDone(); a.onClick(); }}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-[12px] text-left cursor-pointer border-none bg-transparent w-full disabled:opacity-40 disabled:cursor-not-allowed",
            a.danger ? "text-[#C0392B] hover:bg-[#FDE8E6]" : cn(textPrimary, "hover:bg-[#EDF0F7]")
          )}
        >
          <a.icon size={13} /> {a.label}
        </button>
      ))}
    </>
  );
}
