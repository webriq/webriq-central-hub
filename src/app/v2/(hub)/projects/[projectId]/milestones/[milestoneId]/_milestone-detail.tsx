"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Loader2, Flag } from "lucide-react";
import {
  type Milestone, type Task,
  STATUS_LABEL, STATUS_STYLE, normalizeStatus,
} from "../../../_pm-shared";

const M_STATUS_OPTS = ["planned", "active", "completed"] as const;
type MilestoneStatus = (typeof M_STATUS_OPTS)[number];

const M_STATUS_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  planned:   { text: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
  active:    { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  completed: { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
};

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

export default function MilestoneDetailClient({
  milestone,
  project,
  linkedTasks,
}: {
  milestone: Milestone;
  project: { id: string; name: string; customer_id: string; project_id: string | null };
  linkedTasks: Task[];
}) {
  const router = useRouter();

  const [name, setName] = useState(milestone.name);
  const [description, setDescription] = useState(milestone.description ?? "");
  const [status, setStatus] = useState<MilestoneStatus>((milestone.status as MilestoneStatus) ?? "planned");
  const [dueDate, setDueDate] = useState(milestone.due_date ?? "");
  const [startDate, setStartDate] = useState(milestone.start_date ?? "");
  const [deleting, setDeleting] = useState(false);

  const ms = M_STATUS_STYLE[status] ?? M_STATUS_STYLE.planned;
  const doneCount = linkedTasks.filter((t) => t.status === "closed").length;

  const goToMilestones = useCallback(() => {
    if (project.project_id) router.push(`/v2/projects/${project.project_id}/milestones`);
  }, [project.project_id, router]);

  const saveField = useCallback(
    async (patch: Partial<Milestone>) => {
      await fetch(`/api/v2/milestones/${milestone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [milestone.id]
  );

  const saveName = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== milestone.name) void saveField({ name: trimmed });
  }, [name, milestone.name, saveField]);

  const saveDescription = useCallback(() => {
    if (description !== (milestone.description ?? ""))
      void saveField({ description: description.trim() || null });
  }, [description, milestone.description, saveField]);

  async function handleDelete() {
    if (!confirm("Delete this milestone? Linked tasks will be unassigned from it.")) return;
    setDeleting(true);
    await fetch(`/api/v2/milestones/${milestone.id}`, { method: "DELETE" });
    goToMilestones();
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-8 pt-6 pb-5 bg-white border-b border-slate-100 shrink-0">
        <button
          onClick={goToMilestones}
          className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 mb-3 cursor-pointer"
        >
          <ArrowLeft size={14} /> {project.name}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                <Flag size={11} /> MILESTONE
              </span>
              <span
                className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize whitespace-nowrap"
                style={{ color: ms.text, background: ms.bg, borderColor: ms.border }}
              >
                {status}
              </span>
            </div>
            <textarea
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              rows={2}
              className="text-[22px] font-bold text-slate-900 tracking-[-0.02em] outline-none resize-none leading-snug w-full border-0 focus:bg-slate-50 rounded-lg px-2 -mx-2"
            />
          </div>
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0 mt-1 disabled:opacity-45"
            title="Delete milestone"
          >
            {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="bg-slate-50 flex-1 overflow-y-auto p-8">
        <div className="flex gap-6 max-w-5xl">

          {/* Left — main content */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">
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

            <Card title="Tasks" count={linkedTasks.length > 0 ? `${doneCount}/${linkedTasks.length}` : undefined}>
              {linkedTasks.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {linkedTasks.map((t) => {
                    const norm = normalizeStatus(t.status);
                    const ts = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
                    return (
                      <button
                        key={t.id}
                        onClick={() => project.project_id && router.push(`/v2/projects/${project.project_id}/tasks/${t.display_id}`)}
                        className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-left transition-colors"
                      >
                        <span className="text-[13px] text-slate-700 truncate">{t.title}</span>
                        <span
                          className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0"
                          style={{ color: ts.text, background: ts.bg, borderColor: ts.border }}
                        >
                          {STATUS_LABEL[norm as keyof typeof STATUS_LABEL] ?? norm}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[13px] text-slate-400">No tasks assigned to this milestone yet.</p>
              )}
            </Card>
          </div>

          {/* Right — sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-5">
            <Card title="Details">
              <div className="flex flex-col gap-4">

                <Meta label="Status">
                  <select
                    value={status}
                    onChange={(e) => {
                      const next = e.target.value as MilestoneStatus;
                      setStatus(next);
                      void saveField({ status: next });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400 bg-white cursor-pointer capitalize"
                  >
                    {M_STATUS_OPTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
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

              </div>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
