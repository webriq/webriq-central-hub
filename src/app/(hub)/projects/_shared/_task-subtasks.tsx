"use client";

// Task 467 — body of the "Subtasks" tab on the Task Details page (v2 + legacy panels share it). Any
// subtask can have its own subtasks (capped at MAX_SUBTASK_DEPTH); every subtask is also a normal row in the Tasks listing.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, Loader2, Plus, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buildTree, rollup, MAX_SUBTASK_DEPTH, type TreeNode } from "@/lib/tasks/subtask-tree";
import { CreateTaskModal } from "./_create-task-modal";
import type { MemberOptionWithRole } from "./_project-detail";
import { STATUS_LABEL, decodeHtmlEntities, type Milestone, type Task, type Tasklist, type TaskStatus } from "@/app/(hub)/projects-old/_pm-shared";

const INDENT = ["pl-0", "pl-5", "pl-10", "pl-14", "pl-20", "pl-24"] as const;

export function TaskSubtasks({
  projectId, task, milestones, taskBasePath, canAdd, onCountChange,
}: {
  projectId: string;
  task: Task; // the task being viewed — parent of the top-level subtasks
  milestones: Milestone[];
  taskBasePath: string; // e.g. /projects/v2/{projectId}/tasks — rows link to `${taskBasePath}/${display_id}`
  canAdd: boolean;
  onCountChange?: (n: number) => void;
}) {
  const taskId = task.id;
  const taskDepth = task.depth ?? 0;
  const [rows, setRows] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<Task | null>(null); // parent the New Subtask modal is open for
  const [members, setMembers] = useState<MemberOptionWithRole[]>([]);
  const [tasklists, setTasklists] = useState<Tasklist[]>([]);
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<TreeNode<Task> | null>(null);

  const tree = useMemo(() => buildTree(rows ?? [], taskId), [rows, taskId]);
  const total = useMemo(() => rollup(tree).total, [tree]);
  useEffect(() => { if (rows) onCountChange?.(total); }, [rows, total, onCountChange]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v2/tasks/${taskId}/subtasks?tree=1`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load subtasks"))))
      .then((data: Task[]) => setRows(data))
      .catch((e) => { if (e.name !== "AbortError") { setError(e.message); setRows([]); } });
    return () => ctrl.abort();
  }, [taskId]);

  // Modal pickers (assignees, task lists) are only needed once it opens.
  useEffect(() => {
    if (!addingFor || members.length > 0) return;
    fetch("/api/staff/members").then((r) => (r.ok ? r.json() : [])).then(setMembers).catch(() => {});
    fetch(`/api/v2/projects/${projectId}/tasklists`).then((r) => (r.ok ? r.json() : [])).then(setTasklists).catch(() => {});
  }, [addingFor, members.length, projectId]);

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

  async function toggle(t: Task) {
    const next: TaskStatus = t.status === "closed" ? "open" : "closed";
    setRows((prev) => (prev ?? []).map((r) => (r.id === t.id ? { ...r, status: next } : r)));
    const res = await fetch(`/api/v2/tasks/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
    });
    if (!res.ok) setRows((prev) => (prev ?? []).map((r) => (r.id === t.id ? t : r)));
  }

  async function remove(node: TreeNode<Task>) {
    setToDelete(null);
    const gone = new Set<string>();
    const collect = (n: TreeNode<Task>) => { gone.add(n.task.id); n.children.forEach(collect); };
    collect(node);
    const snapshot = rows;
    setRows((prev) => (prev ?? []).filter((r) => !gone.has(r.id))); // FK cascade removes the descendants server-side
    const res = await fetch(`/api/v2/tasks/${node.task.id}`, { method: "DELETE" });
    if (!res.ok) { setRows(snapshot); setError("Could not delete subtask"); }
  }

  function renderNodes(nodes: TreeNode<Task>[]): React.ReactNode {
    return nodes.map((n) => {
      const t = n.task;
      const sub = rollup(n.children);
      const isCollapsed = collapsed.has(t.id);
      const absDepth = taskDepth + n.depth;
      return (
        <div key={t.id}>
          <div className={cn("group/sub flex items-center gap-2 py-1.5 border-b border-[#EDF0F7]", INDENT[Math.min(n.depth - 1, 5)])}>
            <button
              type="button"
              onClick={() => toggle(t)}
              aria-label={t.status === "closed" ? "Reopen subtask" : "Mark subtask closed"}
              className="shrink-0 text-[#5F6A88] hover:text-[#0B1533] transition-colors cursor-pointer"
            >
              {t.status === "closed" ? <CheckSquare size={15} className="text-[#1E8E5A]" /> : <Square size={15} />}
            </button>
            <Link
              href={`${taskBasePath}/${t.display_id ?? t.id}`}
              className={cn("flex-1 min-w-0 truncate text-[12.5px] hover:underline", t.status === "closed" ? "text-[#5F6A88] line-through" : "text-[#0B1533]")}
            >
              {decodeHtmlEntities(t.title)}
            </Link>
            {sub.total > 0 && (
              <button
                type="button"
                onClick={() => setCollapsed((prev) => { const x = new Set(prev); if (!x.delete(t.id)) x.add(t.id); return x; })}
                aria-label={isCollapsed ? "Expand subtasks" : "Collapse subtasks"}
                className="shrink-0 rounded-full bg-[#EDF0F7] px-2 py-0.5 text-[10.5px] font-mono text-[#5F6A88] hover:text-[#0B1533] transition-colors cursor-pointer"
              >
                {sub.done}/{sub.total}
              </button>
            )}
            <span className="shrink-0 rounded-full bg-[#EDF0F7] px-2 py-0.5 text-[10.5px] text-[#5F6A88]">
              {STATUS_LABEL[t.status as TaskStatus] ?? t.status}
            </span>
            {canAdd && absDepth < MAX_SUBTASK_DEPTH && (
              <button
                type="button"
                onClick={() => setAddingFor(t)}
                aria-label={`Add subtask under ${t.title}`}
                className="shrink-0 text-[#5F6A88] opacity-0 group-hover/sub:opacity-100 focus-visible:opacity-100 hover:text-[#007BFF] transition-colors cursor-pointer"
              >
                <Plus size={14} />
              </button>
            )}
            {canAdd && (
              <button
                type="button"
                onClick={() => setToDelete(n)}
                aria-label={`Delete ${t.title}`}
                className="shrink-0 text-[#5F6A88] opacity-0 group-hover/sub:opacity-100 focus-visible:opacity-100 hover:text-[#C0392B] transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
          {!isCollapsed && renderNodes(n.children)}
        </div>
      );
    });
  }

  if (rows === null) {
    return <div className="flex items-center gap-2 py-4 text-[12px] text-[#5F6A88]"><Loader2 size={14} className="animate-spin" /> Loading subtasks…</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p>}
      {canAdd && (
        <button
          type="button"
          onClick={() => setAddingFor(task)}
          disabled={taskDepth >= MAX_SUBTASK_DEPTH}
          className="self-start inline-flex items-center gap-1 rounded-full border border-[#E2E7F2] px-3 py-1.5 text-[12px] font-medium text-[#5F6A88] transition-colors hover:text-[#0B1533] hover:border-[#007BFF] disabled:opacity-50 cursor-pointer"
        >
          <Plus size={12} /> Add subtask
        </button>
      )}
      {addingFor && (
        <CreateTaskModal
          projectId={projectId}
          milestones={milestones}
          tasklists={tasklists}
          tasks={rows ?? []}
          allMembers={members}
          defaults={{ status: "open" }}
          parent={addingFor}
          onClose={() => setAddingFor(null)}
          onCreated={onCreated}
          onTasklistCreated={(tl) => setTasklists((prev) => [...prev, tl])}
        />
      )}
      {tree.length === 0 ? (
        <p className="py-3 text-[12px] text-[#5F6A88]">No subtasks yet.</p>
      ) : renderNodes(tree)}
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete subtask?"
        body={toDelete ? `“${toDelete.task.title}”${rollup(toDelete.children).total ? ` and its ${rollup(toDelete.children).total} nested subtask(s)` : ""} will be permanently deleted.` : ""}
        onConfirm={() => toDelete && remove(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
