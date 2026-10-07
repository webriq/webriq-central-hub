import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { loadPersonDirectory } from "@/lib/hr/avatars";
import { MANAGER_ROLES } from "@/lib/hr/roles";
import { getHrViewer, isManager } from "@/lib/hr/access";
import { todayInTz } from "@/lib/hr/dates";
import { loadAdjustments, loadAllotmentPeriods, loadEmployees, loadLeaveTypes } from "@/lib/hr/queries";
import { PageShell } from "../_components/page-shell";
import { PeopleTable } from "./_people-table";

export const metadata: Metadata = { title: "People · HR" };

export default async function PeoplePage() {
  const viewer = await getHrViewer();
  if (!viewer || !isManager(viewer)) redirect(V2_ROUTES.HR);
  const today = todayInTz();
  const [employees, types, periods, adjustments] = await Promise.all([
    loadEmployees(), loadLeaveTypes(), loadAllotmentPeriods(), loadAdjustments(),
  ]);
  const directory = await loadPersonDirectory();
  const adminIds = Object.entries(directory).filter(([, d]) => (MANAGER_ROLES as readonly string[]).includes(d.role)).map(([id]) => id);
  const current = periods.filter((p) => p.period_start <= today && today <= p.period_end);

  return (
    <PageShell
      title="People"
      description="Choose who each person reports to — they review that person's leave requests — and enter leave already used before the Hub, so remaining credits match from day one."
    >
      <PeopleTable employees={employees} adminIds={adminIds} types={types.filter((t) => t.active)} currentPeriods={current} adjustments={adjustments} />
    </PageShell>
  );
}
