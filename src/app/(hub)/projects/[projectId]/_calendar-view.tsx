"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { type Task, PRIORITY_STYLE } from "../_pm-shared";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarView({
  tasks,
  onOpen,
  onAddOnDay,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onAddOnDay: (due_date: string) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // Map due_date → tasks.
  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const list = map.get(t.due_date) ?? [];
      list.push(t);
      map.set(t.due_date, list);
    }
    return map;
  }, [tasks]);

  // Build the 6-week grid of dates.
  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    const out: Date[][] = [];
    for (let i = 0; i < 6; i++) out.push(days.slice(i * 7, i * 7 + 7));
    return out;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayStr = ymd(today);
  const unscheduled = tasks.filter((t) => !t.due_date).length;

  return (
    <div className="h-full overflow-y-auto px-8 py-5">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-1.5 rounded-full border border-[#E2E7F2] bg-white text-[#5F6A88] hover:bg-[#F0F7FF] transition-colors cursor-pointer">
            <ChevronLeft size={16} />
          </button>
          <span className="font-heading text-[15px] font-semibold text-[#0B1533] min-w-[160px] text-center">{monthLabel}</span>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-1.5 rounded-full border border-[#E2E7F2] bg-white text-[#5F6A88] hover:bg-[#F0F7FF] transition-colors cursor-pointer">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="ml-2 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] transition-colors cursor-pointer">
            Today
          </button>
        </div>
        {unscheduled > 0 && (
          <span className="text-[12px] text-[#5F6A88]">{unscheduled} task{unscheduled === 1 ? "" : "s"} without a due date</span>
        )}
      </div>

      {/* Grid */}
      <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[#EDF0F7] bg-[#FAFBFE]">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-[11px] font-semibold text-[#5F6A88] uppercase tracking-wide text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((d, i) => {
            const dateStr = ymd(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = dateStr === todayStr;
            const dayTasks = byDate.get(dateStr) ?? [];
            return (
              <div
                key={i}
                className={`group min-h-[104px] border-b border-r border-[#EDF0F7] p-1.5 flex flex-col gap-1 ${
                  inMonth ? "bg-white" : "bg-[#F4F6FB]/50"
                } ${(i + 1) % 7 === 0 ? "border-r-0" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday ? "bg-[#007BFF] text-white" : inMonth ? "text-[#3A4565]" : "text-[#C7CEDD]"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <button
                    onClick={() => onAddOnDay(dateStr)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#EDF0F7] cursor-pointer transition-opacity"
                    title="Add task"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  {dayTasks.slice(0, 3).map((t) => {
                    const p = PRIORITY_STYLE[t.priority];
                    return (
                      <button
                        key={t.id}
                        onClick={() => onOpen(t)}
                        className="flex items-center gap-1 text-left px-1.5 py-1 rounded bg-[#F4F6FB] hover:bg-[#F0F7FF] border border-[#EDF0F7] cursor-pointer transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.dot }} />
                        <span className="text-[11px] text-[#3A4565] truncate">{t.title}</span>
                      </button>
                    );
                  })}
                  {dayTasks.length > 3 && (
                    <span className="text-[10px] text-[#5F6A88] pl-1">+{dayTasks.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
