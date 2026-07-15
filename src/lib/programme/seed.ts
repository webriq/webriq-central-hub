import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import { PROGRAMME_PHASES, INTERNAL_DELIVERABLES } from "@/config/customer-phases";

// Shared by the manual "Start Onboarding" route, the New Project intake's `mode: "start"` path,
// and the scheduled auto-start cron — all three need identical seed semantics. Uses adminClient
// throughout (not just for the projects update) because the cron caller has no user session at
// all; this is the documented server-only, session-less write path exception (CLAUDE.md).
//
// startedByUserId (task 153): the user who clicked "Start Onboarding" becomes Phase 1's owner.
// Optional because the scheduled auto-start cron has no user session — a cron-started project's
// Phase 1 simply has zero members, which the app treats as unrestricted (see task 153 doc's
// "Backward compatibility" section), not an error.
export async function seedAndStartProgramme(
  project: { id: string; customer_id: string },
  companyName: string,
  startedByUserId?: string | null
): Promise<{ error?: string }> {
  const today = new Date().toISOString().slice(0, 10);

  const { error: updateError } = await adminClient
    .from("projects")
    .update({ programme_started_at: new Date().toISOString() })
    .eq("id", project.id);
  if (updateError) {
    console.error("seedAndStartProgramme: projects update error:", updateError);
    return { error: "Failed to start programme" };
  }

  const phaseRows = PROGRAMME_PHASES.map((p) => ({
    customer_id: project.customer_id,
    project_id: project.id,
    phase_number: p.number,
    status: p.number === 1 ? "active" : "not_started",
    actual_start_date: p.number === 1 ? today : null,
  }));
  const deliverableRows = PROGRAMME_PHASES.flatMap((p) =>
    p.deliverables.map((d) => ({
      customer_id: project.customer_id,
      project_id: project.id,
      phase_number: p.number,
      deliverable_key: d.key,
      // Kickoff is Phase 1's first sub-phase — it starts "in_progress" the moment onboarding
      // begins, rather than sitting at "pending" until the first checklist item is touched.
      status: p.number === 1 && d.key === "kickoff" ? "in_progress" : "pending",
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

  if (startedByUserId) {
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
    `120-Day Programme started for ${companyName} — Day 1, Phase 1: Onboard (owner: Bert).`,
    "pm"
  );
  return {};
}
