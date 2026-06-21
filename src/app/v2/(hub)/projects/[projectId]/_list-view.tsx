"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Flag } from "lucide-react";
import {
  type Task, type Milestone, type TaskStatus, type TaskPriority,
  STATUS_LABEL, STATUS_STYLE, PRIORITY_STYLE, AssigneeChip, formatDueDate,
} from "../_pm-shared";

type SortKey = "title" | "status" | "priority" | "due_date";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const STATUS_ORDER: Record<TaskStatus, number> = {
  open: 0, in_progress: 1, ready_for_qa: 2, testing_completed: 3, for_client_approval: 4, ready_to_merge: 5, post_live_qa: 6, closed: 7,
};

const STATUS_OPTS: TaskStatus[] = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"];
const PRIORITY_OPTS: TaskPriority[] = ["low", "normal", "high", "critical"];

export default function ListView({
  tasks,
  milestones,
  onOpen,
  onUpdate,
}: {
  tasks: Task[];
  milestones: Milestone[];
  onOpen: (task: Task) => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function sortTasks(list: Task[]): Task[] {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      else if (sortKey === "status") cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      else if (sortKey === "priority") cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      else if (sortKey === "due_date") cmp = (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
      return cmp * dir;
    });
  }

  // Group tasks by milestone (+ "No milestone" bucket).
  const groups = useMemo(() => {
    const out: { id: string; name: string; tasks: Task[] }[] = [];
    for (const m of milestones) {
      const ts = tasks.filter((t) => t.milestone_id === m.id);
      if (ts.length) out.push({ id: m.id, name: m.name, tasks: sortTasks(ts) });
    }
    const none = tasks.filter((t) => !t.milestone_id);
    if (none.length) out.push({ id: "__none", name: "No milestone", tasks: sortTasks(none) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, milestones, sortKey, sortDir]);

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[13px] text-slate-400">No tasks yet.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-5">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_140px_120px_110px_100px] items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <SortHeader label="Task" active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")} />
          <SortHeader label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} />
          <SortHeader label="Priority" active={sortKey === "priority"} dir={sortDir} onClick={() => toggleSort("priority")} />
          <SortHeader label="Due" active={sortKey === "due_date"} dir={sortDir} onClick={() => toggleSort("due_date")} />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Assignees</span>
        </div>

        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.id);
          return (
            <div key={g.id}>
              <button
                onClick={() => toggleGroup(g.id)}
                className="w-full flex items-center gap-2 px-4 py-2 bg-slate-50/60 border-b border-slate-100 hover:bg-slate-100 cursor-pointer"
              >
                {isCollapsed ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                <Flag size={12} className="text-slate-400" />
                <span className="text-[12px] font-semibold text-slate-600">{g.name}</span>
                <span className="text-[11px] font-mono text-slate-400">{g.tasks.length}</span>
              </button>
              {!isCollapsed && g.tasks.map((t) => (
                <Row key={t.id} task={t} onOpen={() => onOpen(t)} onUpdate={onUpdate} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700 cursor-pointer">
      {label}
      {active && <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

function Row({ task, onOpen, onUpdate }: { task: Task; onOpen: () => void; onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean> }) {
  const due = formatDueDate(task.due_date);
  const ss = STATUS_STYLE[task.status];
  const ps = PRIORITY_STYLE[task.priority];

  return (
    <div className="grid grid-cols-[1fr_140px_120px_110px_100px] items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
      <button onClick={onOpen} className="text-left min-w-0 cursor-pointer">
        <span className="text-[13px] text-slate-800 truncate block hover:text-blue-600">{task.title}</span>
      </button>

      {/* Inline status */}
      <select
        value={task.status}
        onChange={(e) => onUpdate(task.id, { status: e.target.value as TaskStatus })}
        className="text-[11px] font-medium rounded-full border px-2 py-0.5 outline-none cursor-pointer appearance-none"
        style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
      >
        {STATUS_OPTS.map((s) => <option key={s} value={s} className="bg-white text-slate-700">{STATUS_LABEL[s]}</option>)}
      </select>

      {/* Inline priority */}
      <select
        value={task.priority}
        onChange={(e) => onUpdate(task.id, { priority: e.target.value as TaskPriority })}
        className="text-[12px] font-medium bg-transparent outline-none cursor-pointer capitalize"
        style={{ color: ps.text }}
      >
        {PRIORITY_OPTS.map((p) => <option key={p} value={p} className="text-slate-700">{p}</option>)}
      </select>

      <span className="text-[12px] text-slate-500">{due ?? "—"}</span>

      <div className="flex items-center">
        {(task.assignees ?? []).slice(0, 3).map((a, i) => (
          <div key={a} style={{ marginLeft: i > 0 ? -8 : 0 }}><AssigneeChip id={a} idx={i} /></div>
        ))}
        {(!task.assignees || task.assignees.length === 0) && <span className="text-[12px] text-slate-300">—</span>}
      </div>
    </div>
  );
}
