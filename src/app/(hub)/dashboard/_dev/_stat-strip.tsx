"use client";

import React from "react";
import { AlertTriangle, CalendarDays, CalendarRange, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHoursAsHHMM, formatHoursInWords } from "@/lib/timer/format";

// Task 360 — the four-tile stat strip. Pure render: every number is computed once by
// `_dev-dashboard.tsx` and handed down, so this file never touches the raw item list.

export type DevStats = {
  dueTodayCount: number;
  dueTodayTasks: number;
  dueTodayIssues: number;
  inProgressCount: number;
  inProgressTasks: number;
  inProgressIssues: number;
  overdueCount: number;
  oldestOverdueDays: number;
  hoursToday: number;
  hoursTodayItemCount: number;
};

function StatCard({
  label,
  icon,
  iconClass,
  value,
  valueClass,
  sub,
  valueTitle,
}: {
  label: string;
  icon: React.ReactNode;
  iconClass: string;
  value: React.ReactNode;
  valueClass?: string;
  sub: React.ReactNode;
  valueTitle?: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] px-[18px] py-4 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-[12.5px] font-medium text-[#5F6A88] truncate">{label}</span>
        <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", iconClass)}>{icon}</span>
      </div>
      <div
        className={cn("font-heading text-[27px] font-bold leading-none tracking-[-0.02em] text-[#0B1533]", valueClass)}
        title={valueTitle}
      >
        {value}
      </div>
      <div className="text-[11.5px] text-[#5F6A88] mt-1.5">{sub}</div>
    </div>
  );
}

export default function DevStatStrip({ stats }: { stats: DevStats }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
      <StatCard
        label="Due today"
        icon={<CalendarDays size={15} />}
        iconClass="bg-[#FFF3D6] text-[#8A5A00]"
        value={stats.dueTodayCount}
        sub={
          stats.dueTodayCount > 0
            ? `${stats.dueTodayTasks} ${stats.dueTodayTasks === 1 ? "task" : "tasks"} · ${stats.dueTodayIssues} ${stats.dueTodayIssues === 1 ? "issue" : "issues"}`
            : "Nothing due today"
        }
      />
      <StatCard
        label="In progress"
        icon={<Clock3 size={15} />}
        iconClass="bg-[#E5F1FF] text-[#0063D6]"
        value={stats.inProgressCount}
        sub={
          stats.inProgressCount > 0
            ? `${stats.inProgressTasks} ${stats.inProgressTasks === 1 ? "task" : "tasks"} · ${stats.inProgressIssues} ${stats.inProgressIssues === 1 ? "issue" : "issues"}`
            : "Nothing in progress"
        }
      />
      <StatCard
        label="Overdue"
        icon={<AlertTriangle size={15} />}
        iconClass="bg-[#FDE8E6] text-[#C0392B]"
        value={stats.overdueCount}
        valueClass={stats.overdueCount > 0 ? "text-[#C0392B]" : undefined}
        sub={
          stats.overdueCount > 0
            ? `Oldest: ${stats.oldestOverdueDays} ${stats.oldestOverdueDays === 1 ? "day" : "days"} late`
            : "Nothing overdue"
        }
      />
      <StatCard
        label="Logged today"
        icon={<CalendarRange size={15} />}
        iconClass="bg-[#E3F5EA] text-[#177E48]"
        value={formatHoursAsHHMM(stats.hoursToday)}
        valueClass="font-mono text-[24px]"
        valueTitle={formatHoursInWords(stats.hoursToday)}
        sub={
          stats.hoursTodayItemCount > 0
            ? `across ${stats.hoursTodayItemCount} ${stats.hoursTodayItemCount === 1 ? "item" : "items"}`
            : "No time logged yet"
        }
      />
    </section>
  );
}
