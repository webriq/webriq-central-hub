import { CalendarCheck, PartyPopper } from "lucide-react";
import { formatDate } from "@/lib/hr/dates";
import { returnDate } from "@/lib/hr/leave-days";
import type { CalendarLeave, HolidayRow } from "@/lib/hr/types";
import { EmptyState } from "./empty-state";
import { LeaveTypeChip } from "./chips";
import { PersonAvatar } from "./person-avatar";

/** Who is away on one day: approved leaves, with return date; a banner when the day is a holiday. */
export function WhosOutList({
  date,
  leaves,
  holiday,
  holidayDates,
}: {
  date: string;
  leaves: CalendarLeave[];
  holiday?: HolidayRow | null;
  holidayDates: ReadonlySet<string>;
}) {
  return (
    <div>
      {holiday && (
        <div className="flex items-center gap-2 border-b border-[#EDF0F7] bg-[#F0F7FF] px-[18px] py-2.5 text-[12px] text-[#0063D6]">
          <PartyPopper size={14} aria-hidden />
          <span className="font-semibold">{holiday.name}</span>
          <span className="text-[#5F6A88]">· company holiday</span>
        </div>
      )}
      {leaves.length ? (
        <ul>
          {leaves.map((l) => (
            <li key={l.id} className="flex items-center gap-3 border-b border-[#EDF0F7] px-[18px] py-3 last:border-0">
              <PersonAvatar id={l.employee_id} name={l.employee_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#0B1533]">{l.employee_name}</p>
                <p className="font-mono text-[10.5px] text-[#5F6A88]">
                  {l.half_day ? "Half day · " : ""}Back {formatDate(returnDate(l.end_date, holidayDates))}
                </p>
              </div>
              <LeaveTypeChip name={l.leave_type_name} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={CalendarCheck}
          title={holiday ? "Nobody is on leave on this holiday" : "Everyone is in"}
          hint={`No approved leave covers ${formatDate(date)}.`}
        />
      )}
    </div>
  );
}
