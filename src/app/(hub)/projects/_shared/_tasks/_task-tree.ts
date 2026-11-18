// Task 487 — pure tree model for the Tasks listing: Phase (milestone) › Group (tasklist) › root task › subtasks.
// No React / no client-module runtime imports, so `_docs/task/487-move-rules.check.ts` can run it under tsx.

export type TreeTask = {
  id: string; parent_task_id: string | null; tasklist_id: string | null;
  depth: number; position: number | null; status: string;
};
export type TreeList = { id: string; name: string; position: number | null; milestone_id: string | null; created_at: string };
export type TreeMilestone = { id: string; name: string; position: number | null; start_date: string | null; status: string; due_date: string | null };

export const NO_PHASE = "none";
/** Collapse-state key of a phase band (task-list ids are used as-is). */
export const phaseKey = (id: string) => `phase:${id}`;
export const NO_LIST = "__none"; // orphan bucket, only when the project has no General list (task 486)

export type GroupNode<T> = { id: string; name: string; phaseKey: string; tasks: T[]; done: number; total: number };
export type PhaseNode<T, M> = { key: string; milestone: M | null; number: number | null; groups: GroupNode<T>[]; done: number; total: number };

const byPosition = (a: { position: number | null }, b: { position: number | null }) =>
  (a.position ?? Infinity) - (b.position ?? Infinity) || 0;

/** Task 486 — the project's "General" list (with or without a phase, no-phase preferred), if visible. */
export function generalTasklistId(tasklists: { id: string; name: string; milestone_id: string | null }[]): string | undefined {
  const generals = tasklists.filter((tl) => tl.name.trim().toLowerCase() === "general");
  return (generals.find((tl) => !tl.milestone_id) ?? generals[0])?.id;
}

export function orderedMilestones<M extends TreeMilestone>(ms: M[]): M[] {
  return [...ms].sort((a, b) => byPosition(a, b) || (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"));
}

export function orderedTasklists<L extends TreeList>(lists: L[]): L[] {
  return [...lists].sort((a, b) => byPosition(a, b) || a.created_at.localeCompare(b.created_at));
}

/** Group id a task renders under (subtasks share their root's tasklist — subtask route invariant). */
export function groupResolver(tasklists: TreeList[]): (t: { tasklist_id: string | null }) => string {
  const ids = new Set(tasklists.map((l) => l.id));
  const fallback = generalTasklistId(tasklists) ?? NO_LIST;
  return (t) => (t.tasklist_id && ids.has(t.tasklist_id) ? t.tasklist_id : fallback);
}

export function childrenMap<T extends TreeTask>(tasks: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of tasks) {
    if (!t.parent_task_id) continue;
    const kids = map.get(t.parent_task_id) ?? [];
    kids.push(t);
    map.set(t.parent_task_id, kids);
  }
  for (const kids of map.values()) kids.sort(byPosition);
  return map;
}

/** Ids of `id` and every descendant. */
export function subtreeIds(id: string, children: Map<string, { id: string }[]>): Set<string> {
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) for (const c of children.get(stack.pop()!) ?? []) if (!out.has(c.id)) { out.add(c.id); stack.push(c.id); }
  return out;
}

/** Levels below `id` (0 = no children). */
export function subtreeHeight(id: string, children: Map<string, { id: string }[]>, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  let h = 0;
  for (const c of children.get(id) ?? []) h = Math.max(h, 1 + subtreeHeight(c.id, children, seen));
  return h;
}

/** Task 467 — closed/total over ALL descendants. */
export function descendantRollup(id: string, children: Map<string, TreeTask[]>): { done: number; total: number } {
  let done = 0, total = 0;
  for (const c of children.get(id) ?? []) {
    const sub = descendantRollup(c.id, children);
    total += 1 + sub.total;
    done += (c.status === "closed" ? 1 : 0) + sub.done;
  }
  return { done, total };
}

export function progress(tasks: { status: string }[]): { done: number; total: number } {
  return { done: tasks.filter((t) => t.status === "closed").length, total: tasks.length };
}

export function buildPhases<T extends TreeTask, M extends TreeMilestone>(
  tasks: T[], tasklists: TreeList[], milestones: M[], sortRoots: (list: T[]) => T[],
): PhaseNode<T, M>[] {
  const lists = orderedTasklists(tasklists);
  const ms = orderedMilestones(milestones);
  const msIds = new Set(ms.map((m) => m.id));
  const groupOf = groupResolver(lists);

  const roots = new Map<string, T[]>();
  const counts = new Map<string, { done: number; total: number }>();
  for (const t of tasks) {
    const g = groupOf(t);
    const c = counts.get(g) ?? { done: 0, total: 0 };
    c.total += 1;
    if (t.status === "closed") c.done += 1;
    counts.set(g, c);
    if (!t.parent_task_id && t.depth === 0) roots.set(g, [...(roots.get(g) ?? []), t]);
  }

  const group = (id: string, name: string, phaseKey: string): GroupNode<T> =>
    ({ id, name, phaseKey, tasks: sortRoots(roots.get(id) ?? []), ...(counts.get(id) ?? { done: 0, total: 0 }) });
  const groups = lists.map((l) => group(l.id, l.name, l.milestone_id && msIds.has(l.milestone_id) ? l.milestone_id : NO_PHASE));
  if (roots.get(NO_LIST)?.length) groups.push(group(NO_LIST, "General", NO_PHASE));

  const phase = (key: string, milestone: M | null, number: number | null): PhaseNode<T, M> => {
    const gs = groups.filter((g) => g.phaseKey === key);
    return { key, milestone, number, groups: gs, done: gs.reduce((n, g) => n + g.done, 0), total: gs.reduce((n, g) => n + g.total, 0) };
  };
  const out = ms.map((m, i) => phase(m.id, m, i + 1));
  const rest = phase(NO_PHASE, null, null);
  if (ms.length === 0 || rest.groups.length > 0) out.push(rest);
  return out;
}
