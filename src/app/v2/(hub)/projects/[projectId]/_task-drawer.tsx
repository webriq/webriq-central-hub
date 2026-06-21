"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Trash2, Plus, Square, CheckSquare, Loader2, GitPullRequest, ExternalLink,
} from "lucide-react";
import {
  type Task, type Milestone, type TaskStatus, type TaskPriority,
  STATUS_LABEL, PRIORITY_STYLE,
} from "../_pm-shared";

const STATUS_OPTS: TaskStatus[] = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"];
const PRIORITY_OPTS: TaskPriority[] = ["low", "normal", "high", "critical"];

export default function TaskDrawer({
  task,
  milestones,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task;
  milestones: Milestone[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  // Load subtasks. The drawer is keyed by task id in the parent, so it remounts
  // per task — local field state initializes directly and this runs once on mount.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v2/tasks/${task.id}/subtasks`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Task[]) => setSubtasks(data))
      .catch(() => {})
      .finally(() => setLoadingSubs(false));
    return () => ctrl.abort();
  }, [task.id]);

  const saveTitle = useCallback(() => {
    if (title.trim() && title.trim() !== task.title) onUpdate(task.id, { title: title.trim() });
  }, [title, task.id, task.title, onUpdate]);

  const saveDescription = useCallback(() => {
    if (description !== (task.description ?? "")) onUpdate(task.id, { description: description.trim() || null });
  }, [description, task.id, task.description, onUpdate]);

  async function addSubtask() {
    if (!newSub.trim()) return;
    setAddingSub(true);
    const res = await fetch(`/api/v2/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSub.trim() }),
    });
    if (res.ok) {
      const created: Task = await res.json();
      setSubtasks((prev) => [...prev, created]);
      setNewSub("");
    }
    setAddingSub(false);
  }

  async function toggleSubtask(sub: Task) {
    const nextStatus: TaskStatus = sub.status === "closed" ? "open" : "closed";
    setSubtasks((prev) => prev.map((s) => (s.id === sub.id ? { ...s, status: nextStatus } : s)));
    const res = await fetch(`/api/v2/tasks/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) setSubtasks((prev) => prev.map((s) => (s.id === sub.id ? sub : s)));
  }

  async function deleteSubtask(id: string) {
    const snapshot = subtasks;
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    const res = await fetch(`/api/v2/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) setSubtasks(snapshot);
  }

  const doneCount = subtasks.filter((s) => s.status === "closed").length;
  const ps = PRIORITY_STYLE[task.priority];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-100 shrink-0">
          <span className="text-[12px] font-mono text-slate-400">TASK · {task.id.slice(0, 8).toUpperCase()}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { if (confirm("Delete this task and its subtasks?")) onDelete(task.id); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
              title="Delete task"
            >
              <Trash2 size={16} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Title */}
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            rows={2}
            className="text-[18px] font-semibold text-slate-900 outline-none resize-none leading-snug w-full border-0 focus:bg-slate-50 rounded-lg px-2 -mx-2"
          />

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            <Meta label="Status">
              <select
                value={task.status}
                onChange={(e) => onUpdate(task.id, { status: e.target.value as TaskStatus })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400 bg-white cursor-pointer"
              >
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Meta>
            <Meta label="Priority">
              <select
                value={task.priority}
                onChange={(e) => onUpdate(task.id, { priority: e.target.value as TaskPriority })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] outline-none focus:border-slate-400 bg-white cursor-pointer capitalize"
                style={{ color: ps.text }}
              >
                {PRIORITY_OPTS.map((p) => <option key={p} value={p} className="text-slate-700">{p}</option>)}
              </select>
            </Meta>
            <Meta label="Milestone">
              <select
                value={task.milestone_id ?? ""}
                onChange={(e) => onUpdate(task.id, { milestone_id: e.target.value || null })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400 bg-white cursor-pointer"
              >
                <option value="">None</option>
                {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Meta>
            <Meta label="Due date">
              <input
                type="date"
                value={task.due_date ?? ""}
                onChange={(e) => onUpdate(task.id, { due_date: e.target.value || null })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400"
              />
            </Meta>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate-600">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              rows={4}
              placeholder="Add a description…"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 resize-none"
            />
          </div>

          {/* Links */}
          {(task.github_pr_url || task.preview_url) && (
            <div className="flex flex-col gap-2">
              {task.github_pr_url && (
                <a href={task.github_pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] text-violet-600 hover:underline">
                  <GitPullRequest size={13} /> View Pull Request
                </a>
              )}
              {task.preview_url && (
                <a href={task.preview_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 hover:underline">
                  <ExternalLink size={13} /> Preview
                </a>
              )}
            </div>
          )}

          {/* Subtasks */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-600">Subtasks</span>
              {subtasks.length > 0 && (
                <span className="text-[11px] font-mono text-slate-400">{doneCount}/{subtasks.length}</span>
              )}
            </div>

            {loadingSubs ? (
              <div className="h-8 animate-pulse bg-slate-100 rounded-lg" />
            ) : (
              <div className="flex flex-col gap-1">
                {subtasks.map((s) => (
                  <div key={s.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50">
                    <button onClick={() => toggleSubtask(s)} className="cursor-pointer shrink-0">
                      {s.status === "closed"
                        ? <CheckSquare size={16} className="text-green-600" />
                        : <Square size={16} className="text-slate-300" />}
                    </button>
                    <span className={`text-[13px] flex-1 ${s.status === "closed" ? "line-through text-slate-400" : "text-slate-700"}`}>
                      {s.title}
                    </span>
                    <button onClick={() => deleteSubtask(s.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 hover:text-red-500 cursor-pointer transition-opacity">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mt-1">
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); }}
                placeholder="Add a subtask…"
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400"
              />
              <button
                onClick={addSubtask}
                disabled={!newSub.trim() || addingSub}
                className="p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer shrink-0"
              >
                {addingSub ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-slate-600">{label}</span>
      {children}
    </div>
  );
}
