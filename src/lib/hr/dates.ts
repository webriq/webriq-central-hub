// Date-only helpers for the HR module. Every date is a "YYYY-MM-DD" string and all arithmetic is
// done in UTC on those strings, so no local-timezone or DST shift can move a calendar day.
// Never call `new Date("YYYY-MM-DD")` in HR code — it parses as UTC midnight and renders a day off.

export const HR_TIMEZONE = process.env.HR_TIMEZONE || "Asia/Manila";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MS_DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

function toUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function isYmd(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return fromUtcMs(toUtcMs(value)) === value;
}

export function addDays(ymd: string, n: number): string {
  return fromUtcMs(toUtcMs(ymd) + n * MS_DAY);
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(toUtcMs(ymd)).getUTCDay();
}

export function isWeekend(ymd: string): boolean {
  const d = weekdayOf(ymd);
  return d === 0 || d === 6;
}

/** Every date from `from` to `to`, inclusive. Empty if `to` precedes `from`. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Today's calendar date in the company timezone (not the server's). */
export function todayInTz(tz: string = HR_TIMEZONE, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Monday of the week containing `ymd` (the work week is Mon–Fri). */
export function startOfWeek(ymd: string): string {
  const offset = (weekdayOf(ymd) + 6) % 7;
  return addDays(ymd, -offset);
}

export function weekDays(ymd: string): string[] {
  const start = startOfWeek(ymd);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function startOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function endOfMonth(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return fromUtcMs(Date.UTC(y, m, 0));
}

export function addMonths(ymd: string, n: number): string {
  const [y, m] = ymd.split("-").map(Number);
  return `${fromUtcMs(Date.UTC(y, m - 1 + n, 1)).slice(0, 7)}-01`;
}

/** Weeks (Mon-first) covering the month containing `ymd`, padded with neighbouring days. */
export function monthGrid(ymd: string): string[][] {
  const first = startOfMonth(ymd);
  const last = endOfMonth(ymd);
  const days = eachDay(startOfWeek(first), addDays(startOfWeek(last), 6));
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** `30-Nov-2026, Mon` — the format staff already see in Zoho People. */
export function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${pad(d)}-${MONTHS[m - 1]}-${y}, ${WEEKDAYS[weekdayOf(ymd)]}`;
}

export function formatShort(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${pad(d)} ${MONTHS[m - 1]}`;
}

export function formatRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} → ${formatDate(end)}`;
}

export function monthLabel(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function weekdayShort(ymd: string): string {
  return WEEKDAYS[weekdayOf(ymd)];
}

export function dayOfMonth(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

/** "today", "tomorrow", "in 12 days", "3 days ago" — relative to `today`. */
export function relativeDays(ymd: string, today: string): string {
  const n = diffDays(today, ymd);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
