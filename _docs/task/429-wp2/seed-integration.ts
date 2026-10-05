// Task 429 WP2 — integration test of the rewritten seed (src/lib/programme/seed.ts) against the LOCAL disposable DB.
// Runs the REAL seedAndStartProgramme / seedProgrammeAtPhase. Refuses non-local targets. Run WITHOUT --env-file so no Zoho/Cliq
// webhook is configured (the Cliq notification then skips itself):
//   eval "$(supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
//   SEED_URL=$API_URL SEED_KEY=$SERVICE_ROLE_KEY NODE_OPTIONS=--experimental-websocket node node_modules/tsx/dist/cli.mjs _docs/task/429-wp2/seed-integration.ts
import assert from "node:assert/strict";

async function main() {
  const url = process.env.SEED_URL ?? "";
  if (!/127\.0\.0\.1|localhost/.test(url)) { console.error("REFUSING: SEED_URL must be the local stack"); process.exit(2); }
  // adminClient reads these at import time — set them first, then import dynamically.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url; process.env.SUPABASE_SECRET_KEY = process.env.SEED_KEY!;
  delete process.env.ZOHO_CLIQ_WEBHOOK_URL; delete process.env.ZOHO_CLIQ_DEV_WEBHOOK_URL;
  const { adminClient: sb } = await import("@/lib/supabase/admin");
  const { seedAndStartProgramme, seedProgrammeAtPhase } = await import("@/lib/programme/seed");
  const { loadProgramme, rematerialiseProgrammeDates } = await import("@/lib/programme/store");
  const { INTERNAL_DELIVERABLES } = await import("@/config/customer-phases");

  await sb.from("customers").upsert({ id: "00000000-0000-0000-0000-0000000000f1", customer_id: "WRQ-CLIENT-WP2", company_name: "WP2 Test Co" }, { onConflict: "customer_id" });
  let n = 0;
  async function newProject(over: Record<string, unknown> = {}) {
    n++;
    const { data, error } = await sb.from("projects").insert({ customer_id: "WRQ-CLIENT-WP2", name: `WP2 project ${n}`, project_type: "Content Site", ...over }).select("id,customer_id").single();
    assert.ok(!error, error?.message); return data!;
  }
  const summary = (ph: Awaited<ReturnType<typeof loadProgramme>>) => ph.map((p) => `P${p.phase_number}:${p.status}${p.start_date ? `[${p.start_date}→${p.due_date}]` : "[no dates]"}`).join(" ");
  async function invariants(project: { id: string }, label: string) {
    const ph = await loadProgramme(sb, project.id);
    assert.ok(ph.length > 0, `${label}: no phases`);
    assert.equal(ph.filter((p) => p.status === "active").length <= 1, true, `${label}: >1 active`);
    assert.ok(ph.every((p) => p.state), `${label}: every phase has a programme_state row`);
    assert.ok(ph.every((p) => p.source === "programme" && p.external_id === `programme-phase-${project.id}-${p.phase_number}`), `${label}: source/external_id`);
    const all = ph.flatMap((p) => p.deliverables);
    assert.equal(new Set(all.map((d) => `${d.phase_id}|${d.deliverable_key}`)).size, all.length, `${label}: duplicate (phase, key)`);
    const { data: p } = await sb.from("projects").select("programme_started_at").eq("id", project.id).single();
    assert.equal(await rematerialiseProgrammeDates(sb, project.id, p!.programme_started_at), 0, `${label}: dates must already be consistent with programme_started_at`);
    const { count: legacy } = await sb.from("customer_phases").select("*", { count: "exact", head: true }).eq("project_id", project.id);
    assert.equal(legacy, 0, `${label}: nothing may be written to customer_phases any more`);
    const { count: dupMilestones } = await sb.from("project_phases").select("*", { count: "exact", head: true }).eq("project_id", project.id).like("external_id", "programme-phase-%");
    assert.equal(dupMilestones, ph.length, `${label}: no duplicate milestone rows (seedPhase2to5Links is gone)`);
    const { count: internal } = await sb.from("onboarding_internal_deliverables").select("*", { count: "exact", head: true }).eq("project_id", project.id);
    assert.equal(internal, INTERNAL_DELIVERABLES.length, `${label}: internal checklist seeded`);
    return ph;
  }

  // A. plain start at Phase 1, 120 days
  const a = await newProject();
  assert.deepEqual(await seedAndStartProgramme(a, "WP2 Test Co"), {});
  const A = await invariants(a, "A");
  console.log("A start@P1      :", summary(A), "| deliverables:", A.map((p) => p.deliverables.length).join("/"));
  assert.deepEqual(A.map((p) => p.status), ["active", "planned", "planned", "planned", "planned"]);
  assert.deepEqual(A.map((p) => p.deliverables.length), [7, 7, 5, 4, 4]);
  assert.equal(A[0].deliverables.find((d) => d.deliverable_key === "kickoff")?.status, "in_progress");
  assert.equal((await sb.from("project_phases").select("*").eq("id", A[0].id).single()).data!.day_end, 15);

  // B. permanent skip of Phase 1 → starts at Phase 2; skipped phase has no dates / no deliverables
  const b = await newProject({ draft_skip_phase_numbers: [1] });
  assert.deepEqual(await seedAndStartProgramme(b, "WP2 Test Co", null, 1, 120, [1]), {});
  const B = await invariants(b, "B");
  console.log("B skip[1]       :", summary(B));
  assert.equal(B[0].status, "skipped"); assert.equal(B[0].start_date, null); assert.equal(B[0].deliverables.length, 0);
  assert.equal(B[1].status, "active"); assert.equal(B[1].day_start, 1);                       // Phase 2 now begins on Day 1 (skip-compressed)

  // C. start AT phase 3 with an explicit (backdated) start date and a note — time-bypassed phases are 'bypassed', not 'skipped'
  const c = await newProject();
  const startedAt = new Date(Date.now() - 30 * 86_400_000);
  assert.deepEqual(await seedProgrammeAtPhase(c, 3, startedAt, "jumped in", 120), {});
  const C = await invariants(c, "C");
  console.log("C at P3 backdated:", summary(C));
  assert.deepEqual(C.map((p) => p.status), ["bypassed", "bypassed", "active", "planned", "planned"]);
  assert.equal(C[2].state?.is_manual_override, true); assert.equal(C[2].state?.override_note, "jumped in");
  assert.equal(C[0].state?.is_manual_override, false);

  // D. non-default 60-day programme: days are display-scale (Phase 2 = reference 16–30 → 8–15)
  const d = await newProject({ programme_duration_days: 60 });
  assert.deepEqual(await seedAndStartProgramme(d, "WP2 Test Co", null, 1, 60), {});
  const D = await invariants(d, "D");
  console.log("D 60 days       :", summary(D), "| P2 days", D[1].day_start, "-", D[1].day_end);
  assert.deepEqual([D[1].day_start, D[1].day_end], [8, 15]);

  // E. custom phase (6) after Phase 5 + a PM-edited default phase window (plan values are stored as-is: compressed/display-intent, task 432)
  const e = await newProject();
  const custom = [{ phaseNumber: 6, sortOrder: 6, name: "Extra phase", dayStart: 121, dayEnd: 135, deliverables: [{ name: "Extra deliverable", dayStart: 121, dayEnd: 135 }] }];
  assert.deepEqual(await seedAndStartProgramme(e, "WP2 Test Co", null, 1, 120, [], custom, []), {});
  const E = await invariants(e, "E");
  console.log("E custom phase  :", summary(E), "| deliverables:", E.map((p) => p.deliverables.length).join("/"));
  assert.equal(E.length, 6); assert.equal(E[5].name, "Extra phase"); assert.equal(E[5].deliverables[0].name, "Extra deliverable"); assert.equal(E[5].phase_number, 6);

  // compat views: Phase 1 programme rows are hidden from the legacy milestones/tasklists views, everything else is visible
  const { count: viewRows } = await sb.from("milestones").select("*", { count: "exact", head: true }).eq("project_id", a.id);
  assert.equal(viewRows, 4);
  console.log("OK — all seed scenarios produce consistent unified rows; nothing written to customer_*.");
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
