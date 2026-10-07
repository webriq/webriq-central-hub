// Server-side reference-data loaders for HR pages. Session client only — RLS decides what each
// viewer can read. Every unbounded select paginates with .range() (PostgREST caps at 1000 rows).
import { createClient } from "@/lib/supabase/server";
import { addDays } from "./dates";
import type { AdjustmentRow, AllotmentPeriod, EmployeeRow, HolidayRow, LeaveTypeRow } from "./types";

const PAGE = 1000;

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error instanceof Error ? error : new Error(JSON.stringify(error));
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

const hr = () => createClient();

export async function loadLeaveTypes(): Promise<LeaveTypeRow[]> {
  const { data } = await (await hr()).from("hr_leave_types").select("id, name, code, paid, active").order("name");
  return (data ?? []) as LeaveTypeRow[];
}

export async function loadAllotmentPeriods(): Promise<AllotmentPeriod[]> {
  const { data } = await (await hr())
    .from("hr_leave_allotment_periods")
    .select("id, leave_type_id, period_start, period_end, days_allotted")
    .order("period_start", { ascending: false });
  return (data ?? []) as AllotmentPeriod[];
}

/** Holidays whose date falls in [from, to] inclusive, soonest first. */
export async function loadHolidays(from: string, to: string): Promise<HolidayRow[]> {
  const { data } = await (await hr())
    .from("hr_holidays")
    .select("id, name, holiday_date, kind, note")
    .gte("holiday_date", from)
    .lte("holiday_date", to)
    .order("holiday_date");
  return (data ?? []) as HolidayRow[];
}

export async function loadHolidaysForYear(year: number): Promise<HolidayRow[]> {
  return loadHolidays(`${year}-01-01`, `${year}-12-31`);
}

/** Next `limit` holidays on or after `today`. */
export async function loadUpcomingHolidays(today: string, limit = 3): Promise<HolidayRow[]> {
  const { data } = await (await hr())
    .from("hr_holidays")
    .select("id, name, holiday_date, kind, note")
    .gte("holiday_date", today)
    .order("holiday_date")
    .limit(limit);
  return (data ?? []) as HolidayRow[];
}

/** Set of holiday dates across a range, for working-day math. */
export async function loadHolidayDates(from: string, to: string): Promise<Set<string>> {
  const rows = await loadHolidays(addDays(from, -1), addDays(to, 1));
  return new Set(rows.map((h) => h.holiday_date));
}

export async function loadEmployees(): Promise<EmployeeRow[]> {
  const client = await hr();
  return fetchAll<EmployeeRow>((a, b) =>
    client
      .from("hr_employees")
      .select("id, profile_id, full_name, employee_number, department, manager_id")
      .neq("status", "separated")
      .order("full_name")
      .range(a, b)
  );
}

export async function loadAdjustments(employeeId?: string): Promise<AdjustmentRow[]> {
  const client = await hr();
  const rows = await fetchAll<AdjustmentRow>((a, b) => {
    const q = client.from("hr_leave_adjustments").select("employee_id, period_id, days_used_before").range(a, b);
    return employeeId ? q.eq("employee_id", employeeId) : q;
  });
  return rows.map((r) => ({ ...r, days_used_before: Number(r.days_used_before) }));
}
