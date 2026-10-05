"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DAY_WIDTH, dayWidthFor, type GanttZoom } from "./_gantt-shared";

const STORAGE_KEY = "timeline-zoom";

type ZoomValue = { zoom: GanttZoom; dayWidth: number; setZoom: (z: GanttZoom) => void };

const GanttZoomContext = createContext<ZoomValue>({ zoom: "day", dayWidth: DAY_WIDTH, setZoom: () => {} });

// Zoom lives in a tiny external store backed by localStorage so the saved choice is read without a
// post-mount effect; the server snapshot is always "day" (React re-renders on hydration if the
// saved value differs). `override` keeps the toggle working when storage is unavailable.
const listeners = new Set<() => void>();
let override: GanttZoom | null = null;

function readZoom(): GanttZoom {
  if (override) return override;
  try {
    return localStorage.getItem(STORAGE_KEY) === "week" ? "week" : "day";
  } catch {
    return "day";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Task 422 — Day/Week zoom shared by every Timeline grid part (header, lanes, cards, today marker,
// drag math). Persisted per browser.
export function GanttZoomProvider({ children }: { children: ReactNode }) {
  const zoom = useSyncExternalStore(subscribe, readZoom, () => "day" as GanttZoom);

  const setZoom = useCallback((z: GanttZoom) => {
    override = z;
    try { localStorage.setItem(STORAGE_KEY, z); } catch { /* not persisted */ }
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo(() => ({ zoom, dayWidth: dayWidthFor(zoom), setZoom }), [zoom, setZoom]);
  return <GanttZoomContext.Provider value={value}>{children}</GanttZoomContext.Provider>;
}

export const useGanttZoom = () => useContext(GanttZoomContext);
