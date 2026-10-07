"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

// Task 438 — open/close + placement for a menu anchored to a field. The menu is rendered in a portal
// with `position: fixed`, so an ancestor's `overflow` (dialogs, scroll panels) can never clip it.
//
// Placement is decided ONCE per open ("detect on first click"): after the menu has rendered
// invisibly, its real content height is compared with the space below the field — it opens upward
// only when it would not fit below AND there is more room above. The choice is then locked for that
// open; coordinates keep following the field on scroll/resize, and max-height is clamped to the side
// that was chosen so nothing is ever cut off by the viewport.

// Marks a Share Picker menu so an enclosing anchored panel can tell nested menus from outside clicks.
export const NESTED_MENU = "[data-share-picker-menu]";

const GAP = 6;
const EDGE = 12;
const MAX_HEIGHT = 320;
const MIN_HEIGHT = 160;

type Rect = { left: number; width: number; top: number; bottom: number };
type Placement = "down" | "up";

type Options = {
  /** Fixed menu width in px; defaults to the anchor's width (min 280). */
  width?: number;
  /** Which edge of the anchor the menu lines up with. */
  align?: "start" | "end";
};

export function useAnchoredMenu({ width, align = "start" }: Options = {}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const measure = useCallback(() => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, width: r.width, top: r.top, bottom: r.bottom });
  }, []);

  const show = useCallback(() => { measure(); setPlacement(null); setOpen(true); }, [measure]);
  const hide = useCallback(() => setOpen(false), []);

  // First paint of an open menu is invisible; pick the side from its natural content height.
  useLayoutEffect(() => {
    if (!open || placement !== null || !rect || !menuRef.current) return;
    const needed = Math.min(menuRef.current.scrollHeight, MAX_HEIGHT);
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    setPlacement(below < needed && above > below ? "up" : "down");
  }, [open, placement, rect]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const sync = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Element;
      // A picker menu nested inside this one (portaled elsewhere) counts as inside.
      if (!anchorRef.current?.contains(t) && !menuRef.current?.contains(t) && !t.closest?.(NESTED_MENU)) hide();
    };
    // Capture phase so Esc closes only the menu — a parent dialog's own Esc handler never sees it.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A nested picker menu is open and owns this Esc; let it close first.
      if (document.querySelector(NESTED_MENU) && !menuRef.current?.matches(NESTED_MENU)) return;
      e.preventDefault();
      e.stopPropagation();
      hide();
    };
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, measure, hide]);

  let menuStyle: CSSProperties | undefined;
  if (open && rect) {
    const space = placement === "up" ? rect.top - GAP - EDGE : window.innerHeight - rect.bottom - GAP - EDGE;
    const w = width ?? Math.max(rect.width, 280);
    menuStyle = {
      position: "fixed",
      left: align === "end" ? Math.max(EDGE, rect.left + rect.width - w) : rect.left,
      width: w,
      // Until a side is chosen the menu renders at its natural (≤ MAX) height so it can be measured.
      maxHeight: placement ? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, space)) : MAX_HEIGHT,
      ...(placement === "up" ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      // Invisible (but measurable) until the side has been chosen.
      visibility: placement ? "visible" : "hidden",
    };
  }

  return { anchorRef, menuRef, open, show, hide, placement, menuStyle };
}
