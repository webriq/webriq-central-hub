import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { asDisplayDay, displayDayToYmd } from "@/lib/programme/calendar";
import { getProgrammeDeliverable, getProgrammePhase } from "@/lib/programme/store";

const WRITE_ROLES = ["admin", "super_admin", "marketing"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; deliverableKey: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to update programme deliverables" }, { status: 403 });
    }

    const body = await request.json();
    const phaseNumber = Number(body?.phase_number);
    const dayStart = Number(body?.day_start);
    const dayEnd = Number(body?.day_end);

    if (!Number.isInteger(phaseNumber) || phaseNumber <= 0) {
      return NextResponse.json({ error: "phase_number must be a positive integer" }, { status: 400 });
    }
    if (!Number.isInteger(dayStart) || !Number.isInteger(dayEnd)) {
      return NextResponse.json({ error: "day_start and day_end must be integers" }, { status: 400 });
    }
    if (dayStart > dayEnd) {
      return NextResponse.json({ error: "day_start must be less than or equal to day_end" }, { status: 400 });
    }

    const { projectId, deliverableKey } = await params;
    // Task 429 (WP4, decision D-B): body days are DISPLAY-scale — exactly what the Timeline shows — and are stored as-is. The bound is
    // the owning phase's own stored display window (already skip-compressed and duration-scaled), so no calendar maths is needed.
    const phase = await getProgrammePhase(supabase, projectId, phaseNumber);
    if (!phase) {
      return NextResponse.json({ error: "Unknown phase for that project" }, { status: 400 });
    }
    const deliverable = await getProgrammeDeliverable(supabase, projectId, phaseNumber, deliverableKey);
    if (!deliverable) {
      return NextResponse.json({ error: "Unknown deliverable for that phase" }, { status: 400 });
    }
    if (phase.day_start === null || phase.day_end === null) {
      return NextResponse.json({ error: `Phase ${phaseNumber} has no scheduled day range` }, { status: 400 });
    }
    if (dayStart < phase.day_start || dayEnd > phase.day_end) {
      return NextResponse.json(
        { error: `day_start/day_end must fall within phase ${phaseNumber}'s range (${phase.day_start}-${phase.day_end})` },
        { status: 400 }
      );
    }

    // The derived calendar dates move with the days (null while the programme has no start date).
    const { data: project } = await supabase.from("projects").select("programme_started_at").eq("id", projectId).maybeSingle();
    const startedAt = project?.programme_started_at ?? null;
    const { data, error } = await supabase
      .from("project_deliverables")
      .update({
        day_start: dayStart,
        day_end: dayEnd,
        start_date: startedAt ? displayDayToYmd(startedAt, asDisplayDay(dayStart)) : null,
        due_date: startedAt ? displayDayToYmd(startedAt, asDisplayDay(dayEnd)) : null,
      })
      .eq("id", deliverable.id)
      .select()
      .single();

    if (error) {
      console.error("PATCH .../deliverables/[deliverableKey]/schedule error:", error);
      return NextResponse.json({ error: "Failed to update deliverable schedule" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH .../deliverables/[deliverableKey]/schedule unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
