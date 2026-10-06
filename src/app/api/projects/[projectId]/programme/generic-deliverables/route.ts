import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { MAX_DELIVERABLE_NAME_LENGTH, hasDuplicateName, nextDeliverablePosition } from "@/lib/programme/add-deliverable";

// Task 433 follow-up — generic-engine counterpart to POST .../programme/deliverables (StackShift I): add a deliverable (a `tasklists` row,
// i.e. a `project_deliverables` row with phase_id = the milestone) to a phase of a project on the milestones/tasklists Timeline (StackShift II,
// Access, Access Plus, PipelineForge, Discrete Development). Those rows are `source = 'manual'`, which RLS only lets admin/super_admin/pm
// write — marketing is allowed here too, so after the session + role check the insert goes through adminClient (insert-only).
// Days are in the phase's own day coordinates (the same ones seed-custom-phases writes); the Timeline shifts them by `tasklistOffset`.
const WRITE_ROLES = ["admin", "super_admin", "marketing", "pm"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to add deliverables" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const milestoneId = typeof body?.milestone_id === "string" ? body.milestone_id : null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!milestoneId) return NextResponse.json({ error: "milestone_id is required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (name.length > MAX_DELIVERABLE_NAME_LENGTH) {
      return NextResponse.json({ error: `name must be ${MAX_DELIVERABLE_NAME_LENGTH} characters or fewer` }, { status: 400 });
    }
    const hasDays = body?.day_start !== undefined || body?.day_end !== undefined;

    const { projectId } = await params;
    const { data: project } = await supabase.from("projects").select("id, uses_customer_phases_engine").eq("id", projectId).maybeSingle();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.uses_customer_phases_engine) {
      return NextResponse.json({ error: "This project uses the StackShift I programme engine — use the programme deliverables route instead" }, { status: 400 });
    }

    const { data: milestone } = await supabase
      .from("project_phases")
      .select("id, day_start, day_end")
      .eq("id", milestoneId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!milestone) return NextResponse.json({ error: "milestone_id does not belong to this project" }, { status: 400 });

    // A phase with a day range gets a one-day default on its last day; one without stays unscheduled (null days → the Timeline's "Unscheduled" row).
    let dayStart: number | null = milestone.day_end;
    let dayEnd: number | null = milestone.day_end;
    if (hasDays) {
      dayStart = Number(body.day_start);
      dayEnd = Number(body.day_end);
      if (!Number.isInteger(dayStart) || !Number.isInteger(dayEnd) || dayStart < 1) {
        return NextResponse.json({ error: "day_start and day_end must be positive integers" }, { status: 400 });
      }
      if (dayStart > dayEnd) return NextResponse.json({ error: "day_start must be less than or equal to day_end" }, { status: 400 });
      if (milestone.day_start !== null && milestone.day_end !== null && (dayStart < milestone.day_start || dayEnd > milestone.day_end)) {
        return NextResponse.json({ error: `day_start/day_end must fall within the phase's range (${milestone.day_start}-${milestone.day_end})` }, { status: 400 });
      }
    }

    const { data: existing, error: existingError } = await supabase.from("project_deliverables").select("name, position").eq("phase_id", milestone.id);
    if (existingError) {
      console.error("POST /api/projects/[projectId]/programme/generic-deliverables existing fetch error:", existingError);
      return NextResponse.json({ error: "Failed to load the phase's deliverables" }, { status: 500 });
    }
    const rows = existing ?? [];
    if (hasDuplicateName(name, rows.map((d) => d.name))) {
      return NextResponse.json({ error: "This phase already has a deliverable with that name" }, { status: 409 });
    }

    const { data, error } = await adminClient
      .from("project_deliverables")
      .insert({
        project_id: projectId,
        phase_id: milestone.id,
        name,
        position: nextDeliverablePosition(rows.map((d) => d.position)),
        day_start: dayStart,
        day_end: dayEnd,
        source: "manual",
      })
      .select("id, project_id, external_id, name, position, is_default, phase_id, day_start, day_end, created_at, updated_at")
      .single();
    if (error) {
      console.error("POST /api/projects/[projectId]/programme/generic-deliverables insert error:", error);
      return NextResponse.json({ error: "Failed to add deliverable" }, { status: 500 });
    }

    // Returned in the `tasklists` compat-view shape (`milestone_id`, not `phase_id`) that the generic Timeline state holds.
    const { phase_id, ...rest } = data;
    return NextResponse.json({ ...rest, milestone_id: phase_id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/projects/[projectId]/programme/generic-deliverables unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
