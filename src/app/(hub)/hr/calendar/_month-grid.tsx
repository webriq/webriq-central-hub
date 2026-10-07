import { dayOfMonth, formatDate, isWeekend, monthGrid } from "@/lib/hr/dates";
import type { CalendarLeave, HolidayRow } from "@/lib/hr/types";
import { PersonAvatar } from "../_components/person-avatar";

const HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE = 3;

/** Month grid. Each day is a button that opens that date in the Day view. */
export function MonthGrid({ anchor, today, leaves, holidays, onPickDay }: {
  anchor: string;
  today: string;
  leaves: CalendarLeave[];
  holidays: Map<string, HolidayRow>;
  onPickDay: (d: string) => void;
}) {
  const month = anchor.slice(0, 7);
  const onDay = (d: string) => (isWeekend(d) || holidays.has(d) ? [] : leaves.filter((l) => l.start_date <= d && d <= l.end_date));
  return (
    <div role="grid" aria-label="Month view" className="overflow-x-auto">
      <div className="grid min-w-[560px] grid-cols-7 border-b border-[#EDF0F7] bg-[#FAFBFE]" role="row">
        {HEADS.map((h) => <div key={h} role="columnheader" className="px-2 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">{h}</div>)}
      </div>
      {monthGrid(anchor).map((week) => (
        <div key={week[0]} role="row" className="grid min-w-[560px] grid-cols-7">
          {week.map((d) => {
            const people = onDay(d);
            const holiday = holidays.get(d);
            const inMonth = d.startsWith(month);
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                onClick={() => onPickDay(d)}
                aria-label={`${formatDate(d)}${holiday ? `, ${holiday.name}` : ""}, ${people.length} on leave`}
                className={`flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-[#EDF0F7] p-1.5 text-left transition-colors hover:bg-[#F0F7FF] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#007BFF] ${
                  holiday ? "bg-[#E5F1FF]/60" : isWeekend(d) ? "bg-[#F4F6FB]" : "bg-white"
                } ${inMonth ? "" : "opacity-50"}`}
              >
                <span className={`inline-flex size-6 items-center justify-center self-start rounded-full font-mono text-[11px] font-semibold ${d === today ? "bg-[#071133] text-white" : "text-[#3A4565]"}`}>{dayOfMonth(d)}</span>
                {holiday && <span className="truncate text-[10px] font-semibold text-[#0063D6]">{holiday.name}</span>}
                <span className="flex flex-col gap-0.5 max-sm:hidden">
                  {people.slice(0, MAX_VISIBLE).map((l) => (
                    <span key={l.id} className="flex items-center gap-1 rounded-full bg-[#F4F6FB] py-0.5 pl-0.5 pr-2">
                      <PersonAvatar id={l.employee_id} name={l.employee_name} size="sm" />
                      <span className="truncate text-[10.5px] font-medium text-[#0B1533]">{l.employee_name.split(" ")[0]}{l.half_day ? " ½" : ""}</span>
                    </span>
                  ))}
                  {people.length > MAX_VISIBLE && <span className="pl-1 font-mono text-[10px] text-[#5F6A88]">+{people.length - MAX_VISIBLE} more</span>}
                </span>
                {people.length > 0 && <span className="self-start rounded-full bg-[#EDF0F7] px-1.5 py-0.5 font-mono text-[10px] text-[#3A4565] sm:hidden">{people.length} out</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
