import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import { PROGRAMME_PHASES, INTERNAL_DELIVERABLES, getPhaseByNumber, getCurrentProgrammeDay } from "@/config/customer-phases";

// Shared by the manual "Start Onboarding" route, the New Project intake's `mode: "start"` path,
// and the scheduled auto-start cron — all three need identical seed semantics. Uses adminClient
// throughout (not just for the projects update) because the cron caller has no user session at
// all; this is the documented server-only, session-less write path exception (CLAUDE.md).
//
// startedByUserId (task 153): the user who clicked "Start Onboarding" becomes Phase 1's owner.
// Optional because the scheduled auto-start cron has no user session — a cron-started project's
// Phase 1 simply has zero members, which the app treats as unrestricted (see task 153 doc's
// "Backward compatibility" section), not an error.
//
// phaseNumber (chat follow-up to task 157): lets a scheduled start land on Phase 2-5 instead of
// always Day 1/Phase 1 — mirrors the Timeline's existing manual "Jump to phase" override
// (PATCH .../programme/phase) exactly: earlier phases marked "skipped", the target phase
// "active" and backdated so "today" lands on its first day, later phases "not_started". Phase
// membership (phase_members) stays Phase-1-only, matching every other phase_members call site in
// this codebase — phases 2-5 have no Wizard/membership-gated entry concept to assign.
export async function seedAndStartProgramme(
  project: { id: string; customer_id: string },
  companyName: string,
  startedByUserId?: string | null,
  phaseNumber: 1 | 2 | 3 | 4 | 5 = 1
): Promise<{ error?: string }> {
  const targetPhase = getPhaseByNumber(phaseNumber);
  const today = new Date().toISOString().slice(0, 10);

  const startedAt = new Date();
  startedAt.setDate(startedAt.getDate() - (targetPhase.dayStart - 1));

  const { error: updateError } = await adminClient
    .from("projects")
    .update({ programme_started_at: startedAt.toISOString() })
    .eq("id", project.id);
  if (updateError) {
    console.error("seedAndStartProgramme: projects update error:", updateError);
    return { error: "Failed to start programme" };
  }

  const phaseRows = PROGRAMME_PHASES.map((p) => ({
    customer_id: project.customer_id,
    project_id: project.id,
    phase_number: p.number,
    status: p.number === phaseNumber ? "active" : p.number < phaseNumber ? "skipped" : "not_started",
    actual_start_date: p.number === phaseNumber ? today : null,
    is_manual_override: phaseNumber !== 1 && p.number === phaseNumber,
  }));
  const deliverableRows = PROGRAMME_PHASES.flatMap((p) =>
    p.deliverables.map((d) => ({
      customer_id: project.customer_id,
      project_id: project.id,
      phase_number: p.number,
      deliverable_key: d.key,
      // Kickoff is Phase 1's first sub-phase — it starts "in_progress" the moment onboarding
      // begins, rather than sitting at "pending" until the first checklist item is touched.
      // Only ever matches when phaseNumber is 1, since "kickoff" only exists in Phase 1's list.
      status: p.number === phaseNumber && d.key === "kickoff" ? "in_progress" : "pending",
    }))
  );
  const internalDeliverableRows = INTERNAL_DELIVERABLES.map((d) => ({
    project_id: project.id,
    deliverable_key: d.key,
  }));

  const [phasesRes, deliverablesRes, internalRes] = await Promise.all([
    adminClient.from("customer_phases").insert(phaseRows),
    adminClient.from("customer_deliverables").insert(deliverableRows),
    adminClient.from("onboarding_internal_deliverables").insert(internalDeliverableRows),
  ]);
  if (phasesRes.error || deliverablesRes.error || internalRes.error) {
    console.error(
      "seedAndStartProgramme: seed error:",
      phasesRes.error ?? deliverablesRes.error ?? internalRes.error
    );
    return { error: "Failed to seed programme phases" };
  }

  if (startedByUserId && phaseNumber === 1) {
    await adminClient.from("phase_members").insert({
      project_id: project.id,
      phase_number: 1,
      user_id: startedByUserId,
      is_owner: true,
      added_by: startedByUserId,
    });
    // Starting onboarding should never leave the starter unable to find their own project on
    // the list afterward — ensure project-level membership too. ignoreDuplicates: the starter
    // may already be a project member (e.g. they created it). Deliberately non-owner (task 155)
    // — a project only gets an owner via creation or an explicit Super Admin transfer, not
    // implicitly via starting Phase 1.
    await adminClient
      .from("project_members")
      .upsert(
        { project_id: project.id, user_id: startedByUserId, added_by: startedByUserId },
        { onConflict: "project_id,user_id", ignoreDuplicates: true }
      );
  }

  await sendCliqNotification(
    phaseNumber === 1
      ? `120-Day Programme started for ${companyName} — Day 1, Phase 1: Onboard (owner: Bert).`
      : `120-Day Programme started for ${companyName} at Phase ${phaseNumber}: ${targetPhase.name}.`,
    "pm"
  );
  return {};
}

// Task 159 — shared by the manual "Jump to phase" override's not-started branch (PATCH
// .../programme/phase) and the CSV/Excel bulk-import route, which both need to seed all 5
// phases at an explicit, caller-supplied start date/phase rather than "now"/"today" (that's
// seedAndStartProgramme's job, above). is_manual_override mirrors seedAndStartProgramme's own
// convention: landing on Phase 1 is a normal onboarding start, not a manual override; only
// landing on Phase 2-5 counts as one.
export async function seedProgrammeAtPhase(
  project: { id: string; customer_id: string },
  phaseNumber: number,
  startedAt: Date,
  note?: string | null
): Promise<{ error?: string }> {
  const today = startedAt.toISOString().slice(0, 10);

  const { error: updateError } = await adminClient
    .from("projects")
    .update({ programme_started_at: startedAt.toISOString() })
    .eq("id", project.id);
  if (updateError) {
    console.error("seedProgrammeAtPhase: projects update error:", updateError);
    return { error: "Failed to set programme start date" };
  }

  const phaseRows = PROGRAMME_PHASES.map((p) => ({
    customer_id: project.customer_id,
    project_id: project.id,
    phase_number: p.number,
    status: p.number === phaseNumber ? "active" : p.number < phaseNumber ? "skipped" : "not_started",
    actual_start_date: p.number === phaseNumber ? today : null,
    is_manual_override: phaseNumber !== 1 && p.number === phaseNumber,
    override_note: p.number === phaseNumber ? note ?? null : null,
  }));
  // Which sub-phase is "active" — the one whose day range contains the programme's current
  // elapsed day (from `startedAt`, which may be backdated: a CSV import's real Kickoff Date, or
  // a Jump-to-Phase landing) — generalizes seedAndStartProgramme's hardcoded "kickoff starts
  // in_progress on Day 1" convention to work for any starting day, not just Day 1.
  const currentDay = getCurrentProgrammeDay(startedAt);
  const deliverableRows = PROGRAMME_PHASES.flatMap((p) =>
    p.deliverables.map((d) => ({
      customer_id: project.customer_id,
      project_id: project.id,
      phase_number: p.number,
      deliverable_key: d.key,
      status: currentDay >= d.dayStart && currentDay <= d.dayEnd ? "in_progress" : "pending",
    }))
  );
  const internalDeliverableRows = INTERNAL_DELIVERABLES.map((d) => ({
    project_id: project.id,
    deliverable_key: d.key,
  }));

  const [phasesRes, deliverablesRes, internalRes] = await Promise.all([
    adminClient.from("customer_phases").insert(phaseRows),
    adminClient.from("customer_deliverables").insert(deliverableRows),
    adminClient.from("onboarding_internal_deliverables").insert(internalDeliverableRows),
  ]);
  if (phasesRes.error || deliverablesRes.error || internalRes.error) {
    console.error(
      "seedProgrammeAtPhase: seed error:",
      phasesRes.error ?? deliverablesRes.error ?? internalRes.error
    );
    return { error: "Failed to seed programme phases" };
  }

  return {};
}
