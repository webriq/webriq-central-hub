"use client";

import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PMSettings } from "@/hooks/use-pm-settings";
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

const TASK_TYPES = [
  "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
  "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST", "STRATEGIC", "OTHER",
] as const;
const PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const;

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

interface Props {
  settings: PMSettings;
  tasks: ClassificationRow[];
  zohoProjectMap?: Record<string, string>;
}

type FilterTab = "all" | "review" | "classified";

export default function TasksTab({ settings, tasks, zohoProjectMap = {} }: Props) {
  const [tab, setTab] = useState<FilterTab>("all");
  const [reclassifyTarget, setReclassifyTarget] = useState<ClassificationRow | null>(null);
  // Optimistic overrides: applied on top of the tasks prop until realtime re-fetch arrives
  const [overrides, setOverrides] = useState<Record<string, Partial<ClassificationRow>>>({});

  const displayTasks = tasks.map(t => overrides[t.id] ? { ...t, ...overrides[t.id] } : t);

  const shown = tab === "all"
    ? displayTasks
    : tab === "review"
    ? displayTasks.filter(t => t.status === "pending" || (t.confidence_score ?? 100) < 75)
    : displayTasks.filter(t => t.status === "reviewed");

  const reviewCount = displayTasks.filter(t => t.status === "pending" || (t.confidence_score ?? 100) < 75).length;

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
        <div className="flex gap-1.5">
          {([
            ["all", "All", displayTasks.length],
            ["review", "Needs Review", reviewCount],
            ["classified", "Classified", displayTasks.filter(t => t.status === "reviewed").length],
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
                {["Pri", "Task", "Customer", "Type", "AI Confidence", "Status", "Age", "Zoho"].map(h => (
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
                      <span className="text-[11px] font-semibold text-(--c-green)">✓ Classified</span>
                    )}
                  </td>
                  <td className="py-3.25 px-4">
                    <span className="text-[11px] text-(--c-muted)">{formatAge(t.created_at)}</span>
                  </td>
                  <td className="py-3.25 px-4 text-center">
                    {t.zoho_task_id && zohoProjectMap[t.customer_id] ? (
                      <a
                        href={`https://projects.zoho.com/portal/${process.env.NEXT_PUBLIC_ZOHO_PORTAL_NAME ?? ""}/project/${zohoProjectMap[t.customer_id]}/tasks/all/task/${t.zoho_task_id}/`}
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
    </div>
  );
}
