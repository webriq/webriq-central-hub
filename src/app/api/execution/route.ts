import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { executeSanityPlan, generatePreviewUrl, type PlanStep } from "@/lib/sanity";
import { executeGitHubPlan } from "@/lib/github";
import { buildContextChain } from "@/lib/ai/context-chain";
import { sendCliqNotification } from "@/lib/zoho";
import { generateReplyDraft } from "@/lib/ai/reply";
import { checkLiveUrl } from "@/lib/pipeline/health-check";
import type { Json } from "@/types/database";

const PostSchema = z.object({
  planId: z.string().uuid(),
  customerId: z.string().min(1),
  classificationId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { planId, customerId, classificationId } = parsed.data;

  // Fetch plan + task_type in parallel (async-parallel: independent queries)
  const [{ data: plan }, { data: classification }] = await Promise.all([
    adminClient
      .from("implementation_plans")
      .select("id, steps")
      .eq("id", planId)
      .eq("status", "APPROVED")
      .maybeSingle(),
    adminClient
      .from("classification_records")
      .select("task_type, llm_eligible")
      .eq("id", classificationId)
      .maybeSingle(),
  ]);

  if (!plan) {
    return NextResponse.json({ error: "Plan not found or not approved" }, { status: 404 });
  }

  const llmEligible = classification?.llm_eligible ?? "NO";
  if (llmEligible === "NO" || llmEligible === "HUMAN_ONLY") {
    return NextResponse.json(
      {
        error: "Task is not eligible for LLM automation",
        llm_eligible: llmEligible,
        reason: llmEligible === "HUMAN_ONLY"
          ? "This task requires human handling and must never enter the automation pipeline."
          : "This task was classified as not suitable for automated execution. A developer should handle it manually.",
      },
      { status: 422 }
    );
  }

  const taskType = classification?.task_type ?? "CONTENT_UPDATE";

  // Check circuit breaker
  const { data: customer } = await adminClient
    .from("customers")
    .select("automation_paused")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (customer?.automation_paused) {
    return NextResponse.json(
      { error: "Automation is paused for this customer due to consecutive failures" },
      { status: 409 }
    );
  }

  const steps = (plan.steps as unknown as PlanStep[]) ?? [];

  if (taskType === "CODE_CHANGE_MINOR") {
    return executeGitHub({ planId, customerId, classificationId, steps });
  }

  return executeSanity({ planId, customerId, classificationId, steps });
}

// ─── GitHub execution path ────────────────────────────────────────────────────

interface ExecutionArgs {
  planId: string;
  customerId: string;
  classificationId: string;
  steps: PlanStep[];
}

async function executeGitHub({
  planId,
  customerId,
  classificationId,
  steps,
}: ExecutionArgs): Promise<NextResponse> {
  const { data: product } = await adminClient
    .from("projects")
    .select("github_repo")
    .eq("customer_id", customerId)
    .not("github_repo", "is", null)
    .maybeSingle();

  if (!product?.github_repo) {
    return NextResponse.json(
      { error: "No GitHub repo configured for this customer" },
      { status: 422 }
    );
  }

  const { data: execution, error: insertError } = await adminClient
    .from("execution_records")
    .insert({
      plan_id: planId,
      customer_id: customerId,
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !execution) {
    return NextResponse.json({ error: "Failed to create execution record" }, { status: 500 });
  }

  try {
    const contextChain = await buildContextChain(classificationId);
    const result = await executeGitHubPlan(
      product.github_repo,
      steps,
      contextChain,
      planId,
      customerId
    );

    const { error: completedErrGh } = await adminClient
      .from("execution_records")
      .update({
        status: "COMPLETED",
        outcome: "SUCCESS",
        pre_action_states: result.pre_action_states as unknown as Json,
        post_action_states: result.post_action_states as unknown as Json,
        what_was_done: result.what_was_done,
        what_was_skipped: result.what_was_skipped,
        github_pr_url: result.github_pr_url,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);
    if (completedErrGh) {
      throw new Error(`Failed to mark execution COMPLETED: ${completedErrGh.message}`);
    }

    const [planUpdate, classUpdate] = await Promise.all([
      adminClient
        .from("implementation_plans")
        .update({ status: "COMPLETE" })
        .eq("id", planId),
      adminClient
        .from("classification_records")
        .update({ status: "closed" })
        .eq("id", classificationId),
    ]);

    if (planUpdate.error) {
      console.error("[execution/github] plan update failed", { planId }, planUpdate.error);
    }
    if (classUpdate.error) {
      console.error("[execution/github] classification update failed", { classificationId }, classUpdate.error);
    }

    // sendCliqNotification(
    //   `✅ Execution complete for ${customerId}: ${result.what_was_done}`
    // ).catch(() => {});

    generateReplyDraft({
      classificationId,
      customerId,
      executionRecordId: execution.id,
      whatWasDone: result.what_was_done,
    }).catch((err) =>
      console.error("[execution/github] reply draft failed:", err instanceof Error ? err.message : err)
    );

    const ghWarnings = [
      ...(planUpdate.error ? ["plan status not updated"] : []),
      ...(classUpdate.error ? ["classification status not updated"] : []),
    ];
    return NextResponse.json({
      ok: true,
      executionId: execution.id,
      prUrl: result.github_pr_url,
      ...(ghWarnings.length > 0 && { warnings: ghWarnings }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    await adminClient
      .from("execution_records")
      .update({
        status: "FAILED",
        outcome: "FAILED",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    await applyCircuitBreaker(customerId, execution.id);

    return NextResponse.json({ error: message, status: "FAILED" }, { status: 500 });
  }
}

// ─── Sanity execution path ────────────────────────────────────────────────────

async function executeSanity({
  planId,
  customerId,
  classificationId,
  steps,
}: ExecutionArgs): Promise<NextResponse> {
  const { data: product } = await adminClient
    .from("projects")
    .select("sanity_project_id, dataset")
    .eq("customer_id", customerId)
    .not("sanity_project_id", "is", null)
    .maybeSingle();

  if (!product?.sanity_project_id) {
    return NextResponse.json(
      { error: "No Sanity project configured for this customer" },
      { status: 422 }
    );
  }

  const { data: execution, error: insertError } = await adminClient
    .from("execution_records")
    .insert({
      plan_id: planId,
      customer_id: customerId,
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !execution) {
    return NextResponse.json({ error: "Failed to create execution record" }, { status: 500 });
  }

  try {
    const contextChain = await buildContextChain(classificationId);
    const result = await executeSanityPlan(
      product.sanity_project_id,
      steps,
      contextChain,
      product.dataset ?? undefined,
    );

    const { error: completedErrSanity } = await adminClient
      .from("execution_records")
      .update({
        status: "COMPLETED",
        outcome: "SUCCESS",
        pre_action_states: result.pre_action_states as unknown as Json,
        post_action_states: result.post_action_states as unknown as Json,
        what_was_done: result.what_was_done,
        what_was_skipped: result.what_was_skipped,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);
    if (completedErrSanity) {
      throw new Error(`Failed to mark execution COMPLETED: ${completedErrSanity.message}`);
    }

    const previewUrl = await generatePreviewUrl(
      product.sanity_project_id,
      product.dataset,
    ).catch(() => null);
    if (previewUrl) {
      await adminClient
        .from("execution_records")
        .update({ preview_url: previewUrl })
        .eq("id", execution.id);
    }

    const [planUpdate, classUpdate] = await Promise.all([
      adminClient.from("implementation_plans").update({ status: "COMPLETE" }).eq("id", planId),
      adminClient
        .from("classification_records")
        .update({ status: "closed" })
        .eq("id", classificationId),
    ]);

    if (planUpdate.error) {
      console.error("[execution/sanity] plan update failed", { planId }, planUpdate.error);
    }
    if (classUpdate.error) {
      console.error("[execution/sanity] classification update failed", { classificationId }, classUpdate.error);
    }

    // Health check — fall back to app URL; project-specific URL (T069 follow-up) not yet in schema
    const liveUrl = process.env.NEXT_PUBLIC_APP_URL ?? null;

    if (liveUrl) {
      const healthCheck = await checkLiveUrl(liveUrl);
      await adminClient
        .from("execution_records")
        .update({
          health_check_status: healthCheck.ok ? "PASS" : `FAIL:${healthCheck.status}`,
          health_check_url: liveUrl,
        })
        .eq("id", execution.id);

      if (healthCheck.ok) {
        generateReplyDraft({
          classificationId,
          customerId,
          executionRecordId: execution.id,
          whatWasDone: result.what_was_done,
        }).catch((err) =>
          console.error("[execution/sanity] reply draft failed:", err instanceof Error ? err.message : err)
        );
      } else {
        sendCliqNotification(
          `⚠️ Health check FAILED for ${customerId} (HTTP ${healthCheck.status}) after execution. Manual review required. Execution: ${execution.id}`
        ).catch(() => {});
      }
    } else {
      // No live URL configured — send reply draft without health check
      generateReplyDraft({
        classificationId,
        customerId,
        executionRecordId: execution.id,
        whatWasDone: result.what_was_done,
      }).catch((err) =>
        console.error("[execution/sanity] reply draft failed (no health check):", err instanceof Error ? err.message : err)
      );
    }

    const sanityWarnings = [
      ...(planUpdate.error ? ["plan status not updated"] : []),
      ...(classUpdate.error ? ["classification status not updated"] : []),
    ];
    return NextResponse.json({
      ok: true,
      executionId: execution.id,
      ...(sanityWarnings.length > 0 && { warnings: sanityWarnings }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isPartial = message.toLowerCase().includes("partial");
    const newStatus = isPartial ? "PARTIAL_EXECUTION" : "FAILED";

    await adminClient
      .from("execution_records")
      .update({
        status: newStatus,
        outcome: isPartial ? "PARTIAL" : "FAILED",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    if (!isPartial) {
      await applyCircuitBreaker(customerId, execution.id);
    }

    return NextResponse.json({ error: message, status: newStatus }, { status: 500 });
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function applyCircuitBreaker(customerId: string, executionId: string): Promise<void> {
  const { data: recent } = await adminClient
    .from("execution_records")
    .select("status")
    .eq("customer_id", customerId)
    .neq("id", executionId)
    .order("created_at", { ascending: false })
    .limit(2);

  // Prepend current FAILED; pause if last 3 consecutive executions all failed
  const last3 = ["FAILED", ...(recent?.map((e) => e.status) ?? [])];
  if (last3.length >= 3 && last3.every((s) => s === "FAILED")) {
    const { error: pauseErr } = await adminClient
      .from("customers")
      .update({ automation_paused: true })
      .eq("customer_id", customerId);
    if (pauseErr) {
      console.error("[execution] circuit breaker: failed to pause", { customerId }, pauseErr);
    }
  }
}
