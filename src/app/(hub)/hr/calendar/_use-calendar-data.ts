"use client";

import { useEffect, useState } from "react";
import type { CalendarLeave, HolidayRow } from "@/lib/hr/types";

interface Data { leaves: CalendarLeave[]; holidays: HolidayRow[] }
interface Range { from: string; to: string }

/** Fetches approved leaves + holidays for a window, caching by range so flipping back is instant. */
export function useCalendarData(range: Range, initial: { range: Range; data: Data }) {
  const [cache] = useState(() => new Map<string, Data>([[`${initial.range.from}|${initial.range.to}`, initial.data]]));
  const key = `${range.from}|${range.to}`;
  const [, setVersion] = useState(0); // bumps when a fetch lands, so render re-reads the cache
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    if (cache.has(key)) return; // already cached — render reads it directly
    let live = true;
    fetch(`/api/hr/calendar?from=${range.from}&to=${range.to}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't load the calendar.");
        return j as Data;
      })
      .then((d) => {
        cache.set(key, d);
        if (live) setVersion((v) => v + 1);
      })
      .catch((e: Error) => live && setFailure({ key, message: e.message }));
    return () => { live = false; };
  }, [cache, key, range.from, range.to]);

  const hit = cache.get(key);
  const loading = !hit && failure?.key !== key;
  return { leaves: hit?.leaves ?? [], holidays: hit?.holidays ?? [], loading, error: failure?.key === key ? failure.message : null };
}
