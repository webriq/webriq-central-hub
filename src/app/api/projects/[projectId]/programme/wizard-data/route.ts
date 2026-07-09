import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const WRITE_ROLES = ["admin", "super_admin", "marketing"];

// Debounced autosave for the onboarding wizard's Kickoff / Storage-KB free-text fields, keyed by
// sub-phase (e.g. `{ kickoff: {...}, "storage-kb": {...} }`) and merged into the Phase 1 row's
// wizard_data JSONB — restructured from task 122's flat shape now that the wizard has 7 sub-phase
// steps instead of 5 generic ones.
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
      return NextResponse.json({ error: "Not permitted to update wizard data" }, { status: 403 });
    }

    const body = await request.json();
    const subPhaseKey = body?.subPhaseKey;
    if (typeof subPhaseKey !== "string" || !subPhaseKey) {
      return NextResponse.json({ error: "subPhaseKey is required" }, { status: 400 });
    }
    if (typeof body?.data !== "object" || body.data === null || Array.isArray(body.data)) {
      return NextResponse.json({ error: "data must be an object" }, { status: 400 });
    }

    const { projectId } = await params;

    const { data: existing, error: fetchError } = await supabase
      .from("customer_phases")
      .select("wizard_data")
      .eq("project_id", projectId)
      .eq("phase_number", 1)
      .single();
    if (fetchError || !existing) {
      return NextResponse.json({ error: "Programme not started for this project" }, { status: 404 });
    }

    const existingData = (existing.wizard_data as Record<string, unknown>) ?? {};
    const mergedSubPhase = { ...((existingData[subPhaseKey] as Record<string, unknown>) ?? {}), ...body.data };
    const mergedData = { ...existingData, [subPhaseKey]: mergedSubPhase };

    const { data, error } = await supabase
      .from("customer_phases")
      .update({ wizard_data: mergedData })
      .eq("project_id", projectId)
      .eq("phase_number", 1)
      .select("wizard_data")
      .single();

    if (error) {
      console.error("PATCH /api/projects/[projectId]/programme/wizard-data error:", error);
      return NextResponse.json({ error: "Failed to save wizard data" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/projects/[projectId]/programme/wizard-data unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
