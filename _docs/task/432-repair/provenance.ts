// Task 432 step A — READ-ONLY provenance check for day_*_override rows on projects with permanent skips.
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/432-repair/provenance.ts
import { createClient } from "@supabase/supabase-js";
import { PROGRAMME_PHASES, resolveEffectivePhase } from "@/config/customer-phases";
import { asCompressedDay, asReferenceDay, createProgrammeCalendar } from "@/lib/programme/calendar";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
type Row = Record<string, any>;
async function all(table: string, cols: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(table).select(cols).range(f, f + 999); if (error) throw error; rows.push(...(data as Row[])); if (data.length < 1000) break; }
  return rows;
}
const secs = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);

async function main() {
  const pr = (await all("projects", "id,project_id,name,draft_skip_phase_numbers,programme_duration_days")).filter((p) => (p.draft_skip_phase_numbers ?? []).length > 0);
  const cp = await all("customer_phases", "project_id,phase_number,custom_name,day_start_override,day_end_override,sort_order,created_at,updated_at");
  const cd = await all("customer_deliverables", "project_id,phase_number,deliverable_key,custom_name,custom_description,custom_owner,day_start_override,day_end_override,created_at,updated_at");
  for (const p of pr) {
    const skip: number[] = p.draft_skip_phase_numbers;
    const dur = p.programme_duration_days ?? 120;
    const phaseRows = cp.filter((r) => r.project_id === p.id).sort((a, b) => a.sort_order - b.sort_order);
    const delivRows = cd.filter((d) => d.project_id === p.id);
    const ordered = phaseRows.map((r) => resolveEffectivePhase(r as any, delivRows.filter((d) => d.phase_number === r.phase_number) as any));
    const cal = createProgrammeCalendar({ durationDays: dur, skipPhaseNumbers: skip, phases: ordered });
    const phaseDisp = new Map(cal.toDisplayPhases(cal.compressPhases(ordered)).map((x) => [x.number, x]));
    console.log(`\n=== ${p.project_id} "${String(p.name).slice(0, 40)}" skip=[${skip}] duration=${dur}`);
    console.log("phase rows:", phaseRows.map((r) => {
      const def = PROGRAMME_PHASES.find((s) => s.number === r.phase_number);
      const ov = r.day_start_override != null ? `${r.day_start_override}-${r.day_end_override}` : "null";
      const edited = secs(r.created_at, r.updated_at);
      return `P${r.phase_number}[override ${ov}, ref default ${def ? def.dayStart + "-" + def.dayEnd : "custom"}, edited+${edited}s]`;
    }).join(" "));
    const counts: Record<string, number> = {};
    const lines: string[] = [];
    for (const d of delivRows.sort((a, b) => a.phase_number - b.phase_number)) {
      if (d.day_start_override == null) continue;
      const phase = phaseDisp.get(d.phase_number);
      const def = PROGRAMME_PHASES.find((s) => s.number === d.phase_number)?.deliverables.find((x) => x.key === d.deliverable_key);
      if (def && def.dayStart === d.day_start_override && def.dayEnd === d.day_end_override) { counts["equals_reference_default"] = (counts["equals_reference_default"] ?? 0) + 1; continue; }
      const inside = (s: number, e: number) => !!phase && s >= phase.dayStart && e <= phase.dayEnd;
      // R: stored is reference-scale → shown after compress+scale; C: stored is already compressed → shown after scale only
      const rS = cal.referenceToDisplay(asReferenceDay(d.day_start_override)), rE = cal.referenceToDisplay(asReferenceDay(d.day_end_override));
      const cS = cal.compressedToDisplay(asCompressedDay(d.day_start_override)), cE = cal.compressedToDisplay(asCompressedDay(d.day_end_override));
      const R = inside(rS, rE), C = inside(cS, cE);
      const cls = R && C ? "ambiguous(both fit)" : C ? "compressed-intent" : R ? "reference-intent" : "ambiguous(neither fits)";
      counts[cls] = (counts[cls] ?? 0) + 1;
      lines.push(`  P${d.phase_number} ${d.deliverable_key.padEnd(30)} stored ${String(d.day_start_override).padStart(3)}-${String(d.day_end_override).padEnd(3)} | as-ref→D${rS}-${rE} as-compressed→D${cS}-${cE} | phase D${phase?.dayStart}-${phase?.dayEnd} | edited+${secs(d.created_at, d.updated_at)}s | ${cls}`);
    }
    console.log("deliverable override classes:", JSON.stringify(counts));
    console.log(lines.join("\n"));

    // JOINT hypothesis test: phase windows AND cards interpreted on the same scale.
    //   R = every stored override is reference-scale (what the read pipeline assumes today)
    //   C = every stored override is already compressed ("display-intent"); only static defaults are reference
    const phaseWin = (r: Row, hyp: "R" | "C") => {
      const def = PROGRAMME_PHASES.find((x) => x.number === r.phase_number);
      const hasOv = r.day_start_override != null;
      const s0 = hasOv ? r.day_start_override : def?.dayStart ?? 1, e0 = hasOv ? r.day_end_override : def?.dayEnd ?? 1;
      const conv = (v: number, isOv: boolean) => (hyp === "C" && isOv ? cal.compressedToDisplay(asCompressedDay(v)) : cal.referenceToDisplay(asReferenceDay(v)));
      return { s: conv(s0, hasOv), e: conv(e0, hasOv) };
    };
    for (const hyp of ["R", "C"] as const) {
      let outside = 0, cards = 0;
      const bad: string[] = [];
      for (const r of phaseRows) {
        if (skip.includes(r.phase_number)) continue;
        const w = phaseWin(r, hyp);
        for (const d of delivRows.filter((x) => x.phase_number === r.phase_number)) {
          const def = PROGRAMME_PHASES.find((x) => x.number === d.phase_number)?.deliverables.find((x) => x.key === d.deliverable_key);
          const hasOv = d.day_start_override != null;
          const s0 = hasOv ? d.day_start_override : def?.dayStart ?? 1, e0 = hasOv ? d.day_end_override : def?.dayEnd ?? 1;
          const conv = (v: number) => (hyp === "C" && hasOv ? cal.compressedToDisplay(asCompressedDay(v)) : cal.referenceToDisplay(asReferenceDay(v)));
          const cs = conv(s0), ce = conv(e0);
          cards++;
          if (cs < w.s || ce > w.e) { outside++; if (bad.length < 3) bad.push(`P${r.phase_number} ${d.deliverable_key}: D${cs}-${ce} vs phase D${w.s}-${w.e}`); }
        }
      }
      console.log(`JOINT hypothesis ${hyp}: ${outside}/${cards} cards outside their phase window`, bad.length ? JSON.stringify(bad) : "");
    }
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
