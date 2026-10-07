import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { monthGrid, monthLabel, dayOfMonth, formatDate, isWeekend } from "@/lib/hr/dates";
import type { HolidayRow } from "@/lib/hr/types";

const WEEKDAY_HEADS = ["M", "T", "W", "T", "F", "S", "S"];

function MiniMonth({ month, byDate, today }: { month: string; byDate: Map<string, HolidayRow>; today: string }) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold text-[#0B1533]">{monthLabel(month).split(" ")[0]}</h3>
      <div className="grid grid-cols-7 gap-y-1 text-center" role="grid" aria-label={monthLabel(month)}>
        {WEEKDAY_HEADS.map((d, i) => (
          <span key={i} className="text-[9px] font-bold text-[#5F6A88]">{d}</span>
        ))}
        {monthGrid(month).flat().map((d) => {
          if (d.slice(0, 7) !== month.slice(0, 7)) return <span key={d} />;
          const h = byDate.get(d);
          const base = "mx-auto flex size-6 items-center justify-center rounded-full font-mono text-[10.5px]";
          if (h) {
            return (
              <Tooltip key={d}>
                <TooltipTrigger
                  render={<span role="gridcell" tabIndex={0} aria-label={`${h.name}, ${formatDate(d)}`} className={`${base} cursor-default bg-[#E5F1FF] font-bold text-[#0063D6] outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF]`} />}
                >
                  {dayOfMonth(d)}
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{h.name}</span>
                    <span className="font-mono text-[11px] text-slate-300">{formatDate(d)}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          }
          return (
            <span key={d} role="gridcell" className={`${base} ${d === today ? "bg-[#071133] font-bold text-white" : isWeekend(d) ? "text-[#5F6A88]/60" : "text-[#3A4565]"}`}>
              {dayOfMonth(d)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Year-at-a-glance: twelve small months with holiday dates filled blue. */
export function HolidayCalendar({ year, holidays, today }: { year: number; holidays: HolidayRow[]; today: string }) {
  const byDate = new Map(holidays.map((h) => [h.holiday_date, h]));
  return (
    <div className="grid gap-x-8 gap-y-6 p-[18px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`).map((m) => (
        <MiniMonth key={m} month={m} byDate={byDate} today={today} />
      ))}
    </div>
  );
}
