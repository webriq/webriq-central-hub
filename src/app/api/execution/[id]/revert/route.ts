import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { revertSanityExecution } from "@/lib/sanity";
import { closePRAndDeleteBranch } from "@/lib/github";
import type { Json } from "@/types/database";

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
    .select("id, plan_id, customer_id, status, pre_action_states, post_action_states")
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

  // Detect execution type from post_action_states — GitHub executions always have github_pr_url
  const postStates = execution.post_action_states as Record<string, unknown> | null;
  const isGitHub = typeof postStates?.github_pr_url === "string";

  if (isGitHub) {
    return revertGitHub(
      execution,
      postStates as { github_pr_url: string; branch: string; pr_number: number }
    );
  }

  return revertSanity(execution);
}

// ─── GitHub revert: close PR + delete branch ──────────────────────────────────

async function revertGitHub(
  execution: { id: string; plan_id: string; customer_id: string },
  postStates: { github_pr_url: string; branch: string; pr_number: number }
): Promise<NextResponse> {
  const { data: product } = await adminClient
    .from("customer_projects")
    .select("github_repo")
    .eq("customer_id", execution.customer_id)
    .not("github_repo", "is", null)
    .maybeSingle();

  if (!product?.github_repo) {
    return NextResponse.json({ error: "No GitHub repo configured" }, { status: 422 });
  }

  try {
    await closePRAndDeleteBranch(product.github_repo, postStates.pr_number, postStates.branch);
  } catch (err) {
    const message = err instanceof Error ? err.message : "GitHub revert failed";
    console.error("[revert/github] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const [execResult, planResult] = await Promise.all([
    adminClient.from("execution_records").update({ status: "REVERTED" }).eq("id", execution.id),
    adminClient
      .from("implementation_plans")
      .update({ status: "APPROVED" })
      .eq("id", execution.plan_id),
  ]);

  if (execResult.error) {
    console.error("[revert/github] execution_records update failed", execResult.error);
  }
  if (planResult.error) {
    console.error("[revert/github] implementation_plans update failed", planResult.error);
  }
  if (execResult.error || planResult.error) {
    return NextResponse.json(
      { error: "PR closed but status update failed — manual review required" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

// ─── Sanity revert: restore pre-action CMS state ─────────────────────────────

async function revertSanity(execution: {
  id: string;
  plan_id: string;
  customer_id: string;
  pre_action_states: unknown;
}): Promise<NextResponse> {
  const { data: product } = await adminClient
    .from("customer_projects")
    .select("sanity_project_id")
    .eq("customer_id", execution.customer_id)
    .not("sanity_project_id", "is", null)
    .maybeSingle();

  if (!product?.sanity_project_id) {
    return NextResponse.json({ error: "No Sanity project configured" }, { status: 422 });
  }

  try {
    await revertSanityExecution(product.sanity_project_id, execution.pre_action_states as Json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revert failed";
    console.error("[revert/sanity] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const [execResult, planResult] = await Promise.all([
    adminClient.from("execution_records").update({ status: "REVERTED" }).eq("id", execution.id),
    adminClient
      .from("implementation_plans")
      .update({ status: "APPROVED" })
      .eq("id", execution.plan_id),
  ]);

  if (execResult.error) {
    console.error("[revert/sanity] execution_records update failed", execResult.error);
  }
  if (planResult.error) {
    console.error("[revert/sanity] implementation_plans update failed", planResult.error);
  }
  if (execResult.error || planResult.error) {
    return NextResponse.json(
      { error: "Revert applied but status update failed — manual review required" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
