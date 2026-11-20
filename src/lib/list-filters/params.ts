// Task 491 — URL params + PostgREST predicates for the Quick Links › Tasks and Tickets filters
// (Due date / Assignees / Projects). Pure and framework-free: imported by both server pages
// (`dashboard/tasks/page.tsx`, `desk/tickets/page.tsx`) and the client filter controls in
// `src/components/list-filters/`, and exercised by `_docs/task/491-list-filters.check.ts`.
//
// `DuePeriod` is deliberately the same shape as Time Logs' `PeriodValue`
// (`dashboard/timelogs/_time-logs-shared.ts`), so the client can hand it straight to that
// feature's Day/Week/Month/Range panels. It is redeclared here rather than imported so `src/lib`
// never depends on a route's private files.

export const DUE_PARAM = "due";
export const ASSIGNEE_PARAM = "assignee";
export const PROJECT_PARAM = "project";
export const UNASSIGNED = "unassigned";

export type DuePeriod =
  | { mode: "day"; date: Date }
  | { mode: "week"; date: Date } // any day within the Mon–Sun week
  | { mode: "month"; year: number; month: number } // month is 0-11
  | { mode: "range"; from: Date; to: Date };

export type DueFilter = DuePeriod | { mode: "overdue" } | { mode: "none" };

export function isDuePeriod(f: DueFilter): f is DuePeriod {
  return f.mode !== "overdue" && f.mode !== "none";
}

// ─── Local-calendar date helpers (never toISOString(), which is UTC) ─────────

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** Strict "YYYY-MM-DD" → local Date; null for anything that isn't a real calendar day. */
export function parseDateKey(s: string): Date | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (day === 0 ? -6 : 1 - day));
}

/** Inclusive `YYYY-MM-DD` bounds of a period — same rules as Time Logs' `periodToRange`. */
export function dueRange(p: DuePeriod): { from: string; to: string } {
  switch (p.mode) {
    case "day":
      return { from: toDateKey(p.date), to: toDateKey(p.date) };
    case "week": {
      const mon = startOfWeekMonday(p.date);
      return { from: toDateKey(mon), to: toDateKey(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)) };
    }
    case "month":
      return { from: toDateKey(new Date(p.year, p.month, 1)), to: toDateKey(new Date(p.year, p.month + 1, 0)) };
    case "range":
      return { from: toDateKey(p.from), to: toDateKey(p.to) };
  }
}

// ─── `due=` param ────────────────────────────────────────────────────────────
// overdue | none | day:YYYY-MM-DD | week:YYYY-MM-DD | month:YYYY-MM | range:YYYY-MM-DD..YYYY-MM-DD
// Anything else (missing, malformed, impossible dates) means "Any" → null.

export function parseDueParam(raw: string | null | undefined): DueFilter | null {
  const v = raw?.trim();
  if (!v) return null;
  if (v === "overdue") return { mode: "overdue" };
  if (v === "none") return { mode: "none" };
  const sep = v.indexOf(":");
  if (sep < 0) return null;
  const mode = v.slice(0, sep);
  const rest = v.slice(sep + 1);
  if (mode === "day" || mode === "week") {
    const date = parseDateKey(rest);
    return date ? { mode, date } : null;
  }
  if (mode === "month") {
    const m = MONTH_RE.exec(rest);
    if (!m) return null;
    const month = Number(m[2]) - 1;
    if (month < 0 || month > 11) return null;
    return { mode: "month", year: Number(m[1]), month };
  }
  if (mode === "range") {
    const [a, b, extra] = rest.split("..");
    if (extra !== undefined || !a || !b) return null;
    const from = parseDateKey(a);
    const to = parseDateKey(b);
    if (!from || !to) return null;
    // A hand-edited, backwards range is still an obvious intent — swap rather than discard.
    return from <= to ? { mode: "range", from, to } : { mode: "range", from: to, to: from };
  }
  return null;
}

export function serializeDue(f: DueFilter): string {
  switch (f.mode) {
    case "overdue":
    case "none":
      return f.mode;
    case "day":
    case "week":
      return `${f.mode}:${toDateKey(f.date)}`;
    case "month":
      return `month:${f.year}-${String(f.month + 1).padStart(2, "0")}`;
    case "range":
      return `range:${toDateKey(f.from)}..${toDateKey(f.to)}`;
  }
}

// ─── id-list params (`assignee=`, `project=`) ────────────────────────────────
// Values are interpolated into PostgREST filter strings, so only UUIDs (and, for assignees, the
// literal `unassigned`) survive parsing — this is the injection guard, not just tidiness.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseIdListParam(raw: string | null | undefined, opts: { allowUnassigned?: boolean } = {}): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim().toLowerCase();
    if (!v) continue;
    const ok = UUID_RE.test(v) || (opts.allowUnassigned && v === UNASSIGNED);
    if (ok && !out.includes(v)) out.push(v);
  }
  return out;
}

/** null when empty, so callers can pass it straight to a "delete this param" override. */
export function serializeIdList(ids: string[]): string | null {
  return ids.length > 0 ? ids.join(",") : null;
}

// ─── PostgREST predicates ────────────────────────────────────────────────────

/**
 * The `.or()` filter string for an assignee selection, or null when nothing is selected.
 * Tasks: `assignees` (uuid[]) only. Tickets pass `scalarColumn: "assignee_id"` to mirror
 * `ticketAssigneeIds()` — the array wins when non-empty, the legacy scalar is the fallback.
 */
export function assigneeOrFilter(values: string[], opts: { scalarColumn?: string } = {}): string | null {
  const ids = values.filter((v) => v !== UNASSIGNED);
  const wantUnassigned = values.includes(UNASSIGNED);
  const scalar = opts.scalarColumn;
  const parts: string[] = [];
  if (ids.length > 0) {
    parts.push(`assignees.ov.{${ids.join(",")}}`);
    if (scalar) parts.push(`and(or(assignees.is.null,assignees.eq.{}),${scalar}.in.(${ids.join(",")}))`);
  }
  if (wantUnassigned) {
    if (scalar) parts.push(`and(or(assignees.is.null,assignees.eq.{}),${scalar}.is.null)`);
    else parts.push("assignees.is.null", "assignees.eq.{}");
  }
  return parts.length > 0 ? parts.join(",") : null;
}

/** Statuses that mean "done" for Overdue — both spellings, per the Dev Dashboard precedent. */
export const CLOSED_STATUSES = ["closed", "Closed"] as const;

// Structural subset of Supabase's filter builder — same approach as `applyTicketFilters`.
export interface ListFilterQuery<Q> {
  gte(column: string, value: string): Q;
  lte(column: string, value: string): Q;
  lt(column: string, value: string): Q;
  is(column: string, value: null): Q;
  in(column: string, values: string[]): Q;
  not(column: string, operator: string, value: string): Q;
  or(filters: string): Q;
}

export type ListFilters = {
  due: DueFilter | null;
  assignees: string[];
  projects: string[];
};

export function parseListFilters(params: Record<string, string | undefined>): ListFilters {
  return {
    due: parseDueParam(params[DUE_PARAM]),
    assignees: parseIdListParam(params[ASSIGNEE_PARAM], { allowUnassigned: true }),
    projects: parseIdListParam(params[PROJECT_PARAM]),
  };
}

export function hasListFilters(f: ListFilters): boolean {
  return f.due !== null || f.assignees.length > 0 || f.projects.length > 0;
}

/** Applies due/assignee/project predicates. `today` is a local `YYYY-MM-DD` key. */
export function applyListFilters<Q extends ListFilterQuery<Q>>(
  query: Q,
  filters: ListFilters,
  opts: { today: string; scalarAssigneeColumn?: string }
): Q {
  let q = query;
  const { due, assignees, projects } = filters;
  if (due) {
    if (due.mode === "none") {
      q = q.is("due_date", null);
    } else if (due.mode === "overdue") {
      q = q.lt("due_date", opts.today).not("status", "in", `(${CLOSED_STATUSES.join(",")})`);
    } else {
      const { from, to } = dueRange(due);
      q = q.gte("due_date", from).lte("due_date", to);
    }
  }
  const assigneeFilter = assigneeOrFilter(assignees, { scalarColumn: opts.scalarAssigneeColumn });
  if (assigneeFilter) q = q.or(assigneeFilter);
  if (projects.length > 0) q = q.in("project_id", projects);
  return q;
}
