import { V2_ROUTES } from "@/config/constants";
import { MANAGER_ROLES } from "@/lib/hr/roles";

export type HrNavChild = { label: string; href: string };

/**
 * Role-filtered children of the sidebar's "HR" group (task 435). Mirrors the page guards:
 * managers (super_admin/admin/hr) see everything; PMs add the calendar; anyone with direct
 * reports reviews their team's requests; every non-client sees their own leave + holidays.
 * Users stays admin / super_admin only, exactly as before.
 */
export function hrNavChildren(role: string | null, hasDirectReports: boolean): HrNavChild[] {
  if (!role || role === "client") return [];
  const manager = (MANAGER_ROLES as readonly string[]).includes(role);
  const isAdmin = role === "admin" || role === "super_admin";
  return [
    { label: "Overview", href: V2_ROUTES.HR },
    ...(manager || hasDirectReports ? [{ label: manager ? "Leave requests" : "Team requests", href: V2_ROUTES.HR_LEAVE_REQUESTS }] : []),
    ...(manager || role === "pm" ? [{ label: "Calendar", href: V2_ROUTES.HR_CALENDAR }] : []),
    { label: "Holidays", href: V2_ROUTES.HR_HOLIDAYS },
    ...(manager ? [{ label: "Leave credits", href: V2_ROUTES.HR_LEAVE_CREDITS }, { label: "People", href: V2_ROUTES.HR_PEOPLE }] : []),
    { label: "My leave", href: V2_ROUTES.HR_MY_LEAVE },
    ...(isAdmin ? [{ label: "Users", href: V2_ROUTES.DASHBOARD_USERS }] : []),
  ];
}
