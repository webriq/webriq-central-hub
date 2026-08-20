"use client";

import { useSyncExternalStore, useCallback } from "react";

// localStorage-backed "last visited Projects tab" — modeled on src/hooks/use-pm-settings.ts's
// module-level cache + useSyncExternalStore pattern (task 276). Replaces the old draggable
// two-pill "tab order" concept (task 279) now that the header shows only a single switch button
// (task 279 follow-up) — there's no longer an "order" to persist, just which tab to land on when
// bare `/projects` is visited. Storage key intentionally kept as "projects-v2-tab-order" — an old
// `{ order: [...] }` value is simply treated as unrecognized and falls back to the default rather
// than being migrated, since this is a low-stakes cosmetic preference, not user data.

export type ProjectsTabId = "v2" | "legacy";

const STORAGE_KEY = "projects-v2-tab-order";
const DEFAULT_TAB: ProjectsTabId = "v2";

function isValidTab(v: unknown): v is ProjectsTabId {
  return v === "v2" || v === "legacy";
}

function readLastTab(): ProjectsTabId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TAB;
    const parsed = JSON.parse(raw);
    return isValidTab(parsed?.lastTab) ? parsed.lastTab : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

function writeLastTab(tab: ProjectsTabId) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastTab: tab }));
}

// Module-level store — browser-only (this file is "use client")
let _cache: ProjectsTabId | null = null;
let _listeners: (() => void)[] = [];

function getSnapshot(): ProjectsTabId {
  if (_cache === null) _cache = readLastTab();
  return _cache;
}

function getServerSnapshot(): ProjectsTabId {
  return DEFAULT_TAB;
}

function subscribe(listener: () => void): () => void {
  _listeners = [..._listeners, listener];
  return () => { _listeners = _listeners.filter((l) => l !== listener); };
}

export function useLastTab() {
  const lastTab = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLastTab = useCallback((tab: ProjectsTabId) => {
    if (tab === _cache) return;
    _cache = tab;
    writeLastTab(tab);
    _listeners.forEach((l) => l());
  }, []);

  return { lastTab, setLastTab };
}
