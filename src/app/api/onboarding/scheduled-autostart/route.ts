import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { seedAndStartProgramme } from "@/lib/programme/seed";
import type { CustomPhaseSeed, DefaultPhaseOverride } from "@/config/customer-phases";

// Frequent-interval cron target (pg_cron -> pg_net, every 15 min — see migration 060). Finds
// projects whose "Set Schedule" time has passed and runs the exact same start logic as the
// manual "Start Onboarding" button. Secret-gated the same way /api/digest and
// /api/programme/reminders are.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRONJOB_SECRET_KEY;
  const incomingSecret = req.headers.get("x-cron-secret");
  const isCronCall = cronSecret && incomingSecret === cronSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: dueProjects, error } = await adminClient
      .from("projects")
      .select(
        "id, customer_id, programme_started_at, scheduled_onboarding_start_at, scheduled_start_phase, programme_duration_days, uses_customer_phases_engine, draft_skip_phase_numbers, draft_custom_phases, draft_default_phase_overrides, customers(company_name)"
      )
      .not("scheduled_onboarding_start_at", "is", null)
      .is("programme_started_at", null)
      .lte("scheduled_onboarding_start_at", new Date().toISOString());

    if (error) {
      console.error("POST /api/onboarding/scheduled-autostart query error:", error);
      return NextResponse.json({ error: "Failed to query due projects" }, { status: 500 });
    }

    let started = 0;
    for (const project of dueProjects ?? []) {
      // Task 251: a generic-engine project (StackShift Access/Access Plus/Discrete Development, or
      // StackShift II without the engine opt-in) has no customer_phases concept — before this
      // check, this cron unconditionally called seedAndStartProgramme, which would wrongly write
      // StackShift-shaped customer_phases/customer_deliverables rows onto it. It only needs its
      // programme_started_at gate flipped (its milestones/tasklists/tasks were already seeded at
      // intake, regardless of mode).
      if (!project.uses_customer_phases_engine) {
        const { error: updateError } = await adminClient
          .from("projects")
          .update({ programme_started_at: new Date().toISOString() })
          .eq("id", project.id);
        if (!updateError) started++;
        continue;
      }

      const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";
      // scheduled_start_phase null (every project scheduled before this column existed, or a
      // plain Phase-1 schedule) defaults to Phase 1 — unchanged behavior for those rows.
      const phaseNumber = (project.scheduled_start_phase ?? 1) as 1 | 2 | 3 | 4 | 5;
      // Task 248: read back the skip/custom-phase selection persisted at intake — previously
      // omitted here, silently discarding it for every scheduled start the 5-minute cron fallback
      // caught (as opposed to the one-shot QStash callback, qstash-start/route.ts, fixed the same
      // way).
      const result = await seedAndStartProgramme(
        { id: project.id, customer_id: project.customer_id },
        companyName,
        undefined,
        phaseNumber,
        project.programme_duration_days,
        project.draft_skip_phase_numbers ?? [],
        (project.draft_custom_phases as CustomPhaseSeed[] | null) ?? [],
        (project.draft_default_phase_overrides as DefaultPhaseOverride[] | null) ?? []
      );
      if (!result.error) started++;
    }

    return NextResponse.json({ due: dueProjects?.length ?? 0, started });
  } catch (err) {
    console.error("POST /api/onboarding/scheduled-autostart unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
