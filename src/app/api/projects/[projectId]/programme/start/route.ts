import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedAndStartProgramme } from "@/lib/programme/seed";
import { cancelProjectAutostart } from "@/lib/qstash";
import type { CustomPhaseSeed, DefaultPhaseOverride } from "@/config/customer-phases";

// Task 153: pm can now also start the programme (was admin/super_admin/marketing only).
const WRITE_ROLES = ["admin", "super_admin", "marketing", "pm"];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to start the programme" }, { status: 403 });
    }

    const { projectId } = await params;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select(
        "id, customer_id, programme_started_at, qstash_message_id, programme_duration_days, uses_customer_phases_engine, draft_skip_phase_numbers, draft_custom_phases, draft_default_phase_overrides, customers(company_name)"
      )
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.programme_started_at) {
      return NextResponse.json({ error: "Programme already started for this project" }, { status: 409 });
    }

    // Task 251: a generic-engine project (StackShift Access/Access Plus/Discrete Development, or
    // StackShift II without the customer_phases engine opt-in) has no customer_phases/
    // customer_deliverables concept — its milestones/tasklists/tasks are already seeded at intake
    // (see api/onboarding/projects/route.ts), regardless of mode. "Starting" it just means
    // flipping the same programme_started_at gate StackShift I uses, so GenericPhaseView's
    // not-started screen knows to show the live board — no seedAndStartProgramme call needed or
    // wanted (it would wrongly write customer_phases rows onto a non-StackShift-I project).
    if (!project.uses_customer_phases_engine) {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ programme_started_at: new Date().toISOString() })
        .eq("id", projectId);
      if (updateError) {
        return NextResponse.json({ error: "Failed to start onboarding" }, { status: 500 });
      }
      if (project.qstash_message_id) {
        await cancelProjectAutostart(project.qstash_message_id);
        await supabase.from("projects").update({ qstash_message_id: null }).eq("id", projectId);
      }
      return NextResponse.json({ started: true }, { status: 201 });
    }

    const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";
    // Task 248: read back the skip/custom-phase selection persisted at intake (Draft/Scheduled
    // projects never had a "start" submission to seed from directly) — previously omitted here,
    // silently discarding any skip/custom configuration for every Draft project's eventual manual
    // start.
    const result = await seedAndStartProgramme(
      { id: project.id, customer_id: project.customer_id },
      companyName,
      user.id,
      1,
      project.programme_duration_days,
      project.draft_skip_phase_numbers ?? [],
      (project.draft_custom_phases as CustomPhaseSeed[] | null) ?? [],
      (project.draft_default_phase_overrides as DefaultPhaseOverride[] | null) ?? []
    );
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Starting manually beat any scheduled QStash message to it — cancel the now-redundant
    // pending message (best-effort; the qstash-start route is idempotent regardless).
    if (project.qstash_message_id) {
      await cancelProjectAutostart(project.qstash_message_id);
      await supabase.from("projects").update({ qstash_message_id: null }).eq("id", projectId);
    }

    const [phasesRes, deliverablesRes] = await Promise.all([
      supabase.from("customer_phases").select("*").eq("project_id", projectId).order("phase_number"),
      supabase.from("customer_deliverables").select("*").eq("project_id", projectId).order("phase_number"),
    ]);

    return NextResponse.json({ phases: phasesRes.data ?? [], deliverables: deliverablesRes.data ?? [] }, { status: 201 });
  } catch (err) {
    console.error("POST /api/projects/[projectId]/programme/start unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
