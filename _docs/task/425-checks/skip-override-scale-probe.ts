// Task 425 follow-up probe — READ-ONLY. For projects with a PERMANENT skip list, are there
// customer_deliverables day overrides that differ from the reference-scale defaults (i.e. a manual
// reschedule or a compressed-scale seed)? Such rows would be compressed a second time on read.
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/425-checks/skip-override-scale-probe.ts
import { createClient } from "@supabase/supabase-js";
import { PROGRAMME_PHASES } from "@/config/customer-phases";
import { asReferenceDay, createProgrammeCalendar } from "@/lib/programme/calendar";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
type Row = Record<string, any>;
async function all(table: string, cols: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(table).select(cols).range(f, f + 999); if (error) throw error; rows.push(...(data as Row[])); if (data.length < 1000) break; }
  return rows;
}
async function main() {
  const pr = await all("projects", "id,draft_skip_phase_numbers");
  const cd = await all("customer_deliverables", "project_id,phase_number,deliverable_key,day_start_override,day_end_override");
  const skipProjects = new Map(pr.filter((p) => (p.draft_skip_phase_numbers ?? []).length > 0).map((p) => [p.id as string, p.draft_skip_phase_numbers as number[]]));
  let rows = 0, equalsDefault = 0, differs = 0, nulls = 0;
  const examples: string[] = [];
  for (const d of cd) {
    if (!skipProjects.has(d.project_id)) continue;
    rows++;
    const def = PROGRAMME_PHASES.find((p) => p.number === d.phase_number)?.deliverables.find((x) => x.key === d.deliverable_key);
    if (d.day_start_override == null) { nulls++; continue; }
    if (def && d.day_start_override === def.dayStart && d.day_end_override === def.dayEnd) equalsDefault++;
    else { differs++; if (examples.length < 5) examples.push(`${d.phase_number}/${d.deliverable_key}: stored ${d.day_start_override}-${d.day_end_override}, default ${def?.dayStart}-${def?.dayEnd}, skip=[${skipProjects.get(d.project_id)}]`); }
  }
  // How far would a SECOND compression move each stored override? (read path = compress(override))
  const phases = PROGRAMME_PHASES.map((p, i) => ({ number: p.number, sortOrder: i, dayStart: p.dayStart, dayEnd: p.dayEnd }));
  let shifted = 0, shiftedBy: number[] = [];
  for (const d of cd) {
    const skip = skipProjects.get(d.project_id);
    if (!skip || d.day_start_override == null) continue;
    const cal = createProgrammeCalendar({ skipPhaseNumbers: skip, phases });
    const once = cal.referenceToCompressed(asReferenceDay(d.day_start_override));
    if (once !== d.day_start_override) { shifted++; shiftedBy.push(d.day_start_override - once); }
  }
  console.log("rows whose stored start would move on read (re-compression):", shifted, "shift sizes:", [...new Set(shiftedBy)].sort((a, b) => a - b).join(","));
  console.log(JSON.stringify({ projectsWithPermanentSkips: skipProjects.size, deliverableRows: rows, nullOverride: nulls, overrideEqualsReferenceDefault: equalsDefault, overrideDiffersFromDefault: differs, examples }, null, 1));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
