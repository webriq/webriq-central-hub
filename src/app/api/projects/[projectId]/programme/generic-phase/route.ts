import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const WRITE_ROLES = ["admin", "super_admin", "marketing", "pm"];

// Task 252 — generic-engine (Access/Access Plus/Discrete Development/StackShift II without the
// customer_phases opt-in) counterpart to StackShift I's PATCH .../programme/phase: "Jump to
// phase" for a project whose plan lives in milestones/tasklists instead of customer_phases. Mirrors
// that route's backdate math (mirrors seedAndStartProgramme's own "land today on the target's
// day_start" convention), but simpler — no skip-phase concept exists for milestones (task 252
// scope decision), so there's no compression step, just `backdated = now - (dayStart - 1)`.
// Every earlier-by-position milestone is marked "completed" (there's no "skipped" status value in
// this engine's schema); every later one stays/becomes "planned". Read-only outside this action —
// milestone/tasklist/task CRUD itself stays on the Projects module's own tabs (task 247's scope
// decision, unaffected by this route).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to override the programme phase" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const milestoneId = typeof body?.milestone_id === "string" ? body.milestone_id : null;
    if (!milestoneId) {
      return NextResponse.json({ error: "milestone_id is required" }, { status: 400 });
    }

    const { projectId } = await params;
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, uses_customer_phases_engine, programme_started_at")
      .eq("id", projectId)
      .single();
    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.uses_customer_phases_engine) {
      return NextResponse.json({ error: "This project uses the StackShift I programme engine — use the phase route instead" }, { status: 400 });
    }

    const { data: milestones, error: milestonesError } = await supabase
      .from("milestones")
      .select("id, position, day_start")
      .eq("project_id", projectId);
    if (milestonesError || !milestones) {
      console.error("PATCH /api/projects/[projectId]/programme/generic-phase milestones fetch error:", milestonesError);
      return NextResponse.json({ error: "Failed to load milestones" }, { status: 500 });
    }
    const target = milestones.find((m) => m.id === milestoneId);
    if (!target) {
      return NextResponse.json({ error: "milestone_id does not belong to this project" }, { status: 400 });
    }

    // A milestone with no day range (legacy row seeded before task 252, or a manually-added one
    // with the range left blank) can still be jumped to — it just doesn't move `programme_started_at`.
    if (target.day_start != null) {
      const backdated = new Date();
      backdated.setDate(backdated.getDate() - (target.day_start - 1));
      const { error: dateError } = await adminClient
        .from("projects")
        .update({ programme_started_at: backdated.toISOString() })
        .eq("id", projectId);
      if (dateError) {
        console.error("PATCH /api/projects/[projectId]/programme/generic-phase backdate error:", dateError);
        return NextResponse.json({ error: "Failed to update programme start date" }, { status: 500 });
      }
    } else if (!project.programme_started_at) {
      const { error: startError } = await adminClient
        .from("projects")
        .update({ programme_started_at: new Date().toISOString() })
        .eq("id", projectId);
      if (startError) {
        console.error("PATCH /api/projects/[projectId]/programme/generic-phase start error:", startError);
        return NextResponse.json({ error: "Failed to start the programme" }, { status: 500 });
      }
    }

    const targetPosition = target.position ?? -Infinity;
    const updates = milestones.map((m) => {
      const status = m.id === milestoneId ? "active" : (m.position ?? Infinity) < targetPosition ? "completed" : "planned";
      return adminClient.from("milestones").update({ status }).eq("id", m.id);
    });
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("PATCH /api/projects/[projectId]/programme/generic-phase status update error:", failed.error);
      return NextResponse.json({ error: "Failed to update milestone statuses" }, { status: 500 });
    }

    const [{ data: updatedMilestones }, { data: updatedProject }] = await Promise.all([
      supabase.from("milestones").select("*").eq("project_id", projectId),
      supabase.from("projects").select("programme_started_at").eq("id", projectId).single(),
    ]);
    return NextResponse.json({ milestones: updatedMilestones ?? [], programme_started_at: updatedProject?.programme_started_at ?? null });
  } catch (err) {
    console.error("PATCH /api/projects/[projectId]/programme/generic-phase unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
