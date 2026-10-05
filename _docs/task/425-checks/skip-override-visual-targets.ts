// Task 425 follow-up (updated for task 432: overrides are read as already-compressed) — READ-ONLY. Lists the projects with permanent skips and which deliverables the
// read pipeline renders OUTSIDE their own phase's window (the visible symptom of re-compression).
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/425-checks/skip-override-visual-targets.ts
import { createClient } from "@supabase/supabase-js";
import { resolveEffectivePhase } from "@/config/customer-phases";
import { createProgrammeCalendar, referenceSpansOf } from "@/lib/programme/calendar";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
type Row = Record<string, any>;
async function all(table: string, cols: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(table).select(cols).range(f, f + 999); if (error) throw error; rows.push(...(data as Row[])); if (data.length < 1000) break; }
  return rows;
}
async function main() {
  const pr = (await all("projects", "id,project_id,draft_skip_phase_numbers,programme_duration_days")).filter((p) => (p.draft_skip_phase_numbers ?? []).length > 0);
  const cp = await all("customer_phases", "project_id,phase_number,custom_name,day_start_override,day_end_override,sort_order");
  const cd = await all("customer_deliverables", "project_id,phase_number,deliverable_key,custom_name,custom_description,custom_owner,day_start_override,day_end_override");
  for (const p of pr) {
    const rows = cp.filter((r) => r.project_id === p.id).sort((a, b) => a.sort_order - b.sort_order);
    const ordered = rows.map((r) => resolveEffectivePhase(r as any, cd.filter((d) => d.project_id === p.id && d.phase_number === r.phase_number) as any));
    const cal = createProgrammeCalendar({ durationDays: p.programme_duration_days ?? 120, skipPhaseNumbers: p.draft_skip_phase_numbers, phases: referenceSpansOf(ordered) });
    const display = cal.toDisplayPhases(cal.compressPhases(ordered));
    const outside: string[] = [];
    for (const ph of display) {
      if ((p.draft_skip_phase_numbers as number[]).includes(ph.number)) continue;
      for (const d of ph.deliverables) if (d.dayStart < ph.dayStart || d.dayEnd > ph.dayEnd) outside.push(`P${ph.number} ${d.key}: card D${d.dayStart}–${d.dayEnd} vs phase D${ph.dayStart}–${ph.dayEnd}`);
    }
    console.log(JSON.stringify({ project_id: p.project_id, skip: p.draft_skip_phase_numbers, phases: display.filter((x) => !(p.draft_skip_phase_numbers as number[]).includes(x.number)).map((x) => `P${x.number} D${x.dayStart}–${x.dayEnd}`), outsideCount: outside.length, outside: outside.slice(0, 6) }, null, 1));
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
