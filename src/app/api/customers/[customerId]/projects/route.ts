import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createZohoProject } from "@/lib/zoho";

const VALID_PROJECT_TYPES = ["Content Site", "Ecommerce (B2C)", "Ecommerce (B2B)", "Custom App"] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params;
    // Individually-hidden projects (in-progress onboarding on an otherwise-visible customer)
    // never appear in the profile's Projects tab or count, per task 123's visibility gate.
    const { data, error } = await adminClient
      .from("projects")
      .select("*")
      .eq("customer_id", customerId)
      .not("onboarding_visible_at", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/customers/[customerId]/projects error:", error);
      return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/customers/[customerId]/projects unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params;
    const body = await request.json();
    const {
      project_name,
      project_type,
      external_project_id,
      sanity_project_id,
      github_repo,
      dedicated_developers,
      create_zoho_project,
    } = body;

    if (!project_name?.trim()) {
      return NextResponse.json({ error: "project_name is required" }, { status: 400 });
    }
    if (!project_type || !VALID_PROJECT_TYPES.includes(project_type)) {
      return NextResponse.json(
        { error: `project_type must be one of: ${VALID_PROJECT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    let resolvedZohoId: string | null = external_project_id || null;
    let zohoCreationFailed = false;

    if (create_zoho_project && !resolvedZohoId) {
      const zohoResult = await createZohoProject(customerId, project_name.trim());
      resolvedZohoId = zohoResult || null;
      if (resolvedZohoId) {
        await adminClient
          .from("customers")
          .update({ status: "active" })
          .eq("customer_id", customerId);
      } else {
        zohoCreationFailed = true;
      }
    }

    const { data, error } = await adminClient
      .from("projects")
      .insert({
        customer_id: customerId,
        name: project_name.trim(),
        project_type,
        external_project_id: resolvedZohoId,
        sanity_project_id: sanity_project_id || null,
        github_repo: github_repo || null,
        dedicated_developers: Array.isArray(dedicated_developers) ? dedicated_developers : [],
      })
      .select()
      .single();

    if (error) {
      console.error("POST /api/customers/[customerId]/projects error:", error);
      return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }

    return NextResponse.json(
      { ...data, zoho_creation_failed: zohoCreationFailed },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/customers/[customerId]/projects unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
