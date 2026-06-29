"use client";

import { useState, useMemo } from "react";
import { Pencil, Trash2, Plus, Check, X, Loader2, Flag } from "lucide-react";
import { type Milestone, type Task, formatDueDate } from "../_pm-shared";

const M_STATUS_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  planned:   { text: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
  active:    { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  completed: { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
};

const STATUS_OPTS = ["planned", "active", "completed"] as const;
type MilestoneStatus = (typeof STATUS_OPTS)[number];

export default function MilestonePanel({
  projectId,
  milestones,
  tasks,
  onUpsert,
  onRemove,
}: {
  projectId: string;
  milestones: Milestone[];
  tasks: Task[];
  onUpsert: (m: Milestone) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDue, setNewDue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editStatus, setEditStatus] = useState<MilestoneStatus>("planned");
  const [saving, setSaving] = useState(false);

  // O(n) task count — avoids filter-per-milestone O(n*m)
  const countMap = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const t of tasks) {
      if (!t.milestone_id) continue;
      const entry = map.get(t.milestone_id) ?? { total: 0, done: 0 };
      entry.total++;
      if (t.status === "closed") entry.done++;
      map.set(t.milestone_id, entry);
    }
    return map;
  }, [tasks]);

  async function createMilestone() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    const res = await fetch(`/api/v2/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), due_date: newDue || undefined }),
    });
    if (res.ok) {
      onUpsert(await res.json());
      setNewName("");
      setNewDue("");
      setAdding(false);
    }
    setSaving(false);
  }

  function startEdit(m: Milestone) {
    setEditingId(m.id);
    setEditName(m.name);
    setEditDue(m.due_date ?? "");
    setEditStatus((m.status as MilestoneStatus) ?? "planned");
  }

  async function saveEdit(id: string) {
    if (!editName.trim() || saving) return;
    setSaving(true);
    const res = await fetch(`/api/v2/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), due_date: editDue || undefined, status: editStatus }),
    });
    if (res.ok) {
      onUpsert(await res.json());
      setEditingId(null);
    }
    setSaving(false);
  }

  async function deleteMilestone(id: string) {
    const res = await fetch(`/api/v2/milestones/${id}`, { method: "DELETE" });
    if (res.ok) onRemove(id);
  }

  return (
    <div className="mt-4 border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-1.5">
          <Flag size={13} className="text-slate-400" />
          <span className="text-[12px] font-semibold text-slate-600">Milestones</span>
          {milestones.length > 0 && (
            <span className="text-[11px] text-slate-400">({milestones.length})</span>
          )}
        </div>
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-800 cursor-pointer"
        >
          <Plus size={12} /> Add milestone
        </button>
      </div>

      {milestones.length === 0 && !adding ? (
        <p className="px-4 py-3 text-[12px] text-slate-400">
          No milestones yet — click &quot;Add milestone&quot; to create one.
        </p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[38%]">Name</th>
              <th className="px-4 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[18%]">Status</th>
              <th className="px-4 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[20%]">Due</th>
              <th className="px-4 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[14%]">Tasks</th>
              <th className="px-4 py-2 w-[10%]" />
            </tr>
          </thead>
          <tbody>
            {milestones.map((m) => {
              const counts = countMap.get(m.id);
              const style = M_STATUS_STYLE[m.status ?? "planned"] ?? M_STATUS_STYLE.planned;
              const isEditing = editingId === m.id;

              return (
                <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  {isEditing ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(m.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full px-2 py-1 rounded-md border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as MilestoneStatus)}
                          className="w-full px-2 py-1 rounded-md border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400 bg-white capitalize"
                        >
                          {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={editDue}
                          onChange={(e) => setEditDue(e.target.value)}
                          className="w-full px-2 py-1 rounded-md border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400"
                        />
                      </td>
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => saveEdit(m.id)}
                            disabled={saving || !editName.trim()}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 cursor-pointer disabled:opacity-40"
                          >
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded text-slate-400 hover:bg-slate-100 cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-[13px] text-slate-700 font-medium">{m.name}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize"
                          style={{ color: style.text, background: style.bg, borderColor: style.border }}
                        >
                          {m.status ?? "planned"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-500">
                        {m.due_date ? formatDueDate(m.due_date) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-500">
                        {counts && counts.total > 0 ? (
                          `${counts.done} / ${counts.total}`
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => startEdit(m)}
                            className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => deleteMilestone(m.id)}
                            className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {adding && (
              <tr className="border-t border-dashed border-slate-200 bg-slate-50/40">
                <td className="px-4 py-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    placeholder="Milestone name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createMilestone();
                      if (e.key === "Escape") { setAdding(false); setNewName(""); setNewDue(""); }
                    }}
                    className="w-full px-2 py-1 rounded-md border border-slate-200 text-[12px] text-slate-700 placeholder-slate-400 outline-none focus:border-slate-400"
                  />
                </td>
                <td className="px-4 py-2 text-[12px] text-slate-400">planned</td>
                <td className="px-4 py-2">
                  <input
                    type="date"
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    className="w-full px-2 py-1 rounded-md border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400"
                  />
                </td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={createMilestone}
                      disabled={saving || !newName.trim()}
                      className="p-1 rounded text-emerald-600 hover:bg-emerald-50 cursor-pointer disabled:opacity-40"
                    >
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    </button>
                    <button
                      onClick={() => { setAdding(false); setNewName(""); setNewDue(""); }}
                      className="p-1 rounded text-slate-400 hover:bg-slate-100 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
