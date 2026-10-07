import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { canReviewRequests, canSeeCalendar, getHrViewer, isManager } from "@/lib/hr/access";
import { addDays, formatDate, relativeDays, todayInTz } from "@/lib/hr/dates";
import { loadHolidayDates, loadHolidaysForYear, loadUpcomingHolidays } from "@/lib/hr/queries";
import { countPendingRequests, loadCalendarLeaves, loadCreditsFor } from "@/lib/hr/queries-requests";
import { btn } from "./_components/ui";
import { CreditList } from "./_components/credit-list";
import { PageShell, Panel } from "./_components/page-shell";
import { StatStrip, type Stat } from "./_components/stat-strip";
import { UpcomingHolidays } from "./_components/upcoming-holidays";
import { WhosOutList } from "./_components/whos-out-list";

export const metadata: Metadata = { title: "HR" };

export default async function HrOverviewPage() {
  const viewer = await getHrViewer();
  if (!viewer) redirect(V2_ROUTES.DASHBOARD);

  const today = todayInTz();
  const year = Number(today.slice(0, 4));
  const manager = isManager(viewer);
  const reviewer = canReviewRequests(viewer);

  const [upcoming, yearHolidays, credits, pending, outToday, holidayDates] = await Promise.all([
    loadUpcomingHolidays(today, 3),
    loadHolidaysForYear(year),
    viewer.employeeId ? loadCreditsFor(viewer.employeeId, today) : Promise.resolve([]),
    reviewer ? countPendingRequests(manager ? null : viewer.employeeId) : Promise.resolve(0),
    manager ? loadCalendarLeaves(today, today) : Promise.resolve([]),
    loadHolidayDates(today, addDays(today, 21)),
  ]);

  const next = upcoming[0];
  const stats: Stat[] = [
    ...(reviewer ? [{
      label: manager ? "Pending requests" : "Team requests waiting",
      value: pending,
      hint: pending ? "Review now" : "All caught up",
      href: V2_ROUTES.HR_LEAVE_REQUESTS,
    }] : []),
    ...(manager ? [{ label: "Out today", value: outToday.length, hint: formatDate(today), href: V2_ROUTES.HR_CALENDAR }] : []),
    { label: "Next holiday", value: next ? next.name : "None set", hint: next ? `${formatDate(next.holiday_date)} · ${relativeDays(next.holiday_date, today)}` : undefined, href: V2_ROUTES.HR_HOLIDAYS },
  ];

  return (
    <PageShell
      title="HR"
      description={manager ? "Leave requests, who's away, holidays and leave credits." : "Your leave credits and the company holidays."}
      actions={<Link href={V2_ROUTES.HR_MY_LEAVE} className={btn.cta}>Request leave</Link>}
    >
      <StatStrip stats={stats} />
      {manager && (
        <Panel title="Who's out today" hint={formatDate(today)} action={<Link href={V2_ROUTES.HR_CALENDAR} className="text-[12px] font-semibold text-[#0063D6] hover:underline">Open calendar</Link>}>
          <WhosOutList date={today} leaves={outToday} holiday={yearHolidays.find((h) => h.holiday_date === today)} holidayDates={holidayDates} />
        </Panel>
      )}
      <CreditList credits={credits} hint="Your current period" />
      <UpcomingHolidays holidays={upcoming} today={today} yearTotal={yearHolidays.length} />
      {!manager && canSeeCalendar(viewer) && (
        <p className="text-[12px] text-[#5F6A88]">
          Planning around the team? <Link href={V2_ROUTES.HR_CALENDAR} className="font-semibold text-[#0063D6] hover:underline">See who is on approved leave</Link>.
        </p>
      )}
    </PageShell>
  );
}
