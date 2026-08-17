"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePMSettings } from "@/hooks/use-pm-settings";
import type { ZohoTimeLog } from "@/lib/zoho";

type TimelogsData = {
  timeLogs: ZohoTimeLog[];
};

type ProjectGroup = { project: { id: string; name: string }; logs: ZohoTimeLog[] };

function minutesForLogs(logs: ZohoTimeLog[]): number {
  return logs.reduce((sum, log) => {
    const [h, m] = (log.log_hours ?? "0:00").split(":").map(Number);
    return sum + (h || 0) * 60 + (m || 0);
  }, 0);
}

function fmtMinutes(mins: number): string {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function TimelogsContent() {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  const cardCls = isDark
    ? "bg-[#121726] border border-white/[0.08] rounded-xl"
    : "bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)]";
  const [data, setData] = useState<TimelogsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"today" | "week">("today");

  useEffect(() => {
    let cancelled = false;
    async function fetchLogs() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dev/tasks?range=${range}`);
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData({ timeLogs: json.timeLogs ?? [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchLogs();
    return () => { cancelled = true; };
  }, [range]);

  const timeLogs = data?.timeLogs ?? [];

  const logsByProject = timeLogs.reduce<Record<string, ProjectGroup>>((acc, log) => {
    if (!acc[log.project.id]) acc[log.project.id] = { project: log.project, logs: [] };
    acc[log.project.id].logs.push(log);
    return acc;
  }, {});

  const totalLogged = minutesForLogs(timeLogs);

  return (
    <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
      {/* Header */}
      <div className={cn(cardCls, "px-6 py-4 flex items-center justify-between")}>
        <div>
          <h1 className={cn("text-base font-bold", isDark ? "text-white" : "text-slate-900")}>Time Logs</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {loading ? "Loading…" : `${fmtMinutes(totalLogged)} total ${range === "week" ? "this week" : "today"}`}
          </p>
        </div>
        <div className={cn("flex rounded overflow-hidden border text-[11px] font-semibold", isDark ? "border-white/[0.08]" : "border-slate-200")}>
          {(["today", "week"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1.5 border-none cursor-pointer font-[inherit] capitalize",
                range === r ? "bg-brand text-white" : (isDark ? "bg-white/5 text-slate-400 hover:bg-white/10" : "bg-white text-slate-500 hover:bg-slate-50")
              )}
            >
              {r === "today" ? "Today" : "This Week"}
            </button>
          ))}
        </div>
      </div>

      {/* Log entries */}
      <div className={cn(cardCls, "p-[16px_18px]")}>
        {loading ? (
          <div className="flex flex-col gap-2 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className={cn("h-12 rounded-lg", isDark ? "bg-white/10" : "bg-slate-100")} />)}
          </div>
        ) : timeLogs.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No time logged {range === "today" ? "today" : "this week"}.</p>
        ) : (
          Object.values(logsByProject).map((group, gi, arr) => (
            <div key={group.project.id} className={cn("pt-2", gi < arr.length - 1 && (isDark ? "pb-3 mb-2 border-b border-white/[0.06]" : "pb-3 mb-2 border-b border-slate-100"))}>
              <div className="flex justify-between items-center mb-2">
                <span className={cn("text-[11px] font-bold uppercase tracking-wide", isDark ? "text-slate-400" : "text-slate-600")}>{group.project.name}</span>
                <span className="text-[11px] font-bold text-brand">{fmtMinutes(minutesForLogs(group.logs))}</span>
              </div>
              {group.logs.map((e) => (
                <div key={e.id} className={cn("flex justify-between items-center py-1.5 pl-3 border-b last:border-0", isDark ? "border-white/[0.04]" : "border-slate-50")}>
                  <span className={cn("text-[13px] truncate", isDark ? "text-slate-300" : "text-slate-700")}>{e.task?.name ?? "—"}</span>
                  <span className={cn("text-[13px] font-semibold shrink-0 ml-4", isDark ? "text-slate-400" : "text-slate-500")}>{e.log_hours}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
