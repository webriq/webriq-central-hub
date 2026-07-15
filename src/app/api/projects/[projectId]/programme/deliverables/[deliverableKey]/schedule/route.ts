import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDeliverable, getPhaseByNumber } from "@/config/customer-phases";

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

    if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 5) {
      return NextResponse.json({ error: "phase_number must be an integer between 1 and 5" }, { status: 400 });
    }
    if (!Number.isInteger(dayStart) || !Number.isInteger(dayEnd)) {
      return NextResponse.json({ error: "day_start and day_end must be integers" }, { status: 400 });
    }
    if (dayStart > dayEnd) {
      return NextResponse.json({ error: "day_start must be less than or equal to day_end" }, { status: 400 });
    }

    const { projectId, deliverableKey } = await params;
    if (!getDeliverable(phaseNumber, deliverableKey)) {
      return NextResponse.json({ error: "Unknown deliverable for that phase" }, { status: 400 });
    }

    const phase = getPhaseByNumber(phaseNumber);
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
