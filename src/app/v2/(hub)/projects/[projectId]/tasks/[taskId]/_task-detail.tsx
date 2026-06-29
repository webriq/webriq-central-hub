"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Trash2, Plus, Square, CheckSquare, Loader2,
  GitPullRequest, ExternalLink,
} from "lucide-react";
import {
  type Task, type Milestone, type TaskStatus, type TaskPriority,
  STATUS_LABEL, PRIORITY_STYLE, StatusBadge, PriorityBadge, TagChip, AssigneeChip,
} from "../../../_pm-shared";

const STATUS_OPTS: TaskStatus[] = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
];
const PRIORITY_OPTS: TaskPriority[] = ["low", "normal", "high", "critical"];

// ─── Local layout helpers — outside component per rerender-no-inline-components ─

function Card({
  title,
  count,
  children,
}: {
  title: string;
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        {count !== undefined ? (
          <span className="text-[11px] font-mono text-slate-400">{count}</span>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskDetailClient({
  task,
  project,
  milestones,
}: {
  task: Task;
  project: { id: string; name: string; customer_id: string };
  milestones: Milestone[];
}) {
  const router = useRouter();

  // Editable text fields
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");

  // Sidebar fields — controlled for UI consistency
  const [status, setStatus] = useState<TaskStatus>(task.status as TaskStatus);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [milestoneId, setMilestoneId] = useState(task.milestone_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [startDate, setStartDate] = useState(task.start_date ?? "");
  const [estimateHours, setEstimateHours] = useState(
    task.estimate_hours != null ? String(task.estimate_hours) : ""
  );

  // Labels
  const [labels, setLabels] = useState<string[]>(task.labels ?? []);
  const [newLabel, setNewLabel] = useState("");

  // Subtasks
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  const ps = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE["normal"];

  // Load subtasks on mount
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v2/tasks/${task.id}/subtasks`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Task[]) => setSubtasks(data))
      .catch(() => {})
      .finally(() => setLoadingSubs(false));
    return () => ctrl.abort();
  }, [task.id]);

  // ─── Save helpers ─────────────────────────────────────────────────────────

  const saveField = useCallback(
    async (patch: Partial<Task>) => {
      await fetch(`/api/v2/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [task.id]
  );

  const saveTitle = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) void saveField({ title: trimmed });
  }, [title, task.title, saveField]);

  const saveDescription = useCallback(() => {
    if (description !== (task.description ?? ""))
      void saveField({ description: description.trim() || null });
  }, [description, task.description, saveField]);

  // ─── Subtask CRUD ─────────────────────────────────────────────────────────

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
    setSubtasks((prev) =>
      prev.map((s) => (s.id === sub.id ? { ...s, status: nextStatus } : s))
    );
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

  // ─── Label CRUD ───────────────────────────────────────────────────────────

  async function addLabel() {
    const trimmed = newLabel.trim();
    if (!trimmed || labels.includes(trimmed)) return;
    const next = [...labels, trimmed];
    setLabels(next);
    setNewLabel("");
    await saveField({ labels: next });
  }

  async function removeLabel(tag: string) {
    const next = labels.filter((l) => l !== tag);
    setLabels(next);
    await saveField({ labels: next });
  }

  // ─── Delete task ──────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!confirm("Delete this task and all its subtasks?")) return;
    await fetch(`/api/v2/tasks/${task.id}`, { method: "DELETE" });
    router.push(`/v2/projects/${project.id}`);
  }

  const doneCount = subtasks.filter((s) => s.status === "closed").length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-8 pt-6 pb-5 bg-white border-b border-slate-100 shrink-0">
        <button
          onClick={() => router.push(`/v2/projects/${project.id}`)}
          className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 mb-3 cursor-pointer"
        >
          <ArrowLeft size={14} /> {project.name}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                TASK · {task.id.slice(0, 8).toUpperCase()}
              </span>
              <StatusBadge status={status} />
              <PriorityBadge priority={priority} />
            </div>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              rows={2}
              className="text-[22px] font-bold text-slate-900 tracking-[-0.02em] outline-none resize-none leading-snug w-full border-0 focus:bg-slate-50 rounded-lg px-2 -mx-2"
            />
          </div>
          <button
            onClick={() => void handleDelete()}
            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0 mt-1"
            title="Delete task"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="bg-slate-50 flex-1 overflow-y-auto p-8">
        <div className="flex gap-6 max-w-5xl">

          {/* Left — main content */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">

            {/* Description */}
            <Card title="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveDescription}
                rows={5}
                placeholder="Add a description…"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 resize-none"
              />
            </Card>

            {/* Labels */}
            <Card title="Labels">
              <div className="flex flex-col gap-3">
                {labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map((tag) => (
                      <TagChip
                        key={tag}
                        tag={tag}
                        canRemove
                        onRemove={() => void removeLabel(tag)}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void addLabel(); }}
                    placeholder="Add a label…"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400"
                  />
                  <button
                    onClick={() => void addLabel()}
                    disabled={!newLabel.trim()}
                    className="p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </Card>

            {/* Subtasks */}
            <Card title="Subtasks" count={`${doneCount}/${subtasks.length}`}>
              <div className="flex flex-col gap-2">
                {loadingSubs ? (
                  <div className="h-8 animate-pulse bg-slate-100 rounded-lg" />
                ) : (
                  <div className="flex flex-col gap-1">
                    {subtasks.map((s) => (
                      <div
                        key={s.id}
                        className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50"
                      >
                        <button
                          onClick={() => void toggleSubtask(s)}
                          className="cursor-pointer shrink-0"
                        >
                          {s.status === "closed" ? (
                            <CheckSquare size={16} className="text-green-600" />
                          ) : (
                            <Square size={16} className="text-slate-300" />
                          )}
                        </button>
                        <span
                          className={`text-[13px] flex-1 ${
                            s.status === "closed"
                              ? "line-through text-slate-400"
                              : "text-slate-700"
                          }`}
                        >
                          {s.title}
                        </span>
                        <button
                          onClick={() => void deleteSubtask(s.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 hover:text-red-500 cursor-pointer transition-opacity"
                        >
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
                    onKeyDown={(e) => { if (e.key === "Enter") void addSubtask(); }}
                    placeholder="Add a subtask…"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400"
                  />
                  <button
                    onClick={() => void addSubtask()}
                    disabled={!newSub.trim() || addingSub}
                    className="p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {addingSub ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                  </button>
                </div>
              </div>
            </Card>
          </div>

          {/* Right — sidebar */}
          <div className="w-72 shrink-0">
            <Card title="Details">
              <div className="flex flex-col gap-4">

                <Meta label="Status">
                  <select
                    value={status}
                    onChange={(e) => {
                      const next = e.target.value as TaskStatus;
                      setStatus(next);
                      void saveField({ status: next });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400 bg-white cursor-pointer"
                  >
                    {STATUS_OPTS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </Meta>

                <Meta label="Priority">
                  <select
                    value={priority}
                    onChange={(e) => {
                      const next = e.target.value as TaskPriority;
                      setPriority(next);
                      void saveField({ priority: next });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] outline-none focus:border-slate-400 bg-white cursor-pointer capitalize"
                    style={{ color: ps.text }}
                  >
                    {PRIORITY_OPTS.map((p) => (
                      <option key={p} value={p} className="text-slate-700">
                        {p}
                      </option>
                    ))}
                  </select>
                </Meta>

                <Meta label="Milestone">
                  <select
                    value={milestoneId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setMilestoneId(next);
                      void saveField({ milestone_id: next || null });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400 bg-white cursor-pointer"
                  >
                    <option value="">None</option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </Meta>

                <Meta label="Due date">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDueDate(next);
                      void saveField({ due_date: next || null });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400"
                  />
                </Meta>

                <Meta label="Start date">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setStartDate(next);
                      void saveField({ start_date: next || null });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400"
                  />
                </Meta>

                <Meta label="Estimate (hours)">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={estimateHours}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setEstimateHours(raw);
                      void saveField({
                        estimate_hours: raw ? parseFloat(raw) : null,
                      });
                    }}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400"
                  />
                </Meta>

                {task.assignees !== null && task.assignees.length > 0 ? (
                  <Meta label="Assignees">
                    <div className="flex gap-1 flex-wrap">
                      {task.assignees.map((id: string, i: number) => (
                        <AssigneeChip key={id} id={id} idx={i} />
                      ))}
                    </div>
                  </Meta>
                ) : null}

                {task.github_pr_url !== null || task.preview_url !== null ? (
                  <Meta label="Links">
                    <div className="flex flex-col gap-2">
                      {task.github_pr_url !== null ? (
                        <a
                          href={task.github_pr_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[12px] text-violet-600 hover:underline"
                        >
                          <GitPullRequest size={13} /> View Pull Request
                        </a>
                      ) : null}
                      {task.preview_url !== null ? (
                        <a
                          href={task.preview_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 hover:underline"
                        >
                          <ExternalLink size={13} /> Preview
                        </a>
                      ) : null}
                    </div>
                  </Meta>
                ) : null}

              </div>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
