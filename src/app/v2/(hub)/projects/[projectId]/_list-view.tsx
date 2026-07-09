"use client";

import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Users, X, Play, Pause, Clock } from "lucide-react";
import {
  type Task, type Tasklist, type TaskStatus,
  STATUS_LABEL, STATUS_STYLE, PRIORITY_STYLE,
  formatDueDate, normalizeStatus,
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

const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0D9488", "#DC2626", "#D97706"];

const DEPTH_INDENT = ["pl-0", "pl-4", "pl-8", "pl-12", "pl-16", "pl-20", "pl-24"] as const;

type MemberProfile = { id: string; full_name: string | null; avatar_url: string | null };

function getDueColor(due: string | null): string {
  if (!due) return "text-slate-400";
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-red-500";
  if (days <= 7) return "text-orange-500";
  return "text-slate-500";
}

function nameInitials(name: string | null | undefined, fallbackId: string): string {
  if (name) return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return fallbackId.replace(/-/g, "").slice(0, 2).toUpperCase();
}

// ─── ResolvedAssigneeChip ─────────────────────────────────────────────────────
// Local-only — uses real name initials. Does NOT replace AssigneeChip in _pm-shared.tsx.

function ResolvedAssigneeChip({ id, idx, name }: { id: string; idx: number; name?: string }) {
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white shrink-0"
      style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
      title={name ?? id}
    >
      {nameInitials(name, id)}
    </div>
  );
}

// ─── AssigneePicker ───────────────────────────────────────────────────────────
// Uses fixed positioning to escape overflow:hidden on the table container.

function AssigneePicker({
  task,
  allMembers,
  profilesById,
  onUpdate,
}: {
  task: Task;
  allMembers: MemberProfile[];
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const currentAssignees = task.assignees ?? [];

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPanelPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(true);
  }

  function toggleMember(memberId: string) {
    const next = currentAssignees.includes(memberId)
      ? currentAssignees.filter((a) => a !== memberId)
      : [...currentAssignees, memberId];
    void onUpdate(task.id, { assignees: next });
  }

  return (
    <div className="flex items-center">
      <button ref={btnRef} onClick={handleOpen} className="flex items-center gap-0.5 cursor-pointer group min-w-0">
        {currentAssignees.slice(0, 3).map((a, i) => (
          <div key={a} style={{ marginLeft: i > 0 ? -6 : 0 }} className="shrink-0">
            <ResolvedAssigneeChip id={a} idx={i} name={profilesById[a]?.full_name} />
          </div>
        ))}
        {currentAssignees.length > 3 && (
          <span className="text-[10px] text-slate-500 ml-1.5 shrink-0">+{currentAssignees.length - 3}</span>
        )}
        {currentAssignees.length === 0 && (
          <span className="text-slate-300 group-hover:text-slate-400 transition-colors">
            <Users size={14} />
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-52 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
            style={{ top: panelPos.top, left: panelPos.left }}
          >
            <div className="px-3 py-2.5 border-b border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Assign to</p>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {allMembers.map((m, mi) => {
                const isAssigned = currentAssignees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-slate-50 cursor-pointer transition-colors text-left ${
                      isAssigned ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0"
                      style={{ background: AVATAR_COLORS[mi % AVATAR_COLORS.length] }}
                    >
                      {nameInitials(m.full_name, m.id)}
                    </div>
                    <span className={`flex-1 truncate ${isAssigned ? "font-medium text-slate-900" : "text-slate-700"}`}>
                      {m.full_name ?? "Unknown"}
                    </span>
                    {isAssigned && (
                      <span className="text-blue-600 text-[11px] shrink-0">✓</span>
                    )}
                  </button>
                );
              })}
              {allMembers.length === 0 && (
                <p className="text-[12px] text-slate-400 px-3 py-3">No members found</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TimerButton ──────────────────────────────────────────────────────────────

function TimerButton({ taskId, onStop }: { taskId: string; onStop: (taskId: string, hours: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  function handleStart() {
    setElapsed(0);
    setStartedAt(Date.now());
  }

  function handleStop() {
    if (startedAt === null) return;
    const hours = (Date.now() - startedAt) / 3600000;
    setStartedAt(null);
    onStop(taskId, hours);
  }

  if (startedAt !== null) {
    const mm = Math.floor(elapsed / 60).toString().padStart(2, "0");
    const ss = (elapsed % 60).toString().padStart(2, "0");
    return (
      <button
        onClick={handleStop}
        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
        title="Stop timer"
      >
        <Pause size={11} />
        <span className="text-[10px] font-mono font-semibold tabular-nums">{mm}:{ss}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleStart}
      className="flex items-center justify-center text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
      title="Start timer"
    >
      <Play size={13} />
    </button>
  );
}

// ─── ListView ─────────────────────────────────────────────────────────────────

export default function ListView({
  tasks,
  tasklists,
  onOpen,
  onUpdate,
  currentUserId,
  profilesById,
  allMembers,
  hoursById,
  onTimerStop,
}: {
  tasks: Task[];
  tasklists: Tasklist[];
  onOpen: (task: Task) => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
  currentUserId: string;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: MemberProfile[];
  hoursById: Record<string, number>;
  onTimerStop: (taskId: string, hours: number) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Pre-expand all root tasks that have children so subtasks are visible by default (matches Zoho behavior)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
    const childParentIds = new Set<string>();
    for (const t of tasks) {
      if (t.parent_task_id) childParentIds.add(t.parent_task_id);
    }
    const initial = new Set<string>();
    for (const t of tasks) {
      if (t.depth === 0 && childParentIds.has(t.id)) initial.add(t.id);
    }
    return initial;
  });

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
      if (sortKey === "title")         cmp = a.title.localeCompare(b.title);
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

    for (const t of tasks.filter((t) => !t.parent_task_id && t.depth === 0)) {
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

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      const siblings = map.get(t.parent_task_id) ?? [];
      siblings.push(t);
      map.set(t.parent_task_id, siblings);
    }
    for (const [key, kids] of map) {
      map.set(key, kids.sort((a, b) => ((a.position ?? 0) - (b.position ?? 0))));
    }
    return map;
  }, [tasks]);

  function toggleCollapseGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
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

  const GRID = "grid-cols-[32px_1fr_148px_120px_108px_80px_64px_48px]";

  function renderRows(list: Task[], depth = 0): React.ReactNode {
    return list.map((t) => {
      const children = childrenByParent.get(t.id) ?? [];
      const isExpanded = expandedRows.has(t.id);
      return (
        <Fragment key={t.id}>
          <Row
            task={t}
            depth={depth}
            childrenCount={children.length}
            isExpanded={isExpanded}
            onToggleExpand={() => toggleExpand(t.id)}
            selected={selected.has(t.id)}
            onToggle={() => toggleRow(t.id)}
            onOpen={() => onOpen(t)}
            onUpdate={onUpdate}
            currentUserId={currentUserId}
            profilesById={profilesById}
            allMembers={allMembers}
            hoursById={hoursById}
            onTimerStop={onTimerStop}
            gridClass={GRID}
          />
          {isExpanded && children.length > 0 && renderRows(children, depth + 1)}
        </Fragment>
      );
    });
  }

  return (
    <div className="h-full flex flex-col min-h-0">
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
          <div className={`grid ${GRID} items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50`}>
            <div /> {/* checkbox spacer */}
            <SortHeader label="Task Name" active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")} />
            <SortHeader label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} />
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <Users size={11} /> Assignee
            </span>
            <SortHeader label="Due Date" active={sortKey === "due_date"} dir={sortDir} onClick={() => toggleSort("due_date")} />
            <SortHeader label="Priority" active={sortKey === "priority"} dir={sortDir} onClick={() => toggleSort("priority")} />
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <Clock size={11} />
            </span>
            <div /> {/* timer spacer */}
          </div>

          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.id);
            const groupTaskIds = g.tasks.map((t) => t.id);
            const allGroupSelected = groupTaskIds.length > 0 && groupTaskIds.every((id) => selected.has(id));

            return (
              <div key={g.id}>
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
                    ? renderRows(g.tasks)
                    : (
                      <div className="pl-10 pr-4 py-3 border-b border-slate-100">
                        <p className="text-[12px] text-slate-300">No tasks in this list.</p>
                      </div>
                    )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SortHeader ───────────────────────────────────────────────────────────────

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

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({
  task, selected, onToggle, onOpen, onUpdate,
  currentUserId, profilesById, allMembers, hoursById, onTimerStop, gridClass,
  depth, childrenCount, isExpanded, onToggleExpand,
}: {
  task: Task;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
  currentUserId: string;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: MemberProfile[];
  hoursById: Record<string, number>;
  onTimerStop: (taskId: string, hours: number) => void;
  gridClass: string;
  depth: number;
  childrenCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const norm = normalizeStatus(task.status);
  const ss = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
  const ps = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE["normal"];
  const due = formatDueDate(task.due_date);
  const dueColor = getDueColor(task.due_date);
  const totalHours = hoursById[task.id] ?? 0;
  const isAssignedToMe = task.assignees?.includes(currentUserId) ?? false;

  return (
    <div className={`grid ${gridClass} items-center gap-3 pl-4 pr-3 py-2.5 border-b border-slate-100 last:border-0 transition-colors ${
      selected ? "bg-blue-50/60" : "hover:bg-slate-50/70"
    }`}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="w-3.5 h-3.5 rounded border-slate-300 cursor-pointer accent-blue-600"
      />

      {/* Task name */}
      <div className={`flex items-center min-w-0 gap-1 ${DEPTH_INDENT[Math.min(depth, 6)] ?? "pl-0"}`}>
        {childrenCount > 0 ? (
          <button
            onClick={onToggleExpand}
            title={isExpanded ? "Collapse" : `Expand ${childrenCount} subtask${childrenCount === 1 ? "" : "s"}`}
            className="flex items-center justify-center w-5 h-5 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer shrink-0"
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-5 h-5 shrink-0" />
        )}
        <button onClick={onOpen} className="text-left min-w-0 cursor-pointer group flex-1">
          <span className="text-[13px] text-slate-700 truncate block group-hover:text-blue-600 transition-colors font-medium">
            {task.title}
          </span>
        </button>
        {childrenCount > 0 && !isExpanded && (
          <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 leading-none shrink-0 tabular-nums">
            {childrenCount}
          </span>
        )}
      </div>

      {/* Status */}
      <select
        value={norm}
        onChange={(e) => void onUpdate(task.id, { status: e.target.value as TaskStatus })}
        className="text-[11px] font-semibold rounded-full border px-2.5 py-0.5 outline-none cursor-pointer appearance-none w-full truncate"
        style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
      >
        {STATUS_OPTS.map((s) => (
          <option key={s} value={s} className="bg-white text-slate-700">{STATUS_LABEL[s]}</option>
        ))}
      </select>

      {/* Assignee picker */}
      <AssigneePicker
        task={task}
        allMembers={allMembers}
        profilesById={profilesById}
        onUpdate={onUpdate}
      />

      {/* Due date */}
      <span className={`text-[12px] font-medium tabular-nums ${dueColor}`}>{due ?? "—"}</span>

      {/* Priority */}
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: ps.text }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ps.dot }} />
        {ps.label}
      </span>

      {/* Hours logged */}
      <span className="text-[12px] font-medium text-slate-500 tabular-nums">
        {totalHours > 0 ? `${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h` : "—"}
      </span>

      {/* Timer */}
      <div className="flex items-center justify-center">
        {isAssignedToMe && (
          <TimerButton taskId={task.id} onStop={onTimerStop} />
        )}
      </div>
    </div>
  );
}
