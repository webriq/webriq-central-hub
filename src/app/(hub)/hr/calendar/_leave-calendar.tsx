"use client";

import { useMemo, useState } from "react";
import { formatDate, formatShort, monthLabel, startOfWeek, addDays } from "@/lib/hr/dates";
import type { CalendarLeave, HolidayRow } from "@/lib/hr/types";
import { Panel } from "../_components/page-shell";
import { Bone } from "../_components/skeleton";
import { WhosOutList } from "../_components/whos-out-list";
import { rangeFor, shiftAnchor, type CalendarMode } from "./_calendar-range";
import { CalendarToolbar } from "./_calendar-toolbar";
import { MonthGrid } from "./_month-grid";
import { useCalendarData } from "./_use-calendar-data";
import { WeekView } from "./_week-view";

interface Initial { leaves: CalendarLeave[]; holidays: HolidayRow[] }

export function LeaveCalendar({ today, initial }: { today: string; initial: Initial }) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(today);
  const [person, setPerson] = useState("");
  const [type, setType] = useState("");
  const range = rangeFor(mode, anchor);
  const { leaves, holidays, loading, error } = useCalendarData(range, { range: rangeFor("month", today), data: initial });

  const holidayMap = useMemo(() => new Map(holidays.map((h) => [h.holiday_date, h])), [holidays]);
  const holidayDates = useMemo(() => new Set(holidayMap.keys()), [holidayMap]);
  const people = useMemo(() => [...new Map(leaves.map((l) => [l.employee_id, l.employee_name])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), [leaves]);
  const types = useMemo(() => [...new Set(leaves.map((l) => l.leave_type_name))].sort(), [leaves]);
  const shown = useMemo(() => leaves.filter((l) => (!person || l.employee_id === person) && (!type || l.leave_type_name === type)), [leaves, person, type]);

  const label = mode === "month" ? monthLabel(anchor) : mode === "day" ? formatDate(anchor)
    : `${formatShort(startOfWeek(anchor))} – ${formatDate(addDays(startOfWeek(anchor), 6))}`;
  const pick = (d: string) => { setAnchor(d); setMode("day"); };

  return (
    <Panel>
      <CalendarToolbar
        label={label} mode={mode} onMode={setMode}
        onPrev={() => setAnchor((a) => shiftAnchor(mode, a, -1))} onNext={() => setAnchor((a) => shiftAnchor(mode, a, 1))} onToday={() => setAnchor(today)}
        people={people} person={person} onPerson={setPerson} types={types} type={type} onType={setType}
      />
      {error && <p role="alert" className="border-b border-[#EDF0F7] bg-[#FDE8E6] px-[18px] py-2 text-[12px] text-[#C0392B]">{error} Try the arrows again.</p>}
      {loading ? (
        <div className="flex flex-col gap-2 p-[18px]" aria-busy="true"><Bone className="h-8 w-full" /><Bone className="h-40 w-full" /></div>
      ) : mode === "month" ? (
        <MonthGrid anchor={anchor} today={today} leaves={shown} holidays={holidayMap} onPickDay={pick} />
      ) : mode === "week" ? (
        <WeekView anchor={anchor} today={today} leaves={shown} holidays={holidayMap} onPickDay={pick} />
      ) : (
        <WhosOutList date={anchor} leaves={shown.filter((l) => l.start_date <= anchor && anchor <= l.end_date)} holiday={holidayMap.get(anchor)} holidayDates={holidayDates} />
      )}
    </Panel>
  );
}
