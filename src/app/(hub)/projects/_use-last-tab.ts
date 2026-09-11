"use client";

import { useSyncExternalStore, useCallback } from "react";
import { DEFAULT_CLASSIFICATION_TAB, isProjectsTabId, type ProjectsTabId } from "./_classification-tabs";

// localStorage-backed "last visited Projects tab" — modeled on src/hooks/use-pm-settings.ts's
// module-level cache + useSyncExternalStore pattern (task 276). Replaces the old draggable
// two-pill "tab order" concept (task 279) now that the header shows only a single switch button
// (task 279 follow-up) — there's no longer an "order" to persist, just which tab to land on when
// bare `/projects` is visited. Storage key intentionally kept as "projects-v2-tab-order" — an old
// `{ order: [...] }` value is simply treated as unrecognized and falls back to the default rather
// than being migrated, since this is a low-stakes cosmetic preference, not user data.
//
// Task 361 widened ProjectsTabId from "v2" | "legacy" to one id per classification plus "legacy"
// (see _classification-tabs.ts). The key is kept again for the same reason: a stored `"v2"` from
// before this task fails isProjectsTabId and falls back to StackShift I.

export type { ProjectsTabId };

const STORAGE_KEY = "projects-v2-tab-order";
const DEFAULT_TAB: ProjectsTabId = DEFAULT_CLASSIFICATION_TAB;

function readLastTab(): ProjectsTabId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TAB;
    const parsed = JSON.parse(raw);
    return isProjectsTabId(parsed?.lastTab) ? parsed.lastTab : DEFAULT_TAB;
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
