// Leave-request loaders: queue (paginated), calendar window, and per-employee credits.
import { createClient } from "@/lib/supabase/server";
import { computeCredits } from "./credits";
import { countLeaveDays } from "./leave-days";
import { fetchAll, loadAdjustments, loadAllotmentPeriods, loadHolidayDates, loadLeaveTypes } from "./queries";
import type { CalendarLeave, CreditSummary, LeaveRequestRow, LeaveRequestView, LeaveStatus } from "./types";

interface JoinedRow extends LeaveRequestRow {
  employees: { full_name: string } | null;
  leave_types: { name: string } | null;
}

const SELECT =
  "id, employee_id, leave_type_id, start_date, end_date, half_day, reason, status, approver_id, decided_at, decision_note, team_emails, created_at, employees:hr_employees(full_name), leave_types:hr_leave_types(name)";

export interface RequestFilters {
  status?: LeaveStatus | "all";
  employeeId?: string;
  typeId?: string;
  from?: string; // overlaps-or-after
  to?: string;
  /** Only this employee's own requests (staff / PM "My requests"). */
  ownEmployeeId?: string;
  /** Hide this employee's requests (a reporting manager never reviews their own). */
  excludeEmployeeId?: string | null;
  page?: number;
  pageSize?: number;
}

export async function loadLeaveRequests(f: RequestFilters): Promise<{ rows: LeaveRequestView[]; total: number }> {
  const supabase = await createClient();
  const page = Math.max(1, f.page ?? 1);
  const size = Math.min(100, Math.max(1, f.pageSize ?? 20));
  let q = supabase
    
    .from("hr_leave_requests")
    .select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  if (f.ownEmployeeId) q = q.eq("employee_id", f.ownEmployeeId);
  if (f.excludeEmployeeId) q = q.neq("employee_id", f.excludeEmployeeId);
  if (f.employeeId) q = q.eq("employee_id", f.employeeId);
  if (f.typeId) q = q.eq("leave_type_id", f.typeId);
  if (f.from) q = q.gte("end_date", f.from);
  if (f.to) q = q.lte("start_date", f.to);

  const { data, count, error } = await q;
  if (error) console.error("[hr] loadLeaveRequests:", error);
  const joined = (data ?? []) as unknown as JoinedRow[];
  if (!joined.length) return { rows: [], total: count ?? 0 };

  const holidays = await loadHolidayDates(
    joined.reduce((m, r) => (r.start_date < m ? r.start_date : m), joined[0].start_date),
    joined.reduce((m, r) => (r.end_date > m ? r.end_date : m), joined[0].end_date)
  );
  const rows = joined.map(({ employees, leave_types, ...r }) => ({
    ...r,
    employee_name: employees?.full_name ?? "Unknown",
    leave_type_name: leave_types?.name ?? "Leave",
    working_days: countLeaveDays({ start: r.start_date, end: r.end_date, halfDay: r.half_day }, holidays),
  }));
  return { rows, total: count ?? 0 };
}

/** Pending requests the viewer's RLS lets them see, excluding their own. */
export async function countPendingRequests(excludeEmployeeId?: string | null): Promise<number> {
  const supabase = await createClient();
  let q = supabase.from("hr_leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (excludeEmployeeId) q = q.neq("employee_id", excludeEmployeeId);
  const { count } = await q;
  return count ?? 0;
}

/** Approved leaves overlapping [from, to] — name/type/dates only (no reason, no notes). */
export async function loadCalendarLeaves(from: string, to: string): Promise<CalendarLeave[]> {
  const supabase = await createClient();
  const rows = await fetchAll<JoinedRow>((a, b) =>
    supabase
      
      .from("hr_leave_requests")
      .select(SELECT)
      .eq("status", "approved")
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date")
      .range(a, b) as unknown as PromiseLike<{ data: JoinedRow[] | null; error: unknown }>
  );
  return rows.map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employees?.full_name ?? "Unknown",
    leave_type_name: r.leave_types?.name ?? "Leave",
    start_date: r.start_date,
    end_date: r.end_date,
    half_day: r.half_day,
  }));
}

/** Allotted / used / pending / remaining per leave type for one employee as of `today`. */
export async function loadCreditsFor(employeeId: string, today: string): Promise<CreditSummary[]> {
  const supabase = await createClient();
  const [types, periods, adjustments, reqRes, holidays] = await Promise.all([
    loadLeaveTypes(),
    loadAllotmentPeriods(),
    loadAdjustments(employeeId),
    supabase
      
      .from("hr_leave_requests")
      .select("leave_type_id, start_date, end_date, half_day, status")
      .eq("employee_id", employeeId)
      .in("status", ["approved", "pending"]),
    loadHolidayDates("2000-01-01", "2100-12-31"),
  ]);
  return computeCredits({
    types,
    periods,
    requests: (reqRes.data ?? []) as Pick<LeaveRequestRow, "leave_type_id" | "start_date" | "end_date" | "half_day" | "status">[],
    adjustments,
    holidays,
    today,
  });
}
