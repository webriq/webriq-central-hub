"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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

const cardCls = "bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)]";

export default function TimelogsContent() {
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
          <h1 className="text-base font-bold text-slate-900">Time Logs</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {loading ? "Loading…" : `${fmtMinutes(totalLogged)} total ${range === "week" ? "this week" : "today"}`}
          </p>
        </div>
        <div className="flex rounded overflow-hidden border border-slate-200 text-[11px] font-semibold">
          {(["today", "week"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1.5 border-none cursor-pointer font-[inherit] capitalize",
                range === r ? "bg-brand text-white" : "bg-white text-slate-500 hover:bg-slate-50"
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
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-lg" />)}
          </div>
        ) : timeLogs.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No time logged {range === "today" ? "today" : "this week"}.</p>
        ) : (
          Object.values(logsByProject).map((group, gi, arr) => (
            <div key={group.project.id} className={cn("pt-2", gi < arr.length - 1 && "pb-3 mb-2 border-b border-slate-100")}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{group.project.name}</span>
                <span className="text-[11px] font-bold text-brand">{fmtMinutes(minutesForLogs(group.logs))}</span>
              </div>
              {group.logs.map((e) => (
                <div key={e.id} className="flex justify-between items-center py-1.5 pl-3 border-b border-slate-50 last:border-0">
                  <span className="text-[13px] text-slate-700 truncate">{e.task?.name ?? "—"}</span>
                  <span className="text-[13px] font-semibold text-slate-500 shrink-0 ml-4">{e.log_hours}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
