import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProgramme } from "@/lib/programme/store";
import { toWire } from "@/lib/programme/view-model";

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

    const [projectRes, internalRes, programme] = await Promise.all([
      supabase
        .from("projects")
        .select("id, customer_id, name, programme_started_at, programme_duration_days, onboarding_visible_at, scheduled_onboarding_start_at, customers(company_name)")
        .eq("id", projectId)
        .single(),
      supabase.from("onboarding_internal_deliverables").select("*").eq("project_id", projectId),
      // Task 429 (WP3): unified tables via the store, in programme order. Each phase carries its programme state; deliverable rows
      // carry their own id, so the old read-side Phase 2-5 tasklist self-heal and `phase_tasklists` lookup are gone.
      loadProgramme(supabase, projectId).catch((err: Error) => err),
    ]);

    if (projectRes.error || !projectRes.data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (programme instanceof Error || internalRes.error) {
      console.error("GET /api/projects/[projectId]/programme error:", programme instanceof Error ? programme : internalRes.error);
      return NextResponse.json({ error: "Failed to fetch programme data" }, { status: 500 });
    }

    return NextResponse.json({
      project: projectRes.data,
      programme_started_at: projectRes.data.programme_started_at,
      ...toWire(programme),
      internal_deliverables: internalRes.data ?? [],
    });
  } catch (err) {
    console.error("GET /api/projects/[projectId]/programme unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
