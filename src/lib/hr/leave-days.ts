// Pure leave-day math (A8): working days are Mon–Fri minus holidays; a half-day request is 0.5.
import { addDays, eachDay, isWeekend } from "./dates";

export interface DayRange {
  start: string;
  end: string;
  halfDay?: boolean;
}

/** Working days in [start, end], excluding weekends and the given holiday dates. */
export function countLeaveDays({ start, end, halfDay }: DayRange, holidays: ReadonlySet<string>): number {
  if (end < start) return 0;
  const days = eachDay(start, end).filter((d) => !isWeekend(d) && !holidays.has(d)).length;
  return halfDay && start === end ? days * 0.5 : days;
}

/** Working days of a request that fall inside [periodStart, periodEnd] (clips at the edges). */
export function countLeaveDaysWithin(
  req: DayRange,
  periodStart: string,
  periodEnd: string,
  holidays: ReadonlySet<string>
): number {
  const start = req.start > periodStart ? req.start : periodStart;
  const end = req.end < periodEnd ? req.end : periodEnd;
  return countLeaveDays({ start, end, halfDay: req.halfDay }, holidays);
}

/** First working day after `end` — the "Back Mon, 12 Oct" date. */
export function returnDate(end: string, holidays: ReadonlySet<string>): string {
  let d = addDays(end, 1);
  while (isWeekend(d) || holidays.has(d)) d = addDays(d, 1);
  return d;
}
