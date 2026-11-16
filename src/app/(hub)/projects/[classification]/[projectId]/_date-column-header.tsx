"use client";

import { cn } from "@/lib/utils";
import { LABEL_WIDTH, addDays } from "./_gantt-shared";
import { useGanttZoom } from "./_gantt-zoom-context";

function DayCell({ date, isToday, width }: { date: Date; isToday: boolean; width: number }) {
  return (
    <div
      className={cn("flex h-12 shrink-0 flex-col items-center justify-center border-r border-[#EDF0F7]", isToday && "bg-[#FFEFE3]")}
      style={{ width }}
    >
      <div className={cn("font-mono text-[9px] tracking-wide", isToday ? "font-bold text-[#FB914E]" : "text-[#5F6A88]")}>
        {date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
      </div>
      <div className={cn("text-[11px] font-semibold", isToday ? "text-[#FB914E]" : "text-[#3A4565]")}>{date.getDate()}</div>
    </div>
  );
}

// Week zoom: one cell per 7 columns (aligned to the grid's first day), labelled with its first date.
function WeekCell({ date, days, hasToday, width }: { date: Date; days: number; hasToday: boolean; width: number }) {
  return (
    <div
      className={cn("flex h-12 shrink-0 flex-col items-start justify-center border-r border-[#EDF0F7] px-1.5", hasToday && "bg-[#FFEFE3]")}
      style={{ width: days * width }}
    >
      <div className={cn("font-mono text-[9px] tracking-wide", hasToday ? "font-bold text-[#FB914E]" : "text-[#5F6A88]")}>
        {date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
      </div>
      <div className={cn("text-[11px] font-semibold", hasToday ? "text-[#FB914E]" : "text-[#3A4565]")}>{date.getDate()}</div>
    </div>
  );
}

// The Timeline grid's sticky-label + date header row, for both engines. `data-gantt-header` marks it
// as the one region where plain vertical wheel input pans the grid (see useGanttScroll).
export function GridHeader({ startDate, totalDays, todayDay }: { startDate: Date; totalDays: number; todayDay: number }) {
  const { zoom, dayWidth } = useGanttZoom();
  const cells = [];
  if (zoom === "week") {
    for (let day = 1; day <= totalDays; day += 7) {
      const span = Math.min(7, totalDays - day + 1);
      cells.push(<WeekCell key={day} date={addDays(startDate, day - 1)} days={span} hasToday={todayDay >= day && todayDay < day + span} width={dayWidth} />);
    }
  } else {
    for (let day = 1; day <= totalDays; day++) {
      cells.push(<DayCell key={day} date={addDays(startDate, day - 1)} isToday={day === todayDay} width={dayWidth} />);
    }
  }
  return (
    <div data-gantt-header className="flex border-b border-[#E2E7F2]">
      <div className="sticky left-0 shrink-0 border-r z-3 border-[#E2E7F2] bg-white" style={{ width: LABEL_WIDTH }} />
      {cells}
    </div>
  );
}
