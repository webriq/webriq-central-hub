import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
async function all(table, cols) { const rows = []; for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(table).select(cols).range(f, f + 999); if (error) { console.error(table, error.message); return rows; } rows.push(...data); if (data.length < 1000) break; } return rows; }
const cp = await all("customer_phases", "project_id,phase_number,status");
const cd = await all("customer_deliverables", "project_id,phase_number,deliverable_key");
const ms = await all("milestones", "id,project_id,external_id,status");
const tl = await all("tasklists", "id,project_id,milestone_id,external_id");
const tk = await all("tasks", "tasklist_id");
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const cpProj = new Set(cp.map((x) => x.project_id));
const out = {};
// 4 legacy-unscoped milestones
const legacy = ms.filter((m) => /^programme-phase-\d+$/.test(m.external_id ?? ""));
out.legacy_unscoped_milestones = legacy.map((m) => ({ ext: m.external_id, project_has_cp: cpProj.has(m.project_id), project_has_scoped_ms: ms.some((x) => x.project_id === m.project_id && /^programme-phase-[0-9a-f-]{36}-/.test(x.external_id ?? "")) }));
// orphan programme tasklists
const cdSet = new Set(cd.map((d) => `programme-deliverable-${d.project_id}-${d.phase_number}-${d.deliverable_key}`));
const cdKeysByProj = new Map(); for (const d of cd) { (cdKeysByProj.get(d.project_id) ?? cdKeysByProj.set(d.project_id, new Set()).get(d.project_id)).add(d.deliverable_key); }
const tasksByTl = cnt(tk.filter((t) => t.tasklist_id), (t) => t.tasklist_id);
const orphans = tl.filter((t) => /^programme-deliverable-/.test(t.external_id ?? "") && !cdSet.has(t.external_id));
out.orphan_tasklists = cnt(orphans, (t) => {
  const m = t.external_id.match(/^programme-deliverable-([0-9a-f-]{36})-(\d+)-(.+)$/);
  if (!m) return "unparseable_id(legacy format)";
  const [, proj, , key] = m;
  if (!cpProj.has(proj)) return "project_has_no_customer_phases";
  return cdKeysByProj.get(proj)?.has(key) ? "key_exists_in_other_phase" : "key_not_in_customer_deliverables";
});
out.orphan_tasklists_with_tasks = orphans.filter((t) => tasksByTl[t.id]).length;
// unmatched cd (no tasklist)
const tlSet = new Set(tl.map((t) => t.external_id).filter(Boolean));
const msSet = new Set(ms.map((m) => m.external_id).filter(Boolean));
const unmatched = cd.filter((d) => d.phase_number >= 2 && !tlSet.has(`programme-deliverable-${d.project_id}-${d.phase_number}-${d.deliverable_key}`));
out.unmatched_cd = cnt(unmatched, (d) => (msSet.has(`programme-phase-${d.project_id}-${d.phase_number}`) ? "phase_milestone_exists_tasklist_missing" : "phase_milestone_missing_too"));
out.unmatched_cd_projects = new Set(unmatched.map((d) => d.project_id)).size;
// programme tasklists with tasks
out.programme_tasklists_with_tasks = tl.filter((t) => /^programme-deliverable-/.test(t.external_id ?? "") && tasksByTl[t.id]).length;
// tasklists attached to programme milestones but not programme-prefixed (manual additions)
const progMsIds = new Set(ms.filter((m) => /^programme-phase-/.test(m.external_id ?? "")).map((m) => m.id));
out.manual_tasklists_under_programme_milestones = tl.filter((t) => progMsIds.has(t.milestone_id) && !/^programme-deliverable-/.test(t.external_id ?? "")).length;
console.log(JSON.stringify(out, null, 1));
process.exit(0);
