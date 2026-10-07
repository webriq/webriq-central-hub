// Pure credit math (A4): credits are derived at read time, never stored as counters.
import { countLeaveDaysWithin } from "./leave-days";
import type { AdjustmentRow, AllotmentPeriod, CreditSummary, LeaveRequestRow, LeaveTypeRow } from "./types";

type RequestLite = Pick<LeaveRequestRow, "leave_type_id" | "start_date" | "end_date" | "half_day" | "status">;

interface ComputeInput {
  types: LeaveTypeRow[];
  periods: AllotmentPeriod[];
  requests: RequestLite[];
  adjustments: Pick<AdjustmentRow, "period_id" | "days_used_before">[];
  holidays: ReadonlySet<string>;
  today: string;
}

/** Period of `typeId` that contains `date`, if any. Periods of one type never overlap. */
export function periodFor(periods: AllotmentPeriod[], typeId: string, date: string): AllotmentPeriod | null {
  return periods.find((p) => p.leave_type_id === typeId && p.period_start <= date && date <= p.period_end) ?? null;
}

export function computeCredits({ types, periods, requests, adjustments, holidays, today }: ComputeInput): CreditSummary[] {
  return types
    .filter((t) => t.active)
    .map((type) => {
      const period = periodFor(periods, type.id, today);
      if (!period) return { type, period: null, allotted: null, used: 0, pending: 0, remaining: null };

      const sumFor = (status: RequestLite["status"]) =>
        requests
          .filter((r) => r.leave_type_id === type.id && r.status === status)
          .reduce(
            (sum, r) =>
              sum +
              countLeaveDaysWithin(
                { start: r.start_date, end: r.end_date, halfDay: r.half_day },
                period.period_start,
                period.period_end,
                holidays
              ),
            0
          );

      const before = adjustments.filter((a) => a.period_id === period.id).reduce((s, a) => s + Number(a.days_used_before), 0);
      const used = sumFor("approved") + before;
      const pending = sumFor("pending");
      const allotted = period.days_allotted === null ? null : Number(period.days_allotted);
      return { type, period, allotted, used, pending, remaining: allotted === null ? null : allotted - used };
    });
}
