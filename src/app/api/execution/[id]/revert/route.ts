import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { revertSanityExecution } from "@/lib/sanity";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: execution } = await adminClient
    .from("execution_records")
    .select("id, plan_id, customer_id, status, pre_action_states")
    .eq("id", id)
    .maybeSingle();

  if (!execution) {
    return NextResponse.json({ error: "Execution record not found" }, { status: 404 });
  }

  if (!["COMPLETED", "PARTIAL_EXECUTION"].includes(execution.status)) {
    return NextResponse.json(
      { error: "Only COMPLETED or PARTIAL_EXECUTION records can be reverted" },
      { status: 409 }
    );
  }

  const { data: product } = await adminClient
    .from("customer_products")
    .select("sanity_project_id")
    .eq("customer_id", execution.customer_id)
    .not("sanity_project_id", "is", null)
    .maybeSingle();

  if (!product?.sanity_project_id) {
    return NextResponse.json({ error: "No Sanity project configured" }, { status: 422 });
  }

  try {
    await revertSanityExecution(product.sanity_project_id, execution.pre_action_states);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revert failed";
    console.error("[revert] Sanity revert failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await Promise.all([
    adminClient
      .from("execution_records")
      .update({ status: "REVERTED" })
      .eq("id", id),
    adminClient
      .from("implementation_plans")
      .update({ status: "APPROVED" })
      .eq("id", execution.plan_id),
  ]);

  return NextResponse.json({ ok: true });
}
