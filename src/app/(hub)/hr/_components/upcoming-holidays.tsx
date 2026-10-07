import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import { formatDate, relativeDays } from "@/lib/hr/dates";
import type { HolidayRow } from "@/lib/hr/types";
import { Panel } from "./page-shell";
import { EmptyState } from "./empty-state";

/** Next few holidays as outlined chips + a View all link. The soonest is highlighted. */
export function UpcomingHolidays({ holidays, today, yearTotal }: { holidays: HolidayRow[]; today: string; yearTotal?: number }) {
  return (
    <Panel
      title="Upcoming holidays"
      hint={yearTotal !== undefined ? `${yearTotal} this year` : undefined}
      action={<Link href={V2_ROUTES.HR_HOLIDAYS} className="text-[12px] font-semibold text-[#0063D6] hover:underline">View all</Link>}
    >
      {holidays.length ? (
        <ul className="flex flex-wrap gap-3 p-[18px]">
          {holidays.map((h, i) => (
            <li
              key={h.id}
              className={`min-w-[170px] rounded-[10px] border px-3.5 py-2.5 ${i === 0 ? "border-[#A8C6F5] bg-[#F0F7FF]" : "border-[#E2E7F2] bg-white"}`}
            >
              <p className="text-[13px] font-semibold text-[#0B1533]">{h.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-[#3A4565]">{formatDate(h.holiday_date)}</p>
              <p className="mt-0.5 font-mono text-[10.5px] text-[#5F6A88]">{relativeDays(h.holiday_date, today)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={CalendarDays} title="No upcoming holidays" hint="Holidays set by an admin appear here, and you get a reminder 3 days before each one." />
      )}
    </Panel>
  );
}
