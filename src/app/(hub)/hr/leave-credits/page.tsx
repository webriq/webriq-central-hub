import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { getHrViewer, isManager } from "@/lib/hr/access";
import { todayInTz } from "@/lib/hr/dates";
import { loadAllotmentPeriods, loadLeaveTypes } from "@/lib/hr/queries";
import { PageShell } from "../_components/page-shell";
import { AllotmentsView } from "./_allotments-view";

export const metadata: Metadata = { title: "Leave credits · HR" };

export default async function LeaveCreditsPage() {
  const viewer = await getHrViewer();
  if (!viewer || !isManager(viewer)) redirect(V2_ROUTES.HR);
  const [types, periods] = await Promise.all([loadLeaveTypes(), loadAllotmentPeriods()]);

  return (
    <PageShell
      title="Leave credits"
      description="Set how many days each leave type gives, for any date range — for example 12 days from Jan 15, 2026 to Jan 14, 2027. Everyone gets the same allotment."
    >
      <AllotmentsView types={types.filter((t) => t.active)} periods={periods} today={todayInTz()} />
    </PageShell>
  );
}
