// Task 468 — executor steps: task lists, milestones, tasks (+checklist rows), tickets.
import { COLS } from "./load";
import { moveIds, resolve, tick, update, type Ctx } from "./execute-ctx";
import type { Entity } from "./types";

type Row = { id: string };

/** Task lists / milestones: fold matches into the target's, move the rest. Returns source→target id (null = left behind). */
export async function runContainers(ctx: Ctx, step: "tasklists" | "milestones", table: string, entity: Entity, rows: Row[]) {
  const map = new Map<string, string | null>();
  const move: string[] = [];
  for (const r of rows) {
    const { r: res, match } = resolve(ctx, entity, r.id);
    if (res === "merge" && match) { map.set(r.id, match); ctx.sum.merged++; }
    else if (res === "skip") { map.set(r.id, null); ctx.sum.skipped++; }
    else { map.set(r.id, r.id); move.push(r.id); ctx.sum.moved++; }
  }
  tick(ctx, step, 0, rows.length);
  await moveIds(ctx, step, table, { project_id: ctx.tgt.id }, move, rows.length, rows.length - move.length);
  return map;
}

export async function runTasks(ctx: Ctx, listMap: Map<string, string | null>, msMap: Map<string, string | null>) {
  const { src, tgt } = ctx;
  const tgtKeys = new Set(tgt.tasks.filter((t) => t.checklist_key).map((t) => t.checklist_key));
  const fate = new Map<string, string | null>(); // source task → id it lives under afterwards
  const groups = new Map<string, { tl: string | null; ms: string | null; ids: string[] }>();
  const folded: [string, string][] = [];

  for (const t of src.tasks) {
    let r = resolve(ctx, "task", t.id);
    if (t.kind === "checklist") r = { r: tgtKeys.has(t.checklist_key) ? "skip" : "move", match: null }; // never listed; target's row wins
    if (r.r === "merge" && r.match) { fate.set(t.id, r.match); ctx.foldTasks.set(t.id, r.match); folded.push([t.id, r.match]); ctx.sum.merged++; continue; }
    if (r.r === "skip") { fate.set(t.id, null); ctx.tasksLeft.add(t.id); ctx.sum.skipped++; continue; }
    fate.set(t.id, t.id);
    ctx.sum.moved++;
    const tl = t.tasklist_id && listMap.has(t.tasklist_id) ? listMap.get(t.tasklist_id)! : t.tasklist_id;
    const ms = t.milestone_id && msMap.has(t.milestone_id) ? msMap.get(t.milestone_id)! : t.milestone_id;
    const g = groups.get(`${tl}|${ms}`) ?? { tl, ms, ids: [] };
    g.ids.push(t.id);
    groups.set(`${tl}|${ms}`, g);
  }

  const total = src.tasks.length;
  let done = folded.length + ctx.tasksLeft.size;
  tick(ctx, "tasks", done, total);
  for (const g of groups.values()) {
    done = await moveIds(ctx, "tasks", "tasks", { project_id: tgt.id, [COLS.tasklist]: g.tl, [COLS.milestone]: g.ms }, g.ids, total, done);
  }
  // subtask parents: follow folded parents to their survivor; a parent left behind orphans the child to the top level
  for (const t of src.tasks) {
    if (!t.parent_task_id || fate.get(t.id) !== t.id || !fate.has(t.parent_task_id)) continue;
    const parent = fate.get(t.parent_task_id) ?? null;
    if (parent !== t.parent_task_id) await update(ctx.db, "tasks", { parent_task_id: parent }, "id", t.id);
  }
  // folded tasks: their comments + attachments follow the survivor (time logs move in their own step)
  for (const [from, to] of folded) {
    await update(ctx.db, "task_comments", { task_id: to }, "task_id", from);
    await update(ctx.db, "attachments", { entity_id: to }, "entity_id", from);
    await update(ctx.db, "tickets", { task_id: to }, "task_id", from);
  }
}

export async function runTickets(ctx: Ctx) {
  const move = ctx.src.tickets.filter((t) => resolve(ctx, "ticket", t.id).r !== "skip").map((t) => t.id);
  ctx.sum.moved += move.length;
  ctx.sum.skipped += ctx.src.tickets.length - move.length;
  tick(ctx, "tickets", 0, ctx.src.tickets.length);
  await moveIds(ctx, "tickets", "tickets", { project_id: ctx.tgt.id }, move, ctx.src.tickets.length, ctx.src.tickets.length - move.length);
}
