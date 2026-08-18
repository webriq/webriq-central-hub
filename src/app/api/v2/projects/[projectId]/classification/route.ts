import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { canManageProjectMembers } from "@/lib/programme/membership-rules";
import { CLASSIFICATIONS } from "@/config/customer-phases";

// PATCH /api/v2/projects/[projectId]/classification — task 268. Updates the classification on
// the project's linked customer_products row (customer_products.classification), keyed via
// projects.customer_product_id. [projectId] is the display project_id, matching every other
// route in this directory (route.ts, tasks/route.ts, issues/route.ts).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, customer_product_id, created_by")
    .eq("project_id", projectId)
    .single();
  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!canManageProjectMembers(profile?.role ?? null, project.created_by === user.id)) {
    return NextResponse.json({ error: "Not permitted to update this project's classification" }, { status: 403 });
  }

  if (!project.customer_product_id) {
    return NextResponse.json({ error: "This project has no linked product to classify" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const classification = typeof body.classification === "string" ? body.classification : "";
  if (!(CLASSIFICATIONS as readonly string[]).includes(classification)) {
    return NextResponse.json({ error: "Invalid classification" }, { status: 400 });
  }

  // customer_products' write RLS (customer_products_pm_write) only allows admin/super_admin/pm —
  // narrower than canManageProjectMembers's creator exception above, so a non-listed-role
  // creator's update would silently no-op under RLS. adminClient bypasses that; the permission
  // check above is the real gate, same pattern phase-membership.ts's write helpers already use.
  const { data, error } = await adminClient
    .from("customer_products")
    .update({ classification })
    .eq("id", project.customer_product_id)
    .select("classification")
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]/classification] patch failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
