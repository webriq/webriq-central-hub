import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { canSeeCalendar, getHrViewer, isManager } from "@/lib/hr/access";
import { todayInTz } from "@/lib/hr/dates";
import { loadHolidays } from "@/lib/hr/queries";
import { loadCalendarLeaves } from "@/lib/hr/queries-requests";
import { PageShell } from "../_components/page-shell";
import { rangeFor } from "./_calendar-range";
import { LeaveCalendar } from "./_leave-calendar";

export const metadata: Metadata = { title: "Leave calendar · HR" };

export default async function CalendarPage() {
  const viewer = await getHrViewer();
  if (!viewer || !canSeeCalendar(viewer)) redirect(V2_ROUTES.HR);
  const today = todayInTz();
  const { from, to } = rangeFor("month", today);
  const [leaves, holidays] = await Promise.all([loadCalendarLeaves(from, to), loadHolidays(from, to)]);

  return (
    <PageShell
      title="Leave calendar"
      description={isManager(viewer) ? "Who is away, by month, week or day. Pick the Day view to see exactly who is out on a date." : "Approved leave across the team, by month, week or day."}
    >
      <LeaveCalendar today={today} initial={{ leaves, holidays }} />
    </PageShell>
  );
}
