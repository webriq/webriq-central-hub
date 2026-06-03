"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePMSettings } from "@/hooks/use-pm-settings";
import type { ZohoTask, ZohoTimeLog } from "@/lib/zoho";

type DevData = {
  myTasks: ZohoTask[];
  unassignedTasks: ZohoTask[];
  timeLogs: ZohoTimeLog[];
  warning?: string;
};

function parseZohoDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function isOverdue(task: ZohoTask): boolean {
  if (task.completed) return false;
  const due = parseZohoDate(task.due_date);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

const PRIORITY_CLS: Record<string, string> = {
  critical: "text-red-700 bg-red-50",
  high:     "text-orange-700 bg-orange-50",
  normal:   "text-sky-700 bg-sky-50",
  medium:   "text-orange-700 bg-orange-50",
  low:      "text-green-700 bg-green-50",
  none:     "text-sky-700 bg-sky-50",
};
const PRIORITY_CLS_DARK: Record<string, string> = {
  critical: "text-red-400 bg-red-500/15",
  high:     "text-orange-400 bg-orange-500/15",
  normal:   "text-sky-400 bg-sky-500/15",
  medium:   "text-orange-400 bg-orange-500/15",
  low:      "text-green-400 bg-green-500/15",
  none:     "text-sky-400 bg-sky-500/15",
};

function priorityClass(p: string, isDark: boolean) {
  const key = p.toLowerCase();
  return isDark
    ? (PRIORITY_CLS_DARK[key] ?? "text-slate-400 bg-slate-500/15")
    : (PRIORITY_CLS[key] ?? "text-slate-500 bg-slate-50");
}

function buildZohoLink(task: ZohoTask): string | null {
  if (task.link?.web?.url) return task.link.web.url;
  const portalName = process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME ?? "";
  if (!portalName) return null;
  return `https://projects.zoho.com/portal/${portalName}/project/${task.project.id}/tasks/all/task/${task.id}/`;
}

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

function TaskSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className={cn("h-10 rounded-lg", isDark ? "bg-white/10" : "bg-slate-100")} />
      ))}
    </div>
  );
}

export default function DevDashboard() {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  const cardCls = isDark
    ? "bg-[#121726] border border-white/[0.08] rounded-xl"
    : "bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)]";
  const [data, setData] = useState<DevData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"today" | "week">("today");
  const [assigningIds, setAssigningIds] = useState<Set<string>>(new Set());
  const [assignError, setAssignError] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchTasks() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dev/tasks?range=${range}`);
        if (res.ok && !cancelled) setData(await res.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchTasks();
    return () => { cancelled = true; };
  }, [range]);

  async function handleAssign(task: ZohoTask) {
    setAssignError(null);
    setAssigningIds((prev) => new Set(prev).add(task.id));

    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        unassignedTasks: prev.unassignedTasks.filter((t) => t.id !== task.id),
        myTasks: [{ ...task, details: undefined }, ...prev.myTasks],
      };
    });

    const res = await fetch("/api/dev/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: task.project.id,
        taskId: task.id,
        taskName: task.name,
        projectName: task.project.name,
      }),
    });

    if (!res.ok) {
      // Roll back optimistic update
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          myTasks: prev.myTasks.filter((t) => t.id !== task.id),
          unassignedTasks: [task, ...prev.unassignedTasks],
        };
      });
      setAssignError("Failed to assign task — please try again.");
    }

    setAssigningIds((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
  }

  async function askWithQuery(q: string) {
    if (!q.trim()) return;
    setAiQuery(q);
    setAiLoading(true);
    setAiAnswer(null);
    const res = await fetch("/api/dev/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    if (res.ok) {
      const json = await res.json();
      setAiAnswer(json.answer ?? "No response.");
    } else {
      setAiAnswer("Failed to get an answer — please try again.");
    }
    setAiLoading(false);
  }

  function handleAsk() { askWithQuery(aiQuery); }

  const myTasks = data?.myTasks ?? [];
  const unassignedTasks = data?.unassignedTasks ?? [];
  const timeLogs = data?.timeLogs ?? [];

  const overdueCount = myTasks.filter(isOverdue).length;

  const logsByProject = timeLogs.reduce<Record<string, ProjectGroup>>((acc, log) => {
    if (!acc[log.project.id]) acc[log.project.id] = { project: log.project, logs: [] };
    acc[log.project.id].logs.push(log);
    return acc;
  }, {});

  const totalLogged = minutesForLogs(timeLogs);
  const loggedDisplay = fmtMinutes(totalLogged);

  return (
    <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
      {/* Summary strip */}
      <div className={cn(cardCls, "px-6 py-3.5 flex items-center")}>
        {[
          { val: loading ? "—" : String(myTasks.length),         label: "Open Tasks",   highlight: false },
          null,
          { val: loading ? "—" : String(overdueCount),           label: "Overdue",      highlight: overdueCount > 0 },
          null,
          { val: loading ? "—" : String(unassignedTasks.length), label: "Unassigned",   highlight: false },
          null,
          { val: loading ? "—" : loggedDisplay,                  label: range === "week" ? "Logged This Week" : "Logged Today", highlight: false },
        ].map((item, i) =>
          item === null ? (
            <div key={i} className={cn("w-px h-9 shrink-0", isDark ? "bg-white/10" : "bg-slate-100")} />
          ) : (
            <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
              <span className={cn("text-[22px] font-extrabold tracking-[-0.02em]", item.highlight ? "text-red-500" : (isDark ? "text-white" : "text-slate-900"))}>
                {item.val}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">{item.label}</span>
            </div>
          )
        )}
      </div>

      {/* Two-col */}
      <div className="flex gap-3.5 items-start">
        {/* My Tasks */}
        <div className={cn(cardCls, "p-[16px_18px] flex-1")}>
          <div className="flex justify-between items-center mb-3">
            <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-900")}>My Tasks</span>
          </div>
          {loading ? <TaskSkeleton isDark={isDark} /> : myTasks.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No open tasks assigned to you.</p>
          ) : (
            <div className="flex flex-col">
              {myTasks.map((t, i) => {
                const overdue = isOverdue(t);
                const link = buildZohoLink(t);
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "flex items-center gap-2.5 py-2.5",
                      i < myTasks.length - 1 && (isDark ? "border-b border-white/[0.06]" : "border-b border-slate-100"),
                      overdue && "border-l-2 border-l-red-400 pl-2"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-[13px] font-medium leading-tight", isDark ? "text-slate-200" : "text-slate-900")}>
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer"
                            className="hover:text-indigo-600 transition-colors">
                            {t.name}
                          </a>
                        ) : t.name}
                      </div>
                      <div className={cn("text-[11px] mt-0.5", overdue ? "text-red-500 font-semibold" : "text-slate-400")}>
                        {t.project.name}
                        {t.due_date ? ` · Due ${t.due_date}${overdue ? " · OVERDUE" : ""}` : ""}
                      </div>
                    </div>
                    <span className={cn("text-[10px] font-bold px-1.5 py-px rounded shrink-0", priorityClass(t.priority, isDark))}>
                      {t.priority === "none" ? "NORMAL" : t.priority.toUpperCase()}
                    </span>
                    <span className={cn("text-[10px] font-semibold px-1.5 py-px rounded shrink-0", isDark ? "bg-white/10 text-slate-400" : "bg-slate-100 text-slate-500")}>
                      {t.status.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3.5 min-w-60 max-w-72">
          {/* Unassigned tasks */}
          <div className={cn(cardCls, "p-[16px_18px]")}>
            <div className="flex justify-between items-center mb-3">
              <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-900")}>Team Unassigned</span>
            </div>
            {assignError && (
              <p className="text-xs text-red-500 mb-2">{assignError}</p>
            )}
            {loading ? <TaskSkeleton isDark={isDark} /> : unassignedTasks.length === 0 ? (
              <p className="text-sm text-slate-400 py-2 text-center">No unassigned tasks.</p>
            ) : (
              unassignedTasks.map((t, i) => (
                <div key={t.id} className={cn("py-2", i < unassignedTasks.length - 1 && (isDark ? "border-b border-white/[0.06]" : "border-b border-slate-100"))}>
                  <div className="flex justify-between items-start gap-1.5">
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-[13px] font-medium leading-tight", isDark ? "text-slate-200" : "text-slate-900")}>{t.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{t.project.name}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("text-[10px] font-bold px-1.5 py-px rounded", priorityClass(t.priority, isDark))}>
                        {t.priority === "none" ? "NORMAL" : t.priority.toUpperCase()}
                      </span>
                      <button
                        onClick={() => handleAssign(t)}
                        disabled={assigningIds.has(t.id)}
                        className={cn("text-[10px] font-semibold px-2 py-px rounded border-none cursor-pointer font-[inherit] transition-colors disabled:opacity-50 disabled:cursor-not-allowed", isDark ? "bg-brand/15 text-brand hover:bg-brand/25" : "bg-indigo-50 text-brand hover:bg-indigo-100")}
                      >
                        {assigningIds.has(t.id) ? "…" : "Assign to me"}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Time logged */}
          <div className={cn(cardCls, "p-[16px_18px]")}>
            <div className="flex justify-between items-center mb-3">
              <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-900")}>Time Logged</span>
              <div className={cn("flex rounded overflow-hidden border text-[10px] font-semibold", isDark ? "border-white/[0.08]" : "border-slate-200")}>
                {(["today", "week"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRange(r); }}
                    className={cn(
                      "px-2 py-0.5 border-none cursor-pointer font-[inherit] capitalize",
                      range === r ? "bg-brand text-white" : (isDark ? "bg-white/5 text-slate-400 hover:bg-white/10" : "bg-white text-slate-500 hover:bg-slate-50")
                    )}
                  >
                    {r === "today" ? "Today" : "Week"}
                  </button>
                ))}
              </div>
            </div>
            {loading ? <TaskSkeleton isDark={isDark} /> : timeLogs.length === 0 ? (
              <p className="text-sm text-slate-400 py-2 text-center">No time logged.</p>
            ) : (
              Object.values(logsByProject).map((group, gi, arr) => (
                <div key={group.project.id} className={cn("pt-1.5", gi < arr.length - 1 && (isDark ? "pb-2 mb-1 border-b border-white/[0.06]" : "pb-2 mb-1 border-b border-slate-100"))}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{group.project.name}</span>
                    <span className="text-[11px] font-bold text-brand">{fmtMinutes(minutesForLogs(group.logs))}</span>
                  </div>
                  {group.logs.map((e) => (
                    <div key={e.id} className="flex justify-between items-center py-0.5 pl-2">
                      <span className={cn("text-xs truncate", isDark ? "text-slate-300" : "text-slate-700")}>{e.task?.name ?? "—"}</span>
                      <span className="text-xs font-semibold text-slate-500 shrink-0 ml-2">{e.log_hours}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* AI prompt widget */}
      <div className={cn(cardCls, "overflow-hidden")}>
        <button
          onClick={() => setAiOpen((v) => !v)}
          className={cn("w-full px-4 py-3 flex justify-between items-center border-none cursor-pointer font-[inherit] text-left", isDark ? "bg-[#121726] text-slate-300" : "bg-white text-slate-700")}
        >
          <span className="text-sm font-semibold">Ask about your work</span>
          <span className="text-xs text-slate-400">{aiOpen ? "▲" : "▼"}</span>
        </button>
        {aiOpen && (
          <div className={cn("px-4 pb-4 border-t", isDark ? "border-white/[0.06]" : "border-slate-100")}>
            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-1.5 pt-3 mb-3">
              {[
                "What open tasks do I have?",
                "Show my pending tickets",
                "How many hours did I log today?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => askWithQuery(q)}
                  className={cn("text-[11px] px-2.5 py-1 rounded-full border-none cursor-pointer font-[inherit] transition-colors", isDark ? "bg-brand/15 text-brand hover:bg-brand/25" : "bg-indigo-50 text-brand hover:bg-indigo-100")}
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
                placeholder="Ask a question about your tasks…"
                className={cn("flex-1 text-sm rounded-lg px-3 py-2 outline-none focus:border-brand font-[inherit] border", isDark ? "border-white/[0.08] bg-white/5 text-slate-200 placeholder:text-slate-500" : "border-slate-200 text-slate-900 bg-white")}
              />
              <button
                onClick={handleAsk}
                disabled={aiLoading || !aiQuery.trim()}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg border-none cursor-pointer font-[inherit] disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {aiLoading ? "…" : "Ask"}
              </button>
            </div>
            {aiAnswer && (
              <p className={cn("mt-3 text-sm rounded-lg px-3 py-2.5 leading-relaxed", isDark ? "text-slate-300 bg-white/5" : "text-slate-700 bg-slate-50")}>
                {aiAnswer}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
