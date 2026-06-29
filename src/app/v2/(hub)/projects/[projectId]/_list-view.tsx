"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Users, X } from "lucide-react";
import {
  type Task, type Tasklist, type TaskStatus, type TaskPriority,
  STATUS_LABEL, STATUS_STYLE, PRIORITY_STYLE, AssigneeChip, formatDueDate,
  normalizeStatus,
} from "../_pm-shared";

type SortKey = "title" | "status" | "priority" | "due_date";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3, none: 4 };
const STATUS_ORDER: Record<string, number> = {
  open: 0, in_progress: 1, ready_for_qa: 2, testing_completed: 3,
  for_client_approval: 4, ready_to_merge: 5, post_live_qa: 6, closed: 7,
};

const STATUS_OPTS: TaskStatus[] = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
];

function getDueColor(due: string | null): string {
  if (!due) return "text-slate-400";
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-red-500";
  if (days <= 7) return "text-orange-500";
  return "text-slate-500";
}

export default function ListView({
  tasks,
  tasklists,
  onOpen,
  onUpdate,
}: {
  tasks: Task[];
  tasklists: Tasklist[];
  onOpen: (task: Task) => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleGroup(groupId: string, ids: string[]) {
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function sortTasks(list: Task[]): Task[] {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title")    cmp = a.title.localeCompare(b.title);
      else if (sortKey === "status")   cmp = (STATUS_ORDER[normalizeStatus(a.status)] ?? 0) - (STATUS_ORDER[normalizeStatus(b.status)] ?? 0);
      else if (sortKey === "priority") cmp = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
      else if (sortKey === "due_date") cmp = (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
      return cmp * dir;
    });
  }

  const groups = useMemo(() => {
    const tasklistIds = new Set(tasklists.map((tl) => tl.id));
    const buckets = new Map<string, Task[]>();
    const unassigned: Task[] = [];

    for (const t of tasks) {
      if (t.tasklist_id && tasklistIds.has(t.tasklist_id)) {
        const bucket = buckets.get(t.tasklist_id) ?? [];
        bucket.push(t);
        buckets.set(t.tasklist_id, bucket);
      } else {
        unassigned.push(t);
      }
    }

    const out: { id: string; name: string; tasks: Task[] }[] = [];
    for (const tl of tasklists) {
      out.push({ id: tl.id, name: tl.name, tasks: sortTasks(buckets.get(tl.id) ?? []) });
    }
    if (unassigned.length) {
      out.push({ id: "__none", name: "No Tasklist", tasks: sortTasks(unassigned) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, tasklists, sortKey, sortDir]);

  function toggleCollapseGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (tasks.length === 0 && tasklists.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[13px] text-slate-400">No tasks yet.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Selection action bar — outside scroll container so it's always visible */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-8 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
          <button
            onClick={() => setSelected(new Set())}
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-amber-200 text-amber-700 cursor-pointer transition-colors"
          >
            <X size={12} />
          </button>
          <span className="text-[12px] font-semibold text-amber-800">{selected.size}</span>
          <div className="w-px h-4 bg-amber-300 mx-1" />
          <button className="text-[11px] font-medium px-2.5 py-1 rounded border border-red-300 bg-white text-red-600 hover:bg-red-50 cursor-pointer transition-colors">
            Trash
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-5">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[32px_1fr_148px_116px_108px_80px] items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <div /> {/* checkbox spacer */}
          <SortHeader label="Task Name" active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")} />
          <SortHeader label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} />
          <SortHeader label="Priority" active={sortKey === "priority"} dir={sortDir} onClick={() => toggleSort("priority")} />
          <SortHeader label="Due Date" active={sortKey === "due_date"} dir={sortDir} onClick={() => toggleSort("due_date")} />
          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            <Users size={11} />
          </span>
        </div>

        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.id);
          const groupTaskIds = g.tasks.map((t) => t.id);
          const allGroupSelected = groupTaskIds.length > 0 && groupTaskIds.every((id) => selected.has(id));

          return (
            <div key={g.id}>
              {/* Tasklist group header */}
              <div className="flex items-center bg-slate-100 border-b border-slate-200">
                <div className="w-8 shrink-0 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    onChange={() => toggleGroup(g.id, groupTaskIds)}
                    className="w-3.5 h-3.5 rounded border-slate-400 cursor-pointer accent-blue-600"
                  />
                </div>
                <div className="w-0.5 h-5 bg-slate-400 rounded-full mr-2 shrink-0" />
                <button
                  onClick={() => toggleCollapseGroup(g.id)}
                  className="flex items-center gap-2 flex-1 py-2 pr-4 cursor-pointer hover:opacity-75 text-left"
                >
                  {isCollapsed
                    ? <ChevronRight size={13} className="text-slate-500 shrink-0" />
                    : <ChevronDown size={13} className="text-slate-500 shrink-0" />}
                  <span className="text-[12px] font-bold text-slate-700">{g.name}</span>
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-200 rounded-full px-1.5 py-0.5 leading-none">
                    {g.tasks.length}
                  </span>
                </button>
              </div>

              {!isCollapsed && (
                g.tasks.length > 0
                  ? g.tasks.map((t) => (
                    <Row
                      key={t.id}
                      task={t}
                      selected={selected.has(t.id)}
                      onToggle={() => toggleRow(t.id)}
                      onOpen={() => onOpen(t)}
                      onUpdate={onUpdate}
                    />
                  ))
                  : (
                    <div className="pl-10 pr-4 py-3 border-b border-slate-50">
                      <p className="text-[12px] text-slate-300">No tasks in this list.</p>
                    </div>
                  )
              )}
            </div>
          );
        })}
      </div>
      </div>  {/* end scroll container */}
    </div>
  );
}

function SortHeader({
  label, active, dir, onClick,
}: {
  label: string; active: boolean; dir: SortDir; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700 cursor-pointer"
    >
      {label}
      {active && <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

function Row({
  task, selected, onToggle, onOpen, onUpdate,
}: {
  task: Task;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
}) {
  const norm = normalizeStatus(task.status);
  const ss = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
  const ps = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE["normal"];
  const due = formatDueDate(task.due_date);
  const dueColor = getDueColor(task.due_date);

  return (
    <div className={`grid grid-cols-[32px_1fr_148px_116px_108px_80px] items-center gap-3 pl-4 pr-4 py-2.5 border-b border-slate-50 last:border-0 transition-colors ${selected ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="w-3.5 h-3.5 rounded border-slate-300 cursor-pointer accent-blue-600"
      />

      <button onClick={onOpen} className="text-left min-w-0 cursor-pointer pl-6">
        <span className="text-[13px] text-slate-800 truncate block hover:text-blue-600">{task.title}</span>
      </button>

      <select
        value={norm}
        onChange={(e) => onUpdate(task.id, { status: e.target.value as TaskStatus })}
        className="text-[11px] font-medium rounded-full border px-2 py-0.5 outline-none cursor-pointer appearance-none"
        style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
      >
        {STATUS_OPTS.map((s) => (
          <option key={s} value={s} className="bg-white text-slate-700">{STATUS_LABEL[s]}</option>
        ))}
      </select>

      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: ps.text }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ps.dot }} />
        {ps.label}
      </span>

      <span className={`text-[12px] font-medium ${dueColor}`}>{due ?? "—"}</span>

      <div className="flex items-center">
        {(task.assignees ?? []).slice(0, 3).map((a, i) => (
          <div key={a} style={{ marginLeft: i > 0 ? -8 : 0 }}>
            <AssigneeChip id={a} idx={i} />
          </div>
        ))}
        {(!task.assignees || task.assignees.length === 0) && (
          <span className="text-[12px] text-slate-300">—</span>
        )}
      </div>
    </div>
  );
}
