// Task 429 WP3 — exercises the new read queries against the LOCAL disposable DB (after the backfill): the multi-project summaries
// loader + status-report breakdown, and the PM dashboard's embedded-join deliverables query. Refuses non-local targets.
//   READS_URL=http://127.0.0.1:54321 READS_KEY=<local service key> NODE_OPTIONS=--experimental-websocket node node_modules/tsx/dist/cli.mjs _docs/task/429-wp3/reads-integration.ts
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { loadProgrammeSummaries } from "@/lib/programme/store";
import { buildPhaseBreakdown, currentPhaseOf } from "@/lib/programme/status-report";

const url = process.env.READS_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) { console.error("REFUSING: READS_URL must be the local stack"); process.exit(2); }
const sb = createClient<Database>(url, process.env.READS_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: projects } = await sb.from("projects").select("id,programme_started_at").not("programme_started_at", "is", null);
  const ids = (projects ?? []).map((p) => p.id);
  const summaries = await loadProgrammeSummaries(sb as never, ids);
  let withPhases = 0, active = 0, deliverables = 0;
  for (const p of projects ?? []) {
    const s = summaries.get(p.id)!;
    if (!s.phases.length) continue;
    withPhases++; deliverables += s.deliverables.length;
    if (s.phases.some((ph) => ph.status === "active")) active++;
    const b = buildPhaseBreakdown({ programmeStartedAt: p.programme_started_at!, phaseRows: s.phases, deliverableRatioByPhase: {}, assigneesByPhase: {} });
    assert.ok(b.phases.length === s.phases.length && b.totalProgrammeDays > 0 && currentPhaseOf(b.phases));
  }
  console.log({ projectsWithProgramme: withPhases, withActivePhase: active, deliverables });
  assert.ok(withPhases >= 29 && deliverables >= 751);

  const first = ids.find((id) => summaries.get(id)!.phases.some((ph) => ph.phase_number === 2));
  const { data, error } = await sb.from("project_deliverables").select("id, project_id, deliverable_key, status, project_phases!inner(phase_number)")
    .eq("source", "programme").eq("project_phases.phase_number", 2).eq("project_phases.source", "programme").in("project_id", first ? [first] : ids);
  assert.ok(!error, error?.message);
  assert.ok((data ?? []).length > 0 && (data ?? []).every((r) => r.deliverable_key));
  console.log("dashboard join rows:", data!.length, "— OK");
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
