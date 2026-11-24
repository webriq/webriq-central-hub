// Task 487 — pure drop resolution for the Tasks listing drag-and-drop (pointer, keyboard and "Move to…").
import { NO_LIST, NO_PHASE, subtreeHeight, subtreeIds, type GroupNode, type PhaseNode, type TreeTask } from "./_task-tree";

export const MAX_DEPTH = 5; // = MAX_SUBTASK_DEPTH (src/lib/tasks/subtask-tree.ts); move_task enforces the same cap

export type DragKind = "task" | "group" | "phase";
export type Zone = "before" | "after" | "nest" | "into";
export type DropTarget = { kind: DragKind; id: string; zone: Zone };
export type TaskMove = { taskId: string; tasklistId: string; parentId: string | null; beforeId: string | null; afterId: string | null; depth: number };
/** Task 502 — into a phase that has no task list yet: the server creates one named after the phase. */
export type PhaseMove = { taskId: string; milestoneId: string };
export type AnyTaskMove = TaskMove | PhaseMove;
export const isPhaseMove = (m: AnyTaskMove): m is PhaseMove => "milestoneId" in m;

/** Pointer position within the hovered row (0 = top edge, 1 = bottom) → drop zone for the dragged kind. */
export function zoneFor(target: DragKind, dragged: DragKind, rel: number): Zone | null {
  if (target === "task") return dragged === "task" ? (rel < 0.3 ? "before" : rel > 0.7 ? "after" : "nest") : null;
  if (target === "group") return dragged === "task" ? "into" : dragged === "group" ? (rel < 0.5 ? "before" : "after") : null;
  return dragged === "phase" ? (rel < 0.5 ? "before" : "after") : "into";
}

export type TaskCtx<T extends TreeTask> = {
  byId: Map<string, T>;
  children: Map<string, T[]>;
  groups: GroupNode<T>[]; // displayed order, all phases
  phases: PhaseNode<T, unknown>[];
  groupOf: (t: { tasklist_id: string | null }) => string;
};

/** `anywhere` = may change list/parent (editor, and migration 184 applied); otherwise siblings only. */
export function resolveTaskMove<T extends TreeTask>(ctx: TaskCtx<T>, activeId: string, target: DropTarget, anywhere: boolean): AnyTaskMove | null {
  const active = ctx.byId.get(activeId);
  if (!active) return null;
  // Task 502 — a phase with no lists: a list change by definition, so it needs `anywhere`. Depth is 0
  // (top level of the new list), which never exceeds MAX_DEPTH on its own.
  if (target.kind === "phase") {
    const phase = ctx.phases.find((p) => p.key === target.id);
    if (phase?.milestone && phase.groups.length === 0) return anywhere ? { taskId: activeId, milestoneId: phase.key } : null;
  }
  const rootsOf = (gid: string) => ctx.groups.find((g) => g.id === gid)?.tasks ?? [];

  let groupId: string, parentId: string | null, list: T[], anchor: string | null, after = false;
  if (target.kind === "task") {
    const t = ctx.byId.get(target.id);
    if (!t || subtreeIds(activeId, ctx.children).has(t.id)) return null;
    groupId = ctx.groupOf(t);
    if (target.zone === "nest") {
      parentId = t.id; list = ctx.children.get(t.id) ?? []; anchor = null; after = true;
    } else {
      parentId = t.parent_task_id; list = parentId ? ctx.children.get(parentId) ?? [] : rootsOf(groupId);
      anchor = t.id; after = target.zone === "after";
    }
  } else {
    const gid = target.kind === "group" ? target.id : ctx.phases.find((p) => p.key === target.id)?.groups[0]?.id;
    if (!gid) return null;
    groupId = gid; parentId = null; list = rootsOf(gid); anchor = null;
  }
  if (groupId === NO_LIST) return null;

  const rest = list.filter((s) => s.id !== activeId);
  let i = anchor ? rest.findIndex((s) => s.id === anchor) : after ? rest.length : 0;
  if (i < 0) return null;
  if (anchor && after) i += 1;

  const depth = parentId ? (ctx.byId.get(parentId)?.depth ?? 0) + 1 : 0;
  if (depth + subtreeHeight(activeId, ctx.children) > MAX_DEPTH) return null;

  const sameSlot = parentId === active.parent_task_id && groupId === ctx.groupOf(active);
  if (!anywhere && !sameSlot) return null;
  const beforeId = rest[i - 1]?.id ?? null;
  const afterId = rest[i]?.id ?? null;
  if (sameSlot) {
    const k = list.findIndex((s) => s.id === activeId);
    if ((list[k - 1]?.id ?? null) === beforeId && (list[k + 1]?.id ?? null) === afterId) return null; // no-op
  }
  return { taskId: activeId, tasklistId: groupId, parentId, beforeId, afterId, depth };
}

/** New order of `ids` with `activeId` placed before/after `targetId` (or appended for "into"). Null = no change. */
export function reorderIds(ids: string[], activeId: string, targetId: string | null, zone: Zone): string[] | null {
  const rest = ids.filter((id) => id !== activeId);
  let i = targetId ? rest.indexOf(targetId) : rest.length;
  if (i < 0) return null;
  if (zone === "after") i += 1;
  rest.splice(i, 0, activeId);
  return rest.join() === ids.join() ? null : rest;
}

export type GroupMove = { groupId: string; phaseKey: string; order: string[] };

export function resolveGroupMove<T>(phases: PhaseNode<T, unknown>[], activeId: string, target: DropTarget): GroupMove | null {
  if (activeId === NO_LIST) return null;
  const phaseKey = target.kind === "group"
    ? phases.find((p) => p.groups.some((g) => g.id === target.id))?.key
    : target.kind === "phase" ? target.id : undefined;
  if (!phaseKey || (target.kind === "group" && target.id === activeId)) return null;
  const ids = phases.find((p) => p.key === phaseKey)!.groups.map((g) => g.id).filter((id) => id !== NO_LIST);
  const order = reorderIds(ids, activeId, target.kind === "group" ? target.id : null, target.zone);
  return order ? { groupId: activeId, phaseKey, order } : null;
}

export function resolvePhaseMove<T>(phases: PhaseNode<T, unknown>[], activeId: string, target: DropTarget): string[] | null {
  if (target.kind !== "phase" || target.id === NO_PHASE || activeId === NO_PHASE) return null;
  return reorderIds(phases.filter((p) => p.milestone).map((p) => p.key), activeId, target.id, target.zone);
}

/** 1-based positions for an ordered id list, only where they differ from today's. */
export function positionsToWrite(order: string[], current: Map<string, number | null>): { id: string; position: number }[] {
  return order.map((id, i) => ({ id, position: i + 1 })).filter((p) => current.get(p.id) !== p.position);
}
