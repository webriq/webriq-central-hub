"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePMSettings } from "@/hooks/use-pm-settings";
import type { ZohoTask } from "@/lib/zoho";

type DevTasksData = {
  myTasks: ZohoTask[];
  unassignedTasks: ZohoTask[];
  warning?: string;
};

function isOverdue(task: ZohoTask): boolean {
  if (task.completed) return false;
  const due = task.due_date ? new Date(task.due_date) : null;
  if (!due || isNaN(due.getTime())) return false;
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

function TaskSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className={cn("h-10 rounded-lg", isDark ? "bg-white/10" : "bg-slate-100")} />
      ))}
    </div>
  );
}

export default function DevTasksContent() {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  const cardCls = isDark
    ? "bg-[#121726] border border-white/[0.08] rounded-xl"
    : "bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)]";

  const [data, setData] = useState<DevTasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigningIds, setAssigningIds] = useState<Set<string>>(new Set());
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchTasks() {
      setLoading(true);
      try {
        const res = await fetch("/api/dev/tasks?range=today");
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData({ myTasks: json.myTasks ?? [], unassignedTasks: json.unassignedTasks ?? [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchTasks();
    return () => { cancelled = true; };
  }, []);

  async function handleAssign(task: ZohoTask) {
    setAssignError(null);
    setAssigningIds((prev) => new Set(prev).add(task.id));

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

  const myTasks = data?.myTasks ?? [];
  const unassignedTasks = data?.unassignedTasks ?? [];

  return (
    <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
      <div className="flex gap-3.5 items-start">
        {/* My Tasks */}
        <div className={cn(cardCls, "p-[16px_18px] flex-1")}>
          <div className="flex justify-between items-center mb-3">
            <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-900")}>My Tasks</span>
            {!loading && <span className="text-xs text-slate-400">{myTasks.length} open</span>}
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
                            className="hover:text-indigo-400 transition-colors">
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

        {/* Team Unassigned */}
        <div className={cn(cardCls, "p-[16px_18px] min-w-60 max-w-72")}>
          <div className="flex justify-between items-center mb-3">
            <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-900")}>Team Unassigned</span>
          </div>
          {assignError && <p className="text-xs text-red-500 mb-2">{assignError}</p>}
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
      </div>
    </div>
  );
}
