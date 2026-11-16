"use client";

// Task 467 — body of the "Subtasks" tab on the Task Details page (v2 + legacy panels share it). Any
// subtask can have its own subtasks (capped at MAX_SUBTASK_DEPTH); every subtask is also a normal row in the Tasks listing.
// Task 470 — rendered as the Tasks-listing table (shared `TaskRow`, header, bulk-delete bar) without Task List groups:
// sortable headers (siblings sorted per level), collapse/expand, checkboxes + bulk delete, hours and the per-row timer.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListTree, Loader2, Plus } from "lucide-react";
import { getTaskEditPermission } from "@/lib/tasks/permissions";
import { buildTree, rollup, MAX_SUBTASK_DEPTH, type TreeNode } from "@/lib/tasks/subtask-tree";
import { sortTasks, topSelectedIds, type SortKey, type SortDir } from "@/lib/tasks/task-sort";
import { CreateTaskModal } from "./_create-task-modal";
import { TaskRow } from "./_task-row";
import { TASK_GRID, TaskTableHeader, BulkDeleteBar } from "./_task-table-parts";
import type { MemberOptionWithRole } from "./_project-detail";
import { normalizeStatus, type Milestone, type Task, type Tasklist } from "@/app/(hub)/projects-old/_pm-shared";

type SubtaskRow = Task & { logged_hours?: number };

async function fetchTree(taskId: string, signal?: AbortSignal): Promise<SubtaskRow[]> {
  const r = await fetch(`/api/v2/tasks/${taskId}/subtasks?tree=1`, { signal });
  if (!r.ok) throw new Error("Could not load subtasks");
  return r.json();
}

const CHECKBOX = "w-3.5 h-3.5 rounded border-[#E2E7F2] cursor-pointer accent-[#007BFF] disabled:cursor-not-allowed disabled:opacity-40";

export function TaskSubtasks({
  projectId, task, milestones, taskBasePath, canAdd, currentUserId, currentUserRole, onCountChange,
}: {
  projectId: string;
  task: Task; // the task being viewed — parent of the top-level subtasks
  milestones: Milestone[];
  taskBasePath: string; // e.g. /projects/<slug>/{projectId}/tasks — rows link to `${taskBasePath}/${display_id}`
  canAdd: boolean; // may add a subtask directly under the viewed task (row-level adds use each row's own permission)
  currentUserId: string;
  currentUserRole: string | null;
  onCountChange?: (n: number) => void;
}) {
  const taskId = task.id;
  const taskDepth = task.depth ?? 0;
  const router = useRouter();
  const [rows, setRows] = useState<SubtaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<Task | null>(null); // parent the New Subtask modal is open for
  const [members, setMembers] = useState<MemberOptionWithRole[]>([]);
  const [tasklists, setTasklists] = useState<Tasklist[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: "asc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [extraHours, setExtraHours] = useState<Record<string, number>>({}); // timer stops since load

  useEffect(() => {
    const ctrl = new AbortController();
    fetchTree(taskId, ctrl.signal)
      .then(setRows)
      .catch((e) => { if (e.name !== "AbortError") { setError(e.message); setRows([]); } });
    // Assignee column + New Subtask modal both need the member pool.
    fetch("/api/staff/members", { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : [])).then(setMembers).catch(() => {});
    return () => ctrl.abort();
  }, [taskId]);

  useEffect(() => {
    if (!addingFor || tasklists.length > 0) return;
    fetch(`/api/v2/projects/${projectId}/tasklists`).then((r) => (r.ok ? r.json() : [])).then(setTasklists).catch(() => {});
  }, [addingFor, tasklists.length, projectId]);

  const tree = useMemo(() => buildTree(rows ?? [], taskId), [rows, taskId]);
  const total = useMemo(() => rollup(tree).total, [tree]);
  useEffect(() => { if (rows) onCountChange?.(total); }, [rows, total, onCountChange]);

  const profilesById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, { full_name: m.full_name ?? "", avatar_url: m.avatar_url }])),
    [members],
  );
  const hoursById = useMemo(
    () => Object.fromEntries((rows ?? []).map((r) => [r.id, (r.logged_hours ?? 0) + (extraHours[r.id] ?? 0)])),
    [rows, extraHours],
  );
  const selectableIds = useMemo(
    () => (rows ?? []).filter((r) => getTaskEditPermission(currentUserRole, currentUserId, r).canEditDetails).map((r) => r.id),
    [rows, currentUserRole, currentUserId],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const onCreated = useCallback((created: Task) => {
    const parentId = created.parent_task_id;
    // The API also adds the subtask's assignees to the parent: mirror that on a listed parent row, or refresh the
    // page when the parent is the viewed task (its Assignees sidebar is server data).
    setRows((prev) => [
      ...(prev ?? []).map((r) => (r.id === parentId ? { ...r, assignees: [...new Set([...(r.assignees ?? []), ...(created.assignees ?? [])])] } : r)),
      created,
    ]);
    if (parentId === taskId && (created.assignees ?? []).some((id) => !(task.assignees ?? []).includes(id))) router.refresh();
    if (parentId) setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    setAddingFor(null);
  }, [taskId, task.assignees, router]);

  // Optimistic inline edit (status, assignees) — mirrors ProjectDetail's `updateTask`.
  const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
    const before = rows?.find((r) => r.id === id);
    setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const res = await fetch(`/api/v2/tasks/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (!res.ok) { if (before) setRows((prev) => (prev ?? []).map((r) => (r.id === id ? before : r))); return false; }
    const updated: Task = await res.json();
    setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...updated } : r)));
    return true;
  }, [rows]);

  async function bulkDelete() {
    const parentOf = new Map((rows ?? []).map((r) => [r.id, r.parent_task_id]));
    const ids = topSelectedIds(selected, (id) => parentOf.get(id)); // the FK cascade removes their descendants
    const gone = new Set<string>();
    const collect = (nodes: TreeNode<SubtaskRow>[], inside: boolean) =>
      nodes.forEach((n) => { const hit = inside || ids.includes(n.task.id); if (hit) gone.add(n.task.id); collect(n.children, hit); });
    collect(tree, false);
    setDeleting(true);
    setRows((prev) => (prev ?? []).filter((r) => !gone.has(r.id)));
    const results = await Promise.all(ids.map((id) => fetch(`/api/v2/tasks/${id}`, { method: "DELETE" }).then((r) => r.ok, () => false)));
    setDeleting(false);
    setSelected(new Set());
    if (results.includes(false)) {
      setError("Some subtasks could not be deleted");
      const fresh = await fetchTree(taskId).catch(() => null); // re-sync with what the server kept
      if (fresh) { setRows(fresh); setExtraHours({}); }
    }
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function toggleSet(setter: typeof setSelected, id: string) {
    setter((prev) => { const n = new Set(prev); if (!n.delete(id)) n.add(id); return n; });
  }

  function sorted(nodes: TreeNode<SubtaskRow>[]) {
    if (!sort.key) return nodes;
    const byId = new Map(nodes.map((n) => [n.task.id, n]));
    return sortTasks(nodes.map((n) => n.task), sort.key, sort.dir, normalizeStatus).map((t) => byId.get(t.id)!);
  }

  function renderNodes(nodes: TreeNode<SubtaskRow>[]): React.ReactNode {
    return sorted(nodes).map((n) => {
      const t = n.task;
      const isExpanded = !collapsed.has(t.id);
      return (
        <Fragment key={t.id}>
          <TaskRow
            task={t}
            depth={n.depth - 1}
            childrenCount={n.children.length}
            rollup={n.children.length > 0 ? rollup(n.children) : null}
            isExpanded={isExpanded}
            onToggleExpand={() => toggleSet(setCollapsed, t.id)}
            selected={selected.has(t.id)}
            onToggle={() => toggleSet(setSelected, t.id)}
            href={`${taskBasePath}/${t.display_id ?? t.id}`}
            onUpdate={updateTask}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            profilesById={profilesById}
            allMembers={members}
            hoursById={hoursById}
            attachmentCount={undefined}
            onHoursLogged={(id, h) => setExtraHours((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + h }))}
            gridClass={TASK_GRID}
            onAddSubtask={taskDepth + n.depth < MAX_SUBTASK_DEPTH ? () => setAddingFor(t) : undefined}
          />
          {isExpanded && renderNodes(n.children)}
        </Fragment>
      );
    });
  }

  if (rows === null) {
    return <div className="flex items-center gap-2 py-4 text-[12px] text-[#5F6A88]"><Loader2 size={14} className="animate-spin" /> Loading subtasks…</div>;
  }

  const addButton = canAdd && (
    <button
      type="button"
      onClick={() => setAddingFor(task)}
      disabled={taskDepth >= MAX_SUBTASK_DEPTH}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#007BFF] text-white text-[12px] font-semibold hover:bg-[#0063D6] cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Plus size={13} /> Add subtask
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {(addButton || error) && (
        <div className="flex items-center justify-between gap-3">
          {error ? <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p> : <span />}
          {addButton}
        </div>
      )}
      {tree.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <div className="w-10 h-10 rounded-full bg-[#EDF0F7] flex items-center justify-center">
            <ListTree size={18} className="text-[#5F6A88]" />
          </div>
          <p className="text-[13px] text-[#5F6A88]">No subtasks yet.</p>
        </div>
      ) : (
        <>
          <BulkDeleteBar
            count={selected.size}
            noun="subtask"
            deleting={deleting}
            onClear={() => setSelected(new Set())}
            onConfirm={() => void bulkDelete()}
            className="px-3 rounded-lg border"
          />
          {/* The Task Details column is narrower than the listing: scroll sideways rather than squash columns. */}
          <div className="overflow-x-auto rounded-[14px] border border-[#E2E7F2] bg-white">
            <div className="min-w-220">
              <TaskTableHeader
                sortKey={sort.key}
                sortDir={sort.dir}
                onToggleSort={toggleSort}
                className="rounded-t-[14px]"
                leading={
                  <input
                    type="checkbox"
                    aria-label="Select all subtasks"
                    checked={allSelected}
                    disabled={selectableIds.length === 0}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(selectableIds))}
                    className={CHECKBOX}
                  />
                }
              />
              {renderNodes(tree)}
            </div>
          </div>
        </>
      )}
      {addingFor && (
        <CreateTaskModal
          projectId={projectId}
          milestones={milestones}
          tasklists={tasklists}
          tasks={rows}
          allMembers={members}
          defaults={{ status: "open" }}
          parent={addingFor}
          onClose={() => setAddingFor(null)}
          onCreated={onCreated}
          onTasklistCreated={(tl) => setTasklists((prev) => [...prev, tl])}
        />
      )}
    </div>
  );
}
