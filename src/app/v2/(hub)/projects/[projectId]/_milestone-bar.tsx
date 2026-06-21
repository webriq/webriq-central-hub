"use client";

import { useState } from "react";
import { Flag, Plus, X, Check, Trash2, Loader2 } from "lucide-react";
import { type Milestone, formatDueDate } from "../_pm-shared";

const M_STATUS_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  planned:   { text: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
  active:    { text: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  completed: { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
};

export default function MilestoneBar({
  projectId,
  milestones,
  onUpsert,
  onRemove,
}: {
  projectId: string;
  milestones: Milestone[];
  onUpsert: (m: Milestone) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function createMilestone() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/v2/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), due_date: due || undefined }),
    });
    if (res.ok) {
      onUpsert(await res.json());
      setName("");
      setDue("");
      setAdding(false);
    }
    setSaving(false);
  }

  async function patchMilestone(id: string, patch: Partial<Milestone>) {
    const res = await fetch(`/api/v2/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) onUpsert(await res.json());
  }

  async function deleteMilestone(id: string) {
    const res = await fetch(`/api/v2/milestones/${id}`, { method: "DELETE" });
    if (res.ok) onRemove(id);
  }

  return (
    <div className="flex items-center gap-2 mt-4 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
        <Flag size={12} /> Milestones
      </span>

      {milestones.map((m) => {
        const c = M_STATUS_STYLE[m.status] ?? M_STATUS_STYLE.planned;
        const dueLabel = formatDueDate(m.due_date);
        const isEditing = editingId === m.id;
        return (
          <div key={m.id} className="relative">
            <button
              onClick={() => setEditingId(isEditing ? null : m.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium cursor-pointer hover:opacity-80"
              style={{ color: c.text, background: c.bg, borderColor: c.border }}
            >
              {m.name}
              {dueLabel && <span className="opacity-70">· {dueLabel}</span>}
            </button>

            {isEditing && (
              <div className="absolute top-full left-0 mt-1.5 z-20 w-56 rounded-lg bg-white border border-slate-200 shadow-lg p-3 flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
                <input
                  defaultValue={m.name}
                  onBlur={(e) => { if (e.target.value.trim() && e.target.value !== m.name) patchMilestone(m.id, { name: e.target.value.trim() }); }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400"
                />
                <input
                  type="date"
                  defaultValue={m.due_date ?? ""}
                  onChange={(e) => patchMilestone(m.id, { due_date: e.target.value || null })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 outline-none focus:border-slate-400"
                />
                <div className="flex items-center gap-1">
                  {(["planned", "active", "completed"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => patchMilestone(m.id, { status: s })}
                      className={`flex-1 px-2 py-1 rounded-md text-[11px] font-medium capitalize cursor-pointer border ${m.status === s ? "" : "opacity-50"}`}
                      style={{ color: M_STATUS_STYLE[s].text, background: M_STATUS_STYLE[s].bg, borderColor: M_STATUS_STYLE[s].border }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <button onClick={() => deleteMilestone(m.id)} className="inline-flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 cursor-pointer">
                    <Trash2 size={12} /> Delete
                  </button>
                  <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer">
                    <Check size={12} /> Done
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <div className="inline-flex items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createMilestone(); if (e.key === "Escape") setAdding(false); }}
            autoFocus
            placeholder="Milestone name"
            className="px-2.5 py-1 rounded-full border border-slate-300 text-[12px] text-slate-700 outline-none focus:border-slate-400 w-36"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="px-2 py-1 rounded-full border border-slate-300 text-[11px] text-slate-600 outline-none focus:border-slate-400"
          />
          <button onClick={createMilestone} disabled={saving} className="p-1 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button onClick={() => setAdding(false)} className="p-1 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-[12px] text-slate-500 hover:text-slate-700 hover:border-slate-400 cursor-pointer"
        >
          <Plus size={13} /> Add milestone
        </button>
      )}
    </div>
  );
}
