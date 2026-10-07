import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } from "@/lib/hr/dates";

export type CalendarMode = "month" | "week" | "day";

/** Date window the view needs data for (month includes the neighbouring days its grid shows). */
export function rangeFor(mode: CalendarMode, anchor: string): { from: string; to: string } {
  if (mode === "day") return { from: anchor, to: anchor };
  if (mode === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  return { from: startOfWeek(startOfMonth(anchor)), to: addDays(startOfWeek(endOfMonth(anchor)), 6) };
}

export function shiftAnchor(mode: CalendarMode, anchor: string, dir: 1 | -1): string {
  if (mode === "day") return addDays(anchor, dir);
  if (mode === "week") return addDays(anchor, 7 * dir);
  return addMonths(anchor, dir);
}
