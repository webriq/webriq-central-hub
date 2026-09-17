// Department vocabulary + department-based access rules (task 366) — mirrors how
// hub-role-map.ts centralizes role vocabulary. Department is a second, independent
// dimension on top of role: it can further narrow what a user sees (HR, Finance),
// or leave role-based access untouched (Business Team, Enterprise Team, Project
// Management). Keyed off department name, not role, so a future change to the
// compatibility matrix doesn't require touching the nav/route restriction logic.

import type { ValidRole } from "./hub-role-map";
import { V2_ROUTES } from "@/config/constants";

export const DEPARTMENTS = [
  "Business Team",
  "Enterprise Team",
  "HR",
  "Project Management",
  "Finance",
] as const;
export type DepartmentName = (typeof DEPARTMENTS)[number];

// Edit-time: which roles a department may hold. Checked bidirectionally by
// PATCH /api/v2/users/[userId] whenever either role or department_id changes.
// "other" (legacy-import bucket) and "marketing" (no path through this UI today —
// VALID_ROLES never included it) are deliberately excluded, same precedent as
// task 365 excluding "other" from the invite dropdown.
export const DEPARTMENT_ROLES: Record<DepartmentName, ValidRole[]> = {
  "Business Team": ["super_admin", "admin", "developer", "client"],
  "Enterprise Team": ["super_admin", "admin", "developer", "client"],
  HR: ["super_admin", "admin", "hr"],
  "Project Management": ["pm"],
  Finance: ["super_admin", "admin"],
};

// Invite-time role options per department — identical to DEPARTMENT_ROLES except
// Finance, which excludes "super_admin" from the invite dropdown only (still
// settable later via the HR > Users edit action).
export const DEPARTMENT_INVITE_ROLES: Record<DepartmentName, ValidRole[]> = {
  ...DEPARTMENT_ROLES,
  Finance: ["admin"],
};

// Path prefixes a department restricts nav/routing to, ON TOP of role-based access.
// Absent key = no additional restriction (falls back to whatever role already
// allows) — Business Team, Enterprise Team, Project Management. A department's own
// home route (see DEPARTMENT_HOME below) is always allowed — handled separately in
// isPathAllowedForDepartment — so it is deliberately NOT listed here (listing
// "/dashboard" as a prefix would also match every other /dashboard/* route and
// defeat the restriction).
export const DEPARTMENT_NAV_RESTRICTION: Partial<Record<DepartmentName, string[]>> = {
  HR: [V2_ROUTES.DASHBOARD_USERS, V2_ROUTES.KB],
  Finance: [V2_ROUTES.STACKSHIFT_ORDERS],
};

// Each department's "home" — always reachable regardless of DEPARTMENT_NAV_RESTRICTION, and the
// destination the department-gate fallback (hub layout) and sign-in flow (postLoginGate) land the
// user on. Defaults to the Dashboard for every department except Finance (task 376 — Dashboard is
// hidden for Finance "for now", Orders is their home instead).
export const DEPARTMENT_HOME: Partial<Record<DepartmentName, string>> = {
  Finance: V2_ROUTES.STACKSHIFT_ORDERS,
};

export function getDepartmentHome(departmentName: string | null): string {
  return DEPARTMENT_HOME[departmentName as DepartmentName] ?? V2_ROUTES.DASHBOARD;
}

export function isPathAllowedForDepartment(pathname: string, departmentName: string | null): boolean {
  if (!departmentName) return true; // unassigned = unrestricted until HR sets one
  const allowed = DEPARTMENT_NAV_RESTRICTION[departmentName as DepartmentName];
  if (!allowed) return true; // Business Team / Enterprise Team / Project Management
  if (pathname === getDepartmentHome(departmentName)) return true; // home always reachable
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
