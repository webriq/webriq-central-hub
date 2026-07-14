import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { updateZohoProject } from "@/lib/zoho";
import type { Database } from "@/types/database";

type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

const VALID_PROJECT_TYPES = ["Content Site", "Ecommerce (B2C)", "Ecommerce (B2B)", "Custom App"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string; projectId: string }> }
) {
  try {
    const { customerId, projectId } = await params;
    const body = await request.json();
    const { project_name, project_type, sanity_project_id, github_repo, dedicated_developers } = body;

    if (project_name !== undefined && !project_name?.trim()) {
      return NextResponse.json({ error: "project_name cannot be empty" }, { status: 400 });
    }
    if (project_type !== undefined && !VALID_PROJECT_TYPES.includes(project_type)) {
      return NextResponse.json(
        { error: `project_type must be one of: ${VALID_PROJECT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const { data: current, error: fetchError } = await adminClient
      .from("projects")
      .select("name, external_project_id")
      .eq("id", projectId)
      .eq("customer_id", customerId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const updates: ProjectUpdate = { updated_at: new Date().toISOString() };
    if (project_name !== undefined) updates.name = project_name.trim();
    if (project_type !== undefined) updates.project_type = project_type;
    if (sanity_project_id !== undefined) updates.sanity_project_id = sanity_project_id || null;
    if (github_repo !== undefined) updates.github_repo = github_repo || null;
    if (dedicated_developers !== undefined) {
      updates.dedicated_developers = Array.isArray(dedicated_developers) ? dedicated_developers : [];
    }

    const { data, error } = await adminClient
      .from("projects")
      .update(updates)
      .eq("id", projectId)
      .eq("customer_id", customerId)
      .select()
      .single();

    if (error) {
      console.error("PATCH /api/customers/[customerId]/projects/[projectId] error:", error);
      return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
    }

    let zohoRenameFailed = false;
    const effectiveZohoId = updates.external_project_id ?? current.external_project_id;
    const nameChanged = project_name !== undefined && project_name.trim() !== current.name;
    if (nameChanged && effectiveZohoId) {
      const ok = await updateZohoProject(String(effectiveZohoId), project_name.trim());
      if (!ok) zohoRenameFailed = true;
    }

    return NextResponse.json({ ...data, zoho_rename_failed: zohoRenameFailed });
  } catch (err) {
    console.error("PATCH /api/customers/[customerId]/projects/[projectId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
