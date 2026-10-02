"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Check, X, Loader2, Flag } from "lucide-react";
import { type Milestone, type Task, formatDueDate, decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { cn } from "@/lib/utils";
import MilestoneFormRow, {
  EMPTY_MILESTONE_DRAFT,
  draftFromMilestone,
  draftToPayload,
  validateMilestoneDraft,
  type MilestoneDraft,
} from "./_milestone-row-form";

const M_STATUS_CLASS: Record<string, string> = {
  planned:   "text-slate-500 bg-slate-50 border-slate-200",
  active:    "text-blue-600 bg-blue-50 border-blue-200",
  completed: "text-green-600 bg-green-50 border-green-200",
};

// Mirrors RLS `milestones_pm_write` (migration 048) — developers can read but not write.
const WRITE_ROLES = ["admin", "super_admin", "pm"];

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

export default function MilestonePanel({
  projectId,
  basePath,
  milestones,
  tasks,
  currentUserRole,
  onUpsert,
  onRemove,
}: {
  // Task 412 — the display `project_id` (UUID fallback), which is what
  // `/api/v2/projects/[projectId]/milestones` resolves by.
  projectId: string;
  // Task 276 — shared between the legacy and v2 project-detail routes (`_project-detail.tsx`),
  // so the milestone-detail link can't hardcode a single base path; caller passes its own
  // `/projects/legacy/${projectId}` or `/projects/v2/${projectId}` (task 279).
  basePath: string;
  milestones: Milestone[];
  tasks: Task[];
  currentUserRole: string | null;
  onUpsert: (m: Milestone) => void;
  onRemove: (id: string) => void;
}) {
  const canWrite = WRITE_ROLES.includes(currentUserRole ?? "");
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<MilestoneDraft>(EMPTY_MILESTONE_DRAFT);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MilestoneDraft>(EMPTY_MILESTONE_DRAFT);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Synchronous guard — Enter + a quick click on ✓ would both pass the `saving` state check
  // before React re-renders, producing duplicate POSTs.
  const savingRef = useRef(false);

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

  async function withSaving(fn: () => Promise<void>) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await fn();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function cancelCreate() {
    setAdding(false);
    setNewDraft(EMPTY_MILESTONE_DRAFT);
    setCreateError(null);
  }

  function createMilestone() {
    const invalid = validateMilestoneDraft(newDraft);
    if (invalid) return setCreateError(invalid);
    return withSaving(async () => {
      setCreateError(null);
      try {
        const res = await fetch(`/api/v2/projects/${projectId}/milestones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftToPayload(newDraft)),
        });
        if (!res.ok) return setCreateError(await errorMessage(res, "Could not create milestone."));
        onUpsert(await res.json());
        toast.success("Milestone created");
        cancelCreate();
      } catch {
        setCreateError("Network error — milestone not created.");
      }
    });
  }

  function startEdit(m: Milestone) {
    setEditingId(m.id);
    setEditDraft(draftFromMilestone(m));
    setEditError(null);
    setConfirmDeleteId(null);
  }

  function saveEdit(id: string) {
    const invalid = validateMilestoneDraft(editDraft);
    if (invalid) return setEditError(invalid);
    return withSaving(async () => {
      setEditError(null);
      try {
        const res = await fetch(`/api/v2/milestones/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftToPayload(editDraft)),
        });
        if (!res.ok) return setEditError(await errorMessage(res, "Could not save milestone."));
        onUpsert(await res.json());
        setEditingId(null);
      } catch {
        setEditError("Network error — changes not saved.");
      }
    });
  }

  function deleteMilestone(id: string) {
    return withSaving(async () => {
      setDeleteError(null);
      try {
        const res = await fetch(`/api/v2/milestones/${id}`, { method: "DELETE" });
        if (!res.ok) {
          return setDeleteError({ id, message: await errorMessage(res, "Could not delete milestone.") });
        }
        onRemove(id);
        setConfirmDeleteId(null);
        toast.success("Milestone deleted");
      } catch {
        setDeleteError({ id, message: "Network error — milestone not deleted." });
      }
    });
  }

  const iconBtn = "p-1 rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

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
        {canWrite && (
          <button
            type="button"
            onClick={() => { setAdding(true); setEditingId(null); setConfirmDeleteId(null); }}
            disabled={adding}
            className="inline-flex items-center gap-1 text-[12px] text-slate-500 transition-colors hover:text-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={12} /> Add milestone
          </button>
        )}
      </div>

      {milestones.length === 0 && !adding ? (
        <p className="px-4 py-3 text-[12px] text-slate-400">
          {canWrite ? <>No milestones yet — click &quot;Add milestone&quot; to create one.</> : "No milestones yet."}
        </p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[32%]">Name</th>
              <th className="px-4 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[14%]">Status</th>
              <th className="px-4 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[16%]">Start</th>
              <th className="px-4 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[16%]">Due</th>
              <th className="px-4 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[10%]">Tasks</th>
              <th className="px-4 py-2 w-[12%]" />
            </tr>
          </thead>
          <tbody>
            {milestones.map((m) => {
              if (editingId === m.id) {
                return (
                  <MilestoneFormRow
                    key={m.id}
                    variant="edit"
                    draft={editDraft}
                    onChange={setEditDraft}
                    onSubmit={() => saveEdit(m.id)}
                    onCancel={() => { setEditingId(null); setEditError(null); }}
                    saving={saving}
                    error={editError}
                  />
                );
              }

              const counts = countMap.get(m.id);
              const confirming = confirmDeleteId === m.id;
              const rowDeleteError = deleteError?.id === m.id ? deleteError.message : null;

              return (
                <tr key={m.id} className="border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`${basePath}/milestones/${m.id}`}
                      className="text-[13px] text-slate-700 font-medium transition-colors hover:text-slate-900 hover:underline"
                    >
                      {decodeHtmlEntities(m.name)}
                    </Link>
                    {m.description && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-400" title={decodeHtmlEntities(m.description)}>
                        {decodeHtmlEntities(m.description)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize",
                        M_STATUS_CLASS[m.status ?? "planned"] ?? M_STATUS_CLASS.planned
                      )}
                    >
                      {m.status ?? "planned"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-500">
                    {m.start_date ? formatDueDate(m.start_date) : <span className="text-slate-300">—</span>}
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
                    {canWrite && !confirming && (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          aria-label={`Edit milestone ${decodeHtmlEntities(m.name)}`}
                          title="Edit"
                          className={cn(iconBtn, "text-slate-300 hover:text-slate-600 hover:bg-slate-100")}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setConfirmDeleteId(m.id); setDeleteError(null); }}
                          aria-label={`Delete milestone ${decodeHtmlEntities(m.name)}`}
                          title="Delete"
                          className={cn(iconBtn, "text-slate-300 hover:text-red-500 hover:bg-red-50")}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                    {canWrite && confirming && (
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-medium text-red-600">Delete?</span>
                          <button
                            type="button"
                            onClick={() => deleteMilestone(m.id)}
                            disabled={saving}
                            aria-label="Confirm delete"
                            title="Confirm delete"
                            className={cn(iconBtn, "text-red-600 hover:bg-red-50")}
                          >
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
                            disabled={saving}
                            aria-label="Cancel delete"
                            title="Cancel"
                            className={cn(iconBtn, "text-slate-400 hover:bg-slate-100")}
                          >
                            <X size={13} />
                          </button>
                        </div>
                        {counts && counts.total > 0 && (
                          <span className="text-right text-[10px] text-slate-400">
                            {counts.total} task{counts.total === 1 ? "" : "s"} will be unassigned, not deleted
                          </span>
                        )}
                        {rowDeleteError && (
                          <span className="text-right text-[10px] text-red-600" role="alert">{rowDeleteError}</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {adding && (
              <MilestoneFormRow
                variant="create"
                draft={newDraft}
                onChange={setNewDraft}
                onSubmit={createMilestone}
                onCancel={cancelCreate}
                saving={saving}
                error={createError}
              />
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
