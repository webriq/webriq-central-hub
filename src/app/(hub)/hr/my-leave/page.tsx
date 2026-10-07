import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { getHrViewer } from "@/lib/hr/access";
import { addDays, todayInTz } from "@/lib/hr/dates";
import { loadHolidayDates, loadLeaveTypes } from "@/lib/hr/queries";
import { loadCreditsFor, loadLeaveRequests } from "@/lib/hr/queries-requests";
import { CreditList } from "../_components/credit-list";
import { EmptyState } from "../_components/empty-state";
import { PageShell } from "../_components/page-shell";
import { MyRequests } from "./_my-requests";
import { RequestForm } from "./_request-form";
import { UserX } from "lucide-react";

export const metadata: Metadata = { title: "My leave · HR" };

export default async function MyLeavePage() {
  const viewer = await getHrViewer();
  if (!viewer) redirect(V2_ROUTES.DASHBOARD);
  if (!viewer.employeeId) {
    return (
      <PageShell title="My leave">
        <EmptyState icon={UserX} title="Your employee record isn't set up yet" hint="Ask HR to add you, then your credits and requests appear here." />
      </PageShell>
    );
  }

  const today = todayInTz();
  const [credits, types, { rows }, holidayDates] = await Promise.all([
    loadCreditsFor(viewer.employeeId, today),
    loadLeaveTypes(),
    loadLeaveRequests({ ownEmployeeId: viewer.employeeId, status: "all", pageSize: 50 }),
    loadHolidayDates(addDays(today, -400), addDays(today, 800)),
  ]);

  return (
    <PageShell title="My leave" description="Your credits for the current period, and your requests.">
      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <CreditList credits={credits} hint="Current period" />
          <MyRequests rows={rows} />
        </div>
        <RequestForm types={types.filter((t) => t.active)} credits={credits} holidayDates={[...holidayDates]} today={today} />
      </div>
    </PageShell>
  );
}
