import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CalendarCheck } from "lucide-react";
import { dayOfMonth, isWeekend, weekDays, weekdayShort } from "@/lib/hr/dates";
import type { CalendarLeave, HolidayRow } from "@/lib/hr/types";
import { EmptyState } from "../_components/empty-state";
import { PersonAvatar } from "../_components/person-avatar";

/** Week view: one row per person who is away this week, one column per day. */
export function WeekView({ anchor, today, leaves, holidays, onPickDay }: {
  anchor: string;
  today: string;
  leaves: CalendarLeave[];
  holidays: Map<string, HolidayRow>;
  onPickDay: (d: string) => void;
}) {
  const days = weekDays(anchor);
  const people = [...new Map(leaves.map((l) => [l.employee_id, l.employee_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cols = "grid grid-cols-[150px_repeat(7,minmax(70px,1fr))]";

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className={`${cols} border-b border-[#EDF0F7] bg-[#FAFBFE]`}>
          <div className="px-[18px] py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Person</div>
          {days.map((d) => (
            <button key={d} type="button" onClick={() => onPickDay(d)} className={`px-2 py-2 text-left transition-colors hover:bg-[#F0F7FF] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#007BFF] ${holidays.has(d) ? "bg-[#E5F1FF]/60" : ""}`}>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">{weekdayShort(d)}</span>{" "}
              <span className={`inline-flex size-5 items-center justify-center rounded-full font-mono text-[10.5px] font-semibold ${d === today ? "bg-[#071133] text-white" : "text-[#0B1533]"}`}>{dayOfMonth(d)}</span>
              {holidays.has(d) && <span className="block truncate text-[10px] font-semibold text-[#0063D6]">{holidays.get(d)!.name}</span>}
            </button>
          ))}
        </div>
        {people.length ? people.map(([id, name]) => (
          <div key={id} className={`${cols} border-b border-[#EDF0F7] last:border-0`}>
            <div className="flex items-center gap-2 px-[18px] py-2.5"><PersonAvatar id={id} name={name} size="md" /><span className="truncate text-[12.5px] font-semibold text-[#0B1533]">{name}</span></div>
            {days.map((d) => {
              const l = leaves.find((x) => x.employee_id === id && x.start_date <= d && d <= x.end_date);
              const off = isWeekend(d) || holidays.has(d);
              return (
                <div key={d} className={`flex items-center px-1 py-2 ${off ? "bg-[#F4F6FB]" : ""}`}>
                  {l && !off && (
                    <Tooltip>
                      <TooltipTrigger render={<span tabIndex={0} className="w-full cursor-default truncate rounded-[7px] bg-[#E5F1FF] px-2 py-1 text-[10.5px] font-semibold text-[#0063D6] outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF]" />}>
                        {l.half_day ? "½ day" : l.leave_type_name}
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{l.half_day ? `Half day · ${l.leave_type_name}` : l.leave_type_name}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        )) : <EmptyState icon={CalendarCheck} title="Nobody is on leave this week" hint="Approved leave shows here as soon as it's approved." />}
      </div>
    </div>
  );
}
