import { adminClient } from "@/lib/supabase/admin";
import type { PhasePlanInput } from "@/config/customer-phases";

// Seeds a New Project wizard's custom phase/deliverable/checklist plan into the generic PM
// tables (task 239) — used by every classification except StackShift I, which keeps using the
// specialized customer_phases/customer_deliverables engine (seedAndStartProgramme) instead.
// Phases -> milestones, deliverable items -> tasklists, checklist items -> tasks. Inserted
// phase-by-phase / deliverable-by-deliverable (not one flat Promise.all) since each child row
// needs its parent's freshly-inserted id.
export async function seedCustomPhases(
  projectId: string,
  createdByUserId: string | null,
  plan: PhasePlanInput
): Promise<{ error?: string }> {
  for (let phaseIndex = 0; phaseIndex < plan.phases.length; phaseIndex++) {
    const phase = plan.phases[phaseIndex];
    const { data: milestone, error: milestoneError } = await adminClient
      .from("milestones")
      .insert({
        project_id: projectId,
        name: phase.name,
        position: phaseIndex,
        status: "planned",
        created_by: createdByUserId,
        day_start: phase.dayStart,
        day_end: phase.dayEnd,
      })
      .select("id")
      .single();
    if (milestoneError || !milestone) {
      console.error("seedCustomPhases: milestone insert error:", milestoneError);
      return { error: "Failed to seed phase plan" };
    }

    for (let deliverableIndex = 0; deliverableIndex < phase.deliverables.length; deliverableIndex++) {
      const deliverable = phase.deliverables[deliverableIndex];
      const { data: tasklist, error: tasklistError } = await adminClient
        .from("tasklists")
        .insert({
          project_id: projectId,
          milestone_id: milestone.id,
          name: deliverable.name,
          position: deliverableIndex,
          day_start: deliverable.dayStart,
          day_end: deliverable.dayEnd,
        })
        .select("id")
        .single();
      if (tasklistError || !tasklist) {
        console.error("seedCustomPhases: tasklist insert error:", tasklistError);
        return { error: "Failed to seed phase plan" };
      }

      if (deliverable.checklist.length === 0) continue;
      const taskRows = deliverable.checklist.map((item, i) => ({
        project_id: projectId,
        milestone_id: milestone.id,
        tasklist_id: tasklist.id,
        title: item.title,
        status: "open",
        position: i,
        created_by: createdByUserId,
      }));
      const { error: taskError } = await adminClient.from("tasks").insert(taskRows);
      if (taskError) {
        console.error("seedCustomPhases: task insert error:", taskError);
        return { error: "Failed to seed phase plan" };
      }
    }
  }
  return {};
}
