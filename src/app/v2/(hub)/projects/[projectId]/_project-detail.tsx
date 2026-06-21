"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, LayoutGrid, List as ListIcon, Calendar as CalendarIcon,
  Plus, Flag, X, Loader2,
} from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import {
  type Project, type Milestone, type Task, type TaskStatus, type TaskPriority,
  ProjectStatusBadge,
} from "../_pm-shared";
import BoardView from "./_board-view";
import ListView from "./_list-view";
import CalendarView from "./_calendar-view";
import TaskDrawer from "./_task-drawer";
import MilestoneBar from "./_milestone-bar";

type ViewId = "board" | "list" | "calendar";

const VIEWS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: "board",    label: "Board",    icon: <LayoutGrid size={15} /> },
  { id: "list",     label: "List",     icon: <ListIcon size={15} /> },
  { id: "calendar", label: "Calendar", icon: <CalendarIcon size={15} /> },
];

export type TaskDefaults = {
  status?: TaskStatus;
  milestone_id?: string | null;
  due_date?: string | null;
};

export default function ProjectDetail({
  project,
  companyName,
  initialMilestones,
  initialTasks,
}: {
  project: Project;
  companyName: string;
  initialMilestones: Milestone[];
  initialTasks: Task[];
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewId>("board");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [milestoneFilter, setMilestoneFilter] = useState<string | "all">("all");
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [createDefaults, setCreateDefaults] = useState<TaskDefaults | null>(null);

  // ─── Realtime sync — reflects external task changes (Ops Chat, other tabs) ─
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`project_tasks_${project.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setTasks((prev) =>
              prev.map((t) => (t.id === (payload.new as Task).id ? { ...t, ...(payload.new as Task) } : t))
            );
            setDrawerTask((d) => {
              if (!d || d.id !== (payload.new as Task).id) return d;
              return { ...d, ...(payload.new as Task) };
            });
          } else if (payload.eventType === "INSERT") {
            const incoming = payload.new as Task;
            setTasks((prev) =>
              prev.some((t) => t.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id: string }).id;
            setTasks((prev) => prev.filter((t) => t.id !== deletedId));
            setDrawerTask((d) => (d && d.id === deletedId ? null : d));
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [project.id]);

  // ─── Task mutations (optimistic) ──────────────────────────────────────────
  const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
    const snapshot = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setDrawerTask((d) => (d && d.id === id ? { ...d, ...patch } : d));
    const res = await fetch(`/api/v2/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setTasks(snapshot); // rollback
      return false;
    }
    const updated: Task = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return true;
  }, [tasks]);

  const deleteTask = useCallback(async (id: string) => {
    const snapshot = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setDrawerTask((d) => (d && d.id === id ? null : d));
    const res = await fetch(`/api/v2/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) setTasks(snapshot);
  }, [tasks]);

  const addTask = useCallback((task: Task) => {
    setTasks((prev) => [...prev, task]);
  }, []);

  // ─── Milestone mutations ──────────────────────────────────────────────────
  const upsertMilestone = useCallback((m: Milestone) => {
    setMilestones((prev) => {
      const exists = prev.some((x) => x.id === m.id);
      return exists ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m];
    });
  }, []);

  const removeMilestone = useCallback((id: string) => {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    setTasks((prev) => prev.map((t) => (t.milestone_id === id ? { ...t, milestone_id: null } : t)));
    if (milestoneFilter === id) setMilestoneFilter("all");
  }, [milestoneFilter]);

  // ─── Filtered tasks for views ─────────────────────────────────────────────
  const visibleTasks = useMemo(() => {
    if (milestoneFilter === "all") return tasks;
    if (milestoneFilter === "none") return tasks.filter((t) => !t.milestone_id);
    return tasks.filter((t) => t.milestone_id === milestoneFilter);
  }, [tasks, milestoneFilter]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 border-b border-slate-200 bg-white shrink-0">
        <button
          onClick={() => router.push(V2_ROUTES.PROJECTS)}
          className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 mb-3 cursor-pointer"
          suppressHydrationWarning
        >
          <ArrowLeft size={14} /> All projects
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em] truncate">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {companyName} · {project.project_type}
            </p>
          </div>
          <button
            onClick={() => setCreateDefaults({})}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <Plus size={16} /> New Task
          </button>
        </div>

        {/* View tabs + milestone filter */}
        <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                  view === v.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Flag size={14} className="text-slate-400" />
            <select
              value={milestoneFilter}
              onChange={(e) => setMilestoneFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-700 outline-none focus:border-slate-400"
            >
              <option value="all">All milestones</option>
              <option value="none">No milestone</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Milestone management bar */}
        <MilestoneBar
          projectId={project.id}
          milestones={milestones}
          onUpsert={upsertMilestone}
          onRemove={removeMilestone}
        />
      </div>

      {/* View body */}
      <div className="flex-1 min-h-0 overflow-hidden bg-slate-50">
        {view === "board" && (
          <BoardView
            tasks={visibleTasks}
            onMove={async (id, status, position) => { await updateTask(id, { status, position }); }}
            onOpen={setDrawerTask}
            onAddInColumn={(status) => setCreateDefaults({ status })}
          />
        )}
        {view === "list" && (
          <ListView
            tasks={visibleTasks}
            milestones={milestones}
            onOpen={setDrawerTask}
            onUpdate={updateTask}
          />
        )}
        {view === "calendar" && (
          <CalendarView
            tasks={visibleTasks}
            onOpen={setDrawerTask}
            onAddOnDay={(due_date) => setCreateDefaults({ due_date })}
          />
        )}
      </div>

      {/* Task drawer */}
      {drawerTask && (
        <TaskDrawer
          key={drawerTask.id}
          task={drawerTask}
          milestones={milestones}
          onClose={() => setDrawerTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      )}

      {/* Create task modal */}
      {createDefaults && (
        <CreateTaskModal
          projectId={project.id}
          milestones={milestones}
          defaults={createDefaults}
          onClose={() => setCreateDefaults(null)}
          onCreated={(t) => { addTask(t); setCreateDefaults(null); }}
        />
      )}
    </div>
  );
}

// ─── Create Task modal ────────────────────────────────────────────────────────

const STATUS_OPTS: TaskStatus[] = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"];
const PRIORITY_OPTS: TaskPriority[] = ["low", "normal", "high", "critical"];

function CreateTaskModal({
  projectId,
  milestones,
  defaults,
  onClose,
  onCreated,
}: {
  projectId: string;
  milestones: Milestone[];
  defaults: TaskDefaults;
  onClose: () => void;
  onCreated: (t: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? "open");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [milestoneId, setMilestoneId] = useState<string>(defaults.milestone_id ?? "");
  const [dueDate, setDueDate] = useState<string>(defaults.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v2/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        milestone_id: milestoneId || undefined,
        due_date: dueDate || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to create task");
      setSaving(false);
      return;
    }
    onCreated(await res.json());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-[15px] font-semibold text-slate-900">New Task</h2>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate-600">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400"
              placeholder="What needs to be done?"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate-600">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 resize-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate-600">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white capitalize">
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate-600">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white capitalize">
                {PRIORITY_OPTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate-600">Milestone</span>
              <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white">
                <option value="">None</option>
                {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate-600">Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400" />
            </label>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 disabled:opacity-60 cursor-pointer">
            {saving && <Loader2 size={14} className="animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}
