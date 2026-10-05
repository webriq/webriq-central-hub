"use client";

import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Health } from "@/lib/programme/deliverable-health";

export type StatusFilter = "all" | "overdue" | "in-progress" | "done";
export type TimelineFilters = { status: StatusFilter; owner: string; q: string };

export const EMPTY_FILTERS: TimelineFilters = { status: "all", owner: "", q: "" };

const STATUSES: StatusFilter[] = ["all", "overdue", "in-progress", "done"];

export const filtersActive = (f: TimelineFilters) => f.status !== "all" || f.owner !== "" || f.q.trim() !== "";

// What a card exposes to the filters (StackShift deliverable or generic tasklist).
export type FilterItem = { name: string; owner?: string; health: Health; percentage: number };

export function matchesFilters(f: TimelineFilters, item: FilterItem): boolean {
  if (f.status === "overdue" && item.health !== "overdue") return false;
  if (f.status === "in-progress" && !(item.percentage > 0 && item.percentage < 100)) return false;
  if (f.status === "done" && item.percentage < 100) return false;
  if (f.owner && !(item.owner ?? "").toLowerCase().split("+").some((n) => n.trim() === f.owner.toLowerCase())) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !item.name.toLowerCase().includes(q)) return false;
  return true;
}

// Filter state mirrored into ?status=&owner=&q= with replaceState (the Timeline page is
// force-dynamic, so router.replace would refetch on every keystroke — same approach as the Files
// tab, task 359). Other params (e.g. the wizard's ?phase=&deliverable=) are preserved.
export function useTimelineFilters() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<TimelineFilters>(() => {
    const status = params.get("status") as StatusFilter | null;
    return {
      status: status && STATUSES.includes(status) ? status : "all",
      owner: params.get("owner") ?? "",
      q: params.get("q") ?? "",
    };
  });

  // The ref holds the latest value so the URL write happens outside the state updater (updaters
  // must stay pure — StrictMode runs them twice).
  const latest = useRef(filters);
  const update = useCallback((patch: Partial<TimelineFilters>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setFilters(next);
    const url = new URL(window.location.href);
    const sync = (key: string, value: string) => (value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    sync("status", next.status === "all" ? "" : next.status);
    sync("owner", next.owner);
    sync("q", next.q.trim());
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const clear = useCallback(() => update(EMPTY_FILTERS), [update]);
  return { filters, update, clear };
}
