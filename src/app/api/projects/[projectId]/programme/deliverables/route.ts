import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { asDisplayDay, displayDayToYmd } from "@/lib/programme/calendar";
import { getProgrammePhase } from "@/lib/programme/store";
import {
  MAX_DELIVERABLE_NAME_LENGTH, defaultDeliverableSpan, deliverableSpanError, hasDuplicateName, nextDeliverablePosition, uniqueDeliverableKey,
} from "@/lib/programme/add-deliverable";

// Task 433 — add a deliverable to a phase of an already-started programme. pm is allowed here, but project_deliverables' RLS only lets
// admin/super_admin/marketing write `source = 'programme'` rows (migration 160), so after the session + role check the insert goes
// through adminClient (insert-only; the existing status/schedule PATCH routes keep their narrower role list on purpose).
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
      return NextResponse.json({ error: "Not permitted to add programme deliverables" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const phaseNumber = Number(body?.phase_number);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!Number.isInteger(phaseNumber) || phaseNumber <= 0) {
      return NextResponse.json({ error: "phase_number must be a positive integer" }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (name.length > MAX_DELIVERABLE_NAME_LENGTH) {
      return NextResponse.json({ error: `name must be ${MAX_DELIVERABLE_NAME_LENGTH} characters or fewer` }, { status: 400 });
    }
    const hasDays = body?.day_start !== undefined || body?.day_end !== undefined;

    const { projectId } = await params;
    const { data: project } = await supabase.from("projects").select("id, programme_started_at").eq("id", projectId).maybeSingle();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!project.programme_started_at) {
      return NextResponse.json({ error: "The programme has not started — add deliverables in the phase builder instead" }, { status: 400 });
    }

    const phase = await getProgrammePhase(supabase, projectId, phaseNumber);
    if (!phase) return NextResponse.json({ error: "Unknown phase for that project" }, { status: 400 });
    if (phase.status === "skipped") {
      return NextResponse.json({ error: `Phase ${phaseNumber} is excluded from this project` }, { status: 400 });
    }
    if (phase.day_start === null || phase.day_end === null) {
      return NextResponse.json({ error: `Phase ${phaseNumber} has no scheduled day range` }, { status: 400 });
    }

    const { dayStart, dayEnd } = hasDays
      ? { dayStart: Number(body.day_start), dayEnd: Number(body.day_end) }
      : defaultDeliverableSpan(phase.day_end);
    const spanError = deliverableSpanError(dayStart, dayEnd, phase.day_start, phase.day_end);
    if (spanError) return NextResponse.json({ error: spanError }, { status: 400 });

    const { data: existing, error: existingError } = await supabase
      .from("project_deliverables")
      .select("name, deliverable_key, position")
      .eq("phase_id", phase.id)
      .eq("source", "programme");
    if (existingError) {
      console.error("POST /api/projects/[projectId]/programme/deliverables existing fetch error:", existingError);
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
        phase_id: phase.id,
        name,
        deliverable_key: uniqueDeliverableKey(name, rows.map((d) => d.deliverable_key)),
        position: nextDeliverablePosition(rows.map((d) => d.position)),
        day_start: dayStart,
        day_end: dayEnd,
        start_date: displayDayToYmd(project.programme_started_at, asDisplayDay(dayStart)),
        due_date: displayDayToYmd(project.programme_started_at, asDisplayDay(dayEnd)),
        status: "pending",
        is_default: false,
        source: "programme",
      })
      .select()
      .single();
    if (error) {
      // 23505 = the per-phase key unique index (migration 161) lost a race with a concurrent add of the same name.
      if (error.code === "23505") return NextResponse.json({ error: "This phase already has a deliverable with that name" }, { status: 409 });
      console.error("POST /api/projects/[projectId]/programme/deliverables insert error:", error);
      return NextResponse.json({ error: "Failed to add deliverable" }, { status: 500 });
    }

    return NextResponse.json({ ...data, phase_number: phaseNumber }, { status: 201 });
  } catch (err) {
    console.error("POST /api/projects/[projectId]/programme/deliverables unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
