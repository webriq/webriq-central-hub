"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, LayoutGrid, List as ListIcon, Calendar as CalendarIcon,
  Plus, X, Loader2, ChevronDown,
} from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import {
  type Project, type Milestone, type Tasklist, type Task,
  type TaskStatus, type TaskPriority, ProjectStatusBadge,
} from "../_pm-shared";
import BoardView from "./_board-view";
import ListView from "./_list-view";
import CalendarView from "./_calendar-view";
import MilestonePanel from "./_milestone-panel";

type ViewId = "board" | "list" | "calendar";
type PrimaryTab = "tasks" | "issues" | "milestones";

const VIEW_LABELS: Record<ViewId, string> = { list: "List", board: "Board", calendar: "Calendar" };
const VIEW_ICONS: Record<ViewId, React.ReactNode> = {
  list:     <ListIcon size={14} />,
  board:    <LayoutGrid size={14} />,
  calendar: <CalendarIcon size={14} />,
};
const VIEW_ORDER: ViewId[] = ["list", "board", "calendar"];

const PRIMARY_TABS: { id: PrimaryTab; label: string }[] = [
  { id: "tasks",      label: "Tasks" },
  { id: "issues",     label: "Issues" },
  { id: "milestones", label: "Milestones" },
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
  initialTasklists,
  initialTasks,
  currentUserId,
  profilesById,
  allMembers,
  initialHoursById,
}: {
  project: Project;
  companyName: string;
  initialMilestones: Milestone[];
  initialTasklists: Tasklist[];
  initialTasks: Task[];
  currentUserId: string;
  profilesById: Record<string, { full_name: string; avatar_url: string | null }>;
  allMembers: { id: string; full_name: string | null; avatar_url: string | null }[];
  initialHoursById: Record<string, number>;
}) {
  const router = useRouter();
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("tasks");
  const [view, setView] = useState<ViewId>("list");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [tasklists] = useState<Tasklist[]>(initialTasklists);
  const [createDefaults, setCreateDefaults] = useState<TaskDefaults | null>(null);
  const [hoursById, setHoursById] = useState<Record<string, number>>(initialHoursById);

  // ─── Realtime sync ────────────────────────────────────────────────────────
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
          } else if (payload.eventType === "INSERT") {
            const incoming = payload.new as Task;
            setTasks((prev) =>
              prev.some((t) => t.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id: string }).id;
            setTasks((prev) => prev.filter((t) => t.id !== deletedId));
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [project.id]);

  // ─── Task mutations (optimistic) ─────────────────────────────────────────
  const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
    const snapshot = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const res = await fetch(`/api/v2/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { setTasks(snapshot); return false; }
    const updated: Task = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return true;
  }, [tasks]);

  const deleteTask = useCallback(async (id: string) => {
    const snapshot = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
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
  }, []);

  const handleTimerStop = useCallback(async (taskId: string, hours: number) => {
    setHoursById((prev) => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + hours }));
    await fetch(`/api/v2/tasks/${taskId}/timelog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours, project_id: project.id }),
    });
  }, [project.id]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-8 pt-6 pb-0 bg-white shrink-0">
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
              <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em] truncate">
                {project.name}
              </h1>
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

        {/* Primary tabs */}
        <div className="flex items-center mt-4">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {PRIMARY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPrimaryTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                  primaryTab === tab.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden bg-slate-50 flex flex-col">

        {/* ── Tasks tab ── */}
        {primaryTab === "tasks" && (
          <>
            <div className="flex items-center justify-end px-8 py-2 bg-white border-b border-slate-200 shrink-0">
              <ViewDropdown view={view} onChange={setView} />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {view === "board" && (
                <BoardView
                  tasks={tasks}
                  onMove={async (id, status, position) => { await updateTask(id, { status, position }); }}
                  onOpen={(task) => router.push(`/v2/projects/${project.id}/tasks/${task.id}`)}
                  onAddInColumn={(status) => setCreateDefaults({ status })}
                />
              )}
              {view === "list" && (
                <ListView
                  tasks={tasks}
                  tasklists={tasklists}
                  onOpen={(task) => router.push(`/v2/projects/${project.id}/tasks/${task.id}`)}
                  onUpdate={updateTask}
                  currentUserId={currentUserId}
                  profilesById={profilesById}
                  allMembers={allMembers}
                  hoursById={hoursById}
                  onTimerStop={handleTimerStop}
                />
              )}
              {view === "calendar" && (
                <CalendarView
                  tasks={tasks}
                  onOpen={(task) => router.push(`/v2/projects/${project.id}/tasks/${task.id}`)}
                  onAddOnDay={(due_date) => setCreateDefaults({ due_date })}
                />
              )}
            </div>
          </>
        )}

        {/* ── Issues tab ── */}
        {primaryTab === "issues" && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[13px] text-slate-400">Issues coming soon.</p>
          </div>
        )}

        {/* ── Milestones tab ── */}
        {primaryTab === "milestones" && (
          <div className="px-8 py-5 overflow-y-auto h-full">
            <MilestonePanel
              projectId={project.id}
              milestones={milestones}
              tasks={tasks}
              onUpsert={upsertMilestone}
              onRemove={removeMilestone}
            />
          </div>
        )}
      </div>

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

// ─── View dropdown ────────────────────────────────────────────────────────────

function ViewDropdown({ view, onChange }: { view: ViewId; onChange: (v: ViewId) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-700 hover:border-slate-300 cursor-pointer"
      >
        {VIEW_ICONS[view]} {VIEW_LABELS[view]}
        <ChevronDown size={12} className="text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
            {VIEW_ORDER.map((v) => (
              <button
                key={v}
                onClick={() => { onChange(v); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-slate-50 cursor-pointer ${
                  view === v ? "text-slate-900 font-medium bg-slate-50" : "text-slate-600"
                }`}
              >
                {VIEW_ICONS[v]} {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Create Task modal ────────────────────────────────────────────────────────

const STATUS_OPTS: TaskStatus[] = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
];
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
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white capitalize"
              >
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate-600">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white capitalize"
              >
                {PRIORITY_OPTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate-600">Milestone</span>
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white"
              >
                <option value="">None</option>
                {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate-600">Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400"
              />
            </label>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-slate-600 hover:bg-slate-100 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}
