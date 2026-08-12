// Shared types + period-math for the dedicated Time Logs page (task 226). Split out of the
// content/table/picker components so each of those stays under the file-length guideline and
// none of them re-derives the same date math independently.

export type EntryKind = "task" | "issue" | "general";

export type TimeLogEntry = {
  id: string;
  task_id: string | null;
  issue_id: string | null;
  entry_kind: EntryKind;
  project_id: string;
  project_name: string;
  project_public_id: string | null;
  task_title: string;
  task_display_id: string | null;
  issue_display_id: string | null;
  log_title: string;
  date_logged: string;
  hours: number;
  note: string | null;
  source: "timer" | "manual";
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  display_name: string;
  employee_id: string | null;
  can_edit: boolean;
};

export type ProjectOption = { id: string; project_id: string; name: string };

export type PeriodMode = "day" | "week" | "month" | "range";

export type PeriodValue =
  | { mode: "day"; date: Date }
  | { mode: "week"; date: Date } // any day within the Mon–Sun week
  | { mode: "month"; year: number; month: number } // month is 0-11
  | { mode: "range"; from: Date; to: Date };

export function defaultPeriod(): PeriodValue {
  return { mode: "day", date: new Date() };
}

// Local-calendar-date formatting (not toISOString, which shifts to UTC and can land on the
// wrong day depending on the browser's timezone) — matches the local-date construction pattern
// already used by `_time-log-form.tsx`'s `combineDateTime`.
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

// Counterpart to toISODate — parses "YYYY-MM-DD" into a local-timezone Date rather than
// `new Date(string)`, which parses as UTC midnight and can land on the wrong local day.
export function fromISODate(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Task 230 — shared local-time helpers, extracted here after being independently duplicated in
// both `_time-log-entry-modal.tsx` and `_time-logs-table.tsx` (both need "current wall-clock HH:mm
// for future-time capping", "combine a YYYY-MM-DD date + HH:mm time into a full ISO string", and
// "read HH:mm back out of a stored ISO string").
export function nowHHmm(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function combineDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function isoToHHmm(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return monday;
}

export function endOfWeekSunday(d: Date): Date {
  const monday = startOfWeekMonday(d);
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
}

export function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

export function endOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

export function periodToRange(p: PeriodValue): { from: string; to: string } {
  switch (p.mode) {
    case "day": {
      const iso = toISODate(p.date);
      return { from: iso, to: iso };
    }
    case "week":
      return { from: toISODate(startOfWeekMonday(p.date)), to: toISODate(endOfWeekSunday(p.date)) };
    case "month":
      return { from: toISODate(startOfMonth(p.year, p.month)), to: toISODate(endOfMonth(p.year, p.month)) };
    case "range":
      return { from: toISODate(p.from), to: toISODate(p.to) };
  }
}

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

// Trigger-button label, e.g. "Aug 7, 2026" (day) / "Aug 3 - Aug 9, 2026" (week/range) /
// "August 2026" (month).
export function periodLabel(p: PeriodValue): string {
  switch (p.mode) {
    case "day":
      return `${shortDate(p.date)}, ${p.date.getFullYear()}`;
    case "week": {
      const start = startOfWeekMonday(p.date);
      const end = endOfWeekSunday(p.date);
      return `${shortDate(start)} - ${shortDate(end)}, ${end.getFullYear()}`;
    }
    case "month":
      return `${MONTH_NAMES[p.month]} ${p.year}`;
    case "range":
      return `${shortDate(p.from)} - ${shortDate(p.to)}, ${p.to.getFullYear()}`;
  }
}

// Prev/next navigation for the trigger's `< >` arrows — steps by the active mode's own unit.
export function stepPeriod(p: PeriodValue, dir: 1 | -1): PeriodValue {
  switch (p.mode) {
    case "day":
      return { mode: "day", date: new Date(p.date.getFullYear(), p.date.getMonth(), p.date.getDate() + dir) };
    case "week":
      return { mode: "week", date: new Date(p.date.getFullYear(), p.date.getMonth(), p.date.getDate() + dir * 7) };
    case "month": {
      let month = p.month + dir;
      let year = p.year;
      if (month < 0) { month = 11; year -= 1; }
      else if (month > 11) { month = 0; year += 1; }
      return { mode: "month", year, month };
    }
    case "range": {
      const spanDays = Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000) + 1;
      const shiftMs = dir * spanDays * 86_400_000;
      return {
        mode: "range",
        from: new Date(p.from.getTime() + shiftMs),
        to: new Date(p.to.getTime() + shiftMs),
      };
    }
  }
}

export function groupByEmployee(entries: TimeLogEntry[]): { key: string; name: string; entries: TimeLogEntry[] }[] {
  const order: string[] = [];
  const map = new Map<string, { key: string; name: string; entries: TimeLogEntry[] }>();
  for (const entry of entries) {
    const key = entry.employee_id ?? entry.display_name;
    if (!map.has(key)) {
      map.set(key, { key, name: entry.display_name, entries: [] });
      order.push(key);
    }
    map.get(key)!.entries.push(entry);
  }
  return order.map((key) => map.get(key)!);
}

export function sumHours(entries: TimeLogEntry[]): number {
  return entries.reduce((total, e) => total + e.hours, 0);
}

// Mirrors `_task-time-logs.tsx`'s local `groupByDate` (task 214) — not imported from there
// (different directory, this codebase's per-feature-area convention), but the same shape, used
// by the PDF export (task 227) for its per-day subtotals on multi-day periods.
export function groupByDate(entries: TimeLogEntry[]): [string, TimeLogEntry[]][] {
  const map = new Map<string, TimeLogEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.date_logged) ?? [];
    list.push(entry);
    map.set(entry.date_logged, list);
  }
  return [...map.entries()];
}

// Client-side "Recently Accessed" project tracking for the Add/Edit Time Log modal's Project field
// (task 230, Requirement 4). No backend "recently viewed" tracking exists anywhere in this
// codebase — this is the lowest-risk read (no migration/API), keyed per user so a shared browser
// profile doesn't mix histories, and degrades gracefully to an empty list on first use (task doc's
// Assumption 4).
const RECENT_PROJECTS_LIMIT = 5;

function recentProjectsKey(userId: string): string {
  return `webriq_timelogs_recent_projects_${userId}`;
}

export function getRecentProjectIds(userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(recentProjectsKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentProjectId(userId: string, projectPublicId: string): void {
  if (typeof window === "undefined" || !projectPublicId) return;
  try {
    const existing = getRecentProjectIds(userId).filter((id) => id !== projectPublicId);
    const next = [projectPublicId, ...existing].slice(0, RECENT_PROJECTS_LIMIT);
    window.localStorage.setItem(recentProjectsKey(userId), JSON.stringify(next));
  } catch {
    // localStorage unavailable (private browsing, quota) — recency tracking is best-effort only.
  }
}
