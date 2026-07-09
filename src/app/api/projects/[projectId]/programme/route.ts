import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STAFF_ROLES = ["admin", "super_admin", "marketing"];

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

    const [projectRes, phasesRes, deliverablesRes, internalRes] = await Promise.all([
      supabase
        .from("projects")
        .select("id, customer_id, name, programme_started_at, onboarding_visible_at, scheduled_onboarding_start_at, customers(company_name)")
        .eq("id", projectId)
        .single(),
      supabase.from("customer_phases").select("*").eq("project_id", projectId).order("phase_number"),
      supabase.from("customer_deliverables").select("*").eq("project_id", projectId).order("phase_number"),
      supabase.from("onboarding_internal_deliverables").select("*").eq("project_id", projectId),
    ]);

    if (projectRes.error || !projectRes.data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (phasesRes.error || deliverablesRes.error || internalRes.error) {
      console.error("GET /api/projects/[projectId]/programme error:", phasesRes.error ?? deliverablesRes.error ?? internalRes.error);
      return NextResponse.json({ error: "Failed to fetch programme data" }, { status: 500 });
    }

    return NextResponse.json({
      project: projectRes.data,
      programme_started_at: projectRes.data.programme_started_at,
      phases: phasesRes.data ?? [],
      deliverables: deliverablesRes.data ?? [],
      internal_deliverables: internalRes.data ?? [],
    });
  } catch (err) {
    console.error("GET /api/projects/[projectId]/programme unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
