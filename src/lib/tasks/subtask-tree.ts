// Task 467 — pure helpers for the subtask tree. A subtask is a normal `tasks` row whose `parent_task_id` points at its parent.
export const MAX_SUBTASK_DEPTH = 5; // levels below a root task; the listing indent supports 6

export type TreeTask = { id: string; parent_task_id: string | null; status: string; position?: number | null };
export type TreeNode<T extends TreeTask> = { task: T; depth: number; children: TreeNode<T>[] };

// Descendants of `rootId` as a forest (depth 1 = direct children). Orphans and cycles are never reached.
export function buildTree<T extends TreeTask>(tasks: T[], rootId: string): TreeNode<T>[] {
  const byParent = new Map<string, T[]>();
  for (const t of tasks) {
    if (!t.parent_task_id) continue;
    const list = byParent.get(t.parent_task_id) ?? [];
    list.push(t);
    byParent.set(t.parent_task_id, list);
  }
  const seen = new Set<string>([rootId]);
  const walk = (parentId: string, depth: number): TreeNode<T>[] => {
    const kids = (byParent.get(parentId) ?? []).filter((t) => !seen.has(t.id)); // `seen` guards cycles
    kids.forEach((t) => seen.add(t.id));
    return kids
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((task) => ({ task, depth, children: walk(task.id, depth + 1) }));
  };
  return walk(rootId, 1);
}

// All descendants (not just direct children); "done" = status closed.
export function rollup<T extends TreeTask>(nodes: TreeNode<T>[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const n of nodes) {
    total += 1;
    if (n.task.status === "closed") done += 1;
    const sub = rollup(n.children);
    done += sub.done;
    total += sub.total;
  }
  return { done, total };
}
