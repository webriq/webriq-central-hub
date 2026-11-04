// Task 468 — executor steps: folders + files, time logs, members/notes/misc, finalize.
import { folderPaths } from "./keys";
import { moveIds, resolve, tick, update, type Ctx } from "./execute-ctx";

export async function runFiles(ctx: Ctx) {
  const { src, tgt } = ctx;
  const total = src.folders.length + src.files.length;
  const depth = folderPaths(src.folders);
  const fMap = new Map<string, string>();
  let done = 0;
  tick(ctx, "files", 0, total);
  // parents before children so a child can follow a folded parent
  const ordered = [...src.folders].sort((a, b) => depth.get(a.id)!.split("/").length - depth.get(b.id)!.split("/").length);
  for (const f of ordered) {
    const { r, match } = resolve(ctx, "folder", f.id);
    if (r === "merge" && match) { fMap.set(f.id, match); ctx.sum.merged++; }
    else {
      const parent = f.parent_folder_id ? fMap.get(f.parent_folder_id) ?? f.parent_folder_id : null;
      const name = match ? `${f.name} (merged)` : f.name; // keep-both on a path clash
      await update(ctx.db, "customer_asset_folders", { project_id: tgt.id, customer_id: tgt.customerId, parent_folder_id: parent, name }, "id", f.id);
      fMap.set(f.id, f.id);
      ctx.sum.moved++;
    }
    tick(ctx, "files", ++done, total);
  }
  const groups = new Map<string | null, string[]>();
  for (const f of src.files) {
    if (resolve(ctx, "file", f.id).r === "skip") { ctx.sum.skipped++; done++; continue; }
    const folder = f.folder_id ? fMap.get(f.folder_id) ?? f.folder_id : null;
    groups.set(folder, [...(groups.get(folder) ?? []), f.id]);
    ctx.sum.moved++;
  }
  tick(ctx, "files", done, total);
  for (const [folder, ids] of groups) {
    done = await moveIds(ctx, "files", "customer_assets", { project_id: tgt.id, customer_id: tgt.customerId, folder_id: folder }, ids, total, done);
  }
}

export async function runTimeLogs(ctx: Ctx) {
  const { src, tgt } = ctx;
  const byFold = new Map<string, string[]>();
  const plain: string[] = [];
  let left = 0;
  for (const l of src.logs) {
    // a "skip" is only valid as a duplicate of a FOLDED task; if the task itself moves, its log must move with it
    const dupSkip = resolve(ctx, "timelog", l.id).r === "skip" && !!l.task_id && ctx.foldTasks.has(l.task_id);
    if (dupSkip || (l.task_id && ctx.tasksLeft.has(l.task_id))) { left++; continue; }
    const surv = l.task_id ? ctx.foldTasks.get(l.task_id) : undefined;
    if (surv) byFold.set(surv, [...(byFold.get(surv) ?? []), l.id]);
    else plain.push(l.id);
  }
  const total = src.logs.length;
  ctx.sum.skipped += left;
  ctx.sum.moved += total - left;
  tick(ctx, "timelogs", left, total);
  let done = left;
  for (const [surv, ids] of byFold) done = await moveIds(ctx, "timelogs", "time_logs", { project_id: tgt.id, task_id: surv }, ids, total, done);
  await moveIds(ctx, "timelogs", "time_logs", { project_id: tgt.id }, plain, total, done);
}

export async function runExtras(ctx: Ctx) {
  const { db, src, tgt } = ctx;
  const jobs = 4;
  const missing = src.memberIds.filter((m) => !tgt.memberIds.includes(m)).map((user_id) => ({ project_id: tgt.id, user_id }));
  if (missing.length) {
    const { error } = await db.from("project_members").upsert(missing, { onConflict: "project_id,user_id", ignoreDuplicates: true });
    if (error) throw new Error(`project_members: ${error.message}`);
  }
  tick(ctx, "extras", 1, jobs);
  await update(db, "note_folders", { project_id: tgt.id }, "project_id", src.id);
  await update(db, "notes", { project_id: tgt.id }, "project_id", src.id);
  tick(ctx, "extras", 2, jobs);
  await update(db, "stackshift_orders", { project_id: tgt.id }, "project_id", src.id);
  tick(ctx, "extras", 3, jobs);
  await update(db, "timer_breaks", { project_id: tgt.id }, "project_id", src.id);
  tick(ctx, "extras", 4, jobs);
}

export async function runFinalize(ctx: Ctx) {
  const { db, src, tgt } = ctx;
  tick(ctx, "finalize", 0, 2);
  const now = new Date().toISOString();
  let { error } = await db.from("projects").update({ status: "archived", merged_into_project_id: tgt.id, updated_at: now }).eq("id", src.id);
  // migration 180 not applied → archive without the back-pointer
  if (error?.code === "42703" || error?.code === "PGRST204") ({ error } = await db.from("projects").update({ status: "archived", updated_at: now }).eq("id", src.id));
  if (error) throw new Error(`projects: ${error.message}`);
  tick(ctx, "finalize", 1, 2);
  await update(db, "projects", { updated_at: now }, "id", tgt.id);
  tick(ctx, "finalize", 2, 2);
}
