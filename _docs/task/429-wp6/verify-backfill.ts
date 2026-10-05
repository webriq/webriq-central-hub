// Task 429 WP6 — READ-ONLY post-backfill verification against the target DB (live via .env, or local via PARITY_* vars).
import { createClient } from "@supabase/supabase-js";
const url = process.env.PARITY_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sb = createClient(url, process.env.PARITY_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
type R = Record<string, any>;
async function all(table: string, cols: string): Promise<R[]> {
  const rows: R[] = [];
  for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(table).select(cols).range(f, f + 999); if (error) throw new Error(`${table}: ${error.message}`); rows.push(...(data as unknown as R[])); if (data.length < 1000) break; }
  return rows;
}
const tally = (rows: R[], k: string) => rows.reduce((m: Record<string, number>, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {});
(async () => {
  const [pp, pd, st, cp, cd, tasks] = await Promise.all([
    all("project_phases", "id,project_id,source,phase_number,status,external_id"), all("project_deliverables", "id,project_id,phase_id,source,deliverable_key"),
    all("phase_programme_state", "phase_id"), all("customer_phases", "project_id,phase_number"), all("customer_deliverables", "project_id,phase_number,deliverable_key"),
    all("tasks", "milestone_id,tasklist_id"),
  ]);
  console.log("project_phases", pp.length, "(expect 733) | project_deliverables", pd.length, "(expect 1793) | phase_programme_state", st.length, "(expect 146)");
  console.log("phases by source", tally(pp, "source"), "| deliverables by source", tally(pd, "source"));
  const prog = pp.filter((p) => p.source === "programme");
  console.log("programme phase status", tally(prog, "status"));
  const phaseIds = new Set(pp.map((p) => p.id)), dlIds = new Set(pd.map((d) => d.id));
  const key = (a: R, b: R, c?: R) => `${a}|${b}|${c ?? ""}`;
  const phaseByProjNum = new Map(prog.map((p) => [`${p.project_id}|${p.phase_number}`, p.id]));
  const dlByKey = new Set(pd.filter((d) => d.source === "programme").map((d) => `${d.phase_id}|${d.deliverable_key}`));
  const cpMissing = cp.filter((r) => !phaseByProjNum.has(`${r.project_id}|${r.phase_number}`)).length;
  const cdMissing = cd.filter((r) => { const pid = phaseByProjNum.get(`${r.project_id}|${r.phase_number}`); return !pid || !dlByKey.has(`${pid}|${r.deliverable_key}`); }).length;
  const dupPhase = prog.length - new Set(prog.map((p) => `${p.project_id}|${p.phase_number}`)).size;
  const activePerProject = Object.values(prog.filter((p) => p.status === "active").reduce((m: Record<string, number>, p) => ((m[p.project_id] = (m[p.project_id] ?? 0) + 1), m), {})).filter((n) => n > 1).length;
  const brokenTaskPhase = tasks.filter((t) => t.milestone_id && !phaseIds.has(t.milestone_id)).length, brokenTaskDl = tasks.filter((t) => t.tasklist_id && !dlIds.has(t.tasklist_id)).length;
  const noKey = pd.filter((d) => d.source === "programme" && (!d.deliverable_key || !d.phase_id)).length, noNum = prog.filter((p) => p.phase_number == null || !p.external_id).length;
  console.log({ customerPhasesWithoutProgrammeRow: cpMissing, customerDeliverablesWithoutProgrammeRow: cdMissing, duplicatePhaseNumbers: dupPhase, projectsWithMoreThanOneActive: activePerProject, tasksWithBrokenPhaseLink: brokenTaskPhase, tasksWithBrokenDeliverableLink: brokenTaskDl, programmeDeliverablesMissingKeyOrPhase: noKey, programmePhasesMissingNumberOrExternalId: noNum });
})().catch((e) => { console.error(e); process.exit(1); });
