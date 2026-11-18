"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { type Task, type Tasklist, type Milestone, midpoint, decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { positionsToWrite, type GroupMove, type TaskMove } from "./_move-rules";
import { NO_PHASE, childrenMap, subtreeIds } from "./_task-tree";

type Setter<T> = Dispatch<SetStateAction<T[]>>;
const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const errorOf = async (res: Response) => ((await res.json().catch(() => null))?.error as string | undefined) ?? `HTTP ${res.status}`;

// Task 487 — optimistic moves for the Tasks listing. Every move applies locally first and reverts with a toast on failure.
export function useTaskMoves({ tasks, setTasks, tasklists, setTasklists, milestones, setMilestones }: {
  tasks: Task[]; setTasks: Setter<Task>;
  tasklists: Tasklist[]; setTasklists: Setter<Tasklist>;
  milestones: Milestone[]; setMilestones: Setter<Milestone>;
}) {
  // Migration 184 not applied (503) → only same-slot reorder (PATCH position) for the rest of the session.
  const [crossDisabled, setCrossDisabled] = useState(false);

  async function moveTask(m: TaskMove) {
    const snapshot = tasks;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const active = byId.get(m.taskId);
    if (!active) return;
    const title = decodeHtmlEntities(active.title);
    const position = midpoint(m.beforeId ? byId.get(m.beforeId)?.position : null, m.afterId ? byId.get(m.afterId)?.position : null);
    const milestoneId = tasklists.find((l) => l.id === m.tasklistId)?.milestone_id ?? null;
    const sub = subtreeIds(m.taskId, childrenMap(tasks));
    const delta = m.depth - active.depth;
    setTasks((prev) => prev.map((t) =>
      t.id === m.taskId ? { ...t, tasklist_id: m.tasklistId, milestone_id: milestoneId, parent_task_id: m.parentId, depth: m.depth, position }
      : sub.has(t.id) ? { ...t, tasklist_id: m.tasklistId, milestone_id: milestoneId, depth: t.depth + delta }
      : t));

    const sameSlot = m.parentId === active.parent_task_id && m.tasklistId === active.tasklist_id;
    const patchPosition = () => fetch(`/api/v2/tasks/${m.taskId}`, { method: "PATCH", ...json({ position }) });
    let res = crossDisabled && sameSlot
      ? await patchPosition()
      : await fetch(`/api/v2/tasks/${m.taskId}/move`, {
          method: "POST",
          ...json({ tasklist_id: m.tasklistId, parent_task_id: m.parentId, before_id: m.beforeId, after_id: m.afterId }),
        });
    if (res.status === 503) {
      setCrossDisabled(true);
      if (sameSlot) res = await patchPosition();
    }
    if (!res.ok) {
      setTasks(snapshot);
      toast.error(res.status === 503
        ? `Couldn't move "${title}". Moving between lists needs migration 184; reordering still works.`
        : `Couldn't move "${title}". ${await errorOf(res)}`);
      return;
    }
    const body = await res.json();
    const rows = new Map((Array.isArray(body) ? body : [body]).map((t: Task) => [t.id, t]));
    setTasks((prev) => prev.map((t) => rows.get(t.id) ?? t));
  }

  async function moveGroup(g: GroupMove) {
    const visible = new Set(milestones.map((m) => m.id));
    const keyOf = (l: Tasklist) => (l.milestone_id && visible.has(l.milestone_id) ? l.milestone_id : NO_PHASE);
    const list = tasklists.find((l) => l.id === g.groupId);
    if (!list) return;
    const newPhase = g.phaseKey === NO_PHASE ? null : g.phaseKey;
    const phaseChanged = keyOf(list) !== g.phaseKey;
    const writes = positionsToWrite(g.order, new Map(tasklists.map((l) => [l.id, l.position])));
    if (phaseChanged && !writes.some((w) => w.id === g.groupId)) writes.push({ id: g.groupId, position: list.position ?? g.order.length });
    const [listsBefore, tasksBefore] = [tasklists, tasks];

    setTasklists((prev) => prev.map((l) => {
      const w = writes.find((x) => x.id === l.id);
      return { ...l, position: w?.position ?? l.position, milestone_id: l.id === g.groupId && phaseChanged ? newPhase : l.milestone_id };
    }));
    if (phaseChanged) setTasks((prev) => prev.map((t) => (t.tasklist_id === g.groupId ? { ...t, milestone_id: newPhase } : t)));

    const results = await Promise.all(writes.map((w) => fetch(`/api/v2/tasklists/${w.id}`, {
      method: "PATCH",
      ...json({ position: w.position, ...(w.id === g.groupId && phaseChanged ? { milestone_id: newPhase } : {}) }),
    })));
    const failed = results.find((r) => !r.ok);
    if (failed) {
      setTasklists(listsBefore);
      setTasks(tasksBefore);
      toast.error(`Couldn't move "${list.name}". ${await errorOf(failed)}`);
    }
  }

  async function movePhase(order: string[]) {
    const before = milestones;
    const writes = positionsToWrite(order, new Map(milestones.map((m) => [m.id, m.position])));
    setMilestones((prev) => prev.map((m) => ({ ...m, position: writes.find((w) => w.id === m.id)?.position ?? m.position })));
    const results = await Promise.all(writes.map((w) => fetch(`/api/v2/milestones/${w.id}`, { method: "PATCH", ...json({ position: w.position }) })));
    const failed = results.find((r) => !r.ok);
    if (failed) {
      setMilestones(before);
      toast.error(`Couldn't reorder phases. ${await errorOf(failed)}`);
    }
  }

  return { moveTask, moveGroup, movePhase, crossDisabled };
}
