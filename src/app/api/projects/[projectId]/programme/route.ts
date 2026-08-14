import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedPhase2to5Links } from "@/lib/programme/seed";

// Read-only route — pm/developer can view the Timeline (task 146); every write route under
// programme/* stays admin|super_admin|marketing-only.
const STAFF_ROLES = ["admin", "super_admin", "marketing", "pm", "developer"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !STAFF_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to view programme data" }, { status: 403 });
    }

    const { projectId } = await params;

    const [projectRes, phasesRes, deliverablesRes, internalRes, phaseTasklistsRes] = await Promise.all([
      supabase
        .from("projects")
        .select("id, customer_id, name, programme_started_at, programme_duration_days, onboarding_visible_at, scheduled_onboarding_start_at, customers(company_name)")
        .eq("id", projectId)
        .single(),
      // Task 246: ordered by sort_order (display position) rather than phase_number (stable
      // identity) — a custom phase can sit anywhere in the display order regardless of its number.
      supabase.from("customer_phases").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("customer_deliverables").select("*").eq("project_id", projectId).order("phase_number"),
      supabase.from("onboarding_internal_deliverables").select("*").eq("project_id", projectId),
      // Task 241: Phase 2-5's generic-model tasklists (seeded by seedAndStartProgramme alongside
      // the day-based rows above) — the Timeline resolves a clicked deliverable card's
      // (phaseNumber, deliverableKey) to one of these via its external_id, to link into Projects >
      // Tasks. Only the id/external_id are needed for that lookup.
      supabase.from("tasklists").select("id, external_id").eq("project_id", projectId).like("external_id", "programme-deliverable-%"),
    ]);

    if (projectRes.error || !projectRes.data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (phasesRes.error || deliverablesRes.error || internalRes.error) {
      console.error("GET /api/projects/[projectId]/programme error:", phasesRes.error ?? deliverablesRes.error ?? internalRes.error);
      return NextResponse.json({ error: "Failed to fetch programme data" }, { status: 500 });
    }

    // Task 243 self-heal: a project whose programme reached Phase 2-5 before the external_id
    // collision fix shipped (task 241's original bug) has customer_phases rows past "not_started"
    // but zero of its own Phase 2-5 milestones/tasklists — seedPhase2to5Links is upsert-based and
    // scoped by project_id, so it's safe to retry here and self-heals on next Timeline load
    // instead of staying permanently broken (the seeding loop only otherwise runs once, at start).
    let phaseTasklists = phaseTasklistsRes.data ?? [];
    const programmeReachedPhase2to5 = (phasesRes.data ?? []).some((p) => p.phase_number > 1 && p.status !== "not_started");
    if (programmeReachedPhase2to5 && phaseTasklists.length === 0) {
      try {
        await seedPhase2to5Links(projectRes.data);
        const retry = await supabase
          .from("tasklists")
          .select("id, external_id")
          .eq("project_id", projectId)
          .like("external_id", "programme-deliverable-%");
        phaseTasklists = retry.data ?? [];
      } catch (backfillErr) {
        console.error("GET /api/projects/[projectId]/programme: Phase 2-5 backfill error:", backfillErr);
      }
    }

    return NextResponse.json({
      project: projectRes.data,
      programme_started_at: projectRes.data.programme_started_at,
      phases: phasesRes.data ?? [],
      deliverables: deliverablesRes.data ?? [],
      internal_deliverables: internalRes.data ?? [],
      phase_tasklists: phaseTasklists,
    });
  } catch (err) {
    console.error("GET /api/projects/[projectId]/programme unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
