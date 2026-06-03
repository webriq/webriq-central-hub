"use client";

import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PMSettings } from "@/hooks/use-pm-settings";
import type { TaskType, TaskPriority } from "@/types/hub";
import { PriorityDot } from "./shared";
import type { Database } from "@/types/database";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"] & {
  customers?: { company_name: string } | null;
};

const CARD = "rounded-[14px] border border-(--c-border) shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-(--c-card)";

function confClass(score: number | null): string {
  const v = score ?? 0;
  if (v >= 80) return "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800";
  if (v >= 60) return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800";
  return "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800";
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type Developer = { id: string; display_name: string | null; email: string };

function AssignDropdown({ taskId, developers }: { taskId: string; developers: Developer[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [assignedNames, setAssignedNames] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDev(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleAssign() {
    if (!selected.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classification/${taskId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developerIds: selected }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, string>;
        const msg = json.error === "add_to_project_failed"
          ? "Failed to add developer to Zoho project"
          : json.error === "no_zoho_task"
          ? "Task not synced to Zoho yet"
          : json.error === "no_zoho_project"
          ? "No Zoho project for this customer"
          : json.error ?? "Assign failed";
        setError(msg);
        return;
      }
      const json = await res.json() as { ok: boolean; developerNames?: string[] };
      setAssignedNames(json.developerNames ?? []);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  if (assignedNames !== null) {
    return <span className="text-[11px] font-semibold text-(--c-green)">{assignedNames.join(", ")}</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[11px] border border-(--c-border) rounded-[5px] px-2 py-1 bg-(--c-card) text-(--c-text) cursor-pointer focus:outline-none min-w-[110px] text-left"
      >
        {selected.length ? `${selected.length} selected` : "— Assign Dev —"}
      </button>
      {open ? (
        <div className="absolute z-20 left-0 mt-1 bg-(--c-card) border border-(--c-border) rounded-lg shadow-lg p-2 min-w-[160px]">
          {developers.map(d => (
            <label key={d.id} className="flex items-center gap-2 py-1 cursor-pointer text-[12px] text-(--c-text) hover:text-(--c-blue)">
              <input
                type="checkbox"
                checked={selected.includes(d.id)}
                onChange={() => toggleDev(d.id)}
                className="rounded cursor-pointer"
              />
              {d.display_name ?? d.email}
            </label>
          ))}
          <button
            onClick={handleAssign}
            disabled={!selected.length || loading}
            className="mt-2 w-full text-[11px] font-semibold px-2 py-1 rounded-[5px] bg-(--c-blue) text-white disabled:opacity-40 cursor-pointer border-0"
          >
            {loading ? "Assigning…" : "Assign"}
          </button>
        </div>
      ) : null}
      {error !== null ? (
        <span className="text-[10px] text-red-500 leading-tight block mt-0.5">{error}</span>
      ) : null}
    </div>
  );
}

const TASK_TYPES: TaskType[] = [
  "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
  "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST", "STRATEGIC", "OTHER",
];
const PRIORITIES: TaskPriority[] = ["CRITICAL", "HIGH", "NORMAL", "LOW"];

function ReclassifyModal({ record, onClose, onSave }: {
  record: ClassificationRow;
  onClose: () => void;
  onSave: (updated: ClassificationRow) => void;
}) {
  const [taskType, setTaskType] = useState(record.task_type ?? "OTHER");
  const [priority, setPriority] = useState(record.priority ?? "NORMAL");
  const [llmEligible, setLlmEligible] = useState(record.llm_eligible ?? "NO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasoning =
    record.raw_response !== null &&
    typeof record.raw_response === "object" &&
    !Array.isArray(record.raw_response) &&
    typeof (record.raw_response as Record<string, unknown>).reasoning === "string"
      ? (record.raw_response as Record<string, unknown>).reasoning as string
      : null;

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/classification/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_type: taskType, priority, llm_eligible: llmEligible }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json.error as string) ?? "Failed to save");
        return;
      }
      const updated = await res.json() as ClassificationRow;
      onSave({ ...updated, customers: record.customers });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const selectClass = "w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.06em] mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">Re-classify Task</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>
        <p className="text-[13px] text-gray-600 dark:text-gray-400 mb-4 leading-relaxed line-clamp-2">
          {record.title}
        </p>

        {reasoning !== null ? (
          <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.06em] mb-1">
              AI Reasoning
            </p>
            <p className="text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed">
              {reasoning}
            </p>
          </div>
        ) : null}

        <div className="space-y-3 mb-5">
          <div>
            <label className={labelClass}>Task Type</label>
            <select value={taskType} onChange={e => setTaskType(e.target.value)} className={selectClass}>
              {TASK_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={selectClass}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>LLM Eligible</label>
            <select value={llmEligible} onChange={e => setLlmEligible(e.target.value)} className={selectClass}>
              <option value="YES">YES — AI automation allowed</option>
              <option value="NO">NO — Human required</option>
              <option value="HUMAN_ONLY">HUMAN ONLY — Never automate</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-[12px] text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-[13px] font-semibold px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

type Customer = { customer_id: string; company_name: string };

function CreateTaskModal({ customers, onClose }: { customers: Customer[]; onClose: () => void }) {
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<string>("OTHER");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [llmEligible, setLlmEligible] = useState<string>("NO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectClass = "w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.06em] mb-1";

  async function handleSubmit() {
    if (!customerId || !title) {
      setError("Customer and title are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/classification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "hub_manual",
          customerId,
          title,
          description: description || null,
          task_type: taskType,
          priority,
          llm_eligible: llmEligible,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, string>;
        setError(json.error ?? "Failed to create task");
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">Create Task</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className={labelClass}>Customer</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={selectClass}>
              <option value="">— Select customer —</option>
              {customers.map(c => (
                <option key={c.customer_id} value={c.customer_id}>{c.company_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
              className={selectClass}
            />
          </div>
          <div>
            <label className={labelClass}>Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Additional details..."
              rows={2}
              className={`${selectClass} resize-none`}
            />
          </div>
          <div>
            <label className={labelClass}>Task Type</label>
            <select value={taskType} onChange={e => setTaskType(e.target.value)} className={selectClass}>
              {TASK_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={selectClass}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>LLM Eligible</label>
            <select value={llmEligible} onChange={e => setLlmEligible(e.target.value)} className={selectClass}>
              <option value="YES">YES — AI automation allowed</option>
              <option value="NO">NO — Human required</option>
              <option value="HUMAN_ONLY">HUMAN ONLY — Never automate</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-[12px] text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-[13px] font-semibold px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Creating…" : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  settings: PMSettings;
  tasks: ClassificationRow[];
  zohoProjectMap?: Record<string, string>;
  reviewerMap?: Record<string, string>;
  developers?: Developer[];
  customers?: Customer[];
}

type FilterTab = "all" | "review" | "classified" | "in_review";

export default function TasksTab({ settings, tasks, zohoProjectMap = {}, reviewerMap = {}, developers = [], customers = [] }: Props) {
  const [tab, setTab] = useState<FilterTab>("all");
  const [reclassifyTarget, setReclassifyTarget] = useState<ClassificationRow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Optimistic overrides: applied on top of the tasks prop until realtime re-fetch arrives
  const [overrides, setOverrides] = useState<Record<string, Partial<ClassificationRow>>>({});

  const displayTasks = tasks.map(t => overrides[t.id] ? { ...t, ...overrides[t.id] } : t);

  const isNeedsReview = (t: ClassificationRow) => t.status === "pending" || (t.confidence_score ?? 100) < 75;

  const reviewCount = displayTasks.filter(isNeedsReview).length;
  const inReviewCount = displayTasks.filter(t => t.status === "review").length;
  const classifiedCount = displayTasks.filter(t => t.status === "reviewed").length;

  const shown = tab === "all"
    ? displayTasks
    : tab === "review"
    ? displayTasks.filter(isNeedsReview)
    : tab === "in_review"
    ? displayTasks.filter(t => t.status === "review")
    : displayTasks.filter(t => t.status === "reviewed");

  function handleSave(updated: ClassificationRow) {
    setOverrides(prev => ({ ...prev, [updated.id]: updated }));
  }

  return (
    <div className={settings.theme === "dark" ? "pm-dark" : "pm-light"}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[22px] font-bold text-(--c-text) tracking-[-0.02em]">Task Queue</div>
          <div className="text-xs text-(--c-sub) mt-0.5">{displayTasks.length} items</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-xs font-semibold rounded-lg px-3.5 py-1.75 cursor-pointer border bg-(--c-blue) text-white border-(--c-blue)"
          >
            + Create Task
          </button>
          {([
            ["all", "All", displayTasks.length],
            ["review", "Needs Review", reviewCount],
            ["in_review", "In Review", inReviewCount],
            ["classified", "Classified", classifiedCount],
          ] as const).map(([k, l, count]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`text-xs font-semibold rounded-lg px-3.5 py-1.75 cursor-pointer border transition-colors ${
                tab === k
                  ? "text-white bg-(--c-blue) border-(--c-blue)"
                  : "text-(--c-sub) bg-(--c-card) border-(--c-border)"
              }`}
            >
              {l}{count > 0 ? ` (${count})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        {shown.length === 0 ? (
          <div className="py-12 text-center text-(--c-muted) text-sm">
            {displayTasks.length === 0 ? "No tasks yet — waiting for Zoho webhook events." : "No tasks match this filter."}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-(--c-border)">
                {["Pri", "Task", "Customer", "Type", "AI Confidence", "Status", "Assign", "Age", "Zoho"].map(h => (
                  <th key={h} className="py-2.25 px-4 text-left text-[10px] font-bold text-(--c-muted) tracking-[0.06em] uppercase whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((t, i) => (
                <tr key={t.id} className={`${i < shown.length - 1 ? "border-b border-(--c-border)" : ""}`}>
                  <td className="py-3.25 px-4">
                    <PriorityDot priority={t.priority ?? "NORMAL"} />
                  </td>
                  <td className="py-3.25 px-4 min-w-65">
                    <div className="text-[13px] font-medium text-(--c-text) leading-[1.35]">{t.title}</div>
                    <code className="text-[10px] text-(--c-muted) font-mono">{t.id.slice(0, 8)}</code>
                  </td>
                  <td className="py-3.25 px-4">
                    <span className="text-xs text-(--c-sub)">
                      {t.customers?.company_name ?? t.customer_id}
                    </span>
                  </td>
                  <td className="py-3.25 px-4">
                    {t.task_type ? (
                      <span className="text-[11px] text-(--c-sky) bg-(--c-sky-tint2) rounded-[5px] px-2 py-px border border-(--c-sky-border)">
                        {t.task_type.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className="text-[11px] text-(--c-muted)">—</span>
                    )}
                  </td>
                  <td className="py-3.25 px-4">
                    {t.confidence_score !== null ? (
                      <span className={`text-[11px] font-semibold rounded-[6px] px-2 py-px font-mono border ${confClass(t.confidence_score)}`}>
                        {Math.round(t.confidence_score)}%
                      </span>
                    ) : (
                      <span className="text-[11px] text-(--c-muted)">—</span>
                    )}
                  </td>
                  <td className="py-3.25 px-4">
                    {t.status === "pending" ? (
                      <button
                        onClick={() => setReclassifyTarget(t)}
                        className="text-[11px] font-semibold text-white bg-(--c-blue) rounded-[6px] px-3 py-1.25 cursor-pointer border-0"
                      >
                        Classify
                      </button>
                    ) : (
                      <div>
                        <span className="text-[11px] font-semibold text-(--c-green)">✓ Classified</span>
                        {(t.confidence_score ?? 100) < 75 ? (
                          <button
                            onClick={() => setReclassifyTarget(t)}
                            className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5 cursor-pointer hover:underline"
                          >
                            Re-classify
                          </button>
                        ) : null}
                        {t.reviewed_at ? (
                          <div className="text-[10px] text-(--c-muted) mt-0.5 leading-tight">
                            {t.reviewed_by && reviewerMap[t.reviewed_by] ? `${reviewerMap[t.reviewed_by]} · ` : ""}
                            {formatAge(t.reviewed_at)}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="py-3.25 px-4">
                    {t.llm_eligible === "YES" ? (
                      <span className="text-[11px] text-(--c-muted)">AI</span>
                    ) : t.zoho_task_id && zohoProjectMap[t.customer_id] ? (
                      <AssignDropdown taskId={t.id} developers={developers} />
                    ) : (
                      <span className="text-[11px] text-(--c-muted)">—</span>
                    )}
                  </td>
                  <td className="py-3.25 px-4">
                    <span className="text-[11px] text-(--c-muted)">{formatAge(t.created_at)}</span>
                  </td>
                  <td className="py-3.25 px-4 text-center">
                    {t.zoho_task_id && zohoProjectMap[t.customer_id] ? (
                      <a
                        href={`https://projects.zoho.com/portal/${process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME ?? ""}#zp/task-detail/${t.zoho_task_id}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--c-blue) hover:opacity-70 inline-flex"
                        title="Open in Zoho"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reclassifyTarget && (
        <ReclassifyModal
          record={reclassifyTarget}
          onClose={() => setReclassifyTarget(null)}
          onSave={handleSave}
        />
      )}
      {showCreateModal && (
        <CreateTaskModal customers={customers} onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}
