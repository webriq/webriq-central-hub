// Task 468 — shared executor context + tiny helpers. Writes go through the service client (route has already
// enforced admin/pm/super_admin); every step is idempotent (`where project_id = source` / id lists).
import type { Db } from "./load";
import type { ProjectData } from "./plan";
import type { Decisions, Entity, Finding, MergeEvent, MergePlan, MergeStep, MergeSummary, Resolution } from "./types";

export type Ctx = {
  db: Db;
  src: ProjectData;
  tgt: ProjectData;
  plan: MergePlan;
  decisions: Decisions;
  emit: (e: MergeEvent) => void;
  sum: MergeSummary;
  findings: Map<string, Finding>;
  foldTasks: Map<string, string>; // folded source task → surviving target task
  tasksLeft: Set<string>; // source tasks deliberately left on the archived source
};

export function resolve(ctx: Ctx, entity: Entity, id: string): { r: Resolution; match: string | null } {
  const f = ctx.findings.get(`${entity}:${id}`);
  return { r: ctx.decisions[`${entity}:${id}`] ?? f?.recommended ?? "move", match: f?.matchId ?? null };
}

export const chunks = <T>(a: T[], n = 200): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export const tick = (ctx: Ctx, step: MergeStep, done: number, total: number) => ctx.emit({ type: "step", step, done, total });

export async function update(db: Db, table: string, patch: Record<string, unknown>, col: string, vals: string | string[]) {
  const q = db.from(table).update(patch);
  const { error } = Array.isArray(vals) ? await q.in(col, vals) : await q.eq(col, vals);
  if (error) throw new Error(`${table}: ${error.message}`);
}

/** Re-key ids in 200-row chunks, ticking progress as each chunk lands. */
export async function moveIds(ctx: Ctx, step: MergeStep, table: string, patch: Record<string, unknown>, ids: string[], total: number, base: number) {
  let done = base;
  for (const c of chunks(ids)) {
    await update(ctx.db, table, patch, "id", c);
    done += c.length;
    tick(ctx, step, done, total);
  }
  return done;
}
