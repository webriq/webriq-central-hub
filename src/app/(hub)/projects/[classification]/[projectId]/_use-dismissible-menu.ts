"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

// Task 422 — shared behaviour for the Jump-to-phase dropdowns: Escape and outside-mousedown close it
// (Escape returns focus to the trigger), ArrowUp/Down move between enabled `[role=menuitem]`s.
export function useDismissibleMenu(open: boolean, setOpen: (v: boolean) => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  function items(): HTMLElement[] {
    return [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
  }

  function moveFocus(dir: 1 | -1) {
    const list = items();
    if (list.length === 0) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    list[(i + dir + list.length) % list.length].focus();
  }

  // On the trigger: ArrowDown opens the menu (if closed) and focuses the first item.
  function onTriggerKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();
    if (!open) setOpen(true);
    requestAnimationFrame(() => items()[0]?.focus());
  }

  function onMenuKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(-1); }
  }

  return { rootRef, triggerRef, onTriggerKeyDown, onMenuKeyDown };
}
