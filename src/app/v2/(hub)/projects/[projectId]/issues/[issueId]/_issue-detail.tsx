"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Loader2 } from "lucide-react";
import {
  type Issue, type IssueSeverity,
  STATUS_LABEL, STATUS_STYLE, SEVERITY_OPTS, SEVERITY_STYLE,
  normalizeStatus, normalizeSeverity,
} from "../../../_pm-shared";

const STATUS_OPTS = [
  "open", "in_progress", "ready_for_qa", "testing_completed",
  "for_client_approval", "ready_to_merge", "post_live_qa", "closed",
] as const;

type MemberOption = { id: string; full_name: string | null; avatar_url: string | null };

// ─── Local layout helpers — outside component per rerender-no-inline-components ─

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
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

export default function IssueDetailClient({
  issue,
  project,
  allMembers,
}: {
  issue: Issue;
  project: { id: string; name: string; customer_id: string; project_id: string | null };
  allMembers: MemberOption[];
}) {
  const router = useRouter();

  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [status, setStatus] = useState<string>(normalizeStatus(issue.status));
  const [severity, setSeverity] = useState<IssueSeverity>(normalizeSeverity(issue.severity));
  const [assigneeId, setAssigneeId] = useState<string>(
    () => allMembers.find((m) => m.full_name === issue.assignee_name)?.id ?? ""
  );
  const [dueDate, setDueDate] = useState(issue.due_date ?? "");
  const [deleting, setDeleting] = useState(false);

  const ss = STATUS_STYLE[status] ?? STATUS_STYLE["open"];
  const sv = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE["None"];

  const goToIssues = useCallback(() => {
    if (project.project_id) router.push(`/v2/projects/${project.project_id}/issues`);
  }, [project.project_id, router]);

  const saveField = useCallback(
    async (patch: Partial<Issue>) => {
      await fetch(`/api/v2/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [issue.id]
  );

  const saveTitle = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== issue.title) void saveField({ title: trimmed });
  }, [title, issue.title, saveField]);

  const saveDescription = useCallback(() => {
    if (description !== (issue.description ?? ""))
      void saveField({ description: description.trim() || null });
  }, [description, issue.description, saveField]);

  function saveAssignee(nextId: string) {
    setAssigneeId(nextId);
    const member = allMembers.find((m) => m.id === nextId);
    void saveField({
      assignee_name: member?.full_name ?? null,
      assignee_email: member ? null : issue.assignee_email,
    });
  }

  async function handleDelete() {
    if (!confirm("Delete this issue?")) return;
    setDeleting(true);
    await fetch(`/api/v2/issues/${issue.id}`, { method: "DELETE" });
    goToIssues();
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-8 pt-6 pb-5 bg-white border-b border-slate-100 shrink-0">
        <button
          onClick={goToIssues}
          className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 mb-3 cursor-pointer"
        >
          <ArrowLeft size={14} /> {project.name}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                ISSUE · {issue.display_id ?? issue.prefix ?? issue.id}
              </span>
              <span
                className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap"
                style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
              >
                {STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: sv.text }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sv.dot }} />
                {sv.label}
              </span>
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
            disabled={deleting}
            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0 mt-1 disabled:opacity-45"
            title="Delete issue"
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
          </div>

          {/* Right — sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-5">
            <Card title="Details">
              <div className="flex flex-col gap-4">

                <Meta label="Status">
                  <select
                    value={status}
                    onChange={(e) => {
                      const next = e.target.value;
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

                <Meta label="Severity">
                  <select
                    value={severity}
                    onChange={(e) => {
                      const next = e.target.value as IssueSeverity;
                      setSeverity(next);
                      void saveField({ severity: next });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] outline-none focus:border-slate-400 bg-white cursor-pointer"
                    style={{ color: sv.text }}
                  >
                    {SEVERITY_OPTS.map((s) => (
                      <option key={s} value={s} className="text-slate-700">
                        {SEVERITY_STYLE[s].label}
                      </option>
                    ))}
                  </select>
                </Meta>

                <Meta label="Assignee">
                  <select
                    value={assigneeId}
                    onChange={(e) => saveAssignee(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400 bg-white cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {allMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name ?? "Unknown"}</option>
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

              </div>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
