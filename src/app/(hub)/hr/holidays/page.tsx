import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import { getHrViewer, isManager } from "@/lib/hr/access";
import { todayInTz } from "@/lib/hr/dates";
import { loadHolidaysForYear } from "@/lib/hr/queries";
import { PageShell } from "../_components/page-shell";
import { circleBtn } from "../_components/ui";
import { HolidaysView } from "./_holidays-view";

export const metadata: Metadata = { title: "Holidays · HR" };

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const viewer = await getHrViewer();
  if (!viewer) redirect(V2_ROUTES.DASHBOARD);

  const today = todayInTz();
  const parsed = Number((await searchParams).year);
  const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : Number(today.slice(0, 4));
  const holidays = await loadHolidaysForYear(year);

  return (
    <PageShell
      title="Holidays"
      description="Company holidays for the year. You get a reminder 3 days before each one, so you can swap a workday if you need to."
      actions={
        <nav aria-label="Year" className="flex items-center gap-2">
          <Link href={`${V2_ROUTES.HR_HOLIDAYS}?year=${year - 1}`} className={circleBtn} aria-label={`Show ${year - 1}`}><ChevronLeft size={15} /></Link>
          <span className="min-w-14 text-center font-mono text-[13px] font-semibold text-[#0B1533]">{year}</span>
          <Link href={`${V2_ROUTES.HR_HOLIDAYS}?year=${year + 1}`} className={circleBtn} aria-label={`Show ${year + 1}`}><ChevronRight size={15} /></Link>
        </nav>
      }
    >
      <HolidaysView year={year} holidays={holidays} today={today} canManage={isManager(viewer)} />
    </PageShell>
  );
}
