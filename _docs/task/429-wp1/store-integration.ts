// Task 429 WP1 — integration check of src/lib/programme/store.ts against the LOCAL disposable DB (after the 428 backfill was applied there).
// Refuses non-local targets. Writes only inside the local DB and restores what it changes.
//   eval "$(supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"; STORE_URL=$API_URL STORE_KEY=$SERVICE_ROLE_KEY \
//   NODE_OPTIONS=--experimental-websocket node node_modules/tsx/dist/cli.mjs _docs/task/429-wp1/store-integration.ts
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { loadProgramme, rematerialiseProgrammeDates } from "@/lib/programme/store";
import { activePhase, isProgrammeComplete } from "@/lib/programme/programme-status";

const url = process.env.STORE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) { console.error("REFUSING: STORE_URL must be the local stack"); process.exit(2); }
const sb = createClient<Database>(url, process.env.STORE_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: project } = await sb.from("projects").select("id,project_id,programme_started_at").eq("project_id", "D45CA759-PROJ-01").single();
  assert.ok(project?.programme_started_at, "Hello Homes should have a start date in the snapshot");
  const phases = await loadProgramme(sb, project.id);
  console.log(JSON.stringify({ phases: phases.map((p) => `P${p.phase_number}:${p.status}:${p.deliverables.length}d`), active: activePhase(phases)?.phase_number, complete: isProgrammeComplete(phases), stateRows: phases.filter((p) => p.state).length }));
  assert.equal(phases.length, 5); assert.equal(phases.filter((p) => p.state).length, 5);
  assert.equal(activePhase(phases)?.phase_number, 2);

  // 1. dates were materialised by the backfill from the same start date → re-materialising changes nothing
  const unchanged = await rematerialiseProgrammeDates(sb, project.id, project.programme_started_at);
  console.log("re-materialise with the same start date → rows changed:", unchanged);
  assert.equal(unchanged, 0);

  // 2. simulate Jump to phase backdating programme_started_at by 10 days → every dated row shifts
  const earlier = new Date(new Date(project.programme_started_at).getTime() - 10 * 86_400_000).toISOString();
  const shifted = await rematerialiseProgrammeDates(sb, project.id, earlier);
  const after = await loadProgramme(sb, project.id);
  const p2 = after.find((p) => p.phase_number === 2)!;
  console.log("re-materialise with start 10 days earlier → rows changed:", shifted, "| phase 2 dates now", p2.start_date, "→", p2.due_date);
  assert.equal(shifted, 5 + after.flatMap((p) => p.deliverables).length);
  assert.equal(p2.start_date, "2026-08-11");

  // 3. restore → back to the backfilled dates, and a second restore is a no-op
  const restored = await rematerialiseProgrammeDates(sb, project.id, project.programme_started_at);
  const again = await rematerialiseProgrammeDates(sb, project.id, project.programme_started_at);
  console.log("restore → rows changed:", restored, "| again:", again);
  assert.equal(restored, shifted); assert.equal(again, 0);
  console.log("OK — store.loadProgramme / rematerialiseProgrammeDates behave on real (backfilled) data.");
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
