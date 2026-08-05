"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, GitPullRequest, ExternalLink } from "lucide-react";
import {
  type Task, type Milestone, type TaskStatus, type TaskPriority,
  STATUS_LABEL, PRIORITY_STYLE, StatusBadge, PriorityBadge, AssigneeChip,
  decodeHtmlEntities,
} from "../../../_pm-shared";
import { TaskDescriptionField } from "./_task-description-field";
import { TaskAttachmentsCommentsPanel } from "./_task-attachments-comments-panel";
import { getTaskEditPermission } from "@/lib/tasks/permissions";

const STATUS_OPTS: TaskStatus[] = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
];
const PRIORITY_OPTS: TaskPriority[] = ["low", "normal", "high", "critical"];

// Forms-spec input class (DESIGN.md §4) — matches `_project-detail.tsx:915`'s `inputClass`,
// kept at this page's existing smaller sidebar sizing (px-2.5 py-1.5 / 12px).
const inputClass =
  "w-full px-2.5 py-1.5 rounded-[10px] border text-[12px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";

// ─── Local layout helpers — outside component per rerender-no-inline-components ─

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-[#EDF0F7]">
        <span className="font-heading text-[15px] font-semibold text-[#0B1533]">
          {title}
        </span>
      </div>
      <div className="p-[18px]">{children}</div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-[#0B1533]">{label}</span>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskDetailClient({
  task,
  project,
  milestones,
  currentUserId,
  currentUserRole,
  assigneeProfiles,
}: {
  task: Task;
  project: { id: string; name: string; customer_id: string; project_id: string | null };
  milestones: Milestone[];
  currentUserId: string;
  currentUserRole: string | null;
  assigneeProfiles: { id: string; full_name: string | null }[];
}) {
  const router = useRouter();
  const projectId = project.project_id ?? project.id;
  const assigneeNamesById = new Map(assigneeProfiles.map((p) => [p.id, p.full_name]));

  // Task 209 — creator: full edit. Assignee-only: status limited to in_progress/ready_for_qa.
  // Neither: fully read-only.
  const perm = getTaskEditPermission(currentUserRole, currentUserId, task);
  const statusOptions = perm.allowedStatusValues === "all"
    ? STATUS_OPTS
    : Array.from(new Set([task.status as TaskStatus, ...perm.allowedStatusValues]));

  // Editable text fields
  const [title, setTitle] = useState(() => decodeHtmlEntities(task.title));
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

  const ps = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE["normal"];

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

  // ─── Delete task ──────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    await fetch(`/api/v2/tasks/${task.id}`, { method: "DELETE" });
    if (project.project_id) router.push(`/v2/projects/${project.project_id}/tasks`);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-8 pt-6 pb-5 bg-white border-b border-[#E2E7F2] shrink-0">
        <button
          onClick={() => project.project_id && router.push(`/v2/projects/${project.project_id}/tasks`)}
          className="inline-flex items-center gap-1.5 text-[12px] text-[#5F6A88] hover:text-[#0B1533] mb-3 cursor-pointer transition-colors"
        >
          <ArrowLeft size={14} /> {project.name}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] font-mono text-[#5F6A88] bg-[#EDF0F7] px-2 py-0.5 rounded-[5px]">
                TASK · {task.display_id}
              </span>
              <StatusBadge status={status} />
              <PriorityBadge priority={priority} />
            </div>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              readOnly={!perm.canEditDetails}
              rows={2}
              className="font-heading text-[22px] font-bold text-[#0B1533] tracking-[-0.02em] outline-none resize-none leading-snug w-full border-0 focus:bg-[#F4F6FB] rounded-lg px-2 -mx-2 transition-colors read-only:focus:bg-transparent"
            />
          </div>
          {perm.canEditDetails && (
            <button
              onClick={() => void handleDelete()}
              className="p-2 rounded-full text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer shrink-0 mt-1 transition-colors"
              aria-label="Delete task"
              title="Delete task"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="bg-[#F4F6FB] flex-1 overflow-y-auto p-8">
        <div className="flex gap-6 max-w-5xl">

          {/* Left — sidebar */}
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
                    disabled={!perm.canChangeStatus}
                    className={`${inputClass} bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {statusOptions.map((s) => (
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
                    disabled={!perm.canEditDetails}
                    className={`${inputClass} bg-white cursor-pointer capitalize disabled:cursor-not-allowed disabled:opacity-60`}
                    style={{ color: ps.text }}
                  >
                    {PRIORITY_OPTS.map((p) => (
                      <option key={p} value={p} className="text-[#3A4565]">
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
                    disabled={!perm.canEditDetails}
                    className={`${inputClass} bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
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
                    disabled={!perm.canEditDetails}
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
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
                    disabled={!perm.canEditDetails}
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
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
                    disabled={!perm.canEditDetails}
                    placeholder="0"
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  />
                </Meta>

                {task.assignees !== null && task.assignees.length > 0 ? (
                  <Meta label="Assignees">
                    <div className="flex gap-1 flex-wrap">
                      {task.assignees.map((id: string, i: number) => (
                        <AssigneeChip key={id} id={id} idx={i} name={assigneeNamesById.get(id) ?? undefined} />
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
                          className="inline-flex items-center gap-1.5 text-[12px] text-[#0063D6] hover:underline"
                        >
                          <GitPullRequest size={13} /> View Pull Request
                        </a>
                      ) : null}
                      {task.preview_url !== null ? (
                        <a
                          href={task.preview_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[12px] text-[#0063D6] hover:underline"
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

          {/* Right — main content */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">

            {/* Description */}
            <Card title="Description">
              <TaskDescriptionField
                projectId={projectId}
                value={description}
                readOnly={!perm.canEditDetails}
                onSave={(html) => {
                  setDescription(html);
                  void saveField({ description: html || null });
                }}
              />
            </Card>

            {/* Attachments / Comments */}
            <TaskAttachmentsCommentsPanel projectId={projectId} taskId={task.id} />
          </div>

        </div>
      </div>
    </div>
  );
}
