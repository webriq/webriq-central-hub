import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedAndStartProgramme } from "@/lib/programme/seed";

// Task 153: pm can now also start the programme (was admin/super_admin/marketing only).
const WRITE_ROLES = ["admin", "super_admin", "marketing", "pm"];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to start the programme" }, { status: 403 });
    }

    const { projectId } = await params;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, customer_id, programme_started_at, customers(company_name)")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.programme_started_at) {
      return NextResponse.json({ error: "Programme already started for this project" }, { status: 409 });
    }

    const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";
    const result = await seedAndStartProgramme({ id: project.id, customer_id: project.customer_id }, companyName, user.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const [phasesRes, deliverablesRes] = await Promise.all([
      supabase.from("customer_phases").select("*").eq("project_id", projectId).order("phase_number"),
      supabase.from("customer_deliverables").select("*").eq("project_id", projectId).order("phase_number"),
    ]);

    return NextResponse.json({ phases: phasesRes.data ?? [], deliverables: deliverablesRes.data ?? [] }, { status: 201 });
  } catch (err) {
    console.error("POST /api/projects/[projectId]/programme/start unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
