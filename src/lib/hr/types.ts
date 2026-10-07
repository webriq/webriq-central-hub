// Shared HR view-model types and label maps. Pure — safe to import from client and server.

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type HolidayKind = "regular" | "special" | "company";
export type HrTier = "manager" | "pm" | "staff";

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Denied", // DB value is `rejected`; the UI says "Denied"
  cancelled: "Cancelled",
};

export const KIND_LABEL: Record<HolidayKind, string> = {
  regular: "Regular",
  special: "Special",
  company: "Company",
};

export interface LeaveTypeRow {
  id: string;
  name: string;
  code: string;
  paid: boolean;
  active: boolean;
}

export interface AllotmentPeriod {
  id: string;
  leave_type_id: string;
  period_start: string;
  period_end: string;
  days_allotted: number | null; // null = unlimited
}

export interface HolidayRow {
  id: string;
  name: string;
  holiday_date: string;
  kind: HolidayKind;
  note: string | null;
}

export interface LeaveRequestRow {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day: boolean;
  reason: string | null;
  status: LeaveStatus;
  approver_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  team_emails: string[];
  created_at: string;
}

/** A request joined with display fields for the queue / drawer. */
export interface LeaveRequestView extends LeaveRequestRow {
  employee_name: string;
  leave_type_name: string;
  working_days: number;
}

export interface AdjustmentRow {
  employee_id: string;
  period_id: string;
  days_used_before: number;
}

/** Calendar entry — deliberately has no reason / notes (PM-visible payload). */
export interface CalendarLeave {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  half_day: boolean;
}

export interface EmployeeRow {
  id: string;
  profile_id: string;
  full_name: string;
  employee_number: string | null;
  department: string | null;
  manager_id: string | null;
}

export interface CreditSummary {
  type: LeaveTypeRow;
  period: AllotmentPeriod | null;
  allotted: number | null; // null = unlimited (or no period — check `period`)
  used: number;
  pending: number;
  remaining: number | null;
}

export interface HrViewer {
  profileId: string;
  role: string;
  tier: HrTier;
  employeeId: string | null;
  hasDirectReports: boolean;
  fullName: string | null;
}
