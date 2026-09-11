import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { canManageProjectMembers } from "@/lib/programme/membership-rules";
import { CLASSIFICATIONS, mergeClassificationUpdate, type Classification } from "@/config/customer-phases";

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

  // project, profile and the request body are mutually independent reads — none needs another's
  // result — so they run concurrently instead of as three sequential round trips. The
  // customer_products embed folds in what used to be a separate post-permission-check lookup
  // (see the classifications-sync comment below); every caller who can pass the permission check
  // a few lines down already satisfies customer_products' own read RLS (staff roles via
  // customer_products_staff_read, or a client-creator via customer_products_client_read on their
  // own customer_id), so reading it here under the user's session rather than via adminClient
  // doesn't change who can see what.
  const [{ data: project, error: projectError }, { data: profile }, body] = await Promise.all([
    supabase
      .from("projects")
      .select("id, customer_product_id, created_by, customer_products(classifications)")
      .eq("project_id", projectId)
      .single(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    req.json().catch(() => ({})),
  ]);
  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!canManageProjectMembers(profile?.role ?? null, project.created_by === user.id)) {
    return NextResponse.json({ error: "Not permitted to update this project's classification" }, { status: 403 });
  }

  if (!project.customer_product_id) {
    return NextResponse.json({ error: "This project has no linked product to classify" }, { status: 400 });
  }

  const classification = typeof body.classification === "string" ? body.classification : "";
  if (!(CLASSIFICATIONS as readonly string[]).includes(classification)) {
    return NextResponse.json({ error: "Invalid classification" }, { status: 400 });
  }

  // Task 361 — keep the multi-select `classifications` array in sync with the primary column.
  // This route used to write `classification` alone, leaving the array holding the pre-edit
  // value; the projects listing's classification tabs match on the union of the two, so a stale
  // array would leave an edited project showing under both its old and its new tab.
  // mergeClassificationUpdate() is the inverse of the intake-time primary-derivation rule
  // (see its own doc comment in customer-phases.ts).
  const existing = (project.customer_products as { classifications: Classification[] } | null)?.classifications ?? [];
  const nextClassifications = mergeClassificationUpdate(existing, classification as Classification);

  // customer_products' write RLS (customer_products_pm_write) only allows admin/super_admin/pm —
  // narrower than canManageProjectMembers's creator exception above, so a non-listed-role
  // creator's update would silently no-op under RLS. adminClient bypasses that; the permission
  // check above is the real gate, same pattern phase-membership.ts's write helpers already use.
  const { data, error } = await adminClient
    .from("customer_products")
    .update({ classification, classifications: nextClassifications })
    .eq("id", project.customer_product_id)
    .select("classification")
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]/classification] patch failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
