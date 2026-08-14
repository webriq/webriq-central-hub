import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveEffectivePhase } from "@/config/customer-phases";

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
    // Task 246: existence check + phase day-range bound now come from this project's own rows,
    // not a static getDeliverable/getPhaseByNumber lookup — both throw/return undefined for a
    // custom phase's phase_number, which has no PROGRAMME_PHASES entry.
    const { count: deliverableExists } = await supabase
      .from("customer_deliverables")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("phase_number", phaseNumber)
      .eq("deliverable_key", deliverableKey);
    if (!deliverableExists) {
      return NextResponse.json({ error: "Unknown deliverable for that phase" }, { status: 400 });
    }

    const { data: phaseRow } = await supabase
      .from("customer_phases")
      .select("phase_number, custom_name, day_start_override, day_end_override, sort_order")
      .eq("project_id", projectId)
      .eq("phase_number", phaseNumber)
      .maybeSingle();
    if (!phaseRow) {
      return NextResponse.json({ error: "Unknown phase for that project" }, { status: 400 });
    }
    const phase = resolveEffectivePhase(phaseRow);
    if (dayStart < phase.dayStart || dayEnd > phase.dayEnd) {
      return NextResponse.json(
        { error: `day_start/day_end must fall within phase ${phaseNumber}'s range (${phase.dayStart}-${phase.dayEnd})` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("customer_deliverables")
      .update({ day_start_override: dayStart, day_end_override: dayEnd })
      .eq("project_id", projectId)
      .eq("phase_number", phaseNumber)
      .eq("deliverable_key", deliverableKey)
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
