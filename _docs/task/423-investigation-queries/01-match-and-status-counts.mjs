import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
async function all(table, cols) {
  const rows = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) { console.error(table, error.message); return rows; }
    rows.push(...data); if (data.length < PAGE) break;
  }
  return rows;
}
const cp = await all("customer_phases", "id,project_id,phase_number,status,custom_name,day_start_override,day_end_override,sort_order");
const cd = await all("customer_deliverables", "id,project_id,phase_number,deliverable_key,status,custom_name,custom_owner,day_start_override,day_end_override");
const ms = await all("milestones", "id,project_id,external_id,status,start_date,due_date,day_start,day_end,position");
const tl = await all("tasklists", "id,project_id,milestone_id,external_id,day_start,day_end,is_default");
const tk = await all("tasks", "id,project_id,milestone_id,tasklist_id,status");
const pr = await all("projects", "id,draft_skip_phase_numbers");
const pm = await all("phase_members", "id,project_id,phase_number");
const ca = await all("customer_assets", "id,phase_number");
const out = {};
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
out.rows = { customer_phases: cp.length, customer_deliverables: cd.length, milestones: ms.length, tasklists: tl.length, tasks: tk.length, projects: pr.length, phase_members: pm.length, customer_assets: ca.length };
const cpProj = new Set(cp.map((x) => x.project_id)), msProj = new Set(ms.map((x) => x.project_id));
out.projects = { with_cp: cpProj.size, with_ms: msProj.size, both: [...cpProj].filter((p) => msProj.has(p)).length, cp_only: [...cpProj].filter((p) => !msProj.has(p)).length, ms_only: [...msProj].filter((p) => !cpProj.has(p)).length };
const kind = (e) => (e == null ? "null(manual)" : /^programme-phase-[0-9a-f-]{36}-\d+$/.test(e) ? "programme(uuid-scoped)" : /^programme-phase-\d+$/.test(e) ? "programme(legacy-unscoped)" : /^programme-deliverable-/.test(e) ? "programme-deliverable" : "other(zoho/import)");
out.milestone_external_kinds = cnt(ms, (m) => kind(m.external_id));
out.tasklist_external_kinds = cnt(tl, (t) => kind(t.external_id));
const msByExt = new Map(ms.filter((m) => m.external_id).map((m) => [m.external_id, m]));
const cpMatch = {}; const pairs = [];
for (const p of cp) {
  const m = msByExt.get(`programme-phase-${p.project_id}-${p.phase_number}`);
  const k = `phase${p.phase_number > 5 ? ">5" : p.phase_number}:${m ? "matched" : "no_milestone"}`;
  cpMatch[k] = (cpMatch[k] || 0) + 1; if (m) pairs.push([p, m]);
}
out.cp_to_milestone = Object.fromEntries(Object.entries(cpMatch).sort());
const cpKeys = new Set(cp.map((p) => `programme-phase-${p.project_id}-${p.phase_number}`));
out.orphan_programme_milestones = ms.filter((m) => /^programme-phase-/.test(m.external_id ?? "") && !cpKeys.has(m.external_id)).length;
out.phase_number_distribution_cp = cnt(cp, (p) => p.phase_number);
out.cp_status = cnt(cp, (p) => p.status); out.ms_status = cnt(ms, (m) => m.status);
out.pair_status_crosstab = cnt(pairs, ([p, m]) => `${p.status}→${m.status}`);
const prMap = new Map(pr.map((x) => [x.id, x]));
const skipped = cp.filter((p) => p.status === "skipped");
out.skipped = { total: skipped.length, in_draft_skip: skipped.filter((p) => (prMap.get(p.project_id)?.draft_skip_phase_numbers ?? []).includes(p.phase_number)).length, time_bypassed_only: skipped.filter((p) => !(prMap.get(p.project_id)?.draft_skip_phase_numbers ?? []).includes(p.phase_number)).length };
const actCp = cnt(cp.filter((p) => p.status === "active"), (p) => p.project_id), actMs = cnt(ms.filter((m) => m.status === "active"), (m) => m.project_id);
out.multi_active = { projects_gt1_active_cp: Object.values(actCp).filter((n) => n > 1).length, projects_gt1_active_milestone: Object.values(actMs).filter((n) => n > 1).length, projects_0_active_cp: [...cpProj].filter((p) => !actCp[p]).length };
const tlByExt = new Map(tl.filter((t) => t.external_id).map((t) => [t.external_id, t]));
const cdMatch = {}; const dpairs = [];
for (const d of cd) {
  const t = tlByExt.get(`programme-deliverable-${d.project_id}-${d.phase_number}-${d.deliverable_key}`);
  const k = `phase${d.phase_number > 5 ? ">5" : d.phase_number}:${t ? "matched" : "no_tasklist"}`;
  cdMatch[k] = (cdMatch[k] || 0) + 1; if (t) dpairs.push([d, t]);
}
out.cd_to_tasklist = Object.fromEntries(Object.entries(cdMatch).sort());
const cdKeys = new Set(cd.map((d) => `programme-deliverable-${d.project_id}-${d.phase_number}-${d.deliverable_key}`));
out.orphan_programme_tasklists = tl.filter((t) => /^programme-deliverable-/.test(t.external_id ?? "") && !cdKeys.has(t.external_id)).length;
out.cd_status = cnt(cd, (d) => d.status);
const tasksByTl = {}; for (const t of tk) if (t.tasklist_id) { const e = (tasksByTl[t.tasklist_id] ||= { total: 0, done: 0 }); e.total++; if (t.status === "closed") e.done++; }
out.deliverable_vs_tasks = cnt(dpairs, ([d, t]) => { const c = tasksByTl[t.id] || { total: 0, done: 0 }; if (c.total === 0) return `${d.status}|no_tasks`; return `${d.status}|${c.done === c.total ? "all_tasks_closed" : c.done === 0 ? "no_tasks_closed" : "some_closed"}`; });
out.overrides = { cp_custom_name: cp.filter((p) => p.custom_name).length, cp_day_override: cp.filter((p) => p.day_start_override != null || p.day_end_override != null).length, cd_custom_name: cd.filter((d) => d.custom_name).length, cd_custom_owner: cd.filter((d) => d.custom_owner).length, cd_day_override: cd.filter((d) => d.day_start_override != null || d.day_end_override != null).length };
const pm_ms = pairs.map(([, m]) => m);
out.programme_milestone_dates = { n: pm_ms.length, has_start_due: pm_ms.filter((m) => m.start_date && m.due_date).length, has_day_range: pm_ms.filter((m) => m.day_start != null && m.day_end != null).length };
const manual = ms.filter((m) => m.external_id == null);
out.manual_milestone_dates = { n: manual.length, has_start_due: manual.filter((m) => m.start_date && m.due_date).length, has_day_range: manual.filter((m) => m.day_start != null).length };
out.tasks = { total: tk.length, with_milestone: tk.filter((t) => t.milestone_id).length, with_tasklist: tk.filter((t) => t.tasklist_id).length, with_neither: tk.filter((t) => !t.milestone_id && !t.tasklist_id).length };
const tlById = new Map(tl.map((t) => [t.id, t]));
out.tasks_milestone_mismatch_with_tasklist = tk.filter((t) => t.tasklist_id && t.milestone_id && tlById.get(t.tasklist_id)?.milestone_id && tlById.get(t.tasklist_id).milestone_id !== t.milestone_id).length;
out.tasklists = { total: tl.length, with_milestone: tl.filter((t) => t.milestone_id).length, default: tl.filter((t) => t.is_default).length };
out.phase_members_by_phase = cnt(pm, (m) => m.phase_number);
out.assets_by_phase = cnt(ca, (a) => a.phase_number ?? "null");
console.log(JSON.stringify(out, null, 1));
process.exit(0);
